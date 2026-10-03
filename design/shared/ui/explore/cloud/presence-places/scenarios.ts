import {
	type BlockId,
	easeInOut,
	type FrameName,
	FH,
	FW,
	frameOf,
	lerp,
	VH,
	VW,
	type Who,
	WORLD,
} from "shared/ui/explore/cloud/presence-places/world";

/**
 * Five scenes, each a script on one clock in seconds, so a recording of any frame
 * shows the same moments at the same times whichever take is drawing them. The
 * script says what happened and where; it never says how it looks.
 */

export type Posture = "read" | "write" | "shot";
export type PageName = "app" | "site" | "explore";

export interface AgentSpan {
	from: number;
	to: number;
	frame: FrameName;
	posture: Posture;
}

/** a pointer path inside a frame: seconds, then the frame's own 0..1 across and down */
export type PathKey = readonly [number, number, number];

export interface PersonSpan {
	from: number;
	to: number;
	page: PageName;
	/** a frame on `app`, or a name on another page */
	frame: string;
	path?: readonly PathKey[] | undefined;
}

export interface Write {
	at: number;
	frame: FrameName;
	block: BlockId;
	by: Who;
}

export interface CamKey {
	t: number;
	x: number;
	y: number;
	k: number;
}

export interface FollowSpan {
	from: number;
	to: number;
	who: Who;
	kind: "person" | "agent";
}

export interface Beat {
	at: number;
	label: string;
}

export interface AwayChange {
	frame: FrameName;
	by: Who;
	writes: number;
	mark: "new" | "changed";
}

export interface Away {
	/** how long you were gone */
	minutes: number;
	/** when you come back, on the clock */
	back: number;
	changed: readonly AwayChange[];
	/** who came and went while you were gone */
	left: readonly { who: Who; ago: string; frame: FrameName }[];
	/** when you look at a frame and its news is spent */
	seen: readonly { frame: FrameName; at: number }[];
}

export interface Scenario {
	id: ScenarioId;
	total: number;
	camera: readonly CamKey[];
	people: Partial<Record<Who, readonly PersonSpan[]>>;
	agents: Partial<Record<Who, readonly AgentSpan[]>>;
	writes: readonly Write[];
	follow?: readonly FollowSpan[] | undefined;
	/** you go into a frame: from this second it is live under you */
	enter?: { frame: FrameName; at: number } | undefined;
	beats: readonly Beat[];
	away?: Away | undefined;
}

export type ScenarioId = "apart" | "zoomed" | "shared" | "follow" | "back";

/* ---------- camera ---------- */

/** the camera that fits one frame and its label, the way entering or following lands */
export function fit(name: FrameName, k = 0.9): Omit<CamKey, "t"> {
	const frame = frameOf(name);
	return { x: frame.x + FW / 2, y: frame.y + FH / 2 - 14 / k, k };
}

const WHOLE: Omit<CamKey, "t"> = {
	x: WORLD.w / 2,
	y: WORLD.h / 2 - 20,
	k: Math.min((VW - 120) / WORLD.w, (VH - 160) / WORLD.h),
};

const AT = (t: number, view: Omit<CamKey, "t">): CamKey => ({ t, ...view });

/**
 * The camera at a time. Between two keys it eases; a long hop between two close
 * zooms dips out on the way, so the flight reads as travel rather than a smear.
 */
export function cameraAt(keys: readonly CamKey[], t: number): Omit<CamKey, "t"> {
	const first = keys[0];
	if (first === undefined) return WHOLE;
	if (t <= first.t) return first;
	for (let i = 0; i < keys.length - 1; i += 1) {
		const a = keys[i];
		const b = keys[i + 1];
		if (a === undefined || b === undefined) continue;
		if (t < a.t || t > b.t) continue;
		const v = easeInOut((t - a.t) / Math.max(0.001, b.t - a.t));
		const distance = Math.hypot(b.x - a.x, b.y - a.y);
		const span = VW / Math.min(a.k, b.k);
		// out and back in on a hop longer than the view is wide
		const dip = distance > span * 0.8 ? Math.min(0.55, (distance / span) * 0.18) : 0;
		const k = lerp(a.k, b.k, v) * (1 - dip * Math.sin(Math.PI * v));
		return { x: lerp(a.x, b.x, v), y: lerp(a.y, b.y, v), k };
	}
	return keys[keys.length - 1] ?? first;
}

