/**
 * Order (#229): the arrangement somebody made by hand, merged against the disk.
 *
 * The daemon stores it and never cleans it (#228), so what comes back can name
 * a frame that was renamed an hour ago and can be missing one written a second
 * ago. Reconciling the two is this side's job, and the rule is one sentence:
 * the stored order first with stale names dropped, then the arrivals, each one
 * placed where somebody would have put it.
 *
 * Where that is depends on what arrived. A `--` variant belongs beside the
 * frame it is a take on, so it lands in its base's block; anything else lands
 * at its alphabetical spot, which is where the projection would have had it
 * anyway. Appending instead would pile every new frame at the bottom of a list
 * somebody arranged, which is exactly the arrangement being protected.
 *
 * Nothing here touches geometry. Order is the rail's list and the canvas is a
 * plane: reordering rows moves nothing on it, and moving a frame on it changes
 * no row.
 */

import type { CanvasOrder } from "../api";
import type { OrderList, Way } from "./history";

/** How a name compares for placement — the projection's own sort. */
const before = (a: string, b: string): boolean => a.localeCompare(b) < 0;

/** `home--dark` is a take on `home`; a name with no `--` is nobody's variant. */
export function variantBase(name: string): string | undefined {
	const at = name.indexOf("--");
	return at <= 0 ? undefined : name.slice(0, at);
}

/**
 * Where an arrival goes in a list it is not in yet.
 *
 * A variant whose base is on the list joins that base's block, alphabetically
 * among the siblings already there — so `home--wide` lands under `home` rather
 * than wherever `w` happens to fall. Everything else takes its alphabetical
 * spot, and a name that sorts after all of them lands at the end.
 */
function arrivalIndex(list: readonly string[], name: string): number {
	const base = variantBase(name);
	const at = base === undefined ? -1 : list.indexOf(base);
	if (at !== -1) {
		let index = at + 1;
		for (; index < list.length; index += 1) {
			const sibling = list[index];
			if (sibling === undefined || variantBase(sibling) !== base || before(name, sibling)) break;
		}
		return index;
	}
	const found = list.findIndex((each) => before(name, each));
	return found === -1 ? list.length : found;
}

/**
 * One stored list reconciled with what the projection actually holds.
 *
 * Stale names drop, duplicates in a hand-edited file collapse to their first
 * mention, and every name the projection has ends up in the answer exactly
 * once — so what this returns is always a permutation of `arrived`.
 */
export function mergeOrder(stored: readonly string[] | undefined, arrived: readonly string[]): string[] {
	const here = new Set(arrived);
	const merged: string[] = [];
	const placed = new Set<string>();
	for (const name of stored ?? []) {
		if (!here.has(name) || placed.has(name)) continue;
		placed.add(name);
		merged.push(name);
	}
	for (const name of arrived) {
		if (placed.has(name)) continue;
		placed.add(name);
		merged.splice(arrivalIndex(merged, name), 0, name);
	}
	return merged;
}

/** A drop inside one list: the moved names land as a block at `index`. */
export function reorder(list: readonly string[], moving: readonly string[], index: number): string[] {
	const set = new Set(moving);
	const lifted = list.slice(0, index).filter((name) => set.has(name)).length;
	const kept = list.filter((name) => !set.has(name));
	const taken = list.filter((name) => set.has(name));
	const at = Math.max(0, Math.min(index - lifted, kept.length));
	return [...kept.slice(0, at), ...taken, ...kept.slice(at)];
}

/** A drop into another list: names it does not hold yet, inserted as a block. */
export function insertAt(list: readonly string[], names: readonly string[], index: number): string[] {
	const arriving = names.filter((name, seen) => names.indexOf(name) === seen && !list.includes(name));
	const at = Math.max(0, Math.min(index, list.length));
	return [...list.slice(0, at), ...arriving, ...list.slice(at)];
}

export function without(list: readonly string[], names: readonly string[]): string[] {
	const gone = new Set(names);
	return list.filter((name) => !gone.has(name));
}

/**
 * A renamed frame keeps its place.
 *
 * The daemon leaves frame names in the order alone, because from where it sits
 * a name going stale is not damage. From here it is: dropping the old name and
 * letting the new one arrive would send a frame somebody placed by hand off to
 * its alphabetical spot, as a side effect of typing a new name.
 */
export function renameInOrder(list: readonly string[], from: string, to: string): string[] {
	return list.map((name) => (name === from ? to : name));
}

/** Copies land beside what they were made from, in the order they were made. */
export function placeAfter(list: readonly string[], anchor: string, names: readonly string[]): string[] {
	const at = list.indexOf(anchor);
	return at === -1 ? insertAt(list, names, list.length) : insertAt(list, names, at + 1);
}

/**
 * One list of the stored order replaced, the rest of it carried through.
 *
 * A rail that rewrote the whole file on every drop would drop the place a
 * frame an agent is halfway through writing is about to come back to — the
 * same reason the daemon never cleans it on a read. So a drop states the list
 * the hands just arranged and says nothing about any other.
 */
export function withPageOrder(order: CanvasOrder, pages: readonly string[]): CanvasOrder {
	return { ...order, pages: [...pages] };
}

export function withFrameOrder(order: CanvasOrder, page: string, names: readonly string[]): CanvasOrder {
	return { ...order, frames: { ...order.frames, [page]: [...names] } };
}

/**
 * The lists one history entry rewrote, stated again, run this way (#230).
 *
 * List by list rather than a whole stored order, for the same reason a drop
 * states one list: undoing a move must not take back a row somebody arranged
 * on a page this entry never touched.
 */
export function withLists(order: CanvasOrder, lists: readonly OrderList[], way: Way): CanvasOrder {
	let next = order;
	for (const list of lists) {
		const names = way === "undo" ? list.before : list.after;
		next = list.page === null ? withPageOrder(next, names) : withFrameOrder(next, list.page, names);
	}
	return next;
}

/** A page that is gone takes its own row and its frame list with it. */
export function withoutPageOrder(order: CanvasOrder, page: string): CanvasOrder {
	const frames = { ...order.frames };
	delete frames[page];
	return { ...order, ...(order.pages === undefined ? {} : { pages: without(order.pages, [page]) }), frames };
}
