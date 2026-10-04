/**
 * One clock, everything else a pure function of it. Every take reads the same
 * people walking the same paths; what differs is how a take chooses to smooth,
 * lag and settle what it is handed.
 *
 * Springs are simulated forward from a fixed distance in the past rather than
 * carried between renders, so any instant can be drawn cold. That is what lets
 * the scrub bar jump anywhere and the picture be exactly the one playback
 * would have reached.
 */

export interface Vec {
	readonly x: number;
	readonly y: number;
}

export interface Person {
	readonly id: string;
	readonly name: string;
	readonly color: string;
}

/** A point the person's pointer passes through. Repeat a point to hold still. */
export interface Key {
	readonly t: number;
	readonly x: number;
	readonly y: number;
	/** how far the run into this key bows sideways, px; humans rarely move straight */
	readonly bow?: number | undefined;
}

export interface Track {
	readonly person: Person;
	readonly keys: readonly Key[];
	/** loop seconds the person is in the project; a span may run past the loop end */
	readonly present?: readonly (readonly [number, number])[] | undefined;
	/** loop seconds the button is held */
	readonly presses?: readonly (readonly [number, number])[] | undefined;
	/** a frame this person drags while a press is held: [press start, frame] */
	readonly drags?: readonly (readonly [number, string])[] | undefined;
	/** loop seconds a frame is selected by this person */
	readonly selects?: readonly (readonly [number, number, string])[] | undefined;
	/** another page entirely: listed among who is here, never drawn on this canvas */
	readonly page?: string | undefined;
}

