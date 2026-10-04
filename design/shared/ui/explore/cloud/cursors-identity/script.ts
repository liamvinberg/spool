/**
 * One clock, one script. Every take on this page reads the same people doing the
 * same things at the same seconds, so a row differs from the next only in how a
 * person is drawn. Positions are world pixels on a canvas held at 100%; the stage
 * owns the camera.
 *
 * A path is keys of [seconds, x, y]. Two keys on the same spot are a hold. Between
 * keys the motion is a cubic Hermite in time, so speed is continuous through a
 * key and a hold is entered and left at zero speed: nothing on the page ever
 * changes velocity in one frame.
 */

export const LOOP = 16;

export type PersonId = "maja" | "oskar" | "sara" | "elin" | "jonas" | "ingrid" | "amir" | "liam";

export interface Person {
	id: PersonId;
	name: string;
	first: string;
	initials: string;
	/** OKLCH hue, for the one take that colours people. Red-orange is the thread's, so no hue sits in 0 to 70. */
	hue: number;
}

export const PEOPLE: Readonly<Record<PersonId, Person>> = {
	maja: { id: "maja", name: "Maja Lind", first: "Maja", initials: "ML", hue: 205 },
	oskar: { id: "oskar", name: "Oskar Berg", first: "Oskar", initials: "OB", hue: 100 },
	sara: { id: "sara", name: "Sara Nyström", first: "Sara", initials: "SN", hue: 285 },
	elin: { id: "elin", name: "Elin Holm", first: "Elin", initials: "EH", hue: 150 },
	jonas: { id: "jonas", name: "Jonas Ek", first: "Jonas", initials: "JE", hue: 245 },
	ingrid: { id: "ingrid", name: "Ingrid Sjö", first: "Ingrid", initials: "IS", hue: 320 },
	amir: { id: "amir", name: "Amir Haddad", first: "Amir", initials: "AH", hue: 178 },
	liam: { id: "liam", name: "Liam Vinberg", first: "Liam", initials: "LV", hue: 33 },
};

export const YOU = PEOPLE.liam;

export type FrameId = "menu" | "cart" | "receipt";

export interface FrameBox {
	id: FrameId;
	x: number;
	y: number;
}

export const FRAME_W = 240;
export const FRAME_H = 520;

export const FRAMES: readonly FrameBox[] = [
	{ id: "menu", x: 70, y: 140 },
	{ id: "cart", x: 360, y: 170 },
	{ id: "receipt", x: 650, y: 120 },
];

export type Key = readonly [t: number, x: number, y: number];
type Span = readonly [from: number, to: number];

export interface Track {
	person: PersonId;
	keys: readonly Key[];
	/** pointer down */
	presses?: readonly Span[];
	/** the frame follows the pointer while it is down over it */
	drags?: readonly { frame: FrameId; span: Span }[];
	/** what this person has selected, and when */
	selects?: readonly { frame: FrameId; span: Span }[];
	idle?: readonly Span[];
	/** idle for the whole loop, said in the who's-here list */
	idleFor?: string;
}

export interface Away {
	person: PersonId;
	page: string;
}

export type Scenario = "base" | "follow" | "crowd";

const maja: Track = {
	person: "maja",
	keys: [
		[0, 960, 640],
		[2.2, 520, 360],
		[3.6, 470, 430],
		[5.0, 300, 770],
		[7.0, 150, 420],
		[8.4, 190, 480],
		[10.2, 620, 80],
		[12.2, 1030, 360],
		[14.0, 990, 520],
		[16, 960, 640],
	],
};

const oskar: Track = {
	person: "oskar",
	keys: [
		[0, 640, 800],
		[2.6, 200, 330],
		[14.4, 200, 330],
		[14.7, 206, 336],
		[16, 640, 800],
	],
	idle: [[8.5, 14.4]],
};

const sara: Track = {
	person: "sara",
	keys: [
		[0, 1060, 820],
		[3.4, 760, 200],
		[4.2, 760, 200],
		[7.2, 970, 250],
		[8.4, 970, 250],
		[10.4, 1100, 770],
		[10.7, 1100, 770],
		[12.0, 970, 250],
		[12.4, 970, 250],
		[14.4, 760, 200],
		[15.0, 760, 200],
		[15.6, 1060, 820],
		[16, 1060, 820],
	],
	presses: [
		[4.0, 7.6],
		[10.45, 10.62],
		[12.2, 14.6],
		[15.72, 15.86],
	],
	drags: [
		{ frame: "receipt", span: [4.0, 7.6] },
		{ frame: "receipt", span: [12.2, 14.6] },
	],
	selects: [
		{ frame: "receipt", span: [4.0, 10.5] },
		{ frame: "receipt", span: [12.2, 15.8] },
	],
};

const elin: Track = {
	person: "elin",
	keys: [
		[0, 560, 780],
		[3.2, 470, 560],
		[5.0, 450, 600],
		[8.0, 900, 60],
		[10.5, 1080, 120],
		[13.0, 330, 90],
		[16, 560, 780],
	],
};

