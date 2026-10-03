import type { CoffeeScreenName } from "shared/ui/demo/coffee-screens";

/**
 * The kaffe project as the team canvas holds it: the `app` page, twenty-four
 * phone frames in three rows, at their authored size. Every take on this page
 * draws the same world from the same scenarios, so a row differs from another
 * row only in how presence is drawn.
 */

export const FW = 390;
export const FH = 844;
const PITCH_X = 530;
const PITCH_Y = 1064;
const COLS = 8;

/** the viewport between the 248 pages rail and the 44 dock strip, under the 44 bar */
export const VW = 1440 - 248 - 44;
export const VH = 900 - 44;

/** below this many screen pixels wide a frame is a stored picture, not a document (`src/cover.ts`) */
export const LIVE_MIN = 400;

export const FRAME_NAMES = [
	"menu",
	"menu--empty",
	"menu--seasonal",
	"item",
	"item--milk",
	"item--sold-out",
	"cart",
	"cart--empty",
	"cart--promo",
	"checkout",
	"checkout--card",
	"checkout--swish",
	"checkout--error",
	"pickup",
	"pickup--late",
	"receipt",
	"receipt--refund",
	"account",
	"account--login",
	"orders",
	"orders--empty",
	"rewards",
	"rewards--redeem",
	"settings",
] as const;

export type FrameName = (typeof FRAME_NAMES)[number];

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Placed extends Box {
	name: FrameName;
	screen: CoffeeScreenName;
}

function screenOf(name: string): CoffeeScreenName {
	if (name.startsWith("menu") || name.startsWith("item") || name.startsWith("rewards")) return "menu";
	if (name.startsWith("cart") || name.startsWith("checkout") || name.startsWith("orders")) return "cart";
	return "receipt";
}

export const FRAMES: readonly Placed[] = FRAME_NAMES.map((name, index) => ({
	name,
	screen: screenOf(name),
	x: (index % COLS) * PITCH_X,
	y: Math.floor(index / COLS) * PITCH_Y,
	w: FW,
	h: FH,
}));

const BY_NAME = new Map<string, Placed>(FRAMES.map((frame) => [frame.name, frame]));

export function frameOf(name: string): Placed {
	const found = BY_NAME.get(name);
	if (found === undefined) throw new Error(`no frame ${name}`);
	return found;
}

export const WORLD: Box = {
	x: 0,
	y: 0,
	w: (COLS - 1) * PITCH_X + FW,
	h: 2 * PITCH_Y + FH,
};

/** the other pages, collapsed in the rail */
export const OTHER_PAGES = [
	{ name: "site", frames: ["landing", "landing--wide", "pricing", "pricing--annual", "about", "careers"] },
	{ name: "explore", frames: ["loyalty-a", "loyalty-b", "loyalty-c", "onboarding", "onboarding--skip", "widgets"] },
] as const;

/* ---------- who ---------- */

export type Who = "you" | "ana" | "ben" | "cleo" | "dev";

export interface Member {
	id: Who;
	name: string;
	initial: string;
	/** a person's colour, and their agent's: the agent is their tool, so it wears them */
	color: string;
	agent: "claude" | "codex" | null;
}

/**
 * Four colours for four teammates, kept off the thread's red, which stays the
 * selection's. You are never drawn to yourself, and your own agent keeps the
 * neutral ink the single-player hand already uses, so nothing about working alone
 * changes when a team arrives.
 */
export const MEMBERS: Readonly<Record<Who, Member>> = {
	you: { id: "you", name: "You", initial: "Y", color: "var(--color-text)", agent: "claude" },
	ana: { id: "ana", name: "Ana", initial: "A", color: "#7ea6f7", agent: "claude" },
	ben: { id: "ben", name: "Ben", initial: "B", color: "#e3b25e", agent: "codex" },
	cleo: { id: "cleo", name: "Cleo", initial: "C", color: "#62c7a3", agent: "claude" },
	dev: { id: "dev", name: "Dev", initial: "D", color: "#c497e8", agent: null },
};

export const TEAM: readonly Who[] = ["ana", "ben", "cleo", "dev"];

/** how an agent is named out loud: whose, then which */
export function agentName(who: Who): string {
	const member = MEMBERS[who];
	const agent = member.agent ?? "agent";
	return who === "you" ? `your ${agent}` : `${member.name.toLowerCase()}'s ${agent}`;
}

/* ---------- blocks inside a coffee screen, normalised to the frame ---------- */

export type BlockId = "head" | "list" | "total" | "cta";

export const BLOCKS: Readonly<Record<BlockId, Box>> = {
	head: { x: 0.04, y: 0.025, w: 0.92, h: 0.06 },
	list: { x: 0.04, y: 0.1, w: 0.92, h: 0.16 },
	total: { x: 0.04, y: 0.8, w: 0.92, h: 0.06 },
	cta: { x: 0.04, y: 0.875, w: 0.92, h: 0.07 },
};

export function blockBox(frame: Box, block: BlockId): Box {
	const b = BLOCKS[block];
	return { x: frame.x + b.x * frame.w, y: frame.y + b.y * frame.h, w: b.w * frame.w, h: b.h * frame.h };
}

/* ---------- time ---------- */

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const easeOut = (value: number) => 1 - (1 - clamp01(value)) ** 3;
export const easeInOut = (value: number) => {
	const v = clamp01(value);
	return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
export const lerp = (a: number, b: number, v: number) => a + (b - a) * v;
