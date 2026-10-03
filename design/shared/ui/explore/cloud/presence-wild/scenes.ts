import {
	type Aim,
	agent,
	BASE,
	clamp,
	ease,
	type Follow,
	type Key,
	mixView,
	on,
	type Scene,
	spot,
	turn,
	type View,
	views,
	WHOLE,
} from "shared/ui/explore/cloud/presence-wild/world";

/**
 * Six stories, one per hard case, each told once and drawn three ways. A take never
 * gets its own version of events: if it reads better, it is because of how it draws,
 * not because its script was kinder.
 */

const screen = (x: number, y: number): Aim => ({ kind: "screen", x, y });
const toPerson = (id: "ana" | "jonas" | "mira" | "sam"): Aim => ({ kind: "person", id });
const toAgent = (id: "you" | "ana" | "jonas" | "mira"): Aim => ({ kind: "agent", id });
const inFrame = (name: string, fx: number, fy: number): Aim => ({ kind: "frame", name, fx, fy });
const control = (name: string): Aim => ({ kind: "control", name });

/** every scene opens with a minute or so of history, which only the score has room to show */
const before = {
	you: turn("menu--closed", [["write", -72, -44]], {}, 3),
	ana: turn("cart", [["read", -66, -60], ["write", -60, -31]], {}, 1),
	jonas: turn("checkout--card", [["write", -54, -20]], {}, 2),
	mira: turn("item", [["read", -80, -74], ["write", -74, -46]], {}, 4),
};

export const crowd: Scene = {
	id: "crowd",
	duration: 16,
	poster: 6.2,
	beats: [
		{ at: 0, say: "Five people and four agents on one page." },
		{ at: 4.2, say: "Jonas's codex starts writing checkout--error." },
		{ at: 9, say: "Mira's claude moves on to receipt." },
		{ at: 10.5, say: "Sam wanders up to receipt--refund." },
	],
	camera: () => BASE,
	people: [
		{
			id: "ana",
			pointer: [
				[-90, spot("item", 0.5, 0.4)],
				[-40, spot("cart", 0.4, 0.3)],
				[0, spot("cart", 0.45, 0.35)],
				[5, spot("cart", 0.55, 0.6)],
				[7.5, spot("cart--promo", 0.4, 0.5)],
				[16, spot("cart--promo", 0.5, 0.42)],
			],
		},
		{
			id: "jonas",
			pointer: [
				[-90, spot("checkout", 0.5, 0.5)],
				[0, spot("checkout--card", 0.5, 0.4)],
				[4, spot("checkout--card", 0.6, 0.7)],
				[5.6, spot("checkout--error", 0.4, 0.5)],
				[16, spot("checkout--error", 0.5, 0.6)],
			],
		},
		{
			id: "mira",
			pointer: [
				[-90, spot("menu--search", 0.5, 0.5)],
				[0, spot("item", 0.5, 0.5)],
				[3, spot("item", 0.4, 0.3)],
				[4.5, spot("item--milk", 0.5, 0.4)],
				[16, spot("item--milk", 0.6, 0.6)],
			],
		},
		{
			id: "sam",
			pointer: [
				[-90, null],
				[-30, spot("stores", 0.5, 0.2)],
				[0, spot("stores", 0.5, 0.15)],
				[6, spot("stores", 0.6, 0.1)],
				[9.5, spot("receipt--refund", 0.5, 0.6)],
				[16, spot("receipt--refund", 0.4, 0.5)],
			],
		},
	],
	agents: [
		agent("you", before.you, turn("menu", [["read", -6, 1.5], ["write", 1.5, 9], ["shot", 9, 10.2], ["read", 10.2, 12.5]], {}, 0)),
		agent("ana", before.ana, turn("cart--promo", [["read", -3, 0.8], ["write", 0.8, 13.5]], {}, 1)),
		agent("jonas", before.jonas, turn("checkout--error", [["read", 1, 4.2], ["write", 4.2, 12.4], ["shot", 12.4, 13.4]], {}, 2)),
		agent(
			"mira",
			before.mira,
			turn("item--milk", [["shot", -0.5, 1.4], ["write", 1.4, 8.2]], {}, 3),
			turn("receipt", [["read", 9, 11], ["write", 11, 15.5]], {}, 5),
		),
	],
};

const FAR: View = { cx: 1050, cy: 640, k: 0.5 };

