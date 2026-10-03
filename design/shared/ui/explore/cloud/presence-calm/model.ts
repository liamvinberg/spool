/**
 * The world every presence-calm take is drawn over: one team canvas, twenty-four
 * kaffe frames in three flows, five people and four agents, and the arithmetic
 * that says where each of them is at a given second.
 *
 * Everything here is a pure function of time. A take never keeps state of its own,
 * so scrubbing the clock and replaying it give the same picture.
 */

export const PHONE_W = 390;
export const PHONE_H = 844;

/** the canvas viewport inside the shell: 1440 less the pages rail and the shut dock */
export const VIEW_W = 1148;
export const VIEW_H = 856;

export type Screen = "menu" | "cart" | "receipt" | "home";

export interface FrameDef {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly screen: Screen;
}

const COLS = [0, 540, 1080, 1620, 3000, 3540, 4080, 4620] as const;
const ROWS = [0, 1100, 2200] as const;

const GRID: readonly (readonly [string, Screen])[][] = [
	[
		["menu", "menu"],
		["cart", "cart"],
		["checkout", "cart"],
		["receipt", "receipt"],
		["signin", "home"],
		["profile", "cart"],
		["settings", "menu"],
		["orders", "receipt"],
	],
	[
		["menu--empty", "menu"],
		["cart--empty", "cart"],
		["checkout--error", "cart"],
		["receipt--pickup", "receipt"],
		["signin--code", "home"],
		["profile--edit", "cart"],
		["settings--alerts", "menu"],
		["orders--empty", "receipt"],
	],
	[
		["welcome", "home"],
		["location", "menu"],
		["notify", "cart"],
		["ready", "home"],
		["stamps", "menu"],
		["reward", "cart"],
		["history", "receipt"],
		["card", "receipt"],
	],
];

export const FRAMES: readonly FrameDef[] = GRID.flatMap((row, r) =>
	row.map(([name, screen], c) => ({ name, screen, x: COLS[c] ?? 0, y: ROWS[r] ?? 0 })),
);

const BY_NAME = new Map(FRAMES.map((frame) => [frame.name, frame]));

export function frameOf(name: string): FrameDef {
	return BY_NAME.get(name) ?? { name, x: 0, y: 0, screen: "menu" };
}

export function centerOf(name: string): Pt {
	const frame = frameOf(name);
	return { x: frame.x + PHONE_W / 2, y: frame.y + PHONE_H / 2 };
}

/** the frame a world point sits inside, if any */
export function frameAt(p: Pt): FrameDef | undefined {
	return FRAMES.find((f) => p.x >= f.x && p.x <= f.x + PHONE_W && p.y >= f.y && p.y <= f.y + PHONE_H);
}

/** the four blocks a write can land in, in a phone's own units */
export const BLOCKS: readonly { y: number; h: number }[] = [
	{ y: 34, h: 118 },
	{ y: 168, h: 290 },
	{ y: 476, h: 170 },
	{ y: 690, h: 112 },
];
export const BLOCK_X = 22;
export const BLOCK_W = PHONE_W - 44;

/* ── the cast ─────────────────────────────────────────────────────────────── */

export type PersonId = "ana" | "jonas" | "mira" | "sam";
/** an agent is named by its owner; `you` is the viewer's own */
export type AgentId = "you" | "ana" | "jonas" | "mira";

export const PEOPLE: readonly PersonId[] = ["ana", "jonas", "mira", "sam"];
export const AGENTS: readonly AgentId[] = ["you", "ana", "jonas", "mira"];

export const PERSON_NAME: Record<PersonId, string> = { ana: "Ana", jonas: "Jonas", mira: "Mira", sam: "Sam" };
/** the agent a person brought, if they brought one */
export function agentOf(person: PersonId): AgentId | undefined {
	return person === "sam" ? undefined : person;
}

