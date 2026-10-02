/**
 * What a boot cover is in every realm that makes or shows one. A cover stands
 * in only until a frame reaches the size at which it becomes live, so it is a
 * single bounded image rather than an export artifact.
 */

/** How wide a frame must draw before the canvas mounts its document. */
export const LIVE_MIN_CSS_PX = 400;

/** The highest device scale at which a still must remain sharp. */
export const COVER_DEVICE_SCALE = 2;

/** Maximum decoded area for any capture worker output. */
export const MAX_CAPTURE_OUTPUT_PIXELS = 32 * 1024 * 1024;

/**
 * Raster scale for a still. It reaches the live threshold at 2×, including
 * portrait frames whose long edge tells us nothing about their drawn width.
 */
export function coverCaptureScale(frameWidth: number): number {
	return (LIVE_MIN_CSS_PX * COVER_DEVICE_SCALE) / Math.max(1, frameWidth);
}

/** The output size when it fits the capture worker's decoded-area budget. */
export function captureRasterSize(
	frameWidth: number,
	frameHeight: number,
	scale: number,
): { width: number; height: number } | undefined {
	if (
		!Number.isSafeInteger(frameWidth) ||
		frameWidth <= 0 ||
		!Number.isSafeInteger(frameHeight) ||
		frameHeight <= 0 ||
		!Number.isFinite(scale) ||
		scale <= 0
	) {
		return undefined;
	}
	const width = Math.max(1, Math.round(frameWidth * scale));
	const height = Math.max(1, Math.round(frameHeight * scale));
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width * height > MAX_CAPTURE_OUTPUT_PIXELS) {
		return undefined;
	}
	return { width, height };
}

/** A frame's cover, worked out from its footprint. */
export interface CoverShape {
	/** The CSS size the frame is laid out at, in whole pixels. */
	width: number;
	height: number;
	/** The device scale it is photographed at (`coverCaptureScale`). */
	scale: number;
	/** The image that comes out. */
	raster: { width: number; height: number };
}

/**
 * The cover a frame of this footprint gets, or nothing when it is past the
 * raster budget: what the photo booth lays the frame out at and photographs,
 * and what a stored cover is measured against to tell whether it is still the
 * frame's size.
 */
export function coverShape(frameWidth: number, frameHeight: number): CoverShape | undefined {
	const width = Math.max(1, Math.round(frameWidth));
	const height = Math.max(1, Math.round(frameHeight));
	const scale = coverCaptureScale(width);
	const raster = captureRasterSize(width, height, scale);
	return raster === undefined ? undefined : { width, height, scale, raster };
}

/** JPEG quality for a cover. Covers are opaque, so they never need alpha. */
export const COVER_QUALITY = 0.82;

/**
 * How long a frame may wait for its fonts and its entry animations before it
 * is believed (#177): before the photo booth takes its cover, before its cover
 * fades onto it on the canvas, and before an export copies it.
 *
 * It is the dominant term in a cover, 66 to 76% of the booth's time on Spool's
 * own canvas, and it stays, because the only thing it buys is a truer picture
 * and the picture is the only thing anyone looks at. A frame that animates
 * forever is photographed at the budget, mid-animation.
 */
export const SETTLE_BUDGET_MS = 900;

/**
 * The colour scheme frames are asked to render in (`prefers-color-scheme`):
 * the one the canvas showing them is in, so a cover matches the live frame it
 * fades into. Frames inside the canvas follow the browser's own preference,
 * not the canvas chrome's look.
 */
export type ColorScheme = "light" | "dark";

/** One immutable image, addressed by the hash of its content. */
export interface Cover {
	hash: string;
}
