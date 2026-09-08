import type { SourceRead } from "../../source-edit";
import type { SourcePropertyPreview, SourcePropertyValue } from "../../source-property";

export interface PropertySessionActions {
	begin(property: string, scope: string): Promise<SourceRead | undefined>;
	plan(read: SourceRead, revision: number, value: SourcePropertyValue): Promise<SourcePropertyPreview | undefined>;
	preview(plan: SourcePropertyPreview): Promise<boolean>;
	finish(read: SourceRead, value: SourcePropertyValue | undefined, commit: boolean): void;
}

/** A control retains its original read while typing, stepping or scrubbing. */
export function createPropertySession(actions: PropertySessionActions) {
	type Held = {
		property: string;
		scope: string;
		read: Promise<SourceRead | undefined>;
		value: SourcePropertyValue | undefined;
		revision: number;
		done: boolean;
	};
	let current: Held | undefined;
	async function finish(commit: boolean): Promise<void> {
		const held = current;
		if (!held || held.done) return;
		held.done = true;
		const read = await held.read;
		if (read) actions.finish(read, held.value, commit && held.value !== undefined);
	}
	function begin(property: string, scope: string): Held {
		if (current && !current.done && current.property === property && current.scope === scope) return current;
		void finish(false);
		current = { property, scope, read: actions.begin(property, scope), value: undefined, revision: 0, done: false };
		return current;
	}
	return {
		begin,
		finish,
		preview(property: string, scope: string, value: SourcePropertyValue): void {
			const held = begin(property, scope);
			held.value = value;
			const revision = ++held.revision;
			void held.read.then(async (read) => {
				if (!read || held.done || current !== held || held.revision !== revision) return;
				const plan = await actions.plan(read, revision, value);
				if (plan && !held.done && current === held && held.revision === revision) await actions.preview(plan);
			});
		},
		apply(property: string, scope: string, value: SourcePropertyValue): Promise<void> {
			begin(property, scope).value = value;
			return finish(true);
		},
	};
}
