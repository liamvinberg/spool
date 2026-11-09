import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rectIsReachable, type WindowRect, type WorkArea } from "./play-window";

// The first run's window (spool#250).
//
// spool's first run lives in one small window, Raycast's size rather than an app's,
// and when it is done that same window grows into spool's. It is one ordinary window
// throughout, on every platform: nothing transparent and no second window, only its
// size, whether it can be resized, and the smallest it may go change.

/** What the app runs in the page, with a press of its own, as the setup window shows: spool's `SETUP_SHOWN` event (`src/ui/first-run/sounds.ts`). */
export const SETUP_SHOWN_SCRIPT = 'window.dispatchEvent(new Event("spool:setup-shown"))';

/** The first run's window: big enough for a step, small enough to read as a welcome. */
export const SMALL = { w: 560, h: 480 } as const;
/** The canvas window as it first opens, and its smallest. */
export const FULL = { w: 1440, h: 900 } as const;
export const MINIMUM = { w: 720, h: 480 } as const;

/** Centred on the display, as a dialog is. */
function centred(size: { w: number; h: number }, area: WorkArea): WindowRect {
	const w = Math.min(size.w, area.width);
	const h = Math.min(size.h, area.height);
	return {
		x: area.x + Math.round((area.width - w) / 2),
		y: area.y + Math.round((area.height - h) / 2),
		w,
		h,
	};
}

/** A step's size, centred: the first run's window is 560 by 480, a little taller on a step that holds more. */
export function smallRect(area: WorkArea, size: { w: number; h: number } = SMALL): WindowRect {
	return centred(size, area);
}

/** A size the page asked for, held to what a setup step may be: never wider or taller than a step needs. */
export function setupSize(asked: unknown): { w: number; h: number } | undefined {
	if (typeof asked !== "object" || asked === null) return undefined;
	const { w, h } = asked as { w?: unknown; h?: unknown };
	if (typeof w !== "number" || typeof h !== "number" || !Number.isFinite(w) || !Number.isFinite(h)) return undefined;
	const clamp = (n: number, low: number, high: number) => Math.round(Math.min(high, Math.max(low, n)));
	return { w: clamp(w, 400, 900), h: clamp(h, 360, 800) };
}

/**
 * What the small window grows into: where the window stood before the setup shrank it,
 * while that is still on a display, and otherwise the canvas's own first size, centred.
 */
export function grownRect(remembered: WindowRect | undefined, area: WorkArea, areas: readonly WorkArea[]): WindowRect {
	if (remembered !== undefined && rectIsReachable(remembered, areas)) return remembered;
	return centred(FULL, area);
}

function readJson(file: string): unknown {
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return undefined;
	}
}

/** What a state folder holds once spool was used from it: the daemon's `USED_STATE` (spool's `src/daemon/first-run.ts`). */
const USED_STATE = ["registry.json", "session.json", "config.json", "cloud", "threads", "comments"] as const;

/**
 * Whether the window should open small, ahead of the page saying so: the daemon's own
 * rule (`settleFirstRun` in spool's `src/daemon/first-run.ts`), read off the same files,
 * so a first launch shows the small window straight away rather than a big one shrinking.
 * `onboarding.done` once the daemon has written it; before that, a state folder nobody
 * has used yet. The page still decides; a window opened small that turns out not to need it grows.
 */
export function firstRunLikely(spoolDir: string): boolean {
	const config = readJson(join(spoolDir, "config.json")) as { onboarding?: { done?: unknown } } | undefined;
	const done = config?.onboarding?.done;
	if (typeof done === "boolean") return !done;
	return !USED_STATE.some((name) => existsSync(join(spoolDir, name)));
}
