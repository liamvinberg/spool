import type { SourceOccurrence } from "../source-edit";
import type { SpanPatch } from "./hand-write";
import type { RetainedCompilation } from "./retained-compile";
import type { Selection, Sources } from "./source-origins";
import { deriveSourceDelete } from "./source-structure";
import { StructuralIdentityRefusal } from "./source-structure-syntax";
import { resolveStructuralPlan } from "./source-structure-target";

/** One authored sibling's own bytes, in the captured source. */
export interface StructuralSlot {
	start: number;
	end: number;
}

/**
 * Moving one authored sibling to another position among its siblings, as the
 * bytes that says.
 *
 * The units keep their own slots and swap what is written in them, so
 * everything between two siblings, whether indentation, a comment or an
 * unrelated expression, stays where the author put it. Only the members between
 * the position it left and the one it takes are rewritten; a move by one is a
 * swap of two spans.
 */
export function reorderPatches(
	text: string,
	siblings: readonly StructuralSlot[],
	from: number,
	to: number,
): SpanPatch[] {
	const moved = siblings[from];
	if (from === to || !moved || !siblings[to]) return [];
	const order = siblings.map((_, index) => index);
	order.splice(from, 1);
	order.splice(to, 0, from);
	const patches: SpanPatch[] = [];
	for (const [position, member] of order.entries()) {
		if (member === position) continue;
		const slot = siblings[position];
		const source = siblings[member];
		if (!slot || !source) throw new Error("the authored sibling has no captured span");
		patches.push({ start: slot.start, end: slot.end, text: text.slice(source.start, source.end) });
	}
	return patches;
}

/**
 * Where a keyboard move may take one authored sibling, and what it refuses.
 *
 * The ownership is Delete's, unchanged: the same committed creation chain, the
 * same carrier/retained/conditional proofs, the same captured source. A move
 * asks two things more of it: that the unit is one member of a list of
 * authored siblings rather than a supplied value, and that every member of
 * that list carries a stable authored identity, because two unkeyed siblings
 * exchanging position exchange their running state with it.
 *
 * `steps` is what the person asked for: negative moves the unit earlier among
 * its siblings, positive later. Asking past either end lands on the end; asking
 * a unit already at that end to go further is a refusal, because there is no
 * move to make and a save with nothing in it is not one.
 */
export function deriveSourceReorder(sources: Sources, pick: Selection, steps: number) {
	let plan: ReturnType<typeof deriveSourceDelete>;
	try {
		plan = deriveSourceDelete(sources, pick);
	} catch (error) {
		if (!(error instanceof StructuralIdentityRefusal)) throw error;
		throw new Error(
			`${error.message}. Moving these items could exchange their running state, so nothing was saved. Ask an agent to give each item a stable key of its own first.`,
		);
	}
	if (plan.replacement !== "")
		throw new Error("this element is a supplied value rather than one of a list of authored siblings");
	const members = plan.members;
	if (!members) throw new Error("this element has no authored sibling to move past");
	const from = members.findIndex((member) => member.start === plan.selected.start);
	if (from === -1) throw new Error("the selected unit is not one of its parent's authored members");
	const to = Math.max(0, Math.min(members.length - 1, from + steps));
	if (to === from)
		throw new Error(`this element is already the ${steps > 0 ? "last" : "first"} of its authored siblings`);
	return {
		...plan,
		kind: "reorder" as const,
		members,
		from,
		to,
		patches: reorderPatches(plan.text, members, from, to),
		steps: [...plan.steps, `move authored member ${JSON.stringify(members[from]!.key)} to position ${to}`],
	};
}
export type SourceReorderDerivation = ReturnType<typeof deriveSourceReorder>;

/** A move unit comes only from the original committed chain and frozen compiler inputs. */
export function resolveSourceReorder(
	root: string,
	compilation: RetainedCompilation,
	original: SourceOccurrence,
	generation: number,
	steps: number,
) {
	return resolveStructuralPlan(root, compilation, original, generation, (sources, pick) =>
		deriveSourceReorder(sources, pick, steps),
	);
}
export type SourceReorderTarget = ReturnType<typeof resolveSourceReorder>;
