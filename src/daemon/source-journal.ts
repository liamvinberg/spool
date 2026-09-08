import type { ExecutedEdit } from "./bundled-editor";
import type { SpanPatch } from "./hand-write";
import { readInput, type SourceInput, sameInput } from "./retained-compile";

interface Step {
	order: number;
	id: symbol;
	inverseOf: symbol | undefined;
	before: SourceInput;
	after: SourceInput;
	edits: readonly ExecutedEdit[] | null;
}

function canceledSteps(route: readonly Step[]): Set<symbol> {
	const active = new Set<symbol>();
	const canceled = new Set<symbol>();
	for (const step of route) {
		if (step.inverseOf && active.delete(step.inverseOf)) {
			canceled.add(step.inverseOf);
			canceled.add(step.id);
		} else active.add(step.id);
	}
	return canceled;
}

/** Only acknowledged, observed operations bridge two source identities. */
export function createSourceJournal() {
	let order = 0;
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
		/** Exact acknowledged snapshots let effect readers detect transient competing declarations. */
		changes(
			file: string,
			original: SourceInput,
		): readonly { order: number; before: SourceInput; after: SourceInput; canceled: boolean }[] {
			const route = path(file, original);
			const canceled = canceledSteps(route);
			return route.map((step) => ({
				order: step.order,
				before: step.before,
				after: step.after,
				canceled: canceled.has(step.id),
			}));
		},
		transform(file: string, original: SourceInput, patches: readonly SpanPatch[]): SpanPatch[] {
			let result = patches.map((patch) => ({ ...patch }));
			const boundaries = patches.map(() => new Map<symbol, "before" | "after">());
			const coveredSpans = patches.map(
				() => new Map<symbol, { startOffset: number; endOffset: number; before: string }>(),
			);
			const interiorEdits = patches.map(() => new Map<symbol, { before: string; after: string }[]>());
			const route = path(file, original);
			const canceled = canceledSteps(route);
			for (const step of route) {
				result = result.map((patch, index) => {
					let shift = 0;
					let length = patch.end - patch.start;
					for (const edit of step.edits ?? []) {
						const interiors = step.inverseOf ? interiorEdits[index]!.get(step.inverseOf) : undefined;
						const restored =
							interiors?.findIndex((held) => held.before === edit.text && held.after === edit.before) ?? -1;
						if (
							step.inverseOf &&
							interiors &&
							restored >= 0 &&
							edit.start >= patch.start &&
							edit.end <= patch.end
						) {
							length += edit.text.length - (edit.end - edit.start);
							interiors.splice(restored, 1);
							if (!interiors.length) interiorEdits[index]!.delete(step.inverseOf);
							continue;
						}
						const covered = step.inverseOf ? coveredSpans[index]!.get(step.inverseOf) : undefined;
						if (covered && edit.start === patch.start && edit.end === patch.end) {
							if (edit.text !== covered.before)
								throw new Error("the inverse did not restore its owned source span");
							shift += covered.startOffset;
							length = covered.endOffset - covered.startOffset;
							coveredSpans[index]!.delete(step.inverseOf!);
							continue;
						}
						const boundary = step.inverseOf ? boundaries[index]!.get(step.inverseOf) : undefined;
						const restoresBoundary =
							patch.start === patch.end &&
							boundary &&
							(boundary === "before" ? edit.start === patch.start : edit.end === patch.start);
						const canceledEdge = canceled.has(step.id) && (edit.start === patch.end || edit.end === patch.start);
						// An unpaired operation at an insertion boundary is ambiguous.
						if (
							edit.start <= patch.end &&
							edit.end >= patch.start &&
							!(edit.end === patch.start && edit.start < edit.end && patch.start < patch.end) &&
							!(edit.start === patch.end && edit.start < edit.end && patch.start < patch.end)
						) {
							// Only a registered hand operation and its actual inverse may
							// temporarily overlap this owned span. Intervening agent touches
							// still refuse, even when they happen to restore the same bytes.
							if (restoresBoundary) boundaries[index]!.delete(step.inverseOf!);
							else if (canceledEdge && edit.start < edit.end && patch.start === patch.end)
								// Keep which side of this removed neighbor owned the empty insertion.
								boundaries[index]!.set(step.id, edit.start === patch.start ? "before" : "after");
							else if (canceledEdge && patch.start < patch.end) {
								// The paired insertion moves this intact span; its inverse moves it back.
							} else if (
								canceled.has(step.id) &&
								edit.start <= patch.start &&
								edit.end >= patch.end &&
								(edit.start < edit.end || coveredSpans[index]!.size > 0)
							) {
								// An acknowledged removal may cover an earlier literal's interior.
								// Track that interior only until its exact private inverse restores it.
								coveredSpans[index]!.set(step.id, {
									startOffset: patch.start - edit.start,
									endOffset: patch.end - edit.start,
									before: edit.before,
								});
								shift += edit.start - patch.start;
								length = edit.text.length;
								continue;
							} else if (canceled.has(step.id) && edit.start >= patch.start && edit.end <= patch.end) {
								// A private edit inside the owned span must return its exact bytes.
								const entries = interiorEdits[index]!.get(step.id) ?? [];
								entries.push({ before: edit.before, after: edit.text });
								interiorEdits[index]!.set(step.id, entries);
								length += edit.text.length - (edit.end - edit.start);
								continue;
							} else throw new Error("another recorded operation touched these words");
						}
						if (edit.end <= patch.start && !(restoresBoundary && boundary === "before"))
							shift += edit.text.length - (edit.end - edit.start);
					}
					return { ...patch, start: patch.start + shift, end: patch.start + shift + length };
				});
			}
			if (coveredSpans.some((spans) => spans.size > 0) || interiorEdits.some((edits) => edits.size > 0))
				throw new Error("the inverse did not restore its owned source span");
			return result;
		},
		record(
			file: string,
			before: SourceInput,
			after: SourceInput,
			edits: readonly ExecutedEdit[] | null,
			inverseOf?: symbol,
		): symbol {
			const held = files.get(file);
			if (!held || !sameInput(held.current, before))
				throw new Error("source observation was lost before replacement");
			const id = Symbol();
			held.steps.push({ order: ++order, id, inverseOf, before, after, edits });
			held.current = after;
			// Bounded transient evidence. A missing original record always refuses.
			if (held.steps.length > 1024) held.steps.shift();
			return id;
		},
		forget(file: string): void {
			files.delete(file);
		},
		clear(): void {
			files.clear();
		},
	};
}
