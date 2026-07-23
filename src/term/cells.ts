/**
 * Terminal cell metrics (#42): the deterministic px↔cols/rows math shared by
 * the daemon (PTY size, grid stills), the canvas (cell-snapped resize, the
 * cols×rows badge), and the terminal document (fitting the emulator). All of
 * it derives from the pinned mono font: JetBrains Mono's advance width is
 * exactly 0.6 em, so 15px type gives a whole-pixel 9×18 cell — grids land on
 * device pixels at every zoom and every layer computes the same grid.
 */

export const TERM_FONT_PX = 15;
export const TERM_LINE_HEIGHT = 1.2;
export const CELL_W = 9;
export const CELL_H = 18;

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
