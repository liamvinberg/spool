import { pageName, pageUnder, pageWithin, ROOT_PAGE } from "../../page-path";
import type { Geometry, HeldPatch } from "../api";

/**
 * One undo stack for the hands (#23, #230).
 *
 * It began as geometry alone — move, resize and nudge, the only geometry the
 * hands can change — and it is now every undoable thing they do: the explorer's
 * file operations arrived with the rail (#229) and one ⌘Z has to walk all of
 * it. So an entry is a typed command rather than a patch, and the module's
 * character is unchanged: pure, per window, in memory, capped, and dying on
 * reload like every canvas tool's.
 *
 * Nothing here fetches. An entry states what was done and this module states
 * what running it the other way means; who can actually run it is the caller's
 * business, because the geometry write, the trash toast and the rail's own
 * verbs all live in different places.
 *
 * Two rules run through all of it. Every entry is checked against the current
 * projection before it is served, and an entry nothing is left of is skipped
 * rather than served empty — so one press does the next real thing rather than
 * nothing, exactly as a rect entry has always skipped a deleted frame. And a
 * restore is last-write-wins over whatever moved the frame since: external
 * edits arrive over SSE and simply make stale entries skip, so nothing here
 * prunes the stacks in the background.
 *
 * Committed deletes stay out. The OS Trash owns restore, and the toast that
 * outranks this stack is the only undo a delete gets.
 */

/** Which way an entry is being run. */
export type Way = "undo" | "redo";

/** One gesture's rects, per frame: where each was, and where it ended up. */
export type Rects = Record<string, { before: Geometry; after: Geometry }>;

/**
 * Something that changed the page holding it, against the page it left. A
 * frame is named by its own name and a page by its path, which is the whole of
 * what tells the two entries apart.
 */
export interface Moved {
	readonly name: string;
	readonly from: string;
}

/**
 * What a mint's inverse hands the trash toast — the toast's own entry shape.
 *
 * A duplicate and a new page put something on disk that was nowhere a moment
 * ago, so the only honest inverse is a delete, and spool's delete is the staged
 * one. Undo showing the toast is the truth rather than a leak: once it drains,
 * the OS Trash owns what comes back.
 */
export interface Staging {
	readonly frames: readonly string[];
	/** the page the mint made, when it made one */
	readonly page: string | null;
}

/**
 * One list of the rail's stored order, either side of a command.
 *
 * A list is nothing but the names in the order somebody put them in, so unlike
 * a name it cannot be worked out again from what is on disk. A move and a
 * reorder therefore record the lists they rewrote, and their inverse states
 * those lists again. Lists rather than the whole stored order, because an undo
 * must not take back a list nobody touched.
 */
export interface OrderList {
	/** Which of that page's two lists this is: the frames on it, or the pages in it. */
	readonly of: "frames" | "pages";
	/** The page whose list this is; `""` is the root page, whose pages are the top level. */
	readonly page: string;
	readonly before: readonly string[];
	readonly after: readonly string[];
}

/** One undoable thing the hands did. */
export type HistoryEntry =
	| { readonly kind: "geometry"; readonly rects: Rects }
	// a span patch on one frame's source (#253), which is every hand edit to
	// what a frame draws. The patch is the one to run next, in whichever
	// direction this entry currently sits: running it answers with its own
	// inverse, and the entry is amended with what came back, because a file
	// that has just changed has a new fingerprint and the old one would refuse
	| { readonly kind: "patch"; readonly frame: string; readonly patch: HeldPatch }
	| { readonly kind: "rename"; readonly of: "frame" | "page"; readonly from: string; readonly to: string }
	| {
			readonly kind: "move";
			readonly frames: readonly Moved[];
			readonly to: string;
			readonly lists: readonly OrderList[];
	  }
	// a page that changed the page holding it, which carries its whole subtree
	// (#231): its own kind rather than a second list on a move, because putting
	// it back is a different call and the thing that moved is a path
	| {
			readonly kind: "move-page";
			readonly pages: readonly Moved[];
			readonly to: string;
			readonly lists: readonly OrderList[];
	  }
	| { readonly kind: "reorder"; readonly lists: readonly OrderList[] }
	| { readonly kind: "mint"; readonly staged: Staging }
	// a page minted with frames gathered into it, which is one gesture and so one
	// entry: two would take two presses, and the press in between would leave a
	// page nobody asked for holding frames that were already back where they
	// started. The two halves are owned by different places — the page's inverse
	// is the trash toast, the frames' is the rail's own move — so what this entry
	// says is what both of them need and the order they have to run in
	| {
			readonly kind: "gather";
			/** the page the gesture made, and the page the frames were gathered onto */
			readonly page: string;
			readonly frames: readonly Moved[];
			readonly lists: readonly OrderList[];
	  };

export interface History {
	undo: readonly HistoryEntry[];
	redo: readonly HistoryEntry[];
}

/**
 * What is still true, as an entry is checked against it.
 *
 * Named for what it is for rather than for what it holds: the canvas's own
 * reading of the disk is the **projection**, and this is the narrower question
 * this module asks of it — is there anything left for this entry to do. The
 * pending trash rides along because a mint's redo is that toast's own undo:
 * the copies are still on disk while it is up, so putting them back is
 * un-staging rather than minting them a second time under different names.
 */
