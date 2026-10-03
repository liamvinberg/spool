import {
	type AgentId,
	type Cam,
	type Key,
	type PersonId,
	type Pt,
	type Run,
	readRun,
	writeRun,
} from "./model";

/**
 * The six moments every take is played through, one per column. The same scene
 * drives all three takes, so a column compares like with like: what differs is
 * only what each take decides to draw.
 */

export type StateId = "now" | "far" | "zoomed" | "enter" | "follow" | "away";

export interface AwayChange {
	readonly frame: string;
	readonly by: AgentId;
	readonly edits: number;
	/** minutes before you came back */
	readonly ago: number;
	readonly blocks: readonly number[];
	readonly isNew?: boolean;
}

type Track = readonly (Key<Pt> & { d?: number })[];

export interface Scene {
	readonly id: StateId;
	readonly length: number;
	/** where the clock starts, so a still of the frame lands on its point */
	readonly poster: number;
	readonly camera: readonly (Key<Cam> & { d?: number })[];
	readonly pointers: Partial<Record<PersonId, Track>>;
	readonly runs: Partial<Record<AgentId, readonly Run[]>>;
	/** your own pointer, in world units, where the scene needs it seen */
	readonly you?: Track;
	readonly selected?: string;
	readonly entered?: { readonly frame: string; readonly from: number };
	readonly hover?: { readonly person: PersonId; readonly from: number; readonly to: number };
	readonly follow?: {
		readonly person: { readonly who: PersonId; readonly from: number; readonly to: number };
		readonly agent: { readonly who: AgentId; readonly from: number; readonly to: number };
	};
	readonly away?: { readonly minutes: number; readonly changes: readonly AwayChange[] };
	readonly beats: readonly { readonly t: number; readonly label: string }[];
}

/** the order flow is yours: you started it and your claude has been building it */
export const MINE: ReadonlySet<string> = new Set(["cart", "checkout", "cart--empty", "checkout--error"]);

const HOME_CAM = { x: 1005, y: 790, k: 0.5 };

const now: Scene = {
	id: "now",
	length: 20,
	poster: 6.2,
	camera: [{ t: 0, ...HOME_CAM }],
	selected: "cart",
	pointers: {
		ana: [
			{ t: 0, x: 1200, y: 1300 },
			{ t: 2.5, x: 1330, y: 1520, d: 1.2 },
			{ t: 5, x: 1280, y: 1650, d: 1 },
			{ t: 14.5, x: 1420, y: 1380, d: 1.2 },
			{ t: 17, x: 1250, y: 1300, d: 1.4 },
			{ t: 20, x: 1200, y: 1300, d: 1.5 },
		],
		jonas: [
			{ t: 0, x: 3200, y: 2500 },
			{ t: 6, x: 3320, y: 2620, d: 1.5 },
			{ t: 16, x: 3200, y: 2500, d: 1.8 },
		],
		mira: [{ t: 0, x: 210, y: 1500 }],
		sam: [
			{ t: 0, x: 4250, y: 300 },
			{ t: 9, x: 4380, y: 520, d: 2 },
			{ t: 19, x: 4250, y: 300, d: 2 },
		],
	},
	runs: {
		you: [writeRun("cart", 1, 8.2, 1.1, 0), readRun("checkout", 9, 11.2), writeRun("checkout", 11.6, 18.8, 1.2, 3)],
		ana: [writeRun("profile", 0, 20, 1.3, 1)],
		jonas: [writeRun("receipt", 0, 14, 0.9, 2)],
		mira: [readRun("welcome", 0, 6), writeRun("welcome", 6, 20, 1.6, 4)],
	},
	beats: [
		{ t: 0, label: "five people, four agents, you on cart" },
		{ t: 1, label: "your claude starts on cart" },
		{ t: 9, label: "your claude reads checkout" },
		{ t: 14, label: "jonas · codex finishes receipt" },
	],
};

