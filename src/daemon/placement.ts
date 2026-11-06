import type { Footprint } from "./sidecar";

/**
 * Where a frame stands on its page's field when nobody said: one born without a
 * sidecar. Pure, so the daemon placing what it finds on disk and the cloud
 * reading its copy of the same folder place them alike.
 */

/** A box in world units. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * What a frame is when nobody said. A size left out is a size nobody thought
 * about, and the frame it belongs to is far more often a page than a phone: a
 * phone is a deliberate shape and states itself, while a desktop frame is what
 * you get when the thought was about the design rather than the viewport.
 * Everything here still holds the sizes it asked for; this is only the floor
 * under a frame that asked for nothing.
 */
export const DEFAULT_W = 1440;
export const DEFAULT_H = 900;
/** The space left between two things on a field. */
export const GUTTER = 80;

export const DEFAULT_FOOTPRINT: Footprint = { w: DEFAULT_W, h: DEFAULT_H };

/** two rects share some area; touching edges do not */
export function overlaps(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Where the next thing on a field goes: beside what is already there, on that
 * field's top line, never on top of anything.
 */
export function besideField(field: readonly Rect[]): { x: number; y: number } {
	if (field.length === 0) return { x: GUTTER, y: GUTTER };
	return {
		x: Math.max(...field.map((each) => each.x + each.w)) + GUTTER,
		y: Math.min(...field.map((each) => each.y)),
	};
}
