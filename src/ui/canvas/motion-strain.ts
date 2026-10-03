import { type CameraStore, REST_MS } from "./camera-store";

/**
 * Live frames sit out a camera move they are dragging down.
 *
 * A live frame draws in its own process, but it draws on the GPU the canvas
 * draws on. One that renders a heavy scene (a WebGL scene at its full authored
 * size, shadows and all) can hold the whole canvas to a few frames a second,
 * and a pan or zoom across it then stutters for as long as it is mounted,
 * though the frame would be just as heavy in a tab of its own. So while the
 * camera moves and the display is visibly missing frames, every live frame
 * nobody is inside stands behind its still, which a hidden document stops
 * drawing for, and the documents come back the moment the camera rests. A
 * canvas whose live frames keep up never notices this: nothing is hidden until
 * frames are missed.
 */

/** A display frame this late is a frame missed at any refresh rate. */
export const STRAINED_FRAME_MS = 50;
/** Missed frames in one move before the live frames sit out the rest of it. */
const STRAINED_FRAMES = 2;
/**
 * How long after a strained move the next one starts strained: the documents
 * that slowed one move are still mounted for the next, and finding that out
 * again costs the move its first missed frames.
 */
export const STRAIN_MEMORY_MS = 10_000;

/**
 * How long after the camera last moved its move counts as over, here rather
 * than the store's own rest: under strain the canvas draws so far apart that
 * the store rests between two draws of one gesture, and the documents would
 * come back between every pair of them.
 */
export const CALM_MS = 250;

/** The attribute the canvas stylesheet hides passive live documents under. */
export const STRAINED = "data-canvas-strained";

export function watchMotionStrain(camera: CameraStore, root: HTMLElement): () => void {
	let lastMove = Number.NEGATIVE_INFINITY;
	/** When the last display frame ran, if one has since the move began. */
	let lastTick: number | undefined;
	let missed = 0;
	let looping = false;
	let strainedUntil = Number.NEGATIVE_INFINITY;
	const strain = () => root.setAttribute(STRAINED, "");
	const settle = () => {
		if (root.hasAttribute(STRAINED)) strainedUntil = performance.now() + STRAIN_MEMORY_MS;
		root.removeAttribute(STRAINED);
	};
	// Every display frame while the camera moves, and for a calm window after.
	// A frame counts when the camera was moving as it began: it moved within the
	// store's own rest window of the frame before. So work the canvas does once
	// it rests (a mount, a commit) is never taken for strain, while a move whose
	// steps arrive one slow frame apart is. All of it read off one clock,
	// `performance.now()`, since a frame's own timestamp is when it began.
	const tick = () => {
		const now = performance.now();
		// frames under a millisecond apart are no display at all (a test's
		// stand-in runs the frame on the spot), and asking for the next would
		// never return
		if (lastTick !== undefined && now - lastTick < 1) {
			looping = false;
			lastTick = undefined;
			return;
		}
		if (lastTick !== undefined && lastTick - lastMove > CALM_MS) {
			looping = false;
			lastTick = undefined;
			missed = 0;
			settle();
			return;
		}
		if (
			lastTick !== undefined &&
			lastMove >= lastTick - REST_MS &&
			now - lastTick > STRAINED_FRAME_MS &&
			++missed >= STRAINED_FRAMES
		) {
			strain();
		}
		lastTick = now;
		requestAnimationFrame(tick);
	};
	const unsubscribe = camera.subscribe((_, moving) => {
		if (!moving) return;
		lastMove = performance.now();
		if (lastMove < strainedUntil) strain();
		if (looping) return;
		looping = true;
		requestAnimationFrame(tick);
	});
	return () => {
		lastMove = Number.NEGATIVE_INFINITY;
		unsubscribe();
		root.removeAttribute(STRAINED);
	};
}
