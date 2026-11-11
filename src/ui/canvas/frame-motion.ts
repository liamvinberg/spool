import type { Box } from "./camera";

/**
 * Frames drawn somewhere other than where they stand (spool#299): a frame carried in the hand, or one on its way to
 * its place on its own spring. Where a frame stands is the store's, and what a hit test or a save reads; where it is
 * drawn is this, read by whatever draws a frame (its picture, its shell, its label, its ring) in the very animation
 * frame the motion moves it, so a frame in motion is never drawn by React.
 */
export interface DrawnFrame {
	/** its top left on the page */
	readonly x: number;
	readonly y: number;
	/** how much larger it is drawn, grown about `origin`: 1 at rest */
	readonly scale: number;
	/** the point it grows about, from its top left, in page pixels */
	readonly origin: { readonly x: number; readonly y: number };
	/** how far it is lifted, from 0 at rest to 1 in the hand: its shadow's strength */
	readonly lift: number;
	/** drawn over every other frame of the page */
	readonly top: boolean;
}

export interface FrameMotion {
	/** where a frame is drawn now, or nothing while it is drawn where it stands */
	drawn(name: string): DrawnFrame | undefined;
	/** hear every animation frame the motion moves anything in, after it moved; returns the unsubscribe */
	listen(listener: () => void): () => void;
}

/** A frame's top left where it is drawn, its own size: what a label rides on, which never grows. */
export function placeDrawn<B extends Box>(frame: B, drawn: DrawnFrame | undefined): B {
	return drawn === undefined || (drawn.x === frame.x && drawn.y === frame.y)
		? frame
		: { ...frame, x: drawn.x, y: drawn.y };
}

/** The box a frame is drawn in: where its motion has it, grown about its origin. */
export function boxDrawn(frame: Box, drawn: DrawnFrame | undefined): Box {
	if (drawn === undefined) return frame;
	const s = drawn.scale;
	return {
		x: drawn.x + drawn.origin.x * (1 - s),
		y: drawn.y + drawn.origin.y * (1 - s),
		w: frame.w * s,
		h: frame.h * s,
	};
}
