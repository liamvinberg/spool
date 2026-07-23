/**
 * Terminal cell metrics (#42): the deterministic px↔cols/rows math shared by
 * the daemon (PTY size, grid stills), the canvas (cell-snapped resize, the
 * cols×rows badge), and the terminal document (fitting the emulator). All of
 * it derives from the pinned mono font, matching what the emulator really
 * paints: JetBrains Mono's advance is exactly 0.6 em (15px type → 9px cells
 * across) and its line box is 1.32 em (19.8px, ceiled to 20 by the renderer)
 * — so the emulator runs at the font's natural line height and every layer
 * computes the same whole-pixel 9×20 cell.
 */

export const TERM_FONT_PX = 15;
export const TERM_LINE_HEIGHT = 1;
export const CELL_W = 9;
export const CELL_H = 20;

/** The conventional floor terminals are designed at — new frames start here. */
export const DEFAULT_COLS = 80;
export const DEFAULT_ROWS = 24;

/** The smallest terminal that still reads as one. */
export const MIN_COLS = 10;
export const MIN_ROWS = 3;

export interface CellGrid {
	cols: number;
	rows: number;
}

/** The whole-cell grid that fits inside a pixel box, never below the floor. */
export function cellsForPx(w: number, h: number): CellGrid {
	return {
		cols: Math.max(MIN_COLS, Math.floor(w / CELL_W)),
		rows: Math.max(MIN_ROWS, Math.floor(h / CELL_H)),
	};
}

/** Hosting chrome shaves this much off the authored box (a border-box border,
 * a rounding) — a viewport within it still stands for the authored grid. */
const VIEWPORT_SHAVE_PX = 4;

/**
 * The grid a document viewport stands for. A frame document's viewport is the
 * authored box minus chrome shave, and flooring the shaved size would cost a
 * whole cell — so every surface, whatever its chrome, converges on the grid
 * the daemon derives from the sidecar itself.
 */
export function cellsForViewport(w: number, h: number): CellGrid {
	return cellsForPx(w + VIEWPORT_SHAVE_PX, h + VIEWPORT_SHAVE_PX);
}

/** The exact pixel box of a grid. */
export function pxForCells(cols: number, rows: number): { w: number; h: number } {
	return { w: cols * CELL_W, h: rows * CELL_H };
}

/** Snap a dragged pixel box to the nearest whole-cell grid, floor-clamped. */
export function snapPxToCells(w: number, h: number): { w: number; h: number; cols: number; rows: number } {
	const cols = Math.max(MIN_COLS, Math.round(w / CELL_W));
	const rows = Math.max(MIN_ROWS, Math.round(h / CELL_H));
	return { ...pxForCells(cols, rows), cols, rows };
}
