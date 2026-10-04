/**
 * One loop, one clock. Every take on this page reads the same script, so the
 * takes differ only in how they draw the same afternoon: Maja moving across
 * the canvas and pointing at Pay while she talks, Theo going still on the menu
 * and later idle, Ines pressing the receipt and dragging it while everyone
 * watches it move.
 *
 * Positions are viewport pixels at the canvas's own zoom. Nothing here reads
 * the wall clock: a take is a pure function of `t`, which is what lets the bar
 * under the window pause and scrub it.
 */

export const LOOP_MS = 14_000;

export interface Person {
	readonly id: string;
	readonly name: string;
	readonly color: string;
	/** the page they are on; absent is this one */
	readonly page?: string | undefined;
	/** what they are looking at, for someone on another page */
	readonly frame?: string | undefined;
	readonly track?: Track | undefined;
}

/** a key: at `t` the pointer is at x, y; `bend` arcs the move that ends here */
export type Key = readonly [t: number, x: number, y: number, bend?: number];
type Span = readonly [from: number, to: number];

export interface Track {
	readonly keys: readonly Key[];
	readonly presses?: readonly Span[] | undefined;
	readonly idle?: readonly Span[] | undefined;
}

export interface Pointer {
	readonly x: number;
	readonly y: number;
	readonly moving: boolean;
	/** ms since the pointer last moved; 0 while it moves */
	readonly still: number;
	/** ms since this move began; 0 while it holds */
	readonly movedFor: number;
	/** where the last hold was and how long it lasted, while moving */
	readonly before: { x: number; y: number; held: number } | null;
	readonly pressed: boolean;
	/** ms since the press began, while pressed */
	readonly held: number;
	readonly idle: boolean;
	/** ms since idle began, while idle */
	readonly idleFor: number;
}

const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

export function wrap(t: number): number {
	return ((t % LOOP_MS) + LOOP_MS) % LOOP_MS;
}

function inside(spans: readonly Span[] | undefined, t: number): number | null {
	for (const [from, to] of spans ?? []) if (t >= from && t < to) return t - from;
	return null;
}

