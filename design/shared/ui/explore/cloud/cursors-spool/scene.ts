/**
 * The loop every cursor take plays: one 16 second clock, and everything on the
 * canvas is a pure function of it, so a scrub lands on exactly the picture play
 * would have drawn.
 *
 * World units are canvas pixels at 100%. The viewport is the canvas between the
 * pages rail and the dock strip with the panel shut: 1148 by 856.
 */

export const LOOP = 16;
export const VIEW = { w: 1148, h: 856 } as const;

export interface Pt {
	x: number;
	y: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Person {
	id: string;
	name: string;
	initials: string;
	/** a thread colour: muted, never the red, which stays the selection's */
	color: string;
}

export const PEOPLE = {
	ines: { id: "ines", name: "Ines", initials: "IN", color: "#86c2a8" },
	mats: { id: "mats", name: "Mats", initials: "MA", color: "#dcae68" },
	kofi: { id: "kofi", name: "Kofi", initials: "KO", color: "#8eaaf0" },
	saga: { id: "saga", name: "Saga", initials: "SA", color: "#c7a0e0" },
	theo: { id: "theo", name: "Theo", initials: "TH", color: "#b9c97a" },
	noor: { id: "noor", name: "Noor", initials: "NO", color: "#6cc4d8" },
	elif: { id: "elif", name: "Elif", initials: "EL", color: "#e3a0b8" },
} as const satisfies Record<string, Person>;

export const ME: Person = { id: "liam", name: "Liam", initials: "LI", color: "#f5391a" };

export type FrameId = "menu" | "cart" | "receipt";

export const FRAMES: readonly { id: FrameId; x: number; y: number; w: number; h: number }[] = [
	{ id: "menu", x: 110, y: 190, w: 200, h: 432 },
	{ id: "cart", x: 380, y: 190, w: 200, h: 432 },
	{ id: "receipt", x: 650, y: 190, w: 200, h: 432 },
];

/** the frame you have selected yourself: solid red, the way spool draws it today */
export const MINE: FrameId = "menu";

type Span = readonly [number, number];
/** [time, x, y, bend]: bend arcs the move off the straight line, as a hand does */
type Key = readonly [number, number, number, number?];

export interface Track {
	person: Person;
	page: string;
	/** where the cursor is over the loop; absent for someone on another page */
	keys?: readonly Key[];
	idle?: readonly Span[];
	press?: readonly Span[];
	drags?: readonly { frame: FrameId; from: number; to: number }[];
	select?: readonly { frame: FrameId; from: number; to: number }[];
	/** what the list says for someone not on this canvas */
	where?: string;
}

export interface Camera {
	k: number;
	cx: number;
	cy: number;
}

export interface Scene {
	tracks: readonly Track[];
	camera: (t: number) => Camera;
	following?: string;
	listOpen?: boolean;
	beats: readonly { at: number; label: string }[];
	pages: readonly { name: string; frames: readonly string[]; active?: boolean }[];
}

// ---------------------------------------------------------------- easing

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const smooth = (u: number) => {
	const c = clamp(u);
	return c * c * (3 - 2 * c);
};

export const wrap = (t: number) => ((t % LOOP) + LOOP) % LOOP;

/** 0 outside every span, 1 inside, eased over `rise` going in and `fall` coming out */
export function envelope(t: number, spans: readonly Span[] | undefined, rise = 0.18, fall = rise): number {
	if (spans === undefined) return 0;
	let best = 0;
	for (const [a, b] of spans) {
		const v = Math.min(smooth((t - a) / rise), 1 - smooth((t - b) / fall));
		if (v > best) best = v;
	}
	return best;
}

const inside = (t: number, spans: readonly Span[] | undefined) =>
	spans?.some(([a, b]) => t >= a && t < b) ?? false;

// ---------------------------------------------------------------- the path

export function pos(track: Track, at: number): Pt {
	const keys = track.keys;
	if (keys === undefined || keys.length === 0) return { x: -999, y: -999 };
	const t = wrap(at);
	for (let i = 0; i < keys.length - 1; i++) {
		const a = keys[i];
		const b = keys[i + 1];
		if (a === undefined || b === undefined) continue;
		if (t >= a[0] && t < b[0]) {
			const u = easeInOut((t - a[0]) / (b[0] - a[0]));
			const dx = b[1] - a[1];
			const dy = b[2] - a[2];
			const bend = b[3] ?? 0.1;
			// quadratic bezier through a control point pushed off the chord's midpoint
			const cx = a[1] + dx / 2 - dy * bend;
			const cy = a[2] + dy / 2 + dx * bend;
			const v = 1 - u;
			return { x: v * v * a[1] + 2 * v * u * cx + u * u * b[1], y: v * v * a[2] + 2 * v * u * cy + u * u * b[2] };
		}
	}
	const last = keys[keys.length - 1];
	return last === undefined ? { x: 0, y: 0 } : { x: last[1], y: last[2] };
}

/** seconds since the cursor last moved, read off the holds in its keys */
function stillFor(track: Track, t: number): number {
	const keys = track.keys;
	if (keys === undefined) return 99;
	let i = keys.findIndex((k, n) => {
		const next = keys[n + 1];
		return next !== undefined && t >= k[0] && t < next[0];
	});
	if (i < 0) return 0;
	const same = (a: Key | undefined, b: Key | undefined) =>
		a !== undefined && b !== undefined && a[1] === b[1] && a[2] === b[2];
	if (!same(keys[i], keys[i + 1])) return 0;
	while (i > 0 && same(keys[i - 1], keys[i])) i--;
	return t - (keys[i]?.[0] ?? 0);
}

function frameOffset(scene: Scene, frame: FrameId, t: number): Pt {
	let x = 0;
	let y = 0;
	for (const track of scene.tracks) {
		for (const drag of track.drags ?? []) {
			if (drag.frame !== frame || t < drag.from) continue;
			const a = pos(track, drag.from);
			const b = pos(track, Math.min(t, drag.to));
			x += b.x - a.x;
			y += b.y - a.y;
		}
	}
	return { x, y };
}

export function frameRect(scene: Scene, id: FrameId, t: number): Rect {
	const f = FRAMES.find((frame) => frame.id === id) ?? FRAMES[0];
	if (f === undefined) return { x: 0, y: 0, w: 0, h: 0 };
	const o = frameOffset(scene, id, wrap(t));
	return { x: f.x + o.x, y: f.y + o.y, w: f.w, h: f.h };
}

export interface PersonState {
	track: Track;
	person: Person;
	here: boolean;
	at: Pt;
	speed: number;
	/** 0 at rest, 1 in full flight, eased so a label can ride it without flicker */
	moving: number;
	stillFor: number;
	idle: number;
	press: number;
	pressing: boolean;
	dragging: boolean;
	selected: FrameId | undefined;
	hover: FrameId | undefined;
}

export function stateOf(scene: Scene, track: Track, at: number): PersonState {
	const t = wrap(at);
	const p = pos(track, t);
	const q = pos(track, t - 0.04);
	const speed = Math.hypot(p.x - q.x, p.y - q.y) / 0.04;
	const still = stillFor(track, t);
	const here = track.keys !== undefined;
	const sel = track.select?.find((s) => t >= s.from && t < s.to)?.frame;
	const hover = here
		? FRAMES.find((f) => {
				const r = frameRect(scene, f.id, t);
				return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
			})?.id
		: undefined;
	return {
		track,
		person: track.person,
		here,
		at: p,
		speed,
		moving: 1 - smooth(still / 0.5),
		stillFor: still,
		idle: envelope(t, track.idle, 0.7, 0.4),
		press: envelope(t, track.press, 0.09, 0.14),
		pressing: inside(t, track.press),
		dragging: track.drags?.some((d) => t >= d.from && t < d.to) ?? false,
		selected: sel,
		hover,
	};
}

// ---------------------------------------------------------------- the camera

type CamKey = readonly [number, number, number, number];

function cameraFrom(keys: readonly CamKey[]) {
	return (at: number): Camera => {
		const t = wrap(at);
		for (let i = 0; i < keys.length - 1; i++) {
			const a = keys[i];
			const b = keys[i + 1];
			if (a === undefined || b === undefined) continue;
			if (t >= a[0] && t < b[0]) {
				const u = easeInOut((t - a[0]) / (b[0] - a[0]));
				return { k: a[1] + (b[1] - a[1]) * u, cx: a[2] + (b[2] - a[2]) * u, cy: a[3] + (b[3] - a[3]) * u };
			}
		}
		const last = keys[keys.length - 1];
		return last === undefined ? HOME : { k: last[1], cx: last[2], cy: last[3] };
	};
}

const HOME: Camera = { k: 1, cx: VIEW.w / 2, cy: VIEW.h / 2 };

export function project(cam: Camera, p: Pt): Pt {
	return { x: VIEW.w / 2 + (p.x - cam.cx) * cam.k, y: VIEW.h / 2 + (p.y - cam.cy) * cam.k };
}

export function projectRect(cam: Camera, r: Rect): Rect {
	const a = project(cam, r);
	return { x: a.x, y: a.y, w: r.w * cam.k, h: r.h * cam.k };
}

// ---------------------------------------------------------------- the people

const INES: Track = {
	person: PEOPLE.ines,
	page: "checkout",
	keys: [
		[0, 1010, 130],
		[0.8, 1010, 130],
		[4.4, 250, 726, 0.14],
		[5.2, 262, 712, 0.3],
		[14.4, 262, 712],
		[16, 1010, 130, -0.12],
	],
	idle: [[9.6, 14.3]],
};

const MATS: Track = {
	person: PEOPLE.mats,
	page: "checkout",
	keys: [
		[0, 990, 660],
		[2.0, 760, 330, -0.12],
		[2.6, 760, 330],
		[5.6, 900, 420, 0.06],
		[6.4, 900, 420],
		[7.8, 930, 470, 0.2],
		[9.6, 930, 470],
		[12.4, 790, 380, -0.06],
		[13.2, 790, 380],
		[14.1, 1010, 620, 0.12],
		[14.6, 1010, 620],
		[16, 990, 660, 0.2],
	],
	press: [
		[2.4, 6.0],
		[9.5, 12.8],
		[14.3, 14.45],
	],
	drags: [
		{ frame: "receipt", from: 2.6, to: 5.6 },
		{ frame: "receipt", from: 9.6, to: 12.4 },
	],
	select: [{ frame: "receipt", from: 2.4, to: 14.35 }],
};

const KOFI: Track = {
	person: PEOPLE.kofi,
	page: "checkout",
	keys: [
		[0, 130, 770],
		[0.6, 130, 770],
		[2.0, 170, 742, 0.2],
		[3.4, 205, 380, -0.1],
		[4.6, 232, 420, 0.3],
		[5.8, 190, 470, -0.3],
		[7.0, 214, 448, 0.2],
		[8.2, 345, 410, -0.1],
		[9.0, 345, 410],
		[10.4, 470, 300, 0.1],
		[11.6, 500, 336, -0.3],
		[13.0, 452, 360, 0.3],
		[16, 130, 770, 0.12],
	],
};

const SAGA: Track = {
	person: PEOPLE.saga,
	page: "checkout",
	keys: [
		[0, 60, 120],
		[1.8, 60, 120],
		[5.6, 1080, 800, -0.08],
		[8.4, 1080, 800],
		[11.6, 520, 680, 0.16],
		[13.4, 520, 680],
		[16, 60, 120, -0.1],
	],
};

const ELIF: Track = {
	person: PEOPLE.elif,
	page: "checkout",
	keys: [
		[0, 470, 120],
		[1.4, 470, 120],
		[3.2, 540, 250, 0.2],
		[6.0, 500, 290, -0.3],
		[8.8, 540, 250, 0.3],
		[10.8, 470, 120, 0.1],
		[16, 470, 120],
	],
};

const INES_IDLE: Track = { ...INES, keys: [[0, 262, 712], [16, 262, 712]], idle: [[-1, 17]] };

const PAGES = [
	{ name: "checkout", frames: ["menu", "cart", "receipt"], active: true },
	{ name: "onboarding", frames: ["welcome", "pick-cafe"] },
	{ name: "brand", frames: ["type", "colour"] },
] as const;

const BEATS = [
	{ at: 0.8, label: "ines moves" },
	{ at: 2.4, label: "mats presses" },
	{ at: 3.4, label: "kofi over menu" },
	{ at: 5.2, label: "ines still" },
	{ at: 8.2, label: "kofi on canvas" },
	{ at: 9.6, label: "ines idle" },
	{ at: 14.4, label: "back" },
] as const;

export const MAIN: Scene = {
	tracks: [INES, MATS, KOFI],
	camera: () => HOME,
	beats: BEATS,
	pages: PAGES,
};

export const FOLLOW: Scene = {
	tracks: [INES, MATS, KOFI],
	camera: cameraFrom([
		[0, 1, HOME.cx, HOME.cy],
		[1.4, 1, HOME.cx, HOME.cy],
		[3.4, 1.55, 250, 430],
		[7.0, 1.55, 250, 430],
		[9.0, 1.45, 470, 380],
		[12.6, 1.45, 470, 380],
		[14.8, 1, HOME.cx, HOME.cy],
		[16, 1, HOME.cx, HOME.cy],
	]),
	following: "kofi",
	beats: [
		{ at: 1.4, label: "kofi zooms" },
		{ at: 3.4, label: "on menu" },
		{ at: 7.0, label: "pans to cart" },
		{ at: 12.6, label: "zooms out" },
	],
	pages: PAGES,
};

export const CROWD: Scene = {
	tracks: [
		MATS,
		KOFI,
		SAGA,
		ELIF,
		INES_IDLE,
		{ person: PEOPLE.theo, page: "onboarding", where: "welcome" },
		{ person: PEOPLE.noor, page: "onboarding", where: "pick-cafe" },
	],
	camera: () => HOME,
	listOpen: true,
	beats: [
		{ at: 1.8, label: "saga moves" },
		{ at: 2.4, label: "mats presses" },
		{ at: 9.6, label: "drags back" },
	],
	pages: PAGES,
};
