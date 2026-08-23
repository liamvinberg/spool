import { describe, expect, it } from "vitest";
import {
	BLOCK_H,
	BLOCK_W,
	bootGrid,
	type Curtain,
	MAX_CELL_W,
	MIN_CELL_W,
	nextCurtain,
	WAVE_MS,
	waveDelay,
} from "./boot-grid";

/**
 * The count is the only thing the curtain knows, so the block has to survive
 * every count a real project can have — and it has to survive them without
 * dropping any, because a block that stops counting lies about the size of the
 * project it is standing in for.
 */

const width = (count: number) => {
	const grid = bootGrid(count);
	return grid.columns * grid.cellW + (grid.columns - 1) * grid.gap;
};
const height = (count: number) => {
	const grid = bootGrid(count);
	return grid.rows * grid.cellH + (grid.rows - 1) * grid.gap;
};

describe("the block a frame count makes", () => {
	it("gives every frame a cell, at any size of project", () => {
		for (const count of [1, 2, 7, 61, 89, 400, 2000]) {
			const grid = bootGrid(count);
			expect(grid.columns * grid.rows).toBeGreaterThanOrEqual(count);
			// and no more than one spare row, or the block is mostly gap
			expect((grid.rows - 1) * grid.columns).toBeLessThan(count);
		}
	});

	it("stays inside its box rather than shrinking the cells to nothing", () => {
		for (const count of [1, 7, 61, 89, 400, 2000]) {
			expect(width(count)).toBeLessThanOrEqual(BLOCK_W);
			expect(bootGrid(count).cellW).toBeGreaterThanOrEqual(MIN_CELL_W);
			expect(bootGrid(count).cellW).toBeLessThanOrEqual(MAX_CELL_W);
		}
		// the height budget binds only once the block is deep enough to need it
		for (const count of [61, 89, 400, 2000]) {
			expect(height(count)).toBeLessThanOrEqual(BLOCK_H);
		}
	});

	it("lays a handful of frames in one row, so the count reads without a shape", () => {
		for (const count of [1, 3, 6]) {
			expect(bootGrid(count)).toMatchObject({ columns: count, rows: 1, cellW: MAX_CELL_W });
		}
		expect(bootGrid(7).rows).toBeGreaterThan(1);
	});

	it("grows the block with the project, so 400 frames never look like 40", () => {
		expect(bootGrid(400).columns * bootGrid(400).rows).toBeGreaterThan(bootGrid(40).columns * bootGrid(40).rows);
		expect(bootGrid(400).cellW).toBeLessThan(bootGrid(40).cellW);
	});
});

/**
 * The curtain only moves forward. The state that matters most is the one that
 * draws nothing: a daemon that answers inside the gate has to take the curtain
 * from `waiting` straight to `gone`, never through `showing`, or a fast boot
 * flashes something nobody asked to see.
 */
describe("the curtain's clock", () => {
	it("never draws at all when the projection beats the gate", () => {
		expect(nextCurtain("waiting", "ready")).toBe("gone");
	});

	it("fades out rather than vanishing, once it is up", () => {
		const shown = nextCurtain("waiting", "gate");
		expect(shown).toBe("showing");
		expect(nextCurtain(shown, "ready")).toBe("leaving");
		expect(nextCurtain("leaving", "exited")).toBe("gone");
	});

	it("cannot be raised again by a late signal", () => {
		const late: Curtain[] = ["leaving", "gone"];
		for (const phase of late) {
			expect(nextCurtain(phase, "gate")).toBe(phase);
			expect(nextCurtain(phase, "ready")).toBe(phase);
		}
		// the gate firing after the projection landed is the common race, and it
		// must not resurrect a curtain that was never wanted
		expect(nextCurtain("gone", "gate")).toBe("gone");
	});
});

/**
 * The band has to cross the block once per cycle whatever the block's shape.
 * Counted in fixed steps per row instead, the same delay that reads as a band
 * over eight rows reads as a slow smear over twenty.
 */
describe("the wave across the block", () => {
	it("crosses the whole block exactly once, at any size", () => {
		for (const count of [7, 61, 89, 400]) {
			const grid = bootGrid(count);
			const delays = Array.from({ length: count }, (_, index) => waveDelay(index, grid));
			expect(Math.min(...delays)).toBe(0);
			expect(Math.max(...delays)).toBeLessThanOrEqual(WAVE_MS);
			expect(Math.max(...delays)).toBeGreaterThan(WAVE_MS * 0.6);
		}
	});

	it("runs on a diagonal, so no row lights as a row", () => {
		const grid = bootGrid(61);
		const first = waveDelay(0, grid);
		const alongRow = waveDelay(1, grid);
		const downColumn = waveDelay(grid.columns, grid);
		expect(alongRow).toBeGreaterThan(first);
		expect(downColumn).toBeGreaterThan(alongRow);
	});

	it("survives a single cell rather than dividing by nothing", () => {
		expect(waveDelay(0, bootGrid(1))).toBe(0);
	});
});
