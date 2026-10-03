import {
	type Camera,
	clamp,
	easeInOut,
	type FrameDef,
	lerp,
	PHONE_H,
	PHONE_W,
	pathAt,
	type PointerPath,
	type Scene,
	steppedAt,
	type Turn,
	VIEW_H,
	VIEW_W,
} from "./model";
import { blocksOf } from "./screens";

/**
 * Five afternoons on one kaffe canvas, one per hard case. Every take on the page
 * plays the same five, so a column compares drawings of identical events.
 */

const fixed = (x: number, y: number, k: number) => (): Camera => ({ x, y, k });

/** a camera that holds `cx, cy` at the middle of the viewport */
const centred = (cx: number, cy: number, k: number): Camera => ({ x: cx - VIEW_W / 2 / k, y: cy - VIEW_H / 2 / k, k });

const ROW: readonly FrameDef[] = [
	{ name: "menu", x: 0, y: 0, kind: "menu" },
	{ name: "cart", x: 560, y: 0, kind: "cart" },
	{ name: "checkout", x: 1120, y: 0, kind: "checkout" },
	{ name: "receipt", x: 1680, y: 0, kind: "receipt" },
];

const ASK = {
	ana: "Show the pickup time on the cart, and make Pay say the total.",
	ben: "Put a big pickup code on the receipt so the barista can call it out.",
	cleo: "Add a rewards card with stamps to the account page.",
	you: "Add Apple Pay above the card form, and a tip row.",
	benNote: "Let people leave a note for the barista.",
	anaOn: "Carry the pickup time through to checkout and offer Apple Pay.",
} as const;

/* ---------- base: everyday, with Ana 3,000px from her own agent ---------- */

const anaCart = (shift: number, start: number, end: number): Turn => ({
	id: "ana-cart",
	who: "ana",
	frame: "cart",
	ask: ASK.ana,
	start: start + shift,
	end: end + shift,
	writes: [
		{ at: 2.8 + shift, block: "pickup", feature: "pickup", note: "+ pickup row" },
		{ at: 5.0 + shift, block: "pay", feature: "pay-total", note: 'pay → "Pay $9.00"' },
		{ at: 7.4 + shift, block: "items", feature: "sizes", note: "+ size on each item" },
		{ at: 9.8 + shift, block: "pickup", feature: "pickup-eta", note: 'pickup → "Ready in about 6 minutes"' },
	],
});

export const BASE: Scene = {
	name: "base",
	duration: 24,
	poster: 9.9,
	zoom: "45%",
	frames: [
		{ name: "welcome", x: -3400, y: 0, kind: "plain", title: "Welcome", seed: 3 },
		...ROW,
		{ name: "account", x: 3700, y: 0, kind: "account" },
	],
	turns: [
		anaCart(0, 1.0, 12.0),
		{
			id: "ben-receipt",
			who: "ben",
			frame: "receipt",
			ask: ASK.ben,
			start: 5.5,
			end: 14.5,
			writes: [
				{ at: 7.0, block: "code", feature: "code", note: "+ pickup code card" },
				{ at: 9.6, block: "eta", feature: "eta", note: "+ ready line" },
				{ at: 12.4, block: "code", feature: "code-big", note: "code → 72px" },
			],
		},
		{
			id: "cleo-account",
			who: "cleo",
			frame: "account",
			ask: ASK.cleo,
			start: 2.0,
			end: 17.0,
			writes: [
				{ at: 4.4, block: "rewards", feature: "rewards", note: "+ rewards card" },
				{ at: 9.0, block: "stamps", feature: "stamps", note: "+ stamp row" },
				{ at: 14.6, block: "rewards", feature: "stamps-count", note: 'card → "6 of 10 stamps"' },
			],
		},
		{
			id: "you-checkout",
			who: "you",
			frame: "checkout",
			ask: ASK.you,
			start: 13.0,
			end: 20.0,
			writes: [
				{ at: 15.0, block: "apple", feature: "apple", note: "+ apple pay button" },
				{ at: 17.6, block: "tip", feature: "tip", note: "+ tip row" },
			],
		},
	],
	pointers: [
		{
			who: "ana",
			keys: [
				[0, -3150, 300],
				[4, -3020, 520],
				[8, -3260, 380],
				[12.5, -3120, 260],
				[15.5, 820, 600],
				[17.5, 700, 470],
				[20.5, 840, 640],
				[22.6, -3150, 300],
			],
		},
		{
			who: "ben",
			keys: [
				[0, 1900, 520],
				[3, 1820, 300],
				[7, 1960, 430],
				[11, 1790, 640],
				[15, 1890, 250],
				[19, 2020, 540],
				[24, 1900, 520],
			],
		},
		{
			who: "dev",
			keys: [
				[0, 180, 700],
				[5, 260, 360],
				[9, 120, 250],
				[14, 300, 520],
				[19, 90, 650],
				[24, 180, 700],
			],
		},
		{
			who: "cleo",
			keys: [
				[0, 3880, 400],
				[8, 3820, 600],
				[16, 3950, 300],
				[24, 3880, 400],
			],
		},
	],
	camera: fixed(-240, -250, 0.45),
	beats: [
		{ at: 1.0, label: "ana asks her claude for a pickup row on cart" },
		{ at: 2.8, label: "first write lands on cart, ana is 3,000px away" },
		{ at: 5.5, label: "ben's codex starts on receipt, ben is right beside it" },
		{ at: 13.0, label: "your claude starts on checkout" },
		{ at: 15.5, label: "ana comes over to look" },
		{ at: 20.5, label: "ana leaves again" },
	],
};

