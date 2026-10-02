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

/** A world box on screen, for one camera: where furniture drawn in screen pixels stands. */
export const toScreen = (box: Box, camera: Camera): Box => ({
	x: box.x * camera.k + camera.x,
	y: box.y * camera.k + camera.y,
	w: box.w * camera.k,
	h: box.h * camera.k,
});

/**
 * Whether a world box is on screen for a camera, or near enough that a pan
 * reaches it before the next frame or two (#81). What a follower there is one
 * of per frame asks while the camera moves, so it can leave everything else
 * for the camera's rest.
 */
export type NearScreen = (camera: Camera, box: Box) => boolean;

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

/**
 * The camera that makes a frame live without ever taking you further away.
 *
 * Below a fit, zoom in to fit. At or above it, center at the current zoom while
 * the whole frame still fits in the viewport. Fit's inset is breathing room,
 * not the point where choosing a neighboring frame should stop bringing it over.
 * Once either dimension exceeds the viewport, preserve the close-up and its
 * position. An entirely off-screen target still pans into view for keyboard entry.
 */
export function entryCamera(camera: Camera, box: Box, vw: number, vh: number): Camera {
	const fit = fitCamera(box, vw, vh);
	if (camera.k < fit.k) return fit;
	if (box.w * camera.k <= vw && box.h * camera.k <= vh) return centerOn(camera, box, vw, vh);
	return intersects(box, visibleWorldRect(camera, vw, vh, 0)) ? camera : centerOn(camera, box, vw, vh);
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

/**
 * A frame shell's corner radius, in the frame's own units: twelve screen pixels close
 * up, and never more than 24 of the frame's, so an overview of many reads as
 * rounded rectangles rather than as pills.
 */
export function shellRadius(k: number): number {
	return Math.min(12 / k, 24);
}

/** The same corner in screen pixels, which is what anything drawn round a shell rounds to. */
export function shellRadiusOnScreen(k: number): number {
	return shellRadius(k) * k;
}