export function position(track: Track, raw: number): { x: number; y: number; moving: boolean; since: number } {
	// `since` is when the current hold or move began
	const t = wrap(raw);
	const { keys } = track;
	const first = keys[0];
	const last = keys[keys.length - 1];
	if (first === undefined || last === undefined) return { x: 0, y: 0, moving: false, since: 0 };
	if (t <= first[0]) return { x: first[1], y: first[2], moving: false, since: last[0] - LOOP_MS };
	for (let i = 0; i < keys.length - 1; i++) {
		const a = keys[i];
		const b = keys[i + 1];
		if (a === undefined || b === undefined || t < a[0] || t >= b[0]) continue;
		if (a[1] === b[1] && a[2] === b[2]) return { x: a[1], y: a[2], moving: false, since: a[0] };
		const u = ease((t - a[0]) / (b[0] - a[0]));
		// a quadratic arc: hands travel in curves, never along a ruler
		const bend = b[3] ?? 0.12;
		const dx = b[1] - a[1];
		const dy = b[2] - a[2];
		const cx = a[1] + dx / 2 - dy * bend;
		const cy = a[2] + dy / 2 + dx * bend;
		const x = (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * cx + u * u * b[1];
		const y = (1 - u) ** 2 * a[2] + 2 * (1 - u) * u * cy + u * u * b[2];
		return { x, y, moving: true, since: a[0] };
	}
	return { x: last[1], y: last[2], moving: false, since: last[0] };
}

export function pointer(track: Track, raw: number): Pointer {
	const t = wrap(raw);
	const at = position(track, t);
	const held = inside(track.presses, t);
	const idleFor = inside(track.idle, t);
	let before: Pointer["before"] = null;
	if (at.moving) {
		const hold = position(track, at.since - 1);
		before = { x: hold.x, y: hold.y, held: hold.moving ? 0 : at.since - hold.since };
	}
	return {
		x: at.x,
		y: at.y,
		moving: at.moving,
		still: at.moving ? 0 : t - at.since,
		movedFor: at.moving ? t - at.since : 0,
		before,
		pressed: held !== null,
		held: held ?? 0,
		idle: idleFor !== null,
		idleFor: idleFor ?? 0,
	};
}

/** the last `span` ms of a pointer's path, newest first, one point per `step` */
export function trail(track: Track, t: number, span = 620, step = 16): { x: number; y: number }[] {
	const points: { x: number; y: number }[] = [];
	for (let back = 0; back <= span; back += step) {
		const at = position(track, t - back);
		points.push({ x: at.x, y: at.y });
	}
	return points;
}

/** smooth 0..1 over [from, from + over] */
export function ramp(value: number, from: number, over: number): number {
	const u = Math.min(1, Math.max(0, (value - from) / over));
	return u * u * (3 - 2 * u);
}

// ─── the canvas ─────────────────────────────────────────────────────────────

export const FRAME_W = 240;
export const FRAME_H = 520;

export interface FramePlace {
	readonly name: "menu" | "cart" | "receipt";
	readonly x: number;
	readonly y: number;
}

const RECEIPT_HOME = { x: 750, y: 160 } as const;
const RECEIPT_MOVED = { x: 840, y: 250 } as const;
/** where Ines took hold of the receipt, from its corner */
const GRIP = { x: 120, y: 40 } as const;

const ines: Track = {
	keys: [
		[400, 1080, 90],
		[2800, RECEIPT_HOME.x + GRIP.x, RECEIPT_HOME.y + GRIP.y, 0.18],
		[3600, RECEIPT_HOME.x + GRIP.x, RECEIPT_HOME.y + GRIP.y],
		[5800, RECEIPT_MOVED.x + GRIP.x, RECEIPT_MOVED.y + GRIP.y, 0.04],
		[7000, RECEIPT_MOVED.x + GRIP.x, RECEIPT_MOVED.y + GRIP.y],
		[8300, 1070, 600, -0.14],
		[9600, 1070, 600],
		[10800, RECEIPT_MOVED.x + GRIP.x, RECEIPT_MOVED.y + GRIP.y, 0.1],
		[11000, RECEIPT_MOVED.x + GRIP.x, RECEIPT_MOVED.y + GRIP.y],
		[12800, RECEIPT_HOME.x + GRIP.x, RECEIPT_HOME.y + GRIP.y, -0.04],
		[13100, RECEIPT_HOME.x + GRIP.x, RECEIPT_HOME.y + GRIP.y],
		[14000, 1080, 90, 0.1],
	],
	presses: [
		[3600, 6200],
		[8300, 8420],
		[11000, 13100],
	],
};

/** the receipt is wherever Ines's hand has put it */
export function receiptAt(raw: number): { x: number; y: number } {
	const t = wrap(raw);
	if (t < 3600 || t >= 13100) return RECEIPT_HOME;
	if (t >= 6200 && t < 11000) return RECEIPT_MOVED;
	const at = position(ines, t);
	return { x: at.x - GRIP.x, y: at.y - GRIP.y };
}

/** who has the receipt selected: Ines, from her press until she clicks away */
export function receiptHeld(raw: number): boolean {
	const t = wrap(raw);
	return (t >= 3600 && t < 8300) || (t >= 11000 && t < 13800);
}

/** the receipt is moving under her hand right now */
export function receiptDragging(raw: number): boolean {
	const t = wrap(raw);
	return (t >= 3600 && t < 5800) || (t >= 11000 && t < 12800);
}

export function frames(t: number): readonly FramePlace[] {
	const receipt = receiptAt(t);
	return [
		{ name: "menu", x: 90, y: 180 },
		{ name: "cart", x: 420, y: 200 },
		{ name: "receipt", x: receipt.x, y: receipt.y },
	];
}

/** the frame under a point, or null on empty canvas */
export function frameUnder(t: number, x: number, y: number): FramePlace | null {
	for (const place of frames(t)) {
		if (x >= place.x && x <= place.x + FRAME_W && y >= place.y && y <= place.y + FRAME_H) return place;
	}
	return null;
}

/** elements inside a frame, frame-relative, for a take that points at one */
export const ELEMENTS: Readonly<Record<FramePlace["name"], readonly { name: string; x: number; y: number; w: number; h: number }[]>> = {
	menu: [
		{ name: "Cortado", x: 16, y: 64, w: 208, h: 34 },
		{ name: "Flat white", x: 16, y: 106, w: 208, h: 34 },
		{ name: "Filter coffee", x: 16, y: 148, w: 208, h: 34 },
		{ name: "Checkout", x: 16, y: 474, w: 208, h: 30 },
	],
	cart: [
		{ name: "1 × Cortado", x: 16, y: 50, w: 208, h: 28 },
		{ name: "1 × Flat white", x: 16, y: 86, w: 208, h: 28 },
		{ name: "Total", x: 16, y: 444, w: 208, h: 30 },
		{ name: "Pay", x: 16, y: 474, w: 208, h: 30 },
	],
	receipt: [{ name: "Thanks!", x: 70, y: 210, w: 100, h: 100 }],
};

// ─── the people ─────────────────────────────────────────────────────────────

const PAY = { x: 540, y: 689 } as const;

const maja: Track = {
	keys: [
		[0, 60, 520],
		[1800, PAY.x, PAY.y, 0.16],
		[2400, PAY.x, PAY.y],
		// a loop around Pay while she says "this one"
		[2700, PAY.x + 44, PAY.y - 4, 0.3],
		[2950, PAY.x + 8, PAY.y + 13, 0.3],
		[3200, PAY.x - 42, PAY.y + 3, 0.3],
		[3450, PAY.x - 6, PAY.y - 12, 0.3],
		[3650, PAY.x, PAY.y, 0.2],
		[6000, PAY.x, PAY.y],
		[7400, 610, 110, -0.12],
		[9000, 610, 110],
		[10600, 262, 668, 0.14],
		[12200, 262, 668],
		[14000, 60, 520, -0.1],
	],
};

const theo: Track = {
	keys: [
		[0, 300, 770],
		[1800, 214, 304, 0.1],
		[12700, 214, 304],
		[14000, 300, 770, 0.1],
	],
	idle: [[7500, 12700]],
};

const sara: Track = {
	keys: [
		[0, 640, 470],
		[2600, 520, 300, 0.2],
		[5200, 520, 300],
		[7600, 700, 820, -0.1],
		[10400, 700, 820],
		[14000, 640, 470, 0.14],
	],
};

export const MAJA: Person = { id: "maja", name: "Maja", color: "#7ea6f7", track: maja };
export const THEO: Person = { id: "theo", name: "Theo", color: "#72c79a", track: theo };
export const INES: Person = { id: "ines", name: "Ines", color: "#e3b55f", track: ines };

export const TEAM: readonly Person[] = [MAJA, THEO, INES];

export const CROWD: readonly Person[] = [
	MAJA,
	THEO,
	INES,
	{ id: "sara", name: "Sara", color: "#5ecfc8", track: sara },
	{ id: "oskar", name: "Oskar", color: "#b99cf0", page: "site", frame: "landing" },
	{ id: "noah", name: "Noah", color: "#ea8fb6", page: "site", frame: "pricing" },
	{ id: "elin", name: "Elin", color: "#b9c46e", page: "directing", frame: "annotate" },
];

/** Maja's camera, which is what you see while you follow her: x, y of the world at the viewport's top left, and zoom */
const majaCamera: readonly (readonly [t: number, x: number, y: number, k: number])[] = [
	[0, 0, 0, 1],
	[1200, 0, 0, 1],
	[2400, 150, 230, 1.32],
	[6000, 150, 230, 1.32],
	[7600, 60, 0, 1.08],
	[9200, 60, 0, 1.08],
	[11000, -40, 150, 1.22],
	[12400, -40, 150, 1.22],
	[14000, 0, 0, 1],
];

export function camera(raw: number): { x: number; y: number; k: number } {
	const t = wrap(raw);
	for (let i = 0; i < majaCamera.length - 1; i++) {
		const a = majaCamera[i];
		const b = majaCamera[i + 1];
		if (a === undefined || b === undefined || t < a[0] || t >= b[0]) continue;
		const u = ease((t - a[0]) / (b[0] - a[0]));
		return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u, k: a[3] + (b[3] - a[3]) * u };
	}
	return { x: 0, y: 0, k: 1 };
}

/** what the bar under the window marks, so a scrub can land on a moment */
export const MOMENTS: readonly { t: number; label: string }[] = [
	{ t: 400, label: "moving" },
	{ t: 2400, label: "pointing" },
	{ t: 3600, label: "drag" },
	{ t: 7500, label: "idle" },
	{ t: 11000, label: "drag back" },
];