export interface FrameBox {
	readonly name: string;
	readonly screen: "menu" | "cart" | "receipt";
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

export interface Mark {
	readonly t: number;
	readonly label: string;
}

export interface Scene {
	readonly length: number;
	readonly frames: readonly FrameBox[];
	readonly tracks: readonly Track[];
	readonly marks: readonly Mark[];
	/** demo seconds of stillness before someone reads as idle */
	readonly idleAfter: number;
	/** the followed person's own viewport: centre and zoom, keyed like a path */
	readonly view?: readonly { readonly t: number; readonly x: number; readonly y: number; readonly z: number }[] | undefined;
}

export const VIEWPORT = { w: 1148, h: 856 } as const;

/* ---------- people ---------- */

export const PEOPLE = {
	maja: { id: "maja", name: "Maja", color: "#7aa7ff" },
	jonas: { id: "jonas", name: "Jonas", color: "#eaa94a" },
	ines: { id: "ines", name: "Ines", color: "#4cc495" },
	theo: { id: "theo", name: "Theo", color: "#b896ff" },
	sara: { id: "sara", name: "Sara", color: "#f28cbc" },
	omar: { id: "omar", name: "Omar", color: "#58c6dc" },
	elin: { id: "elin", name: "Elin", color: "#d6cc6a" },
} as const satisfies Record<string, Person>;

/* ---------- maths ---------- */

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const mod = (v: number, m: number) => ((v % m) + m) % m;
const smooth = (u: number) => u * u * (3 - 2 * u);
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
export const easeOut = (u: number) => 1 - (1 - clamp(u)) ** 3;

function hash(n: number): number {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return s - Math.floor(s);
}

/* ---------- paths ---------- */

/** where the hand actually is, before the network has had its say */
export function pathAt(keys: readonly Key[], length: number, time: number): Vec {
	const t = mod(time, length);
	const first = keys[0];
	if (first === undefined) return { x: 0, y: 0 };
	if (t <= first.t) return { x: first.x, y: first.y };
	for (let i = 1; i < keys.length; i++) {
		const a = keys[i - 1];
		const b = keys[i];
		if (a === undefined || b === undefined) continue;
		if (t <= b.t) {
			const u = easeInOut(clamp((t - a.t) / Math.max(1e-6, b.t - a.t)));
			const x = lerp(a.x, b.x, u);
			const y = lerp(a.y, b.y, u);
			const bow = b.bow ?? 0;
			if (bow === 0) return { x, y };
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const len = Math.hypot(dx, dy) || 1;
			const k = Math.sin(Math.PI * u) * bow;
			return { x: x + (-dy / len) * k, y: y + (dx / len) * k };
		}
	}
	const last = keys[keys.length - 1] ?? first;
	return { x: last.x, y: last.y };
}

/** moving, and for how long it has been either way */
export function motionAt(keys: readonly Key[], length: number, time: number): { moving: boolean; since: number } {
	const t = mod(time, length);
	const still = (a: Key, b: Key) => a.x === b.x && a.y === b.y;
	let seg = keys.length - 1;
	for (let i = 1; i < keys.length; i++) {
		const b = keys[i];
		if (b !== undefined && t <= b.t) {
			seg = i;
			break;
		}
	}
	const a0 = keys[seg - 1];
	const b0 = keys[seg];
	if (a0 === undefined || b0 === undefined || t > b0.t) {
		// past the last key: still since it, and through the loop seam if the first run is still too
		const last = keys[keys.length - 1];
		return { moving: false, since: last === undefined ? 0 : t - last.t };
	}
	const moving = !still(a0, b0);
	let start = a0.t;
	for (let i = seg - 1; i >= 1; i--) {
		const a = keys[i - 1];
		const b = keys[i];
		if (a === undefined || b === undefined) break;
		if (still(a, b) === moving) break;
		start = a.t;
	}
	let since = t - start;
	if (!moving && start === keys[0]?.t) {
		// a hold that opens the loop is the tail of the hold that closes it
		const last = keys[keys.length - 1];
		const prev = keys[keys.length - 2];
		if (last !== undefined && prev !== undefined && still(prev, last)) since += length - prev.t;
	}
	return { moving, since };
}

/* ---------- the wire ---------- */

const PACKET = 1 / 15;
const LATENCY = 0.07;

/**
 * What arrives: the hand sampled at 15 Hz, each packet a little late by its
 * own amount and a pixel or so off. Held until the next one lands, so on its
 * own it reads as a stutter; every take smooths it its own way.
 */
export function packetAt(track: Track, length: number, time: number): Vec {
	const t = time - LATENCY;
	let n = Math.floor(t / PACKET);
	// a late packet keeps the previous one on screen a little longer
	const late = hash(n + track.person.id.length * 31) * 0.045;
	if (t - n * PACKET < late) n -= 1;
	const p = pathAt(track.keys, length, n * PACKET);
	const j = hash(n * 3.1 + track.person.name.charCodeAt(0));
	return { x: p.x + (j - 0.5) * 1.6, y: p.y + (hash(n * 7.7) - 0.5) * 1.6 };
}

export function packetsBefore(track: Track, length: number, time: number, count: number): Vec[] {
	const out: Vec[] = [];
	const n = Math.floor((time - LATENCY) / PACKET);
	for (let i = count - 1; i >= 0; i--) out.push(packetAt(track, length, (n - i) * PACKET + LATENCY + 0.05));
	return out;
}

/* ---------- springs ---------- */

export interface Spring {
	/** natural frequency, rad/s */
	readonly w: number;
	/** damping ratio: 1 settles with no overshoot, below 1 swings once and lands */
	readonly z: number;
}

const DT = 1 / 120;

/**
 * A chain of springs, each chasing the one before, the first chasing `target`.
 * Run cold from `from` (or `window` seconds ago, whichever is later) so the
 * answer depends on the instant alone.
 */
export function chain(
	target: (t: number) => Vec,
	t: number,
	springs: readonly Spring[],
	from: number,
	window = 1.4,
): { p: Vec[]; v: Vec[] } {
	const t0 = Math.max(from, t - window);
	const start = target(t0);
	const px = springs.map(() => start.x);
	const py = springs.map(() => start.y);
	const vx = springs.map(() => 0);
	const vy = springs.map(() => 0);
	for (let time = t0; time < t; time += DT) {
		const dt = Math.min(DT, t - time);
		const goal = target(time + dt);
		for (let i = 0; i < springs.length; i++) {
			const s = springs[i];
			if (s === undefined) continue;
			const gx = i === 0 ? goal.x : (px[i - 1] ?? 0);
			const gy = i === 0 ? goal.y : (py[i - 1] ?? 0);
			const k = s.w * s.w;
			const c = 2 * s.z * s.w;
			const ax = k * (gx - (px[i] ?? 0)) - c * (vx[i] ?? 0);
			const ay = k * (gy - (py[i] ?? 0)) - c * (vy[i] ?? 0);
			vx[i] = (vx[i] ?? 0) + ax * dt;
			vy[i] = (vy[i] ?? 0) + ay * dt;
			px[i] = (px[i] ?? 0) + (vx[i] ?? 0) * dt;
			py[i] = (py[i] ?? 0) + (vy[i] ?? 0) * dt;
		}
	}
	return {
		p: springs.map((_, i) => ({ x: px[i] ?? 0, y: py[i] ?? 0 })),
		v: springs.map((_, i) => ({ x: vx[i] ?? 0, y: vy[i] ?? 0 })),
	};
}

/** one number easing toward whatever `target` said at each past instant */
export function settle(target: (t: number) => number, t: number, s: Spring, window = 1.6, from = -Infinity): number {
	const t0 = Math.max(from, t - window);
	let p = target(t0);
	let v = 0;
	const k = s.w * s.w;
	const c = 2 * s.z * s.w;
	for (let time = t0; time < t; time += 1 / 90) {
		const dt = Math.min(1 / 90, t - time);
		const a = k * (target(time + dt) - p) - c * v;
		v += a * dt;
		p += v * dt;
	}
	return p;
}

/* ---------- presence ---------- */

/** the span holding `t`, as seconds since it opened and until it closes */
export function spanAt(track: Track, length: number, time: number): { since: number; until: number } | null {
	if (track.present === undefined) return { since: Infinity, until: Infinity };
	const t = mod(time, length);
	for (const [a, b] of track.present) {
		for (const shift of [0, length]) {
			const tt = t + shift;
			if (tt >= a && tt < b) return { since: tt - a, until: b - tt };
		}
	}
	return null;
}

export function inWindow(spans: readonly (readonly [number, number])[] | undefined, length: number, time: number): number | null {
	if (spans === undefined) return null;
	const t = mod(time, length);
	for (const [a, b] of spans) if (t >= a && t < b) return t - a;
	return null;
}

/* ---------- frames ---------- */

/** where every frame sits at `t`, the dragged one carried by its dragger's smoothed hand */
export function framesAt(scene: Scene, t: number, cursor: Spring): FrameBox[] {
	return scene.frames.map((frame) => {
		let dx = 0;
		let dy = 0;
		for (const track of scene.tracks) {
			for (const [pressAt, name] of track.drags ?? []) {
				if (name !== frame.name) continue;
				const press = (track.presses ?? []).find(([a]) => a === pressAt);
				if (press === undefined) continue;
				const tt = mod(t, scene.length);
				const grab = pathAt(track.keys, scene.length, press[0]);
				const drop = pathAt(track.keys, scene.length, press[1]);
				if (tt >= press[0] && tt < press[1]) {
					const hand = chain((x) => packetAt(track, scene.length, x), t, [cursor], press[0] - 0.5).p[0] ?? grab;
					dx += hand.x - grab.x;
					dy += hand.y - grab.y;
				} else if (tt >= press[1]) {
					dx += drop.x - grab.x;
					dy += drop.y - grab.y;
				}
			}
		}
		return { ...frame, x: frame.x + dx, y: frame.y + dy };
	});
}

/** the frame under a point; the loop's own drag offsets are resolved from the plain path */
export function frameUnder(scene: Scene, time: number, at: Vec): FrameBox | null {
	const t = mod(time, scene.length);
	for (const frame of [...scene.frames].reverse()) {
		let { x, y } = frame;
		for (const track of scene.tracks) {
			for (const [pressAt, name] of track.drags ?? []) {
				if (name !== frame.name) continue;
				const press = (track.presses ?? []).find(([a]) => a === pressAt);
				if (press === undefined) continue;
				const grab = pathAt(track.keys, scene.length, press[0]);
				const end = t >= press[1] ? press[1] : t >= press[0] ? t : null;
				if (end === null) continue;
				const hand = pathAt(track.keys, scene.length, end);
				x += hand.x - grab.x;
				y += hand.y - grab.y;
			}
		}
		if (at.x >= x && at.x <= x + frame.w && at.y >= y - 22 && at.y <= y + frame.h) return { ...frame, x, y };
	}
	return null;
}

/* ---------- what every take is handed ---------- */

export interface Seen {
	readonly track: Track;
	readonly person: Person;
	/** 0 gone, 1 here: eased in over arrival, out over leaving */
	readonly presence: number;
	/** seconds since arriving and until leaving; Infinity for someone here all loop */
	readonly since: number;
	readonly until: number;
	/** the smoothed hand, and the take's softer follower one stage behind it */
	readonly pos: Vec;
	readonly vel: Vec;
	readonly trail: Vec;
	readonly packet: Vec;
	readonly moving: boolean;
	/** seconds in the current state: moving for, or still for */
	readonly stillFor: number;
	readonly pressed: boolean;
	readonly dragging: string | null;
	readonly hover: FrameBox | null;
	readonly idle: boolean;
}

export interface Feel {
	readonly cursor: Spring;
	readonly trail: Spring;
}

export function seenAt(scene: Scene, t: number, feel: Feel): Seen[] {
	const out: Seen[] = [];
	for (const track of scene.tracks) {
		if (track.page !== undefined) continue;
		const span = spanAt(track, scene.length, t);
		if (span === null) continue;
		const arrive = easeOut(span.since / 0.45);
		const leave = easeOut(span.until / 0.4);
		const target = (x: number) => packetAt(track, scene.length, x);
		const sim = chain(target, t, [feel.cursor, feel.trail], t - span.since, 1.6);
		const motion = motionAt(track.keys, scene.length, t);
		const press = inWindow(track.presses, scene.length, t);
		const drag = press === null ? null : ((track.drags ?? []).find(([a]) => Math.abs(a - (mod(t, scene.length) - press)) < 1e-6)?.[1] ?? null);
		const raw = pathAt(track.keys, scene.length, t);
		out.push({
			track,
			person: track.person,
			presence: Math.min(arrive, leave),
			since: span.since,
			until: span.until,
			pos: sim.p[0] ?? raw,
			vel: sim.v[0] ?? { x: 0, y: 0 },
			trail: sim.p[1] ?? raw,
			packet: target(t),
			moving: motion.moving,
			stillFor: motion.moving ? 0 : motion.since,
			pressed: press !== null,
			dragging: drag,
			hover: frameUnder(scene, t, raw),
			idle: !motion.moving && motion.since >= scene.idleAfter,
		});
	}
	return out;
}

/** whether a past instant was still, idle, moving or pressed, from the plain path: cheap enough to settle over */
export function wasMoving(track: Track, scene: Scene, t: number): boolean {
	return motionAt(track.keys, scene.length, t).moving;
}
export function wasStillFor(track: Track, scene: Scene, t: number): number {
	const m = motionAt(track.keys, scene.length, t);
	return m.moving ? 0 : m.since;
}
export function wasPressed(track: Track, scene: Scene, t: number): boolean {
	return inWindow(track.presses, scene.length, t) !== null;
}
export function wasOver(track: Track, scene: Scene, t: number): FrameBox | null {
	return frameUnder(scene, t, pathAt(track.keys, scene.length, t));
}

/** who has a frame selected right now */
export function selectionsAt(scene: Scene, t: number): { frame: string; person: Person }[] {
	const tt = mod(t, scene.length);
	const out: { frame: string; person: Person }[] = [];
	for (const track of scene.tracks) {
		if (track.page !== undefined) continue;
		for (const [a, b, frame] of track.selects ?? []) if (tt >= a && tt < b) out.push({ frame, person: track.person });
	}
	return out;
}

/** a followed person's own view, as centre and zoom */
export function viewAt(scene: Scene, t: number): { x: number; y: number; z: number } {
	const keys = scene.view ?? [];
	const tt = mod(t, scene.length);
	const first = keys[0];
	if (first === undefined) return { x: VIEWPORT.w / 2, y: VIEWPORT.h / 2, z: 1 };
	if (tt <= first.t) return first;
	for (let i = 1; i < keys.length; i++) {
		const a = keys[i - 1];
		const b = keys[i];
		if (a === undefined || b === undefined) continue;
		if (tt <= b.t) {
			const u = smooth(clamp((tt - a.t) / Math.max(1e-6, b.t - a.t)));
			return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) };
		}
	}
	return keys[keys.length - 1] ?? first;
}

