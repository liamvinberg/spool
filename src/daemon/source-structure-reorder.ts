import { relative } from "node:path";
import { parse } from "@babel/parser";
import type { SourceOccurrence } from "../source-edit";
import type { SourceStructuralExpectation } from "../source-structure";
import { realDesignDir } from "./design-path";
import type { SpanPatch } from "./hand-write";
import { lowerLiterals, type RetainedCompilation } from "./retained-compile";
import { type Selection, Sources } from "./source-origins";
import { applySourcePatches } from "./source-patches";
import { deriveSourceDelete } from "./source-structure";
import { planStructureCompilation } from "./source-structure-compile";
import { StructuralIdentityRefusal } from "./source-structure-syntax";

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
 * everything between two siblings — indentation, a comment, an unrelated
 * expression — stays exactly where the author put it. Only the members between
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
 * its siblings, positive later. Asking past either end lands on the end, which
 * is a move that writes nothing rather than a refusal.
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
	if (!original.provenance || !original.structure) throw new Error("the original structural observation is missing");
	const sources = new Sources(root, compilation);
	for (const file of compilation.inputs.keys())
		if (/\.[cm]?[jt]sx?$/.test(file)) sources.read(relative(realDesignDir(root), file));
	const selection = JSON.parse(original.provenance) as Selection;
	const plan = deriveSourceReorder(sources, { ...selection, generation: String(generation) }, steps);
	for (const unit of sources.revisions.values())
		if (!compilation.inputs.has(unit.file))
			throw new Error("the structural origin is outside captured compiler inputs");
	const file = relative(realDesignDir(root), plan.file);
	const structural = planStructureCompilation(
		parse(plan.text, { sourceType: "module", plugins: ["jsx", "typescript"] }).program,
		file,
	);
	const group = structural.groups.find(
		(group) => group.kind === "list" && group.node.start === plan.parent.start && group.node.end === plan.parent.end,
	);
	if (!group) throw new Error("the original structural unit has no retained membership proof");
	const next = applySourcePatches(plan.text, plan.patches).text;
	const before = lowerLiterals(file, plan.text),
		after = lowerLiterals(file, next);
	if (before.shape !== after.shape) throw new Error("this move changes the original executable context");
	const observedParent = original.structure.source;
	const parent =
		observedParent &&
		[observedParent.site, ...observedParent.chain].every((site) => compilation.packet.locations?.[site])
			? { site: observedParent.site, chain: [] }
			: undefined;
	const expected: SourceStructuralExpectation = {
		kind: "structure",
		site: group.id,
		...(parent ? { parent } : {}),
		state: after.structure,
	};
	return { ...plan, site: group.id, expected, before: before.structure, shape: before.shape };
}
export type SourceReorderTarget = ReturnType<typeof resolveSourceReorder>;
