import { pageChain, pageName, pageSlot, pageUnder, ROOT_PAGE } from "../../page-path";
import type { CanvasOrder, ProjectedFrame } from "../api";
import { mergeOrder, mergePageTree } from "./order";

/**
 * What a page of pages draws instead of a field (spool#224): its own pages as a
 * list, each row the first frame's still, the name and what it holds. Read off
 * the projection and the rail's order, so a row is a picture somebody already
 * took and nothing on another page boots for it.
 */

export interface PageListRow {
	readonly page: string;
	readonly name: string;
	/** its parent's name, said quietly beside its own where another row has its name (spool#230) */
	readonly place?: string;
	/** every frame under it, and every one on its way there: the rail's number */
	readonly count: number;
	/** the names of its own pages, in rail order */
	readonly holds: readonly string[];
	/** the first frame under it, and that frame's still where it has one */
	readonly still?: { readonly frame: string; readonly hash?: string };
}

/** Something standing on a page: a frame, or a placeholder for one on its way. */
type OnPage = { readonly page?: string };

/** One place's reading of the project, as much as a list needs: the read-only canvas's too, whose frames have no cover of their own. */
export interface ListWorld {
	readonly pages: readonly string[];
	readonly frames: readonly Pick<ProjectedFrame, "name" | "page" | "cover">[];
	readonly waiting: readonly OnPage[];
	readonly order: CanvasOrder;
}

/** One place's reading of the project: its pages arranged, its frames, what is on its way. */
export interface PageWorld extends ListWorld {
	readonly frames: readonly ProjectedFrame[];
}

/** Each page's own pages in rail order, keyed by the page holding them. */
export function pageTreeOf(world: Pick<ListWorld, "pages" | "order">): Map<string, string[]> {
	return mergePageTree(world.order.pages, world.pages);
}

/**
 * Whether a page draws as a list: it holds pages and nothing of its own, not a
 * frame and not a placeholder. The root page is one too, once it has no frames.
 * `tree` is how the pages hold each other, where a canvas arranges them its own
 * way (a share's top, spool#230).
 */
export function listsPages(
	page: string,
	world: ListWorld,
	tree: ReadonlyMap<string, readonly string[]> = pageTreeOf(world),
): boolean {
	if (world.frames.some((frame) => pageSlot(frame) === page)) return false;
	if (world.waiting.some((one) => pageSlot(one) === page)) return false;
	return (tree.get(page) ?? []).length > 0;
}

/** The rows of a page of pages, in rail order. */
export function pageListRows(
	page: string,
	world: ListWorld,
	tree: ReadonlyMap<string, readonly string[]> = pageTreeOf(world),
): PageListRow[] {
	const own = (at: string): ListWorld["frames"][number][] => {
		const here = world.frames.filter((frame) => pageSlot(frame) === at);
		const leaves = mergeOrder(
			world.order.frames?.[at],
			here.map((frame) => pageName(frame.name)),
		);
		return leaves.flatMap((leaf) => here.filter((frame) => frame.name === pageUnder(at, leaf)));
	};
	const first = (at: string): ListWorld["frames"][number] | undefined =>
		own(at)[0] ?? (tree.get(at) ?? []).map(first).find((frame) => frame !== undefined);
	const count = (at: string): number =>
		world.frames.filter((frame) => pageSlot(frame) === at).length +
		world.waiting.filter((one) => pageSlot(one) === at).length +
		(tree.get(at) ?? []).reduce((total, child) => total + count(child), 0);
	return (tree.get(page) ?? []).map((child) => {
		const frame = first(child);
		return {
			page: child,
			name: pageName(child),
			count: count(child),
			holds: (tree.get(child) ?? []).map(pageName),
			...(frame === undefined
				? {}
				: { still: { frame: frame.name, ...(frame.cover === undefined ? {} : { hash: frame.cover.hash }) } }),
		};
	});
}

/** What a row says under its name: `6 frames · tipping, loyalty`. */
export function holdsLine(row: Pick<PageListRow, "count" | "holds">): string {
	const frames = row.count === 1 ? "1 frame" : `${row.count} frames`;
	return row.holds.length === 0 ? frames : `${frames} · ${row.holds.join(", ")}`;
}

/**
 * Where ⌘↓ goes from a page: the page picked among its own, else the first of
 * them. Nowhere from a page that holds none.
 */
export function downOf(
	page: string,
	picked: string | null,
	tree: ReadonlyMap<string, readonly string[]>,
): string | null {
	const own = tree.get(page) ?? [];
	if (picked !== null && own.includes(picked)) return picked;
	return own[0] ?? null;
}

/** The pages from the root down to this one, the root first: what the path names. */
export function chainOf(page: string): string[] {
	return [ROOT_PAGE, ...pageChain(page)];
}
