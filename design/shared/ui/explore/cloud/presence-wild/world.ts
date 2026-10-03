import type { CoffeeScreenName } from "shared/ui/demo/coffee-screens";

/**
 * The world every take in presence-wild draws: one page of kaffe holding 32 phone
 * frames, five people and four agents, and a clock in seconds. Everything here is a
 * pure function of time so a scrub lands on the same picture every time, and so the
 * three takes can be compared on one shared story rather than three staged ones.
 */

export interface Vec {
	readonly x: number;
	readonly y: number;
}

/** a camera: world top-left and scale, the way the canvas stores it */
export interface Cam {
	readonly x: number;
	readonly y: number;
	readonly k: number;
}

/** a camera said the way a person thinks of it: what is in the middle, and how close */
export interface View {
	readonly cx: number;
	readonly cy: number;
	readonly k: number;
}

/** the canvas viewport inside a 1440 window: pages rail 248, dock strip 44, shell bar 44 */
export const VIEWPORT = { w: 1148, h: 856 } as const;
export const PHONE = { w: 390, h: 844 } as const;
const PITCH_X = 560;
const PITCH_Y = 1080;

const GRID: readonly (readonly string[])[] = [
	["menu", "menu--search", "menu--closed", "item", "item--milk", "cart", "cart--promo", "cart--empty"],
	["checkout", "checkout--card", "checkout--swish", "checkout--error", "receipt", "receipt--refund", "orders", "orders--empty"],
	["loyalty", "loyalty--reward", "account", "account--signin", "stores", "stores--map", "settings", "settings--privacy"],
	["onboarding", "onboarding--location", "onboarding--push", "gift", "gift--sent", "help", "help--chat", "about"],
];

export interface FrameBox {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly screen: CoffeeScreenName;
}

function screenOf(name: string): CoffeeScreenName {
	if (/^(cart|checkout|gift)/.test(name)) return "cart";
	if (/^(receipt|orders|loyalty|help)/.test(name)) return "receipt";
	return "menu";
}

export const FRAMES: readonly FrameBox[] = GRID.flatMap((names, row) =>
	names.map((name, col) => ({ name, x: col * PITCH_X, y: row * PITCH_Y, w: PHONE.w, h: PHONE.h, screen: screenOf(name) })),
);

export function frame(name: string): FrameBox {
	const found = FRAMES.find((candidate) => candidate.name === name);
	if (found === undefined) throw new Error(`no frame called ${name}`);
	return found;
}

/** a point inside a frame, as fractions of its width and height */
export function spot(name: string, fx: number, fy: number): Vec {
	const box = frame(name);
	return { x: box.x + box.w * fx, y: box.y + box.h * fy };
}

/** the view that puts a frame in the middle of the viewport */
export function on(name: string, k: number, dx = 0, dy = 0): View {
	const box = frame(name);
	return { cx: box.x + box.w / 2 + dx, cy: box.y + box.h / 2 + dy, k };
}

export function camOf(view: View): Cam {
	return { x: view.cx - VIEWPORT.w / 2 / view.k, y: view.cy - VIEWPORT.h / 2 / view.k, k: view.k };
}

export function viewOf(cam: Cam): View {
	return { cx: cam.x + VIEWPORT.w / 2 / cam.k, cy: cam.y + VIEWPORT.h / 2 / cam.k, k: cam.k };
}

/** the page as people mostly see it: two rows of phones and the top of a third */
export const BASE: View = { cx: 1880, cy: 1060, k: 0.3 };
/** everything on the page at once, every frame a thumbnail */
export const WHOLE: View = { cx: 2155, cy: 2042, k: 0.185 };

/**
 * Where a write lands on a coffee screen, as fractions of the frame: the heading, the
 * list, the total and the button. The hand plates these, the way it plates a stamped
 * block in the shipped canvas.
 */
export const BLOCKS: readonly { readonly y: number; readonly h: number }[] = [
	{ y: 0.035, h: 0.075 },
	{ y: 0.125, h: 0.26 },
	{ y: 0.8, h: 0.08 },
	{ y: 0.895, h: 0.075 },
];

export type MemberId = "you" | "ana" | "jonas" | "mira" | "sam";
export type AgentKind = "claude" | "codex";

export interface Person {
	readonly id: MemberId;
	readonly name: string;
	readonly initial: string;
	readonly color: string;
	readonly agent: AgentKind | null;
}

/**
 * Identity colours. The design system has one accent, the thread, and it already means
 * "your agent" on the shipped canvas, so it stays yours. Everyone else needs a colour
 * the system does not have; these four are tuned to sit at the thread's weight on #161616
 * and to stay apart from it and from each other. They are the one addition this
 * exploration makes to the palette.
 */
