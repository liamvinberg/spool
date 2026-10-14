import { type Dispatch, type SetStateAction, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { PickedSelection } from "./overlays";

/**
 * What the canvas holds, kept outside React (DEV-304).
 *
 * Every handler of the canvas used to read this through a ref mirrored from
 * state at each render (`selectedRef.current = selected`), so a value lived
 * twice and the copy a handler read was a render behind the one it had just
 * written. Here it lives once: a handler reads `get()` and sees what the last
 * `set` wrote, and a component reads it with `useCanvasState`, rendering only
 * when what it selected changed.
 */
export interface CanvasState {
	/** the frames held out on the canvas */
	selected: string[];
	/** the elements held inside frames */
	picked: PickedSelection[];
	/** the page object held, which is never held with frames */
	selectedPage: string | null;
}

export interface CanvasStore {
	/** The state as the last `set` left it: what every handler reads. */
	get(): CanvasState;
	/**
	 * Change part of the state, from a patch or from the state as it stands.
	 * Nothing is told when every value in the patch is the one already held.
	 */
	set(patch: Partial<CanvasState> | ((state: CanvasState) => Partial<CanvasState>)): void;
	/** Hear every change. Returns the unsubscribe. */
	subscribe(listener: () => void): () => void;
}

export function createCanvasStore(initial: Partial<CanvasState> = {}): CanvasStore {
	let state: CanvasState = { selected: [], picked: [], selectedPage: null, ...initial };
	const listeners = new Set<() => void>();
	return {
		get: () => state,
		set(patch) {
			const next = typeof patch === "function" ? patch(state) : patch;
			const keys = Object.keys(next) as (keyof CanvasState)[];
			if (keys.every((key) => Object.is(next[key], state[key]))) return;
			state = { ...state, ...next };
			for (const listener of [...listeners]) listener();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/**
 * Read part of the canvas's state, rendering again only when it changes.
 *
 * `select` must hand back the same value for the same state (a field, or a
 * value derived once per input), or every change re-renders the reader. The
 * render is asked for at the priority of whatever set the state, as a
 * `useState` setter's is, so a gesture that sets this and React state alike
 * is still drawn in one render.
 */
export function useCanvasState<T>(store: CanvasStore, select: (state: CanvasState) => T): T {
	const [, rerender] = useReducer((count: number) => count + 1, 0);
	const value = select(store.get());
	const latest = useRef({ select, value });
	const check = useRef(() => {
		const { select, value } = latest.current;
		if (!Object.is(select(store.get()), value)) rerender();
	});
	useLayoutEffect(() => {
		latest.current = { select, value };
		// a set between this render and its commit
		check.current();
	});
	useLayoutEffect(() => store.subscribe(() => check.current()), [store]);
	return value;
}

/** One field, read and written the way `useState` reads and writes it. */
export function useCanvasField<K extends keyof CanvasState>(
	store: CanvasStore,
	key: K,
): [CanvasState[K], Dispatch<SetStateAction<CanvasState[K]>>] {
	const value = useCanvasState(store, (state) => state[key]);
	const [set] = useState(() => setterOf(store, key));
	return [value, set];
}

/** A `useState`-shaped setter for one field. */
export function setterOf<K extends keyof CanvasState>(
	store: CanvasStore,
	key: K,
): Dispatch<SetStateAction<CanvasState[K]>> {
	return (action) =>
		store.set((state) => {
			const next =
				typeof action === "function" ? (action as (was: CanvasState[K]) => CanvasState[K])(state[key]) : action;
			return { [key]: next } as unknown as Partial<CanvasState>;
		});
}
