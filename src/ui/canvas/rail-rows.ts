/**
 * The rail's visible list, and where a drag over it would land (#229, #231, #232).
 *
 * Rows are placed by arithmetic rather than measured: each one carries the
 * offset the list already knows, so an insertion line lands on an exact pixel
 * and a row can spring to a new home without anything reading the DOM back.
 *
 * Landing is a pure question about a y and an x. The y says which gap, and a
 * gap under the last frame of a nested page is ambiguous on purpose — it is
 * equally next to that frame, next to its page, and next to its page's page.
 * The x picks which, because sideways travel is the only thing that can say
 * which depth a person means, and the pointer handler converts client space to
 * content space once so everything after that is a function of the list.
 *
 * A page holds its frames and then its pages, and the root page is the frames
 * directory itself rather than a folder in it, so it has no row: the list is
 * its contents. Its frames are the top of the list, its pages are the level
 * beside them, and a flat project draws as its frames and nothing else.
 */

import { pageDepth, pageParent, pageSegments, pageWithin, ROOT_PAGE } from "../../page-path";

/** The shipped rail's own metrics: a page row, a frame row, and the list's py-2. */
export const PAGE_ROW = 32;
export const FRAME_ROW = 28;
export const LIST_PAD = 8;

/** One depth step. 10px reproduces the shipped rail's page-to-frame offset exactly. */
export const INDENT = 10;
/** How far sideways one nesting step is, while a drop is ambiguous. */
export const DEPTH_BAND = 20;

/** Where a depth's guide line and insertion line start — the frame spine's own x. */
export function guideX(depth: number): number {
	return (depth - 1) * INDENT + 18;
}

/** Where a row's icon sits; pages and frames at one depth share it. */
export function contentX(depth: number): number {
	return depth * INDENT + 24;
}

/**
 * How deep a page's own rows are drawn — its frames and its pages alike, since
 * a page holds both beside each other.
 *
 * It is the number of page rows standing above them, which is the number of
 * segments in the page's path: the root page has none, so its own are the top
 * level, and `shop`'s are one step in from `shop`'s own row.
 */
function depthIn(page: string): number {
	return pageSegments(page).length;
}

export interface RailFrame {
	readonly name: string;
	readonly kind: "html" | "term";
}

interface RowPlace {
	/** How far in the row is drawn; the root page has no row, so its own start at the margin. */
	readonly depth: number;
	/** The page whose children this row is one of; `""` is the root page. */
	readonly parent: string;
	/** This row's place in its own list — the drop index a landing there means. */
	readonly index: number;
	readonly siblings: number;
	/** Whether nothing else of its parent's is drawn below it. */
	readonly tail: boolean;
	readonly top: number;
	readonly height: number;
}

export interface PageRow extends RowPlace {
	readonly kind: "page";
	readonly page: string;
	readonly open: boolean;
	/**
	 * Every frame under this page, its own pages' included.
	 *
	 * A page holding four pages and no frames of its own was reading 0, which is
	 * the one thing it is not: the number is what is one chevron away, and what is
	 * one chevron away is everything below. The row only wears it while it is shut
	 * — the same law the unseen mark keeps, and for the same reason. Once the tree
	 * under it is drawn, the rows below are the count, and a total beside them is
	 * a second number for the same thing.
	 */
	readonly count: number;
}

export interface FrameRow extends RowPlace {
	readonly kind: "frame";
	readonly name: string;
	readonly page: string;
	readonly last: boolean;
	/** a terminal frame rather than a document one; the row's icon is what says so */
	readonly terminal: boolean;
}

/**
 * The page being named that does not exist yet.
 *
 * Its own kind rather than a reserved name threaded through the page list: it
 * has no name, no folder and no verbs until it is committed, so every question
 * asked of a row — can it be dragged, can a frame land in it, what does its
 * menu offer — has one answer here instead of a guard at each call site.
 */
export interface BornRow extends RowPlace {
	readonly kind: "born";
}

export type RailRow = PageRow | FrameRow | BornRow;

