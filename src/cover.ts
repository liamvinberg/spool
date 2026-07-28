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

/** JPEG quality for a cover. Covers are opaque, so they never need alpha. */
export const COVER_QUALITY = 0.82;

/** One immutable image, addressed by the hash of its content. */
export interface Cover {
	hash: string;
}
