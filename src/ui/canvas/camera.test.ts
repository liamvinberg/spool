import { describe, expect, it } from "vitest";
import { type Box, entryCamera, fitCamera } from "./camera";

/** A tall page: taller than any viewport, the frame the old fit hurt most. */
const page: Box = { x: 0, y: 0, w: 800, h: 6000 };
const VW = 1200;
const VH = 800;

describe("entryCamera", () => {
	it("fits when the frame is smaller on screen than a fit would make it", () => {
		const far = { x: 0, y: 0, k: 0.05 };
		expect(entryCamera(far, page, VW, VH)).toEqual(fitCamera(page, VW, VH));
	});

	it("leaves the camera alone when already zoomed past a fit", () => {
		const fit = fitCamera(page, VW, VH);
		const read = { x: -100, y: -4000, k: fit.k * 8 };
		expect(entryCamera(read, page, VW, VH)).toBe(read);
	});

	it("does not move at the fit itself, so there is no cliff either side of it", () => {
		const fit = fitCamera(page, VW, VH);
		expect(entryCamera(fit, page, VW, VH)).toBe(fit);
	});

	it("pans at the current zoom when the target is off screen entirely", () => {
		const fit = fitCamera(page, VW, VH);
		const elsewhere = { x: 40_000, y: 40_000, k: fit.k * 4 };
		const entered = entryCamera(elsewhere, page, VW, VH);
		expect(entered.k).toBe(elsewhere.k);
		// centered: the frame's middle sits at the viewport's middle
		expect((page.x + page.w / 2) * entered.k + entered.x).toBeCloseTo(VW / 2);
		expect((page.y + page.h / 2) * entered.k + entered.y).toBeCloseTo(VH / 2);
	});

	it("still fits a small frame entered from far out, never past 100%", () => {
		const chip: Box = { x: 900, y: 900, w: 120, h: 90 };
		const entered = entryCamera({ x: 0, y: 0, k: 0.1 }, chip, VW, VH);
		expect(entered.k).toBe(1);
	});
});