/** One row's identity, which is also how the cursor names where it is. */
export function rowKey(row: RailRow): string {
	if (row.kind === "born") return "born";
	return row.kind === "page" ? `page:${row.page}` : `frame:${row.name}`;
}

/**
 * The frames a ⇧ range covers, in the order the rail is drawing them.
 *
 * The order matters and it is this module's: the projection arrives sorted by
 * name and the list on screen is whatever somebody arranged it into, so a range
 * worked out anywhere else picks frames that are not the rows between the two
 * ends. The anchor is a frame the canvas is holding, by name, and the other end
 * is any row, by key, because ⇧ travel can land the cursor on a page row — one
 * that contributes nothing, since a selection holds frame names.
 *
 * A range never leaves the anchor's page. Arriving on another page clears the
 * selection, so a range across two of them could not survive the trip, and one
 * that is asked for is no range at all rather than a clamped one.
 */
export function framesBetween(rows: readonly RailRow[], anchor: string, to: string): readonly string[] {
	const from = rows.findIndex((row) => row.kind === "frame" && row.name === anchor);
	const at = rows.findIndex((row) => rowKey(row) === to);
	const start = rows[from];
	if (start?.kind !== "frame" || at === -1) return [];
	const target = rows[at];
	if (target?.kind === "frame" && target.page !== start.page) return [];
	return rows
		.slice(Math.min(from, at), Math.max(from, at) + 1)
		.filter((row): row is FrameRow => row.kind === "frame" && row.page === start.page)
		.map((row) => row.name);
}

export function railRows(
	/** Each page's own pages in rail order, keyed by the page holding them. */
	pages: ReadonlyMap<string, readonly string[]>,
	framesByPage: ReadonlyMap<string, readonly RailFrame[]>,
	expanded: ReadonlySet<string>,
	/** the page a new one is being named inside; it waits at the end of that page's own */
	born: string | null = null,
): RailRow[] {
	const rows: RailRow[] = [];
	let top = 0;
	/** One page's own, in the order every page draws them: its frames, then its pages. */
	function contents(page: string): void {
		const frames = framesByPage.get(page) ?? [];
		const held = pages.get(page) ?? [];
		const depth = depthIn(page);
		frames.forEach((frame, at) => {
			rows.push({
				kind: "frame",
				name: frame.name,
				page,
				parent: page,
				depth,
				index: at,
				siblings: frames.length,
				// a page's own pages are drawn under its frames, so a last frame is
				// only the end of the block when there are none
				tail: at === frames.length - 1 && held.length === 0,
				last: at === frames.length - 1,
				terminal: frame.kind === "term",
				top,
				height: FRAME_ROW,
			});
			top += FRAME_ROW;
		});
		for (const [at, child] of held.entries()) block(child, at, held.length, at === held.length - 1);
		if (born !== page) return;
		rows.push({
			kind: "born",
			parent: page,
			depth,
			index: held.length,
			siblings: held.length + 1,
			tail: true,
			top,
			height: PAGE_ROW,
		});
		top += PAGE_ROW;
	}
	/** A page's frames and every frame under its own pages. */
	function within(page: string): number {
		const held = pages.get(page) ?? [];
		return (framesByPage.get(page) ?? []).length + held.reduce((total, child) => total + within(child), 0);
	}
	function block(page: string, index: number, siblings: number, tail: boolean): void {
		const open = expanded.has(page);
		rows.push({
			kind: "page",
			page,
			parent: pageParent(page),
			depth: pageDepth(page),
			index,
			siblings,
			tail,
			open,
			count: within(page),
			top,
			height: PAGE_ROW,
		});
		top += PAGE_ROW;
		if (open) contents(page);
	}
	// the root page has no row of its own: the list is its contents, so nothing
	// here opens it and nothing shuts it
	contents(ROOT_PAGE);
	return rows;
}

export function listHeight(rows: readonly RailRow[]): number {
	const last = rows.at(-1);
	return last === undefined ? 0 : last.top + last.height;
}

