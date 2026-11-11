import type { Size } from "./deck-file";

/**
 * The ground around the talk wherever its stage stands (spool#265), as the deck's design frames draw it: what shows
 * beside a talk that is not the window's shape, and beside a slide that is not the talk's. Never pure black, which is
 * the room blacked out (B) and nothing else.
 */
export const STAGE_GROUND = "#0a0a0b";

/**
 * A box of size `own` fitted into `box` (spool#265), scaled both ways until it touches two sides, and centred: the talk
 * in whatever holds its stage, and a slide of another shape on the talk's screen.
 */
export function fitIn(own: Size, box: Size): { s: number; x: number; y: number } {
	const s = Math.min(box.w / own.w, box.h / own.h);
	return { s, x: (box.w - own.w * s) / 2, y: (box.h - own.h * s) / 2 };
}