const oskarIdle: Track = {
	person: "oskar",
	keys: [
		[0, 200, 330],
		[16, 200, 330],
	],
	idle: [[0, 16]],
	idleFor: "idle 14m",
};

export const SCENARIOS: Readonly<Record<Scenario, { tracks: readonly Track[]; away: readonly Away[]; follow?: PersonId }>> = {
	base: { tracks: [maja, oskar, sara], away: [] },
	follow: { tracks: [maja, oskar, sara], away: [], follow: "maja" },
	crowd: {
		tracks: [maja, oskarIdle, sara, elin],
		away: [
			{ person: "jonas", page: "site" },
			{ person: "ingrid", page: "site" },
			{ person: "amir", page: "onboarding" },
		],
	},
};

/** moments the scrub bar marks, for the loop that has them */
export const MOMENTS: Readonly<Record<Scenario, readonly { t: number; label: string }[]>> = {
	base: [
		{ t: 2.6, label: "still" },
		{ t: 4.0, label: "drag" },
		{ t: 8.5, label: "idle" },
		{ t: 12.2, label: "drag" },
	],
	follow: [
		{ t: 2.2, label: "hover" },
		{ t: 5.0, label: "canvas" },
		{ t: 12.2, label: "hover" },
	],
	crowd: [
		{ t: 4.0, label: "drag" },
		{ t: 12.2, label: "drag" },
	],
};

const wrap = (t: number) => ((t % LOOP) + LOOP) % LOOP;

export function position(keys: readonly Key[], raw: number): { x: number; y: number } {
	const t = wrap(raw);
	const n = keys.length;
	let i = 0;
	while (i < n - 2 && t >= keys[i + 1]![0]) i += 1;
	const a = keys[i]!;
	const b = keys[i + 1]!;
	const dt = b[0] - a[0];
	const u = dt <= 0 ? 0 : (t - a[0]) / dt;
	const va = velocity(keys, i);
	const vb = velocity(keys, i + 1);
	const u2 = u * u;
	const u3 = u2 * u;
	const h00 = 2 * u3 - 3 * u2 + 1;
	const h10 = u3 - 2 * u2 + u;
	const h01 = -2 * u3 + 3 * u2;
	const h11 = u3 - u2;
	return {
		x: h00 * a[1] + h10 * dt * va.x + h01 * b[1] + h11 * dt * vb.x,
		y: h00 * a[2] + h10 * dt * va.y + h01 * b[2] + h11 * dt * vb.y,
	};
}

/** the speed through a key: a hold on either side means it is passed at rest */
function velocity(keys: readonly Key[], i: number): { x: number; y: number } {
	const n = keys.length;
	const at = keys[i]!;
	// the loop closes: the last key is the first, a period later
	const prev = i === 0 ? shift(keys[n - 2]!, -LOOP) : keys[i - 1]!;
	const next = i === n - 1 ? shift(keys[1]!, LOOP) : keys[i + 1]!;
	const same = (k: Key) => Math.abs(k[1] - at[1]) < 0.01 && Math.abs(k[2] - at[2]) < 0.01;
	if (same(prev) || same(next)) return { x: 0, y: 0 };
	const span = next[0] - prev[0];
	// a little under Catmull-Rom's speed, so a turn never overshoots its key
	return { x: ((next[1] - prev[1]) / span) * 0.85, y: ((next[2] - prev[2]) / span) * 0.85 };
}

function shift(key: Key, by: number): Key {
	return [key[0] + by, key[1], key[2]];
}

export function within(spans: readonly Span[] | undefined, raw: number): boolean {
	const t = wrap(raw);
	return spans?.some(([from, to]) => t >= from && t < to) ?? false;
}

/** seconds since this span began, or -1 outside it */
export function into(spans: readonly Span[] | undefined, raw: number): number {
	const t = wrap(raw);
	const span = spans?.find(([from, to]) => t >= from && t < to);
	return span === undefined ? -1 : t - span[0];
}

/** how long the pointer has not moved, up to four seconds */
export function stillFor(keys: readonly Key[], t: number): number {
	let here = position(keys, t);
	for (let back = 0.05; back <= 4; back += 0.05) {
		const then = position(keys, t - back);
		if (Math.hypot(then.x - here.x, then.y - here.y) > 0.15) return back - 0.05;
		here = then;
	}
	return 4;
}

/** where each frame stands at this moment, after every drag so far in the loop */
export function frameAt(frame: FrameBox, tracks: readonly Track[], raw: number): { x: number; y: number } {
	const t = wrap(raw);
	let x = frame.x;
	let y = frame.y;
	for (const track of tracks) {
		for (const drag of track.drags ?? []) {
			if (drag.frame !== frame.id || t < drag.span[0]) continue;
			const start = position(track.keys, drag.span[0]);
			const end = position(track.keys, Math.min(t, drag.span[1]));
			x += end.x - start.x;
			y += end.y - start.y;
		}
	}
	return { x, y };
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0 to 1 over `dur` seconds from `start`, eased out: every take's arrivals use it */
export function ramp(v: number, start: number, dur: number): number {
	const u = clamp01((v - start) / dur);
	return 1 - (1 - u) ** 3;
}
