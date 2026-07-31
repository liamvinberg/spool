/**
 * Fitting a frame into a viewport, in the one place both realms read it from.
 *
 * The canvas camera and the player stage were the same fit-w-by-h-into-viewport
 * math written twice, which is fine right up until the camera has to fly to
 * where the player is about to put the frame (#210). Inline play hands off at
 * that landing, so the flight's landing values have to *be* the placement
 * values; sharing the function is what makes that true by construction rather
 * than by two implementations agreeing today.
 */

/** A box placed in a viewport: how much it was scaled, and where its top-left landed. */
export interface Placement {
	scale: number;
	x: number;
	y: number;
}

export interface FitOptions {
	/** Total breathing room left around the fit — the canvas leaves some, the stage none. */
	inset?: number;
	/** Floor for the scale, so an enormous fit still lands somewhere the camera can hold. */
	minScale?: number;
}

/**
 * Fit a w×h box into a vw×vh viewport and centre it.
 *
 * Scale never exceeds 1. Bars appear only from aspect mismatch, the way a video
 * player letterboxes: blowing a frame up past the size it was authored at is
 * not honest about what was drawn.
 */
export function fitBox(w: number, h: number, vw: number, vh: number, options: FitOptions = {}): Placement {
	const { inset = 0, minScale = 0 } = options;
	const scale = Math.max(minScale, Math.min(1, (vw - inset) / w, (vh - inset) / h));
	return { scale, x: (vw - w * scale) / 2, y: (vh - h * scale) / 2 };
}