const far: Scene = {
	id: "far",
	length: 18,
	poster: 7.4,
	camera: [{ t: 0, ...HOME_CAM }],
	selected: "cart",
	hover: { person: "ana", from: 5.2, to: 10.6 },
	you: [
		{ t: 0, x: 1320, y: 760 },
		{ t: 5, x: 752, y: 1486, d: 1.5 },
		{ t: 10.6, x: 752, y: 1486 },
		{ t: 12.4, x: 1160, y: 700, d: 1.6 },
		{ t: 18, x: 1320, y: 760, d: 2 },
	],
	pointers: {
		ana: [
			{ t: 0, x: 700, y: 1350 },
			{ t: 3, x: 735, y: 1460, d: 1.5 },
			{ t: 13, x: 820, y: 1600, d: 1.4 },
			{ t: 17, x: 700, y: 1350, d: 1.6 },
		],
		jonas: [{ t: 0, x: 3700, y: 2500 }],
		mira: [{ t: 0, x: 4300, y: 1500 }],
		sam: [{ t: 0, x: 200, y: 300 }],
	},
	runs: {
		ana: [writeRun("card", 0, 18, 1.2, 0)],
		you: [writeRun("orders", 0, 11, 1, 2), readRun("orders--empty", 13, 18)],
		jonas: [writeRun("stamps", 0, 18, 1.4, 5)],
		mira: [readRun("settings--alerts", 2, 18)],
	},
	beats: [
		{ t: 0, label: "ana is here, her claude is on card, 3,900px away" },
		{ t: 5.2, label: "you point at ana" },
		{ t: 11, label: "your claude finishes orders, off screen" },
		{ t: 13, label: "your claude reads orders--empty" },
	],
};

const zoomed: Scene = {
	id: "zoomed",
	length: 18,
	poster: 5,
	camera: [
		{ t: 0, x: 2505, y: 1522, k: 0.2 },
		{ t: 13.5, x: 1100, y: 700, k: 0.52, d: 2.6 },
	],
	selected: "cart",
	pointers: {
		ana: [
			{ t: 0, x: 1250, y: 1500 },
			{ t: 6, x: 1350, y: 1650, d: 1.5 },
			{ t: 12, x: 1250, y: 1500, d: 1.5 },
		],
		jonas: [{ t: 0, x: 3700, y: 2600 }, { t: 9, x: 3820, y: 2480, d: 1.6 }],
		mira: [{ t: 0, x: 300, y: 2500 }],
		sam: [{ t: 0, x: 4300, y: 500 }, { t: 7, x: 4150, y: 650, d: 2 }, { t: 15, x: 4300, y: 500, d: 2 }],
	},
	runs: {
		you: [writeRun("orders", 0, 18, 1.1, 0)],
		ana: [writeRun("checkout", 0, 18, 1.3, 3)],
		jonas: [writeRun("receipt", 0, 18, 0.9, 1)],
		mira: [readRun("welcome", 0, 2), writeRun("welcome", 2, 18, 1.5, 6)],
	},
	beats: [
		{ t: 0, label: "zoomed out to 20%, 24 frames" },
		{ t: 10.9, label: "you zoom in on the order flow" },
	],
};

const enter: Scene = {
	id: "enter",
	length: 20,
	poster: 10.6,
	camera: [{ t: 0, x: 1275, y: 410, k: 0.8 }],
	selected: "checkout",
	entered: { frame: "checkout", from: 3.4 },
	you: [
		{ t: 0, x: 1760, y: 760 },
		{ t: 2.8, x: 1240, y: 560, d: 1.6 },
		{ t: 7, x: 1300, y: 640, d: 1.6 },
		{ t: 14, x: 1200, y: 520, d: 2 },
		{ t: 19.5, x: 1760, y: 760, d: 1.6 },
	],
	pointers: {
		ana: [
			{ t: 0, x: 1300, y: 1700 },
			{ t: 12, x: 1170, y: 300, d: 1.8 },
			{ t: 15, x: 1320, y: 620, d: 1.2 },
			{ t: 18, x: 1250, y: 420, d: 1.5 },
			{ t: 20, x: 1300, y: 1700, d: 1.6 },
		],
		jonas: [{ t: 0, x: 3200, y: 2500 }],
		mira: [{ t: 0, x: 300, y: 1500 }],
		sam: [{ t: 0, x: 4300, y: 300 }],
	},
	runs: {
		jonas: [writeRun("checkout", 0, 17, 0.9, 0)],
		mira: [readRun("welcome", 0, 7.6), readRun("checkout", 8.2, 9.6), writeRun("checkout", 9.6, 20, 1.25, 2)],
		ana: [writeRun("profile", 0, 20, 1.4, 1)],
	},
	beats: [
		{ t: 0, label: "jonas · codex is writing checkout" },
		{ t: 3.4, label: "you enter checkout" },
		{ t: 8.2, label: "mira · claude arrives on the same frame" },
		{ t: 12, label: "ana enters checkout" },
		{ t: 17, label: "jonas · codex finishes" },
	],
};

