import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What both of the player's stages do the same way (#210): measure the window,
 * sleep on stillness, and fill the screen.
 *
 * There are two stages because there are two documents — the standalone
 * `/play/` page draws its own, and inline play draws one on the canvas — and
 * they style themselves from different sheets. What they must not differ on is
 * behaviour, so the behaviour lives here and only the markup is written twice.
 */

/** How long the pill stays up on arrival before it gets out of the way. */
export const IDLE_MS = 2000;

/**
 * How close to the bottom of the screen the pointer has to come to bring the
 * pill back — the strip it lives in, plus room to be heading for it.
 */
export const REACH_PX = 120;

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
 * The chrome's pulse (#60), on proximity rather than on stillness.
 *
 * Waking on any movement was wrong: a prototype is used by moving the pointer,
 * so the pill was up the whole time you were using one, sitting on top of
 * whatever the frame draws along its own bottom edge. Stillness never comes
 * while you are working, which is exactly when the chrome has to be gone.
 *
 * So it shows itself once on arrival, gets out of the way, and comes back only
 * when the pointer comes down to where it lives — the way a video player's
 * controls do. Reaching for a control by moving toward it needs no key and
 * nothing explained. `y` is in window space, which is why what is inside the
 * frame has to be converted before it gets here.
 */
export function useWake(armed: boolean): { awake: boolean; wake: (y: number) => void } {
	const [awake, setAwake] = useState(true);
	const timer = useRef(0);
	useEffect(() => {
		if (!armed) {
			setAwake(true);
			return;
		}
		timer.current = window.setTimeout(() => setAwake(false), IDLE_MS);
		return () => window.clearTimeout(timer.current);
	}, [armed]);
	return {
		awake,
		wake: (y: number) => {
			if (!armed) return;
			// The first movement ends the arrival grace whichever way it goes: it
			// either brought the pointer down here, or it proved the hand is busy
			// somewhere else and the pill has no business staying up.
			window.clearTimeout(timer.current);
			setAwake(window.innerHeight - y <= REACH_PX);
		},
	};
}

/**
 * Fill the screen with `element`, or leave fullscreen if anything holds it.
 * The request needs transient activation and can be refused outright — a
 * rejected promise is the browser saying no, not an error the player has
 * anything to add to.
 */
export function toggleFullscreen(element: () => Element | null): void {
	if (document.fullscreenElement != null) {
		void document.exitFullscreen().catch(() => {});
		return;
	}
	void (element() as HTMLElement | null)?.requestFullscreen?.().catch(() => {});
}

/** Whether anything on this document is currently filling the screen. */
export function useFullscreen(element: () => Element | null): { on: boolean; toggle: () => void } {
	const [on, setOn] = useState(() => document.fullscreenElement != null);
	useEffect(() => {
		const sync = () => setOn(document.fullscreenElement != null);
		document.addEventListener("fullscreenchange", sync);
		return () => document.removeEventListener("fullscreenchange", sync);
	}, []);
	const held = useRef(element);
	held.current = element;
	const toggle = useCallback(() => toggleFullscreen(() => held.current()), []);
	return { on, toggle };
}
