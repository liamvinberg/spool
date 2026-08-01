/**
 * The rail's visible list, and where a drag over it would land (#229).
 *
 * Rows are placed by arithmetic rather than measured: each one carries the
 * offset the list already knows, so an insertion line lands on an exact pixel
 * and a row can spring to a new home without anything reading the DOM back.
 *
 * Landing is a pure question about a y, which is what keeps the drag loop
 * honest — the pointer handler converts client space to content space once and
 * everything after that is a function of the list. Pages hold frames and
 * nothing else: nested pages are #231, so there is exactly one depth to
 * resolve and no ambiguity for the pointer's x to break.
 */

/** The shipped rail's own metrics: a page row, a frame row, and the list's py-2. */
export const PAGE_ROW = 32;
export const FRAME_ROW = 28;
export const LIST_PAD = 8;

/** Where a depth's guide line and insertion line start — the frame spine's own x. */
export const PAGE_GUIDE_X = 8;
export const FRAME_GUIDE_X = 18;

export interface RailFrame {
	readonly name: string;
	readonly kind: "html" | "term";
}

export interface PageRow {
	readonly kind: "page";
	readonly page: string;
	readonly open: boolean;
	/** frames on this page's own canvas — the count the row has always shown */
	readonly count: number;
	readonly top: number;
	readonly height: number;
}

export interface FrameRow {
	readonly kind: "frame";
	readonly name: string;
	readonly page: string;
	readonly index: number;
	readonly last: boolean;
	readonly entry: "frame.tsx" | "term.tsx";
	readonly top: number;
	readonly height: number;
}

/**
 * The page being named that does not exist yet.
 *
 * Its own kind rather than a reserved name threaded through the page list: it
 * has no name, no folder and no verbs until it is committed, so every question
 * asked of a row — can it be dragged, can a frame land in it, what does its
 * menu offer — has one answer here instead of a guard at each call site.
 */
export interface BornRow {
	readonly kind: "born";
	readonly top: number;
	readonly height: number;
}

export type RailRow = PageRow | FrameRow | BornRow;

/** One row's identity, which is also how the cursor names where it is. */
export function rowKey(row: RailRow): string {
	if (row.kind === "born") return "born";
	return row.kind === "page" ? `page:${row.page}` : `frame:${row.name}`;
}

/** The page a row belongs to; a row still being named belongs to none. */
function pageOfRow(row: RailRow): string | undefined {
	return row.kind === "born" ? undefined : row.page;
}

export function railRows(
	pages: readonly string[],
	framesByPage: ReadonlyMap<string, readonly RailFrame[]>,
	expanded: ReadonlySet<string>,
	/** a new page is being named; it waits at the end until it has one */
	born = false,
): RailRow[] {
	const rows: RailRow[] = [];
	let top = 0;
	for (const page of pages) {
		const frames = framesByPage.get(page) ?? [];
		const open = expanded.has(page);
		rows.push({ kind: "page", page, open, count: frames.length, top, height: PAGE_ROW });
		top += PAGE_ROW;
		if (!open) continue;
		frames.forEach((frame, index) => {
			rows.push({
				kind: "frame",
				name: frame.name,
				page,
				index,
				last: index === frames.length - 1,
				entry: frame.kind === "term" ? "term.tsx" : "frame.tsx",
				top,
				height: FRAME_ROW,
			});
			top += FRAME_ROW;
		});
	}
	if (born) rows.push({ kind: "born", top, height: PAGE_ROW });
	return rows;
}

export function listHeight(rows: readonly RailRow[]): number {
	const last = rows.at(-1);
	return last === undefined ? 0 : last.top + last.height;
}

/**
 * Where a drag would put what it is carrying.
 *
 * `into` is a page taking frames whole and draws as a ring on the row; the
 * other two are a gap between rows and draw as a line at `y`.
 */
export type Landing =
	| { readonly kind: "into"; readonly page: string }
	| { readonly kind: "frames"; readonly page: string; readonly index: number; readonly y: number }
	| { readonly kind: "pages"; readonly index: number; readonly y: number };

export function sameLanding(a: Landing | null, b: Landing | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.kind !== b.kind) return false;
	if (a.kind === "into") return b.kind === "into" && a.page === b.page;
	if (a.kind === "frames") return b.kind === "frames" && a.page === b.page && a.index === b.index;
	return b.kind === "pages" && a.index === b.index;
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

/** The bottom edge of a page's whole block: its own row plus the frames under it. */
function blockEnd(rows: readonly RailRow[], page: string): number {
	let end = 0;
	for (const row of rows) {
		if (pageOfRow(row) === page) end = row.top + row.height;
	}
	return end;
}

/**
 * Frames being dragged.
 *
 * The middle band of a page row means the page itself, which is how a frame
 * changes page; everywhere else is a gap in some page's list. A gap under a
 * shut page has no list to draw a line in, so it reads as that page taking
 * them — and nothing lands above the root page's own row, which is permanent
 * and first.
 */
export function frameLanding(rows: readonly RailRow[], contentY: number): Landing | null {
	const at = rowAt(rows, contentY);
	const over = at === -1 ? undefined : rows[at];
	if (over !== undefined && over.kind === "page") {
		const within = (contentY - over.top) / over.height;
		if (within > 0.26 && within < 0.74) return { kind: "into", page: over.page };
	}
	const gap = gapAt(rows, contentY, at);
	const above = rows[gap - 1];
	// nothing lands above the root page's own row, and nothing lands in a page
	// that has no folder yet
	if (above === undefined || above.kind === "born") return null;
	const y = rows[gap]?.top ?? listHeight(rows);
	if (above.kind === "frame") return { kind: "frames", page: above.page, index: above.index + 1, y };
	return above.open ? { kind: "frames", page: above.page, index: 0, y } : { kind: "into", page: above.page };
}

/**
 * A page being dragged, which snaps to whole blocks.
 *
 * The answer is an index into the named pages, so a landing right under the
 * root page's block is 0 — the root page is the frames directory itself and
 * nothing sorts above it.
 */
export function pageLanding(rows: readonly RailRow[], contentY: number): Landing | null {
	const at = rowAt(rows, contentY);
	const above = rows[gapAt(rows, contentY, at) - 1];
	const owner = above === undefined ? undefined : pageOfRow(above);
	if (owner === undefined) return null;
	const order = rows.flatMap((row) => (row.kind === "page" ? [row.page] : []));
	const full = order.indexOf(owner);
	if (full === -1) return null;
	return { kind: "pages", index: full, y: blockEnd(rows, owner) };
}

/** Where the insertion line starts: page gaps at the margin, frame gaps on the spine. */
export function landingGuideX(landing: Landing): number {
	return landing.kind === "frames" ? FRAME_GUIDE_X : PAGE_GUIDE_X;
}
