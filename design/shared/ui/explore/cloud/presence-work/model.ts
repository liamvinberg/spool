/**
 * The shared world behind every take on this page: who is on the canvas, what
 * their agents were asked, and the writes those turns land, all on one clock in
 * seconds. Each take reads the same scene and draws it its own way, so a row is
 * a choice between drawings of one afternoon rather than between afternoons.
 */

export type Who = "you" | "ana" | "ben" | "cleo" | "dev";

export interface Member {
	readonly id: Who;
	/** what a person is called, in a sentence */
	readonly name: string;
	readonly color: string;
	/** the agent this person brought, if they run one */
	readonly engine: "claude" | "codex" | null;
}

/**
 * Identity colours. The canvas tokens have one accent, the thread, and it stays
 * yours: your own agent keeps the hand's colour it ships with today. Everyone
 * else wears a colour the cloud would assign on join, picked to sit at one
 * lightness on the 161616 canvas so none of them reads as louder.
 */
export const MEMBERS: Record<Who, Member> = {
	you: { id: "you", name: "You", color: "#f5391a", engine: "claude" },
	ana: { id: "ana", name: "Ana", color: "#e8a23e", engine: "claude" },
	ben: { id: "ben", name: "Ben", color: "#62a8f2", engine: "codex" },
	cleo: { id: "cleo", name: "Cleo", color: "#79c98a", engine: "claude" },
	dev: { id: "dev", name: "Dev", color: "#c59bf0", engine: null },
};

/** how the machine prints an agent: whose it is, and which one */
export function agentName(who: Who): string {
	const member = MEMBERS[who];
	if (who === "you") return `your ${member.engine ?? "agent"}`;
	return `${who} · ${member.engine ?? "agent"}`;
}

/* ---------- the world ---------- */

export type ScreenKind = "menu" | "cart" | "checkout" | "receipt" | "account" | "plain";

export interface FrameDef {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly kind: ScreenKind;
	/** for a plain screen: its title, so thirty thumbnails are not one picture */
	readonly title?: string | undefined;
	readonly seed?: number | undefined;
}

export const PHONE_W = 390;
export const PHONE_H = 844;

export interface Write {
	readonly at: number;
	readonly block: string;
	/** what the write turns on in the screen; absent for a write that changes nothing you can see */
	readonly feature?: string | undefined;
	/** the change, as the machine would print it */
	readonly note: string;
}

export interface Turn {
	readonly id: string;
	readonly who: Who;
	readonly frame: string;
	/** what the person asked for, in their words */
	readonly ask: string;
	readonly start: number;
	readonly end: number;
	readonly writes: readonly Write[];
	/** a person's own hand edit rather than an agent's turn */
	readonly hand?: boolean | undefined;
}

/** a person's pointer: world positions at times, eased between */
export interface PointerPath {
	readonly who: Who;
	readonly keys: readonly (readonly [number, number, number])[];
}

export interface Camera {
	/** the world point at the viewport's top-left corner */
	readonly x: number;
	readonly y: number;
	readonly k: number;
}

export interface Beat {
	readonly at: number;
	readonly label: string;
}

export interface Scene {
	readonly name: string;
	readonly duration: number;
	/** where the loop opens, so a still lands on the moment that matters */
	readonly poster: number;
	readonly frames: readonly FrameDef[];
	readonly turns: readonly Turn[];
	readonly pointers: readonly PointerPath[];
	readonly camera: (t: number) => Camera;
	readonly beats: readonly Beat[];
	readonly zoom: string;
	/** the frame you have entered, and when */
	readonly entered?: { readonly frame: string; readonly from: number; readonly to: number } | undefined;
	/** your own pointer, drawn only where you are acting in the scene */
	readonly you?: PointerPath | undefined;
	/** who the camera is riding, over which span */
	readonly follow?: readonly { readonly from: number; readonly to: number; readonly target: Who; readonly agent: boolean }[] | undefined;
	/** a catch-up scene: the story happened before the loop, between these clock times */
	readonly away?: { readonly left: string; readonly back: string; readonly story: number } | undefined;
}

/** the viewport between the pages rail and the dock strip */
export const VIEW_W = 1440 - 248 - 44;
export const VIEW_H = 900 - 44;

