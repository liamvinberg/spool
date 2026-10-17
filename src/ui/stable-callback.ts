import { useCallback, useRef } from "react";

/**
 * A function that keeps one identity for the component's life and always runs the newest
 * `fn` it was rendered with (task 169).
 *
 * For a handler a memoised child holds: a fresh closure every render would make the child
 * draw again every time its parent did, which is what a turn's ticks and the canvas's hover
 * did to the whole pages tree. Call it from events and effects, not while rendering.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
	const latest = useRef(fn);
	latest.current = fn;
	return useCallback((...args: A) => latest.current(...args), []);
}