/* ---------- the scenes ---------- */

const FRAMES: readonly FrameBox[] = [
	{ name: "menu", screen: "menu", x: 110, y: 172, w: 210, h: 455 },
	{ name: "cart", screen: "cart", x: 390, y: 202, w: 210, h: 455 },
	{ name: "receipt", screen: "receipt", x: 670, y: 150, w: 210, h: 455 },
];

/**
 * Twenty-four seconds on one page. Maja crosses the top, settles on the cart,
 * goes still and then idle, and wakes near the end. Jonas drags the receipt
 * out and later back. Ines joins and parks beside Maja. Theo leaves early
 * and comes back for the seam.
 */
export const LOOP: Scene = {
	length: 24,
	idleAfter: 5,
	frames: FRAMES,
	marks: [
		{ t: 3.0, label: "jonas drags" },
		{ t: 5.0, label: "theo leaves" },
		{ t: 5.6, label: "maja still" },
		{ t: 8.4, label: "ines joins" },
		{ t: 10.6, label: "maja idle" },
		{ t: 15.0, label: "jonas drags back" },
		{ t: 17.6, label: "ines leaves" },
		{ t: 20.6, label: "maja moves" },
		{ t: 21.6, label: "theo joins" },
	],
	tracks: [
		{
			person: PEOPLE.maja,
			keys: [
				{ t: 0, x: 70, y: 96 },
				{ t: 0.6, x: 70, y: 96 },
				{ t: 3.2, x: 610, y: 104, bow: -34 },
				{ t: 3.6, x: 610, y: 104 },
				{ t: 5.6, x: 478, y: 404, bow: 26 },
				{ t: 20.6, x: 478, y: 404 },
				{ t: 23.2, x: 70, y: 96, bow: 40 },
				{ t: 24, x: 70, y: 96 },
			],
		},
		{
			person: PEOPLE.jonas,
			keys: [
				{ t: 0, x: 1010, y: 560 },
				{ t: 1.0, x: 1010, y: 560 },
				{ t: 2.6, x: 782, y: 300, bow: 30 },
				{ t: 3.3, x: 782, y: 300 },
				{ t: 6.3, x: 932, y: 382, bow: -18 },
				{ t: 6.8, x: 932, y: 382 },
				{ t: 8.4, x: 1046, y: 752, bow: -24 },
				{ t: 10.4, x: 1046, y: 752 },
				{ t: 12.2, x: 1010, y: 112, bow: 40 },
				{ t: 13.0, x: 1010, y: 112 },
				{ t: 14.6, x: 932, y: 382, bow: -20 },
				{ t: 15.3, x: 932, y: 382 },
				{ t: 18.0, x: 782, y: 300, bow: 16 },
				{ t: 18.5, x: 782, y: 300 },
				{ t: 19.4, x: 1052, y: 650, bow: 20 },
				{ t: 20.0, x: 1052, y: 650 },
				{ t: 22.4, x: 1010, y: 560, bow: -12 },
				{ t: 24, x: 1010, y: 560 },
			],
			presses: [
				[3.0, 6.6],
				[9.6, 9.76],
				[15.0, 18.3],
				[20.0, 20.16],
			],
			drags: [
				[3.0, "receipt"],
				[15.0, "receipt"],
			],
			selects: [
				[3.0, 9.6, "receipt"],
				[15.0, 20.0, "receipt"],
			],
		},
		{
			person: PEOPLE.ines,
			present: [[8.4, 17.6]],
			keys: [
				{ t: 0, x: 300, y: 770 },
				{ t: 8.8, x: 300, y: 770 },
				{ t: 11.0, x: 516, y: 436, bow: 30 },
				{ t: 13.6, x: 516, y: 436 },
				{ t: 16.2, x: 250, y: 106, bow: -40 },
				{ t: 24, x: 250, y: 106 },
			],
		},
		{
			person: PEOPLE.theo,
			present: [[21.6, 29.0]],
			keys: [
				{ t: 0, x: 236, y: 590 },
				{ t: 1.2, x: 236, y: 590 },
				{ t: 3.4, x: 60, y: 770, bow: 24 },
				{ t: 21.3, x: 60, y: 770 },
				{ t: 21.31, x: 196, y: 500 },
				{ t: 22.2, x: 196, y: 500 },
				{ t: 23.8, x: 236, y: 590, bow: -14 },
				{ t: 24, x: 236, y: 590 },
			],
		},
	],
	view: [
		{ t: 0, x: 574, y: 428, z: 1 },
		{ t: 3.6, x: 574, y: 428, z: 1 },
		{ t: 6.0, x: 500, y: 410, z: 1.34 },
		{ t: 20.6, x: 500, y: 410, z: 1.34 },
		{ t: 23.0, x: 574, y: 428, z: 1 },
		{ t: 24, x: 574, y: 428, z: 1 },
	],
};

