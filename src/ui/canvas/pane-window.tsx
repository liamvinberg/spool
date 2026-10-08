import type { MouseEvent as ReactMouseEvent, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";
import { attachHotkeyLayer, type HotkeyHandler } from "../hotkey-dispatch";
import { type HotkeyIdFor, hotkeyKey } from "../hotkeys";
import { CloseIcon } from "../icons";
import { useRemembered } from "../remembered";
import { MenuItem } from "./context-menu";
import type { PaletteCommand } from "./find-palette";
import {
	type Action,
	check,
	defaultLayout,
	type Env,
	fitWindow,
	isLayout,
	type Layout,
	LIMITS,
	maxWidth,
	other,
	reduce,
	resizeSplit,
	type SideId,
	sideOf,
	stackHeights,
	stackOf,
	type Target,
	type Verdict,
} from "./pane-layout";
import { STRIP_WIDTH, useRailDrag } from "./rail-width";

/**
 * The canvas window's two sides (#359): the canvas in the middle, and on each
 * hand of it an always-on rail with a stack of the panes lit beside it. Where a
 * pane stands is `pane-layout.ts`; this file draws it and owns the gestures.
 *
 * Every pane is rendered once, into a node of its own that is moved into the
 * slot its side gives it, so a pane hidden, collapsed or carried to the other
 * side keeps its state, its drafts and its scroll.
 */

export interface PaneContext {
	readonly side: SideId;
	/** the stack's settled width, which the pane is laid out at whatever the side's edge is doing */
	readonly width: number;
	readonly visible: boolean;
	readonly hide: () => void;
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
	/** a turn in flight: rides its rail icon while the pane is out of sight, and leaves a mark when it lands there */
	readonly working?: boolean | undefined;
}

const STORAGE_KEY = "panes.layout";
const CURVE = "cubic-bezier(0.23, 1, 0.32, 1)";
/** a side's edge, the number both rails wore */
const SIDE_MS = 300;
/** the layout taking its new shape after a drop */
const DROP_MS = 250;
/** the outline gliding between targets */
const GLIDE_MS = 150;
/** a press travels this far before it is a drag */
const SLOP = 4;
const GHOST_H = 32;
/** the slot line in a rail, as wide as a lit icon */
const SLOT_W = 28;

const REASON: Record<Exclude<Verdict, "ok" | "noop">, string> = {
	cap: "3 panes a side",
	height: "a pane needs 160px",
	floor: "the canvas keeps 480px",
};

const SIDE_NAME: Record<SideId, string> = { left: "Left", right: "Right" };

/* ── what a pane hands its header, and the palette ──────────────────── */

/** undefined: not in a pane at all, so actions draw where they stand */
const PaneSlot = createContext<HTMLElement | null | undefined>(undefined);

/** A pane's own header actions, drawn into the header the window gives it. */
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
const sameTarget = (a: Target | null, b: Target | null) => JSON.stringify(a) === JSON.stringify(b);

interface Zones {
	panes: { pane: string; side: SideId; box: Box }[];
	rails: { side: SideId; box: Box; items: { pane: string; box: Box }[] }[];
}

interface Held {
	pane: string;
	from: "rail" | "head";
	origin: Box;
}

interface Dragging extends Held {
	grab: { x: number; y: number };
	zones: Zones;
	base: Layout;
	env: Env;
	target: Target | null;
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
	foot,
	reveal,
	children,
}: {
	panes: readonly PaneDef[];
	/** what stands at the foot of the right rail */
	foot?: ReactNode;
	/** show this pane whenever the key changes: the agent asked for from elsewhere */
	reveal?: { readonly pane: string; readonly key: string } | undefined;
	/** the canvas */
	children?: ReactNode;
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
	const outline = useRef<HTMLDivElement>(null);
	const outlineWords = useRef<HTMLSpanElement>(null);

	/** null until measured, and in a document with no layout at all: nothing folds for a window nobody has */
	const [env, setEnv] = useState<Env | null>(null);
	const fits = fitWindow(layout, env ?? { width: Number.MAX_SAFE_INTEGER, height: 0 });
	const height = env?.height ?? 0;
	const visible = [...fits.left.shown, ...fits.right.shown];
	const visibleKey = visible.join("|");

	const [held, setHeld] = useState<Held | null>(null);
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
	// a pane off every rail waits out of sight, still mounted, for its key to bring it back
	useLayoutEffect(() => {
		for (const pane of ids) {
			if (sideOf(layout, pane) !== null) continue;
			const node = nodeOf(pane);
			if (parking.current !== null && node.parentElement !== parking.current) parking.current.append(node);
		}
	});

	/* ── motion on a change of shape ─────────────────────────────────── */

	const flip = useRef<{ rects: Map<string, Box>; spawn: { pane: string; box: Box } | null } | null>(null);
	/** where each lit pane stood at the last render, so a pane new to a stack is told from one sliding in it */
	const litBefore = useRef(new Map<string, SideId>());

	const rel = (rect: DOMRect): Box => {
		const outer = root.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
		return { x: rect.left - outer.left, y: rect.top - outer.top, w: rect.width, h: rect.height };
	};

	const capture = (extra?: Map<string, Box>, spawn?: { pane: string; box: Box } | null) => {
		const rects = new Map<string, Box>();
		for (const icon of root.current?.querySelectorAll<HTMLElement>("[data-rail-icon]") ?? []) {
			rects.set(icon.dataset.railIcon ?? "", rel(icon.getBoundingClientRect()));
		}
		for (const [key, box] of extra ?? []) rects.set(key, box);
		flip.current = { rects, spawn: spawn ?? null };
	};

	useLayoutEffect(() => {
		const pending = flip.current;
		flip.current = null;
		const before = litBefore.current;
		const now = new Map<string, SideId>();
		for (const id of ["left", "right"] as const) for (const pane of stackOf(layout, id)) now.set(pane, id);
		litBefore.current = now;
		const element = root.current;
		if (pending === null || element === null || reduced) return;
		for (const icon of element.querySelectorAll<HTMLElement>("[data-rail-icon]")) {
			const was = pending.rects.get(icon.dataset.railIcon ?? "");
			if (was === undefined) continue;
			const at = rel(icon.getBoundingClientRect());
			const dx = was.x - at.x;
			const dy = was.y - at.y;
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
			animate(icon, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
				duration: DROP_MS,
				easing: CURVE,
			});
		}
		for (const [pane, id] of now) {
			if (before.get(pane) === id) continue;
			const slot = element.querySelector<HTMLElement>(`[data-pane-slot="${pane}"]`);
			const stack = slot?.parentElement;
			if (slot === null || slot === undefined || stack === null || stack === undefined) continue;
			const spawn = pending.spawn?.pane === pane ? pending.spawn.box : null;
			if (spawn === null) {
				animate(slot, [{ opacity: 0 }, { opacity: 1 }], { duration: GLIDE_MS, easing: "ease-out" });
				continue;
			}
			// a pane new to a stack grows out of the outline it was dropped on
			const top = spawn.y - rel(stack.getBoundingClientRect()).y;
			animate(
				slot,
				[
					{ top: `${top}px`, height: `${spawn.h}px` },
					{ top: slot.style.top, height: slot.style.height },
				],
				{ duration: DROP_MS, easing: CURVE },
			);
		}
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
		if (options.flip !== false) capture();
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

	/* ── the drag ────────────────────────────────────────────────────── */

	const dragging = useRef<Dragging | null>(null);
	const clickEaten = useRef(false);
	const settling = useRef(false);

	const measureZones = (): Zones => {
		const zones: Zones = { panes: [], rails: [] };
		const element = root.current;
		if (element === null) return zones;
		const shown = fitWindow(
			latest.current.layout,
			latest.current.env ?? { width: Number.MAX_SAFE_INTEGER, height: 0 },
		);
		for (const slot of element.querySelectorAll<HTMLElement>("[data-pane-slot]")) {
			const side = slot.dataset.side as SideId;
			const pane = slot.dataset.paneSlot ?? "";
			if (shown[side].shown.includes(pane)) zones.panes.push({ pane, side, box: rel(slot.getBoundingClientRect()) });
		}
		for (const rail of element.querySelectorAll<HTMLElement>("[data-rail]")) {
			const items = [...rail.querySelectorAll<HTMLElement>("[data-rail-icon]")].map((item) => ({
				pane: item.dataset.railIcon ?? "",
				box: rel(item.getBoundingClientRect()),
			}));
			zones.rails.push({ side: rail.dataset.rail as SideId, box: rel(rail.getBoundingClientRect()), items });
		}
		return zones;
	};

	const hit = (d: Dragging, x: number, y: number): Target | null => {
		for (const rail of d.zones.rails) {
			if (!inside(rail.box, x, y)) continue;
			const index = rail.items.findIndex((item) => y < item.box.y + item.box.h / 2);
			return { kind: "rail", side: rail.side, index: index === -1 ? rail.items.length : index };
		}
		for (const zone of d.zones.panes) {
			if (!inside(zone.box, x, y)) continue;
			if (zone.pane === d.pane) return null;
			return {
				kind: "stack",
				side: zone.side,
				anchor: zone.pane,
				edge: y < zone.box.y + zone.box.h / 2 ? "above" : "below",
			};
		}
		return null;
	};

	const outlineOf = (d: Dragging, target: Target): Box => {
		if (target.kind === "rail") {
			const rail = d.zones.rails.find((zone) => zone.side === target.side);
			if (rail === undefined) return { x: 0, y: 0, w: 0, h: 0 };
			const at = rail.items[target.index];
			const last = rail.items[rail.items.length - 1];
			const y = at !== undefined ? at.box.y - 2 : last !== undefined ? last.box.y + last.box.h + 2 : rail.box.y + 6;
			return { x: rail.box.x + (rail.box.w - SLOT_W) / 2, y: y - 1.5, w: SLOT_W, h: 3 };
		}
		const zone = d.zones.panes.find((candidate) => candidate.pane === target.anchor);
		if (zone === undefined) return { x: 0, y: 0, w: 0, h: 0 };
		const half = zone.box.h / 2;
		return inset({ ...zone.box, y: target.edge === "above" ? zone.box.y : zone.box.y + half, h: half }, 4);
	};

	const placeOutline = (box: Box | null, refused: string | null, slot = false) => {
		const element = outline.current;
		if (element === null) return;
		if (box === null) {
			element.style.opacity = "0";
			delete element.dataset.shown;
			return;
		}
		const fresh = element.dataset.shown === undefined;
		if (fresh) element.style.transition = "none";
		element.style.left = `${box.x}px`;
		element.style.top = `${box.y}px`;
		element.style.width = `${box.w}px`;
		element.style.height = `${box.h}px`;
		if (refused === null) delete element.dataset.refused;
		else element.dataset.refused = "";
		if (slot) element.dataset.slot = "";
		else delete element.dataset.slot;
		if (outlineWords.current !== null)
			outlineWords.current.textContent = refused === null ? "" : `no room: ${refused}`;
		if (fresh) {
			void element.offsetWidth;
			element.style.transition = "";
		}
		element.style.opacity = "1";
		element.dataset.shown = "";
	};

	const aim = (d: Dragging, target: Target | null) => {
		const verdict = target === null ? null : check(d.base, d.pane, target, d.env);
		const aimed = verdict === "noop" ? null : target;
		d.target = aimed;
		if (aimed === null || verdict === null || verdict === "noop") {
			placeOutline(null, null);
			return;
		}
		if (verdict === "ok") {
			placeOutline(outlineOf(d, aimed), null, aimed.kind === "rail");
			return;
		}
		// a refusal says why where there is room to read it: over the stack the drop
		// would have opened beside a rail, or over the whole pane it aimed at
		let box = outlineOf(d, aimed);
		if (aimed.kind === "rail") {
			const rail = d.zones.rails.find((zone) => zone.side === aimed.side);
			const width = Math.max(LIMITS.sideMin, Math.min(LIMITS.sideMax, d.base[aimed.side].width));
			if (rail !== undefined)
				box = inset(
					{
						x: aimed.side === "left" ? rail.box.x + rail.box.w : rail.box.x - width,
						y: rail.box.y,
						w: width,
						h: rail.box.h,
					},
					4,
				);
		} else {
			const zone = d.zones.panes.find((candidate) => candidate.pane === aimed.anchor);
			if (zone !== undefined) box = inset(zone.box, 4);
		}
		placeOutline(box, REASON[verdict]);
	};

	const moveGhost = (d: Dragging) => {
		const element = ghost.current;
		if (element === null) return;
		const room = root.current?.clientWidth ?? Number.POSITIVE_INFINITY;
		const x = Math.min(Math.max(d.point.x - d.grab.x, 4), room - element.offsetWidth - 4);
		element.style.transform = `translate(${x}px, ${d.point.y - d.grab.y}px)`;
	};

	const endDrag = () => {
		if (root.current !== null) delete root.current.dataset.dragging;
		placeOutline(null, null);
	};

	const cancel = () => {
		const d = dragging.current;
		if (d === null) return;
		dragging.current = null;
		endDrag();
		const element = ghost.current;
		if (element === null || reduced) {
			setHeld(null);
			return;
		}
		settling.current = true;
		const home = `translate(${d.origin.x + (d.from === "head" ? 4 : 0)}px, ${d.origin.y + (d.origin.h - GHOST_H) / 2}px)`;
		const back = animate(element, [{ transform: element.style.transform }, { transform: home }], {
			duration: DROP_MS,
			easing: CURVE,
			fill: "forwards",
		});
		animate(element.firstElementChild, [{ opacity: 1 }, { opacity: 0 }], {
			duration: DROP_MS,
			easing: CURVE,
			fill: "forwards",
		});
		const landed = () => {
			settling.current = false;
			setHeld(null);
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
		endDrag();
		const extra = new Map<string, Box>();
		const ghostBox = ghost.current === null ? null : rel(ghost.current.getBoundingClientRect());
		// the moved icon flies in from the ghost's glyph
		if (ghostBox !== null && target.kind === "rail")
			extra.set(d.pane, { x: ghostBox.x + 2, y: ghostBox.y, w: GHOST_H, h: GHOST_H });
		const fresh =
			target.kind === "stack" &&
			!(sideOf(d.base, d.pane) === target.side && d.base[target.side].lit.includes(d.pane));
		capture(extra, fresh ? { pane: d.pane, box: outlineOf(d, target) } : null);
		const next = reduce(d.base, { type: "move", pane: d.pane, to: target }, d.env);
		latest.current.layout = next;
		setLayout(next);
		setHeld(null);
	};

	const press = (pane: string, from: "rail" | "head", event: ReactPointerEvent<HTMLElement>) => {
		if (event.button !== 0 || settling.current || dragging.current !== null) return;
		const source = event.currentTarget;
		const pointerId = event.pointerId;
		const start = { x: event.clientX, y: event.clientY };
		clickEaten.current = false;
		const local = (e: PointerEvent) => {
			const outer = root.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
			return { x: e.clientX - outer.left, y: e.clientY - outer.top };
		};
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
				const origin = rel(source.getBoundingClientRect());
				const outer = root.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
				// a header is held where it was taken, up to the title's end; an icon by its glyph
				const grab =
					from === "head"
						? { x: Math.min(start.x - outer.left - origin.x, 96), y: GHOST_H / 2 }
						: { x: GHOST_H / 2 + 4, y: GHOST_H / 2 };
				dragging.current = {
					pane,
					from,
					origin,
					grab,
					zones: measureZones(),
					base: latest.current.layout,
					env: latest.current.env ?? { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER },
					target: null,
					point: local(e),
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
				setHeld({ pane, from, origin });
				return;
			}
			d.point = local(e);
			moveGhost(d);
			const target = hit(d, d.point.x, d.point.y);
			if (!sameTarget(target, d.target)) aim(d, target);
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

	// the ghost appears where the icon or header was, and lifts
	// biome-ignore lint/correctness/useExhaustiveDependencies: placed once per lift
	useLayoutEffect(() => {
		const d = dragging.current;
		if (held === null || d === null) return;
		moveGhost(d);
		if (!reduced)
			animate(ghost.current?.firstElementChild, [{ scale: "1" }, { scale: "1.03" }], {
				duration: GLIDE_MS,
				easing: CURVE,
				fill: "forwards",
			});
	}, [held]);

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
		max: env === null ? LIMITS.sideMax : Math.max(LIMITS.sideMin, maxWidth(layout, id, env)),
		onWidth: (next: number) => setLive((was) => ({ ...was, [id]: next })),
		onSettle: (next: number) => {
			setLive((was) => ({ ...was, [id]: null }));
			if (next <= STRIP_WIDTH) apply({ type: "open", side: id, open: false }, { flip: false });
			else apply({ type: "width", side: id, width: next }, { flip: false });
		},
	});
	const leftEdge = useRailDrag(edge("left"));
	const rightEdge = useRailDrag(edge("right"));

	const resizeStack = (
		stack: readonly string[],
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
			const next = resizeSplit(heights, index, e.clientY - startY);
			apply(
				{ type: "weights", weights: Object.fromEntries(stack.map((pane, i) => [pane, next[i] ?? 1])) },
				{ flip: false },
			);
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

	/* ── the rail's own menu ─────────────────────────────────────────── */

	useEffect(() => {
		if (menu === null) return;
		const away = (event: Event) => {
			if (!(event.target instanceof Element) || event.target.closest("[data-rail-menu]") === null) setMenu(null);
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

	/* ── the palette's commands ──────────────────────────────────────── */

	// biome-ignore lint/correctness/useExhaustiveDependencies: apply reads the latest layout itself
	const commands = useMemo((): PaletteCommand[] => {
		const at = env ?? { width: Number.MAX_SAFE_INTEGER, height: Number.MAX_SAFE_INTEGER };
		const refusal = (verdict: Verdict) =>
			verdict === "ok" || verdict === "noop" ? undefined : `no room: ${REASON[verdict]}`;
		const seen = (pane: string) => visibleKey.split("|").includes(pane);
		const panes = registry.current;
		const out: PaletteCommand[] = [];
		for (const pane of panes) {
			out.push({
				id: `show-${pane.id}`,
				label: `${seen(pane.id) ? "Focus" : "Show"} ${pane.title}`,
				keys: hotkeyKey(pane.hotkey),
				run: () => acts.current.showPane(pane.id, true),
			});
		}
		for (const pane of panes) {
			if (seen(pane.id))
				out.push({
					id: `hide-${pane.id}`,
					label: `Hide ${pane.title}`,
					run: () => apply({ type: "hide", pane: pane.id }),
				});
		}
		for (const pane of panes) {
			const from = sideOf(layout, pane.id);
			if (from === null) continue;
			const to = other(from);
			const target: Target = { kind: "rail", side: to, index: layout[to].rail.length };
			const verdict = check(layout, pane.id, target, at);
			if (verdict === "noop") continue;
			out.push({
				id: `move-${pane.id}`,
				label: `Move ${pane.title} to the ${to} side`,
				refused: refusal(verdict),
				run: () => apply({ type: "move", pane: pane.id, to: target }),
			});
		}
		for (const edgeName of ["below", "above"] as const) {
			for (const pane of panes) {
				for (const anchor of panes) {
					if (anchor.id === pane.id || !seen(anchor.id)) continue;
					const side = sideOf(layout, anchor.id);
					if (side === null) continue;
					const target: Target = { kind: "stack", side, anchor: anchor.id, edge: edgeName };
					const verdict = check(layout, pane.id, target, at);
					if (verdict === "noop") continue;
					out.push({
						id: `split-${pane.id}-${edgeName}-${anchor.id}`,
						label: `Split ${pane.title} ${edgeName} ${anchor.title}`,
						refused: refusal(verdict),
						run: () => apply({ type: "move", pane: pane.id, to: target }, { focus: pane.id }),
					});
				}
			}
		}
		for (const pane of panes) {
			if (sideOf(layout, pane.id) !== null)
				out.push({
					id: `remove-${pane.id}`,
					label: `Remove ${pane.title} from rail`,
					run: () => apply({ type: "remove", pane: pane.id }),
				});
		}
		out.push({ id: "reset-layout", label: "Reset layout", run: () => apply({ type: "reset" }) });
		return out;
	}, [env, layout, shape, visibleKey]);

	/* ── drawing ─────────────────────────────────────────────────────── */

	const heldPane = held?.pane ?? null;

	const renderSide = (id: SideId) => {
		const f = fits[id];
		const hand = live[id];
		const edgeDrag = id === "left" ? leftEdge : rightEdge;
		const stackWidth = hand === null ? f.width : Math.max(LIMITS.sideMin, hand);
		const outer = hand === null ? f.outer : LIMITS.rail + hand;
		const open = hand === null ? f.open : hand > 0;
		const stack = stackOf(layout, id);
		const heights = stackHeights(
			stack.map((pane) => layout.weights[pane] ?? 1),
			height,
		);
		const tops = heights.map((_, i) => heights.slice(0, i).reduce((a, b) => a + b, 0));
		const still = reduced || env === null || hand !== null;
		const paneMotion = reduced || splitting ? "none" : `top ${DROP_MS}ms ${CURVE}, height ${DROP_MS}ms ${CURVE}`;
		const railPanes = layout[id].rail;
		return (
			<aside
				aria-label={`${SIDE_NAME[id]} side`}
				data-side={id}
				data-side-open={open ? "" : undefined}
				onPointerDownCapture={(event) => {
					// a rail click decides for itself; touching first could open the side under it
					if (event.target instanceof Element && event.target.closest("[data-rail]") !== null) return;
					apply({ type: "touch", side: id }, { flip: false });
				}}
				onDoubleClick={(event) => event.stopPropagation()}
				onContextMenu={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
				className="relative z-20 h-full shrink-0 overflow-hidden bg-bg"
				style={{ width: outer, transition: still ? "none" : `width ${SIDE_MS}ms ${CURVE}` }}
			>
				<div
					data-side-stack={id}
					className="absolute inset-y-0"
					style={{
						width: stackWidth,
						...(id === "left" ? { left: LIMITS.rail } : { right: LIMITS.rail }),
						visibility: open ? "visible" : "hidden",
						transition: open || still ? "none" : `visibility 0s linear ${SIDE_MS}ms`,
					}}
				>
					{railPanes.map((pane) => {
						const at = stack.indexOf(pane);
						const lit = at !== -1;
						const shown = f.shown.includes(pane);
						const steady = litBefore.current.get(pane) === id;
						return (
							<div
								key={pane}
								ref={slotRef(pane)}
								data-pane-slot={pane}
								data-side={id}
								inert={!shown}
								aria-hidden={!shown}
								className={cn("absolute inset-x-0 overflow-hidden", at > 0 && "border-border border-t")}
								style={
									lit
										? {
												top: tops[at] ?? 0,
												height: heights[at] ?? 0,
												transition: steady ? paneMotion : "none",
											}
										: { top: 0, height, visibility: "hidden" }
								}
							/>
						);
					})}
					{stack.slice(1).map((pane, i) => (
						<button
							type="button"
							key={`divider-${pane}`}
							aria-label="Resize panes"
							onPointerDown={(event) => resizeStack(stack, i, heights, event)}
							className="group/split absolute inset-x-0 z-10 h-2 -translate-y-1/2 cursor-row-resize touch-none"
							style={{ top: tops[i + 1], transition: paneMotion }}
						>
							<span className="absolute inset-x-0 top-1/2 h-px bg-transparent group-hover/split:bg-thread" />
						</button>
					))}
				</div>
				<nav
					data-rail={id}
					aria-label={`${SIDE_NAME[id]} rail`}
					className={cn(
						"absolute inset-y-0 z-20 flex flex-col items-center gap-1 border-border bg-bg pt-1.5",
						id === "left" ? "left-0 border-r" : "right-0 border-l",
					)}
					style={{ width: LIMITS.rail }}
				>
					{railPanes.map((pane) => {
						const def = byId.get(pane);
						if (def === undefined) return null;
						const lit = visible.includes(pane);
						return (
							<RailIcon
								key={pane}
								def={def}
								lit={lit}
								held={heldPane === pane}
								working={!lit && def.working === true}
								unread={!lit && unread.has(pane)}
								onPress={(event) => press(pane, "rail", event)}
								onClick={(event) => picked(() => apply({ type: "click", pane, only: event.altKey }))}
								onMenu={(event) => {
									event.preventDefault();
									event.stopPropagation();
									const box = event.currentTarget.getBoundingClientRect();
									setMenu({ pane, x: id === "right" ? box.left - 4 : box.right + 4, y: box.top });
								}}
							/>
						);
					})}
					{id === "right" && foot !== undefined ? (
						<div className="mt-auto mb-1.5 flex flex-col items-center gap-1">{foot}</div>
					) : null}
				</nav>
				{/* the hairline on the edge that faces the canvas */}
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute inset-y-0 z-20 w-px bg-border",
						id === "left" ? "right-0" : "left-0",
					)}
				/>
				{railPanes.length > 0 ? (
					<button
						type="button"
						aria-label={`Resize ${id} side`}
						{...edgeDrag.grip}
						className={cn(
							"group absolute top-0 z-30 h-full w-1.5 cursor-col-resize touch-none outline-none",
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

	const menuPane = menu === null ? undefined : byId.get(menu.pane);
	const menuSide = menu === null ? null : sideOf(layout, menu.pane);
	const heldDef = held === null ? undefined : byId.get(held.pane);

	return (
		<PaneCommands.Provider value={commands}>
			<div
				ref={root}
				data-pane-window=""
				className={cn(
					"relative flex h-full min-w-0 flex-1 overflow-hidden",
					"data-[dragging]:cursor-grabbing data-[dragging]:select-none data-[dragging]:[&_*]:cursor-grabbing",
				)}
			>
				<div ref={body} className="relative flex h-full min-w-0 flex-1">
					{renderSide("left")}
					<div className="relative flex h-full min-w-0 flex-1">{children}</div>
					{renderSide("right")}
				</div>

				<div
					ref={outline}
					aria-hidden="true"
					data-pane-outline=""
					className={cn(
						"group/outline pointer-events-none absolute z-50 flex items-center justify-center rounded-md border-[1.5px] border-thread/75 bg-thread/10",
						"data-[slot]:rounded-full data-[slot]:border-0 data-[slot]:bg-thread",
						"data-[refused]:border-border-raised data-[refused]:border-dashed data-[refused]:bg-bg/60",
					)}
					style={{
						opacity: 0,
						transition: reduced
							? "none"
							: ["left", "top", "width", "height", "opacity", "border-color", "background-color"]
									.map((property) => `${property} ${GLIDE_MS}ms ease-out`)
									.join(", "),
					}}
				>
					<span
						ref={outlineWords}
						className="mx-2 hidden rounded-xs bg-raised px-2 py-1 text-center text-muted type-detail group-data-[refused]/outline:block"
					/>
				</div>

				{held === null || heldDef === undefined ? null : (
					<div ref={ghost} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-50">
						<div
							className="flex items-center gap-2 rounded-sm border border-border-raised bg-raised pr-4 pl-2 text-text type-control"
							style={{ height: GHOST_H, transformOrigin: "16px 50%" }}
						>
							<span className="flex h-4 w-4 shrink-0 items-center justify-center">{heldDef.icon}</span>
							<span className="whitespace-nowrap">{heldDef.title}</span>
						</div>
					</div>
				)}

				{menu === null || menuPane === undefined || menuSide === null ? null : (
					<div
						data-rail-menu=""
						role="menu"
						aria-label={`${menuPane.title} on the rail`}
						className="fixed z-50 flex w-[200px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit"
						style={{
							top: menu.y,
							...(menuSide === "right" ? { right: window.innerWidth - menu.x } : { left: menu.x }),
						}}
					>
						<MenuItem
							label="Move to the other side"
							onClick={() => {
								const to = other(menuSide);
								setMenu(null);
								apply({
									type: "move",
									pane: menuPane.id,
									to: { kind: "rail", side: to, index: layout[to].rail.length },
								});
							}}
						/>
						<MenuItem
							label="Remove from rail"
							onClick={() => {
								setMenu(null);
								apply({ type: "remove", pane: menuPane.id });
							}}
						/>
					</div>
				)}

				<div ref={parking} hidden />
				{panes.map((def) => {
					const side = sideOf(layout, def.id);
					const context: PaneContext = {
						side: side ?? "right",
						width:
							side === null
								? fits.right.width
								: live[side] === null
									? fits[side].width
									: Math.max(LIMITS.sideMin, live[side] ?? 0),
						visible: visible.includes(def.id),
						hide: () => apply({ type: "hide", pane: def.id }),
					};
					return createPortal(
						<PaneSection
							def={def}
							context={context}
							held={heldPane === def.id}
							onPress={(event) => press(def.id, "head", event)}
						/>,
						nodeOf(def.id),
						def.id,
					);
				})}
			</div>
		</PaneCommands.Provider>
	);
}

/* ── one pane, and one icon ─────────────────────────────────────────── */

function PaneSection({
	def,
	context,
	held,
	onPress,
}: {
	def: PaneDef;
	context: PaneContext;
	held: boolean;
	onPress: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	return (
		<section data-pane={def.id} aria-label={def.title} className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
			<header
				data-pane-head={def.id}
				onPointerDown={onPress}
				className={cn(
					"group/head flex h-9 shrink-0 cursor-grab touch-none select-none items-center gap-2 border-border border-b pr-1.5 pl-3 text-muted transition-opacity duration-150 ease-out",
					held && "opacity-35",
				)}
			>
				<span className="flex h-4 w-4 shrink-0 items-center justify-center">{def.icon}</span>
				<h2 className="min-w-0 flex-1 truncate font-semibold text-text type-control">{def.title}</h2>
				<div ref={setSlot} className="flex shrink-0 items-center" />
				<button
					type="button"
					aria-label={`Hide ${def.title}`}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={context.hide}
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted/60 opacity-0 transition-opacity duration-150 ease-out hover:text-text focus-visible:opacity-100 group-hover/head:opacity-100"
				>
					<CloseIcon />
				</button>
			</header>
			<div data-pane-body={def.id} className="relative min-h-0 flex-1 overflow-hidden">
				<PaneSlot.Provider value={slot}>{def.render(context)}</PaneSlot.Provider>
			</div>
		</section>
	);
}

/**
 * One pane on its rail. The press feel is the house's: colour in 140ms on the
 * house curve, and the icon gives under the finger. A pane out of sight with
 * something to say says it here, a turning ring while a turn runs and one dot
 * once it lands unread, and nothing pulses.
 */
function RailIcon({
	def,
	lit,
	held,
	working,
	unread,
	onPress,
	onClick,
	onMenu,
}: {
	def: PaneDef;
	lit: boolean;
	held: boolean;
	working: boolean;
	unread: boolean;
	onPress: (event: ReactPointerEvent<HTMLElement>) => void;
	onClick: (event: ReactMouseEvent<HTMLElement>) => void;
	onMenu: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
	return (
		<button
			type="button"
			data-rail-icon={def.id}
			aria-label={def.title}
			aria-pressed={lit}
			title={`${def.title} ${hotkeyKey(def.hotkey)}`}
			onPointerDown={onPress}
			onClick={onClick}
			onContextMenu={onMenu}
			className={cn(
				"relative flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded-sm transition-[background-color,color,transform,opacity] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-90 motion-reduce:transition-none",
				lit ? "bg-control text-text" : "text-muted/70 hover:text-text",
				held && "opacity-35",
			)}
		>
			{def.icon}
			{working ? (
				<svg
					viewBox="0 0 14 14"
					aria-hidden="true"
					data-rail-mark="working"
					fill="none"
					className="-right-1 absolute top-0 h-3 w-3 animate-agent-spin text-text/60"
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
				</svg>
			) : unread ? (
				<span
					aria-hidden="true"
					data-rail-mark="unread"
					className="-right-0.5 absolute top-0.5 h-1.5 w-1.5 animate-unseen-in rounded-full bg-thread"
				/>
			) : null}
		</button>
	);
}
