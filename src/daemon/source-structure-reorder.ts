import type { SpanPatch } from "./hand-write";

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
