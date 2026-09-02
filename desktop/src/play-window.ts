import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Where a played window stands (#275).
//
// Two rules, and they are not in conflict. The authored size is the *default*:
// a frame was authored at a width, and that width is the width the page was
// meant to be read at, so a window that opens at anything else is the app
// picking a number over the one spool already knows. A window a hand has moved
// or resized is a *preference*, and a preference outlives the window it was
// expressed on.
//
// The memory is keyed per project and per authored width, which is the whole of
// the design question: play a 1200 frame and you get the 1200 window you
// arranged, play a 390 one and you get the phone window you arranged, and
// neither inherits the other's rectangle.
//
// Everything here is pure or is one file read away from it, because none of it
// can be seen without an Electron window and all of it has to be right the
// first time.

export interface WindowRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** A display's usable area, as `screen` gives it: menu bar and dock removed. */
export interface WorkArea {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * The first time: the frame's own size, with the screen as the only thing
 * allowed to overrule it.
 *
 * Height is the authored height or everything the screen has, whichever is
 * smaller — a 1200x2400 landing is judged on how many rows a screen can hold,
 * so it takes the full height; a 390x844 phone frame takes 844 and stops.
 * Stretching that one to the screen would invent a device nobody has, which is
 * the same lie as scaling and the thing the player took out.
 *
 * It snaps to the right edge rather than centring, so the canvas window's own
 * left edge stays uncovered and its rail is still readable behind this one, and
 * it centres vertically when it is shorter than the screen.
 */
export function fitRect(authored: { w: number; h: number }, area: WorkArea): WindowRect {
	// A frame authored wider than the screen is the one case where the authored
	// width cannot be honoured: a window hanging off the left edge is unreachable.
	const w = Math.min(authored.w, area.width);
	const h = Math.min(authored.h, area.height);
	return {
		x: area.x + area.width - w,
		y: area.y + Math.round((area.height - h) / 2),
		w,
		h,
	};
}

/**
 * One key, two numbers. The width is first and is always digits, so the project
 * name after the colon may hold anything a folder name may hold.
 */
export function rectKey(project: string, authoredWidth: number): string {
	return `${authoredWidth}:${project}`;
}

/**
 * Whether a remembered rect is still somewhere a person can reach.
 *
 * A rect stored on a display that has since been unplugged would otherwise put
 * the window where nothing draws. The test is the bar: enough of the window's
 * own title strip has to overlap some work area to be grabbed and dragged back.
 */
export function rectIsReachable(rect: WindowRect, areas: readonly WorkArea[]): boolean {
	return areas.some((area) => {
		const overlapX = Math.min(rect.x + rect.w, area.x + area.width) - Math.max(rect.x, area.x);
		const overlapY = Math.min(rect.y + BAR_PX, area.y + area.height) - Math.max(rect.y, area.y);
		return overlapX >= REACHABLE_PX && overlapY > 0;
	});
}

/** The bar spool draws in place of the title bar the window does not have. */
export const BAR_PX = 30;

/** How much of that bar has to be on a screen for the window to be draggable. */
const REACHABLE_PX = 80;

/** Where the rects live. Machine-written, and rewritten whole every time. */
export function storePath(directory: string): string {
	return join(directory, "play-windows.json");
}

/**
 * Every remembered rect. Machine-written ephemera: unreadable, corrupt or
 * malformed state reads as nothing remembered, because the cost of that is one
 * window opening at its authored size and the cost of trusting it is a window
 * nobody can find.
 */
export function readRects(directory: string): Record<string, WindowRect> {
	let raw: string;
	try {
		raw = readFileSync(storePath(directory), "utf8");
	} catch {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (typeof parsed !== "object" || parsed === null) return {};
	const windows = (parsed as { windows?: unknown }).windows;
	if (typeof windows !== "object" || windows === null) return {};
	const rects: Record<string, WindowRect> = {};
	for (const [key, value] of Object.entries(windows as Record<string, unknown>)) {
		const rect = asRect(value);
		if (rect !== undefined) rects[key] = rect;
	}
	return rects;
}

function asRect(value: unknown): WindowRect | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	const { x, y, w, h } = candidate;
	if (!isNumber(x) || !isNumber(y) || !isNumber(w) || !isNumber(h)) return undefined;
	// A zero-sized window is not a window, and a stored one is corruption.
	if (w < 1 || h < 1) return undefined;
	return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** The rect this key remembers, if it remembers one. */
export function readRect(directory: string, key: string): WindowRect | undefined {
	return readRects(directory)[key];
}

/**
 * Remember a rect, or forget one by passing none. Read-modify-write against the
 * file rather than a cache, because the state directory is shared and a second
 * app on another lane may have written since.
 */
export function writeRect(directory: string, key: string, rect: WindowRect | undefined): void {
	const rects = readRects(directory);
	if (rect === undefined) {
		if (!Object.hasOwn(rects, key)) return;
		delete rects[key];
	} else {
		rects[key] = rect;
	}
	const path = storePath(directory);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ windows: rects }, null, "\t")}\n`);
}

/** Whether two rects are the same window in the same place. */
export function sameRect(a: WindowRect, b: WindowRect): boolean {
	return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
