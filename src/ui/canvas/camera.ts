/**
 * Camera math for the infinite canvas — pure functions, the bake-off's feel
 * (#9) carried over verbatim where it matters: zoom anchored at the cursor,
 * exponential wheel zoom, cubic ease-out flights.
 */

import type { Camera } from "../api";

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Point {
	x: number;
	y: number;
}

export const K_MIN = 0.02;
export const K_MAX = 32;

/**
 * One press of the zoom keys. Doubling, not nudging: tldraw's ladder
 * (0.05 · 0.1 · 0.25 · 0.5 · 1 · 2 · 4 · 8) moves a full octave per press, and
 * anything gentler turns "get me out of here" into four keystrokes. Zoom out is
 * the exact reciprocal, so in-then-out returns to the zoom you started at.
 */
export const K_STEP = 2;

export const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

export const toWorld = (p: Point, camera: Camera): Point => ({
	x: (p.x - camera.x) / camera.k,
	y: (p.y - camera.y) / camera.k,
});

export const intersects = (a: Box, b: Box): boolean =>
	a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function boundsOf(boxes: Box[]): Box {
	let x1 = Number.POSITIVE_INFINITY;
	let y1 = Number.POSITIVE_INFINITY;
	let x2 = Number.NEGATIVE_INFINITY;
	let y2 = Number.NEGATIVE_INFINITY;
	for (const b of boxes) {
		x1 = Math.min(x1, b.x);
		y1 = Math.min(y1, b.y);
		x2 = Math.max(x2, b.x + b.w);
		y2 = Math.max(y2, b.y + b.h);
	}
	return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** The camera after zooming by factor with the screen point (cx, cy) pinned. */
export function zoomAt(camera: Camera, cx: number, cy: number, factor: number): Camera {
	const k = clamp(camera.k * factor, K_MIN, K_MAX);
	const r = k / camera.k;
	return { k, x: cx - (cx - camera.x) * r, y: cy - (cy - camera.y) * r };
}

/** The breathing room a canvas fit leaves around what it framed. */
const FIT_INSET = 128;

/** Frame the given bounds inside vw×vh with breathing room, never past 100%. */
export function fitCamera(bounds: Box, vw: number, vh: number): Camera {
	const k = clamp(Math.min((vw - FIT_INSET) / bounds.w, (vh - FIT_INSET) / bounds.h), K_MIN, 1);
	return { k, x: (vw - bounds.w * k) / 2 - bounds.x * k, y: (vh - bounds.h * k) / 2 - bounds.y * k };
}

/** Pan (same zoom) so the box is centered — the flow-walk's camera move (#5). */
export function centerOn(camera: Camera, box: Box, vw: number, vh: number): Camera {
	return {
		k: camera.k,
		x: vw / 2 - (box.x + box.w / 2) * camera.k,
		y: vh / 2 - (box.y + box.h / 2) * camera.k,
	};
}

/** Frames visible to a camera, padded by margin fractions of the viewport. */
export function visibleWorldRect(camera: Camera, vw: number, vh: number, marginFraction: number): Box {
	return {
		x: (-camera.x - vw * marginFraction) / camera.k,
		y: (-camera.y - vh * marginFraction) / camera.k,
		w: (vw * (1 + 2 * marginFraction)) / camera.k,
		h: (vh * (1 + 2 * marginFraction)) / camera.k,
	};
}
