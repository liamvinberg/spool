import { describe, expect, it } from "vitest";
import { fitBox } from "./fit";

describe("fitting a frame into a viewport", () => {
	it("scales a frame down to whichever axis runs out first", () => {
		expect(fitBox(1000, 500, 500, 500).scale).toBe(0.5);
		expect(fitBox(500, 1000, 500, 500).scale).toBe(0.5);
	});

	it("never scales a frame past the size it was authored at", () => {
		expect(fitBox(390, 844, 3000, 3000)).toEqual({ scale: 1, x: 1305, y: 1078 });
	});

	it("centres what it fits, so bars are only ever aspect mismatch", () => {
		// 1600×900 viewport, 390×1200 frame: it fits by height, and the bars it
		// leaves are entirely horizontal.
		const { scale, x, y } = fitBox(390, 1200, 1600, 900);
		expect(scale).toBeCloseTo(900 / 1200, 12);
		expect(y).toBeCloseTo(0, 12);
		expect(x).toBeCloseTo((1600 - 390 * scale) / 2, 12);
	});

	it("takes its breathing room off the fit and still centres in the whole viewport", () => {
		const inset = fitBox(1000, 1000, 1128, 1128, { inset: 128 });
		expect(inset.scale).toBe(1);
		expect(inset.x).toBe(64);
	});

	it("floors the scale, so an enormous fit still lands somewhere holdable", () => {
		expect(fitBox(1_000_000, 1_000_000, 800, 600, { minScale: 0.02 }).scale).toBe(0.02);
	});
});
