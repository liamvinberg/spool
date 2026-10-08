import { MAX_WIDTH, MIN_WIDTH, PAGES_WIDTH, PROPERTIES_WIDTH, SNAP_BELOW, STRIP_WIDTH } from "./rail-width";

/**
 * Where the canvas window's panes stand, as data (#359).
 *
 * The canvas is the fixed centre and never in here: it is whatever the two
 * sides leave. A side is an always-on rail of icons, one per pane assigned to
 * it, and a stack of the panes it has lit, in rail order. Everything is pure so
 * the window can ask what a drop would do before it lets it land.
 */

export type SideId = "left" | "right";
export const SIDES: readonly SideId[] = ["left", "right"];
export const other = (side: SideId): SideId => (side === "left" ? "right" : "left");

export interface Side {
	/** pane ids, in rail order; the stack shows its lit ones in this order too */
	readonly rail: readonly string[];
	/** what is lit, which a collapsed side remembers for when it opens again */
	readonly lit: readonly string[];
	readonly width: number;
	/** false: collapsed to its rail */
	readonly open: boolean;
	/** the clock when somebody last did something to it; the oldest folds first in a narrow window */
	readonly touched: number;
}

/** where a removed pane stood, so it comes back there */
export interface Place {
	readonly side: SideId;
	readonly index: number;
}

export interface Layout {
	readonly v: 1;
	readonly clock: number;
	readonly left: Side;
	readonly right: Side;
	/** each lit pane's share of its stack's height */
	readonly weights: Readonly<Record<string, number>>;
	readonly removed: Readonly<Record<string, Place>>;
}

export const LIMITS = {
	/** lit panes on one side */
	shown: 3,
	paneMin: 160,
	sideMin: MIN_WIDTH,
	sideMax: MAX_WIDTH,
	snap: SNAP_BELOW,
	canvasMin: 480,
	rail: STRIP_WIDTH,
} as const;

/** the window body the sides and the canvas share */
export interface Env {
	readonly width: number;
	readonly height: number;
}

export type Target =
	/** a slot in a rail: before the icon at `index`, or after the last */
	| { readonly kind: "rail"; readonly side: SideId; readonly index: number }
	/** the top or bottom half of a pane showing in a stack: the pane shows there */
	| { readonly kind: "stack"; readonly side: SideId; readonly anchor: string; readonly edge: "above" | "below" };

export type Action =
	| { type: "click"; pane: string; only?: boolean | undefined }
	| { type: "show"; pane: string }
	| { type: "hide"; pane: string }
	| { type: "move"; pane: string; to: Target }
	| { type: "remove"; pane: string }
	| { type: "open"; side: SideId; open: boolean }
	| { type: "width"; side: SideId; width: number }
	| { type: "weights"; weights: Readonly<Record<string, number>> }
	| { type: "touch"; side: SideId }
	| { type: "reset" };

/** whether a drop may land: `cap` is a fourth pane on a side, `height` a pane under its minimum, `floor` the canvas under its */
export type Verdict = "ok" | "noop" | "cap" | "height" | "floor";

/** Pages lit on the left; Properties then Agent on the right, only Properties lit. */
export function defaultLayout(): Layout {
	return {
		v: 1,
		clock: 2,
		left: { rail: ["pages"], lit: ["pages"], width: PAGES_WIDTH, open: true, touched: 1 },
		right: { rail: ["properties", "agent"], lit: ["properties"], width: PROPERTIES_WIDTH, open: true, touched: 2 },
		weights: { pages: 1, properties: 1, agent: 1 },
		removed: {},
	};
}

/* ── reading ─────────────────────────────────────────────────────────── */

export function sideOf(layout: Layout, pane: string): SideId | null {
	for (const id of SIDES) if (layout[id].rail.includes(pane)) return id;
	return null;
}

/** what a side's stack holds, in rail order, whether or not it shows now */
export function stackOf(layout: Layout, id: SideId): string[] {
	const side = layout[id];
	return side.rail.filter((pane) => side.lit.includes(pane));
}

