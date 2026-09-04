import { describe, expect, it } from "vitest";
import {
	bandsFor,
	clampPageAspect,
	composePage,
	DEFAULT_FRAME_AREA,
	FOLD_GUTTER,
	fitComposition,
	medianFrameArea,
	PAGE_ASPECT_HIGH,
	PAGE_ASPECT_LOW,
	pageBox,
	type Rect,
	SHELF_GUTTER,
	shelfPages,
} from "./page-box";

/**
 * The shape law a page object is drawn under (#265), asked directly.
 *
 * The two rules it exists for are the two this checks: a page's size says how
 * much is in it, and a page's shape is its own within a band. The numbers here
 * are this repository's real ones — `booting` at 23:1, `directing` at one frame
 * against `agent` at twenty-seven — because those are the cases that broke true
 * aspect.
 */

/** frames in one long row, the shape `booting` actually has */
function row(count: number, gap = 1600): Rect[] {
	return Array.from({ length: count }, (_, at) => ({ x: at * gap, y: 0, w: 1440, h: 900 }));
}

describe("composing a page's frames", () => {
	it("has nothing to draw for a page with no frames anywhere", () => {
		expect(composePage([])).toEqual({ frames: [], w: 0, h: 0, bands: 1 });
	});

	it("moves the frames to their own origin and leaves them where they are", () => {
		const composed = composePage([
			{ x: 400, y: 300, w: 100, h: 100 },
			{ x: 600, y: 500, w: 100, h: 100 },
		]);
		expect(composed.bands).toBe(1);
		expect(composed.frames).toEqual([
			{ x: 0, y: 0, w: 100, h: 100 },
			{ x: 200, y: 200, w: 100, h: 100 },
		]);
		expect(composed).toMatchObject({ w: 300, h: 300 });
	});

	it("leaves a page just inside the fold threshold alone", () => {
		// 2.5:1 — long, and still a picture of where the frames are
		const composed = composePage([{ x: 0, y: 0, w: 2500, h: 1000 }]);
		expect(composed.bands).toBe(1);
	});

	it("folds a long page into bands in x order, each band on its own origin", () => {
		const composed = composePage(row(4, 2000));
		// 7440 x 900 is 8.3:1, which asks for three bands and can only fill two:
		// the runs are equal counts, so four frames are two of two
		expect(composed.bands).toBe(2);
		expect(composed.frames).toEqual([
			{ x: 0, y: 0, w: 1440, h: 900 },
			{ x: 2000, y: 0, w: 1440, h: 900 },
			{ x: 0, y: 900 + FOLD_GUTTER, w: 1440, h: 900 },
			{ x: 2000, y: 900 + FOLD_GUTTER, w: 1440, h: 900 },
		]);
		expect(composed).toMatchObject({ w: 3440, h: 900 * 2 + FOLD_GUTTER });
	});

	it("folds a twenty-frame row into a sheet that is no longer a hairline", () => {
		const composed = composePage(row(20));
		expect(composed.bands).toBe(bandsFor((19 * 1600 + 1440) / 900));
		expect(composed.frames).toHaveLength(20);
		expect(composed.w / composed.h).toBeLessThan(4);
	});

	it("never folds into fewer than two bands", () => {
		expect(bandsFor(2.7)).toBe(2);
		expect(bandsFor(1000)).toBeGreaterThan(2);
	});
});

describe("the median area a page is sized against", () => {
	it("is what an unsized frame is where the field holds no frames", () => {
		expect(medianFrameArea([])).toBe(DEFAULT_FRAME_AREA);
	});

	it("is the middle frame's area, so one huge neighbour does not set the scale", () => {
		expect(
			medianFrameArea([
				{ w: 10, h: 10 },
				{ w: 20, h: 20 },
				{ w: 5000, h: 5000 },
			]),
		).toBe(400);
	});

	it("splits the difference across an even field", () => {
		expect(
			medianFrameArea([
				{ w: 10, h: 10 },
				{ w: 20, h: 20 },
			]),
		).toBe(250);
	});
});