/**
 * Where a drag would put what it is carrying.
 *
 * `into` is a page taking what is dragged whole and draws as a ring on the row;
 * the other two are a gap in some page's list and draw as a line at `y`, which
 * starts at the depth the drop resolved to.
 */
export type Landing =
	| { readonly kind: "into"; readonly page: string }
	| {
			readonly kind: "frames";
			readonly page: string;
			readonly index: number;
			readonly depth: number;
			readonly y: number;
	  }
	| {
			readonly kind: "pages";
			readonly page: string;
			readonly index: number;
			readonly depth: number;
			readonly y: number;
	  };

export function sameLanding(a: Landing | null, b: Landing | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.kind !== b.kind) return false;
	if (a.kind === "into") return b.kind === "into" && a.page === b.page;
	if (a.kind === "frames") return b.kind === "frames" && a.page === b.page && a.index === b.index;
	return b.kind === "pages" && a.page === b.page && a.index === b.index;
}

/** The row a content-space y is inside, or -1 above the first and below the last. */
export function rowAt(rows: readonly RailRow[], contentY: number): number {
	return rows.findIndex((row) => contentY >= row.top && contentY < row.top + row.height);
}

/** The gap a y is nearest: 0 above everything, rows.length below it. */
function gapAt(rows: readonly RailRow[], contentY: number, at: number): number {
	const row = at === -1 ? undefined : rows[at];
	if (row === undefined) return contentY < 0 ? 0 : rows.length;
	return contentY - row.top < row.height / 2 ? at : at + 1;
}

/** The bottom edge of a page's whole block: its own row and everything under it. */
function blockEnd(rows: readonly RailRow[], page: string): number {
	let end = 0;
	for (const row of rows) {
		const holds = row.kind === "page" ? row.page === page : false;
		if (holds || row.parent === page || pageWithin(page, row.parent)) end = row.top + row.height;
	}
	return end;
}

/**
 * One place a drop could mean: a depth, the page whose list it lands in, and
 * the row it follows — `null` for the top of that list.
 */
interface Slot {
	/** the depth of the rows either side of the gap, which is what makes it ambiguous */
	readonly depth: number;
	readonly page: string;
	readonly after: RailRow | null;
	/** the page is shut, so it takes what is dragged whole rather than showing a line */
	readonly into: boolean;
}

/**
 * Every depth a drop in one gap could mean, shallowest first.
 *
 * A gap after the last child of a nested page is ambiguous on purpose, so this
 * walks out of the page it is in for as long as nothing of that page is drawn
 * below the gap. A drop can never be shallower than the row under the gap: the
 * line would sit above something deeper and mean nothing.
 */
function slotsAt(rows: readonly RailRow[], gap: number, kind: "frame" | "page"): Slot[] {
	const prev = rows[gap - 1];
	// a page with no folder yet takes nothing, and nothing lands under it either
	if (prev?.kind === "born") return [];
	// the gap above the first row is the one gap with nothing over it to say what
	// else it could mean: it is the top of the root page's own list
	if (prev === undefined) return [{ depth: depthIn(ROOT_PAGE), page: ROOT_PAGE, after: null, into: false }];
	const slots: Slot[] = [];
	// a shut page has no frame list to draw a line in, so for frames it reads as
	// that page taking them; a page dropped in the same gap has the list it is
	// already in right there, and the way into a shut page is its own row
	if (prev.kind === "page" && (prev.open || kind === "frame")) {
		slots.push({ depth: prev.depth + 1, page: prev.page, after: null, into: !prev.open });
	}
	let cursor: RailRow | undefined = prev;
	while (cursor !== undefined) {
		const here: RailRow = cursor;
		slots.push({ depth: here.depth, page: here.parent, after: here, into: false });
		if (!here.tail) break;
		// the root page has no row to step out to, which is where this walk ends
		cursor = rows.find((row) => row.kind === "page" && row.page === here.parent);
	}
	const floor = rows[gap]?.depth ?? 0;
	const usable = slots.filter((slot) => slot.depth >= floor).reverse();
	return usable.length > 0 ? usable : slots.slice(-1);
}