/* ---------- zoomed: thirty frames, five people, four agents ---------- */

const GRID: readonly (readonly [string, FrameDef["kind"]])[] = [
	["welcome", "plain"],
	["sign-in", "plain"],
	["menu", "menu"],
	["item", "plain"],
	["cart", "cart"],
	["checkout", "checkout"],
	["receipt", "plain"],
	["orders", "plain"],
	["rewards", "plain"],
	["help", "plain"],
	["search", "plain"],
	["map", "plain"],
	["account", "account"],
	["hours", "plain"],
	["favourites", "plain"],
	["gift-card", "plain"],
	["payment", "plain"],
	["receipt--ready", "receipt"],
	["settings", "plain"],
	["alerts", "plain"],
	["empty-cart", "plain"],
	["error", "plain"],
	["offline", "plain"],
	["promo", "plain"],
	["referral", "plain"],
	["invite", "plain"],
	["profile", "plain"],
	["address", "plain"],
	["receipts", "plain"],
	["about", "plain"],
];

const title = (name: string) => {
	const words = name.replace(/--.*/, "").replace(/-/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
};

const GRID_FRAMES: FrameDef[] = GRID.map(([name, kind], index) => ({
	name,
	x: (index % 10) * 520,
	y: Math.floor(index / 10) * 1500,
	kind,
	title: title(name),
	seed: index * 7 + 3,
}));

const gridAt = (name: string) => GRID_FRAMES.find((frame) => frame.name === name) ?? GRID_FRAMES[0];

const near = (name: string, dx: number, dy: number): [number, number] => {
	const frame = gridAt(name);
	return [(frame?.x ?? 0) + dx, (frame?.y ?? 0) + dy];
};

const wander = (name: string, period: number, phase: number): PointerPath["keys"] => {
	const keys: [number, number, number][] = [];
	for (let i = 0; i <= 4; i += 1) {
		const angle = phase + i * 1.7;
		const [x, y] = near(name, 195 + Math.cos(angle) * 230, 422 + Math.sin(angle * 1.3) * 320);
		keys.push([(i * period) / 4, x, y]);
	}
	return keys;
};

export const ZOOMED: Scene = {
	name: "zoomed",
	duration: 20,
	poster: 9.8,
	zoom: "15%",
	frames: GRID_FRAMES,
	turns: [
		{
			id: "ana-cart",
			who: "ana",
			frame: "cart",
			ask: ASK.ana,
			start: -3,
			end: 17,
			writes: [
				{ at: -1, block: "pickup", feature: "pickup", note: "+ pickup row" },
				{ at: 2.2, block: "pay", feature: "pay-total", note: 'pay → "Pay $9.00"' },
				{ at: 6.4, block: "items", feature: "sizes", note: "+ size on each item" },
				{ at: 11.2, block: "pickup", feature: "pickup-eta", note: 'pickup → "Ready in 6 min"' },
				{ at: 15.0, block: "note", feature: "note", note: "+ note field" },
			],
		},
		{
			id: "you-checkout",
			who: "you",
			frame: "checkout",
			ask: ASK.you,
			start: 3,
			end: 16,
			writes: [
				{ at: 5.0, block: "apple", feature: "apple", note: "+ apple pay button" },
				{ at: 9.0, block: "tip", feature: "tip", note: "+ tip row" },
				{ at: 13.0, block: "pickup", feature: "pickup", note: "+ pickup line" },
			],
		},
		{
			id: "ben-receipt",
			who: "ben",
			frame: "receipt--ready",
			ask: ASK.ben,
			start: -2,
			end: 18,
			writes: [
				{ at: 1.0, block: "code", feature: "code", note: "+ pickup code card" },
				{ at: 7.4, block: "eta", feature: "eta", note: "+ ready line" },
				{ at: 12.4, block: "code", feature: "code-big", note: "code → 72px" },
			],
		},
		{
			id: "cleo-account",
			who: "cleo",
			frame: "account",
			ask: ASK.cleo,
			start: 4,
			end: 17.5,
			writes: [
				{ at: 6.5, block: "rewards", feature: "rewards", note: "+ rewards card" },
				{ at: 10.2, block: "stamps", feature: "stamps", note: "+ stamp row" },
				{ at: 14.2, block: "rewards", feature: "stamps-count", note: 'card → "6 of 10 stamps"' },
			],
		},
		{
			id: "dev-menu",
			who: "dev",
			frame: "menu",
			ask: "Renamed a drink by hand.",
			start: 8.0,
			end: 8.6,
			hand: true,
			writes: [{ at: 8.2, block: "drinks", feature: "batch", note: 'filter coffee → "Batch brew"' }],
		},
	],
	pointers: [
		{ who: "ana", keys: wander("address", 20, 0.4) },
		{ who: "ben", keys: wander("receipt--ready", 20, 2.1) },
		{ who: "cleo", keys: wander("search", 20, 4.0) },
		{
			who: "dev",
			keys: [
				[0, ...near("sign-in", 300, 500)],
				[6, ...near("menu", 120, 380)],
				[10, ...near("menu", 260, 520)],
				[15, ...near("item", 200, 700)],
				[20, ...near("sign-in", 300, 500)],
			],
		},
	],
	camera: fixed(2535 - VIEW_W / 2 / 0.15, -980, 0.15),
	beats: [
		{ at: 1.0, label: "four agents running across thirty frames" },
		{ at: 5.0, label: "your claude writes on checkout" },
		{ at: 8.2, label: "dev renames a drink by hand" },
		{ at: 11.2, label: "ana's claude writes, ana is two rows away" },
	],
};

/* ---------- enter: you go into a frame an agent is writing, and a second agent arrives ---------- */

export const ENTER: Scene = {
	name: "enter",
	duration: 20,
	poster: 12.3,
	zoom: "62%",
	frames: [...ROW.slice(0, 2), { name: "checkout", x: 1900, y: 0, kind: "checkout" }],
	turns: [
		{
			id: "ana-cart",
			who: "ana",
			frame: "cart",
			ask: ASK.ana,
			start: -5,
			end: 8,
			writes: [
				{ at: -3, block: "pickup", feature: "pickup", note: "+ pickup row" },
				{ at: 1.2, block: "pay", feature: "pay-total", note: 'pay → "Pay $9.00"' },
				{ at: 3.8, block: "items", feature: "sizes", note: "+ size on each item" },
				{ at: 6.4, block: "pickup", feature: "pickup-eta", note: 'pickup → "Ready in about 6 minutes"' },
			],
		},
		{
			id: "ben-cart",
			who: "ben",
			frame: "cart",
			ask: ASK.benNote,
			start: 7.5,
			end: 17,
			writes: [
				{ at: 9.4, block: "note", feature: "note", note: "+ note for the barista" },
				{ at: 12.0, block: "pay", feature: "pay-pickup", note: 'pay → "Pay $9.00 and pick up"' },
				{ at: 14.6, block: "note", feature: "note-copy", note: 'placeholder → "Anything we should know?"' },
			],
		},
	],
	pointers: [
		{
			who: "ben",
			keys: [
				[0, 1500, 300],
				[6.5, 1300, 520],
				[8.2, 1000, 420],
				[12, 1020, 700],
				[16.5, 1330, 300],
				[20, 1500, 300],
			],
		},
		{ who: "ana", keys: [[0, -2600, 400], [20, -2600, 400]] },
	],
	you: {
		who: "you",
		keys: [
			[0, 230, 1000],
			[1.7, 760, 520],
			[2.4, 760, 520],
			[5, 820, 300],
			[9, 700, 640],
			[13, 820, 780],
			[16.5, 760, 420],
			[18.3, 980, 900],
			[20, 230, 1000],
		],
	},
	entered: { frame: "cart", from: 2.1, to: 18.4 },
	camera: fixed(-171, -113, 0.62),
	beats: [
		{ at: 0, label: "ana's claude is mid-turn on cart" },
		{ at: 2.1, label: "you enter cart" },
		{ at: 7.5, label: "ben's codex starts on the same frame" },
		{ at: 12.0, label: "ben's write lands on ana's pay button" },
		{ at: 18.4, label: "you leave" },
	],
};

/* ---------- follow: Ana, then Ana's agent ---------- */

const FOLLOW_FRAMES: readonly FrameDef[] = [
	...ROW,
	{ name: "account", x: 2240, y: 0, kind: "account" },
	{ name: "item", x: 0, y: 1200, kind: "plain", title: "Item", seed: 4 },
	{ name: "search", x: 560, y: 1200, kind: "plain", title: "Search", seed: 9 },
	{ name: "orders", x: 1120, y: 1200, kind: "plain", title: "Orders", seed: 12 },
	{ name: "help", x: 1680, y: 1200, kind: "plain", title: "Help", seed: 5 },
	{ name: "welcome", x: -560, y: 0, kind: "plain", title: "Welcome", seed: 3 },
];

const FOLLOW_TURNS: readonly Turn[] = [
	{
		id: "ana-cart",
		who: "ana",
		frame: "cart",
		ask: ASK.ana,
		start: -2,
		end: 13,
		writes: [
			{ at: 1.0, block: "pickup", feature: "pickup", note: "+ pickup row" },
			{ at: 4.0, block: "pay", feature: "pay-total", note: 'pay → "Pay $9.00"' },
			{ at: 7.0, block: "items", feature: "sizes", note: "+ size on each item" },
			{ at: 11.4, block: "pickup", feature: "pickup-eta", note: 'pickup → "Ready in about 6 minutes"' },
		],
	},
	{
		id: "ana-checkout",
		who: "ana",
		frame: "checkout",
		ask: ASK.anaOn,
		start: 13.2,
		end: 20.5,
		writes: [
			{ at: 14.8, block: "pickup", feature: "pickup", note: "+ pickup line" },
			{ at: 17.8, block: "apple", feature: "apple", note: "+ apple pay button" },
		],
	},
];

const ANA_FOLLOW: PointerPath = {
	who: "ana",
	keys: [
		[0, 200, 420],
		[3, 300, 660],
		[5.5, 1300, 300],
		[8, 1250, 620],
		[10.5, 1900, 400],
		[14, 1850, 660],
		[17, 2420, 320],
		[20, 2380, 620],
		[22, 200, 420],
	],
};

/** where the agent's work is: the block it last wrote, or the frame it is reading */
function workFocus(turns: readonly Turn[], frames: readonly FrameDef[]): [number, number, number][] {
	const steps: [number, number, number][] = [];
	for (const turn of turns) {
		const frame = frames.find((candidate) => candidate.name === turn.frame);
		if (frame === undefined) continue;
		steps.push([turn.start, frame.x + PHONE_W / 2, frame.y + PHONE_H / 2]);
		const on: Record<string, number> = {};
		for (const write of turn.writes) {
			if (write.feature !== undefined) on[write.feature] = 10;
			const block = blocksOf(frame.kind, on)[write.block];
			const y = block === undefined ? PHONE_H / 2 : block.y + block.h / 2;
			// lean toward the block without losing the frame or what is written under it
			steps.push([write.at - 0.5, frame.x + PHONE_W / 2 + 60, frame.y + PHONE_H / 2 + 90 + (y - PHONE_H / 2) * 0.12]);
		}
	}
	return steps.sort((a, b) => a[0] - b[0]);
}

const FOCUS = workFocus(FOLLOW_TURNS, FOLLOW_FRAMES);

/** 0 rides Ana, 1 rides her agent */
export function followMix(t: number): number {
	if (t < 10) return 0;
	if (t < 20.6) return easeInOut((t - 10) / 1.2);
	return 1 - easeInOut((t - 20.6) / 1.2);
}

export const FOLLOW: Scene = {
	name: "follow",
	duration: 22,
	poster: 15.6,
	zoom: "50%",
	frames: FOLLOW_FRAMES,
	turns: FOLLOW_TURNS,
	pointers: [
		ANA_FOLLOW,
		{
			who: "dev",
			keys: [
				[0, 700, 1500],
				[8, 900, 1700],
				[16, 1300, 1450],
				[22, 700, 1500],
			],
		},
	],
	follow: [
		{ from: 0, to: 10, target: "ana", agent: false },
		{ from: 10, to: 20.6, target: "ana", agent: true },
		{ from: 20.6, to: 22, target: "ana", agent: false },
	],
	camera: (t) => {
		const person = pathAt(ANA_FOLLOW.keys, t - 0.35);
		const work = steppedAt(FOCUS, t, 0.9);
		const w = followMix(t);
		const k = lerp(0.5, 0.58, w);
		return centred(lerp(person.x, work.x, w), lerp(person.y, work.y, w), k);
	},
	beats: [
		{ at: 0, label: "following ana" },
		{ at: 10, label: "following ana's claude instead" },
		{ at: 13.2, label: "her claude moves on to checkout" },
		{ at: 20.6, label: "back to following ana" },
	],
};

/* ---------- away: back after forty minutes ---------- */

export const AWAY: Scene = {
	name: "away",
	duration: 20,
	poster: 4.6,
	zoom: "45%",
	frames: [...ROW, { name: "account", x: 3700, y: 0, kind: "account" }],
	turns: [
		{ ...anaCart(0, 2, 9), writes: anaCart(0, 2, 9).writes.map((write, index) => ({ ...write, at: 3 + index * 1.6 })) },
		{
			id: "ben-receipt",
			who: "ben",
			frame: "receipt",
			ask: ASK.ben,
			start: 14,
			end: 19,
			writes: [
				{ at: 15, block: "code", feature: "code", note: "+ pickup code card" },
				{ at: 16.5, block: "eta", feature: "eta", note: "+ ready line" },
				{ at: 18, block: "code", feature: "code-big", note: "code → 72px" },
			],
		},
		{
			id: "dev-menu",
			who: "dev",
			frame: "menu",
			ask: "Renamed a drink by hand.",
			start: 21,
			end: 21.4,
			hand: true,
			writes: [{ at: 21.1, block: "drinks", feature: "batch", note: 'filter coffee → "Batch brew"' }],
		},
		{
			id: "cleo-account",
			who: "cleo",
			frame: "account",
			ask: ASK.cleo,
			start: 22,
			end: 28,
			writes: [
				{ at: 23, block: "rewards", feature: "rewards", note: "+ rewards card" },
				{ at: 25, block: "stamps", feature: "stamps", note: "+ stamp row" },
				{ at: 27, block: "rewards", feature: "stamps-count", note: 'card → "6 of 10 stamps"' },
			],
		},
	],
	pointers: [
		{
			who: "ben",
			keys: [
				[0, 1900, 520],
				[7, 1800, 300],
				[14, 1960, 620],
				[20, 1900, 520],
			],
		},
		{
			who: "dev",
			keys: [
				[0, 180, 700],
				[10, 280, 380],
				[20, 180, 700],
			],
		},
	],
	you: {
		who: "you",
		keys: [
			[0, 1000, 1150],
			[2.6, 1000, 1150],
			[3.4, 760, 560],
			[6.6, 790, 600],
			[7.4, 1880, 560],
			[10.6, 1900, 600],
			[11.4, 200, 520],
			[13.6, 220, 560],
			[15.2, 2210, 520],
			[17.6, 2230, 560],
			[20, 1000, 1150],
		],
	},
	away: { left: "13:10", back: "13:52", story: 30 },
	camera: fixed(-240, -250, 0.45),
	beats: [
		{ at: 0, label: "you come back after 42 minutes" },
		{ at: 3.4, label: "you look at cart" },
		{ at: 7.4, label: "then receipt" },
		{ at: 11.4, label: "then menu, where dev changed a word" },
		{ at: 15.2, label: "account is off screen" },
	],
};

/** story minutes, printed as the clock would */
export function clockAt(scene: Scene, story: number): string {
	const away = scene.away;
	if (away === undefined) return "";
	const [h, m] = away.left.split(":").map(Number);
	const [bh, bm] = away.back.split(":").map(Number);
	const span = (bh ?? 0) * 60 + (bm ?? 0) - ((h ?? 0) * 60 + (m ?? 0));
	const total = (h ?? 0) * 60 + (m ?? 0) + Math.round(clamp(story / away.story) * span);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const SCENES = { base: BASE, zoomed: ZOOMED, enter: ENTER, follow: FOLLOW, away: AWAY } as const;
export type SceneName = keyof typeof SCENES;

/* ---------- what you look at, coming back ---------- */

export interface Look {
	readonly frame: string;
	readonly from: number;
	readonly done: number;
}

/** when your pointer rests on each changed frame in the away scene, and when you have seen it */
export const AWAY_LOOKS: readonly Look[] = [
	{ frame: "cart", from: 3.4, done: 6.6 },
	{ frame: "receipt", from: 7.4, done: 10.6 },
	{ frame: "menu", from: 11.4, done: 13.6 },
	{ frame: "account", from: 15.6, done: 99 },
];

