import { describe, expect, it } from "vitest";
import { lineBoxes } from "./ring";

describe("the boxes a ring is drawn from", () => {
	const box = { x: 0, y: 0, w: 200, h: 48 };

	it("draws the element's own box when it is drawn as one", () => {
		expect(lineBoxes({ rect: box })).toEqual([box]);
		expect(lineBoxes({ rect: box, rects: [box] })).toEqual([box]);
	});

	it("draws a ring per line rather than the box around every line at once", () => {
		// a span that wraps: the second line is short, and the box around both
		// reaches across words that belong to its neighbours
		expect(
			lineBoxes({
				rect: box,
				rects: [
					{ x: 60, y: 0, w: 140, h: 24 },
					{ x: 0, y: 24, w: 90, h: 24 },
				],
			}),
		).toEqual([
			{ x: 60, y: 0, w: 140, h: 24 },
			{ x: 0, y: 24, w: 90, h: 24 },
		]);
	});

	it("draws two boxes on one line as the one line they are", () => {
		// an inline element broken by a nested tag: one line, one ring, no seam
		expect(
			lineBoxes({
				rect: box,
				rects: [
					{ x: 0, y: 4, w: 40, h: 16 },
					{ x: 44, y: 2, w: 60, h: 20 },
					{ x: 0, y: 24, w: 30, h: 20 },
				],
			}),
		).toEqual([
			{ x: 0, y: 2, w: 104, h: 20 },
			{ x: 0, y: 24, w: 30, h: 20 },
		]);
	});
});