/**
 * Seven in the project. Four on this page, Ines idle on the cart the whole
 * loop; Sara and Omar on `site`, Elin on `directing`.
 */
export const CROWD: Scene = {
	length: 16,
	idleAfter: 5,
	frames: FRAMES,
	marks: [
		{ t: 2.0, label: "jonas drags" },
		{ t: 6.0, label: "maja still" },
		{ t: 9.0, label: "jonas drags back" },
	],
	tracks: [
		{
			person: PEOPLE.maja,
			keys: [
				{ t: 0, x: 120, y: 90 },
				{ t: 2.4, x: 560, y: 120, bow: -26 },
				{ t: 3.0, x: 560, y: 120 },
				{ t: 5.0, x: 260, y: 360, bow: 20 },
				{ t: 11.0, x: 260, y: 360 },
				{ t: 14.0, x: 120, y: 90, bow: 30 },
				{ t: 16, x: 120, y: 90 },
			],
		},
		{
			person: PEOPLE.jonas,
			keys: [
				{ t: 0, x: 1010, y: 560 },
				{ t: 1.4, x: 782, y: 300, bow: 24 },
				{ t: 2.2, x: 782, y: 300 },
				{ t: 4.6, x: 932, y: 382, bow: -14 },
				{ t: 5.2, x: 932, y: 382 },
				{ t: 7.0, x: 1040, y: 120, bow: 30 },
				{ t: 8.2, x: 932, y: 382, bow: -20 },
				{ t: 8.8, x: 932, y: 382 },
				{ t: 11.2, x: 782, y: 300, bow: 14 },
				{ t: 11.8, x: 782, y: 300 },
				{ t: 14.0, x: 1010, y: 560, bow: -20 },
				{ t: 16, x: 1010, y: 560 },
			],
			presses: [
				[2.0, 4.9],
				[8.6, 11.5],
			],
			drags: [
				[2.0, "receipt"],
				[8.6, "receipt"],
			],
			selects: [[2.0, 12.0, "receipt"]],
		},
		{
			person: PEOPLE.ines,
			keys: [
				{ t: 0, x: 500, y: 520 },
				{ t: 16, x: 500, y: 520 },
			],
		},
		{
			person: PEOPLE.theo,
			keys: [
				{ t: 0, x: 120, y: 770 },
				{ t: 3.0, x: 120, y: 770 },
				{ t: 6.0, x: 640, y: 760, bow: 30 },
				{ t: 9.0, x: 640, y: 760 },
				{ t: 12.6, x: 120, y: 770, bow: -24 },
				{ t: 16, x: 120, y: 770 },
			],
		},
		{ person: PEOPLE.sara, page: "site", keys: [{ t: 0, x: 0, y: 0 }] },
		{ person: PEOPLE.omar, page: "site", keys: [{ t: 0, x: 0, y: 0 }] },
		{ person: PEOPLE.elin, page: "directing", keys: [{ t: 0, x: 0, y: 0 }] },
	],
};
