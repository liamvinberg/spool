import {
	AGENT_MAX_WIDTH,
	AGENT_MIN_WIDTH,
	MAX_WIDTH,
	MIN_WIDTH,
	PAGES_WIDTH,
	PROPERTIES_WIDTH,
	SNAP_BELOW,
} from "./rail-width";

/**
 * Where the canvas window's panes stand, as data (#359).
 *
 * The canvas is the fixed centre and never in here: it is whatever the two
 * sides leave. A side is a stack of groups, and a group is panes as tabs with
 * one of them showing. A side is open, its first group's tabs its header, or
 * closed to a rail of its panes' icons at the window's edge. Everything is pure
 * so the window can ask what a drop would do before it lets it land.
 */

export type SideId = "left" | "right";
export const SIDES: readonly SideId[] = ["left", "right"];
export const other = (side: SideId): SideId => (side === "left" ? "right" : "left");

export interface Group {
	/** pane ids, in tab order */
	readonly tabs: readonly string[];
	/** the tab showing */
	readonly active: string;
	/** its share of the side's height */
	readonly weight: number;
}

export interface Side {
	readonly groups: readonly Group[];
	/** false: closed to its rail */
	readonly open: boolean;
	/** what a hand dragged it to; null is the width for what it holds */
	readonly width: number | null;
	/** the clock when somebody last did something to it; the oldest closes first in a narrow window */
	readonly touched: number;
}

export interface Layout {
	readonly v: 3;
	readonly clock: number;
	readonly left: Side;
	readonly right: Side;
}

/** a closed side's rail of icons */
export const RAIL_WIDTH = 40;

export const LIMITS = {
	/** groups on one side */
	groups: 3,
	groupMin: 160,
	sideMin: MIN_WIDTH,
	/** the widest any side may be, which only a side holding the agent reaches */
	sideMax: AGENT_MAX_WIDTH,
	snap: SNAP_BELOW,
	canvasMin: 480,
} as const;

/** the window body the sides and the canvas share */
export interface Env {
	readonly width: number;
	readonly height: number;
}

/** where a carried tab lands */
export type Drop =
	/** a group's tab row, before the tab at `index` or after the last; a group past the last starts one (an empty side's edge) */
	| { readonly kind: "row"; readonly side: SideId; readonly group: number; readonly index: number }
	/** the top or bottom half of a group's pane: a new group there */
	| { readonly kind: "split"; readonly side: SideId; readonly group: number; readonly where: "above" | "below" };

export type Action =
	/** its tab lit and its side open */
	| { type: "show"; pane: string }
	| { type: "move"; pane: string; to: Drop }
	| { type: "open"; side: SideId; open: boolean }
	| { type: "width"; side: SideId; width: number }
	| { type: "weights"; side: SideId; weights: readonly number[] }
	| { type: "touch"; side: SideId }
	| { type: "reset" };

/** whether a drop may land: `cap` a fourth group on a side, `height` a group under its minimum, `floor` the canvas under its */
export type Verdict = "ok" | "noop" | "cap" | "height" | "floor";

/** Pages on the left; Properties and Agent as tabs of one group on the right, Properties showing. */
export function defaultLayout(): Layout {
	return {
		v: 3,
		clock: 2,
		left: { groups: [{ tabs: ["pages"], active: "pages", weight: 1 }], open: true, width: null, touched: 1 },
		right: {
			groups: [{ tabs: ["properties", "agent"], active: "properties", weight: 1 }],
			open: true,
			width: null,
			touched: 2,
		},
	};
}

/* ── reading ─────────────────────────────────────────────────────────── */

export function whereIs(layout: Layout, pane: string): { side: SideId; group: number } | null {
	for (const side of SIDES) {
		const group = layout[side].groups.findIndex((candidate) => candidate.tabs.includes(pane));
		if (group !== -1) return { side, group };
	}
	return null;
}

/** every pane on a side, in group order: what its rail shows */
export const panesOf = (side: Side): string[] => side.groups.flatMap((group) => [...group.tabs]);

const holds = (side: Side, pane: string) => side.groups.some((group) => group.tabs.includes(pane));
/** the agent's composer needs its own range (#364), whichever tab of its side shows */
const minOf = (side: Side) => (holds(side, "agent") ? AGENT_MIN_WIDTH : LIMITS.sideMin);
const maxOf = (side: Side) => (holds(side, "agent") ? AGENT_MAX_WIDTH : MAX_WIDTH);
/** what a side opens at untouched: its widest pane's own width, so switching tabs never moves the canvas */
const naturalOf = (side: Side) =>
	holds(side, "agent") ? AGENT_MIN_WIDTH : holds(side, "properties") ? PROPERTIES_WIDTH : PAGES_WIDTH;
