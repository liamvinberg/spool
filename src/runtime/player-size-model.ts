// The size a frame plays at (spool#264), as numbers and rules: the menu's rows, the drag's stops and grips, what the
// readout says and which row is marked. Ported as it stands from the design's `shared/ui/spool/player-size-model.ts`
// (task 565, decided from the `play-size` takes size-drag and size-menu); `player-size.tsx` draws it.

import type { Size } from "./player-fit";

export type { Size };

/** What the frame is at: its own size, the window's, a device, or `null` for a size pulled by hand. */
export type SizeId = "drawn" | "window" | "phone" | "tablet" | "laptop" | "desktop";

/** The one list of devices: the menu's rows under the rule, and the drag's soft stops. */
export const DEVICES: { id: Exclude<SizeId, "drawn" | "window">; label: string; size: Size }[] = [
	{ id: "phone", label: "Phone", size: { w: 390, h: 844 } },
	{ id: "tablet", label: "Tablet", size: { w: 834, h: 1194 } },
	{ id: "laptop", label: "Laptop", size: { w: 1440, h: 900 } },
	{ id: "desktop", label: "Desktop", size: { w: 1920, h: 1080 } },
];

/* ---------------------------------------------------------------- the menu -- */

/** How long the pointer rests on a row before the frame goes there, so a pass down the list does not flicker. */
export const DWELL_MS = 70;
/** Letters typed within this of each other spell the start of a row. */
export const TYPE_AHEAD_MS = 500;
/** Critically damped, so a page reflowing through its breakpoints never overshoots and comes back. */
export const MENU_SPRING = { stiffness: 420, damping: 42, restDelta: 0.5 } as const;
/** The list's way in and out, and the gap under the readout it hangs at. */
export const MENU_IN = { type: "spring", visualDuration: 0.18, bounce: 0 } as const;
export const MENU_OUT_S = 0.09;
export const MENU_GAP_PX = 5;

/** The rows, in order: As drawn and Window, a rule, then the devices. Window is the room under the bar, read live. */
export function rows(own: Size, room: Size): { id: SizeId; label: string; size: Size }[] {
	return [{ id: "drawn", label: "As drawn", size: own }, { id: "window", label: "Window", size: room }, ...DEVICES];
}

export function sizeOf(id: SizeId, own: Size, room: Size): Size {
	return rows(own, room).find((row) => row.id === id)?.size ?? own;
}

/** What the frame rests at: picked from the menu, or pulled by hand (`id` null) and let go. */
export interface Held {
	id: SizeId | null;
	size: Size;
}

/**
 * The row the menu marks: the one picked, or for a size pulled by hand the first row of exactly that size, or none.
 * Where rows share a size (a 390 × 844 frame is As drawn and Phone at once) the one picked wins, then list order.
 */
export function marked(held: Held, own: Size, room: Size): SizeId | null {
	if (held.id !== null) return held.id;
	return rows(own, room).find((row) => row.size.w === held.size.w && row.size.h === held.size.h)?.id ?? null;
}

/** The word after the size for a row: none for As drawn, `window`, or the device's name. */
export function wordFor(id: SizeId | null): string | null {
	if (id === null || id === "drawn") return null;
	return id === "window" ? "window" : (DEVICES.find((d) => d.id === id)?.label.toLowerCase() ?? null);
}

/* ---------------------------------------------------------------- the drag -- */

/** The least a pull may make the frame. */
export const MIN: Size = { w: 320, h: 480 };
/** The desk kept round a pulled size, so its edges always have somewhere to be grabbed. */
export const GUTTER = 12;
/** How far onto the desk an edge can be grabbed, and how far away its grip starts to show. */
export const HIT = 14;
export const NEAR = 72;
/** Layout px either side of a stop that hold the size on it. */
export const SNAP = 14;
/** How far a pull may stretch past the last size the desk allows, and how far under the least. */
export const LET_GO = 8;
export const UNDER = 36;
/** How near the window's own edge the pointer lets go into `window`. */
export const EDGE = 2;
/** Back from the window, how long the box springs to the hand before it follows it again. */
export const SETTLE_MS = 260;
/** Springs: back to its own size or out to the window, and back to the hand from the window. */
export const PULL_SPRING = { type: "spring", stiffness: 380, damping: 38, mass: 1 } as const;
export const FOLLOW_SPRING = { type: "spring", stiffness: 700, damping: 50 } as const;
/** A grip following the pointer along its edge. */
export const ALONG_SPRING = { stiffness: 600, damping: 45 } as const;
/** The grip's own pop, and the fade of grips, the readout's word and the stop marks. */
export const GRIP_POP = { type: "spring", stiffness: 700, damping: 30 } as const;
export const CORNER_POP = { type: "spring", stiffness: 700, damping: 24 } as const;
export const FADE = { duration: 0.14, ease: [0.22, 0.61, 0.36, 1] } as const;
export const TICKS_FADE = { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] } as const;

