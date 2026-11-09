import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rectIsReachable, type WindowRect, type WorkArea } from "./play-window";

// The first run's window (spool#250).
//
// spool's first run lives in one small window, Raycast's size rather than an app's,
// and when it is done that same window grows into spool's. It is one ordinary window
// throughout, on every platform: nothing transparent and no second window, only its
// size, whether it can be resized, and the smallest it may go change.

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

export function smallRect(area: WorkArea): WindowRect {
	return centred(SMALL, area);
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

/**
 * Whether the window should open small, ahead of the page saying so: the daemon's own
 * rule (`firstRunDue` in spool's `src/daemon/first-run.ts`), read off the same files, so
 * a first launch shows the small window straight away rather than a big one shrinking.
 * The page still decides; a window opened small that turns out not to need it grows.
 */
export function firstRunLikely(spoolDir: string): boolean {
	const config = readJson(join(spoolDir, "config.json")) as { onboarding?: { done?: unknown } } | undefined;
	if (config?.onboarding?.done === true) return false;
	const registry = readJson(join(spoolDir, "registry.json")) as { projects?: unknown } | undefined;
	return !Array.isArray(registry?.projects) || registry.projects.length === 0;
}