/* ---------- arithmetic ---------- */

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** the house curve, close enough: quick out of the gate, long settle */
export const easeOut = (u: number) => 1 - (1 - clamp(u)) ** 3;
export const easeInOut = (u: number) => {
	const x = clamp(u);
	return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

export function alpha(hex: string, a: number): string {
	const n = Number.parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp(a)})`;
}

/** a pointer's position at t, eased key to key so it never moves at a constant rate */
export function pathAt(keys: PointerPath["keys"], t: number): { x: number; y: number } {
	const first = keys[0];
	if (first === undefined) return { x: 0, y: 0 };
	if (t <= first[0]) return { x: first[1], y: first[2] };
	for (let i = 1; i < keys.length; i += 1) {
		const a = keys[i - 1];
		const b = keys[i];
		if (a === undefined || b === undefined) continue;
		if (t <= b[0]) {
			const u = easeInOut((t - a[0]) / Math.max(0.001, b[0] - a[0]));
			return { x: lerp(a[1], b[1], u), y: lerp(a[2], b[2], u) };
		}
	}
	const last = keys[keys.length - 1] ?? first;
	return { x: last[1], y: last[2] };
}

/** features a frame shows at t, each with how long it has been on */
export function featuresAt(turns: readonly Turn[], frame: string, t: number): Record<string, number> {
	const on: Record<string, number> = {};
	for (const turn of turns) {
		if (turn.frame !== frame) continue;
		for (const write of turn.writes) {
			if (write.feature !== undefined && write.at <= t) on[write.feature] = t - write.at;
		}
	}
	return on;
}

export function featureKey(features: Record<string, number>, settle = 0.6): string {
	return Object.entries(features)
		.map(([name, age]) => (age >= settle ? name : `${name}@${age.toFixed(2)}`))
		.sort()
		.join(",");
}

/** the one envelope a plate lives on: 140 opening, 320 held, then a long drain */
export function plate(age: number): number {
	if (age < 0) return 0;
	if (age < 0.14) return easeOut(age / 0.14);
	if (age < 0.46) return 1;
	return 1 - easeOut((age - 0.46) / 0.9);
}

/** a machine line typed on at a steady clip, so it reads as written rather than shown */
export function typed(text: string, age: number, perSecond = 46): string {
	if (age <= 0) return "";
	return text.slice(0, Math.ceil(age * perSecond));
}

export type TurnPhase = "before" | "reading" | "writing" | "done";

export function phaseOf(turn: Turn, t: number): TurnPhase {
	if (t < turn.start) return "before";
	if (t >= turn.end) return "done";
	const first = turn.writes[0];
	return first !== undefined && t >= first.at ? "writing" : "reading";
}

export function landed(turn: Turn, t: number): readonly Write[] {
	return turn.writes.filter((write) => write.at <= t);
}

/* ---------- screen space ---------- */

export function toScreen(cam: Camera, x: number, y: number): { x: number; y: number } {
	return { x: (x - cam.x) * cam.k, y: (y - cam.y) * cam.k };
}

export function frameRect(cam: Camera, frame: FrameDef): { x: number; y: number; w: number; h: number } {
	const at = toScreen(cam, frame.x, frame.y);
	return { x: at.x, y: at.y, w: PHONE_W * cam.k, h: PHONE_H * cam.k };
}

export function onScreen(x: number, y: number, pad = 0): boolean {
	return x >= pad && y >= pad && x <= VIEW_W - pad && y <= VIEW_H - pad;
}

export type Side = "left" | "right" | "top" | "bottom";

/** where a point off screen meets the viewport's edge, on the line from the centre */
export function edgeOf(x: number, y: number, pad: number): { x: number; y: number; side: Side } {
	const cx = VIEW_W / 2;
	const cy = VIEW_H / 2;
	const dx = x - cx;
	const dy = y - cy;
	const sx = dx === 0 ? Number.POSITIVE_INFINITY : (dx > 0 ? VIEW_W - pad - cx : pad - cx) / dx;
	const sy = dy === 0 ? Number.POSITIVE_INFINITY : (dy > 0 ? VIEW_H - pad - cy : pad - cy) / dy;
	const s = Math.min(Math.abs(sx), Math.abs(sy));
	const side: Side = Math.abs(sx) < Math.abs(sy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
	return { x: cx + dx * s, y: cy + dy * s, side };
}

/** a value that steps at given times, eased from wherever it was each time it steps */
export function steppedAt(steps: readonly (readonly [number, number, number])[], t: number, dur: number): { x: number; y: number } {
	const first = steps[0];
	if (first === undefined) return { x: 0, y: 0 };
	let x = first[1];
	let y = first[2];
	for (let i = 1; i < steps.length; i += 1) {
		const step = steps[i];
		if (step === undefined || step[0] > t) break;
		const next = steps[i + 1];
		const until = next !== undefined && next[0] <= t ? next[0] : t;
		const u = easeInOut((until - step[0]) / dur);
		x = lerp(x, step[1], u);
		y = lerp(y, step[2], u);
	}
	return { x, y };
}
