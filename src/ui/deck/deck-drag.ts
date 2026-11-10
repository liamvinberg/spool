import { applyRule, type DeckRule } from "../../deck/changes";
import type { Size } from "../../deck/deck-file";
import { type Box, cellNear, colStride, type Deck, placesOf } from "../../deck/layout";
import type { DeckRead } from "../../deck/wire";

/**
 * Where a frame held over a deck page would land (spool#265), as the prototype's `aimOf` in `field.tsx` decides it:
 * the middle of the frame held picks the place. Over the band a slide moves along the talk; any other frame over a
 * slide's left fifth goes in before it, its right fifth after it, and its middle trades with it; past either end of
 * the talk it joins that end. Under the band it goes to the cell under it, and a cell already held pushes the run
 * below it down. Several frames held go in together in the order they had.
 *
 * The window previews the drop with the same rules the daemon applies (`deck/changes.ts`), so the outline shows
 * exactly where the daemon will put the frame.
 */

/** The band's breathing room over the slides' labels and under the slides, in page pixels. */
export const BAND_ROOM = 160;
/** How far into a slide, as a share of its width, its edges reach: nearer the edge parts the talk, the rest trades. */
export const EDGE = 0.2;

/** A frame of the page by its folder, as the deck's rules name it. */
export const folderOf = (page: string, name: string): string => name.slice(page.length + 1);
/** A frame of the page by its path, as the canvas names it. */
export const nameOf = (page: string, folder: string): string => `${page}/${folder}`;

/** The deck the read describes, as the rules see it; `sizeOf` says a frame's own size, by its path. */
export function deckOfRead(read: DeckRead, sizeOf: (name: string) => Size | undefined): Deck {
	const sizes: Record<string, Size> = {};
	const folders = [...read.slides.map((slide) => slide.name), ...read.loose.map((spot) => spot.name)];
	for (const name of folders) sizes[folderOf(read.page, name)] = sizeOf(name) ?? read.size;
	return {
		talk: read.size,
		line: read.slides.map((slide) => folderOf(read.page, slide.name)),
		loose: read.loose.map((spot) => ({ folder: folderOf(read.page, spot.name), ...spot.cell })),
		sizes,
	};
}

/** What is held: the frames by folder, the one under the pointer, and where that one's top left stands now. */
export interface Hold {
	readonly frames: readonly string[];
	readonly grabbed: string;
	readonly at: { readonly x: number; readonly y: number };
}

export interface Aim {
	/** the intent letting go sends */
	readonly rule: DeckRule;
	/** the deck it leaves */
	readonly deck: Deck;
	/** where the frame grabbed lands, which the outline shows */
	readonly landing: Box;
	/** it lands in the talk, which lifts the band */
	readonly band: boolean;
	/** letting go changes nothing */
	readonly same: boolean;
}

/** Where letting go now would put what is held, or nothing when it would put it nowhere the deck allows. */
export function aimOf(deck: Deck, hold: Hold): Aim | null {
	const talk = deck.talk;
	const size = deck.sizes[hold.grabbed] ?? talk;
	const cx = hold.at.x + size.w / 2;
	const cy = hold.at.y + size.h / 2;
	const rule = ruleAt(deck, hold, cx, cy);
	const result = applyRule(deck, rule);
	if (result.kind === "refused") return null;
	const landing = placesOf(result.deck).get(hold.grabbed);
	if (landing === undefined) return null;
	return {
		rule,
		deck: result.deck,
		landing,
		band: result.deck.line.includes(hold.grabbed),
		same: sameDeck(deck, result.deck),
	};
}

function ruleAt(deck: Deck, hold: Hold, cx: number, cy: number): DeckRule {
	const talk = deck.talk;
	// under the band once the middle of what is held has left it
	if (cy >= talk.h + BAND_ROOM) return { kind: "place", frames: hold.frames, cell: cellNear(talk, cx, cy) };
	const length = deck.line.length;
	if (hold.frames.length === 1 && deck.line.includes(hold.grabbed)) {
		const to = Math.round((cx - talk.w / 2) / colStride(talk));
		return { kind: "reorder", frame: hold.grabbed, to: Math.max(0, Math.min(length - 1, to)) };
	}
	const col = Math.floor(cx / colStride(talk));
	const into = (cx - col * colStride(talk)) / talk.w;
	if (col < 0) return { kind: "insert", frames: hold.frames, at: 0 };
	if (col >= length) return { kind: "insert", frames: hold.frames, at: length };
	if (into < EDGE) return { kind: "insert", frames: hold.frames, at: col };
	if (into > 1 - EDGE) return { kind: "insert", frames: hold.frames, at: col + 1 };
	const slide = deck.line[col] as string;
	// one loose frame trades; several have no one place to trade, so they go in on the nearer side
	if (hold.frames.length === 1 && slide !== hold.grabbed) return { kind: "trade", frame: hold.grabbed, slide };
	return { kind: "insert", frames: hold.frames, at: into < 0.5 ? col : col + 1 };
}

function sameDeck(a: Deck, b: Deck): boolean {
	if (a.line.length !== b.line.length || a.line.some((folder, i) => b.line[i] !== folder)) return false;
	const cells = new Map(a.loose.map((spot) => [spot.folder, `${spot.col},${spot.row}`]));
	return (
		a.loose.length === b.loose.length && b.loose.every((spot) => cells.get(spot.folder) === `${spot.col},${spot.row}`)
	);
}