/* ---------- write runs ---------- */

const CYCLE: readonly BlockId[] = ["list", "total", "head", "list", "cta", "total", "list"];

function run(by: Who, frame: FrameName, from: number, to: number, every: number, offset = 0): Write[] {
	const writes: Write[] = [];
	let i = offset;
	for (let at = from; at < to; at += every * (0.75 + ((i * 37) % 10) / 20)) {
		writes.push({ at, frame, block: CYCLE[i % CYCLE.length] ?? "list", by });
		i += 1;
	}
	return writes;
}

/* ---------- the scenes ---------- */

const NEAR_CHECKOUT: Omit<CamKey, "t"> = { x: 905, y: 1360, k: 0.5 };

/**
 * Ana and her agent, far apart. Her claude is writing `checkout` in the middle of
 * your view; Ana herself is on `rewards--redeem`, 2,650px to the right and off
 * screen, and then moves further. Ben is on another page while his codex arrives
 * beside you. Cleo sits off screen; Dev drifts off.
 */
const APART: Scenario = {
	id: "apart",
	total: 16,
	camera: [AT(0, NEAR_CHECKOUT), AT(16, NEAR_CHECKOUT)],
	people: {
		ana: [
			{ from: 0, to: 8, page: "app", frame: "rewards--redeem" },
			{ from: 8, to: 16, page: "app", frame: "settings" },
		],
		ben: [{ from: 0, to: 16, page: "site", frame: "pricing" }],
		cleo: [{ from: 0, to: 16, page: "app", frame: "cart" }],
		dev: [{ from: 0, to: 10.5, page: "app", frame: "menu--empty" }],
	},
	agents: {
		ana: [
			{ from: 0.4, to: 1.8, frame: "checkout", posture: "read" },
			{ from: 1.8, to: 6, frame: "checkout", posture: "write" },
			{ from: 6, to: 6.9, frame: "checkout", posture: "shot" },
			{ from: 6.9, to: 11.6, frame: "checkout", posture: "write" },
			{ from: 11.6, to: 15.6, frame: "checkout", posture: "read" },
		],
		ben: [
			{ from: 5.2, to: 7.4, frame: "cart--promo", posture: "read" },
			{ from: 7.4, to: 13, frame: "cart--promo", posture: "write" },
		],
	},
	writes: [...run("ana", "checkout", 2, 5.8, 0.75), ...run("ana", "checkout", 7.1, 11.4, 0.8, 3), ...run("ben", "cart--promo", 7.6, 12.8, 0.9, 1)],
	beats: [
		{ at: 0.4, label: "ana's claude takes checkout" },
		{ at: 5.2, label: "ben's codex arrives beside you" },
		{ at: 8, label: "ana moves to settings" },
		{ at: 10.5, label: "dev leaves" },
		{ at: 13, label: "ben's codex lets go" },
	],
};

/**
 * Zoomed out over all twenty-four frames, everyone at once: five people, four
 * agents, all moving.
 */
