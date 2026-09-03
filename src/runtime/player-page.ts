import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What both of the player's pages do the same way (#227): measure the window,
 * and wear, put away and peek the bar.
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
 * The tab's bar can be put away (#227). It is worn by default, the way the
 * app's window wears its own, and the eye on it takes it off for a reader who
 * wants the prototype and nothing else. Put away, a nub at the top edge is its
 * trace: resting the cursor there peeks the bar back in, and pressing the nub
 * puts it back on.
 *
 * The choice is remembered per browser rather than per tab, because it is a
 * preference and not a moment: someone who took the bar off wants it off next
 * time too.
 */
export const BAR_HIDDEN_KEY = "spool:player-bar-hidden";

/** How long the cursor has to rest against the top edge before the put-away bar peeks in. */
export const PEEK_DWELL_MS = 150;

export function readBarHidden(): boolean {
	try {
		return window.localStorage.getItem(BAR_HIDDEN_KEY) === "1";
	} catch {
		return false;
	}
}

export function writeBarHidden(hidden: boolean): void {
	try {
		if (hidden) window.localStorage.setItem(BAR_HIDDEN_KEY, "1");
		else window.localStorage.removeItem(BAR_HIDDEN_KEY);
	} catch {
		// a browser that refuses storage still gets the bar, just not the memory of it
	}
}

/**
 * The peek (#227): hover the strip the put-away bar left behind and the bar
 * comes back over the page for as long as the hand stays on it. A dwell keeps a
 * pass through the edge on the way to the browser's own chrome from flashing
 * it. The strip is a real element and the bar is inside it, so the browser's
 * own hover is the whole mechanism: nothing has to be forwarded out of the
 * frame, and leaving the bar is what takes it away.
 */
export function usePeek(armed: boolean): {
	peeked: boolean;
	enter: () => void;
	leave: () => void;
} {
	const [peeked, setPeeked] = useState(false);
	const dwell = useRef(0);
	useEffect(() => () => window.clearTimeout(dwell.current), []);
	useEffect(() => {
		if (armed) return;
		window.clearTimeout(dwell.current);
		setPeeked(false);
	}, [armed]);
	const enter = useCallback(() => {
		if (!armed) return;
		window.clearTimeout(dwell.current);
		dwell.current = window.setTimeout(() => setPeeked(true), PEEK_DWELL_MS);
	}, [armed]);
	const leave = useCallback(() => {
		window.clearTimeout(dwell.current);
		setPeeked(false);
	}, []);
	return { peeked, enter, leave };
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
	/** Raise the canvas window and leave. */
	canvas(): void;
	close(): void;
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
	const { reset, canvas, close } = candidate;
	if (typeof reset !== "function" || typeof canvas !== "function" || typeof close !== "function") return null;
	return {
		restored: candidate.restored === true,
		reset: () => reset.call(bridge),
		canvas: () => canvas.call(bridge),
		close: () => close.call(bridge),
	};
}

/** What a bar this wide carries. The frame's name is never one of the answers. */
export function barLayout(width: number): { project: boolean; size: boolean; canvasLabel: boolean } {
	const wide = width >= DESK_BAR_WIDE_PX;
	return { project: wide, size: wide, canvasLabel: wide };
}

/** How long the restore says so for before it fades, toast-length. */
export const DESK_RESTORED_MS = 2600;
