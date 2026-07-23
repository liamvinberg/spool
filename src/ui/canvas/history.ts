import type { Geometry } from "../api";

/**
 * Undo for the hands (#23): move, resize and nudge are the only geometry the
 * hands can change, so history is two stacks of inverse patches — per frame,
 * the rect before and the rect after one gesture. Undo writes before back,
 * redo writes after, a fresh edit voids redo. The stacks live in memory per
 * window and die on reload, like every canvas tool's; restores are
 * last-write-wins over whatever moved the frame since.
 */

export interface HistoryEntry {
	rects: Record<string, { before: Geometry; after: Geometry }>;
}

export interface GeometryHistory {
	undo: readonly HistoryEntry[];
	redo: readonly HistoryEntry[];
}

export const HISTORY_LIMIT = 100;

export function emptyHistory(): GeometryHistory {
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
	const rects: HistoryEntry["rects"] = {};
	for (const [name, rawBefore] of Object.entries(before)) {
		const rawAfter = after[name];
		if (rawAfter === undefined) continue;
		const from = round(rawBefore);
		const to = round(rawAfter);
		if (!same(from, to)) rects[name] = { before: from, after: to };
	}
	return Object.keys(rects).length === 0 ? undefined : { rects };
}

/** A fresh edit: pushed, capped, and any redo future is voided. */
export function record(history: GeometryHistory, entry: HistoryEntry): GeometryHistory {
	return { undo: [...history.undo, entry].slice(-HISTORY_LIMIT), redo: [] };
}

export interface Taken {
	history: GeometryHistory;
	rects: Record<string, Geometry>;
}

/** An entry narrowed to frames that still exist — a deleted frame has nothing to restore. */
function liveRects(entry: HistoryEntry, alive: ReadonlySet<string>): HistoryEntry["rects"] {
	const rects: HistoryEntry["rects"] = {};
	for (const [name, rect] of Object.entries(entry.rects)) {
		if (alive.has(name)) rects[name] = rect;
	}
	return rects;
}

export function takeUndo(history: GeometryHistory, alive: ReadonlySet<string>): Taken | undefined {
	const undo = [...history.undo];
	while (true) {
		const entry = undo.pop();
		if (entry === undefined) return undefined;
		const live = liveRects(entry, alive);
		// every frame of the entry is gone: discard it and reach for the older one
		if (Object.keys(live).length === 0) continue;
		const rects = Object.fromEntries(Object.entries(live).map(([name, rect]) => [name, rect.before]));
		return { history: { undo, redo: [...history.redo, { rects: live }] }, rects };
	}
}

export function takeRedo(history: GeometryHistory, alive: ReadonlySet<string>): Taken | undefined {
	const redo = [...history.redo];
	while (true) {
		const entry = redo.pop();
		if (entry === undefined) return undefined;
		const live = liveRects(entry, alive);
		if (Object.keys(live).length === 0) continue;
		const rects = Object.fromEntries(Object.entries(live).map(([name, rect]) => [name, rect.after]));
		return { history: { undo: [...history.undo, { rects: live }], redo }, rects };
	}
}
