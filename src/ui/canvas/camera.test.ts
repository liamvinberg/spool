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

	it("does not move when already centered at the fit", () => {
		const fit = fitCamera(page, VW, VH);
		expect(entryCamera(fit, page, VW, VH)).toEqual(fit);
	});

	it.each([0.64, 0.68, VH / 1050])("centers a neighboring frame at zoom %s without zooming out", (k) => {
		const neighbor: Box = { x: 1500, y: 0, w: 1400, h: 1050 };
		const camera = { x: 0, y: 40, k };
		const entered = entryCamera(camera, neighbor, VW, VH);
		expect(entered.k).toBe(k);
		expect((neighbor.x + neighbor.w / 2) * k + entered.x).toBeCloseTo(VW / 2);
		expect((neighbor.y + neighbor.h / 2) * k + entered.y).toBeCloseTo(VH / 2);
	});

	it.each([
		{ w: 1400, h: 1050, k: VH / 1050 + 0.01 },
		{ w: 6000, h: 600, k: 0.3 },
	])("keeps a close-up when the frame exceeds the viewport on either axis: %o", ({ w, h, k }) => {
		const frame = { x: 0, y: 0, w, h };
		const camera = { x: -100, y: -100, k };
		expect(entryCamera(camera, frame, VW, VH)).toBe(camera);
	});

	it("centers a small frame at actual size without enlarging it", () => {
		const chip: Box = { x: 900, y: 700, w: 120, h: 90 };
		expect(entryCamera({ x: 0, y: 0, k: 1 }, chip, VW, VH)).toEqual({ x: -360, y: -345, k: 1 });
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
