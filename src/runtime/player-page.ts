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