const follow: Scene = {
	id: "follow",
	length: 24,
	poster: 13.2,
	// ana's own camera, which is yours while you follow her
	camera: [
		{ t: 0, ...HOME_CAM },
		{ t: 5, x: 3200, y: 700, k: 0.5, d: 3.4 },
		{ t: 7.5, x: 3735, y: 450, k: 0.72, d: 2.2 },
	],
	selected: "cart",
	follow: {
		person: { who: "ana", from: 1, to: 12 },
		agent: { who: "jonas", from: 12, to: 24 },
	},
	pointers: {
		ana: [
			{ t: 0, x: 1100, y: 800 },
			{ t: 5, x: 3300, y: 600, d: 3.4 },
			{ t: 8, x: 3700, y: 300, d: 1.5 },
			{ t: 10, x: 3800, y: 600, d: 1.2 },
			{ t: 12, x: 3650, y: 500, d: 1 },
		],
		jonas: [{ t: 0, x: 3200, y: 2500 }],
		mira: [{ t: 0, x: 300, y: 1500 }],
		sam: [{ t: 0, x: 4300, y: 2500 }],
	},
	runs: {
		jonas: [
			writeRun("receipt", 0, 15, 0.9, 0),
			writeRun("receipt--pickup", 15.6, 19.6, 0.8, 3),
			writeRun("history", 20.2, 24, 0.8, 1),
		],
		ana: [writeRun("profile", 2, 24, 1.3, 2)],
	},
	beats: [
		{ t: 1, label: "you follow ana" },
		{ t: 12, label: "you follow jonas · codex" },
		{ t: 15.6, label: "codex moves to receipt--pickup" },
		{ t: 20.2, label: "codex moves to history" },
	],
};

const away: Scene = {
	id: "away",
	length: 20,
	poster: 3.2,
	camera: [
		{ t: 0, ...HOME_CAM },
		{ t: 2.4, x: 735, y: 422, k: 0.86, d: 1.6 },
		{ t: 8.2, x: 1275, y: 422, k: 0.86, d: 1.6 },
		{ t: 13.8, x: 2505, y: 1522, k: 0.2, d: 2.4 },
	],
	selected: "cart",
	away: {
		minutes: 41,
		changes: [
			{ frame: "cart", by: "you", edits: 14, ago: 6, blocks: [0, 2, 3] },
			{ frame: "checkout", by: "ana", edits: 9, ago: 12, blocks: [1, 2] },
			{ frame: "receipt", by: "jonas", edits: 22, ago: 3, blocks: [0, 1, 3] },
			{ frame: "profile", by: "mira", edits: 5, ago: 31, blocks: [1] },
			{ frame: "settings--alerts", by: "mira", edits: 3, ago: 29, blocks: [2] },
			{ frame: "stamps", by: "jonas", edits: 11, ago: 18, blocks: [], isNew: true },
		],
	},
	pointers: {
		ana: [{ t: 0, x: 4700, y: 2500 }],
		jonas: [{ t: 0, x: 3700, y: 2600 }],
	},
	runs: {
		ana: [writeRun("card", 0, 20, 1.3, 0)],
	},
	beats: [
		{ t: 0, label: "you come back after 41 minutes" },
		{ t: 2.4, label: "your frames first" },
		{ t: 13.8, label: "everything else" },
	],
};

export const SCENES: Record<StateId, Scene> = { now, far, zoomed, enter, follow, away };
