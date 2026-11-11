import type { WindowRect, WorkArea } from "./play-window";

// Where the room's window of a presented talk stands (spool#265).
//
// The room is what the audience sees, so it belongs on the screen spool's own
// window is not on: the projector, the TV, the second display. Spool's window is
// the presenter view and stays where the presenter is. With one display there is
// nowhere else to go, so the room is an ordinary window the presenter can move or
// share in a call. X swaps the two screens.
//
// Pure, because none of it can be seen without two displays plugged into a Mac,
// and all of it has to be right the first time a talk is given.

/** A display, as `screen` gives it: its id, its name, its whole area and its usable one. */
export interface RoomDisplay {
	id: number;
	/** what macOS calls it, "Studio Display" or "Built-in Retina Display" */
	label: string;
	/** the laptop's own panel */
	internal: boolean;
	bounds: WorkArea;
	workArea: WorkArea;
}

/** Full screen on a display, or a window at a rect when there is no other display. */
export type RoomPlace = { kind: "screen"; display: RoomDisplay } | { kind: "window"; rect: WindowRect };

/** The room's window when it is a window: a small screen's shape, which the slide is fitted into. */
export const ROOM_WINDOW = { w: 960, h: 540 } as const;

/**
 * The display the room opens full screen on: one spool's window is not on. Of several, an external one before the
 * laptop's own panel (a room is a projector or a TV far more often than a laptop), and of those the largest. With
 * one display, none: the room is a window on it.
 */
export function roomDisplay(displays: readonly RoomDisplay[], canvas: number): RoomDisplay | undefined {
	const others = displays.filter((display) => display.id !== canvas);
	const area = (display: RoomDisplay) => display.bounds.width * display.bounds.height;
	return [...others].sort((a, b) => Number(a.internal) - Number(b.internal) || area(b) - area(a))[0];
}

/** Where the room opens: full screen on another display when there is one, else a window on the canvas's. */
export function roomPlace(displays: readonly RoomDisplay[], canvas: number): RoomPlace {
	const other = roomDisplay(displays, canvas);
	if (other !== undefined) return { kind: "screen", display: other };
	const home = displays.find((display) => display.id === canvas) ?? displays[0];
	return { kind: "window", rect: roomWindowRect(home?.workArea ?? { x: 0, y: 0, ...ROOM_WINDOW_AREA }) };
}

const ROOM_WINDOW_AREA = { width: ROOM_WINDOW.w, height: ROOM_WINDOW.h };

/**
 * The room as a window on a display: the small screen's size, or the display's when it is smaller, against the right
 * edge and centred in height, as a play window opens, so the presenter view's left side stays in sight beside it.
 */
export function roomWindowRect(area: WorkArea): WindowRect {
	const scale = Math.min(1, area.width / ROOM_WINDOW.w, area.height / ROOM_WINDOW.h);
	const w = Math.round(ROOM_WINDOW.w * scale);
	const h = Math.round(ROOM_WINDOW.h * scale);
	return { x: area.x + area.width - w, y: area.y + Math.round((area.height - h) / 2), w, h };
}

/**
 * X: the room and spool's window trade screens. The room goes full screen on the display spool's window was on,
 * and spool's window moves to the one the room left. A room that is a window while there are two displays goes full
 * screen on the one spool's window is not on, and spool's window stays. With one display nothing moves: undefined.
 */
export function swapPlaces(
	displays: readonly RoomDisplay[],
	canvas: number,
	room: number | undefined,
): { room: RoomDisplay; canvas: RoomDisplay | undefined } | undefined {
	const here = displays.find((display) => display.id === canvas);
	const there = room === undefined ? undefined : displays.find((display) => display.id === room);
	if (here !== undefined && there !== undefined && there.id !== here.id) return { room: here, canvas: there };
	const other = roomDisplay(displays, canvas);
	return other === undefined ? undefined : { room: other, canvas: undefined };
}

/**
 * A window carried from one display's usable area to another's: the same place relative to the area, its size kept
 * unless the new area is smaller, and never past its edges.
 */
export function carryRect(rect: WindowRect, from: WorkArea, to: WorkArea): WindowRect {
	const w = Math.min(rect.w, to.width);
	const h = Math.min(rect.h, to.height);
	const along = (offset: number, room: number, span: number) =>
		(room > 0 ? Math.max(0, Math.min(1, offset / room)) : 0) * span;
	const x = to.x + Math.round(along(rect.x - from.x, from.width - rect.w, to.width - w));
	const y = to.y + Math.round(along(rect.y - from.y, from.height - rect.h, to.height - h));
	return { x, y, w, h };
}

/**
 * Whether the room, full screen on `room`, must come back as a window now that the displays are `displays`: its
 * display was unplugged, or it is the one spool's window is on (spool's window was carried there when its own went).
 */
export function roomLost(displays: readonly RoomDisplay[], canvas: number, room: number): boolean {
	return room === canvas || !displays.some((display) => display.id === room);
}

/** What the presenter view is told of its room's screen. */
export interface RoomReport {
	/** the talk whose room this is */
	talk: string;
	/** the display the room is full screen on, by its name; null while the room is a window */
	screen: string | null;
	/** whether X has another screen to swap to */
	swaps: boolean;
	/** the display that was unplugged under the room, which is a window again because of it */
	unplugged?: string;
}

/** The room's address on the daemon, `/play/<project>?…&room=<talk>`: its talk, or undefined for any other address. */
export function roomTalk(candidate: string): string | undefined {
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return undefined;
	}
	if (!/^\/play\/[^/]+$/.test(url.pathname)) return undefined;
	const talk = url.searchParams.get("room");
	return talk !== null && /^[A-Za-z0-9_-]{16,64}$/.test(talk) ? talk : undefined;
}