export interface Liveness {
	/** Every frame, against the page it sits on — `""` for the root page. */
	readonly frames: ReadonlyMap<string, string>;
	/** The named pages; the root page is permanent and in neither list. */
	readonly pages: ReadonlySet<string>;
	/** What the trash toast is holding, when one is up. */
	readonly pending: Staging | null;
}

export const HISTORY_LIMIT = 100;

export function emptyHistory(): History {
	return { undo: [], redo: [] };
}

const round = (rect: Geometry): Geometry => ({
	x: Math.round(rect.x),
	y: Math.round(rect.y),
	w: Math.round(rect.w),
	h: Math.round(rect.h),
});

const same = (a: Geometry, b: Geometry) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** One gesture's worth of change, rounded like the sidecar write; undefined when nothing moved. */
export function entryOf(before: Record<string, Geometry>, after: Record<string, Geometry>): HistoryEntry | undefined {
	const rects: Rects = {};
	for (const [name, rawBefore] of Object.entries(before)) {
		const rawAfter = after[name];
		if (rawAfter === undefined) continue;
		const from = round(rawBefore);
		const to = round(rawAfter);
		if (!same(from, to)) rects[name] = { before: from, after: to };
	}
	return Object.keys(rects).length === 0 ? undefined : { kind: "geometry", rects };
}

/** A fresh edit: pushed, capped, and any redo future is voided. */
export function record(history: History, entry: HistoryEntry): History {
	return { undo: [...history.undo, entry].slice(-HISTORY_LIMIT), redo: [] };
}

export interface Taken {
	readonly history: History;
	/** The entry, narrowed to what the projection still holds. */
	readonly entry: HistoryEntry;
}

/** The rects one geometry entry writes, run this way. */
export function rectsOf(rects: Rects, way: Way): Record<string, Geometry> {
	return Object.fromEntries(
		Object.entries(rects).map(([name, rect]) => [name, way === "undo" ? rect.before : rect.after]),
	);
}

/**
 * The entry a run came back with instead of the one that was served.
 *
 * A patch's inverse is only known once it has run, so the future it leaves is
 * stated by the daemon's answer rather than by the entry that was taken. It
 * replaces the top of the stack the run just pushed onto, and nothing else
 * moves.
 */
export function amend(history: History, way: Way, entry: HistoryEntry): History {
	return way === "undo"
		? { undo: history.undo, redo: [...history.redo.slice(0, -1), entry] }
		: { undo: [...history.undo.slice(0, -1), entry], redo: history.redo };
}

/**
 * The entry a run came back refused, taken off the stack it was just pushed
 * onto. A refusal means the disk moved underneath the projection this was
 * checked against, so the entry is not a future anybody has — it is stale,
 * discovered one round trip late.
 */
export function drop(history: History, way: Way): History {
	return way === "undo"
		? { undo: history.undo, redo: history.redo.slice(0, -1) }
		: { undo: history.undo.slice(0, -1), redo: history.redo };
}

/**
 * The entry a gesture wrote and then put back itself (#259).
 *
 * A resize is measured after it applies, and a size the layout would not take
 * is reverted on the spot. What it leaves behind is a file that never changed,
 * so the entry it pushed is not a step anybody should be able to undo — it is
 * withdrawn rather than dropped, which is the same slice for a different
 * reason and reads as one at the call site.
 */
export function withdraw(history: History): History {
	return { undo: history.undo.slice(0, -1), redo: history.redo };
}

/**
 * A name nothing answers to (#228, #231).
 *
 * A frame's name has to be free of every frame and of every page's name, at
 * whatever depth that page sits; a page's path has to be free of every page,
 * and its own name of every frame. Two pages under different parents may share
 * a name, which is why one of these asks about a path and the other about a
 * name. The daemon has the last word either way — this is the same law asked
 * one round trip early, so a press does the next real thing.
 */
function free(alive: Liveness, of: "frame" | "page", name: string): boolean {
	if (of === "page") return !alive.pages.has(name) && !alive.frames.has(pageName(name));
	return !alive.frames.has(name) && ![...alive.pages].some((page) => pageName(page) === name);
}

function holds(alive: Liveness, of: "frame" | "page", name: string): boolean {
	return of === "frame" ? alive.frames.has(name) : alive.pages.has(name);
}

/** The root page is permanent, so it is a page that exists without being listed. */
function hasPage(alive: Liveness, page: string): boolean {
	return page === ROOT_PAGE || alive.pages.has(page);
}

function sameStaging(a: Staging | null, b: Staging): boolean {
	if (a === null || a.page !== b.page || a.frames.length !== b.frames.length) return false;
	const held = new Set(a.frames);
	return b.frames.every((name) => held.has(name));
}

/** An entry narrowed to frames that still exist — a deleted frame has nothing to restore. */
function liveRects(rects: Rects, alive: Liveness): Rects {
	const live: Rects = {};
	for (const [name, rect] of Object.entries(rects)) {
		if (alive.frames.has(name)) live[name] = rect;
	}
	return live;
}

