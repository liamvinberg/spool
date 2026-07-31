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

/** Stillness this long puts the pill away; movement anywhere brings it back. */
export const IDLE_MS = 2000;

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
 * The chrome's pulse (#60): while armed, stillness longer than IDLE_MS puts it
 * to sleep and movement wakes it; unarmed, it is simply always awake. The wake
 * listener sits on the stage, never inside a screen — the prototype has no
 * listener there to race (the parity law at the input layer).
 */
export function useWake(armed: boolean): { awake: boolean; wake: () => void } {
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
		wake: () => {
			if (!armed) return;
			setAwake(true);
			window.clearTimeout(timer.current);
			timer.current = window.setTimeout(() => setAwake(false), IDLE_MS);
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
