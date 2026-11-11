import type { Size } from "../../deck/deck-file";
import type { Box } from "../../deck/layout";

/**
 * Where the presenter view puts things in a window of `window`'s size, for a talk of `talk`'s shape: the design's
 * (`app/spool-deck--presenter`, drawn at 1440 × 900) kept as it is at that size and grown or shrunk with the window.
 * The slide stands in the left column as large as fits it and the room below it for the bar, centred across it; the
 * right column, what comes next and the notes, keeps its width.
 */
export interface PresenterLayout {
	/** the slide, live */
	readonly slide: Box;
	/** the right-hand column: its left edge, width and top */
	readonly side: { readonly x: number; readonly w: number; readonly top: number };
}

/** the view's margin, left and right */
const MARGIN = 40;
/** between the slide's column and the right-hand one */
const GUTTER = 40;
const SIDE_W = 320;
/** where the slide starts, under the head */
const SLIDE_TOP = 96;
/** kept under the slide: its cue, and the bar at the foot */
const UNDER_SLIDE = 240;
/** the right-hand column starts this far above the slide, so its first picture's top meets the slide's */
const SIDE_LEAD = 28;

export function presenterLayout(window: Size, talk: Size): PresenterLayout {
	const column = Math.max(160, window.w - MARGIN - GUTTER - SIDE_W - MARGIN);
	// a sixteen by nine box, and the talk's shape as large as fits in it
	const room = { w: column, h: Math.max(90, Math.min((column * 9) / 16, window.h - SLIDE_TOP - UNDER_SLIDE)) };
	const s = Math.min(room.w / talk.w, room.h / talk.h);
	const w = talk.w * s;
	return {
		slide: { x: MARGIN + (room.w - w) / 2, y: SLIDE_TOP, w, h: talk.h * s },
		side: { x: MARGIN + column + GUTTER, w: SIDE_W, top: SLIDE_TOP - SIDE_LEAD },
	};
}
