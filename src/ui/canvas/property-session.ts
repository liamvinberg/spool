import type { SourceRead } from "../../source-edit";
import type { SourcePropertyPreview, SourcePropertyValue } from "../../source-property";
import { samplePropertyPreview } from "./property-preview";

export type PropertyPlanResult = { ok: true; preview: SourcePropertyPreview } | { ok: false; reason: string };

export interface PropertyReadRequest {
	signal: AbortSignal;
	preview?: SourcePropertyValue;
	value(): SourcePropertyValue | undefined;
}

export interface PropertySessionActions {
	begin(property: string, scope: string, request: PropertyReadRequest): Promise<SourceRead | undefined>;
	plan(read: SourceRead, revision: number, value: SourcePropertyValue): Promise<PropertyPlanResult>;
	refused(read: SourceRead, value: SourcePropertyValue, reason: string): void;
	preview(plan: SourcePropertyPreview): Promise<boolean>;
	finish(read: SourceRead, value: SourcePropertyValue | undefined, commit: boolean): void;
}

/** A control retains its original read while typing, stepping or scrubbing. */
export function createPropertySession(actions: PropertySessionActions) {
	type Held = {
		abort: AbortController;
		property: string;
		scope: string;
		read: Promise<SourceRead | undefined>;
		value: SourcePropertyValue | undefined;
		revision: number;
		done: boolean;
		/** this gesture asked to be saved, which no later control can take back */
		saving: boolean;
		completed: boolean;
	};
	let current: Held | undefined;
	async function finish(commit: boolean): Promise<void> {
		const held = current;
		if (!held) return;
		if (held.done) {
			if (!commit && !held.completed) held.abort.abort();
			return;
		}
		held.done = true;
		held.saving = commit;
		if (!commit) held.abort.abort();
		const read = await held.read;
		held.completed = true;
		if (read) actions.finish(read, held.value, commit && !held.abort.signal.aborted && held.value !== undefined);
	}
	function begin(property: string, scope: string, preview?: SourcePropertyValue): Held {
		if (current && !current.done && current.property === property && current.scope === scope) return current;
		// A gesture that asked to be saved keeps its answer: this control takes the
		// preview from here, and retiring that one is its own control's to say.
		if (current && !current.saving) {
			void finish(false);
			current.abort.abort();
		}
		const held: Held = {
			property,
			scope,
			read: Promise.resolve(undefined),
			value: undefined,
			revision: 0,
			done: false,
			saving: false,
			completed: false,
			abort: new AbortController(),
		};
		current = held;
		held.read = actions.begin(property, scope, {
			signal: held.abort.signal,
			value: () => held.value,
			...(preview ? { preview } : {}),
		});
		return held;
	}
	return {
		begin,
		finish,
		preview(property: string, scope: string, value: SourcePropertyValue, sampleValue?: string): void {
			const held = begin(property, scope);
			held.value = value;
			const revision = ++held.revision;
			void held.read.then(async (read) => {
				if (!read || held.done || current !== held || held.revision !== revision) return;
				// Reserve the earlier revision for the immediate sample; the full result
				// may replace it only while this intent is still current.
				const sampleRevision = revision * 2;
				const pending = actions.plan(read, sampleRevision + 1, value);
				const sample = samplePropertyPreview(
					read,
					sampleRevision,
					sampleValue ?? (value.kind === "custom" ? value.value : undefined),
				);
				if (sample) await actions.preview(sample);
				const plan = await pending;
				if (held.done || current !== held || held.revision !== revision) return;
				if (plan.ok) await actions.preview(plan.preview);
				else actions.refused(read, value, plan.reason);
			});
		},
		apply(property: string, scope: string, value: SourcePropertyValue): Promise<void> {
			begin(property, scope).value = value;
			return finish(true);
		},
	};
}
