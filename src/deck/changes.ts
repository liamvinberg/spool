import { clampSize, type Size } from "./deck-file";
import type { Cell, Deck, Spot } from "./layout";

/**
 * What a hand can do to a deck (spool#265), as rules on a settled deck, the same rules and numbers as the prototype's
 * `talk.ts` on the team canvas. The window previews with them and the daemon applies them; both read the result
 * through the layout, so neither has to agree with the other about a place.
 *
 * Frames are named by their folder on the deck's page. A rule names what it moves; anything it does not name stays
 * where it is, except the frames a block pushes down its column to make room.
 */
export type DeckRule =
	/** frames, loose or slides, join the talk in the gap before slide `at` (the talk's length is its end) */
	| { readonly kind: "insert"; readonly frames: readonly string[]; readonly at: number }
	/**
	 * frames go into the grid as a block down a column from `cell`, the frames there and under it moving down to
	 * make room; slides among them leave the talk, which closes. No cell: the first free one under the talk's end.
	 */
	| { readonly kind: "place"; readonly frames: readonly string[]; readonly cell?: Cell }
	/** a slide moves along the talk to index `to` */
	| { readonly kind: "reorder"; readonly frame: string; readonly to: number }
	/** the talk becomes exactly these frames in this order, as the Pages list was dragged */
	| { readonly kind: "arrange"; readonly slides: readonly string[] }
	/** the talk takes a new size: every slide of the old size takes it, and frames of another shape keep theirs */
	| { readonly kind: "size"; readonly size: Size };

export type RuleResult =
	| { readonly kind: "changed"; readonly deck: Deck }
	| { readonly kind: "refused"; readonly message: string };

const refuse = (message: string): RuleResult => ({ kind: "refused", message });

export function applyRule(deck: Deck, rule: DeckRule): RuleResult {
	const known = new Set([...deck.line, ...deck.loose.map((spot) => spot.folder)]);
	const unknown = (names: readonly string[]) => names.find((name) => !known.has(name));
	switch (rule.kind) {
		case "insert": {
			if (rule.frames.length === 0) return refuse("an insert names at least one frame");
			const missing = unknown(rule.frames);
			if (missing !== undefined) return refuse(`no frame "${missing}" on this page`);
			if (!Number.isInteger(rule.at)) return refuse("an insert's place is a whole number");
			return { kind: "changed", deck: insert(deck, rule.frames, rule.at) };
		}
		case "place": {
			if (rule.frames.length === 0) return refuse("a place names at least one frame");
			const missing = unknown(rule.frames);
			if (missing !== undefined) return refuse(`no frame "${missing}" on this page`);
			const cell = rule.cell;
			if (cell !== undefined && (!Number.isInteger(cell.col) || !Number.isInteger(cell.row)))
				return refuse("a cell is a whole column and row");
			return { kind: "changed", deck: place(deck, rule.frames, cell) };
		}
		case "reorder": {
			if (!deck.line.includes(rule.frame)) return refuse(`"${rule.frame}" is not in the talk`);
			if (!Number.isInteger(rule.to)) return refuse("a reorder's place is a whole number");
			return { kind: "changed", deck: reorder(deck, rule.frame, rule.to) };
		}
		case "arrange": {
			const missing = unknown(rule.slides);
			if (missing !== undefined) return refuse(`no frame "${missing}" on this page`);
			return { kind: "changed", deck: arrange(deck, rule.slides) };
		}
		case "size": {
			if (!Number.isFinite(rule.size.w) || !Number.isFinite(rule.size.h)) return refuse("a size is two numbers");
			return { kind: "changed", deck: resize(deck, rule.size) };
		}
	}
}

/**
 * Frames in the order a reader meets them on the page: the talk's in its order, then the loose by row and column.
 * Several frames moved at once keep this order wherever they land, so a section brought in reads as it did.
 */
export function readingOrder(deck: Deck, frames: readonly string[]): string[] {
	const named = new Set(frames);
	const slides = deck.line.filter((folder) => named.has(folder));
	const loose = deck.loose
		.filter((spot) => named.has(spot.folder))
		.sort((a, b) => a.row - b.row || a.col - b.col)
		.map((spot) => spot.folder);
	return [...slides, ...loose];
}

function insert(deck: Deck, frames: readonly string[], at: number): Deck {
	const block = readingOrder(deck, frames);
	const moving = new Set(block);
	const gap = Math.max(0, Math.min(deck.line.length, at));
	// the slides moving from before the gap leave it closer to the start
	const before = deck.line.slice(0, gap).filter((folder) => moving.has(folder)).length;
	const line = deck.line.filter((folder) => !moving.has(folder));
	line.splice(gap - before, 0, ...block);
	return { ...deck, line, loose: deck.loose.filter((spot) => !moving.has(spot.folder)) };
}

function place(deck: Deck, frames: readonly string[], cell: Cell | undefined): Deck {
	const block = readingOrder(deck, frames);
	const moving = new Set(block);
	// with no cell asked for, the block goes under the talk's end as it stood
	const to = cell ?? firstFree(deck.loose, Math.max(0, deck.line.length - 1));
	return {
		...deck,
		line: deck.line.filter((folder) => !moving.has(folder)),
		loose: setDown(deck.loose, block, to),
	};
}

function reorder(deck: Deck, frame: string, to: number): Deck {
	const line = deck.line.filter((folder) => folder !== frame);
	line.splice(Math.max(0, Math.min(line.length, to)), 0, frame);
	return { ...deck, line };
}

/** Out first, each to the first free cell under the talk's end, then in and into order: the prototype's `arrange`. */
function arrange(deck: Deck, slides: readonly string[]): Deck {
	const talk = [...new Set(slides)];
	let next = deck;
	for (const folder of deck.line) {
		if (talk.includes(folder)) continue;
		next = place(next, [folder], firstFree(next.loose, Math.max(0, next.line.length - 1)));
	}
	talk.forEach((folder, to) => {
		next = next.line.includes(folder) ? reorder(next, folder, to) : insert(next, [folder], to);
	});
	return next;
}

function resize(deck: Deck, size: Size): Deck {
	const to = clampSize(size);
	const from = deck.talk;
	if (to.w === from.w && to.h === from.h) return deck;
	const sizes: Record<string, Size> = { ...deck.sizes };
	for (const folder of deck.line) {
		const own = sizes[folder] ?? from;
		if (own.w === from.w && own.h === from.h) sizes[folder] = to;
	}
	return { ...deck, talk: to, sizes };
}

/** The first empty cell down a column. */
function firstFree(loose: readonly Spot[], col: number): Cell {
	const taken = new Set(loose.filter((spot) => spot.col === col).map((spot) => spot.row));
	let row = 1;
	while (taken.has(row)) row++;
	return { col, row };
}

/**
 * `block`, top first, set down a column from `to`. If a cell it needs is held, what stands there and everything under
 * it in the column moves down to make room; the cells the block came from are left empty.
 */
function setDown(loose: readonly Spot[], block: readonly string[], to: Cell): Spot[] {
	const row = Math.max(1, to.row);
	const moving = new Set(block);
	const rest = loose.filter((spot) => !moving.has(spot.folder));
	const clash = rest.some((spot) => spot.col === to.col && spot.row >= row && spot.row < row + block.length);
	const pushed = rest.map((spot) =>
		clash && spot.col === to.col && spot.row >= row ? { ...spot, row: spot.row + block.length } : spot,
	);
	return [...pushed, ...block.map((folder, at) => ({ folder, col: to.col, row: row + at }))];
}
