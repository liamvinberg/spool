import { LIVE_MIN_CSS_PX } from "../../cover";
import type { Camera } from "../api";
import { type Box, intersects, visibleWorldRect } from "../canvas/camera";

/**
 * Which frames of the read-only canvas hold a document, and in what order they
 * boot: the Mac's lifecycle rule (`canvas/lifecycle.ts`) for a canvas that
 * keeps no project of its own.
 *
 * A frame is a document when it is drawn large enough to read and stands in
 * the ring around the viewport; anything smaller is its picture, or its
 * placeholder when it has none, never a document. Two causes add to that: a
 * frame a save touched after its picture was taken (stale), whose picture is
 * no longer what it is, may be a document wherever it is on screen; and under
 * the Comment tool the frame under the pointer is one, since a pin reads the
 * element under it from the document.
 *
 * Every cause is bounded by one cap, nearest the middle of the view first,
 * and a frame already live keeps its place on looser terms than a new one
 * takes it (hysteresis): a frame at the edge of the ring or of the readable
 * size neither loses nor gains its document on every rest.
 */

/** How large a frame draws, on its larger side, before its document is made: the Mac's `LIVE_MIN_CSS_PX`. */
export const READABLE_PX = LIVE_MIN_CSS_PX;
/** How small a live frame may draw before it goes back to its picture: below `READABLE_PX`, so a zoom step at the line keeps it. */
export const KEEP_PX = READABLE_PX * 0.75;
/** How far past the viewport a frame gains its document, as a fraction of the viewport on every side. */
export const NEAR_MARGIN = 0.25;
/** How far past the viewport a live frame keeps it. */
export const KEEP_MARGIN = 0.5;
/** How many documents the canvas keeps live at once. */
export const LIVE_LIMIT = 12;
/** How much nearer a live frame counts than it is, when the cap decides between it and a new one. */
const KEEP_BIAS = 0.75;
/** How many documents boot at once; the rest wait their turn, nearest the middle first. */
export const BOOTS_AT_ONCE = 2;

export interface LiveFrame extends Box {
	name: string;
}

export interface LiveInput {
	frames: readonly LiveFrame[];
	camera: Camera;
	viewport: { w: number; h: number };
	/** Frames a save touched after their picture was taken. */
	stale: ReadonlySet<string>;
	/**
	 * Under the Comment tool, the frame under the pointer, whose document a pin reads; null for none. Frames
	 * it made live stay live while the tool is out and they are on screen, so going back to one reads it at once.
	 */
	focus: string | null;
	/** Whether the Comment tool is out. */
	placing?: boolean;
	/** The frames live before this rest. */
	was: ReadonlySet<string>;
	/** Frames whose document failed: they stand as their picture until they are made again. */
	failed: ReadonlySet<string>;
	limit?: number;
}

/** The frames that hold a document at this camera, nearest the middle of the view first. */
export function chooseLive(input: LiveInput): string[] {
	const { frames, camera, viewport, stale, focus, placing = false, was, failed, limit = LIVE_LIMIT } = input;
	if (viewport.w === 0 || viewport.h === 0) return [];
	const near = visibleWorldRect(camera, viewport.w, viewport.h, NEAR_MARGIN);
	const kept = visibleWorldRect(camera, viewport.w, viewport.h, KEEP_MARGIN);
	const screen = visibleWorldRect(camera, viewport.w, viewport.h, 0);
	const middle = { x: (viewport.w / 2 - camera.x) / camera.k, y: (viewport.h / 2 - camera.y) / camera.k };
	const chosen: { name: string; rank: number }[] = [];
	for (const frame of frames) {
		if (failed.has(frame.name)) continue;
		const live = was.has(frame.name);
		const drawn = Math.max(frame.w, frame.h) * camera.k;
		const readable = drawn >= (live ? KEEP_PX : READABLE_PX) && intersects(frame, live ? kept : near);
		const outdated = stale.has(frame.name) && intersects(frame, live ? near : screen);
		const read = (frame.name === focus || (placing && live)) && intersects(frame, screen);
		const wanted = readable || outdated || read;
		if (!wanted) continue;
		const away = Math.hypot(frame.x + frame.w / 2 - middle.x, frame.y + frame.h / 2 - middle.y);
		chosen.push({
			name: frame.name,
			rank: frame.name === focus ? Number.NEGATIVE_INFINITY : live ? away * KEEP_BIAS : away,
		});
	}
	return chosen
		.sort((a, b) => a.rank - b.rank)
		.slice(0, limit)
		.map((each) => each.name);
}

/**
 * Which of the live frames to start booting now: in their order, those not yet
 * mounted, as many as leave at most `BOOTS_AT_ONCE` booting.
 */
export function nextBoots(
	live: readonly string[],
	mounted: ReadonlySet<string>,
	booting: number,
	atOnce = BOOTS_AT_ONCE,
): string[] {
	const room = Math.max(0, atOnce - booting);
	return live.filter((name) => !mounted.has(name)).slice(0, room);
}
