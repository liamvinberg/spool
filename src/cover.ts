/**
 * What a boot cover is, for every realm that makes or shows one: the canvas's
 * own self-capture, the daemon's headless fallback, and the canvas putting one
 * on screen. A cover stands in for a frame only for the moment before it boots,
 * so it is bounded and lossy on purpose — the frame itself is the artifact.
 *
 * A cover is a ladder of rungs, not a file (#111). The top rung is the frame's
 * long edge at 2×, under COVER_MAX_EDGE device pixels; each rung below is half
 * the one above. Sharp means sharp at 100% zoom and no further, because past
 * 100% you go inside. Three rungs rather than two, because `srcset` does not
 * interpolate: with only a small and a full, a mid zoom with fifteen frames on
 * screen takes fifteen full covers.
 */

/** The longest side a cover may not exceed, in device pixels. */
export const COVER_MAX_EDGE = 4096;

/** JPEG quality for a cover — covers are opaque, so they never need alpha. */
export const COVER_QUALITY = 0.82;

/** Rungs a self-capture writes: the top, then half, then quarter. */
export const COVER_RUNGS = 3;

/**
 * The one rung a headless heal writes. The daemon has no image library — only
 * playwright-core — so it shoots at one device scale and cannot resample. A
 * short ladder is a normal cover, not a legacy marker: `srcset` handles a single
 * candidate natively, and the frame's own next self-capture fills the rest in.
 */
export const COVER_HEAL_RUNG = COVER_RUNGS - 1;

/** One cover: a content hash addressing the whole ladder, and each rung's width in device pixels, widest first. */
export interface Cover {
	hash: string;
	widths: number[];
}

/**
 * Device pixels per CSS pixel a cover's top rung comes off at: 2×, under
 * whatever cap the asker names on the frame's long edge. The ratio of the
 * display that took it never enters — a cover belongs to its frame, or one
 * photographed on a 1× monitor would be soft at 100% on a 2× one.
 */
export function coverTopScale(maxEdge: number, sourceEdge: number): number {
	return Math.min(2, maxEdge / Math.max(1, sourceEdge));
}

/** Device pixels per CSS pixel at rung `index` (0 = top): the top scale, halved per rung below. */
export function coverRungScale(w: number, h: number, index = 0): number {
	return coverTopScale(COVER_MAX_EDGE, Math.max(w, h)) / 2 ** index;
}

/** A rung's width in device pixels — the name both writers give it on disk. */
export function coverRungWidth(w: number, h: number, index: number): number {
	return Math.max(1, Math.round(w * coverRungScale(w, h, index)));
}

/**
 * The rung the camera asks for: the narrowest one still sharp at this zoom.
 * The browser cannot see the camera — it is a CSS transform, and `srcset`
 * resolves against layout size — so left alone every cover would take the top
 * rung at every zoom. Past 100% the answer stops climbing, because past 100%
 * you go inside.
 */
export function coverRung(
	widths: readonly number[],
	layoutWidth: number,
	k: number,
	devicePixelRatio: number,
): number | undefined {
	const ascending = [...widths].sort((a, b) => a - b);
	const top = ascending.at(-1);
	if (top === undefined) return undefined;
	const wanted = layoutWidth * k * Math.max(1, devicePixelRatio);
	return ascending.find((width) => width >= wanted) ?? top;
}

/**
 * That rung as the `sizes` the browser resolves against. It multiplies this
 * back by the device pixel ratio, so the value is floored rather than rounded:
 * a ratio whose reciprocal does not divide cleanly must not land a hair above
 * the rung it was aimed at, or every frame upgrades to the one above. Rungs sit
 * a factor of two apart, so a hundredth of a pixel can never reach the one
 * below.
 */
export function coverSizes(
	widths: readonly number[],
	layoutWidth: number,
	k: number,
	devicePixelRatio: number,
): string | undefined {
	const rung = coverRung(widths, layoutWidth, k, devicePixelRatio);
	if (rung === undefined) return undefined;
	return `${Math.floor((rung / Math.max(1, devicePixelRatio)) * 100) / 100}px`;
}
