/**
 * What a boot cover is, for both realms that make one: the canvas's own
 * self-capture (runtime shim) and the daemon's headless fallback. A cover
 * stands in for a frame only for the moment before it boots, so it is bounded
 * and lossy on purpose — the frame itself is the artifact.
 */

/** The longest side a cover is rasterized to, in device pixels. */
export const COVER_MAX_EDGE = 1200;

/** JPEG quality for a cover — covers are opaque, so they never need alpha. */
export const COVER_QUALITY = 0.82;
