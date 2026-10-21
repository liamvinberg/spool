import { useEffect, useState } from "react";

/**
 * What both of the player's pages do the same way (#227): measure the window
 * the bar is laid out in.
 *
 * There are two pages because there are two documents — the control-origin tab
 * draws one around a render-origin iframe, and the bare render-origin document
 * draws one for itself — and they style themselves from different sheets. What
 * they must not differ on is behaviour, so the behaviour lives here and only
 * the markup is written twice.
 */

export interface Viewport {
	vw: number;
	vh: number;
}

export function useViewport(): Viewport {
	const [viewport, setViewport] = useState<Viewport>(() => ({ vw: window.innerWidth, vh: window.innerHeight }));
	useEffect(() => {
		const measure = () => setViewport({ vw: window.innerWidth, vh: window.innerHeight });
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);
	return viewport;
}

/**
 * The Mac app's play window (#275).
 *
 * Play in the app is not a tab: the app creates the window itself, at the
 * frame's authored size, with `titleBarStyle: "hiddenInset"` and no title bar
 * of its own — so this document draws the 30px bar the OS would otherwise have
 * drawn, with the traffic lights inset into it.
 *
 * The signal that this is that window is the bridge the app's preload puts on
 * `window`, and nothing else. No query parameter, no served-document change: a
 * browser tab is byte-for-byte the document it was, and gets the edge bar it
 * has always had.
 */

/** The bar's height, which is also the page's top inset in that window. */
export const DESK_BAR_PX = 30;

/**
 * Where the bar has to start choosing. Under this the frame's name is the one
 * thing worth its width, so the project prefix and the size readout go.
 */
export const DESK_BAR_WIDE_PX = 520;

/** What the app's window can be told to do, from the page inside it. */
export interface DeskWindow {
	/** This window opened on a remembered rect rather than the authored size. */
	restored: boolean;
	/** Forget that rect and put the window back on the authored size. */
	reset(): void;
}

/**
 * The bridge, if this document is in the app's play window. Shape-checked
 * rather than trusted: an app older than this daemon may expose less than this
 * version asks for, and a bar half of whose controls are missing is worse than
 * the edge bar it replaced.
 */
export function deskWindow(): DeskWindow | null {
	const bridge = (window as { spoolPlayWindow?: unknown }).spoolPlayWindow;
	if (typeof bridge !== "object" || bridge === null) return null;
	const candidate = bridge as Partial<DeskWindow>;
	const { reset } = candidate;
	if (typeof reset !== "function") return null;
	return {
		restored: candidate.restored === true,
		reset: () => reset.call(bridge),
	};
}

/** What a bar this wide carries. The frame's name is never one of the answers. */
export function barLayout(width: number): { project: boolean; size: boolean } {
	const wide = width >= DESK_BAR_WIDE_PX;
	return { project: wide, size: wide };
}

/** How long the window's size stays on the bar once a resize has stopped. */
export const DESK_RESIZE_MS = 900;

/** How long the restore says so for before it fades, toast-length. */
export const DESK_RESTORED_MS = 2600;
