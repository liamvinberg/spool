import { applyRule, type DeckRule, readingOrder } from "../../deck/changes";
import type { Size } from "../../deck/deck-file";
import { type Cell, cellBox, cellNear, colStride, type Deck, GAP } from "../../deck/layout";
import type { DeckRead } from "../../deck/wire";

/**
 * Where a frame held over a deck page would land (spool#299, the prototype's `drag.ts` on the team canvas), the
 * Dock's way: the band makes room. Over the band the talk closes over the hole what is held left and opens one gap
 * where letting go would put it; off the band the talk closes and the cell under the hand waits, the frames under it
 * stepping down once it is taken. Nothing trades, and nothing says what will happen: the band closing and the one gap
 * opening are the whole message.
 *
 * The rules, in screen pixels where a hand feels them:
 * - the gap is read from the middle of the frame grabbed, `LEAD` of a slot ahead of it in the way the hand is going, so
 *   a neighbour moves before the held frame covers it; the hand counts as turned back only `TURN` the other way, and
 *   a boundary is crossed only `STICK` past it, so a still or trembling hand changes nothing, at the band's ends as in
 *   its middle;
 * - the band's lower edge is crossed only `BAND_STICK` past it;
 * - under the band a frame goes to the cell under it, holding the cell shown until the hand is `SLACK` past it;
 * - within `EDGE` of the canvas's side the band scrolls, faster towards the edge (the depth squared), up to
 *   `SLOTS_A_SECOND`, and only towards an end of the band still further out than `MARGIN`.
 *
 * Several frames held move as one block, in the order they are read on the page, and the gap is as wide as the block.
 */

/** The band's breathing room over the slides' labels and under the slides, in page pixels. */
export const BAND_ROOM = 160;
/** How far ahead of the held frame's middle the gap is read, in slots. */
export const LEAD = 0.3;
/** How far the hand goes the other way before it counts as turned back. */
export const TURN = 8;
/** How far past a boundary between two gaps the read goes before the gap moves. */
export const STICK = 6;
/** How far past the band's lower edge the middle of what is held goes before it leaves the band, or comes back. */
export const BAND_STICK = 10;
/** How far past a cell's edge, in screen pixels, the hand goes before another cell is shown. */
export const SLACK = 8;
/** How near the canvas's side the band scrolls. */
export const EDGE = 72;
/** The fastest the band scrolls, at the very side. */
export const SLOTS_A_SECOND = 10;
/** The canvas a scrolled band keeps past its ends, as the camera opens on it. */
export const MARGIN = 36;

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

/** The way the hand is going along the page, and the furthest it went that way, in page pixels. */
export interface Lean {
	readonly dir: -1 | 0 | 1;
	readonly far: number;
}

/** A hand still at `x`, going nowhere yet. */
export const leanAt = (x: number): Lean => ({ dir: 0, far: x });

/**
 * The way the hand goes as it reaches `x`, measured on the page, so the band scrolling under a still hand moves it
 * too: a way is taken once the hand has gone `TURN` screen pixels, and turned only once it has come `TURN` back.
 */
export function leanOf(lean: Lean, x: number, zoom: number): Lean {
	const turn = TURN / zoom;
	if (lean.dir === 0) return Math.abs(x - lean.far) > turn ? { dir: x > lean.far ? 1 : -1, far: x } : lean;
	if ((x - lean.far) * lean.dir > 0) return { dir: lean.dir, far: x };
	if ((lean.far - x) * lean.dir > turn) return { dir: lean.dir === 1 ? -1 : 1, far: x };
	return lean;
}

/** What is held: the frames by folder, the one under the pointer, where that one's top left stands, and its lean. */
export interface Hold {
	readonly frames: readonly string[];
	readonly grabbed: string;
	readonly at: { readonly x: number; readonly y: number };
	readonly dir: Lean["dir"];
}

export interface Aim {
	/** the intent letting go sends */
	readonly rule: DeckRule;
	/** the deck it leaves */
	readonly deck: Deck;
	/** over the band: the gap the block fills, counted along the talk without it */
	readonly gap: number | null;
	/** letting go changes nothing */
	readonly same: boolean;
}

/**
 * Where letting go now would put what is held at `zoom`, or nothing when it would put it nowhere the deck allows.
 * `prior` is the aim shown until now, which a boundary holds until the hand is past it.
 */
export function aimOf(deck: Deck, hold: Hold, zoom: number, prior: Aim | null = null): Aim | null {
	const talk = deck.talk;
	const size = deck.sizes[hold.grabbed] ?? talk;
	const cx = hold.at.x + size.w / 2;
	const cy = hold.at.y + size.h / 2;
	const wasBand = prior?.gap != null;
	const band = cy < talk.h + BAND_ROOM + ((wasBand ? 1 : -1) * BAND_STICK) / zoom;
	const gap = band ? gapOf(deck, hold, cx, zoom, prior?.gap ?? null) : null;
	const rule = gap === null ? cellRule(deck, hold, cx, cy, zoom, prior) : bandRule(deck, hold, gap);
	const result = applyRule(deck, rule);
	if (result.kind === "refused") return null;
	return { rule, deck: result.deck, gap, same: sameDeck(deck, result.deck) };
}

/**
 * The gap over the band for a grabbed middle at `cx`: where the middle reads, `LEAD` of a slot ahead in the way the
 * hand goes, rounded to a slot of the talk with the block taken out of it, and held at `before` until the read is
 * `STICK` past half a slot from it. Counted for the frame grabbed, which lands as far into the block as it stands.
 */
