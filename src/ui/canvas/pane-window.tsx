import type { MouseEvent as ReactMouseEvent, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";
import { attachHotkeyLayer, type HotkeyHandler } from "../hotkey-dispatch";
import { type HotkeyIdFor, hotkeyKey } from "../hotkeys";
import { useRemembered } from "../remembered";
import { MenuItem } from "./context-menu";
import type { PaletteCommand } from "./find-palette";
import {
	type Action,
	check,
	type Drop,
	defaultLayout,
	type Env,
	fitWindow,
	isLayout,
	type Layout,
	LIMITS,
	maxWidth,
	other,
	panesOf,
	RAIL_WIDTH,
	reduce,
	resizeSplit,
	type SideId,
	sideMin,
	stackHeights,
	type Verdict,
	whereIs,
} from "./pane-layout";
import { PANE_VERB, PaneMark, type PaneMarkKind, SidebarIcon } from "./pane-tabs";
import { STRIP_WIDTH, useRailDrag } from "./rail-width";

/**
 * The canvas window's two sides (#359): the canvas in the middle, and on each
 * hand of it a stack of groups of panes, flush with the window's edge. An open
 * side's header is its first group's tab row, with the side's close at its
 * outer end; a closed side is a rail of its panes' icons, the first standing
 * where the close was. Where a pane stands is `pane-layout.ts`; this file
 * draws it and owns the gestures.
 *
 * Every pane is rendered once, into a node of its own that is moved into the
 * slot its side gives it, so a pane behind another tab, on a closed side or
 * carried to the other side keeps its state, its drafts and its scroll.
 */

export interface PaneContext {
	readonly side: SideId;
	/** the side's settled width, which the pane is laid out at whatever the side's edge is doing */
	readonly width: number;
	readonly visible: boolean;
}

/** One pane: adding a pane to the window is one more of these. */
export interface PaneDef {
	readonly id: string;
	readonly title: string;
	readonly icon: ReactNode;
	readonly hotkey: HotkeyIdFor<"panes">;
	readonly render: (context: PaneContext) => ReactNode;
	/** where its key puts the caret; the first control in it when left out */
	readonly focus?: ((body: HTMLElement) => void) | undefined;
	/** a turn in flight: rides its tab or rail icon while the pane is out of sight, and leaves a mark when it lands there */
	readonly working?: boolean | undefined;
	/**
	 * Something elsewhere in the pane has news: for the agent, another chat runs, waits on a
	 * person or landed unread (#364). One small dot on its tab or rail icon, in sight or not.
	 */
	readonly elsewhere?: boolean | undefined;
	/**
	 * Something in the pane stopped and only a person can move it: for the agent, a turn
	 * waiting on an answer (#366). Its tab or rail icon wears the waiting mark, in sight or not.
	 */
	readonly waiting?: boolean | undefined;
}

const STORAGE_KEY = "panes.layout";
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
/** a side widening or closing */
const WIDEN_MS = 200;
/** tabs and rail trading places, and one pane's body for another's */
const FADE_MS = 160;
/** the layout taking its new shape after a drop */
const DROP_MS = 200;
/** the drop mark gliding between targets */
const GLIDE_MS = 150;
/** a press travels this far before it is a drag */
const SLOP = 4;
/** a side's header, and a split group's own smaller tab row */
const HEAD_H = 36;
const ROW_H = 32;
/** the drop line between tabs */
const CARET_H = 20;

const REASON: Record<Exclude<Verdict, "ok" | "noop">, string> = {
	cap: "3 groups a side",
	height: "a group needs 160px",
	floor: "the canvas keeps 480px",
};

const SIDE_NAME: Record<SideId, string> = { left: "Left", right: "Right" };

/* ── what a pane hands its tab row, and the palette ─────────────────── */

/** undefined: not in a pane at all, so actions draw where they stand */
const PaneSlot = createContext<HTMLElement | null | undefined>(undefined);

/** A pane's own verbs, drawn into its tab row while it is the lit tab. */
export function PaneActions({ children }: { children: ReactNode }) {
	const slot = useContext(PaneSlot);
	if (slot === undefined) return <div className="flex items-center">{children}</div>;
	return slot === null ? null : createPortal(children, slot);
}

const PaneCommands = createContext<readonly PaletteCommand[]>([]);

/** the layout's commands, for the ⌘K palette */
export function usePaneCommands(): readonly PaletteCommand[] {
	return useContext(PaneCommands);
}

/* ── geometry ───────────────────────────────────────────────────────── */

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

const inset = (box: Box, by: number): Box => ({ x: box.x + by, y: box.y + by, w: box.w - by * 2, h: box.h - by * 2 });
const inside = (box: Box, x: number, y: number) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
const boxOf = (element: Element): Box => {
	const rect = element.getBoundingClientRect();
	return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
};
const sameDrop = (a: Drop | null, b: Drop | null) => JSON.stringify(a) === JSON.stringify(b);
const parseAt = (value: string | undefined): { side: SideId; group: number } => {
	const [side, group] = (value ?? "left:0").split(":");
	return { side: side === "right" ? "right" : "left", group: Number(group) || 0 };
};

interface Zones {
	rows: { side: SideId; group: number; box: Box; tabs: Box[] }[];
	bodies: { side: SideId; group: number; box: Box }[];
	/** a closed side's rail, or an empty side's strip, while something is carried */
	edges: { side: SideId; box: Box; count: number }[];
}

interface Dragging {
	pane: string;
	origin: Box;
	grab: { x: number; y: number };
	zones: Zones;
	base: Layout;
	env: Env;
	target: Drop | null;
	point: { x: number; y: number };
}

/** Web Animations where the document has them; a document without them just lands */
function animate(
	element: Element | null | undefined,
	keyframes: Keyframe[],
	options: KeyframeAnimationOptions,
): Animation | null {
	if (element === null || element === undefined || typeof element.animate !== "function") return null;
	return element.animate(keyframes, options);
}

function useReducedMotion(): boolean {
	const query = typeof window === "undefined" ? undefined : window.matchMedia?.("(prefers-reduced-motion: reduce)");
	const [reduced, setReduced] = useState(query?.matches === true);
	useEffect(() => {
		if (query === undefined) return;
		const change = () => setReduced(query.matches);
		query.addEventListener?.("change", change);
		return () => query.removeEventListener?.("change", change);
	}, [query]);
	return reduced;
}

/* ── the window ─────────────────────────────────────────────────────── */

export function PaneWindow({
	panes,
	reveal,
	children,
	onShown,
}: {
	panes: readonly PaneDef[];
	/** show this pane whenever the key changes: the agent asked for from elsewhere */
	reveal?: { readonly pane: string; readonly key: string } | undefined;
	/** the canvas */
	children?: ReactNode;
	/** which panes are on screen, said whenever that changes */
	onShown?: ((panes: readonly string[]) => void) | undefined;
}) {
	// the registry is rebuilt on every render of its owner; what it is made of changes far less often
	const shape = panes.map((pane) => `${pane.id}:${pane.hotkey}:${pane.title}`).join("|");
	const idsKey = panes.map((pane) => pane.id).join("|");
	const ids = useMemo(() => idsKey.split("|"), [idsKey]);
	const byId = new Map(panes.map((pane) => [pane.id, pane]));
	const registry = useRef(panes);
	registry.current = panes;
	const guard = useMemo(() => isLayout(ids), [ids]);
	const [layout, setLayout] = useRemembered<Layout>(STORAGE_KEY, defaultLayout(), guard);
	const reduced = useReducedMotion();

	const root = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);
	const ghost = useRef<HTMLDivElement>(null);
	const mark = useRef<HTMLDivElement>(null);
	const markWords = useRef<HTMLSpanElement>(null);

	/** null until measured, and in a document with no layout at all: nothing closes for a window nobody has */
	const [env, setEnv] = useState<Env | null>(null);
	const fits = fitWindow(layout, env ?? { width: Number.MAX_SAFE_INTEGER, height: 0 });
	const height = env?.height ?? 0;
	const visible = [...fits.left.shown, ...fits.right.shown];
	const visibleKey = visible.join("|");

	const shownCallback = useRef(onShown);
	shownCallback.current = onShown;
	useEffect(() => {
		shownCallback.current?.(visibleKey === "" ? [] : visibleKey.split("|"));
	}, [visibleKey]);

	/** the pane being carried, which is all the drag draws through React: the empty sides' strips */
	const [carried, setCarried] = useState<string | null>(null);
	const [menu, setMenu] = useState<{ pane: string; x: number; y: number } | null>(null);
	const [live, setLive] = useState<Record<SideId, number | null>>({ left: null, right: null });
	const [splitting, setSplitting] = useState(false);
	const [unread, setUnread] = useState<ReadonlySet<string>>(new Set());

	const latest = useRef({ layout, env });
	latest.current.env = env;
	latest.current.layout = layout;

	useLayoutEffect(() => {
		const element = body.current;
		if (element === null) return;
		const measure = () =>
			setEnv(element.clientWidth > 0 ? { width: element.clientWidth, height: element.clientHeight } : null);
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	/* ── each pane's own node, moved between slots ──────────────────── */

	const nodes = useRef(new Map<string, HTMLDivElement>());
	const nodeOf = (pane: string) => {
		let node = nodes.current.get(pane);
		if (node === undefined) {
			node = document.createElement("div");
			node.className = "absolute inset-0";
			nodes.current.set(pane, node);
		}
		return node;
	};
	const slotRefs = useRef(new Map<string, (element: HTMLDivElement | null) => void>());
	const slotRef = (pane: string) => {
		let ref = slotRefs.current.get(pane);
		if (ref === undefined) {
			ref = (element) => {
				const node = nodeOf(pane);
				if (element !== null && node.parentElement !== element) element.append(node);
			};
			slotRefs.current.set(pane, ref);
		}
		return ref;
	};
	const parking = useRef<HTMLDivElement>(null);
	// a pane the layout does not place waits out of sight, still mounted
	useLayoutEffect(() => {
		for (const pane of ids) {
			if (whereIs(layout, pane) !== null) continue;
			const node = nodeOf(pane);
			if (parking.current !== null && node.parentElement !== parking.current) parking.current.append(node);
		}
	});

	/** where each pane's verbs are drawn: a place in its group's tab row */
	const [verbSlots, setVerbSlots] = useState<Readonly<Record<string, HTMLElement | null>>>({});
	const verbRefs = useRef(new Map<string, (element: HTMLDivElement | null) => void>());
	const verbRef = (pane: string) => {
		let ref = verbRefs.current.get(pane);
		if (ref === undefined) {
			ref = (element) => setVerbSlots((was) => (was[pane] === element ? was : { ...was, [pane]: element }));
			verbRefs.current.set(pane, ref);
		}
		return ref;
	};

	/* ── motion on a change of shape ─────────────────────────────────── */

	/** where every tab stood before a drop, and the box a new group grows out of */
	const flip = useRef<{ rects: Map<string, Box>; spawn: { key: string; box: Box } | null } | null>(null);
	/** until when the groups and slots glide to new places rather than jump */
	const glideUntil = useRef(0);

	const capture = (extra?: Map<string, Box>, spawn?: { key: string; box: Box } | null) => {
		const rects = new Map<string, Box>();
		for (const tab of root.current?.querySelectorAll<HTMLElement>("[data-pane-tab]") ?? [])
			rects.set(tab.dataset.paneTab ?? "", boxOf(tab));
		for (const [key, box] of extra ?? []) rects.set(key, box);
		flip.current = { rects, spawn: spawn ?? null };
		glideUntil.current = performance.now() + DROP_MS + 50;
	};

	useLayoutEffect(() => {
		const pending = flip.current;
		flip.current = null;
		const element = root.current;
		if (pending === null || element === null || reduced) return;
		// a tab that moved slides from where it stood, or from where it was let go
		for (const tab of element.querySelectorAll<HTMLElement>("[data-pane-tab]")) {
			const was = pending.rects.get(tab.dataset.paneTab ?? "");
			if (was === undefined) continue;
			const at = boxOf(tab);
			const dx = was.x - at.x;
			const dy = was.y - at.y;
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
			animate(tab, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
				duration: DROP_MS,
				easing: EASE,
			});
		}
		// a group new to a side grows out of the box it was dropped on
		const spawn = pending.spawn;
		if (spawn === null) return;
		const slot = element.querySelector<HTMLElement>(`[data-pane-slot="${spawn.key}"]`);
		const row = element.querySelector<HTMLElement>(`[data-pane-group-key="${spawn.key}"]`);
		const stack = slot?.parentElement;
		if (slot === null || row === null || stack === null || stack === undefined) return;
		const top = spawn.box.y - boxOf(stack).y;
		const options = { duration: DROP_MS, easing: EASE };
		animate(
			slot,
			[
				{ top: `${top}px`, height: `${spawn.box.h}px`, opacity: 0 },
				{ top: slot.style.top, height: slot.style.height, opacity: 1 },
			],
			options,
		);
		animate(
			row,
			[
				{ transform: `translateY(${top - row.offsetTop}px)`, opacity: 0 },
				{ transform: "none", opacity: 1 },
			],
			options,
		);
	});

	/* ── acting on the layout ────────────────────────────────────────── */

	const focusNext = useRef<string | null>(null);

	const apply = (action: Action, options: { focus?: string; flip?: boolean } = {}) => {
		const was = latest.current.layout;
		const next = reduce(was, action, latest.current.env ?? undefined);
		if (options.focus !== undefined) focusNext.current = options.focus;
		if (next === was) {
			if (options.focus !== undefined) focusPane(options.focus);
			return;
		}
		if (options.flip === true) capture();
		latest.current.layout = next;
		setLayout(next);
	};

	const focusPane = (pane: string) => {
		focusNext.current = null;
		requestAnimationFrame(() => {
			const element = root.current?.querySelector<HTMLElement>(`[data-pane-body="${pane}"]`);
			if (element === null || element === undefined) return;
			const def = byId.get(pane);
			if (def?.focus !== undefined) def.focus(element);
			else element.querySelector<HTMLElement>("button, input, textarea, [tabindex]")?.focus({ preventScroll: true });
		});
	};

	// a pane shown by its key takes the caret once it stands where it goes
	useLayoutEffect(() => {
		if (focusNext.current !== null) focusPane(focusNext.current);
	});

	const showPane = (pane: string, focus: boolean) => apply({ type: "show", pane }, focus ? { focus: pane } : {});
	const toggleSide = (id: SideId) => {
		const { layout: now, env: at } = latest.current;
		const open = at === null ? now[id].open : fitWindow(now, at)[id].open;
		apply({ type: "open", side: id, open: !open });
	};
	const moveTo = (pane: string, to: Drop) => apply({ type: "move", pane, to }, { flip: true });

	const acts = useRef({ showPane, toggleSide });
	acts.current = { showPane, toggleSide };

	// biome-ignore lint/correctness/useExhaustiveDependencies: the shape is the registry's keys
	useEffect(() => {
		const handlers: Partial<Record<HotkeyIdFor<"panes">, HotkeyHandler>> = {
			"panes.left": (event) => {
				event?.preventDefault();
				acts.current.toggleSide("left");
			},
			"panes.right": (event) => {
				event?.preventDefault();
				acts.current.toggleSide("right");
			},
		};
		for (const pane of registry.current) {
			handlers[pane.hotkey] = (event) => {
				event?.preventDefault();
				acts.current.showPane(pane.id, true);
			};
		}
		return attachHotkeyLayer({ scope: "panes", handlers });
	}, [shape]);

	const revealKey = reveal?.key;
	const revealPane = reveal?.pane;
	// biome-ignore lint/correctness/useExhaustiveDependencies: one show per request, not one per render
	useEffect(() => {
		if (revealKey !== undefined && revealPane !== undefined) acts.current.showPane(revealPane, false);
	}, [revealKey]);

	/* ── what a pane out of sight has to say ─────────────────────────── */

	const working = useRef(new Map<string, boolean>());
	const workingKey = panes.map((pane) => `${pane.id}:${pane.working === true}`).join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: the key is the set
	useEffect(() => {
		const landed: string[] = [];
		for (const pane of panes) {
			const was = working.current.get(pane.id) === true;
			const is = pane.working === true;
			working.current.set(pane.id, is);
			if (was && !is && !visible.includes(pane.id)) landed.push(pane.id);
		}
		if (landed.length > 0) setUnread((was) => new Set([...was, ...landed]));
	}, [workingKey]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the key is the set
	useEffect(() => {
		setUnread((was) =>
			visible.some((pane) => was.has(pane)) ? new Set([...was].filter((pane) => !visible.includes(pane))) : was,
		);
	}, [visibleKey]);

	/** what rides a pane's tab or rail icon: waiting and news elsewhere always, a turn only out of sight */
	const markOf = (def: PaneDef, seen: boolean): PaneMarkKind | null =>
		def.waiting === true
			? "waiting"
			: !seen && def.working === true
				? "working"
				: !seen && unread.has(def.id)
					? "unread"
					: def.elsewhere === true
						? "elsewhere"
						: null;
	const labelOf = (def: PaneDef, kind: PaneMarkKind | null) =>
		kind === "waiting"
			? `${def.title}, waiting on you`
			: kind === "working"
				? `${def.title}, working`
				: kind === "unread"
					? `${def.title}, new reply`
					: kind === "elsewhere"
						? `${def.title}, another chat has news`
						: def.title;

	/* ── the drag ────────────────────────────────────────────────────── */

	const dragging = useRef<Dragging | null>(null);
	const clickEaten = useRef(false);
	const settling = useRef(false);

	const measureZones = (): Zones => {
		const zones: Zones = { rows: [], bodies: [], edges: [] };
		const element = root.current;
		if (element === null) return zones;
		for (const row of element.querySelectorAll<HTMLElement>("[data-drop-row]")) {
			if (row.closest("[inert]") !== null) continue;
			const at = parseAt(row.dataset.dropRow);
			const tabs = [...row.querySelectorAll<HTMLElement>("[data-pane-tab]")].map(boxOf);
			zones.rows.push({ ...at, box: boxOf(row), tabs });
		}
		for (const zone of element.querySelectorAll<HTMLElement>("[data-drop-body]")) {
			if (zone.closest("[inert]") !== null) continue;
			zones.bodies.push({ ...parseAt(zone.dataset.dropBody), box: boxOf(zone) });
		}
		for (const edge of element.querySelectorAll<HTMLElement>("[data-drop-edge]")) {
			if (edge.hasAttribute("inert")) continue;
			const side = edge.dataset.dropEdge === "right" ? "right" : "left";
			zones.edges.push({ side, box: boxOf(edge), count: latest.current.layout[side].groups[0]?.tabs.length ?? 0 });
		}
		return zones;
	};

	const hit = (d: Dragging, x: number, y: number): Drop | null => {
		for (const row of d.zones.rows) {
			if (!inside(row.box, x, y)) continue;
			const index = row.tabs.filter((tab) => tab.x + tab.w / 2 < x).length;
			return { kind: "row", side: row.side, group: row.group, index };
		}
		for (const edge of d.zones.edges) {
			if (inside(edge.box, x, y)) return { kind: "row", side: edge.side, group: 0, index: edge.count };
		}
		for (const zone of d.zones.bodies) {
			if (!inside(zone.box, x, y)) continue;
			return {
				kind: "split",
				side: zone.side,
				group: zone.group,
				where: y < zone.box.y + zone.box.h / 2 ? "above" : "below",
			};
		}
		return null;
	};

	/** what the drop mark covers: a line between tabs, half a pane, or a whole edge */
	const boxFor = (d: Dragging, target: Drop): { box: Box; line: boolean } => {
		if (target.kind === "split") {
			const zone = d.zones.bodies.find(
				(candidate) => candidate.side === target.side && candidate.group === target.group,
			);
			if (zone === undefined) return { box: { x: 0, y: 0, w: 0, h: 0 }, line: false };
			const half = zone.box.h / 2;
			return {
				box: inset({ ...zone.box, y: target.where === "above" ? zone.box.y : zone.box.y + half, h: half }, 6),
				line: false,
			};
		}
		const row = d.zones.rows.find((candidate) => candidate.side === target.side && candidate.group === target.group);
		if (row === undefined) {
			const edge = d.zones.edges.find((candidate) => candidate.side === target.side);
			return { box: edge === undefined ? { x: 0, y: 0, w: 0, h: 0 } : inset(edge.box, 4), line: false };
		}
		const at = row.tabs[target.index];
		const last = row.tabs[row.tabs.length - 1];
		const x = at !== undefined ? at.x - 1 : last !== undefined ? last.x + last.w + 1 : row.box.x + 12;
		return { box: { x: x - 1, y: row.box.y + (row.box.h - CARET_H) / 2, w: 2, h: CARET_H }, line: true };
	};

	const placeMark = (place: { box: Box; line: boolean } | null, refused: string | null) => {
		const element = mark.current;
		if (element === null) return;
		if (place === null) {
			element.style.opacity = "0";
			delete element.dataset.shown;
			return;
		}
		const fresh = element.dataset.shown === undefined;
		// a mark that comes out of nowhere starts where it is aimed rather than gliding there
		const glides = element.style.transition;
		if (fresh) element.style.transition = "none";
		const { box, line } = place;
		element.style.left = `${box.x}px`;
		element.style.top = `${box.y}px`;
		element.style.width = `${box.w}px`;
		element.style.height = `${box.h}px`;
		if (refused === null) delete element.dataset.refused;
		else element.dataset.refused = "";
		if (line) element.dataset.line = "";
		else delete element.dataset.line;
		if (markWords.current !== null) markWords.current.textContent = refused === null ? "" : `no room: ${refused}`;
		if (fresh) {
			void element.offsetWidth;
			element.style.transition = glides;
		}
		element.style.opacity = "1";
		element.dataset.shown = "";
	};

	const aim = (d: Dragging, target: Drop | null) => {
		const verdict = target === null ? null : check(d.base, d.pane, target, d.env);
		const aimed = verdict === null || verdict === "noop" ? null : target;
		d.target = aimed;
		if (aimed === null || verdict === null || verdict === "noop") {
			placeMark(null, null);
			return;
		}
		if (verdict === "ok") {
			placeMark(boxFor(d, aimed), null);
			return;
		}
		// a refusal says why where there is room to read it: over the pane or the edge it aimed at
		const zone =
			d.zones.bodies.find((candidate) => candidate.side === aimed.side && candidate.group === aimed.group) ??
			d.zones.edges.find((candidate) => candidate.side === aimed.side);
		placeMark(zone === undefined ? boxFor(d, aimed) : { box: inset(zone.box, 6), line: false }, REASON[verdict]);
	};

	const moveGhost = (d: Dragging) => {
		const element = ghost.current;
		if (element === null) return;
		const x = Math.min(Math.max(d.point.x + 10, 4), window.innerWidth - element.offsetWidth - 4);
		element.style.transform = `translate(${x}px, ${d.point.y + 8}px)`;
	};

	const endDrag = () => {
		if (root.current !== null) delete root.current.dataset.dragging;
		placeMark(null, null);
	};

	const cancel = () => {
		const d = dragging.current;
		if (d === null) return;
		dragging.current = null;
		endDrag();
		const element = ghost.current;
		if (element === null || reduced) {
			setCarried(null);
			return;
		}
		// the ghost goes back to the tab it was lifted from, and fades there
		settling.current = true;
		const home = `translate(${d.origin.x}px, ${d.origin.y}px)`;
		const back = animate(element, [{ transform: element.style.transform }, { transform: home }], {
			duration: DROP_MS,
			easing: EASE,
			fill: "forwards",
		});
		animate(element.firstElementChild, [{ opacity: 1 }, { opacity: 0 }], {
			duration: DROP_MS,
			easing: EASE,
			fill: "forwards",
		});
		const landed = () => {
			settling.current = false;
			setCarried(null);
		};
		if (back === null) landed();
		else back.onfinish = landed;
	};

	const drop = () => {
		const d = dragging.current;
		if (d === null) return;
		const target = hit(d, d.point.x, d.point.y);
		if (target === null || check(d.base, d.pane, target, d.env) !== "ok") {
			cancel();
			return;
		}
		dragging.current = null;
		const extra = new Map<string, Box>();
		// the moved tab slides in from where the ghost was let go
		if (ghost.current !== null) extra.set(d.pane, boxOf(ghost.current.firstElementChild ?? ghost.current));
		const spawn = target.kind === "split" ? { key: d.pane, box: boxFor(d, target).box } : null;
		capture(extra, spawn);
		endDrag();
		const next = reduce(d.base, { type: "move", pane: d.pane, to: target }, d.env);
		latest.current.layout = next;
		setLayout(next);
		setCarried(null);
	};

	const press = (pane: string, event: ReactPointerEvent<HTMLElement>) => {
		if (event.button !== 0 || settling.current || dragging.current !== null) return;
		const source = event.currentTarget;
		const pointerId = event.pointerId;
		const start = { x: event.clientX, y: event.clientY };
		clickEaten.current = false;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || dragging.current === null) return;
			e.preventDefault();
			e.stopPropagation();
			stop();
			cancel();
		};
		const move = (e: PointerEvent) => {
			if (e.pointerId !== pointerId) return;
			const d = dragging.current;
			if (d === null) {
				if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < SLOP) return;
				dragging.current = {
					pane,
					origin: boxOf(source),
					grab: { x: start.x, y: start.y },
					zones: measureZones(),
					base: latest.current.layout,
					env: latest.current.env ?? { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER },
					target: null,
					point: { x: e.clientX, y: e.clientY },
				};
				clickEaten.current = true;
				// captured, so a pointer crossing a frame's document is still ours
				try {
					source.setPointerCapture(pointerId);
				} catch {
					// a pointer the platform no longer tracks: the window's own listeners still follow it
				}
				window.addEventListener("keydown", onKey, true);
				setMenu(null);
				if (root.current !== null) root.current.dataset.dragging = "";
				setCarried(pane);
				return;
			}
			d.point = { x: e.clientX, y: e.clientY };
			const target = hit(d, d.point.x, d.point.y);
			if (!sameDrop(target, d.target)) aim(d, target);
			moveGhost(d);
		};
		const stop = () => {
			window.removeEventListener("pointermove", move, true);
			window.removeEventListener("pointerup", up, true);
			window.removeEventListener("pointercancel", lost, true);
			window.removeEventListener("keydown", onKey, true);
		};
		const up = (e: PointerEvent) => {
			if (e.pointerId !== pointerId) return;
			stop();
			if (dragging.current !== null) drop();
		};
		const lost = (e: PointerEvent) => {
			if (e.pointerId !== pointerId) return;
			stop();
			cancel();
		};
		window.addEventListener("pointermove", move, true);
		window.addEventListener("pointerup", up, true);
		window.addEventListener("pointercancel", lost, true);
	};

	// once lifted, the empty sides show their strips: measure again with them standing
	// biome-ignore lint/correctness/useExhaustiveDependencies: measured once per lift
	useLayoutEffect(() => {
		const d = dragging.current;
		if (carried === null || d === null) return;
		d.zones = measureZones();
		moveGhost(d);
	}, [carried]);

	/** a click that ended a drag is not a click */
	const picked = (run: () => void) => {
		if (clickEaten.current) {
			clickEaten.current = false;
			return;
		}
		run();
	};

	/* ── the edges ───────────────────────────────────────────────────── */

	const edge = (id: SideId) => ({
		width: fits[id].open ? fits[id].width : 0,
		side: id,
		panel: fits[id].width,
		floor: 0,
		max: env === null ? LIMITS.sideMax : Math.max(sideMin(layout, id), maxWidth(layout, id, env)),
		onWidth: (next: number) => setLive((was) => ({ ...was, [id]: next })),
		onSettle: (next: number) => {
			setLive((was) => ({ ...was, [id]: null }));
			if (next <= STRIP_WIDTH) apply({ type: "open", side: id, open: false });
			else apply({ type: "width", side: id, width: next });
		},
	});
	const leftEdge = useRailDrag(edge("left"));
	const rightEdge = useRailDrag(edge("right"));

	const resizeGroups = (
		id: SideId,
		index: number,
		heights: readonly number[],
		event: ReactPointerEvent<HTMLElement>,
	) => {
		if (event.button !== 0) return;
		event.preventDefault();
		const handle = event.currentTarget;
		const pointerId = event.pointerId;
		try {
			handle.setPointerCapture(pointerId);
		} catch {
			// as for a drag: nothing to capture, and the handle still hears its own pointer
		}
		const startY = event.clientY;
		setSplitting(true);
		const move = (e: PointerEvent) => {
			if (e.pointerId !== pointerId) return;
			apply({ type: "weights", side: id, weights: resizeSplit(heights, index, e.clientY - startY) });
		};
		const up = (e: PointerEvent) => {
			if (e.pointerId !== pointerId) return;
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", up);
			handle.removeEventListener("pointercancel", up);
			setSplitting(false);
		};
		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", up);
		handle.addEventListener("pointercancel", up);
	};

	/* ── a tab's own menu ────────────────────────────────────────────── */

	useEffect(() => {
		if (menu === null) return;
		const away = (event: Event) => {
			if (!(event.target instanceof Element) || event.target.closest("[data-pane-tab-menu]") === null) setMenu(null);
		};
		const onEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			setMenu(null);
		};
		window.addEventListener("pointerdown", away, true);
		window.addEventListener("keydown", onEscape, true);
		return () => {
			window.removeEventListener("pointerdown", away, true);
			window.removeEventListener("keydown", onEscape, true);
		};
	}, [menu]);

	const openMenu = (pane: string) => (event: ReactMouseEvent<HTMLElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setMenu({ pane, x: event.clientX, y: event.clientY });
	};

	/** the other side's first row, or its edge when it holds nothing */
	const otherSide = (now: Layout, pane: string): Drop | null => {
		const at = whereIs(now, pane);
		if (at === null) return null;
		const to = other(at.side);
		return { kind: "row", side: to, group: 0, index: now[to].groups[0]?.tabs.length ?? 0 };
	};
	const splitBelow = (now: Layout, pane: string): Drop | null => {
		const at = whereIs(now, pane);
		if (at === null || (now[at.side].groups[at.group]?.tabs.length ?? 0) < 2) return null;
		return { kind: "split", side: at.side, group: at.group, where: "below" };
	};
	const mergeUp = (now: Layout, pane: string): Drop | null => {
		const at = whereIs(now, pane);
		if (at === null || at.group === 0) return null;
		return {
			kind: "row",
			side: at.side,
			group: at.group - 1,
			index: now[at.side].groups[at.group - 1]?.tabs.length ?? 0,
		};
	};

	/* ── the palette's commands ──────────────────────────────────────── */

	// biome-ignore lint/correctness/useExhaustiveDependencies: apply reads the latest layout itself
	const commands = useMemo((): PaletteCommand[] => {
		const at = env ?? { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER };
		const refusal = (verdict: Verdict) =>
			verdict === "ok" || verdict === "noop" ? undefined : `no room: ${REASON[verdict]}`;
		const defs = registry.current;
		const out: PaletteCommand[] = [];
		for (const pane of defs) {
			out.push({
				id: `show-${pane.id}`,
				label: `Show ${pane.title}`,
				keys: hotkeyKey(pane.hotkey),
				run: () => acts.current.showPane(pane.id, true),
			});
		}
		for (const pane of defs) {
			const from = whereIs(layout, pane.id);
			const target = otherSide(layout, pane.id);
			if (from === null || target === null) continue;
			const verdict = check(layout, pane.id, target, at);
			if (verdict === "noop") continue;
			out.push({
				id: `move-${pane.id}`,
				label: `Move ${pane.title} to the ${other(from.side)} side`,
				refused: refusal(verdict),
				run: () => moveTo(pane.id, target),
			});
		}
		for (const pane of defs) {
			const target = splitBelow(layout, pane.id);
			if (target === null) continue;
			const verdict = check(layout, pane.id, target, at);
			if (verdict === "noop") continue;
			out.push({
				id: `split-${pane.id}`,
				label: `Split ${pane.title} below`,
				refused: refusal(verdict),
				run: () => apply({ type: "move", pane: pane.id, to: target }, { focus: pane.id, flip: true }),
			});
		}
		out.push({ id: "reset-layout", label: "Reset layout", run: () => apply({ type: "reset" }, { flip: true }) });
		return out;
	}, [env, layout, shape]);

	/* ── drawing ─────────────────────────────────────────────────────── */

	const gliding = !reduced && !splitting && performance.now() < glideUntil.current;
	const glide = gliding ? `top ${DROP_MS}ms ${EASE}, height ${DROP_MS}ms ${EASE}` : "none";
	/** a cross-fade that ends hidden: visibility flips once the fade out is over, and at once on the way in */
	const fadeTo = (shown: boolean, still: boolean) =>
		still ? "none" : `opacity ${FADE_MS}ms ${EASE}, visibility 0s linear ${shown ? 0 : FADE_MS}ms`;

	const renderTab = (pane: string, lit: boolean, many: boolean) => {
		const def = byId.get(pane);
		if (def === undefined) return null;
		const seen = visible.includes(pane);
		const kind = markOf(def, seen);
		return (
			<button
				key={pane}
				type="button"
				role="tab"
				data-pane-tab={pane}
				aria-selected={lit}
				aria-label={labelOf(def, kind)}
				title={`${def.title} ${hotkeyKey(def.hotkey)}`}
				onPointerDown={(event) => press(pane, event)}
				onClick={() => picked(() => showPane(pane, false))}
				onContextMenu={openMenu(pane)}
				className={cn(
					"relative flex h-6 shrink-0 cursor-default touch-none items-center gap-1.5 rounded-sm px-2 outline-none type-label transition-[background-color,color,opacity] duration-150 ease-out focus-visible:[outline:2px_solid_var(--color-muted)] focus-visible:outline-offset-[-2px] motion-reduce:transition-none",
					lit ? "text-text" : "text-muted hover:text-text",
					lit && many && "bg-surface",
					carried === pane && "opacity-40",
				)}
			>
				<span className="whitespace-nowrap">{def.title}</span>
				<PaneMark kind={kind} placed="inline" />
			</button>
		);
	};

	const renderClose = (id: SideId) => (
		<button
			type="button"
			data-side-close={id}
			aria-label={`Close the ${id} side`}
			title={`Close the ${id} side ${hotkeyKey(id === "left" ? "panes.left" : "panes.right")}`}
			onClick={() => apply({ type: "open", side: id, open: false })}
			className={PANE_VERB}
		>
			<SidebarIcon side={id} className="h-4 w-4" />
		</button>
	);

	const renderSide = (id: SideId) => {
		const f = fits[id];
		const side = layout[id];
		const hand = live[id];
		const edgeDrag = id === "left" ? leftEdge : rightEdge;
		const empty = side.groups.length === 0;
		const open = hand === null ? f.open : hand > 0;
		const stackWidth = hand === null ? f.width : Math.max(sideMin(layout, id), hand);
		// an empty side shows an edge to drop on only while a tab is carried
		const outer = hand !== null ? hand : empty ? (carried === null ? 0 : RAIL_WIDTH) : f.outer;
		const still = reduced || env === null || hand !== null;
		const heights = stackHeights(
			side.groups.map((group) => group.weight),
			height,
		);
		const tops = heights.map((_, i) => heights.slice(0, i).reduce((a, b) => a + b, 0));
		const outerEdge = id === "left" ? "left-0" : "right-0";
		/** where each pane's slot stands: its group's body */
		const slotOf = new Map<string, { top: number; height: number; lit: boolean }>();
		side.groups.forEach((group, g) => {
			const head = g === 0 ? HEAD_H : ROW_H;
			for (const pane of group.tabs)
				slotOf.set(pane, {
					top: (tops[g] ?? 0) + head,
					height: Math.max(0, (heights[g] ?? 0) - head),
					lit: pane === group.active,
				});
		});
		return (
			<aside
				aria-label={`${SIDE_NAME[id]} side`}
				data-side={id}
				data-side-open={open && !empty ? "" : undefined}
				onPointerDownCapture={() => apply({ type: "touch", side: id })}
				onDoubleClick={(event) => event.stopPropagation()}
				onContextMenu={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
				className="relative z-20 h-full shrink-0 overflow-hidden bg-bg"
				style={{ width: outer, transition: still ? "none" : `width ${WIDEN_MS}ms ${EASE}` }}
			>
				{/* laid out at its settled width against the window's edge, so opening uncovers it rather than squashing it */}
				<div
					data-side-tabs={id}
					inert={!open || empty}
					aria-hidden={!open || empty}
					className={cn("absolute inset-y-0", outerEdge)}
					style={{
						width: stackWidth,
						opacity: open ? 1 : 0,
						visibility: open ? "visible" : "hidden",
						transition: fadeTo(open, still),
					}}
				>
					{/* each pane's slot, in the registry's order so moving between groups never moves its node */}
					{ids.map((pane) => {
						const at = slotOf.get(pane);
						if (at === undefined) return null;
						const shown = open && at.lit;
						return (
							<div
								key={pane}
								ref={slotRef(pane)}
								data-pane-slot={pane}
								data-side={id}
								inert={!shown}
								aria-hidden={!shown}
								className="absolute inset-x-0 overflow-hidden"
								style={{
									top: at.top,
									height: at.height,
									opacity: at.lit ? 1 : 0,
									visibility: at.lit ? "inherit" : "hidden",
									transition: [
										glide,
										reduced ? "" : `opacity ${FADE_MS}ms ${EASE}`,
										reduced || at.lit ? "" : `visibility 0s linear ${FADE_MS}ms`,
									]
										.filter((part) => part !== "" && part !== "none")
										.join(", "),
								}}
							/>
						);
					})}
					{side.groups.map((group, g) => {
						const head = g === 0 ? HEAD_H : ROW_H;
						return (
							<div
								key={`body-${group.tabs[0]}`}
								data-drop-body={`${id}:${g}`}
								aria-hidden="true"
								className="pointer-events-none absolute inset-x-0"
								style={{ top: (tops[g] ?? 0) + head, height: Math.max(0, (heights[g] ?? 0) - head) }}
							/>
						);
					})}
					{side.groups.map((group, g) => {
						const head = g === 0;
						const many = group.tabs.length > 1;
						return (
							<div
								key={`row-${group.tabs[0]}`}
								data-pane-group={`${id}:${g}`}
								data-pane-group-key={group.tabs[0]}
								data-drop-row={`${id}:${g}`}
								className={cn(
									"group/row absolute inset-x-0 flex select-none items-center bg-bg",
									head ? "px-1.5" : "border-border border-t pr-1.5 pl-1",
									head && id === "right" && "pl-1",
								)}
								style={{ top: tops[g] ?? 0, height: head ? HEAD_H : ROW_H, transition: glide }}
							>
								{head && id === "left" ? renderClose("left") : null}
								<div
									role="tablist"
									aria-label={head ? `${SIDE_NAME[id]} side` : `${SIDE_NAME[id]} side, split ${g}`}
									className={cn("flex min-w-0 items-center overflow-hidden", head && id === "left" && "ml-1")}
								>
									{group.tabs.map((pane) => renderTab(pane, pane === group.active, many))}
								</div>
								<div className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity duration-150 ease-out group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100 has-[[aria-expanded=true]]:opacity-100 motion-reduce:transition-none">
									{group.tabs.map((pane) => (
										<div
											key={pane}
											ref={verbRef(pane)}
											data-pane-verbs={pane}
											className={pane === group.active ? "flex items-center" : "hidden"}
										/>
									))}
								</div>
								{head && id === "right" ? renderClose("right") : null}
							</div>
						);
					})}
					{side.groups.slice(1).map((group, i) => (
						<button
							type="button"
							key={`divider-${group.tabs[0]}`}
							aria-label="Resize groups"
							onPointerDown={(event) => resizeGroups(id, i, heights, event)}
							className="group/split absolute inset-x-0 z-10 h-2 -translate-y-1/2 cursor-row-resize touch-none"
							style={{ top: tops[i + 1], transition: glide === "none" ? "none" : `top ${DROP_MS}ms ${EASE}` }}
						>
							<span className="absolute inset-x-0 top-1/2 h-px bg-transparent group-hover/split:bg-thread" />
						</button>
					))}
				</div>
				{/* the rail: only while the side is closed, its panes' icons bare at the edge, the first where the close was */}
				{empty && carried === null ? null : (
					<div
						data-side-rail={empty ? undefined : id}
						data-drop-edge={open && !empty ? undefined : id}
						inert={open && !empty}
						aria-hidden={open && !empty}
						className={cn("absolute inset-y-0 flex flex-col items-center gap-0.5 pt-1", outerEdge)}
						style={{
							width: RAIL_WIDTH,
							opacity: open && !empty ? 0 : 1,
							visibility: open && !empty ? "hidden" : "visible",
							transition: fadeTo(!(open && !empty), still),
						}}
					>
						{panesOf(side).map((pane) => {
							const def = byId.get(pane);
							if (def === undefined) return null;
							const kind = markOf(def, visible.includes(pane));
							return (
								<button
									key={pane}
									type="button"
									data-rail-icon={pane}
									aria-label={labelOf(def, kind)}
									title={`${def.title} ${hotkeyKey(def.hotkey)}`}
									onClick={() => showPane(pane, false)}
									onContextMenu={openMenu(pane)}
									className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted/60 transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-surface hover:text-text active:scale-90 motion-reduce:transition-none"
								>
									<span className="flex h-4 w-4 items-center justify-center">{def.icon}</span>
									<PaneMark kind={kind} placed="corner" />
								</button>
							);
						})}
					</div>
				)}
				{/* the one hairline, on the edge that faces the canvas, over whatever a pane draws to its edge */}
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute inset-y-0 z-40 w-px bg-border",
						id === "left" ? "right-0" : "left-0",
					)}
				/>
				{open && !empty ? (
					<button
						type="button"
						aria-label={`Resize ${id} side`}
						{...edgeDrag.grip}
						className={cn(
							"group absolute top-0 z-50 h-full w-1.5 cursor-col-resize touch-none outline-none",
							id === "left" ? "right-0" : "left-0",
						)}
					>
						<span
							className={cn(
								"absolute inset-y-0 w-px bg-transparent group-hover:bg-thread group-focus-visible:bg-thread",
								id === "left" ? "right-0" : "left-0",
							)}
						/>
					</button>
				) : null}
			</aside>
		);
	};

	const menuDef = menu === null ? undefined : byId.get(menu.pane);
	const menuAt = menu === null ? null : whereIs(layout, menu.pane);
	const carriedDef = carried === null ? undefined : byId.get(carried);
	const menuItems = (() => {
		if (menu === null || menuAt === null) return [];
		const at = env ?? { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER };
		const items: { label: string; drop: Drop; verdict: Verdict }[] = [];
		const across = otherSide(layout, menu.pane);
		if (across !== null)
			items.push({
				label: `Move to the ${other(menuAt.side)} side`,
				drop: across,
				verdict: check(layout, menu.pane, across, at),
			});
		const below = splitBelow(layout, menu.pane);
		if (below !== null)
			items.push({ label: "Split below", drop: below, verdict: check(layout, menu.pane, below, at) });
		const up = mergeUp(layout, menu.pane);
		if (up !== null)
			items.push({ label: "Merge into the group above", drop: up, verdict: check(layout, menu.pane, up, at) });
		return items;
	})();

	return (
		<PaneCommands.Provider value={commands}>
			<div
				ref={root}
				data-pane-window=""
				className={cn(
					"relative flex h-full min-w-0 flex-1 flex-col overflow-hidden",
					"data-[dragging]:cursor-grabbing data-[dragging]:select-none data-[dragging]:[&_*]:cursor-grabbing",
				)}
			>
				<div ref={body} className="relative flex min-h-0 min-w-0 flex-1">
					{renderSide("left")}
					<div className="relative flex h-full min-w-0 flex-1">{children}</div>
					{renderSide("right")}
				</div>

				<div
					ref={mark}
					aria-hidden="true"
					data-pane-drop=""
					className={cn(
						"group/mark pointer-events-none fixed z-50 flex items-center justify-center rounded-sm bg-thread/[0.07] outline outline-1 outline-thread/35",
						"data-[line]:rounded-full data-[line]:bg-thread data-[line]:outline-0",
						"data-[refused]:border data-[refused]:border-border-raised data-[refused]:border-dashed data-[refused]:bg-bg/60 data-[refused]:outline-0",
					)}
					style={{
						opacity: 0,
						transition: reduced
							? "none"
							: ["left", "top", "width", "height", "opacity", "background-color"]
									.map((property) => `${property} ${GLIDE_MS}ms ease-out`)
									.join(", "),
					}}
				>
					<span
						ref={markWords}
						className="mx-2 hidden rounded-xs bg-raised px-2 py-1 text-center text-muted type-detail group-data-[refused]/mark:block"
					/>
				</div>

				{carried === null || carriedDef === undefined ? null : (
					<div ref={ghost} aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-[60]">
						<div className="flex h-6 items-center whitespace-nowrap rounded-sm border border-border-raised bg-raised px-2 text-text type-label">
							{carriedDef.title}
						</div>
					</div>
				)}

				{menu === null || menuDef === undefined || menuItems.length === 0 ? null : (
					<div
						data-pane-tab-menu=""
						role="menu"
						aria-label={menuDef.title}
						className="fixed z-50 flex w-[220px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit"
						style={{ top: menu.y + 4, left: Math.min(menu.x, window.innerWidth - 228) }}
					>
						{menuItems.map((item) => (
							<MenuItem
								key={item.label}
								label={item.label}
								disabled={item.verdict !== "ok"}
								onClick={() => {
									setMenu(null);
									moveTo(menuDef.id, item.drop);
								}}
							/>
						))}
					</div>
				)}

				<div ref={parking} hidden />
				{panes.map((def) => {
					const at = whereIs(layout, def.id);
					const side = at?.side ?? "right";
					const context: PaneContext = {
						side,
						width: live[side] === null ? fits[side].width : Math.max(sideMin(layout, side), live[side] ?? 0),
						visible: visible.includes(def.id),
					};
					return createPortal(
						<PaneSection
							def={def}
							context={context}
							verbs={verbSlots[def.id] ?? null}
							// a portal's events climb the React tree rather than the side it stands in
							onTouch={() => at !== null && apply({ type: "touch", side: at.side })}
						/>,
						nodeOf(def.id),
						def.id,
					);
				})}
			</div>
		</PaneCommands.Provider>
	);
}

/* ── one pane ───────────────────────────────────────────────────────── */

/** a pane's body; its name is its tab, and its verbs go to its tab row */
function PaneSection({
	def,
	context,
	verbs,
	onTouch,
}: {
	def: PaneDef;
	context: PaneContext;
	verbs: HTMLElement | null;
	onTouch: () => void;
}) {
	return (
		<section
			data-pane={def.id}
			aria-label={def.title}
			onPointerDownCapture={onTouch}
			className="flex h-full min-h-0 flex-col overflow-hidden bg-bg"
		>
			<div data-pane-body={def.id} className="relative min-h-0 flex-1 overflow-hidden">
				<PaneSlot.Provider value={verbs}>{def.render(context)}</PaneSlot.Provider>
			</div>
		</section>
	);
}
