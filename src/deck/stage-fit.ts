import type { Size } from "./deck-file";

/**
 * A box of size `own` fitted into `box` (spool#265), scaled both ways until it touches two sides, and centred: the talk
 * in whatever holds its stage, and a slide of another shape on the talk's screen.
 */
export function fitIn(own: Size, box: Size): { s: number; x: number; y: number } {
	const s = Math.min(box.w / own.w, box.h / own.h);
	return { s, x: (box.w - own.w * s) / 2, y: (box.h - own.h * s) / 2 };
}
