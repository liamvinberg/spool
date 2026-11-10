import type { Size } from "./deck-file";

/**
 * Where a deck's frames stand (spool#265), as one pure function of the deck. Places are written into the frames'
 * sidecars rather than computed by every reader, so a picture, an export, spool.page or a spool with the experiment
 * off draws a deck right without knowing what one is; the order is the truth and the places follow it.
 *
 * The page is a grid whose cell is the talk's size, `w + 160` across and `h + 320` down. Row 0 is the band: slide `i`
 * of the talk stands at `x = i * (w + 160)`, `y = 0`, with no gaps. Every other frame is loose and rests in one cell
 * of the rows under the band, the first of which starts at `y = h + 640`. A frame of another size is centred in its
 * slot or cell. A cell holds one frame, and where a loose frame sits means nothing, so moving the talk never moves
 * one.
 *
 * Settling is how a deck is kept in step with whatever a hand did to its files: slides go to their slots, and a loose
 * frame off a cell, or sharing one, goes to the nearest free cell. It depends only on what is on disk, never on the
 * order things were found or happened in, so running it twice changes nothing and two machines reading the same
 * files write the same bytes.
 */

/** Between two slides, and two columns of cells. */
export const GAP = 160;
/** Between two rows of cells: room for a frame's name. */
export const ROW_GAP = 320;
/** As much again between the band and the first row under it. */
export const UNDER_BAND = 320;

export interface Cell {
	readonly col: number;
	/** 1 and down: row 0 is the band, which holds the talk and no cells */
	readonly row: number;
}

export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** A loose frame and the cell it rests in. */
export interface Spot extends Cell {
	readonly folder: string;
}

/**
 * A deck as its rules see it: the talk's size, the talk, every loose frame's cell, and every frame's size. Frames are
 * named by their folder on the deck's page.
 */
export interface Deck {
	readonly talk: Size;
	readonly line: readonly string[];
	readonly loose: readonly Spot[];
	readonly sizes: Readonly<Record<string, Size>>;
}

/** A frame of the deck's page as the disk has it. */
export interface DeckFrame {
	readonly folder: string;
	/** The size its sidecar states; absent, the talk's. */
	readonly size?: Size;
	/** Where its sidecar places it; absent while it has no place. */
	readonly at?: Box;
}

export const colStride = (talk: Size): number => talk.w + GAP;
export const rowStride = (talk: Size): number => talk.h + ROW_GAP;

export function slotBox(talk: Size, index: number): Box {
	return { x: index * colStride(talk), y: 0, w: talk.w, h: talk.h };
}

export function cellBox(talk: Size, cell: Cell): Box {
	return { x: cell.col * colStride(talk), y: cell.row * rowStride(talk) + UNDER_BAND, w: talk.w, h: talk.h };
}

/**
 * A frame of `size` centred in `box`, in whole pixels: its size rounded first and centred as rounded, so the box it
 * gives centres to itself again and a frame of a fractional size is placed once.
 */
export function centredIn(box: Box, size: Size): Box {
	const w = Math.round(size.w);
	const h = Math.round(size.h);
	return { x: box.x + Math.round((box.w - w) / 2), y: box.y + Math.round((box.h - h) / 2), w, h };
}

/** The cell under the band nearest a point on the page. */
export function cellNear(talk: Size, x: number, y: number): Cell {
	return {
		col: Math.round((x - talk.w / 2) / colStride(talk)),
		row: Math.max(1, Math.round((y - UNDER_BAND - talk.h / 2) / rowStride(talk))),
	};
}

const key = (cell: Cell): string => `${cell.col},${cell.row}`;
const byFolder = (a: { folder: string }, b: { folder: string }): number =>
	a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0;
const same = (a: Box, b: Box): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const middle = (box: Box): { x: number; y: number } => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

/**
 * The deck the disk describes, settled: the talk is the listed folders that are frames, each once, and every other
 * frame takes a cell. A loose frame exactly in a cell keeps it, the first by folder name when two are; one off a cell
 * or out of one goes to the free cell nearest where it stands; one with no place takes the first free cell under the
 * talk, row by row.
 */