const clampWidth = (width: number) => Math.min(LIMITS.sideMax, Math.max(LIMITS.sideMin, Math.round(width)));
const wantsOpen = (side: Side) => side.open && side.lit.some((pane) => side.rail.includes(pane));
const outerOf = (side: Side, open: boolean) => LIMITS.rail + (open ? clampWidth(side.width) : 0);

export interface SideFit {
	readonly open: boolean;
	/** the stack's width, open or not: contents are laid out at it and clipped */
	readonly width: number;
	/** what the side takes from the window, rail included */
	readonly outer: number;
	/** the panes a person can see on it now, top to bottom */
	readonly shown: readonly string[];
}

export interface Fit {
	readonly left: SideFit;
	readonly right: SideFit;
	readonly canvas: number;
}

/**
 * What shows in a window this size. While the canvas would be under its floor
 * the side touched least recently folds to its rail, then the other. Nothing
 * is written back, so a folded side opens by itself once there is room.
 */
export function fitWindow(layout: Layout, env: Env): Fit {
	const open: Record<SideId, boolean> = { left: wantsOpen(layout.left), right: wantsOpen(layout.right) };
	const canvas = () => env.width - outerOf(layout.left, open.left) - outerOf(layout.right, open.right);
	const order = [...SIDES].sort((a, b) => layout[a].touched - layout[b].touched);
	for (const id of order) {
		if (canvas() >= LIMITS.canvasMin) break;
		open[id] = false;
	}
	const one = (id: SideId): SideFit => ({
		open: open[id],
		width: clampWidth(layout[id].width),
		outer: outerOf(layout[id], open[id]),
		shown: open[id] ? stackOf(layout, id) : [],
	});
	return { left: one("left"), right: one("right"), canvas: canvas() };
}

/** every pane a person can see now */
export function visibleOf(layout: Layout, env: Env): string[] {
	const f = fitWindow(layout, env);
	return [...f.left.shown, ...f.right.shown];
}

/** the widest a side may be dragged while the other stays as it shows now */
export function maxWidth(layout: Layout, id: SideId, env: Env): number {
	const f = fitWindow(layout, env);
	return Math.min(LIMITS.sideMax, env.width - LIMITS.canvasMin - f[other(id)].outer - LIMITS.rail);
}

/**
 * Each pane's height: its share of `total`, none under the minimum. A pane
 * pushed under it is held there and the others pay, largest first. Whole
 * pixels, the last pane taking the remainder.
 */
export function stackHeights(weights: readonly number[], total: number, min: number = LIMITS.paneMin): number[] {
	const n = weights.length;
	if (n === 0) return [];
	const even = Math.floor(total / n);
	if (total < n * min) return weights.map((_, i) => (i === n - 1 ? total - even * (n - 1) : even));
	const sum = weights.reduce((a, b) => a + b, 0) || 1;
	const heights = weights.map((w) => (w / sum) * total);
	for (let pass = 0; pass < n; pass++) {
		const short = heights.reduce((acc, h) => acc + Math.max(0, min - h), 0);
		if (short <= 0.01) break;
		const spare = heights.reduce((acc, h) => acc + Math.max(0, h - min), 0);
		for (let i = 0; i < n; i++) {
			const h = heights[i] as number;
			heights[i] = h < min ? min : h - (short * (h - min)) / spare;
		}
	}
	const whole = heights.map((h) => Math.round(h));
	whole[n - 1] = total - whole.slice(0, -1).reduce((a, b) => a + b, 0);
	return whole;
}

/** a divider between pane `i` and `i + 1` dragged by `dy`, both kept at or over the minimum */
export function resizeSplit(heights: readonly number[], i: number, dy: number, min: number = LIMITS.paneMin): number[] {
	const a = heights[i];
	const b = heights[i + 1];
	if (a === undefined || b === undefined) return [...heights];
	const move = Math.max(min - a, Math.min(b - min, dy));
	const next = [...heights];
	next[i] = a + move;
	next[i + 1] = b - move;
	return next;
}