export const far: Scene = {
	id: "far",
	duration: 18,
	poster: 8,
	beats: [
		{ at: 0, say: "Ana is on menu--search. Her claude is writing receipt--refund, off screen." },
		{ at: 4, say: "Jonas and his codex are both off screen, far below." },
		{ at: 9.5, say: "You go to where Ana's claude is." },
		{ at: 13.2, say: "Now Ana is the one off screen." },
	],
	camera: views([
		[0, FAR],
		[11.7, FAR],
		[13.4, on("receipt--refund", 0.5)],
		[16, on("receipt--refund", 0.5)],
		[17.7, FAR],
	]),
	people: [
		{
			id: "ana",
			pointer: [
				[-90, spot("menu", 0.5, 0.5)],
				[-20, spot("menu--search", 0.5, 0.3)],
				[0, spot("menu--search", 0.45, 0.3)],
				[6, spot("menu--search", 0.6, 0.55)],
				[12, spot("menu--search", 0.4, 0.7)],
				[18, spot("menu--search", 0.45, 0.3)],
			],
		},
		{
			id: "jonas",
			pointer: [
				[-90, spot("onboarding", 0.5, 0.5)],
				[0, spot("onboarding--push", 0.5, 0.4)],
				[9, spot("onboarding--push", 0.6, 0.6)],
				[18, spot("onboarding--push", 0.5, 0.4)],
			],
		},
		{
			id: "mira",
			pointer: [
				[-90, spot("item", 0.3, 0.3)],
				[0, spot("item", 0.55, 0.45)],
				[8, spot("item", 0.4, 0.2)],
				[18, spot("item", 0.55, 0.45)],
			],
		},
		{
			id: "sam",
			pointer: [
				[-90, null],
				[-10, spot("menu", 0.5, 0.6)],
				[6, spot("menu", 0.4, 0.3)],
				[8, spot("menu--closed", 0.5, 0.5)],
				[18, spot("menu--closed", 0.45, 0.4)],
			],
		},
	],
	agents: [
		agent("you", before.you),
		agent("ana", before.ana, turn("receipt--refund", [["read", -2, 3], ["write", 3, 12], ["shot", 12, 13.2], ["write", 13.2, 17.4]], {}, 1)),
		agent("jonas", before.jonas, turn("settings--privacy", [["write", -4, 10], ["read", 10, 12], ["write", 12, 17.5]], {}, 2)),
		agent("mira", before.mira, turn("item", [["write", -1, 7], ["shot", 7, 8], ["write", 8.5, 16]], {}, 3)),
	],
	cursor: [
		[9.4, null],
		[9.5, screen(560, 520)],
		[10.9, toAgent("ana")],
		[11.6, toAgent("ana")],
		[11.7, null],
	],
	clicks: [11.35],
};

export const zoomed: Scene = {
	id: "zoomed",
	duration: 18,
	poster: 9.8,
	beats: [
		{ at: 0, say: "The page at working zoom." },
		{ at: 1.2, say: "Zoomed out to all 32 frames." },
		{ at: 8.5, say: "Pointing at Jonas's codex finds it among the thumbnails." },
		{ at: 11.8, say: "Then Ana, nowhere near her agent." },
	],
	camera: views([
		[0, BASE],
		[1.2, BASE],
		[3.6, WHOLE],
		[15.2, WHOLE],
		[17.4, BASE],
	]),
	people: [
		{
			id: "ana",
			pointer: [
				[-90, spot("onboarding", 0.5, 0.5)],
				[0, spot("onboarding--location", 0.5, 0.4)],
				[7, spot("onboarding--location", 0.6, 0.7)],
				[10, spot("onboarding--push", 0.4, 0.4)],
				[18, spot("onboarding--push", 0.5, 0.5)],
			],
		},
		{
			id: "jonas",
			pointer: [
				[-90, spot("stores", 0.5, 0.5)],
				[0, spot("stores", 0.6, 0.4)],
				[18, spot("stores", 0.5, 0.6)],
			],
		},
		{
			id: "mira",
			pointer: [
				[-90, spot("help", 0.5, 0.5)],
				[0, spot("help--chat", 0.5, 0.5)],
				[18, spot("help--chat", 0.4, 0.3)],
			],
		},
		{
			id: "sam",
			pointer: [
				[-90, spot("gift", 0.5, 0.5)],
				[0, spot("gift", 0.5, 0.5)],
				[8, spot("gift--sent", 0.5, 0.4)],
				[18, spot("gift--sent", 0.5, 0.5)],
			],
		},
	],
	agents: [
		agent("you", before.you, turn("menu", [["write", -2, 14]], {}, 0)),
		agent("ana", before.ana, turn("receipt--refund", [["read", -2, 1], ["write", 1, 16]], {}, 1)),
		agent("jonas", before.jonas, turn("stores--map", [["write", -3, 9], ["shot", 9, 10], ["write", 10, 17]], {}, 2)),
		agent("mira", before.mira, turn("cart", [["read", -1, 2.5], ["write", 2.5, 15]], {}, 3)),
	],
	cursor: [
		[8.3, null],
		[8.4, screen(574, 560)],
		[9.6, toAgent("jonas")],
		[11.2, toAgent("jonas")],
		[12.2, toPerson("ana")],
		[14.2, toPerson("ana")],
		[14.3, null],
	],
};

