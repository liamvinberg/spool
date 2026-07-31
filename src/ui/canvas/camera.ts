/**
 * Camera math for the infinite canvas — pure functions, the bake-off's feel
 * (#9) carried over verbatim where it matters: zoom anchored at the cursor,
 * exponential wheel zoom, cubic ease-out flights.
 */

import { fitBox, type Placement } from "../../fit";
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
export const FIT_INSET = 128;

/** The camera that lands a placement's scale and screen origin on a world box. */
export function cameraFor(placement: Placement, box: Box): Camera {
	return {
		k: placement.scale,
		x: placement.x - box.x * placement.scale,
		y: placement.y - box.y * placement.scale,
	};
}

/** Frame the given bounds inside vw×vh with breathing room, never past 100%. */
export function fitCamera(bounds: Box, vw: number, vh: number): Camera {
	return cameraFor(fitBox(bounds.w, bounds.h, vw, vh, { inset: FIT_INSET, minScale: K_MIN }), bounds);
}

/**
 * The camera that puts a frame exactly where the player's stage would (#210):
 * the same edge-to-edge fit, so the flight's landing values are the placement
 * values and the handoff into inline play cannot be a pixel out.
 *
 * The stage covers the whole window while the camera lives inside the canvas
 * viewport, which the top bar and the rails inset. So the fit is taken in
 * window space and then moved by where that viewport starts; without it the
 * flight would land off by the width of the chrome around it.
 */
export function stageCamera(frame: Box, vw: number, vh: number, origin: Point = { x: 0, y: 0 }): Camera {
	const place = fitBox(frame.w, frame.h, vw, vh);
	return cameraFor({ scale: place.scale, x: place.x - origin.x, y: place.y - origin.y }, frame);
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