export const PEOPLE: Readonly<Record<MemberId, Person>> = {
	you: { id: "you", name: "Liam", initial: "L", color: "#f5391a", agent: "claude" },
	ana: { id: "ana", name: "Ana", initial: "A", color: "#62a6ff", agent: "claude" },
	jonas: { id: "jonas", name: "Jonas", initial: "J", color: "#e2b04a", agent: "codex" },
	mira: { id: "mira", name: "Mira", initial: "M", color: "#4cc48c", agent: "claude" },
	sam: { id: "sam", name: "Sam", initial: "S", color: "#b38cff", agent: null },
};

export const ORDER: readonly MemberId[] = ["you", "ana", "jonas", "mira", "sam"];

/** how an agent's chip names it: whose, then what */
export function agentName(owner: MemberId): string {
	const person = PEOPLE[owner];
	if (owner === "you") return `your ${person.agent ?? "agent"}`;
	return `${person.name.toLowerCase()}'s ${person.agent ?? "agent"}`;
}

export type Verb = "read" | "write" | "shot";

export interface Span {
	readonly from: number;
	readonly to: number;
	readonly frame: string;
	readonly verb: Verb;
}

export interface Write {
	readonly at: number;
	readonly frame: string;
	readonly block: number;
}

export interface AgentPlan {
	readonly owner: MemberId;
	readonly spans: readonly Span[];
	readonly writes: readonly Write[];
}

export type Key<T> = readonly [number, T];

export interface PersonPlan {
	readonly id: MemberId;
	/** world positions; null is not on this page */
	readonly pointer: readonly Key<Vec | null>[];
	/** what they are looking at, for following them */
	readonly view?: ((t: number) => View) | undefined;
}

/** a turn, written as the calls it makes: read, then writes spread over the write span */
export function turn(
	frameName: string,
	parts: readonly (readonly [Verb, number, number])[],
	writeCount: Readonly<Record<number, number>> = {},
	seed = 0,
): { spans: Span[]; writes: Write[] } {
	const spans: Span[] = [];
	const writes: Write[] = [];
	parts.forEach(([verb, from, to], index) => {
		spans.push({ from, to, frame: frameName, verb });
		const count = writeCount[index] ?? (verb === "write" ? Math.max(2, Math.round((to - from) / 1.3)) : 0);
		for (let n = 0; n < count; n += 1) {
			// spread, with a little irregularity so two agents never write in step
			const u = (n + 0.5) / count + Math.sin((n + 1) * 2.17 + seed) * 0.12 / count;
			writes.push({ at: from + (to - from) * u, frame: frameName, block: (n + seed) % BLOCKS.length });
		}
	});
	return { spans, writes };
}

export function agent(owner: MemberId, ...turns: { spans: Span[]; writes: Write[] }[]): AgentPlan {
	return { owner, spans: turns.flatMap((one) => one.spans), writes: turns.flatMap((one) => one.writes) };
}

export const clamp = (value: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value));
export const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
export const easeOut = (u: number) => 1 - (1 - u) ** 3;
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export function mixView(a: View, b: View, u: number): View {
	return { cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u), k: a.k * (b.k / a.k) ** u };
}

/**
 * A keyed track of views. A long pan that also zooms goes out a little on the way, the
 * way a person zooms out to travel, so the eye keeps its bearings.
 */
export function views(keys: readonly Key<View>[]): (t: number) => View {
	return (t) => {
		const first = keys[0];
		if (first === undefined) return BASE;
		if (t <= first[0]) return first[1];
		for (let i = 0; i < keys.length - 1; i += 1) {
			const a = keys[i];
			const b = keys[i + 1];
			if (a === undefined || b === undefined) continue;
			if (t >= a[0] && t < b[0]) {
				const u = ease(clamp((t - a[0]) / (b[0] - a[0])));
				const mixed = mixView(a[1], b[1], u);
				const travel = Math.hypot(b[1].cx - a[1].cx, b[1].cy - a[1].cy);
				const out = Math.min(0.35, travel / 9000) * Math.sin(Math.PI * u);
				return { ...mixed, k: mixed.k * (1 - out) };
			}
		}
		return keys[keys.length - 1]?.[1] ?? BASE;
	};
}

/** a keyed track of points; a null on either side of a step is a jump, not a glide */
export function points(keys: readonly Key<Vec | null>[], t: number): Vec | null {
	const first = keys[0];
	if (first === undefined || t < first[0]) return null;
	for (let i = 0; i < keys.length - 1; i += 1) {
		const a = keys[i];
		const b = keys[i + 1];
		if (a === undefined || b === undefined) continue;
		if (t >= a[0] && t < b[0]) {
			if (a[1] === null || b[1] === null) return a[1];
			const u = ease(clamp((t - a[0]) / (b[0] - a[0])));
			return { x: lerp(a[1].x, b[1].x, u), y: lerp(a[1].y, b[1].y, u) };
		}
	}
	return keys[keys.length - 1]?.[1] ?? null;
}