export const collide: Scene = {
	id: "collide",
	duration: 18,
	poster: 10.2,
	beats: [
		{ at: 0, say: "Jonas's codex is writing cart." },
		{ at: 2.6, say: "Mira's claude starts on the same frame." },
		{ at: 5.6, say: "You open cart while both are mid-write." },
		{ at: 9.5, say: "Ana comes in too." },
		{ at: 15.2, say: "You leave. Both agents carry on." },
	],
	camera: views([
		[0, BASE],
		[6.4, BASE],
		[7.8, on("cart", 0.9)],
		[15.2, on("cart", 0.9)],
		[16.8, BASE],
	]),
	people: [
		{
			id: "ana",
			pointer: [
				[-90, spot("checkout", 0.5, 0.5)],
				[0, spot("checkout", 0.5, 0.4)],
				[8, spot("checkout", 0.6, 0.3)],
				[9.6, spot("cart", 0.3, 0.62)],
				[13, spot("cart", 0.62, 0.4)],
				[14.6, spot("cart--promo", 0.5, 0.5)],
				[18, spot("cart--promo", 0.5, 0.5)],
			],
		},
		{
			id: "jonas",
			pointer: [
				[-90, spot("cart--promo", 0.5, 0.5)],
				[0, spot("cart--promo", 0.4, 0.4)],
				[18, spot("cart--promo", 0.6, 0.6)],
			],
		},
		{
			id: "mira",
			pointer: [
				[-90, spot("item", 0.5, 0.5)],
				[0, spot("item--milk", 0.5, 0.5)],
				[18, spot("item--milk", 0.4, 0.4)],
			],
		},
		{
			id: "sam",
			pointer: [
				[-90, spot("menu", 0.5, 0.5)],
				[0, spot("menu", 0.5, 0.5)],
				[18, spot("menu--search", 0.5, 0.5)],
			],
		},
	],
	agents: [
		agent("you", before.you),
		agent("ana", before.ana),
		agent("jonas", before.jonas, turn("cart", [["read", -2, 0.5], ["write", 0.5, 13.5]], {}, 2)),
		agent("mira", before.mira, turn("cart", [["read", 2.6, 4.2], ["write", 4.2, 14.6]], {}, 7)),
	],
	cursor: [
		[3.8, null],
		[3.9, screen(640, 700)],
		[5.6, inFrame("cart", 0.5, 0.45)],
		[6.6, inFrame("cart", 0.5, 0.45)],
		[9, inFrame("cart", 0.38, 0.3)],
		[12, inFrame("cart", 0.66, 0.52)],
		[15, inFrame("cart", 0.66, 0.52)],
		[15.1, null],
	],
	clicks: [6, 6.18],
	entered: (t) => (t >= 6.5 && t < 15.2 ? "cart" : null),
};

const anaView = views([
	[-1, on("item", 0.55)],
	[3.2, on("item", 0.55)],
	[5.2, on("checkout", 0.7)],
	[18, on("checkout", 0.7)],
]);
const anaAgentView = (t: number): View => mixView(on("receipt", 0.62), on("orders", 0.62), ease(clamp((t - 9.7) / 1.3)));

function followed(t: number): Follow | null {
	if (t >= 1.7 && t < 8.1) return { who: "ana", agent: false };
	if (t >= 8.1 && t < 15.4) return { who: "ana", agent: true };
	return null;
}