describe("the box a page occupies", () => {
	it("draws a page holding one frame exactly one frame big", () => {
		const composed = composePage([{ x: 0, y: 0, w: 1440, h: 900 }]);
		expect(pageBox(composed, DEFAULT_FRAME_AREA, 1)).toEqual({ w: 1440, h: 900 });
	});

	it("grows on the square root of the count, so forty-five is about two and a half times wider", () => {
		const composed = composePage([{ x: 0, y: 0, w: 1440, h: 900 }]);
		const one = pageBox(composed, DEFAULT_FRAME_AREA, 1);
		const many = pageBox(composed, DEFAULT_FRAME_AREA, 45);
		expect(many.w / one.w).toBeCloseTo(2.59, 1);
	});

	it("outranks a page of one frame by a page of twenty-seven, whatever their shapes", () => {
		const oneFrame = composePage([{ x: 0, y: 0, w: 1440, h: 900 }]);
		const twentySeven = composePage(row(27));
		const small = pageBox(oneFrame, DEFAULT_FRAME_AREA, 1);
		const large = pageBox(twentySeven, DEFAULT_FRAME_AREA, 27);
		expect(large.w * large.h).toBeGreaterThan(small.w * small.h);
	});

	it("bands the shape, so a hairline page still reads", () => {
		const wide = pageBox({ frames: [], w: 23000, h: 1000, bands: 1 }, DEFAULT_FRAME_AREA, 20);
		expect(wide.w / wide.h).toBeCloseTo(PAGE_ASPECT_HIGH, 2);
		const tall = pageBox({ frames: [], w: 1000, h: 9000, bands: 1 }, DEFAULT_FRAME_AREA, 20);
		expect(tall.w / tall.h).toBeCloseTo(PAGE_ASPECT_LOW, 2);
	});

	it("reads the field it stands on, so a page of small frames stays small", () => {
		const composed = composePage([{ x: 0, y: 0, w: 800, h: 1000 }]);
		expect(pageBox(composed, 800 * 1000, 1)).toEqual({ w: 800, h: 1000 });
	});

	/** A phone is 0.46:1, outside the band — the box says so rather than lying. */
	it("bands a page of phones and keeps its area", () => {
		const composed = composePage([{ x: 0, y: 0, w: 390, h: 844 }]);
		const box = pageBox(composed, 390 * 844, 1);
		expect(box.w / box.h).toBeCloseTo(PAGE_ASPECT_LOW, 2);
		expect(box.w * box.h).toBeCloseTo(390 * 844, -3);
	});

	/** Nothing to measure is not the same fact as a very tall page. */
	it("draws a page holding nothing anywhere at the shape of an unsized frame", () => {
		expect(clampPageAspect(0)).toBeCloseTo(1440 / 900, 5);
		expect(pageBox(composePage([]), DEFAULT_FRAME_AREA, 0)).toEqual({ w: 1440, h: 900 });
	});
});

describe("fitting the composition into its box", () => {
	it("puts the picture inside whole and centres what the band left over", () => {
		const composed = composePage([{ x: 0, y: 0, w: 1000, h: 1000 }]);
		const fitted = fitComposition(composed, { w: 500, h: 1000 });
		expect(fitted.scale).toBe(0.5);
		expect(fitted.dx).toBe(0);
		expect(fitted.dy).toBe(250);
	});

	it("has nothing to fit when the page holds nothing", () => {
		expect(fitComposition(composePage([]), { w: 400, h: 400 })).toEqual({ scale: 1, dx: 0, dy: 0 });
	});
});

describe("the shelf a page of pages stands on", () => {
	it("has nowhere to put nothing", () => {
		expect(shelfPages([])).toEqual([]);
	});

	it("starts at the gutter and runs the pages along one line in the order given", () => {
		const boxes = [
			{ w: 1000, h: 600 },
			{ w: 800, h: 500 },
		];
		expect(shelfPages(boxes)).toEqual([
			{ x: SHELF_GUTTER, y: SHELF_GUTTER },
			{ x: SHELF_GUTTER + 1000 + SHELF_GUTTER, y: SHELF_GUTTER },
		]);
	});

	it("wraps twelve pages into rows rather than one line, each row under the tallest of the last", () => {
		const boxes = Array.from({ length: 12 }, (_, at) => ({ w: 1000, h: at === 0 ? 900 : 600 }));
		const places = shelfPages(boxes);
		const rows = new Set(places.map((at) => at.y));
		expect(rows.size).toBeGreaterThan(1);
		expect(rows.size).toBeLessThan(12);
		// the second row clears the first by the tallest page on it, plus room for
		// a label that scales with the row rather than with the gutter
		const second = [...rows].sort((a, b) => a - b)[1];
		expect(second).toBe(SHELF_GUTTER + 900 + Math.round(900 * 0.14));
		// the block reads as a block: wider than tall, but nowhere near a hairline
		const w = Math.max(...places.map((at, i) => at.x + (boxes[i]?.w ?? 0)));
		const h = Math.max(...places.map((at, i) => at.y + (boxes[i]?.h ?? 0)));
		expect(w / h).toBeGreaterThan(1);
		expect(w / h).toBeLessThan(3);
	});

	it("never breaks a row before its first page, however wide that page is", () => {
		const places = shelfPages([
			{ w: 9000, h: 100 },
			{ w: 100, h: 100 },
		]);
		expect(places[0]).toEqual({ x: SHELF_GUTTER, y: SHELF_GUTTER });
		// a short row still clears by at least the gutter
		expect(places[1]?.y).toBe(SHELF_GUTTER + 100 + SHELF_GUTTER);
	});
});