const ZOOMED: Scenario = {
	id: "zoomed",
	total: 18,
	camera: [AT(0, WHOLE), AT(18, WHOLE)],
	people: {
		ana: [
			{ from: 0, to: 6, page: "app", frame: "menu--seasonal" },
			{ from: 6, to: 18, page: "app", frame: "item--milk" },
		],
		ben: [
			{ from: 0, to: 4, page: "site", frame: "pricing" },
			{ from: 4, to: 18, page: "app", frame: "orders" },
		],
		cleo: [{ from: 0, to: 18, page: "app", frame: "rewards" }],
		dev: [
			{ from: 0, to: 11, page: "app", frame: "account" },
			{ from: 11, to: 18, page: "app", frame: "receipt" },
		],
	},
	agents: {
		ana: [
			{ from: 0, to: 9, frame: "checkout", posture: "write" },
			{ from: 9.4, to: 10.6, frame: "checkout--card", posture: "read" },
			{ from: 10.6, to: 18, frame: "checkout--card", posture: "write" },
		],
		ben: [
			{ from: 2, to: 4, frame: "orders--empty", posture: "read" },
			{ from: 4, to: 15, frame: "orders--empty", posture: "write" },
			{ from: 15, to: 15.8, frame: "orders--empty", posture: "shot" },
			{ from: 15.8, to: 18, frame: "orders--empty", posture: "read" },
		],
		cleo: [
			{ from: 0, to: 12, frame: "rewards--redeem", posture: "write" },
			{ from: 12.4, to: 18, frame: "rewards", posture: "read" },
		],
		you: [
			{ from: 0, to: 7, frame: "pickup--late", posture: "write" },
			{ from: 7, to: 7.8, frame: "pickup--late", posture: "shot" },
			{ from: 7.8, to: 18, frame: "pickup--late", posture: "write" },
		],
	},
	writes: [
		...run("ana", "checkout", 0.3, 8.8, 0.9),
		...run("ana", "checkout--card", 10.8, 17.8, 0.95, 2),
		...run("ben", "orders--empty", 4.2, 14.8, 1, 4),
		...run("cleo", "rewards--redeem", 0.6, 11.8, 1.1, 1),
		...run("you", "pickup--late", 0.2, 6.8, 1.2, 5),
		...run("you", "pickup--late", 8, 17.8, 1.2, 2),
	],
	beats: [
		{ at: 0, label: "everyone at once, zoomed out" },
		{ at: 4, label: "ben comes over from site" },
		{ at: 6, label: "ana moves to item--milk" },
		{ at: 9.4, label: "ana's claude moves on" },
		{ at: 11, label: "dev moves to receipt" },
		{ at: 12.4, label: "cleo's claude moves on" },
	],
};

const CHECKOUT_IN = fit("checkout", 0.92);

/**
 * Two agents on one frame, and you walking into it mid-write. Ana is already in
 * there with her pointer; her claude holds the left wall and Ben's codex the right.
 */
const SHARED: Scenario = {
	id: "shared",
	total: 16,
	camera: [AT(0, NEAR_CHECKOUT), AT(3, NEAR_CHECKOUT), AT(4.3, CHECKOUT_IN), AT(16, CHECKOUT_IN)],
	enter: { frame: "checkout", at: 4.3 },
	people: {
		ana: [
			{
				from: 0,
				to: 16,
				page: "app",
				frame: "checkout",
				path: [
					[0, 0.62, 0.3],
					[3, 0.66, 0.25],
					[5.5, 0.4, 0.2],
					[7.5, 0.45, 0.47],
					[9.3, 0.7, 0.9],
					[11.5, 0.72, 0.91],
					[12.6, 0.3, 0.47],
					[15, 0.34, 0.45],
					[16, 0.62, 0.3],
				],
			},
		],
		ben: [{ from: 0, to: 16, page: "app", frame: "orders" }],
		cleo: [{ from: 0, to: 16, page: "app", frame: "rewards" }],
	},
	agents: {
		ana: [
			{ from: 0, to: 15.6, frame: "checkout", posture: "write" },
		],
		ben: [
			{ from: 0, to: 2.2, frame: "checkout", posture: "read" },
			{ from: 2.2, to: 15.6, frame: "checkout", posture: "write" },
		],
	},
	writes: [
		...run("ana", "checkout", 0.4, 8.6, 1.1),
		{ at: 9.1, frame: "checkout", block: "cta", by: "ana" },
		{ at: 9.5, frame: "checkout", block: "cta", by: "ben" },
		...run("ana", "checkout", 10.6, 15.4, 1.2, 2),
		...run("ben", "checkout", 2.6, 8.8, 1.3, 4),
		...run("ben", "checkout", 10.2, 15.4, 1.1, 1),
	],
	beats: [
		{ at: 0, label: "two agents on checkout" },
		{ at: 3, label: "you enter checkout" },
		{ at: 9.1, label: "both write the button" },
		{ at: 12.6, label: "ana points at the total" },
	],
};

const PICKUP_IN = fit("pickup", 0.92);

