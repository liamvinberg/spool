import type { Geometry } from "../api";
import { ROOT_PAGE } from "./pages";

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

/** A frame that changed page, against the page it left. */
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
	/** The page whose frames this orders; `null` for the list of pages itself. */
	readonly page: string | null;
	readonly before: readonly string[];
	readonly after: readonly string[];
}

/** One undoable thing the hands did. */
export type HistoryEntry =
	| { readonly kind: "geometry"; readonly rects: Rects }
	| { readonly kind: "rename"; readonly of: "frame" | "page"; readonly from: string; readonly to: string }
	| {
			readonly kind: "move";
			readonly frames: readonly Moved[];
			readonly to: string;
			readonly lists: readonly OrderList[];
	  }
	| { readonly kind: "reorder"; readonly lists: readonly OrderList[] }
	| { readonly kind: "mint"; readonly staged: Staging };

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

/** A name nothing answers to: frames and pages are one namespace (#228). */
function free(alive: Liveness, name: string): boolean {
	return !alive.frames.has(name) && !alive.pages.has(name);
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
			return holds(alive, entry.of, from) && free(alive, to) ? entry : undefined;
		}
		case "move": {
			const frames = liveMoved(entry.frames, entry.to, alive, way);
			return frames.length === 0 ? undefined : { ...entry, frames };
		}
		case "reorder":
			return entry;
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