/* ── the reducer ─────────────────────────────────────────────────────── */

interface Draft {
	v: 1;
	clock: number;
	left: { rail: string[]; lit: string[]; width: number; open: boolean; touched: number };
	right: { rail: string[]; lit: string[]; width: number; open: boolean; touched: number };
	weights: Record<string, number>;
	removed: Record<string, Place>;
}

function draft(layout: Layout): Draft {
	const copy = (side: Side) => ({ ...side, rail: [...side.rail], lit: [...side.lit] });
	return {
		...layout,
		left: copy(layout.left),
		right: copy(layout.right),
		weights: { ...layout.weights },
		removed: { ...layout.removed },
	};
}

function tick(next: Draft): number {
	next.clock += 1;
	return next.clock;
}

/** the most a stack may hold in a window this tall */
const capOf = (env: Env | undefined) =>
	Math.min(LIMITS.shown, env === undefined ? LIMITS.shown : Math.max(1, Math.floor(env.height / LIMITS.paneMin)));

/** a newcomer to a stack takes the average share of what is there */
function shareFor(next: Draft, id: SideId): number {
	const here = stackOf(next, id).map((pane) => next.weights[pane] ?? 1);
	return here.length === 0 ? 1 : here.reduce((a, b) => a + b, 0) / here.length;
}

/**
 * Opens a side and makes it the one touched last, so in a narrow window the
 * other side folds first. A drop squeezes instead: a side opened by it takes
 * the room there is, never under its minimum (`check` refuses a drop that
 * would need that), so what was dropped and what was there both stay in sight.
 */
function openSide(next: Draft, id: SideId, before?: Layout, env?: Env): void {
	const side = next[id];
	if (before !== undefined && env !== undefined && !fitWindow(before, env)[id].open) {
		const o = other(id);
		const otherOpen = fitWindow(before, env)[o].open && wantsOpen(next[o]);
		const room = env.width - outerOf(next[o], otherOpen) - LIMITS.rail - LIMITS.canvasMin;
		side.width = clampWidth(Math.min(side.width, room));
	}
	side.open = true;
	side.touched = tick(next);
}

function light(next: Draft, id: SideId, pane: string, env: Env | undefined): boolean {
	const side = next[id];
	if (side.lit.includes(pane)) return true;
	if (side.lit.length >= capOf(env)) return false;
	next.weights[pane] = shareFor(next, id);
	side.lit.push(pane);
	return true;
}

function collapse(next: Draft, id: SideId): void {
	next[id].open = false;
	next[id].touched = tick(next);
}

/** a pane leaving a stack hands its height to the one above it, or below when it was on top */
function bequeath(next: Draft, id: SideId, pane: string): void {
	const stack = stackOf(next, id);
	const at = stack.indexOf(pane);
	const heir = stack[at - 1] ?? stack[at + 1];
	if (at === -1 || heir === undefined) return;
	next.weights[heir] = (next.weights[heir] ?? 1) + (next.weights[pane] ?? 1);
}

/** the last pane off collapses the side, and stays lit as what it remembers */
function unlight(next: Draft, id: SideId, pane: string): void {
	const side = next[id];
	if (side.lit.length === 1 && side.lit[0] === pane) {
		collapse(next, id);
		return;
	}
	bequeath(next, id, pane);
	side.lit = side.lit.filter((p) => p !== pane);
	side.touched = tick(next);
}

/** lifts a pane out of its rail and stack; a side left showing nothing collapses */
function detach(next: Draft, pane: string): { side: SideId; index: number; lit: boolean } | null {
	const id = sideOf(next, pane);
	if (id === null) return null;
	const side = next[id];
	const index = side.rail.indexOf(pane);
	const lit = side.lit.includes(pane);
	if (lit) bequeath(next, id, pane);
	side.rail.splice(index, 1);
	side.lit = side.lit.filter((p) => p !== pane);
	if (lit && side.lit.length === 0) side.open = false;
	return { side: id, index, lit };
}