/** Following Ana, a person, then Ben's codex, an agent. */
const FOLLOW: Scenario = {
	id: "follow",
	total: 18,
	camera: [
		AT(0, CHECKOUT_IN),
		AT(3.2, CHECKOUT_IN),
		AT(4, fit("cart--promo", 0.92)),
		AT(6.2, fit("cart--promo", 0.92)),
		AT(7.6, PICKUP_IN),
		AT(9.1, PICKUP_IN),
		AT(10.5, fit("orders--empty", 0.92)),
		AT(12.8, fit("orders--empty", 0.92)),
		AT(13.6, fit("orders", 0.92)),
		AT(18, fit("orders", 0.92)),
	],
	follow: [
		{ from: 0, to: 9, who: "ana", kind: "person" },
		{ from: 9, to: 18, who: "ben", kind: "agent" },
	],
	people: {
		ana: [
			{
				from: 0,
				to: 3,
				page: "app",
				frame: "checkout",
				path: [
					[0, 0.5, 0.5],
					[1.4, 0.7, 0.46],
					[3, 0.92, 0.6],
				],
			},
			{
				from: 3,
				to: 6,
				page: "app",
				frame: "cart--promo",
				path: [
					[3, 0.1, 0.6],
					[4.4, 0.45, 0.25],
					[6, 0.8, 0.86],
				],
			},
			{
				from: 6,
				to: 18,
				page: "app",
				frame: "pickup",
				path: [
					[6, 0.2, 0.3],
					[7.8, 0.5, 0.2],
					[9, 0.6, 0.5],
					[12, 0.4, 0.6],
					[18, 0.5, 0.4],
				],
			},
		],
		ben: [{ from: 0, to: 18, page: "site", frame: "pricing" }],
		cleo: [{ from: 0, to: 18, page: "app", frame: "rewards" }],
	},
	agents: {
		ana: [{ from: 0, to: 18, frame: "checkout--error", posture: "write" }],
		ben: [
			{ from: 0, to: 12.5, frame: "orders--empty", posture: "write" },
			{ from: 12.9, to: 14, frame: "orders", posture: "read" },
			{ from: 14, to: 18, frame: "orders", posture: "write" },
		],
	},
	writes: [
		...run("ana", "checkout--error", 0.5, 17.5, 1.1),
		...run("ben", "orders--empty", 0.3, 12.3, 0.9, 2),
		...run("ben", "orders", 14.2, 17.8, 0.9, 4),
	],
	beats: [
		{ at: 0, label: "following ana" },
		{ at: 3, label: "ana goes to cart--promo" },
		{ at: 6, label: "ana goes to pickup" },
		{ at: 9, label: "following ben's codex" },
		{ at: 12.9, label: "codex moves to orders" },
	],
};

/** Back after 38 minutes away: what changed, by whom, and who is here now. */
const BACK: Scenario = {
	id: "back",
	total: 16,
	camera: [
		AT(0, { x: 1840, y: 1430, k: 0.3 }),
		AT(7.4, { x: 1840, y: 1430, k: 0.3 }),
		AT(8.8, fit("checkout", 0.92)),
		AT(16, fit("checkout", 0.92)),
	],
	people: {
		ana: [{ from: 1, to: 16, page: "app", frame: "checkout--card" }],
		cleo: [{ from: 1, to: 16, page: "app", frame: "rewards" }],
	},
	agents: {
		ana: [{ from: 1, to: 16, frame: "checkout--card", posture: "read" }],
	},
	writes: [],
	away: {
		minutes: 38,
		back: 1,
		changed: [
			{ frame: "checkout", by: "ana", writes: 14, mark: "changed" },
			{ frame: "checkout--card", by: "ana", writes: 6, mark: "changed" },
			{ frame: "cart--promo", by: "ben", writes: 9, mark: "changed" },
			{ frame: "orders--empty", by: "ben", writes: 11, mark: "changed" },
			{ frame: "pickup--late", by: "ben", writes: 4, mark: "new" },
			{ frame: "rewards--redeem", by: "cleo", writes: 8, mark: "changed" },
		],
		left: [
			{ who: "ben", ago: "12m", frame: "orders--empty" },
			{ who: "dev", ago: "31m", frame: "account" },
		],
		seen: [{ frame: "checkout", at: 9.6 }],
	},
	beats: [
		{ at: 0, label: "away 38 minutes" },
		{ at: 1, label: "you come back" },
		{ at: 7.4, label: "you open checkout" },
	],
};

export const SCENARIOS: Readonly<Record<ScenarioId, Scenario>> = {
	apart: APART,
	zoomed: ZOOMED,
	shared: SHARED,
	follow: FOLLOW,
	back: BACK,
};

