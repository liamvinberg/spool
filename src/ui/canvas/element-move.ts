import type { MovePlace } from "../api";
import type { PickedHit } from "./protocol";

/**
 * Reorder by hand (#340), the parts that are only arithmetic: where a drag
 * among siblings would land, and what a move is called when it is refused.
 */

type Rect = PickedHit["rect"];

/** Where a drag would put the element: beside which sibling, and the line drawn there. */
export interface Drop {
	/** the index of the sibling in the row it was read from */
	beside: number;
	place: MovePlace;
	/** the insertion line, frame-local */
	line: Rect;
}

/**
 * The axis a row of siblings runs along: across when most neighbours sit
 * beside each other, down otherwise. A grid read row by row runs across,
 * which is the order its children are written in.
 */
export function axisOf(rects: readonly Rect[]): "x" | "y" {
	let across = 0;
	let down = 0;
	for (let at = 1; at < rects.length; at += 1) {
		const one = rects[at - 1];
		const two = rects[at];
		if (one === undefined || two === undefined) continue;
		const dx = Math.abs(two.x + two.w / 2 - (one.x + one.w / 2));
		const dy = Math.abs(two.y + two.h / 2 - (one.y + one.h / 2));
		if (dx > dy) across += 1;
		else down += 1;
	}
	return across > down ? "x" : "y";
}

function distance(rect: Rect, point: { x: number; y: number }): number {
	const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.w));
	const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.h));
	return Math.hypot(dx, dy);
}

/**
 * Where a drag of the sibling at `moving` would land with the pointer at
 * `point`: beside the nearest other sibling, on the side of its middle the
 * pointer is on. Nothing where that is exactly where the element already
 * stands, because a drop there would write nothing.
 */
export function dropAt(rects: readonly Rect[], moving: number, point: { x: number; y: number }): Drop | undefined {
	let beside = -1;
	let nearest = Number.POSITIVE_INFINITY;
	for (const [index, rect] of rects.entries()) {
		if (index === moving) continue;
		const far = distance(rect, point);
		if (far < nearest) {
			nearest = far;
			beside = index;
		}
	}
	const rect = rects[beside];
	if (rect === undefined) return undefined;
	const axis = axisOf(rects);
	const middle = axis === "x" ? rect.x + rect.w / 2 : rect.y + rect.h / 2;
	const place: MovePlace = (axis === "x" ? point.x : point.y) < middle ? "before" : "after";
	if ((place === "before" && beside === moving + 1) || (place === "after" && beside === moving - 1)) {
		return undefined;
	}
	const edge = axis === "x" ? rect.x + (place === "before" ? 0 : rect.w) : rect.y + (place === "before" ? 0 : rect.h);
	const line =
		axis === "x" ? { x: edge - 1, y: rect.y, w: 2, h: rect.h } : { x: rect.x, y: edge - 1, w: rect.w, h: 2 };
	return { beside, place, line };
}

/** What a move was, said the way a person would say it: `Move the li after the li`. */
export function moveAsk(tag: string, place: MovePlace, beside: string): string {
	return `Move the ${tag} ${place} the ${beside}`;
}
