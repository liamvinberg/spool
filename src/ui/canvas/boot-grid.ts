/**
 * The boot curtain's arithmetic (#244): how a project's frame count becomes a
 * block on the field, and when the curtain is allowed to be on screen at all.
 *
 * The count is the only thing the canvas honestly knows before the projection
 * lands. `/api/projects` has already answered by the time this component
 * mounts, so `frameCount` is exact — where the frames sit, what they are
 * called and what they look like are not known until `/frames` replies, which
 * is most of the wait. So the curtain draws one cell per frame and asserts
 * nothing else: a four-frame project is a short row, a four-hundred-frame
 * project is a wall, and neither pretends to be a layout.
 *
 * Nothing is ever truncated. A big project shrinks its cells rather than
 * dropping any, because a block that silently stops counting is a block that
 * lies about the size of the project. Past a few thousand frames the block
 * outgrows its box and spills, which is the right failure: a project that
 * large has a real problem and the curtain should not be the thing hiding it.
 */

/** the box the block is laid inside, whatever the count */
export const BLOCK_W = 640;
export const BLOCK_H = 400;

/** a cell at its most generous — the size a handful of frames get */
export const MAX_CELL_W = 62;
/** below this a cell stops reading as a frame and starts reading as noise */
export const MIN_CELL_W = 6;

/** frames are wider than they are tall far more often than not */
const CELL_RATIO = 9 / 16;

/** at or under this the block is one row: the count is legible without a shape */
const SINGLE_ROW_UPTO = 6;

/**
 * How long the wave takes to cross the whole block, whichever size it is.
 *
 * The lit fraction of the block is the keyframe's own lit fraction and nothing
 * else — spread the delays however you like and a cell is on for the same share
 * of its cycle — so the shape in `ui.css` is what keeps this a band rather than
 * a glow, and this only decides how fast the band travels.
 */
export const WAVE_MS = 2600;

export interface BootGrid {
	readonly columns: number;
	readonly rows: number;
	readonly cellW: number;
	readonly cellH: number;
	readonly gap: number;
}

/**
 * The gap closes as the grid densifies. Held at 8px a twenty-column block is
 * more gutter than cell, and the count stops reading as a mass.
 */
function gapFor(columns: number): number {
	if (columns <= 10) return 8;
	if (columns <= 16) return 5;
	return 3;
}

/**
 * How many columns a count wants.
 *
 * The block aims at the field's own proportion rather than at a square: cells
 * are 16:9, so an equal number of rows and columns would stand almost twice as
 * wide as it is tall.
 */
function columnsFor(count: number): number {
	if (count <= SINGLE_ROW_UPTO) return count;
	const aspect = BLOCK_H / BLOCK_W / CELL_RATIO;
	return Math.max(2, Math.ceil(Math.sqrt(count / aspect)));
}

export function bootGrid(count: number): BootGrid {
	const columns = columnsFor(count);
	const rows = Math.ceil(count / columns);
	const gap = gapFor(columns);
	const widthBudget = Math.floor((BLOCK_W - gap * (columns - 1)) / columns);
	const heightBudget = Math.floor((BLOCK_H - gap * (rows - 1)) / rows);
	const cellW = Math.max(MIN_CELL_W, Math.min(MAX_CELL_W, widthBudget, Math.floor(heightBudget / CELL_RATIO)));
	// the ratio is what a cell wants; the budget is what the box has, and the
	// box wins — rounding the height up instead put a 61-frame block two pixels
	// outside its own bounds
	const cellH = Math.max(4, Math.min(heightBudget, Math.round(cellW * CELL_RATIO)));
	return { columns, rows, cellW, cellH, gap };
}

/**
 * Where one cell sits in the wave, as its animation delay.
 *
 * Normalised against the block's own reach rather than counted in fixed steps
 * per row: a 400-frame block is twenty rows deep, and a per-row delay that
 * reads as a band across eight rows reads as a slow smear across twenty.
 */
export function waveDelay(index: number, grid: BootGrid): number {
	const row = Math.floor(index / grid.columns);
	const column = index % grid.columns;
	const reach = grid.rows - 1 + (grid.columns - 1) * 0.4;
	if (reach <= 0) return 0;
	return ((row + column * 0.4) / reach) * WAVE_MS;
}

/**
 * How long the daemon may take before the curtain is allowed to draw anything.
 *
 * Measured on this machine against the largest real project (89 frames): the
 * canvas mounts around 230ms into the navigation and `/frames` replies around
 * 240ms after that, so a warm boot spends a fraction of a second here and a
 * daemon busy resolving flows has been seen to spend five seconds. The gate is
 * what keeps the fast boot from flashing something nobody asked to see.
 */
export const GATE_MS = 160;
/** the curtain arriving, once the gate has passed */
export const ENTER_MS = 180;
/**
 * The least time a curtain that did appear stays on screen before it starts to
 * leave. The gate alone leaves a band where the projection lands a few
 * milliseconds after the curtain is allowed to draw, and what that renders is a
 * block fading out of its own fade-in. Measured against the dev daemon this is
 * not hypothetical: a cold boot did exactly that. It is deliberately longer
 * than the entrance, so the fade out never starts before the fade in finished.
 */
export const MIN_SHOWN_MS = 200;

/**
 * The curtain leaving. It fades *across* the frames rather than holding them
 * back: the canvas underneath is already real from the moment the projection
 * lands, and withholding it to protect the curtain's exit would be the worse
 * trade every time.
 */
export const EXIT_MS = 400;

/**
 * Where the curtain is. `waiting` and `gone` both draw nothing, and they are
 * different states: a boot that answers inside the gate goes straight from one
 * to the other, having never drawn a pixel.
 */
export type Curtain = "waiting" | "showing" | "leaving" | "gone";

export type CurtainSignal = "gate" | "ready" | "exited";

/** A curtain only ever moves forward, so a late signal cannot raise it again. */
export function nextCurtain(phase: Curtain, signal: CurtainSignal): Curtain {
	switch (signal) {
		case "gate":
			return phase === "waiting" ? "showing" : phase;
		case "ready":
			if (phase === "waiting") return "gone";
			return phase === "showing" ? "leaving" : phase;
		case "exited":
			return phase === "leaving" ? "gone" : phase;
	}
}
