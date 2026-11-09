import { DESK_BAR_PX } from "./player-page";

/**
 * Fit (spool#553): a frame bigger than the window it is played in is laid out
 * at its authored size, never smaller, and the whole of it is shrunk until it
 * fits. A frame that makes no accommodation for a short window (an app mock
 * with a fixed height) is otherwise cut off where nobody can reach it.
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
	/** The frame's size as the canvas authored it, which says whether it fits the window at all. */
	authored(frame: string): Size;
}

/** The room the page gives a frame: the window less the bar both shells wear. */
export function playRoom(viewport: { vw: number; vh: number }): Size {
	return { w: viewport.vw, h: Math.max(viewport.vh - DESK_BAR_PX, 1) };
}

/** Whether a frame's authored size is more than the room has, the one case where fit and responsive differ. */
export function overflows(authored: Size, room: Size): boolean {
	return authored.w > room.w || authored.h > room.h;
}

/**
 * The box a fitted frame is laid out in: its authored width, and at least its
 * authored height, taller where the window's shape leaves room below it once
 * the width has been shrunk to fit. The box always fits the room at
 * {@link fittedScale}, and is the room itself (capped at the authored width)
 * whenever the frame fits unscaled, which is the box responsive gives it too.
 */
export function fittedBox(authored: Size, room: Size): Size {
	const scale = Math.min(1, room.w / authored.w, room.h / authored.h);
	return { w: authored.w, h: Math.max(authored.h, Math.floor(room.h / scale)) };
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