/** The slot nearest the depth the pointer asked for; the deepest when it said nothing. */
function choose(slots: readonly Slot[], wanted: number | undefined): Slot | undefined {
	if (wanted === undefined) return slots.at(-1);
	let pick = slots[0];
	for (const slot of slots) {
		if (pick === undefined || Math.abs(slot.depth - wanted) <= Math.abs(pick.depth - wanted)) pick = slot;
	}
	return pick;
}

/** Where the insertion line goes: the top of the row the drop will sit above. */
function landingY(rows: readonly RailRow[], page: string, kind: "frame" | "page", index: number): number {
	const follower =
		kind === "frame"
			? (rows.find((row) => row.kind === "frame" && row.page === page && row.index === index) ??
				rows.find((row) => row.kind === "page" && row.parent === page && row.index === 0))
			: rows.find((row) => row.kind === "page" && row.parent === page && row.index === index);
	if (follower !== undefined) return follower.top;
	const end = blockEnd(rows, page);
	return end === 0 ? listHeight(rows) : end;
}

/**
 * A slot read as the landing one drag kind means.
 *
 * A page holds its frames and then its pages, so a frame dropped after one of
 * that page's pages lands at the end of its frames, and a page dropped among
 * that page's frames lands at the start of its pages. Neither is a clamp
 * against the person: it is where the row will actually be drawn.
 */
function landingOf(rows: readonly RailRow[], slot: Slot, kind: "frame" | "page"): Landing {
	if (slot.into) return { kind: "into", page: slot.page };
	const after = slot.after;
	if (kind === "frame") {
		const index = after === null ? 0 : after.kind === "frame" ? after.index + 1 : framesIn(rows, slot.page).length;
		return {
			kind: "frames",
			page: slot.page,
			index,
			depth: depthIn(slot.page),
			y: landingY(rows, slot.page, "frame", index),
		};
	}
	const index = after !== null && after.kind === "page" ? after.index + 1 : 0;
	return {
		kind: "pages",
		page: slot.page,
		index,
		depth: depthIn(slot.page),
		y: landingY(rows, slot.page, "page", index),
	};
}

function framesIn(rows: readonly RailRow[], page: string): RailRow[] {
	return rows.filter((row) => row.kind === "frame" && row.page === page);
}

function landingAt(
	rows: readonly RailRow[],
	contentY: number,
	kind: "frame" | "page",
	wanted: number | undefined,
): Landing | null {
	const at = rowAt(rows, contentY);
	const over = at === -1 ? undefined : rows[at];
	if (over !== undefined && over.kind === "page") {
		const within = (contentY - over.top) / over.height;
		if (within > 0.26 && within < 0.74) return { kind: "into", page: over.page };
	}
	// everywhere else is a gap in some page's list, the top of the list being the
	// top of the root page's own
	const slots = slotsAt(rows, gapAt(rows, contentY, at), kind);
	const pick = choose(slots, wanted);
	return pick === undefined ? null : landingOf(rows, pick, kind);
}

/**
 * Frames being dragged.
 *
 * The middle band of a page row means the page itself, which is how a frame
 * changes page; everywhere else is a gap in some page's list, and `wanted` is
 * the depth the pointer's sideways travel is asking for.
 */
export function frameLanding(rows: readonly RailRow[], contentY: number, wanted?: number): Landing | null {
	return landingAt(rows, contentY, "frame", wanted);
}

/**
 * A page being dragged, which lands in some page's list of pages — including
 * the root page's, which is the top level and where a flat project's pages all
 * live.
 */
export function pageLanding(rows: readonly RailRow[], contentY: number, wanted?: number): Landing | null {
	return landingAt(rows, contentY, "page", wanted);
}

/** Where the insertion line starts: the depth the drop resolved to. */
export function landingGuideX(landing: Landing): number {
	return landing.kind === "into" ? guideX(0) : guideX(landing.depth);
}