const clampTo = (side: Side, width: number) => Math.min(maxOf(side), Math.max(minOf(side), Math.round(width)));

/** the narrowest side `id` may be drawn at as the layout stands */
export const sideMin = (layout: Layout, id: SideId): number => minOf(layout[id]);
/** the width side `id` opens at */
export const widthOf = (side: Side): number => clampTo(side, side.width ?? naturalOf(side));

const hasPanes = (side: Side) => side.groups.length > 0;
const wantsOpen = (side: Side) => side.open && hasPanes(side);
const outerOf = (side: Side, open: boolean) => (open ? widthOf(side) : hasPanes(side) ? RAIL_WIDTH : 0);

export interface SideFit {
	readonly open: boolean;
	/** the width it opens at, open or not: contents are laid out at it and clipped */
	readonly width: number;
	/** what it takes from the window: its width, its rail, or nothing when it holds nothing */
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
 * the side touched least recently closes to its rail, then the other. Nothing
 * is written back, so a side closed this way opens by itself once there is room.
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
		width: widthOf(layout[id]),
		outer: outerOf(layout[id], open[id]),
		shown: open[id] ? layout[id].groups.map((group) => group.active) : [],
	});
	return { left: one("left"), right: one("right"), canvas: canvas() };
}

/** the widest a side may be dragged while the other stays as it shows now */
export function maxWidth(layout: Layout, id: SideId, env: Env): number {
	const f = fitWindow(layout, env);
	return Math.min(maxOf(layout[id]), env.width - LIMITS.canvasMin - f[other(id)].outer);
}

/**
 * Each group's height: its share of `total`, none under the minimum. A group
 * pushed under it is held there and the others pay, largest first. Whole
 * pixels, the last group taking the remainder.
 */