/** Widths that hold a pull: the devices' and the frame's own. Heights the same. */
export function widthStops(own: Size): number[] {
	return [...new Set([...DEVICES.map((d) => d.size.w), own.w])].sort((a, b) => a - b);
}
export function heightStops(own: Size): number[] {
	return [...new Set([...DEVICES.map((d) => d.size.h), own.h])].sort((a, b) => a - b);
}

export type Sign = -1 | 0 | 1;
/** Where the pointer is against the box: which edge or corner, close enough to grab (`hit`), or how near (`strength`). */
export interface Zone {
	sx: Sign;
	sy: Sign;
	hit: boolean;
	strength: number;
}

/**
 * The edge or corner the pointer is beside, from its place against the box's centre (`px`, `py`, screen px) and the
 * box as drawn. Inside the box is the frame's own, so `null`; an edge with less than a gutter of desk past it (the
 * frame fills the window that way) has no grip.
 */
export function zoneAt(px: number, py: number, box: Size, room: Size): Zone | null {
	const ox = Math.abs(px) - box.w / 2;
	const oy = Math.abs(py) - box.h / 2;
	if (ox < 0 && oy < 0) return null;
	const sideRoom = (room.w - box.w) / 2 >= GUTTER;
	const endRoom = (room.h - box.h) / 2 >= GUTTER;
	const inX = sideRoom && ox >= 0 && ox <= HIT && oy <= HIT;
	const inY = endRoom && oy >= 0 && oy <= HIT && ox <= HIT;
	if (inX || inY) return { sx: inX ? sign(px) : 0, sy: inY ? sign(py) : 0, hit: true, strength: 1 };
	if (sideRoom && ox > 0 && ox <= NEAR && oy <= 0)
		return { sx: sign(px), sy: 0, hit: false, strength: 1 - (ox - HIT) / (NEAR - HIT) };
	if (endRoom && oy > 0 && oy <= NEAR && ox <= 0)
		return { sx: 0, sy: sign(py), hit: false, strength: 1 - (oy - HIT) / (NEAR - HIT) };
	return null;
}

/** A pulled length: held on a stop within reach, resisting below the least and past the most. */
export function holdAt(raw: number, min: number, max: number, stops: number[]): { v: number; snap: number | null } {
	for (const s of stops) if (s <= max && Math.abs(raw - s) <= SNAP) return { v: s, snap: s };
	if (raw < min) return { v: even(min - Math.min(UNDER, Math.sqrt(min - raw) * 2.5)), snap: null };
	if (raw > max) return { v: even(max + Math.min(LET_GO, Math.sqrt(raw - max) * 2)), snap: null };
	return { v: even(raw), snap: null };
}

/** While a pull holds on a stop, what the bar calls it: the device of that width, or `as drawn` on the frame's own size. */
export function stopWord(w: number, h: number, own: Size): string | null {
	if (w === own.w && h === own.h) return "as drawn";
	return DEVICES.find((d) => d.size.w === w)?.label.toLowerCase() ?? null;
}

/* ---------------------------------------------------------------- the fit -- */

/** How far a size is drawn smaller to show all of it in the room, never enlarged: `played()`'s fit for a screen. */
export function fitScale(size: Size, room: Size): number {
	return Math.min(1, room.w / size.w, room.h / size.h);
}

/** The percent the readout says, in whole percent, only when drawn smaller. */
export function percentSaid(scale: number): number | null {
	const p = Math.round(scale * 100);
	return p < 100 ? p : null;
}

export function cursorFor(sx: Sign, sy: Sign): string {
	if (sx !== 0 && sy !== 0) return sx === sy ? "nwse-resize" : "nesw-resize";
	return sx !== 0 ? "ew-resize" : "ns-resize";
}

export const sign = (v: number): Sign => (v < 0 ? -1 : 1);
export const even = (v: number) => Math.round(v / 2) * 2;
export const clampEven = (v: number, min: number, max: number) => even(Math.max(min, Math.min(max, v)));