/** whether the side shows its stack now */
const showing = (layout: Layout, id: SideId, env: Env | undefined) =>
	env === undefined ? wantsOpen(layout[id]) : fitWindow(layout, env)[id].open;

const seen = (layout: Layout, pane: string, env: Env | undefined) => {
	const id = sideOf(layout, pane);
	return id !== null && showing(layout, id, env) && layout[id].lit.includes(pane);
};

function click(layout: Layout, pane: string, only: boolean, env: Env | undefined): Layout {
	const id = sideOf(layout, pane);
	if (id === null) return layout;
	const next = draft(layout);
	if (only) {
		next.weights[pane] ??= 1;
		next[id].lit = [pane];
		openSide(next, id);
		return next;
	}
	if (seen(layout, pane, env)) {
		unlight(next, id, pane);
		return next;
	}
	if (!light(next, id, pane, env)) return layout;
	openSide(next, id);
	return next;
}

function show(layout: Layout, pane: string, env: Env | undefined): Layout {
	let current = layout;
	if (sideOf(layout, pane) === null) {
		const place = layout.removed[pane];
		if (place === undefined) return layout;
		const next = draft(layout);
		delete next.removed[pane];
		const rail = next[place.side].rail;
		rail.splice(Math.min(place.index, rail.length), 0, pane);
		current = next;
	}
	if (seen(current, pane, env)) {
		const id = sideOf(current, pane) as SideId;
		const next = draft(current);
		next[id].touched = tick(next);
		return next;
	}
	return click(current, pane, false, env);
}

/** the rails and stacks, which is all a drop can change */
const shapeOf = (layout: Layout) =>
	JSON.stringify(SIDES.map((id) => [layout[id].rail, stackOf(layout, id), wantsOpen(layout[id])]));

function move(layout: Layout, pane: string, to: Target, env: Env | undefined): Layout {
	const next = draft(layout);
	const was = detach(next, pane);
	if (was === null) return layout;
	const side = next[to.side];
	if (to.kind === "rail") {
		// a slot counted with the pane still in the rail, before it lifted
		const index = was.side === to.side && was.index < to.index ? to.index - 1 : to.index;
		side.rail.splice(Math.max(0, Math.min(index, side.rail.length)), 0, pane);
		if (was.lit) {
			if (was.side === to.side) {
				side.lit.push(pane);
				if (layout[was.side].open) side.open = true;
			} else if (!showing(layout, to.side, env)) {
				// a showing pane carried to a side that shows nothing opens it, alone
				side.lit = [pane];
				openSide(next, to.side, layout, env);
			} else {
				if (!light(next, to.side, pane, env)) side.lit.push(pane);
				openSide(next, to.side, layout, env);
			}
		}
	} else {
		const at = side.rail.indexOf(to.anchor);
		if (at === -1) return layout;
		side.rail.splice(to.edge === "above" ? at : at + 1, 0, pane);
		if (!(was.side === to.side && was.lit)) {
			// a fresh split halves the pane it splits
			const half = (next.weights[to.anchor] ?? 1) / 2;
			next.weights[to.anchor] = half;
			next.weights[pane] = half;
		}
		if (!side.lit.includes(pane)) side.lit.push(pane);
		openSide(next, to.side, layout, env);
	}
	return shapeOf(layout) === shapeOf(next) ? layout : next;
}