/**
 * The frames of a move that are still where this run expects to find them, and
 * still have somewhere to land. A frame somebody moved elsewhere in the
 * meantime is not this entry's to drag back.
 */
function liveMoved(frames: readonly Moved[], to: string, alive: Liveness, way: Way): Moved[] {
	return frames.filter((moved) =>
		way === "undo"
			? alive.frames.get(moved.name) === to && hasPage(alive, moved.from)
			: alive.frames.get(moved.name) === moved.from && hasPage(alive, to),
	);
}

/**
 * The pages of a move that are still where this run expects them, and still
 * have somewhere to land. A page is named by the path it had before the move,
 * so undo looks for it under the page it landed in and redo looks for it where
 * it started.
 */
function livePaged(pages: readonly Moved[], to: string, alive: Liveness, way: Way): Moved[] {
	return pages.filter((moved) => {
		const landed = pageUnder(to, pageName(moved.name));
		return way === "undo"
			? alive.pages.has(landed) && hasPage(alive, moved.from) && canHold(moved.from, landed)
			: alive.pages.has(moved.name) && hasPage(alive, to) && canHold(to, moved.name);
	});
}

/**
 * Whether a page can hold another one: never itself, and never one of its own.
 *
 * The daemon refuses both and the rail refuses to draw the drop, so this is the
 * same law a third time, asked of the projection. It matters here because a
 * restructure somebody did in between can turn an entry's own destination into
 * a page inside what is moving, and an undo the daemon would 409 is worse than
 * a press that quietly does the next real thing.
 */
function canHold(parent: string, page: string): boolean {
	return parent !== page && !pageWithin(page, parent);
}

/**
 * One entry against what is still true: what is left of it, or nothing.
 *
 * A rename needs both ends to hold — the name it is moving from has to be on
 * the canvas and the name it is moving to has to be nobody's — because the
 * daemon refuses a claimed name and this is the same law asked one round trip
 * earlier. A reorder always holds: the stored order is advisory and the merge
 * on the way in drops whatever went stale.
 */
function narrow(entry: HistoryEntry, alive: Liveness, way: Way): HistoryEntry | undefined {
	switch (entry.kind) {
		case "geometry": {
			const rects = liveRects(entry.rects, alive);
			return Object.keys(rects).length === 0 ? undefined : { kind: "geometry", rects };
		}
		case "rename": {
			const from = way === "undo" ? entry.to : entry.from;
			const to = way === "undo" ? entry.from : entry.to;
			return holds(alive, entry.of, from) && free(alive, entry.of, to) ? entry : undefined;
		}
		case "move": {
			const frames = liveMoved(entry.frames, entry.to, alive, way);
			return frames.length === 0 ? undefined : { ...entry, frames };
		}
		case "move-page": {
			const pages = livePaged(entry.pages, entry.to, alive, way);
			return pages.length === 0 ? undefined : { ...entry, pages };
		}
		case "patch":
			// the daemon's fingerprint is the real check and it happens on the wire;
			// what the projection can say is whether the frame is still there to edit
			return alive.frames.has(entry.frame) ? entry : undefined;
		case "reorder":
			return entry;
		case "gather": {
			// undo needs the page to still be there to empty, and redo needs the toast
			// to still be holding it: putting a page back is un-staging it, exactly as
			// it is for the mint this is half of
			const held =
				way === "undo" ? alive.pages.has(entry.page) : sameStaging(alive.pending, { frames: [], page: entry.page });
			if (!held) return undefined;
			const frames = liveMoved(entry.frames, entry.page, alive, way);
			return frames.length === 0 ? undefined : { ...entry, frames };
		}
		case "mint": {
			// the copies are still on disk while the toast is up, so redo is that
			// toast's own undo; once it has drained there is nothing to put back
			if (way === "redo") return sameStaging(alive.pending, entry.staged) ? entry : undefined;
			const frames = entry.staged.frames.filter((name) => alive.frames.has(name));
			const page = entry.staged.page !== null && alive.pages.has(entry.staged.page) ? entry.staged.page : null;
			return frames.length === 0 && page === null ? undefined : { kind: "mint", staged: { frames, page } };
		}
	}
}

export function takeUndo(history: History, alive: Liveness): Taken | undefined {
	const undo = [...history.undo];
	while (true) {
		const entry = undo.pop();
		if (entry === undefined) return undefined;
		const live = narrow(entry, alive, "undo");
		// nothing of this entry is true any more: discard it and reach for the
		// older one, so the press does the next real thing rather than nothing
		if (live === undefined) continue;
		return { history: { undo, redo: [...history.redo, live] }, entry: live };
	}
}

export function takeRedo(history: History, alive: Liveness): Taken | undefined {
	const redo = [...history.redo];
	while (true) {
		const entry = redo.pop();
		if (entry === undefined) return undefined;
		const live = narrow(entry, alive, "redo");
		// symmetric with undo: a redo entry nothing is left of is skipped, and the
		// press lands on the next one that can still run
		if (live === undefined) continue;
		return { history: { undo: [...history.undo, live], redo }, entry: live };
	}
}