export function settle(talk: Size, slides: readonly string[], frames: readonly DeckFrame[]): Deck {
	const sorted = [...frames].sort(byFolder);
	const present = new Set(sorted.map((frame) => frame.folder));
	const line = [...new Set(slides)].filter((folder) => present.has(folder));
	const inLine = new Set(line);
	const sizes: Record<string, Size> = {};
	for (const frame of sorted) sizes[frame.folder] = frame.size ?? talk;
	const loose = sorted.filter((frame) => !inLine.has(frame.folder));
	const taken = new Set<string>();
	const cells = new Map<string, Cell>();
	const take = (folder: string, cell: Cell) => {
		taken.add(key(cell));
		cells.set(folder, cell);
	};
	for (const frame of loose) {
		if (frame.at === undefined) continue;
		const centre = middle(frame.at);
		const cell = cellNear(talk, centre.x, centre.y);
		if (!taken.has(key(cell)) && same(frame.at, centredIn(cellBox(talk, cell), sizes[frame.folder] ?? talk)))
			take(frame.folder, cell);
	}
	for (const frame of loose) {
		if (frame.at === undefined || cells.has(frame.folder)) continue;
		const centre = middle(frame.at);
		take(frame.folder, nearestFree(talk, centre.x, centre.y, taken, loose.length));
	}
	const width = Math.max(1, line.length);
	for (const frame of loose) {
		if (cells.has(frame.folder)) continue;
		take(frame.folder, firstFreeIn(taken, width));
	}
	return {
		talk,
		line,
		loose: loose.map((frame) => ({ folder: frame.folder, ...(cells.get(frame.folder) as Cell) })),
		sizes,
	};
}

/** Every frame's place in a deck. */
export function placesOf(deck: Deck): Map<string, Box> {
	const places = new Map<string, Box>();
	const sizeOf = (folder: string) => deck.sizes[folder] ?? deck.talk;
	deck.line.forEach((folder, index) => {
		places.set(folder, centredIn(slotBox(deck.talk, index), sizeOf(folder)));
	});
	for (const spot of deck.loose) places.set(spot.folder, centredIn(cellBox(deck.talk, spot), sizeOf(spot.folder)));
	return places;
}

/** The places that differ from where the disk has them, by folder name: all a reconcile has to write. */
export function placesToWrite(places: ReadonlyMap<string, Box>, frames: readonly DeckFrame[]): Map<string, Box> {
	const at = new Map(frames.map((frame) => [frame.folder, frame.at]));
	const writes = new Map<string, Box>();
	for (const [folder, box] of [...places].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
		const now = at.get(folder);
		if (now === undefined || !same(now, box)) writes.set(folder, box);
	}
	return writes;
}

/** What settling a deck writes: the places that differ, and only those. */
export function reconcilePlan(talk: Size, slides: readonly string[], frames: readonly DeckFrame[]): Map<string, Box> {
	return placesToWrite(placesOf(settle(talk, slides, frames)), frames);
}

/**
 * The free cell nearest a point, by distance between middles, ties to the higher row and then the column to the left.
 * Only `held` cells can be taken, so a free one lies within about √held cells of the nearest; the window searched is
 * wide enough that nothing outside it can be nearer.
 */
function nearestFree(talk: Size, x: number, y: number, taken: ReadonlySet<string>, held: number): Cell {
	const near = cellNear(talk, x, y);
	const across = colStride(talk);
	const down = rowStride(talk);
	const reach = Math.ceil(Math.sqrt(held + 1)) + 1;
	const radius = Math.ceil((reach * Math.hypot(across, down)) / Math.min(across, down)) + 1;
	let best: { cell: Cell; distance: number } | undefined;
	for (let row = Math.max(1, near.row - radius); row <= near.row + radius; row++) {
		for (let col = near.col - radius; col <= near.col + radius; col++) {
			const cell = { col, row };
			if (taken.has(key(cell))) continue;
			const centre = middle(cellBox(talk, cell));
			const distance = (centre.x - x) ** 2 + (centre.y - y) ** 2;
			// rows then columns ascend, so the first of two at one distance is already the one kept
			if (best === undefined || distance < best.distance) best = { cell, distance };
		}
	}
	return best?.cell ?? firstFreeIn(taken, 1);
}

/** The first free cell reading row by row, `width` cells to a row from column 0. */
function firstFreeIn(taken: ReadonlySet<string>, width: number): Cell {
	for (let row = 1; ; row++) {
		for (let col = 0; col < width; col++) {
			if (!taken.has(key({ col, row }))) return { col, row };
		}
	}
}
