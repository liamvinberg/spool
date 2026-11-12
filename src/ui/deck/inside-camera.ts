import type { Camera } from "../api";
import type { Box } from "../canvas/camera";

/**
 * Where the camera goes as a slide of a deck is gone into and come out of (spool#265), the prototype's numbers and
 * rules (`field.tsx`): in, it flies until the slide fills the canvas with room for its label above and a little
 * around; out, it flies back to the very camera it left when the talk is still on the slide gone into, and otherwise
 * to the same zoom and height, centred across the slide the talk ended on. The flight's timing is the deck's motion.
 */

/**
 * How long a slide held stands before it settles, its own document starting and the stage resting on it: longer than a
 * double-click, whose first click selects the slide the second goes into, so that click starts nothing under the flight.
 */
export const SETTLE_MS = 500;

/** Room above a slide gone into, for its label, and around it, in screen pixels. */
export const ROOM = { top: 40, side: 24, bottom: 24 } as const;

/** The screen box a slide of `size` fills in a view of `vw` by `vh`. */
export function insideBox(size: { w: number; h: number }, vw: number, vh: number): Box & { k: number } {
	const k = Math.min((vw - ROOM.side * 2) / size.w, (vh - ROOM.top - ROOM.bottom) / size.h);
	return {
		x: (vw - size.w * k) / 2,
		y: ROOM.top + (vh - ROOM.top - ROOM.bottom - size.h * k) / 2,
		w: size.w * k,
		h: size.h * k,
		k,
	};
}

/** The camera that makes `slot`, a slide's place on the page, fill the view. */
export function insideCamera(slot: Box, vw: number, vh: number): Camera {
	const at = insideBox(slot, vw, vh);
	return { k: at.k, x: at.x - slot.x * at.k, y: at.y - slot.y * at.k };
}

/**
 * The camera coming out lands on: `before`, the camera the slide `from` was gone into from, when the talk ended on
 * that slide; else the same zoom and height, centred across `ended`, the place of the slide it ended on.
 */
export function outCamera(
	before: { readonly camera: Camera; readonly from: string },
	ended: { readonly slide: string; readonly slot: Box },
	vw: number,
): Camera {
	if (ended.slide === before.from) return before.camera;
	const { k, y } = before.camera;
	return { k, y, x: vw / 2 - (ended.slot.x + ended.slot.w / 2) * k };
}
