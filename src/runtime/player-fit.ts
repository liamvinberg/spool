import { DESK_BAR_PX } from "./player-page";

/**
 * Fit (spool#553, spool#263), the default way to play: a frame plays at
 * exactly the size it was authored at, never stretched to the window and never
 * enlarged, and is shrunk only where the window is smaller. A frame shrunk to
 * show all of its height would be a sliver when it is a long page, so past
 * {@link WHOLE_SHARE} it keeps its width's scale and scrolls instead. Whether a
 * frame is a screen or a page is never read from its content: a fixed-height
 * app mock and a long page look the same from outside.
 * Responsive is the other way to play: the frame lays out at the window's real
 * size, so its own breakpoints fire, and is never scaled.
 */

export interface Size {
	w: number;
	h: number;
}

/** What a player can be told about fitting, where it can fit. */
export interface PlayerFit {
	on(): boolean;
	set(on: boolean): void;
}

/** The room the page gives a frame: the window less the bar both shells wear. */
export function playRoom(viewport: { vw: number; vh: number }): Size {
	return { w: viewport.vw, h: Math.max(viewport.vh - DESK_BAR_PX, 1) };
}

/**
 * How small showing a frame whole may make it, as a share of the scale its
 * width alone allows. A frame that would be drawn smaller than this to show all
 * of its height plays as a page instead: its width's scale, the window's
 * height, and its own document scrolling.
 */
export const WHOLE_SHARE = 1 / 2;

/**
 * The box a fitted frame is laid out in. A screen is its authored box, drawn
 * at the scale that shows all of it; a page keeps its authored width and is as
 * tall as the room at its width's scale. Either box fits the room at
 * {@link fittedScale}.
 */
export function fittedBox(authored: Size, room: Size): Size {
	const width = Math.min(1, room.w / authored.w);
	const whole = Math.min(width, room.h / authored.h);
	if (whole >= width * WHOLE_SHARE) return { w: authored.w, h: authored.h };
	return { w: authored.w, h: Math.floor(room.h / width) };
}

/** How far a box laid out at its size is shrunk to fit the room, never grown. */
export function fittedScale(box: Size, room: Size): number {
	return Math.min(1, room.w / box.w, room.h / box.h);
}

const FIT_KEY = "spool:player-fit";

/** Whether this browser plays fitted, which it does until someone picks responsive. */
export function readFit(): boolean {
	try {
		return window.localStorage.getItem(FIT_KEY) !== "responsive";
	} catch {
		return true;
	}
}

export function writeFit(on: boolean): void {
	try {
		if (on) window.localStorage.removeItem(FIT_KEY);
		else window.localStorage.setItem(FIT_KEY, "responsive");
	} catch {
		// A browser that denies storage still fits; the pick lasts the page.
	}
}
