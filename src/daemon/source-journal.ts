import type { ExecutedEdit } from "./bundled-editor";
import type { SpanPatch } from "./hand-write";
import { readInput, type SourceInput, sameInput } from "./retained-compile";

interface Step {
	before: SourceInput;
	after: SourceInput;
	edits: readonly ExecutedEdit[] | null;
}

/** Only acknowledged, observed operations bridge two source identities. */
export function createSourceJournal() {
	const files = new Map<string, { current: SourceInput; steps: Step[] }>();
	function observe(file: string): SourceInput {
		const current = readInput(file);
		const held = files.get(file);
		if (!held) files.set(file, { current, steps: [] });
		else if (!sameInput(held.current, current)) {
			held.steps = [];
			held.current = current;
		}
		return current;
	}
	function path(file: string, original: SourceInput): Step[] {
		const current = observe(file);
		if (sameInput(original, current)) return [];
		const steps = files.get(file)?.steps ?? [];
		const at = steps.findIndex((step) => sameInput(step.before, original));
		if (at < 0) throw new Error("the original source record was lost; read the file again");
		const route = steps.slice(at);
		if (route.some((step) => step.edits === null)) throw new Error("an opaque source replacement retired this edit");
		return route;
	}
	return {
		observe,
		current(file: string, original: SourceInput): SourceInput {
			path(file, original);
			return observe(file);
		},
		transform(file: string, original: SourceInput, patches: readonly SpanPatch[]): SpanPatch[] {
			let result = patches.map((patch) => ({ ...patch }));
			for (const step of path(file, original)) {
				result = result.map((patch) => {
					let shift = 0;
					for (const edit of step.edits ?? []) {
						// Shared boundaries are ambiguous for insertion and are intentionally refused.
						if (
							edit.start <= patch.end &&
							edit.end >= patch.start &&
							!(edit.end === patch.start && edit.start < edit.end && patch.start < patch.end) &&
							!(edit.start === patch.end && edit.start < edit.end && patch.start < patch.end)
						)
							throw new Error("another recorded operation touched these words");
						if (edit.end <= patch.start) shift += edit.text.length - (edit.end - edit.start);
					}
					return { ...patch, start: patch.start + shift, end: patch.end + shift };
				});
			}
			return result;
		},
		record(file: string, before: SourceInput, after: SourceInput, edits: readonly ExecutedEdit[] | null): void {
			const held = files.get(file);
			if (!held || !sameInput(held.current, before))
				throw new Error("source observation was lost before replacement");
			held.steps.push({ before, after, edits });
			held.current = after;
			// Bounded transient evidence. A missing original record always refuses.
			if (held.steps.length > 1024) held.steps.shift();
		},
		forget(file: string): void {
			files.delete(file);
		},
		clear(): void {
			files.clear();
		},
	};
}