export function reduce(layout: Layout, action: Action, env?: Env): Layout {
	switch (action.type) {
		case "click":
			return click(layout, action.pane, action.only === true, env);
		case "show":
			return show(layout, action.pane, env);
		case "hide": {
			const id = sideOf(layout, action.pane);
			if (id === null || !layout[id].lit.includes(action.pane)) return layout;
			const next = draft(layout);
			unlight(next, id, action.pane);
			return next;
		}
		case "move":
			return move(layout, action.pane, action.to, env);
		case "remove": {
			const next = draft(layout);
			const was = detach(next, action.pane);
			if (was === null) return layout;
			next.removed[action.pane] = { side: was.side, index: was.index };
			return next;
		}
		case "open": {
			const side = layout[action.side];
			if (action.open && side.rail.length === 0) return layout;
			const next = draft(layout);
			if (!action.open) {
				collapse(next, action.side);
				return next;
			}
			// nothing remembered: the first on the rail
			const first = side.rail[0];
			if (stackOf(next, action.side).length === 0 && first !== undefined) next[action.side].lit = [first];
			openSide(next, action.side);
			return next;
		}
		case "width": {
			const next = draft(layout);
			const limit = env === undefined ? LIMITS.sideMax : maxWidth(layout, action.side, env);
			const side = next[action.side];
			side.width = clampWidth(Math.min(action.width, Math.max(LIMITS.sideMin, limit)));
			const first = side.rail[0];
			if (stackOf(next, action.side).length === 0 && first !== undefined) side.lit = [first];
			side.open = true;
			if (side.touched !== next.clock) side.touched = tick(next);
			return next;
		}
		case "weights": {
			const next = draft(layout);
			Object.assign(next.weights, action.weights);
			return next;
		}
		case "touch": {
			if (layout[action.side].touched === layout.clock) return layout;
			const next = draft(layout);
			next[action.side].touched = tick(next);
			return next;
		}
		case "reset":
			return defaultLayout();
	}
}

/** what a drop would do, judged before it lands */
export function check(layout: Layout, pane: string, to: Target, env: Env): Verdict {
	const next = move(layout, pane, to, env);
	if (next === layout) return "noop";
	const id = to.side;
	const count = stackOf(next, id).length;
	if (count > LIMITS.shown) return "cap";
	if (wantsOpen(next[id]) && count * LIMITS.paneMin > env.height) return "height";
	const before = fitWindow(layout, env);
	if (wantsOpen(next[id]) && !before[id].open) {
		const o = other(id);
		const otherOpen = before[o].open && wantsOpen(next[o]);
		if (env.width - outerOf(next[o], otherOpen) - LIMITS.rail - LIMITS.canvasMin < LIMITS.sideMin) return "floor";
	}
	return "ok";
}

/* ── storage ─────────────────────────────────────────────────────────── */

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isStrings = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((item) => typeof item === "string");
const isSideId = (value: unknown): value is SideId => value === "left" || value === "right";

/**
 * The guard `remembered.ts` reads a stored layout through: exactly these panes,
 * each once, on a rail or removed, with nothing lit off its rail and nothing a
 * side is never left at. Anything else is discarded, never migrated.
 */
export function isLayout(panes: readonly string[]) {
	return (value: unknown): value is Layout => {
		if (!isObject(value) || value.v !== 1 || !isCount(value.clock)) return false;
		if (!isObject(value.weights) || !isObject(value.removed)) return false;
		const known = new Set(panes);
		const placed = new Set<string>();
		for (const id of SIDES) {
			const side = value[id];
			if (!isObject(side) || !isStrings(side.rail) || !isStrings(side.lit)) return false;
			if (typeof side.open !== "boolean" || !isCount(side.touched)) return false;
			if (typeof side.width !== "number" || side.width < LIMITS.sideMin || side.width > LIMITS.sideMax) return false;
			const rail = side.rail;
			if (side.lit.length > LIMITS.shown || new Set(side.lit).size !== side.lit.length) return false;
			if (!side.lit.every((pane) => rail.includes(pane))) return false;
			for (const pane of rail) {
				if (!known.has(pane) || placed.has(pane)) return false;
				placed.add(pane);
			}
		}
		for (const [pane, place] of Object.entries(value.removed)) {
			if (!known.has(pane) || placed.has(pane)) return false;
			if (!isObject(place) || !isSideId(place.side) || !isCount(place.index)) return false;
			placed.add(pane);
		}
		if (placed.size !== known.size) return false;
		return panes.every((pane) => {
			const weight = (value.weights as Record<string, unknown>)[pane];
			return typeof weight === "number" && Number.isFinite(weight) && weight > 0;
		});
	};
}
