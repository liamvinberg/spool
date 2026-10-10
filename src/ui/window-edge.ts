import { createContext, type RefObject, useContext, useLayoutEffect } from "react";

/**
 * Where the window's left side ends: a canvas's left side, open at whatever width or
 * closed to its rail, and Home's sidebar on Home. The tab strip starts its run there,
 * so a project's sheet always lands on the canvas.
 *
 * The edge is read off the element as it lays out and handed straight to whoever
 * follows it, with no render between, so a side being dragged or opening carries the
 * tabs in the same frame. The last place to report owns it: a page that goes leaves
 * its edge standing until the next one reports, so a canvas still loading does not
 * pull the tabs to the window's edge and back.
 */
export interface WindowEdge {
	report(owner: object, at: number): void;
	/** `moved`: the edge is another place's now (Home's to a canvas's), not the same side resizing */
	follow(listener: (at: number, moved: boolean) => void): () => void;
}

export function windowEdge(): WindowEdge {
	let owner: object | null = null;
	let at: number | null = null;
	const listeners = new Set<(at: number, moved: boolean) => void>();
	return {
		report(by, next) {
			const moved = owner !== null && owner !== by;
			if (by === owner && next === at) return;
			owner = by;
			at = next;
			for (const listener of listeners) listener(next, moved);
		},
		follow(listener) {
			listeners.add(listener);
			if (at !== null) listener(at, false);
			return () => listeners.delete(listener);
		},
	};
}

export const WindowEdgeContext = createContext<WindowEdge | null>(null);

/** Report the right edge of `ref` as the window's left side, as long as it is mounted. */
export function useWindowEdge(ref: RefObject<HTMLElement | null>): void {
	const edge = useContext(WindowEdgeContext);
	useLayoutEffect(() => {
		const element = ref.current;
		if (edge === null || element === null) return;
		const report = () => edge.report(element, element.getBoundingClientRect().right);
		report();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(report);
		observer.observe(element);
		return () => observer.disconnect();
	}, [edge, ref]);
}
