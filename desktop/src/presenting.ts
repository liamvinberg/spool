import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { log } from "./log";

// What a talk's slides need of macOS that Electron has no way to ask (spool#309), from native/presenting.m, which
// scripts/native.sh builds beside this file. Loaded on macOS, in this process only, once the canvas has loaded
// (`preparePresenting`), so the first press on Present does not wait for it.
// Without it a talk plays as it did before: the window spends the menu bar's height in macOS's own animation as it
// fills its display, and a window already full screen the macOS way lets the menu bar and the Dock come down over the
// slides at the screen's edges.

/** native/presenting.m, as it loads */
export interface PresentingModule {
	/** The app's presentation options (AppKit's NSApplicationPresentationOptions). */
	options(): number;
	/** Sets them, or answers false when AppKit refuses the combination. */
	setOptions(options: number): boolean;
	/** Calls `change` with macOS's animation of the frame of the window `handle` names turned off, or as it is when it names none. */
	immediately(handle: Buffer, change: () => void): void;
}

/** The presentation options a talk changes, as AppKit numbers them (NSApplication.h). */
const AUTO_HIDE_DOCK = 1 << 0;
const HIDE_DOCK = 1 << 1;
const AUTO_HIDE_MENU_BAR = 1 << 2;
const HIDE_MENU_BAR = 1 << 3;
const FULL_SCREEN = 1 << 10;

/**
 * The app's presentation options for a talk: the menu bar and the Dock gone rather than coming down where the pointer
 * meets the screen's edge, and the rest as they were (full screen stays full screen). AppKit hides the menu bar only
 * with the Dock, and refuses either hidden and auto-hidden at once. They hold while spool is the app in front: another
 * app brought forward (⌘Tab) shows its own menu bar, and spool back in front gets its full screen's own options back
 * (`hideBarsOnReturn`).
 */
export function talkOptions(options: number): number {
	return (options & ~(AUTO_HIDE_DOCK | AUTO_HIDE_MENU_BAR)) | HIDE_DOCK | HIDE_MENU_BAR;
}

/** The module at `file`; nothing off macOS, or when it fails to load, which the log says. */
export function loadPresenting(
	file: string,
	platform: NodeJS.Platform = process.platform,
): PresentingModule | undefined {
	if (platform !== "darwin") return undefined;
	try {
		return require(file) as PresentingModule;
	} catch (error) {
		log("present", "FAIL native", error instanceof Error ? error.message : String(error));
		return undefined;
	}
}

/** The module, once a talk has needed it: null when it could not be loaded. */
let presenting: PresentingModule | null | undefined;

function loaded(): PresentingModule | undefined {
	if (presenting === undefined) presenting = loadPresenting(join(__dirname, "presenting.node")) ?? null;
	return presenting ?? undefined;
}

/** Loads the module ahead of the first talk. */
export function preparePresenting(): void {
	loaded();
}

/** Hides the menu bar and the Dock for a talk: the options to restore once it ends, or nothing when they stay. */
export function hideBars(): number | undefined {
	const native = loaded();
	if (native === undefined) return undefined;
	const options = native.options();
	return native.setOptions(talkOptions(options)) ? options : undefined;
}

/** How often, and for how many looks, `hideBarsOnReturn` watches: a Space's slide, and then some. */
const RETURN_LOOK_MS = 50;
const RETURN_LOOKS = 40;

/**
 * Hides the menu bar and the Dock again as spool comes back in front of its full screen window, while `hiding` says
 * the talk still wants them gone. macOS gives the app its full screen's own options back then, so the bars would come
 * down at the screen's edges again: as the window is focused or a moment later, and sometimes again as the Space
 * slides into place. So for a moment the talk's are put back each time the full screen's appear, and never before
 * they do, as options set then stand in for the full screen's own and outlast the talk.
 */
export function hideBarsOnReturn(
	hiding: () => boolean,
	native: PresentingModule | undefined = loaded(),
	later: (next: () => void) => void = (next) => void setTimeout(next, RETURN_LOOK_MS),
): void {
	if (native === undefined) return;
	let looks = 0;
	const look = () => {
		if (!hiding()) return;
		const options = native.options();
		const talk = talkOptions(options);
		if ((options & FULL_SCREEN) !== 0 && options !== talk) native.setOptions(talk);
		if (++looks < RETURN_LOOKS) later(look);
	};
	look();
}

/** The app's presentation options as `hideBars` found them. */
export function restoreBars(options: number): void {
	loaded()?.setOptions(options);
}

/** Makes `change` to `window`'s frame in one step, where macOS would have animated it. */
export function immediately(window: BrowserWindow, change: () => void): void {
	const native = loaded();
	if (native === undefined) change();
	else native.immediately(window.getNativeWindowHandle(), change);
}
