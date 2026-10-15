/**
 * Choosing the pages a share shows, said once for the Share popover: the project's pages as a tree whose folders
 * take their whole subtree, the links that leave a choice, and how a choice is said.
 */
import { pageDepth, pageHolds, pageParent, ROOT_PAGE } from "../page-path";
import { sharedPageName } from "../share-view";

/** A walk the flow map knows: from one frame to another. */
export interface ShareWalk {
	from: string;
	to: string;
}

/** A link out of the pages a share would show: the frame it leaves from, and where it goes. */
export interface LeavingLink {
	from: string;
	to: string;
	/** The page it lands on, which the share doesn't show. */
	page: string;
}

/**
 * The flow map's links that leave the pages a share would show: from a frame on them to a frame elsewhere. Said
 * as a warning, never a block: whoever follows one sees that screen isn't shared with them.
 */
export function leavingLinks(walks: readonly ShareWalk[], pages: ReadonlySet<string>): LeavingLink[] {
	const seen = new Set<string>();
	const leaving: LeavingLink[] = [];
	for (const walk of walks) {
		const from = pageParent(walk.from);
		const to = pageParent(walk.to);
		if (!pages.has(from) || pages.has(to)) continue;
		const key = `${walk.from}\0${walk.to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		leaving.push({ from: walk.from, to: walk.to, page: to });
	}
	return leaving;
}

/** One page in the picker: where it sits, and every page its box takes (itself and all under it). */
export interface PickRow {
	page: string;
	depth: number;
	/** Whether pages sit under it, so it opens and closes. */
	folder: boolean;
	/** The page and every page under it, at any depth. */
	takes: readonly string[];
}

/**
 * The picker's rows, a parent before its children and siblings by name. The top page has a row only when frames
 * stand on it, since it has no folder to open.
 */
export function pickRows(pages: readonly string[], frames: ReadonlyMap<string, number>): PickRow[] {
	const named = [...new Set(pages)].filter((page) => page !== ROOT_PAGE);
	const sorted = named.sort((a, b) => {
		const left = a.split("/");
		const right = b.split("/");
		for (let at = 0; at < Math.min(left.length, right.length); at++) {
			const order = (left[at] ?? "").localeCompare(right[at] ?? "");
			if (order !== 0) return order;
		}
		return left.length - right.length;
	});
	const rows = sorted.map((page) => {
		const takes = sorted.filter((other) => pageHolds(page, other));
		return { page, depth: pageDepth(page), folder: takes.length > 1, takes };
	});
	return (frames.get(ROOT_PAGE) ?? 0) > 0
		? [{ page: ROOT_PAGE, depth: 0, folder: false, takes: [ROOT_PAGE] }, ...rows]
		: rows;
}

export type Tick = "none" | "some" | "all";

/** How much of what a row takes is chosen. */
export function tickOf(row: PickRow, chosen: ReadonlySet<string>): Tick {
	const taken = row.takes.filter((page) => chosen.has(page)).length;
	return taken === 0 ? "none" : taken === row.takes.length ? "all" : "some";
}

/** A row's box pressed: a row wholly chosen lets all it takes go, anything less takes all of it. */
export function pressed(row: PickRow, chosen: ReadonlySet<string>): Set<string> {
	const next = new Set(chosen);
	const all = tickOf(row, chosen) === "all";
	for (const page of row.takes) {
		if (all) next.delete(page);
		else next.add(page);
	}
	return next;
}

/** The rows shown with these folders open: a row stands when every page above it is open. */
export function shownRows(rows: readonly PickRow[], open: ReadonlySet<string>): PickRow[] {
	return rows.filter((row) => {
		for (let parent = pageParent(row.page); parent !== ROOT_PAGE; parent = pageParent(parent)) {
			if (!open.has(parent)) return false;
		}
		return true;
	});
}

/** The rows whose own name holds what was typed, in tree order. */
export function foundRows(rows: readonly PickRow[], query: string): PickRow[] {
	const finding = query.trim().toLowerCase();
	if (finding === "") return [];
	return rows.filter((row) => sharedPageName(row.page).toLowerCase().includes(finding));
}

/** How many frames stand on these pages. */
export function framesOn(pages: Iterable<string>, frames: ReadonlyMap<string, number>): number {
	let count = 0;
	for (const page of pages) count += frames.get(page) ?? 0;
	return count;
}

/** "1 page · 3 frames": the size of a choice, as the popover's foot says it. */
export function saidSize(pages: ReadonlySet<string>, frames: ReadonlyMap<string, number>): string {
	const count = framesOn(pages, frames);
	return `${pages.size} ${pages.size === 1 ? "page" : "pages"} · ${count} ${count === 1 ? "frame" : "frames"}`;
}

/**
 * A choice in a line: the pages by name, a folder chosen whole said once by its own name, and past three names a
 * count of the rest.
 */
export function saidChoice(chosen: ReadonlySet<string>, rows: readonly PickRow[]): string {
	const names: string[] = [];
	const covered = new Set<string>();
	for (const row of rows) {
		if (covered.has(row.page) || !chosen.has(row.page) || tickOf(row, chosen) !== "all") continue;
		for (const page of row.takes) covered.add(page);
		names.push(row.page === ROOT_PAGE ? sharedPageName(row.page) : row.page);
	}
	for (const page of [...chosen].sort()) {
		if (!covered.has(page)) names.push(page === ROOT_PAGE ? sharedPageName(page) : page);
	}
	if (names.length <= 3) return names.join(", ");
	return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

/** Where a found row lives, as its meta says it: the page above it, or top. */
export function foundAt(row: PickRow): string {
	const parent = pageParent(row.page);
	return parent === ROOT_PAGE ? "top" : parent;
}
