import { describe, expect, it } from "vitest";
import { bindUnits, containSize, evictions, RESIDENT_PX, textureBytes, textureFor } from "./picture-plan";

const LANDSCAPE = { width: 800, height: 533 };
const PORTRAIT = { width: 800, height: 1731 };

describe("containSize", () => {
	it("fills a frame whose shape the cover was photographed at", () => {
		expect(containSize(1200, 900, { width: 800, height: 600 })).toEqual({ w: 1200, h: 900 });
	});

	it("leaves the rounding of a photographed height showing, exactly as the image element does", () => {
		// 1200 x 800 photographs at 800 x 533: the picture stops half a unit short
		expect(containSize(1200, 800, LANDSCAPE)).toEqual({ w: 1200, h: 799.5 });
	});

	it("keeps the cover's shape in a frame resized since, like object-contain", () => {
		// wider than photographed: the height binds, the width falls short
		expect(containSize(1600, 533, LANDSCAPE)).toEqual({ w: 800, h: 533 });
		// taller: the width binds
		expect(containSize(400, 1000, LANDSCAPE)).toEqual({ w: 400, h: 266.5 });
	});
});

describe("textureFor", () => {
	it("draws an overview from the resident square", () => {
		expect(textureFor({ w: 64, h: 43 }, LANDSCAPE, 8192)).toEqual({ kind: "resident" });
		expect(textureFor({ w: RESIDENT_PX, h: RESIDENT_PX }, LANDSCAPE, 8192)).toEqual({ kind: "resident" });
	});

	it("streams the smallest halving of the cover at least as wide as the drawing", () => {
		// the mip level Chrome would have drawn the image element from
		expect(textureFor({ w: 129, h: 86 }, LANDSCAPE, 8192)).toEqual({ kind: "sharp", width: 200, height: 133 });
		expect(textureFor({ w: 200, h: 133 }, LANDSCAPE, 8192)).toEqual({ kind: "sharp", width: 200, height: 133 });
		expect(textureFor({ w: 300, h: 200 }, LANDSCAPE, 8192)).toEqual({ kind: "sharp", width: 400, height: 267 });
	});

	it("draws the cover itself once no halving is wide enough, and at 100% zoom", () => {
		expect(textureFor({ w: 480, h: 320 }, LANDSCAPE, 8192)).toEqual({ kind: "sharp", width: 800, height: 533 });
		expect(textureFor({ w: 2400, h: 1600 }, LANDSCAPE, 8192)).toEqual({ kind: "sharp", width: 800, height: 533 });
	});

	it("steps a tall picture up by its height when its width would fit the square", () => {
		// 60 wide fits 128, 130 tall does not: the square has only 128 rows to give it
		expect(textureFor({ w: 60, h: 130 }, PORTRAIT, 8192)).toEqual({ kind: "sharp", width: 200, height: 433 });
	});

	it("fits a cover taller than the GPU allows inside that limit", () => {
		expect(textureFor({ w: 800, h: 40000 }, { width: 800, height: 40000 }, 16384)).toEqual({
			kind: "sharp",
			width: 328,
			height: 16384,
		});
	});
});

describe("textureBytes", () => {
	it("counts RGBA texels, and a third more for the mip chain", () => {
		expect(textureBytes(128, 128, false)).toBe(65536);
		expect(textureBytes(128, 128, true)).toBe(87382);
	});
});

describe("bindUnits", () => {
	it("draws a page of resident pictures in one draw", () => {
		expect(bindUnits([null, null, null])).toEqual({ unit: [0, 0, 0], draws: [{ start: 0, end: 3, bound: [] }] });
	});

	it("gives each distinct sharper texture its own unit and shares one between its users", () => {
		expect(bindUnits(["a", null, "b", "a"])).toEqual({
			unit: [1, 0, 2, 1],
			draws: [{ start: 0, end: 4, bound: ["a", "b"] }],
		});
	});

	it("cuts the run where the units run out, keeping drawing order across the cut", () => {
		const { unit, draws } = bindUnits(["a", "b", null, "c", "a", "d"], 2);
		expect(draws).toEqual([
			{ start: 0, end: 3, bound: ["a", "b"] },
			{ start: 3, end: 5, bound: ["c", "a"] },
			{ start: 5, end: 6, bound: ["d"] },
		]);
		expect(unit).toEqual([1, 2, 0, 1, 2, 1]);
	});

	it("still names one empty draw for nothing to draw", () => {
		expect(bindUnits([])).toEqual({ unit: [], draws: [{ start: 0, end: 0, bound: [] }] });
	});
});

describe("evictions", () => {
	const entries = [
		{ key: "old", bytes: 40, used: 1 },
		{ key: "older", bytes: 40, used: 0 },
		{ key: "now", bytes: 40, used: 5 },
	];

	it("keeps everything that fits", () => {
		expect(evictions(entries, 120, 5)).toEqual([]);
	});

	it("lets the least recently drawn go first, only as far as the budget needs", () => {
		expect(evictions(entries, 80, 5)).toEqual(["older"]);
		expect(evictions(entries, 50, 5)).toEqual(["older", "old"]);
	});

	it("never drops a texture drawn this frame, even over budget", () => {
		expect(evictions(entries, 0, 5)).toEqual(["older", "old"]);
	});
});
