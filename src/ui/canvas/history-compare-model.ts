import type { HistoryScope, HistoryStretch } from "../api";
import { frameOf } from "./history-model";

/**
 * Compare with now (spool#189), as #105's prototype stands it: the frames a stretch touched, and where the canvas
 * stands each as it was at the stretch's end beside today's. The old one takes today's place, today's slides aside
 * past every old one, and a frame deleted since comes back in its old place.
 */

/** A frame's box on the canvas, in world pixels. */
export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The room between the old frames and today's slid aside. */
export const COMPARE_GAP = 80;

/**
 * The frames a stretch touched: in a frame's history that frame, whose history is its own saves and its imports'; in
 * the project's each frame whose own files it saved.
 */
export function framesTouched(stretch: HistoryStretch, scope: HistoryScope): string[] {
	if (scope.kind === "frame") return [scope.frame];
	return [...new Set(stretch.paths.flatMap((path) => frameOf(path) ?? []))].sort();
}

/** The frame Compare stands for a set-aside save: the frame its file is in, or the frame whose history shows it. */
export function setAsideFrame(path: string, scope: HistoryScope): string | null {
	return frameOf(path) ?? (scope.kind === "frame" ? scope.frame : null);
}

/**
 * Where Compare stands the frames: each old one where today's stands, or in its old place when it was deleted since;
 * each of today's slides from its place to past the old ones' right edge. A frame with no place then or now has
 * none to stand in.
 */
export function compareLayout(frames: readonly { name: string; now: Box | null; was: Box | null }[]): {
	old: { name: string; box: Box; deleted: boolean }[];
	now: { name: string; from: Box; to: Box }[];
} {
	const old = frames.flatMap(({ name, now, was }) => {
		const box = now ?? was;
		return box === null ? [] : [{ name, box, deleted: now === null }];
	});
	if (old.length === 0) return { old, now: [] };
	const left = Math.min(...old.map(({ box }) => box.x));
	const right = Math.max(...old.map(({ box }) => box.x + box.w));
	const by = right - left + COMPARE_GAP;
	const now = frames.flatMap(({ name, now }) =>
		now === null ? [] : [{ name, from: now, to: { ...now, x: now.x + by } }],
	);
	return { old, now };
}