export const follow: Scene = {
	id: "follow",
	duration: 18,
	poster: 5.6,
	beats: [
		{ at: 0, say: "Ana is looking at item." },
		{ at: 1.7, say: "You follow Ana. Your camera rides hers." },
		{ at: 3.2, say: "She moves to checkout and you go with her." },
		{ at: 8.1, say: "You switch to following her claude." },
		{ at: 9.7, say: "It moves on to orders, and the camera follows the work." },
		{ at: 15.4, say: "Esc stops following." },
	],
	camera: (t) => {
		if (t < 1.7) return BASE;
		if (t < 8.1) return mixView(BASE, anaView(t), ease(clamp((t - 1.7) / 1.1)));
		if (t < 15.4) return mixView(anaView(t), anaAgentView(t), ease(clamp((t - 8.1) / 1.3)));
		return mixView(anaAgentView(15.4), BASE, ease(clamp((t - 15.4) / 1.5)));
	},
	people: [
		{
			id: "ana",
			view: anaView,
			pointer: [
				[-90, spot("item", 0.5, 0.5)],
				[0, spot("item", 0.4, 0.4)],
				[2.5, spot("item", 0.6, 0.7)],
				[3.6, spot("item", 0.5, 0.5)],
				[5.4, spot("checkout", 0.5, 0.4)],
				[7, spot("checkout", 0.4, 0.6)],
				[12, spot("checkout", 0.55, 0.35)],
				[18, spot("checkout", 0.5, 0.5)],
			],
		},
		{
			id: "jonas",
			pointer: [
				[-90, spot("checkout--error", 0.5, 0.5)],
				[0, spot("checkout--error", 0.5, 0.5)],
				[18, spot("checkout--error", 0.4, 0.3)],
			],
		},
		{
			id: "mira",
			pointer: [
				[-90, spot("menu--search", 0.5, 0.5)],
				[0, spot("menu--search", 0.5, 0.5)],
				[18, spot("menu--search", 0.6, 0.6)],
			],
		},
		{
			id: "sam",
			pointer: [
				[-90, spot("loyalty", 0.5, 0.5)],
				[0, spot("loyalty", 0.5, 0.3)],
				[18, spot("loyalty", 0.5, 0.6)],
			],
		},
	],
	agents: [
		agent("you", before.you),
		agent("ana", before.ana, turn("receipt", [["write", -3, 9]], {}, 1), turn("orders", [["read", 9.7, 11], ["write", 11, 16.5]], {}, 4)),
		agent("jonas", before.jonas, turn("checkout--error", [["write", -1, 12]], {}, 2)),
		agent("mira", before.mira),
	],
	cursor: [
		[0.5, null],
		[0.6, screen(520, 640)],
		[1.5, toPerson("ana")],
		[1.8, toPerson("ana")],
		[2.6, screen(980, 760)],
		[7.1, screen(960, 740)],
		[7.8, toAgent("ana")],
		[8.2, toAgent("ana")],
		[9.2, screen(1000, 760)],
		[15.6, screen(1000, 760)],
		[15.7, null],
	],
	clicks: [1.65, 7.95],
	follow: followed,
};

export const away: Scene = {
	id: "away",
	duration: 18,
	poster: 4.2,
	beats: [
		{ at: 0, say: "You come back after 47 minutes." },
		{ at: 1.2, say: "What changed shows up where it changed." },
		{ at: 5, say: "You ask to catch up." },
	],
	camera: () => BASE,
	people: [
		{
			id: "ana",
			pointer: [
				[-90, spot("checkout", 0.5, 0.5)],
				[0, spot("checkout--swish", 0.5, 0.4)],
				[18, spot("checkout--swish", 0.4, 0.6)],
			],
		},
		{
			id: "jonas",
			pointer: [
				[-90, spot("cart", 0.5, 0.5)],
				[0, spot("cart", 0.5, 0.5)],
				[9, spot("cart--promo", 0.5, 0.4)],
				[18, spot("cart--promo", 0.5, 0.5)],
			],
		},
		{ id: "mira", pointer: [[-90, spot("receipt--refund", 0.5, 0.5)], [-60, null]] },
		{
			id: "sam",
			pointer: [
				[-90, spot("menu", 0.5, 0.5)],
				[0, spot("menu", 0.4, 0.5)],
				[18, spot("menu", 0.5, 0.4)],
			],
		},
	],
	agents: [
		agent("you"),
		agent("ana", turn("checkout--swish", [["write", -20, 18]], {}, 1)),
		agent("jonas", turn("onboarding--push", [["write", -40, -12]], {}, 2)),
		agent("mira", turn("stores--map", [["write", -88, -62]], {}, 3)),
	],
	cursor: [
		[3.4, null],
		[3.5, screen(620, 560)],
		[4.6, control("catch-up")],
		[5.2, control("catch-up")],
		[5.3, null],
	],
	clicks: [5],
	away: {
		minutes: 47,
		changes: [
			{ frame: "checkout--swish", owner: "ana", writes: 22, fresh: true, at: 0.12 },
			{ frame: "cart", owner: "jonas", writes: 9, fresh: false, at: 0.34 },
			{ frame: "cart--promo", owner: "jonas", writes: 4, fresh: false, at: 0.43 },
			{ frame: "receipt--refund", owner: "mira", writes: 14, fresh: false, at: 0.6 },
			{ frame: "stores--map", owner: "mira", writes: 11, fresh: true, at: 0.78 },
			{ frame: "onboarding--push", owner: "jonas", writes: 6, fresh: false, at: 0.92 },
		],
	},
};

export const SCENES = { crowd, far, zoomed, collide, follow, away } as const;
export type SceneName = keyof typeof SCENES;
