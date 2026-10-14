import { type Dispatch, type SetStateAction, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { ProjectedPlaceholder } from "../../daemon/projection";
import type { Unseen } from "../../daemon/seen";
import { ROOT_PAGE } from "../../page-path";
import type { FlowEdge, Place, ProjectedFrame } from "../api";
import type { CanvasTool } from "./canvas-tools";
import type { HandEdit } from "./hand-edit";
import type { Staging } from "./history";
import type { PickedSelection } from "./overlays";
import { type PageObject, pageObjectsOn } from "./page-objects";
import { pageOf } from "./pages";

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
	/** the whole projection, every page's frames */
	frames: ProjectedFrame[];
	/** the frames on their way: designers' placeholders, drawn dashed where their frames will land (#369) */
	placeholders: readonly ProjectedPlaceholder[];
	/** where each page stands on the field holding it (#265), the whole project's */
	places: Readonly<Record<string, Place>>;
	/** the named pages on disk (#39) */
	pages: string[];
	/** the page the canvas shows */
	activePage: string;
	/** frames staged for the Trash, gone from the canvas while the toast stands */
	hidden: ReadonlySet<string>;
	/** pages staged for the Trash, with everything inside them (#229) */
	hiddenPages: ReadonlySet<string>;
	/** the frame that is live, whose document owns the pointer and the keyboard */
	entered: string | null;
	/** the in-place text edit that is open (#314), which is what hands the frame its pointer */
	editing: HandEdit | null;
	/** the tool picked (#321) */
	tool: CanvasTool;
	/** whether Space is held, which borrows the Hand */
	spaceDown: boolean;
	/** whether ⌘ is held, which borrows Edit in Select (#339) */
	accelDown: boolean;
	/** each frame's document's generation: a new one is a fresh boot */
	docNonces: Record<string, number>;
	/** frames whose current boot is a walk arrival (#28): quiet cover, no veil */
	walkArrivals: ReadonlySet<string>;
	/** the threads between frames (#34) */
	edges: FlowEdge[];
	/** the entry on the trash toast, until it commits (#23) */
	pendingTrash: Staging | null;
	/** frames marked read here whose read has not come back in the projection yet */
	read: ReadonlySet<string>;
	/** the right-click menu that is open */
	menu: CanvasContextMenu | null;
	/** the frames the export dialog is choosing a format for (#7) */
	exportDialog: readonly string[] | null;
	exporting: boolean;
	/** whether the frame finder (/) is open */
	finding: boolean;
}

export interface CanvasContextMenu {
	x: number;
	y: number;
	frame: string;
	selection: "frames" | "element";
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
	let state: CanvasState = {
		selected: [],
		picked: [],
		selectedPage: null,
		frames: [],
		placeholders: [],
		places: {},
		pages: [],
		activePage: ROOT_PAGE,
		hidden: new Set<string>(),
		hiddenPages: new Set<string>(),
		entered: null,
		editing: null,
		tool: "select",
		spaceDown: false,
		accelDown: false,
		docNonces: {},
		walkArrivals: new Set<string>(),
		edges: [],
		pendingTrash: null,
		read: new Set<string>(),
		menu: null,
		exportDialog: null,
		exporting: false,
		finding: false,
		...initial,
	};
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

/** One field's setter, for a field the component writes and never draws. */
export function useCanvasSetter<K extends keyof CanvasState>(
	store: CanvasStore,
	key: K,
): Dispatch<SetStateAction<CanvasState[K]>> {
	return useState(() => setterOf(store, key))[0];
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

/**
 * A value worked out from parts of the state, once for each set of parts
 * however many readers ask: the same parts hand back the same value, which is
 * what lets a reader select it. The first part is an object, and the memo
 * lives as long as it does.
 */
function derived<P extends readonly [object, ...unknown[]], R>(
	parts: (state: CanvasState) => P,
	work: (parts: P) => R,
): (state: CanvasState) => R {
	const memo = new WeakMap<object, { parts: P; value: R }>();
	return (state) => {
		const now = parts(state);
		const hit = memo.get(now[0]);
		if (hit?.parts.every((part, index) => Object.is(part, now[index]))) return hit.value;
		const value = work(now);
		memo.set(now[0], { parts: now, value });
		return value;
	};
}

/** The frames the canvas shows: the active page's, less any staged for the Trash. */
export const visibleFramesOf = derived(
	(state) => [state.frames, state.activePage, state.hidden] as const,
	([frames, page, hidden]) => frames.filter((frame) => pageOf(frame) === page && !hidden.has(frame.name)),
);

/** The placeholders on the active page. */
export const visiblePlaceholdersOf = derived(
	(state) => [state.placeholders, state.activePage] as const,
	([placeholders, page]) => placeholders.filter((one) => (one.page ?? ROOT_PAGE) === page),
);

/** Every frame not staged for the Trash, on any page. */
export const navigatorFramesOf = derived(
	(state) => [state.frames, state.hidden] as const,
	([frames, hidden]) => frames.filter((frame) => !hidden.has(frame.name)),
);

/** Every page not staged for the Trash. */
export const navigatorPagesOf = derived(
	(state) => [state.pages, state.hiddenPages] as const,
	([pages, hidden]) => pages.filter((page) => !hidden.has(page)),
);

/**
 * The pages standing on the field, composed from the projection (#265).
 *
 * Nothing is fetched and nothing is baked: every frame under a page is
 * already in hand with its geometry and its cover, so the picture is a read
 * of what this side holds and a frame edited two pages down redraws the
 * object above it as soon as the projection lands.
 */
export const pageObjectsOf: (state: CanvasState) => PageObject[] = derived(
	(state) =>
		[navigatorFramesOf(state), navigatorPagesOf(state), state.places, state.placeholders, state.activePage] as const,
	([frames, pages, places, placeholders, page]) => pageObjectsOn(page, pages, frames, places, placeholders),
);

/** The tool in hand: Space borrows the Hand for as long as it is held. */
export const toolOf = (state: Pick<CanvasState, "tool" | "spaceDown">): CanvasTool =>
	state.spaceDown ? "hand" : state.tool;

/**
 * What nobody has looked at (seen.ts), as the projection says minus what this
 * canvas has just cleared.
 */
export const unseenOf = derived(
	(state) => [state.frames, state.read] as const,
	([frames, read]) => {
		const marks = new Map<string, Unseen>();
		for (const frame of frames) {
			if (frame.unseen !== undefined && !read.has(frame.name)) marks.set(frame.name, frame.unseen);
		}
		return marks;
	},
);
