import { useCallback, useEffect, useState } from "react";

/**
 * The one piece of state every take on this page shares: which variation of the
 * frame is showing, and the keys that move it.
 *
 * It is deliberately an index rather than a name. Cycling is the gesture half
 * these takes are arguing about, and an index is the only shape in which "the
 * next one" and "wrap at the end" are the same thought.
 */
export interface Cycle {
	readonly index: number;
	readonly go: (index: number) => void;
	readonly next: () => void;
	readonly prev: () => void;
}

export function useCycle(length: number, initial = 0): Cycle {
	const [index, setIndex] = useState(initial);
	const go = useCallback((to: number) => setIndex(((to % length) + length) % length), [length]);
	const next = useCallback(() => setIndex((current) => (current + 1) % length), [length]);
	const prev = useCallback(() => setIndex((current) => (current - 1 + length) % length), [length]);
	return { index, go, next, prev };
}

/** a window key, bound for as long as the frame is on screen */
export function useKey(key: string, run: () => void, on = true): void {
	useEffect(() => {
		if (!on) return;
		const handle = (event: KeyboardEvent) => {
			if (event.key !== key) return;
			event.preventDefault();
			run();
		};
		window.addEventListener("keydown", handle);
		return () => window.removeEventListener("keydown", handle);
	}, [key, run, on]);
}

/** ← and → on the selection, which is what every take here means by cycling */
export function useArrows(cycle: Cycle, on = true): void {
	useKey("ArrowRight", cycle.next, on);
	useKey("ArrowLeft", cycle.prev, on);
}
