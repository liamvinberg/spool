import { DESK_BAR_PX } from "./player-page";
import { type Held, sizeOf } from "./player-size-model";

/**
 * Fit (spool#553, spool#263), the default way to play: a frame plays at
 * exactly the size it was authored at, never stretched to the window and never
 * enlarged, and is shrunk only where the window is smaller. A frame shrunk to
 * show all of its height would be a sliver when it is a long page, so past
 * {@link WHOLE_SHARE} it keeps its width's scale and scrolls instead. Whether a
 * frame is a screen or a page is never read from its content: a fixed-height
 * app mock and a long page look the same from outside.
 * The size it plays at can be chosen too (spool#264): the window's, a
 * device's, or one pulled by hand, laid out for real at that size and shrunk
 * the same way where the window is smaller.
 */

export interface Size {
	w: number;
	h: number;
}

/**
 * Where a player can choose the size its frames play at (spool#264): what this
 * play rests at, and the box the frame on show is laid out at while it moves.
 */
export interface PlayerSize {
	/** What every frame of this play rests at. */
	held(): Held;
	/** A frame's own size, as drawn. */
	authored(frame: string): Size;
	/** Rest at `held` from now on. As drawn and Window are where this browser's next play starts; nothing else is kept. */
	hold(held: Held): void;
	/**
	 * The box the frame on show is laid out at while it moves (a spring, a pull, a preview), or `null` once it rests at
	 * what is held. A player's geometry says it from then on, and the shell hands it across the port.
	 */
	lay(box: Size | null): void;
}

/** The room the page gives a frame: the window less the bar both shells wear, or the whole window where none is. */
export function playRoom(viewport: { vw: number; vh: number }, bar = true): Size {
	return { w: viewport.vw, h: Math.max(viewport.vh - (bar ? DESK_BAR_PX : 0), 1) };
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

/**
 * The box a frame rests in at `held`: as drawn, its own (fitted, so a long page
 * keeps its width and scrolls); the room at Window; a device's or a pulled size
 * as given, never a page, since its height is a screen's. Shrunk to the room at
 * {@link fittedScale} like any other.
 */
export function heldBox(held: Held, authored: Size, room: Size): Size {
	if (held.id === "drawn") return fittedBox(authored, room);
	return held.id === null ? held.size : sizeOf(held.id, authored, room);
}

const FIT_KEY = "spool:player-fit";

/**
 * Where a play starts on this browser: as drawn until someone picks Window. A
 * device or a pulled size is never kept, so it never starts there. Window is
 * stored as "responsive", the word it had before spool#264, so an older spool
 * reads it as its nearest pick.
 */
export function readStart(): "drawn" | "window" {
	try {
		return window.localStorage.getItem(FIT_KEY) === "responsive" ? "window" : "drawn";
	} catch {
		return "drawn";
	}
}

export function writeStart(at: "drawn" | "window"): void {
	try {
		if (at === "drawn") window.localStorage.removeItem(FIT_KEY);
		else window.localStorage.setItem(FIT_KEY, "responsive");
	} catch {
		// A browser that denies storage still plays; the pick lasts the page.
	}
}