/* ---------- reading a scene at a time ---------- */

export function personAt(scene: Scenario, who: Who, t: number): PersonSpan | null {
	return scene.people[who]?.find((span) => t >= span.from && t < span.to) ?? null;
}

/** where a person's pointer is in their frame, 0..1, eased between keys */
export function pointerAt(span: PersonSpan, t: number): { u: number; v: number } | null {
	const path = span.path;
	if (path === undefined || path.length === 0) return null;
	const first = path[0];
	if (first === undefined) return null;
	if (t <= first[0]) return { u: first[1], v: first[2] };
	for (let i = 0; i < path.length - 1; i += 1) {
		const a = path[i];
		const b = path[i + 1];
		if (a === undefined || b === undefined) continue;
		if (t >= a[0] && t <= b[0]) {
			const v = easeInOut((t - a[0]) / Math.max(0.001, b[0] - a[0]));
			return { u: lerp(a[1], b[1], v), v: lerp(a[2], b[2], v) };
		}
	}
	const last = path[path.length - 1] ?? first;
	return { u: last[1], v: last[2] };
}

export interface AgentNow {
	who: Who;
	frame: FrameName;
	posture: Posture;
	/** 0..1, how far the hold has wound on (and back off as it lets go) */
	wound: number;
	/** the posture before this one on the same frame, and how far the change has come */
	was: Posture | null;
	change: number;
	since: number;
}

const WIND = 0.24;

/** every hold drawn at this moment, including ones letting go */
export function agentsAt(scene: Scenario, t: number): AgentNow[] {
	const out: AgentNow[] = [];
	for (const [key, spans] of Object.entries(scene.agents)) {
		const who = key as Who;
		if (spans === undefined) continue;
		spans.forEach((span, i) => {
			const prev = spans[i - 1];
			const next = spans[i + 1];
			const joinedBefore = prev !== undefined && prev.frame === span.frame && Math.abs(prev.to - span.from) < 0.01;
			const joinedAfter = next !== undefined && next.frame === span.frame && Math.abs(next.from - span.to) < 0.01;
			const lastsTo = joinedAfter ? span.to : span.to + WIND;
			if (t < span.from || t >= lastsTo) return;
			const on = joinedBefore ? 1 : easeInOut((t - span.from) / WIND);
			const off = t > span.to ? 1 - easeInOut((t - span.to) / WIND) : 1;
			out.push({
				who,
				frame: span.frame,
				posture: span.posture,
				wound: Math.min(on, off),
				was: joinedBefore && prev !== undefined ? prev.posture : null,
				change: joinedBefore ? easeInOut((t - span.from) / 0.22) : 1,
				since: span.from,
			});
		});
	}
	return out;
}

/** the agent's current frame, or null when it holds nothing */
export function agentFrame(scene: Scenario, who: Who, t: number): AgentSpan | null {
	return scene.agents[who]?.find((span) => t >= span.from && t < span.to) ?? null;
}

/** writes whose plate is still on screen: 860ms each */
export const PLATE_LIFE = 0.86;
export function platesAt(scene: Scenario, t: number): Write[] {
	return scene.writes.filter((write) => t >= write.at && t < write.at + PLATE_LIFE);
}

/** the latest write by this agent on this frame, for where a writing thread stands */
export function lastWrite(scene: Scenario, who: Who, frame: FrameName, t: number): Write | null {
	let found: Write | null = null;
	for (const write of scene.writes) {
		if (write.by === who && write.frame === frame && write.at <= t) found = write;
	}
	return found;
}

/** writes in the last few seconds, for a count that rises and decays */
export function writesSince(scene: Scenario, who: Who, frame: FrameName, from: number, t: number): number {
	return scene.writes.filter((w) => w.by === who && w.frame === frame && w.at >= from && w.at <= t).length;
}

export function followAt(scene: Scenario, t: number): FollowSpan | null {
	return scene.follow?.find((span) => t >= span.from && t < span.to) ?? null;
}

export function beatAt(scene: Scenario, t: number): Beat | null {
	let found: Beat | null = null;
	for (const beat of scene.beats) if (beat.at <= t) found = beat;
	return found;
}
