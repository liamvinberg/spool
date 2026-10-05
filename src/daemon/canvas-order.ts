import { carriedKeys, carriedPage, pageName, pageParent, pageUnder, pageWithin, ROOT_PAGE } from "../page-path";
import { type CanvasOrder, parseOrder } from "./canvas-fields";
import { canvasFile, readCanvasFile, writeCanvasField } from "./canvas-file";

export { type CanvasOrder, parseOrder } from "./canvas-fields";

/**
 * Manual order, in design/canvas.json (#228).
 *
 * It lives beside the format stamp rather than in .spool/ because an
 * arrangement somebody made by hand is the canvas, not this machine's cache of
 * it: canvas.json is committed and cloned, .spool/ is per-machine ephemera. So
 * this owns exactly one key of that file and carries every other key through
 * untouched — the second durable arrived with the page objects (#265) and took
 * exactly this shape.
 *
 * Order is advisory. A name in it can be stale, can name a frame that moved
 * page, and can be missing a frame born a second ago; the client merges it
 * against the projection. Nothing here rewrites it to agree, because a read
 * that "cleaned" the file would drop the place a frame is about to come back to.
 *
 * Both lists are per parent (#231), and a list holds names rather than paths:
 * the key says where, so an entry only has to say which. `pages` is written as
 * a bare array when the root parent is the only one that has a list, which is
 * every flat project — so a project with no depth in it keeps the file it had,
 * byte for byte, and gains the keyed form the first time somebody nests a page.
 */

/** The stored order, or nothing stored — a malformed one reads as absent. */
export function readOrder(root: string): CanvasOrder {
	const file = readCanvasFile(canvasFile(root));
	return (file.kind === "read" ? parseOrder(file.fields.order) : undefined) ?? {};
}

/**
 * Store one order, carrying the rest of the file through. An order of nothing
 * takes the key back out rather than leaving `"order": {}` behind: no order and
 * an order naming nothing are the same fact about this canvas.
 */
export function writeOrder(root: string, order: CanvasOrder): void {
	writeCanvasField(canvasFile(root), "order", isEmpty(order) ? undefined : storedOrder(order));
}

/**
 * The order as the file spells it: the root parent's pages as a bare array
 * whenever it is the only parent with a list, and the keyed form the moment a
 * second one has one. Nothing else about the shape moves with depth.
 */
export function storedOrder(order: CanvasOrder): Record<string, unknown> {
	const pages = order.pages ?? {};
	const parents = Object.keys(pages);
	const flat = parents.length === 0 || (parents.length === 1 && parents[0] === ROOT_PAGE);
	return {
		...(parents.length === 0 ? {} : { pages: flat ? (pages[ROOT_PAGE] ?? []) : pages }),
		...(order.frames === undefined ? {} : { frames: order.frames }),
	};
}

/**
 * A page that moved carries its whole subtree's lists (#231).
 *
 * Its own key and every key beneath it are its identity rather than an
 * arrangement, so they follow the folder. Its place among its siblings is an
 * arrangement, and only a rename can keep it: a page that changed parent leaves
 * the list it was in, and where it lands in the new one is the drop's to say.
 */
export function withPageMoved(order: CanvasOrder, from: string, to: string): CanvasOrder | undefined {
	const held = pageParent(from);
	const landed = pageParent(to);
	const listed = order.pages?.[held]?.includes(pageName(from)) === true;
	const keyed = [...Object.keys(order.pages ?? {}), ...Object.keys(order.frames ?? {})].some(
		(page) => carriedPage(page, from, to) !== undefined,
	);
	if (!listed && !keyed) return undefined;
	const carried: CanvasOrder = { ...order };
	if (order.pages !== undefined) carried.pages = carriedKeys(order.pages, from, to);
	if (order.frames !== undefined) carried.frames = carriedKeys(order.frames, from, to);
	if (listed) {
		const lists = { ...(carried.pages ?? {}) };
		const names = lists[held] ?? [];
		lists[held] =
			held === landed
				? names.map((name) => (name === pageName(from) ? pageName(to) : name))
				: names.filter((name) => name !== pageName(from));
		carried.pages = lists;
	}
	return carried;
}

/** A trashed page takes its place in the rail, its lists, and its pages' lists with it. */
export function withPagesDropped(order: CanvasOrder, pages: readonly string[]): CanvasOrder | undefined {
	const gone = (page: string): boolean => pages.some((each) => page === each || pageWithin(each, page));
	const listed = pages.some((page) => order.pages?.[pageParent(page)]?.includes(pageName(page)) === true);
	const keyed = [...Object.keys(order.pages ?? {}), ...Object.keys(order.frames ?? {})].some(gone);
	if (!listed && !keyed) return undefined;
	const dropped: CanvasOrder = { ...order };
	if (order.pages !== undefined) {
		const lists: Record<string, string[]> = {};
		for (const [parent, names] of Object.entries(order.pages)) {
			if (gone(parent)) continue;
			lists[parent] = names.filter((name) => !pages.includes(pageUnder(parent, name)));
		}
		dropped.pages = lists;
	}
	if (order.frames !== undefined) {
		const frames = { ...order.frames };
		for (const page of Object.keys(frames)) {
			if (gone(page)) delete frames[page];
		}
		dropped.frames = frames;
	}
	return dropped;
}

function isEmpty(order: CanvasOrder): boolean {
	const listed = Object.values(order.pages ?? {}).some((names) => names.length > 0);
	return !listed && Object.keys(order.frames ?? {}).length === 0;
}