export function gapOf(deck: Deck, hold: Hold, cx: number, zoom: number, before: number | null): number {
	const talk = deck.talk;
	const stride = colStride(talk);
	const block = readingOrder(deck, hold.frames);
	const into = Math.max(0, block.indexOf(hold.grabbed));
	const held = new Set(block);
	const rest = deck.line.filter((folder) => !held.has(folder)).length;
	// the slot the frame grabbed reads as, and the slot it would take with the block at `before`
	const read = (cx - talk.w / 2) / stride + LEAD * hold.dir;
	if (before !== null && Math.abs(read - (before + into)) <= 0.5 + STICK / (stride * zoom)) return before;
	return Math.max(0, Math.min(rest, Math.round(read) - into));
}

/** The block into the gap: one slide moves along the talk, anything else goes in. */
function bandRule(deck: Deck, hold: Hold, gap: number): DeckRule {
	if (hold.frames.length === 1 && deck.line.includes(hold.grabbed))
		return { kind: "reorder", frame: hold.grabbed, to: gap };
	const held = new Set(hold.frames);
	const rest = deck.line.filter((folder) => !held.has(folder));
	const before = rest[gap];
	return {
		kind: "insert",
		frames: hold.frames,
		at: before === undefined ? deck.line.length : deck.line.indexOf(before),
	};
}

/**
 * Under the band, the cell the grabbed middle is over, as `cellUnder` finds it: and the cell shown until now while the
 * hand is within `SLACK` of where it holds.
 */
function cellRule(deck: Deck, hold: Hold, cx: number, cy: number, zoom: number, prior: Aim | null): DeckRule {
	const was = prior?.rule.kind === "place" ? prior.rule.cell : undefined;
	const at = (x: number, y: number): DeckRule => ({
		kind: "place",
		frames: hold.frames,
		cell: cellUnder(deck, hold, x, y, was),
	});
	const rule = at(cx, cy);
	if (was === undefined || prior === null || sameRule(rule, prior.rule)) return rule;
	const d = SLACK / zoom;
	const near: readonly (readonly [number, number])[] = [
		[cx - d, cy],
		[cx + d, cy],
		[cx, cy - d],
		[cx, cy + d],
	];
	return near.some(([x, y]) => sameRule(at(x, y), prior.rule)) ? prior.rule : rule;
}

const sameRule = (a: DeckRule, b: DeckRule): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The cell a frame held under the band goes to: the nearest, unless another loose frame rests there and the middle of
 * what is held is not over it yet; then the cell shown until now, or the nearest free one, and nobody moves.
 */
function cellUnder(deck: Deck, hold: Hold, cx: number, cy: number, prior?: Cell): Cell {
	const talk = deck.talk;
	const near = cellNear(talk, cx, cy);
	const held = new Set(hold.frames);
	const taken = new Set(deck.loose.filter((spot) => !held.has(spot.folder)).map((spot) => `${spot.col},${spot.row}`));
	const free = (cell: Cell) => !taken.has(`${cell.col},${cell.row}`);
	const box = cellBox(talk, near);
	if (free(near) || (cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h)) return near;
	if (prior !== undefined && free(prior)) return prior;
	let best: { cell: Cell; distance: number } | undefined;
	for (let row = Math.max(1, near.row - 1); row <= near.row + 1; row++) {
		for (let col = near.col - 1; col <= near.col + 1; col++) {
			const cell = { col, row };
			if (!free(cell)) continue;
			const at = cellBox(talk, cell);
			const distance = (at.x + at.w / 2 - cx) ** 2 + (at.y + at.h / 2 - cy) ** 2;
			if (best === undefined || distance < best.distance) best = { cell, distance };
		}
	}
	return best?.cell ?? near;
}

function sameDeck(a: Deck, b: Deck): boolean {
	if (a.line.length !== b.line.length || a.line.some((folder, i) => b.line[i] !== folder)) return false;
	const cells = new Map(a.loose.map((spot) => [spot.folder, `${spot.col},${spot.row}`]));
	return (
		a.loose.length === b.loose.length && b.loose.every((spot) => cells.get(spot.folder) === `${spot.col},${spot.row}`)
	);
}

/** How far the band reaches along the page, in page pixels, with `slides` slides in it. */
export function bandReach(talk: Size, slides: number): { readonly from: number; readonly to: number } {
	return { from: 0, to: Math.max(talk.w, slides * colStride(talk) - GAP) };
}

/**
 * The camera's x after `dt` seconds of a hand at `pointer` (screen pixels from the canvas's left) over a canvas `width`
 * wide: within `EDGE` of a side it scrolls the band towards that end, faster the deeper (the depth squared), up to
 * `SLOTS_A_SECOND`, until that end stands `MARGIN` in from the side; a band already further in than that stays.
 */
export function edgePan(input: {
	pointer: number;
	width: number;
	camera: { readonly x: number; readonly k: number };
	talk: Size;
	reach: { readonly from: number; readonly to: number };
	dt: number;
}): number {
	const { pointer, width, camera, talk, reach, dt } = input;
	const left = EDGE - pointer;
	const right = pointer - (width - EDGE);
	const depth = left > 0 ? Math.min(1, left / EDGE) : right > 0 ? -Math.min(1, right / EDGE) : 0;
	if (depth === 0) return camera.x;
	const push = Math.sign(depth) * depth * depth;
	const step = camera.x + push * SLOTS_A_SECOND * colStride(talk) * camera.k * dt;
	// the camera's x that stands the band's start, or its end, `MARGIN` in from its side
	const most = MARGIN - reach.from * camera.k;
	const least = width - MARGIN - reach.to * camera.k;
	if (push > 0) return camera.x < most ? Math.min(most, step) : camera.x;
	return camera.x > least ? Math.max(least, step) : camera.x;
}