export const AGENT_KIND: Record<AgentId, string> = { you: "claude", ana: "claude", jonas: "codex", mira: "claude" };

/** how an agent is written where the machine speaks: owner, then tool */
export function agentLabel(id: AgentId): string {
	return id === "you" ? `your ${AGENT_KIND[id]}` : `${id} · ${AGENT_KIND[id]}`;
}

/* ── time ─────────────────────────────────────────────────────────────────── */

export interface Pt {
	x: number;
	y: number;
}
export interface Cam {
	x: number;
	y: number;
	k: number;
}
export type Key<T> = { t: number } & T;

export function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** in and out on a cubic: what every eased key in these scenes travels on */
export function ease(v: number): number {
	const x = clamp01(v);
	return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function easeOut(v: number): number {
	const x = clamp01(v);
	return 1 - (1 - x) ** 3;
}

export function lerp(a: number, b: number, v: number): number {
	return a + (b - a) * v;
}

/**
 * The value of a keyed track at t. Between two keys it travels on `ease`; a key
 * may carry its own `d`, the seconds the move into it takes, so a track can hold
 * still and then move briskly rather than drifting the whole gap.
 */
export function sample<T extends Record<keyof T, number>>(keys: readonly (Key<T> & { d?: number })[], t: number): T {
	const first = keys[0];
	if (first === undefined) throw new Error("empty track");
	const fields = (Object.keys(first) as (keyof T & string)[]).filter((name) => name !== "t" && name !== "d");
	const pick = (key: Key<T>, other: Key<T>, v: number): T => {
		const out = {} as Record<keyof T, number>;
		for (const name of fields) out[name] = lerp(key[name] as number, other[name] as number, v);
		return out as T;
	};
	let prev = first;
	for (const key of keys) {
		if (key.t > t) {
			const span = key.d ?? key.t - prev.t;
			const start = key.t - span;
			const v = span <= 0 ? 1 : ease((t - start) / span);
			return pick(prev, key, v);
		}
		prev = key;
	}
	return pick(prev, prev, 0);
}

/* ── agents ───────────────────────────────────────────────────────────────── */

export interface Write {
	readonly t: number;
	readonly block: number;
}

export interface Run {
	readonly frame: string;
	readonly from: number;
	readonly to: number;
	readonly kind: "read" | "write";
	readonly writes: readonly Write[];
}

/** a write run whose writes land every `every` seconds, walking the blocks */
export function writeRun(frame: string, from: number, to: number, every: number, start = 0): Run {
	const writes: Write[] = [];
	let i = 0;
	for (let t = from + every * 0.5; t < to - 0.2; t += every) {
		// a fixed walk over the blocks that does not read as a cycle
		const block = [0, 1, 1, 2, 3, 2, 1, 0, 2, 3][(i + start) % 10] ?? 0;
		writes.push({ t: Math.round(t * 100) / 100, block });
		i += 1;
	}
	return { frame, from, to, kind: "write", writes };
}

export function readRun(frame: string, from: number, to: number): Run {
	return { frame, from, to, kind: "read", writes: [] };
}

export interface AgentNow {
	readonly run: Run;
	/** the last write that has landed in this run, and how long ago */
	readonly last: Write | undefined;
	readonly since: number;
	/** the write before it, so a mark can travel between the two */
	readonly before: Write | undefined;
	readonly landed: number;
}

export function agentAt(runs: readonly Run[] | undefined, t: number): AgentNow | undefined {
	const run = runs?.find((r) => t >= r.from && t < r.to);
	if (run === undefined) return undefined;
	const done = run.writes.filter((w) => w.t <= t);
	const last = done[done.length - 1];
	return {
		run,
		last,
		before: done[done.length - 2],
		since: last === undefined ? Number.POSITIVE_INFINITY : t - last.t,
		landed: done.length,
	};
}

/** write runs that finished on or before t, newest last */
export function settledRuns(runs: readonly Run[] | undefined, t: number): Run[] {
	return (runs ?? []).filter((r) => r.kind === "write" && r.to <= t);
}

/** the plate envelope the shipped hand uses: 140 open, 320 held, 400 leaving */
export function plate(since: number): { opacity: number; scale: number } {
	if (since < 0 || since > 0.86) return { opacity: 0, scale: 1 };
	if (since < 0.14) {
		const v = easeOut(since / 0.14);
		return { opacity: 0.15 * v, scale: lerp(0.34, 1, v) };
	}
	if (since < 0.46) return { opacity: 0.15, scale: 1 };
	const v = (since - 0.46) / 0.4;
	return { opacity: 0.15 * (1 - v * v), scale: 1 };
}

/* ── people ───────────────────────────────────────────────────────────────── */

export interface PersonNow {
	readonly at: Pt;
	/** seconds since the pointer last moved */
	readonly still: number;
}

export function personAt(keys: readonly (Key<Pt> & { d?: number })[] | undefined, t: number): PersonNow | undefined {
	if (keys === undefined || keys.length === 0) return undefined;
	const at = sample(keys, t);
	// moving is any key span that is travelling at t
	let lastMove = Number.NEGATIVE_INFINITY;
	let prev = keys[0];
	for (const key of keys) {
		if (prev !== undefined && (key.x !== prev.x || key.y !== prev.y)) {
			const start = key.t - (key.d ?? key.t - prev.t);
			if (t >= start) lastMove = Math.min(t, key.t);
		}
		prev = key;
	}
	return { at, still: t - lastMove };
}

/* ── the viewport ─────────────────────────────────────────────────────────── */

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function project(cam: Cam, p: Pt): Pt {
	return { x: (p.x - cam.x) * cam.k + VIEW_W / 2, y: (p.y - cam.y) * cam.k + VIEW_H / 2 };
}

export function rectOf(cam: Cam, name: string): Rect {
	const frame = frameOf(name);
	const at = project(cam, frame);
	return { x: at.x, y: at.y, w: PHONE_W * cam.k, h: PHONE_H * cam.k };
}

export function onScreen(r: Rect, margin = 0): boolean {
	return r.x + r.w > -margin && r.x < VIEW_W + margin && r.y + r.h > -margin && r.y < VIEW_H + margin;
}

export function pointOnScreen(p: Pt, inset = 0): boolean {
	return p.x >= inset && p.x <= VIEW_W - inset && p.y >= inset && p.y <= VIEW_H - inset;
}

/** a block of a frame, in screen pixels */
export function blockRect(frame: Rect, block: number, k: number): Rect {
	const b = BLOCKS[block] ?? BLOCKS[0] ?? { y: 0, h: 0 };
	return { x: frame.x + BLOCK_X * k, y: frame.y + b.y * k, w: BLOCK_W * k, h: b.h * k };
}

/** a camera that centres a frame at zoom k */
export function camOn(name: string, k: number, dy = 0): Cam {
	const c = centerOf(name);
	return { x: c.x, y: c.y + dy, k };
}

/**
 * Where a ray from the viewport's centre towards p leaves a rectangle inset from
 * the edge: the bearing of something off screen, pinned to the rim.
 */
export function toRim(p: Pt, inset: number): Pt & { edge: "top" | "right" | "bottom" | "left" } {
	const cx = VIEW_W / 2;
	const cy = VIEW_H / 2;
	const dx = p.x - cx;
	const dy = p.y - cy;
	const hx = cx - inset;
	const hy = cy - inset;
	const sx = dx === 0 ? Number.POSITIVE_INFINITY : hx / Math.abs(dx);
	const sy = dy === 0 ? Number.POSITIVE_INFINITY : hy / Math.abs(dy);
	const s = Math.min(sx, sy, 1);
	const edge = sx < sy ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
	return { x: cx + dx * s, y: cy + dy * s, edge };
}

export function distance(a: Pt, b: Pt): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}
