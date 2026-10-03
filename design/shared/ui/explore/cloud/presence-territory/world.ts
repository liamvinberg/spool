import type { CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import type { ActorId } from "./cast";

/**
 * The model every take reads. A scenario is a script on one clock: where each
 * person's pointer is, which frame each agent holds and what it is doing to it,
 * and where the camera stands. Takes are only ways of drawing the same script,
 * so a difference between two rows is a difference in design and never in what
 * happened.
 */

export interface V {
	readonly x: number;
	readonly y: number;
}

/** the camera: the world point at the viewport's centre, and the zoom */
export interface Cam {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

export type Key<T> = readonly [number, T];

export interface FrameSpec {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly screen: CoffeeScreenName;
	/** shared components this frame renders */
	readonly uses: readonly string[];
	/** appears on the canvas at this time; absent means always there */
	readonly bornAt?: number | undefined;
}

export const PHONE = { w: 390, h: 844 } as const;

/** the viewport between the pages rail and the dock strip */
export const VIEW = { w: 1148, h: 856 } as const;

export type Mode = "read" | "write" | "shot" | "wait";

/**
 * One stretch of an agent's turn. A write span names the blocks it lands in, in
 * order, and lands a write about every 0.6s, the cadence the shipped capture has.
 */
export interface Span {
	readonly actor: ActorId;
	readonly from: number;
	readonly to: number;
	readonly frame: string;
	readonly mode: Mode;
	readonly blocks?: readonly number[] | undefined;
	/** a shared file this span writes, rather than the frame's own source */
	readonly file?: string | undefined;
}

export interface PersonTrack {
	readonly actor: ActorId;
	/** world positions; null is not on the canvas at all */
	readonly keys: readonly Key<V | null>[];
}

/** what happened while you were away, for the scenario that starts on your return */
export interface Ledger {
	readonly actor: ActorId;
	readonly frame: string;
	readonly writes: number;
	readonly blocks: readonly number[];
	readonly file?: string | undefined;
	/** minutes ago it stopped */
	readonly ago: number;
}

export interface Scenario {
	readonly id: string;
	readonly duration: number;
	/** the moment a still of this frame should catch */
	readonly poster: number;
	readonly frames: readonly FrameSpec[];
	readonly camera: readonly Key<Cam>[];
	readonly people: readonly PersonTrack[];
	/** your own pointer, in world space; null hides it */
	readonly you: readonly Key<V | null>[];
	/** a block you have selected */
	readonly selection?: readonly Key<{ frame: string; block: number } | null>[] | undefined;
	readonly spans: readonly Span[];
	readonly follow?: readonly Key<ActorId | null>[] | undefined;
	readonly ledger?: readonly Ledger[] | undefined;
	/** what you have looked at since you came back, by frame, at the moment you did */
	readonly seen?: readonly Key<string>[] | undefined;
	readonly beats: readonly Key<string>[];
	readonly pages: readonly { name: string; frames: readonly string[] }[];
}

/* ---------- time ---------- */

export function ease(u: number): number {
	const c = Math.min(1, Math.max(0, u));
	return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

export function easeOut(u: number): number {
	const c = Math.min(1, Math.max(0, u));
	return 1 - (1 - c) ** 3;
}

function bracket<T>(t: number, keys: readonly Key<T>[]): [Key<T>, Key<T>, number] {
	const first = keys[0];
	if (first === undefined) throw new Error("no keys");
	if (t <= first[0]) return [first, first, 0];
	for (let i = 1; i < keys.length; i += 1) {
		const b = keys[i];
		const a = keys[i - 1];
		if (a !== undefined && b !== undefined && t <= b[0]) return [a, b, (t - a[0]) / Math.max(1e-6, b[0] - a[0])];
	}
	const last = keys[keys.length - 1] ?? first;
	return [last, last, 0];
}

export function stepAt<T>(t: number, keys: readonly Key<T>[]): T {
	let value = keys[0]?.[1] as T;
	for (const [at, v] of keys) if (at <= t) value = v;
	return value;
}

export function pointAt(t: number, keys: readonly Key<V | null>[]): V | null {
	const [a, b, u] = bracket(t, keys);
	if (a[1] === null) return null;
	if (b[1] === null) return a[1];
	const e = ease(u);
	return { x: a[1].x + (b[1].x - a[1].x) * e, y: a[1].y + (b[1].y - a[1].y) * e };
}

export function camAt(t: number, keys: readonly Key<Cam>[]): Cam {
	const [a, b, u] = bracket(t, keys);
	const e = ease(u);
	// zoom travels in log space so a zoom out and back reads as one even motion
	const z = Math.exp(Math.log(a[1].z) + (Math.log(b[1].z) - Math.log(a[1].z)) * e);
	return { x: a[1].x + (b[1].x - a[1].x) * e, y: a[1].y + (b[1].y - a[1].y) * e, z };
}

/* ---------- space ---------- */

export function toScreen(cam: Cam, p: V): V {
	return { x: (p.x - cam.x) * cam.z + VIEW.w / 2, y: (p.y - cam.y) * cam.z + VIEW.h / 2 };
}

export function rectToScreen(cam: Cam, r: Rect): Rect {
	const p = toScreen(cam, r);
	return { x: p.x, y: p.y, w: r.w * cam.z, h: r.h * cam.z };
}

export function onScreen(p: V, pad = 0): boolean {
	return p.x >= -pad && p.y >= -pad && p.x <= VIEW.w + pad && p.y <= VIEW.h + pad;
}

export function rectOnScreen(r: Rect): boolean {
	return r.x + r.w > 0 && r.y + r.h > 0 && r.x < VIEW.w && r.y < VIEW.h;
}

/**
 * Where a ray from the viewport centre toward an off-screen point leaves the
 * viewport, inset by `inset`, and which side it leaves by.
 */
export function edgePoint(p: V, inset: number): { at: V; side: "left" | "right" | "top" | "bottom"; angle: number } {
	const cx = VIEW.w / 2;
	const cy = VIEW.h / 2;
	const dx = p.x - cx;
	const dy = p.y - cy;
	const hx = cx - inset;
	const hy = cy - inset;
	const sx = dx === 0 ? Number.POSITIVE_INFINITY : hx / Math.abs(dx);
	const sy = dy === 0 ? Number.POSITIVE_INFINITY : hy / Math.abs(dy);
	const s = Math.min(sx, sy);
	const at = { x: cx + dx * s, y: cy + dy * s };
	const side = sx < sy ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
	return { at, side, angle: Math.atan2(dy, dx) };
}

/**
 * The blocks of each coffee screen at its full size inside a 390×844 phone,
 * read off `coffee-screens.tsx` at scale "full". A write lands in one of these.
 */
const BLOCKS: Readonly<Record<CoffeeScreenName, readonly Rect[]>> = {
	menu: [
		{ x: 24, y: 32, w: 342, h: 48 },
		{ x: 24, y: 98, w: 342, h: 62 },
		{ x: 24, y: 168, w: 342, h: 62 },
		{ x: 24, y: 238, w: 342, h: 62 },
		{ x: 24, y: 772, w: 342, h: 48 },
	],
	cart: [
		{ x: 24, y: 32, w: 342, h: 28 },
		{ x: 24, y: 78, w: 342, h: 50 },
		{ x: 24, y: 136, w: 342, h: 50 },
		{ x: 24, y: 731, w: 342, h: 23 },
		{ x: 24, y: 772, w: 342, h: 48 },
	],
	receipt: [
		{ x: 167, y: 347, w: 56, h: 56 },
		{ x: 24, y: 415, w: 342, h: 28 },
		{ x: 24, y: 455, w: 342, h: 42 },
	],
};

/** which blocks of a screen render the shared price row */
export const PRICE_ROWS: Readonly<Record<CoffeeScreenName, readonly number[]>> = {
	menu: [1, 2, 3],
	cart: [1, 2],
	receipt: [],
};

export const PRICE_ROW = "shared/ui/price-row.tsx";

export function frameRect(f: FrameSpec): Rect {
	return { x: f.x, y: f.y, w: PHONE.w, h: PHONE.h };
}

export function blockRect(f: FrameSpec, i: number): Rect {
	const b = BLOCKS[f.screen][i] ?? BLOCKS[f.screen][0] ?? { x: 0, y: 0, w: PHONE.w, h: PHONE.h };
	return { x: f.x + b.x, y: f.y + b.y, w: b.w, h: b.h };
}

export function blocksOf(f: FrameSpec): number {
	return BLOCKS[f.screen].length;
}

export function frameAt(frames: readonly FrameSpec[], p: V, t: number): FrameSpec | undefined {
	return frames.find(
		(f) => (f.bornAt === undefined || t >= f.bornAt) && p.x >= f.x && p.x <= f.x + PHONE.w && p.y >= f.y && p.y <= f.y + PHONE.h,
	);
}

/* ---------- presence ---------- */

export interface AgentNow {
	readonly actor: ActorId;
	readonly span: Span;
	readonly frame: string;
	readonly mode: Mode;
	/** the block being written now, while writing or waiting */
	readonly block: number | null;
	/** seconds into this span */
	readonly into: number;
}

export function blockIn(span: Span, t: number): number | null {
	const blocks = span.blocks;
	if (blocks === undefined || blocks.length === 0) return null;
	const u = (t - span.from) / Math.max(1e-6, span.to - span.from);
	return blocks[Math.min(blocks.length - 1, Math.max(0, Math.floor(u * blocks.length)))] ?? null;
}

export function agentsAt(scn: Scenario, t: number): AgentNow[] {
	const now: AgentNow[] = [];
	for (const span of scn.spans) {
		if (t < span.from || t >= span.to) continue;
		now.push({ actor: span.actor, span, frame: span.frame, mode: span.mode, block: blockIn(span, t), into: t - span.from });
	}
	return now;
}

export interface WriteEvent {
	readonly t: number;
	readonly actor: ActorId;
	readonly frame: string;
	readonly block: number;
	readonly file?: string | undefined;
}

const CADENCE = 0.6;

export function writesOf(scn: Scenario): WriteEvent[] {
	const events: WriteEvent[] = [];
	for (const span of scn.spans) {
		if (span.mode !== "write") continue;
		for (let at = span.from + 0.15; at < span.to; at += CADENCE) {
			const block = blockIn(span, at);
			if (block === null) continue;
			events.push({ t: at, actor: span.actor, frame: span.frame, block, file: span.file });
		}
	}
	return events.sort((a, b) => a.t - b.t);
}

/** the writes that landed in the last `window` seconds, newest last */
export function recentWrites(events: readonly WriteEvent[], t: number, window: number): WriteEvent[] {
	return events.filter((e) => e.t <= t && e.t > t - window);
}

/**
 * The frames a span reaches: its own frame, or every frame that renders the
 * shared file it writes, with the blocks that file draws in each.
 */
export function reachOf(scn: Scenario, span: Span, t: number): { frame: FrameSpec; blocks: readonly number[] }[] {
	const live = scn.frames.filter((f) => f.bornAt === undefined || t >= f.bornAt);
	if (span.file === undefined) {
		const own = live.find((f) => f.id === span.frame);
		return own === undefined ? [] : [{ frame: own, blocks: span.blocks ?? [] }];
	}
	const file = span.file;
	return live.filter((f) => f.uses.includes(file)).map((f) => ({ frame: f, blocks: PRICE_ROWS[f.screen] }));
}

export function frameById(scn: Scenario, id: string): FrameSpec | undefined {
	return scn.frames.find((f) => f.id === id);
}

/** 0 → 1 → 0 over a span's life, with `fade` seconds at each end */
export function envelope(t: number, from: number, to: number, fade = 0.35): number {
	if (t < from || t > to) return 0;
	return Math.min(1, (t - from) / fade, (to - t) / fade);
}

/** how much a key-held value has settled since it last changed, 0 → 1 over `d` */
export function since<T>(t: number, keys: readonly Key<T>[]): number {
	let at = 0;
	for (const [k] of keys) if (k <= t) at = k;
	return t - at;
}