export function stackHeights(weights: readonly number[], total: number, min: number = LIMITS.groupMin): number[] {
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

/** a divider between group `i` and `i + 1` dragged by `dy`, both kept at or over the minimum */
export function resizeSplit(
	heights: readonly number[],
	i: number,
	dy: number,
	min: number = LIMITS.groupMin,
): number[] {
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

interface DraftGroup {
	tabs: string[];
	active: string;
	weight: number;
}

interface DraftSide {
	groups: DraftGroup[];
	open: boolean;
	width: number | null;
	touched: number;
}

interface Draft {
	v: 3;
	clock: number;
	left: DraftSide;
	right: DraftSide;
}

function draft(layout: Layout): Draft {
	const copy = (side: Side): DraftSide => ({
		...side,
		groups: side.groups.map((group) => ({ ...group, tabs: [...group.tabs] })),
	});
	return { ...layout, left: copy(layout.left), right: copy(layout.right) };
}

function touch(next: Draft, id: SideId): void {
	next.clock += 1;
	next[id].touched = next.clock;
}

/** where the tabs stand: a drop that leaves them where they were changes nothing, the lit one included */
const shapeOf = (layout: Layout) => JSON.stringify(SIDES.map((id) => layout[id].groups.map((group) => group.tabs)));

function move(layout: Layout, pane: string, to: Drop): Layout {
	const from = whereIs(layout, pane);
	if (from === null) return layout;
	const lone = layout[from.side].groups[from.group]?.tabs.length === 1;
	const sameGroup = from.side === to.side && from.group === to.group;
	// a lone tab dropped back in its own row, or split against its own pane, goes nowhere
	if (lone && sameGroup) return layout;

	const next = draft(layout);
	const sources = next[from.side].groups;
	const targets = next[to.side].groups;
	const source = sources[from.group] as DraftGroup;
	const target = targets[to.group];
	const at = source.tabs.indexOf(pane);

	// out of where it was; the neighbour before it takes the light
	source.tabs.splice(at, 1);
	if (source.active === pane && source.tabs.length > 0) source.active = source.tabs[Math.max(0, at - 1)] as string;

	if (to.kind === "row") {
		if (target === undefined) targets.push({ tabs: [pane], active: pane, weight: 1 });
		else {
			// a slot counted with the tab still in the row, before it lifted
			const index = Math.min(target.tabs.length, sameGroup && at < to.index ? to.index - 1 : to.index);
			target.tabs.splice(Math.max(0, index), 0, pane);
			target.active = pane;
		}
	} else {
		if (target === undefined) return layout;
		// a fresh split halves the group it splits
		target.weight /= 2;
		targets.splice(targets.indexOf(target) + (to.where === "below" ? 1 : 0), 0, {
			tabs: [pane],
			active: pane,
			weight: target.weight,
		});
	}

	// a group left empty goes, its height to the group above it, or below when it was on top
	if (source.tabs.length === 0) {
		const index = sources.indexOf(source);
		const heir = sources[index - 1] ?? sources[index + 1];
		if (heir !== undefined) heir.weight += source.weight;
		sources.splice(index, 1);
	}
	if (shapeOf(layout) === shapeOf(next)) return layout;
	if (next[from.side].groups.length === 0) next[from.side].open = false;
	next[to.side].open = true;
	touch(next, to.side);
	return next;
}

export function reduce(layout: Layout, action: Action, env?: Env): Layout {
	switch (action.type) {
		case "show": {
			const at = whereIs(layout, action.pane);
			if (at === null) return layout;
			const next = draft(layout);
			const side = next[at.side];
			(side.groups[at.group] as DraftGroup).active = action.pane;
			side.open = true;
			touch(next, at.side);
			return next;
		}
		case "move":
			return move(layout, action.pane, action.to);
		case "open": {
			if (action.open && !hasPanes(layout[action.side])) return layout;
			const next = draft(layout);
			next[action.side].open = action.open;
			touch(next, action.side);
			return next;
		}
		case "width": {
			const side = layout[action.side];
			if (!hasPanes(side)) return layout;
			const limit = env === undefined ? maxOf(side) : maxWidth(layout, action.side, env);
			const next = draft(layout);
			next[action.side].width = clampTo(side, Math.min(action.width, Math.max(minOf(side), limit)));
			next[action.side].open = true;
			if (side.touched !== layout.clock) touch(next, action.side);
			return next;
		}
		case "weights": {
			const next = draft(layout);
			next[action.side].groups.forEach((group, index) => {
				const weight = action.weights[index];
				if (weight !== undefined && Number.isFinite(weight) && weight > 0) group.weight = weight;
			});
			return next;
		}
		case "touch": {
			if (layout[action.side].touched === layout.clock) return layout;
			const next = draft(layout);
			touch(next, action.side);
			return next;
		}
		case "reset":
			return defaultLayout();
	}
}

/** what a drop would do, judged before it lands */
export function check(layout: Layout, pane: string, to: Drop, env: Env): Verdict {
	const next = move(layout, pane, to);
	if (next === layout) return "noop";
	const side = next[to.side];
	if (side.groups.length > LIMITS.groups) return "cap";
	if (side.groups.length * LIMITS.groupMin > env.height) return "height";
	if (!fitWindow(layout, env)[to.side].open) {
		// the other side closes to its rail for it if it must, and the canvas keeps its floor even so
		const room = env.width - outerOf(next[other(to.side)], false) - widthOf(side);
		if (room < LIMITS.canvasMin) return "floor";
	}
	return "ok";
}

/* ── storage ─────────────────────────────────────────────────────────── */

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isWeight = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * The guard `remembered.ts` reads a stored layout through: exactly these panes,
 * each once in one group, every group's lit tab its own, no side past three
 * groups, and no width a side is never left at. Anything else is discarded,
 * never migrated.
 */
export function isLayout(panes: readonly string[]) {
	return (value: unknown): value is Layout => {
		if (!isObject(value) || value.v !== 3 || !isCount(value.clock)) return false;
		const known = new Set(panes);
		const placed = new Set<string>();
		for (const id of SIDES) {
			const side = value[id];
			if (!isObject(side) || !Array.isArray(side.groups) || side.groups.length > LIMITS.groups) return false;
			if (typeof side.open !== "boolean" || !isCount(side.touched)) return false;
			const width = side.width;
			if (width !== null && !(typeof width === "number" && width >= LIMITS.sideMin && width <= LIMITS.sideMax))
				return false;
			for (const group of side.groups as unknown[]) {
				if (!isObject(group) || !Array.isArray(group.tabs) || group.tabs.length === 0) return false;
				if (!isWeight(group.weight) || !group.tabs.includes(group.active)) return false;
				for (const pane of group.tabs as unknown[]) {
					if (typeof pane !== "string" || !known.has(pane) || placed.has(pane)) return false;
					placed.add(pane);
				}
			}
		}
		return placed.size === known.size;
	};
}
