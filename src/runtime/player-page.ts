import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What both of the player's pages do the same way (#227): measure the window,
 * and summon the edge bar.
 *
 * There are two pages because there are two documents — the control-origin tab
 * draws one around a render-origin iframe, and the bare render-origin document
 * draws one for itself — and they style themselves from different sheets. What
 * they must not differ on is behaviour, so the behaviour lives here and only
 * the markup is written twice.
 */

/** How long the cursor has to rest against the top edge before the bar peels in. */
export const DWELL_MS = 300;

/** The strip along the top of the viewport that asks for the bar. */
export const EDGE_PX = 8;

/**
 * How far down the pointer has to come before a revealed bar goes away — the
 * bar's own height plus room to be reaching for it rather than leaving it.
 */
export const KEEP_PX = 140;

/** Which document saw the pointer: the page around the frame, or the frame itself. */
export type PointerSource = "page" | "frame";

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
 * The edge bar's summons (#227), borrowed from the hidden macOS menu bar.
 *
 * At rest there is nothing over the page, which is the whole point of playing
 * in a tab: the prototype is the document. Resting the cursor against the top
 * edge for {@link DWELL_MS} peels the bar in; moving back down into the page
 * takes it away again at once.
 *
 * The dwell is what keeps the bar out of the way of the page's own nav. Every
 * report inside the strip restarts the timer, so only *resting* against the
 * edge finishes it — sliding along the top of the page never does. And passing
 * through on the way to the browser's own chrome ends with the pointer leaving
 * the document, which is what a null report means and what cancels the dwell.
 *
 * `y` is in window space, which is why what happens inside an embedded frame
 * has to be forwarded before it gets here.
 */
export function useEdgeBar(
	armed: boolean,
	held: boolean,
): { revealed: boolean; point: (y: number | null, source: PointerSource) => void } {
	const [revealed, setRevealed] = useState(false);
	const dwell = useRef(0);
	const heldRef = useRef(held);
	heldRef.current = held;
	const revealedRef = useRef(revealed);
	revealedRef.current = revealed;
	/**
	 * Which surface last said where the pointer is. A frame reports that it lost
	 * the pointer whenever the pointer leaves *it*, which on a capped page is
	 * every time the hand moves out onto the background beside the column — so
	 * that report only means "gone from the window" while the frame is also the
	 * one that last saw it. Whichever of the two arrives last is right.
	 */
	const from = useRef<PointerSource>("page");
	useEffect(() => () => window.clearTimeout(dwell.current), []);
	useEffect(() => {
		if (armed) return;
		window.clearTimeout(dwell.current);
		setRevealed(false);
	}, [armed]);
	const point = useCallback(
		(y: number | null, source: PointerSource) => {
			if (!armed) return;
			if (y === null) {
				if (source === "frame" && from.current !== "frame") return;
				window.clearTimeout(dwell.current);
				return;
			}
			from.current = source;
			if (y <= EDGE_PX) {
				// Resting is the ask, so every fresh report starts the wait over.
				window.clearTimeout(dwell.current);
				dwell.current = window.setTimeout(() => setRevealed(true), DWELL_MS);
				return;
			}
			window.clearTimeout(dwell.current);
			// An open switcher is a held conversation and outlives the pointer, and
			// a bar the hand is still reaching for is not one it has left.
			if (heldRef.current || y <= KEEP_PX) return;
			if (revealedRef.current) setRevealed(false);
		},
		[armed],
	);
	return { revealed, point };
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
export function deskBarLayout(width: number): { project: boolean; size: boolean; canvasLabel: boolean } {
	const wide = width >= DESK_BAR_WIDE_PX;
	return { project: wide, size: wide, canvasLabel: wide };
}

/** How long the restore says so for before it fades, toast-length. */
export const DESK_RESTORED_MS = 2600;
