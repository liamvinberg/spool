import { pageName, pageParent, ROOT_PAGE } from "../../page-path";
import type { CanvasOrder } from "../api";
import { mergePageTree } from "../canvas/order";

/**
 * Where the read-only canvas starts (spool#230). An outsider's share stands at their top: the pages above what
 * was shared aren't on their canvas, so a page whose own parent isn't there sits at the top by its own name, and
 * two there with one name each carry their parent's name, quietly. One item shared, with nothing on the root
 * page beside it, is the top itself, and nothing stands above it. A member, or a whole-project share, starts at
 * the project's root page as ever.
 */
export interface CanvasTop {
	/** The page the canvas opens on and never goes above: the root page, or the one item shared. */
	readonly top: string;
	/** Each page's own pages in rail order, keyed by the page holding them on this canvas. */
	readonly tree: ReadonlyMap<string, readonly string[]>;
	/** What was shared, as the top holds it: the top's own pages, or the top itself when it is the one item. */
	readonly items: readonly string[];
	/** The parent's name an item at the top is told apart by, where another there has its name. */
	readonly places: ReadonlyMap<string, string>;
}

export function canvasTop(
	canvas: { readonly pages: readonly string[]; readonly frames: readonly { readonly page?: string }[] },
	order: CanvasOrder,
	/** An outsider on a share of some of the project, whose top is what was shared. */
	rooted: boolean,
): CanvasTop {
	const tree = new Map(mergePageTree(order.pages, canvas.pages));
	const present = new Set(canvas.pages);
	const loose = canvas.pages
		.filter((page) => pageParent(page) !== ROOT_PAGE && !present.has(pageParent(page)))
		.sort((a, b) => pageName(a).localeCompare(pageName(b)) || a.localeCompare(b));
	for (const page of loose) tree.delete(pageParent(page));
	if (loose.length > 0) tree.set(ROOT_PAGE, [...(tree.get(ROOT_PAGE) ?? []), ...loose]);
	const atTop = tree.get(ROOT_PAGE) ?? [];
	const named = new Map<string, number>();
	for (const page of atTop) named.set(pageName(page), (named.get(pageName(page)) ?? 0) + 1);
	const places = new Map(
		atTop
			.filter((page) => (named.get(pageName(page)) ?? 0) > 1 && pageParent(page) !== ROOT_PAGE)
			.map((page) => [page, pageName(pageParent(page))]),
	);
	const one = atTop[0];
	const alone =
		rooted && one !== undefined && atTop.length === 1 && !canvas.frames.some((frame) => frame.page === undefined);
	return { top: alone ? one : ROOT_PAGE, tree, items: atTop, places };
}

/**
 * A frame as the player's bar names it on a share's canvas: by its own name, in the page holding it by that page's
 * own name, and alone on the top. The project and the pages above what was shared are never said.
 */
export function frameSaid(top: CanvasTop, frame: string): { place: string | null; name: string } {
	const page = pageParent(frame);
	return { place: page === top.top || page === ROOT_PAGE ? null : pageName(page), name: pageName(frame) };
}

/** What a share's canvas is called where a member's says the project: the one item shared, or what several are together. */
export function topTitle(top: CanvasTop): string {
	return top.top === ROOT_PAGE ? "Shared with you" : pageName(top.top);
}
