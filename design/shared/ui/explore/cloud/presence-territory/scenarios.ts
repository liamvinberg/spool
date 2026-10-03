import type { CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { blockRect, type FrameSpec, type Key, PRICE_ROW, type Scenario, type Span, type V } from "./world";

/**
 * The six moments every take is drawn against. Each is one loop on one clock,
 * and the camera, the pointers and the agents' turns are all keyed to it, so a
 * recording of a frame plays the same scene every time.
 *
 * The scripts are shared. Where a take's rule changes what an agent does (wait
 * at the block, build next door, write through and read again), the scenario
 * asks which take it is drawing and changes only your own agent's turn.
 */

export type TakeId = "edge" | "ground" | "reach";
export type StateId = "enter" | "far" | "ripple" | "zoomed" | "follow" | "away";

const COL = 510;
const ROW = 1000;

function frame(id: string, x: number, y: number, screen: CoffeeScreenName, bornAt?: number): FrameSpec {
	return { id, x, y, screen, uses: screen === "receipt" ? [] : [PRICE_ROW], bornAt };
}

/** the order flow, with an open slot of floor right of cart */
const BOARD: readonly FrameSpec[] = [
	frame("menu", 0, 0, "menu"),
	frame("cart", COL, 0, "cart"),
	frame("receipt", COL * 3, 0, "receipt"),
	frame("menu--empty", COL * 4, 0, "menu"),
	frame("checkout", 0, ROW, "cart"),
	frame("cart--promo", COL, ROW, "cart"),
	frame("receipt--email", COL * 3, ROW, "receipt"),
	frame("account", COL * 4, ROW, "menu"),
];

/** a second page's frames, laid far right of the board */
const ONBOARDING: readonly FrameSpec[] = [
	frame("onboarding-1", 4600, 0, "menu"),
	frame("onboarding-2", 4600 + COL, 0, "cart"),
	frame("onboarding-3", 4600 + COL * 2, 0, "receipt"),
];

const BOARD_CAM = { x: 1215, y: 935, z: 0.4 } as const;

const PAGES_BOARD = [
	{ name: "order", frames: BOARD.map((f) => f.id) },
	{ name: "onboarding", frames: ONBOARDING.map((f) => f.id) },
];

/** a point inside a frame's block, nudged so a pointer sits on it rather than at its corner */
function on(frames: readonly FrameSpec[], id: string, block: number, dx = 0, dy = 0): V {
	const f = frames.find((candidate) => candidate.id === id);
	if (f === undefined) return { x: 0, y: 0 };
	const r = blockRect(f, block);
	return { x: r.x + r.w * 0.42 + dx, y: r.y + r.h * 0.55 + dy };
}

function p(x: number, y: number): V {
	return { x, y };
}

/* ---------- enter: walking into a frame an agent is mid-write on ---------- */

function enter(take: TakeId): Scenario {
	const fork = frame("cart--total", COL * 2, 0, "cart", 9.6);
	const frames = take === "ground" ? [...BOARD, ...ONBOARDING, fork] : [...BOARD, ...ONBOARDING];
	const mine: Span[] =
		take === "edge"
			? [
					{ actor: "you:agent", from: 8.4, to: 9.3, frame: "cart", mode: "read" },
					{ actor: "you:agent", from: 9.3, to: 11.55, frame: "cart", mode: "wait", blocks: [3] },
					{ actor: "you:agent", from: 11.6, to: 13.6, frame: "cart", mode: "write", blocks: [3, 3] },
					{ actor: "you:agent", from: 13.6, to: 14.3, frame: "cart", mode: "shot" },
				]
			: take === "ground"
				? [
						{ actor: "you:agent", from: 8.4, to: 9.3, frame: "cart", mode: "read" },
						{ actor: "you:agent", from: 9.6, to: 13.5, frame: "cart--total", mode: "write", blocks: [3, 3, 4] },
						{ actor: "you:agent", from: 13.5, to: 14.2, frame: "cart--total", mode: "shot" },
					]
				: [
						{ actor: "you:agent", from: 8.4, to: 9.3, frame: "cart", mode: "read" },
						{ actor: "you:agent", from: 9.3, to: 10.3, frame: "cart", mode: "write", blocks: [3] },
						{ actor: "you:agent", from: 10.3, to: 10.95, frame: "cart", mode: "read" },
						{ actor: "you:agent", from: 10.95, to: 13.0, frame: "cart", mode: "write", blocks: [3, 3] },
						{ actor: "you:agent", from: 13.0, to: 13.6, frame: "cart", mode: "shot" },
					];
	const turn: Key<string> =
		take === "edge"
			? [9.3, "Ana's agent has the total, so yours waits beside that block."]
			: take === "ground"
				? [9.3, "cart is Ana's ground, so yours builds cart--total next door."]
				: [9.3, "Both agents write the total. Yours reads the file again before its next write."];
	const after: Key<string> =
		take === "edge"
			? [11.6, "Ana's agent lets go of the total, and yours takes it."]
			: take === "ground"
				? [11.6, "Ana's agent leaves cart. The two totals sit side by side to compare."]
				: [11.6, "Ana's agent finishes. Yours wrote on top of her newest file, not an old copy."];
	return {
		id: "enter",
		duration: 16,
		poster: 4.7,
		frames,
		camera: [
			[0, BOARD_CAM],
			[1.2, BOARD_CAM],
			[3.2, { x: 960, y: 430, z: 0.86 }],
			[14.6, { x: 960, y: 430, z: 0.86 }],
			[16, BOARD_CAM],
		],
		people: [
			{ actor: "ana", keys: [[0, p(2200, 1300)], [4, p(2260, 1450)], [8, p(2150, 1250)], [12, p(2230, 1400)], [16, p(2200, 1300)]] },
			{ actor: "jonas", keys: [[0, p(1700, 330)], [5, p(1780, 240)], [10, p(1690, 420)], [16, p(1700, 330)]] },
		],
		you: [
			[0, p(1300, 1500)],
			[1.2, p(1215, 1100)],
			[3.2, p(1080, 560)],
			[4.6, on(BOARD, "cart", 2, 30)],
			[5.6, on(BOARD, "cart", 2, 60, 4)],
			[6.6, on(BOARD, "cart", 2, 20, -2)],
			[7.2, on(BOARD, "cart", 4)],
			[10.4, on(BOARD, "cart", 4, 10)],
			[11.6, p(1180, 560)],
			[14.6, p(1160, 600)],
			[16, p(1300, 1500)],
		],
		selection: [
			[0, null],
			[7.35, { frame: "cart", block: 4 }],
			[10.5, null],
		],
		spans: [
			{ actor: "ana:agent", from: 0, to: 1.5, frame: "cart", mode: "read" },
			{ actor: "ana:agent", from: 1.5, to: 11.5, frame: "cart", mode: "write", blocks: [1, 1, 2, 2, 3, 3] },
			{ actor: "ana:agent", from: 11.5, to: 12.2, frame: "cart", mode: "shot" },
			{ actor: "jonas:agent", from: 2, to: 14, frame: "receipt--email", mode: "write", blocks: [1, 2, 1] },
			...mine,
		],
		beats: [
			[0, "Ana's agent is working on cart. Ana herself is down on account."],
			[3.2, "You open cart while it writes."],
			[4.8, "You point at the row it is writing right now."],
			[7.3, "You edit the button instead. Nobody waits for anybody."],
			[8.4, "You ask your own agent to fix the total."],
			turn,
			after,
			[14.6, "Back out to the whole board."],
		],
		pages: PAGES_BOARD,
	};
}

/* ---------- far: a person and their agent a long way apart ---------- */

function far(): Scenario {
	return {
		id: "far",
		duration: 14,
		poster: 4.2,
		frames: [...BOARD, ...ONBOARDING],
		camera: [[0, { x: 1000, y: 922, z: 0.44 }]],
		people: [
			{ actor: "ana", keys: [[0, p(250, 500)], [3, p(330, 240)], [6, p(180, 1250)], [9, p(340, 1480)], [12, p(600, 600)], [14, p(250, 500)]] },
			{ actor: "jonas", keys: [[0, p(4750, 300)], [7, p(4820, 520)], [14, p(4750, 300)]] },
			{ actor: "mira", keys: [[0, p(720, 1400)], [4, p(650, 1250)], [8, p(760, 1520)], [14, p(720, 1400)]] },
		],
		you: [[0, p(1100, 1520)], [7, p(1160, 1460)], [14, p(1100, 1520)]],
		spans: [
			{ actor: "ana:agent", from: 0, to: 14, frame: "onboarding-2", mode: "write", blocks: [1, 2, 3, 4, 1, 2] },
			{ actor: "jonas:agent", from: 0.4, to: 2, frame: "receipt", mode: "read" },
			{ actor: "jonas:agent", from: 2, to: 12, frame: "receipt", mode: "write", blocks: [1, 2, 1, 2] },
			{ actor: "jonas:agent", from: 12, to: 12.8, frame: "receipt", mode: "shot" },
			{ actor: "mira:agent", from: 3, to: 5, frame: "checkout", mode: "read" },
			{ actor: "mira:agent", from: 5, to: 11, frame: "checkout", mode: "write", blocks: [1, 2, 3] },
		],
		beats: [
			[0, "Ana is on menu. Her agent is writing onboarding-2, about 3,000px to the right."],
			[4.5, "Jonas went to onboarding too, while his agent writes receipt here."],
			[8.5, "Mira and her agent are both in view, so nothing has to point anywhere."],
		],
		pages: PAGES_BOARD,
	};
}

/* ---------- ripple: a shared component changes under other people ---------- */

function ripple(): Scenario {
	return {
		id: "ripple",
		duration: 15,
		poster: 6.2,
		frames: [...BOARD, ...ONBOARDING],
		camera: [[0, BOARD_CAM]],
		people: [
			{ actor: "theo", keys: [[0, p(210, 1150)], [5, p(250, 1125)], [10, p(180, 1170)], [15, p(210, 1150)]] },
			{ actor: "mira", keys: [[0, p(-1300, 500)]] },
		],
		you: [[0, p(700, 150)], [4, p(760, 112)], [8, p(690, 172)], [12, p(740, 128)], [15, p(700, 150)]],
		spans: [
			{ actor: "mira:agent", from: 0.5, to: 2.2, frame: "menu", mode: "read" },
			{ actor: "mira:agent", from: 2.5, to: 10, frame: "menu", mode: "write", blocks: [1, 1, 1], file: PRICE_ROW },
			{ actor: "mira:agent", from: 10, to: 10.8, frame: "menu", mode: "shot" },
			{ actor: "theo", from: 4.5, to: 8.5, frame: "checkout", mode: "write", blocks: [1, 1] },
			{ actor: "jonas:agent", from: 1, to: 13, frame: "receipt--email", mode: "write", blocks: [1, 2] },
		],
		beats: [
			[0, "You are reading cart. Theo is on checkout."],
			[2.5, "Mira's agent starts on price-row.tsx. Eight frames render it, two of them off screen."],
			[4.5, "Theo edits a price row on checkout that the component is changing too."],
			[10, "The component lands everywhere it is used."],
		],
		pages: PAGES_BOARD,
	};
}

/* ---------- zoomed: the whole project, everyone at once ---------- */

const GRID_NAMES = [
	"menu", "cart", "receipt", "menu--empty", "cart--promo", "receipt--email", "account", "account--edit",
	"checkout", "checkout--card", "order-placed", "search", "search--empty", "order-detail", "loyalty", "loyalty--gold",
	"onboarding-1", "onboarding-2", "onboarding-3", "store", "store--closed", "orders", "orders--empty", "settings",
] as const;

const SCREENS: readonly CoffeeScreenName[] = ["menu", "cart", "receipt"];

function zoomed(take: TakeId): Scenario {
	const grid = GRID_NAMES.map((id, i) => frame(id, (i % 8) * COL, Math.floor(i / 8) * ROW, SCREENS[i % 3] ?? "menu"));
	const fork = frame("checkout--tip", 8 * COL, ROW, "cart", 8.5);
	const mine: Span[] =
		take === "edge"
			? [
					{ actor: "you:agent", from: 7.2, to: 8.2, frame: "checkout", mode: "read" },
					{ actor: "you:agent", from: 8.2, to: 12, frame: "checkout", mode: "wait", blocks: [2] },
					{ actor: "you:agent", from: 12, to: 15, frame: "checkout", mode: "write", blocks: [2, 3] },
				]
			: take === "ground"
				? [
						{ actor: "you:agent", from: 7.2, to: 8.2, frame: "checkout", mode: "read" },
						{ actor: "you:agent", from: 8.6, to: 15, frame: "checkout--tip", mode: "write", blocks: [2, 3] },
					]
				: [
						{ actor: "you:agent", from: 7.2, to: 8.2, frame: "checkout", mode: "read" },
						{ actor: "you:agent", from: 8.2, to: 15, frame: "checkout", mode: "write", blocks: [2, 3] },
					];
	return {
		id: "zoomed",
		duration: 16,
		poster: 11.6,
		frames: take === "ground" ? [...grid, fork] : grid,
		camera: [[0, { x: 2000, y: 1500, z: 0.2 }]],
		people: [
			{ actor: "ana", keys: [[0, p(800, 300)], [5, p(2100, 900)], [9, p(3200, 1300)], [13, p(2400, 700)], [16, p(800, 300)]] },
			{ actor: "jonas", keys: [[0, p(3600, 2300)], [6, p(400, 1400)], [12, p(600, 1300)], [16, p(3600, 2300)]] },
			{ actor: "mira", keys: [[0, p(1600, 1300)], [8, p(1900, 2450)], [16, p(1600, 1300)]] },
			{ actor: "theo", keys: [[0, p(2600, 2500)], [8, p(3700, 400)], [16, p(2600, 2500)]] },
		],
		you: [[0, p(1000, 2000)], [8, p(2200, 1750)], [16, p(1000, 2000)]],
		spans: [
			{ actor: "ana:agent", from: 0, to: 6, frame: "cart", mode: "write", blocks: [1, 2, 3] },
			{ actor: "ana:agent", from: 6.4, to: 7.4, frame: "loyalty", mode: "read" },
			{ actor: "ana:agent", from: 7.4, to: 16, frame: "loyalty", mode: "write", blocks: [1, 2, 3] },
			{ actor: "jonas:agent", from: 0, to: 5, frame: "orders", mode: "write", blocks: [1, 2] },
			{ actor: "jonas:agent", from: 5.4, to: 12, frame: "checkout", mode: "write", blocks: [2, 3, 2] },
			{ actor: "jonas:agent", from: 12, to: 13, frame: "checkout", mode: "shot" },
			{ actor: "mira:agent", from: 0, to: 3, frame: "search", mode: "read" },
			{ actor: "mira:agent", from: 3, to: 10, frame: "search", mode: "write", blocks: [1, 2] },
			{ actor: "mira:agent", from: 10.5, to: 14.5, frame: "menu", mode: "write", blocks: [1, 1], file: PRICE_ROW },
			{ actor: "you:agent", from: 0, to: 7, frame: "onboarding-2", mode: "write", blocks: [1, 2, 3] },
			...mine,
		],
		beats: [
			[0, "Twenty-four frames, five people and four agents."],
			[6.4, "Ana's agent moves on to loyalty."],
			[8.2, "Your agent and Jonas's both reach checkout."],
			[10.5, "Mira's agent changes the price row, and it shows across the board."],
		],
		pages: [
			{ name: "order", frames: GRID_NAMES.slice(0, 16) },
			{ name: "onboarding", frames: GRID_NAMES.slice(16) },
		],
	};
}

/* ---------- follow: a person, then that person's agent ---------- */

function follow(): Scenario {
	return {
		id: "follow",
		duration: 16,
		poster: 9.2,
		frames: [...BOARD, ...ONBOARDING],
		camera: [
			[0, { x: 400, y: 422, z: 0.7 }],
			[1.2, { x: 400, y: 422, z: 0.7 }],
			[3.6, { x: 705, y: 1300, z: 0.7 }],
			[7.4, { x: 705, y: 1300, z: 0.7 }],
			[8.3, { x: 1725, y: 422, z: 0.82 }],
			[10.5, { x: 1725, y: 422, z: 0.82 }],
			[11.0, { x: 3260, y: 422, z: 0.3 }],
			[11.6, { x: 4795, y: 422, z: 0.82 }],
			[14.0, { x: 4795, y: 422, z: 0.82 }],
			[14.5, { x: 2750, y: 422, z: 0.3 }],
			[15.1, { x: 705, y: 422, z: 0.82 }],
			[15.5, { x: 705, y: 422, z: 0.82 }],
			[16, { x: 400, y: 422, z: 0.7 }],
		],
		people: [
			{
				actor: "ana",
				keys: [[0, p(250, 300)], [1.5, p(300, 180)], [3.6, p(700, 1250)], [5.5, p(640, 1120)], [7, p(760, 1180)], [15.4, p(700, 1220)], [16, p(250, 300)]],
			},
		],
		you: [[0, null]],
		follow: [
			[0, "ana"],
			[7.4, "ana:agent"],
			[15.4, null],
		],
		spans: [
			{ actor: "ana:agent", from: 0, to: 10.5, frame: "receipt", mode: "write", blocks: [1, 2, 1] },
			{ actor: "ana:agent", from: 10.6, to: 11.4, frame: "onboarding-1", mode: "read" },
			{ actor: "ana:agent", from: 11.4, to: 14, frame: "onboarding-1", mode: "write", blocks: [1, 2] },
			{ actor: "ana:agent", from: 14.2, to: 16, frame: "cart", mode: "write", blocks: [1] },
			{ actor: "jonas:agent", from: 0, to: 16, frame: "menu--empty", mode: "write", blocks: [1, 2, 3, 4] },
		],
		beats: [
			[0, "You follow Ana. Her view becomes yours."],
			[1.4, "She pans to cart--promo, and you pan with her."],
			[7.4, "Now you follow her agent instead."],
			[8.3, "An agent moves by file, not by pointer, so the camera cuts between frames."],
			[10.6, "Its next file is onboarding-1, 3,000px away."],
			[15.4, "Esc stops following."],
		],
		pages: PAGES_BOARD,
	};
}

/* ---------- away: coming back ---------- */

function away(take: TakeId): Scenario {
	return {
		id: "away",
		duration: 14,
		poster: 2.0,
		frames: [...BOARD, ...ONBOARDING],
		camera: [
			[0, BOARD_CAM],
			[9.0, BOARD_CAM],
			[10.0, { x: 705, y: 422, z: 0.86 }],
			[13.2, { x: 705, y: 422, z: 0.86 }],
			[14, BOARD_CAM],
		],
		people: [{ actor: "ana", keys: [[0, p(2200, 1300)], [7, p(2280, 1450)], [14, p(2200, 1300)]] }],
		you: [
			[0, p(1215, 1520)],
			[1.5, p(1100, 1200)],
			[2.5, p(720, 420)],
			[4.0, p(740, 520)],
			[5.0, p(1720, 430)],
			[6.4, p(1700, 460)],
			[7.3, p(220, 1400)],
			[8.6, p(240, 1350)],
			[10.0, on(BOARD, "cart", 2, 20)],
			[12.6, on(BOARD, "cart", 3, 40)],
			[14, p(1215, 1520)],
		],
		seen: [
			[0, ""],
			[2.8, "cart"],
			[5.3, "receipt"],
			[7.6, "checkout"],
		],
		ledger: [
			{ actor: "ana:agent", frame: "cart", writes: 14, blocks: [1, 2, 3], ago: 12 },
			{ actor: "ana:agent", frame: "cart--promo", writes: 3, blocks: [1], ago: 31 },
			{ actor: "jonas:agent", frame: "receipt", writes: 6, blocks: [1, 2], ago: 4 },
			{ actor: "mira:agent", frame: "menu", writes: 9, blocks: [1], file: PRICE_ROW, ago: 22 },
			{ actor: "theo", frame: "checkout", writes: 2, blocks: [1], ago: 8 },
		],
		spans: [{ actor: "mira:agent", from: 0, to: 14, frame: "menu--empty", mode: "read" }],
		beats: [
			[0, "You come back after 40 minutes."],
			...(take === "edge"
				? ([
						[2.5, "Pointing at a frame tells you who changed it."],
						[5.0, "Each frame's ticks settle once you have looked."],
						[10.0, "Up close, a rule stays beside each block that changed."],
					] as const)
				: take === "ground"
					? ([
							[2.5, "The worn ground shows where people worked, fainter the longer ago."],
							[5.0, "A frame's label clears once you have looked. The ground fades on its own."],
							[10.0, "Up close, the frame stands on the ground its last writer left."],
						] as const)
					: ([
							[2.5, "The tray lists every file that changed, and who changed it."],
							[5.0, "A file leaves the tray once you have looked at its frame."],
							[10.0, "Up close, a hairline sits under each block that changed."],
						] as const)),
		],
		pages: PAGES_BOARD,
	};
}

export function scenario(state: StateId, take: TakeId): Scenario {
	switch (state) {
		case "enter":
			return enter(take);
		case "far":
			return far();
		case "ripple":
			return ripple();
		case "zoomed":
			return zoomed(take);
		case "follow":
			return follow();
		case "away":
			return away(take);
	}
}

/** the frames you have looked at by time `t`, in the scenario that starts on your return */
export function seenBy(scn: Scenario, t: number): Map<string, number> {
	const seen = new Map<string, number>();
	for (const [at, id] of scn.seen ?? []) if (at <= t && id !== "") seen.set(id, at);
	return seen;
}

