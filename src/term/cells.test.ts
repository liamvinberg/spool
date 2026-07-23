import { describe, expect, it } from "vitest";
import {
	CELL_H,
	CELL_W,
	cellsForPx,
	cellsForViewport,
	DEFAULT_COLS,
	DEFAULT_ROWS,
	MIN_COLS,
	MIN_ROWS,
	pxForCells,
	snapPxToCells,
} from "./cells";

describe("cell metrics", () => {
	it("pins integer cell dimensions so grids land on whole pixels", () => {
		expect(Number.isInteger(CELL_W)).toBe(true);
		expect(Number.isInteger(CELL_H)).toBe(true);
	});

	it("births terminal frames at the conventional 80×24 floor", () => {
		expect(DEFAULT_COLS).toBe(80);
		expect(DEFAULT_ROWS).toBe(24);
	});
});

describe("pxForCells", () => {
	it("maps a grid to its exact pixel box", () => {
		expect(pxForCells(80, 24)).toEqual({ w: 80 * CELL_W, h: 24 * CELL_H });
	});

	it("round-trips with cellsForPx on every whole grid", () => {
		const { w, h } = pxForCells(132, 43);
		expect(cellsForPx(w, h)).toEqual({ cols: 132, rows: 43 });
	});
});

describe("cellsForPx", () => {
	it("reports the whole-cell grid that fits inside a pixel box", () => {
		const { w, h } = pxForCells(80, 24);
		expect(cellsForPx(w + CELL_W - 1, h + CELL_H - 1)).toEqual({ cols: 80, rows: 24 });
	});

	it("never reports a grid below the floor, even for a tiny box", () => {
		expect(cellsForPx(1, 1)).toEqual({ cols: MIN_COLS, rows: MIN_ROWS });
	});
});

describe("cellsForViewport", () => {
	it("reads a chrome-shaved viewport as the authored grid — a border must not cost a cell", () => {
		// a 100×57 sidecar box behind a 1px border-box border: 2px short each way
		const authored = pxForCells(100, 57);
		expect(cellsForViewport(authored.w - 2, authored.h - 2)).toEqual({ cols: 100, rows: 57 });
		expect(cellsForViewport(authored.w, authored.h)).toEqual({ cols: 100, rows: 57 });
	});

	it("agrees with the daemon's sidecar derivation even for a non-cell-aligned box", () => {
		// a stale sidecar authored under older metrics: both ends floor to 21 rows
		expect(cellsForPx(720, 432).rows).toBe(21);
		expect(cellsForViewport(718, 430).rows).toBe(21);
	});

	it("still reads a genuinely smaller viewport as the grid that fits it", () => {
		expect(cellsForViewport(714, 421)).toEqual({ cols: 79, rows: 21 });
	});

	it("never reports a grid below the floor", () => {
		expect(cellsForViewport(1, 1)).toEqual({ cols: MIN_COLS, rows: MIN_ROWS });
	});
});

describe("snapPxToCells", () => {
	it("snaps a dragged box to the nearest whole-cell multiple", () => {
		const exact = pxForCells(81, 25);
		expect(snapPxToCells(exact.w - 2, exact.h + 3)).toEqual({ ...exact, cols: 81, rows: 25 });
	});

	it("rounds half a cell up", () => {
		const { w } = pxForCells(80, 24);
		const snapped = snapPxToCells(w + Math.ceil(CELL_W / 2), CELL_H * 24);
		expect(snapped.cols).toBe(81);
	});

	it("clamps below the floor to the smallest legible terminal", () => {
		expect(snapPxToCells(4, 4)).toEqual({ ...pxForCells(MIN_COLS, MIN_ROWS), cols: MIN_COLS, rows: MIN_ROWS });
	});
});