/** a hand resting on a mouse is never still; this is that, small and smooth */
export function drift(t: number, seed: number, scale: number): Vec {
	return {
		x: (Math.sin(t * 0.9 + seed) * 0.6 + Math.sin(t * 0.37 + seed * 1.7) * 0.4) * scale,
		y: (Math.cos(t * 0.7 + seed * 1.3) * 0.6 + Math.sin(t * 0.29 + seed) * 0.4) * scale,
	};
}

export function pointerOf(plan: PersonPlan, t: number): Vec | null {
	const at = points(plan.pointer, t);
	if (at === null) return null;
	const seed = ORDER.indexOf(plan.id) * 1.9;
	const d = drift(t, seed, 26);
	return { x: at.x + d.x, y: at.y + d.y };
}

export function frameAt(point: Vec, pad = 40): FrameBox | null {
	return (
		FRAMES.find(
			(box) => point.x >= box.x - pad && point.x <= box.x + box.w + pad && point.y >= box.y - pad && point.y <= box.y + box.h + pad,
		) ?? null
	);
}

/**
 * The frame a person is "in": the one under their pointer, or the last one it was over.
 * A pointer crossing the gap between two frames has not left the first one yet.
 */
export function roomOf(plan: PersonPlan, t: number): FrameBox | null {
	const now = pointerOf(plan, t);
	if (now === null) return null;
	const here = frameAt(now);
	if (here !== null) return here;
	for (let i = plan.pointer.length - 1; i >= 0; i -= 1) {
		const key = plan.pointer[i];
		if (key === undefined || key[0] > t || key[1] === null) continue;
		const there = frameAt(key[1]);
		if (there !== null) return there;
	}
	return null;
}

export interface AgentNow {
	readonly plan: AgentPlan;
	readonly person: Person;
	readonly span: Span | null;
	readonly frame: FrameBox | null;
	readonly verb: Verb | null;
	/** the block the latest write in this span landed on */
	readonly block: number;
	/** seconds since the span opened */
	readonly since: number;
	/** the span that just closed, for a mark that lets go rather than vanishing */
	readonly closing: { readonly span: Span; readonly ago: number } | null;
}

export function agentNow(plan: AgentPlan, t: number): AgentNow {
	const person = PEOPLE[plan.owner];
	const span = plan.spans.find((one) => t >= one.from && t < one.to) ?? null;
	const last = span === null ? undefined : plan.writes.filter((w) => w.frame === span.frame && w.at <= t && w.at >= span.from).at(-1);
	const ended = plan.spans.filter((one) => one.to <= t && t - one.to < 0.3).at(-1);
	return {
		plan,
		person,
		span,
		frame: span === null ? null : frame(span.frame),
		verb: span?.verb ?? null,
		block: last?.block ?? 1,
		since: span === null ? 0 : t - span.from,
		closing: span === null && ended !== undefined ? { span: ended, ago: t - ended.to } : null,
	};
}

/** a write's life on the frame, as the shipped plate draws it: 860ms, open, hold, drain */
export const PLATE_LIFE = 0.86;
export function plateInk(age: number): number {
	if (age < 0 || age > PLATE_LIFE) return 0;
	const u = age / PLATE_LIFE;
	if (u < 0.163) return easeOut(u / 0.163);
	if (u < 0.535) return 1;
	const v = (u - 0.535) / 0.465;
	return 1 - v * v;
}

/** where the cursor of the person watching is pointed: a spot on screen, or a thing a take draws */
export type Aim =
	| { readonly kind: "screen"; readonly x: number; readonly y: number }
	| { readonly kind: "person"; readonly id: MemberId }
	| { readonly kind: "agent"; readonly id: MemberId }
	| { readonly kind: "frame"; readonly name: string; readonly fx: number; readonly fy: number }
	| { readonly kind: "control"; readonly name: string };

export interface Away {
	readonly minutes: number;
	readonly changes: readonly {
		readonly frame: string;
		readonly owner: MemberId;
		readonly writes: number;
		readonly fresh: boolean;
		/** when in the away window it happened, 0 at leaving and 1 at coming back */
		readonly at: number;
	}[];
}

export interface Follow {
	readonly who: MemberId;
	readonly agent: boolean;
}

export interface Scene {
	readonly id: string;
	readonly duration: number;
	/** the moment a still of this state should show */
	readonly poster: number;
	readonly beats: readonly { readonly at: number; readonly say: string }[];
	readonly camera: (t: number) => View;
	readonly people: readonly PersonPlan[];
	readonly agents: readonly AgentPlan[];
	/** the watcher's own cursor, in aims; absent keys mean it is off doing something else */
	readonly cursor?: readonly Key<Aim | null>[] | undefined;
	readonly clicks?: readonly number[] | undefined;
	readonly entered?: ((t: number) => string | null) | undefined;
	readonly follow?: ((t: number) => Follow | null) | undefined;
	readonly away?: Away | undefined;
}
