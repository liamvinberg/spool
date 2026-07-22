import { describe, expect, it } from "vitest";
import { snapMovedBox } from "./snap";

/**
 * Snap math for drag-move (#23): the dragged selection's bounding box pulls
 * onto other frames' edges and centers within a threshold, and every
 * alignment the corrected box lands on becomes a guide line.
 */

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe("snapMovedBox", () => {
	it("pulls a near-aligned left edge onto the static's left edge", () => {
		const result = snapMovedBox(box(103, 500, 100, 100), [box(100, 0, 200, 100)], 8);
		expect(result.dx).toBe(-3);
		expect(result.dy).toBe(0);
		expect(result.v).toEqual([100]);
		expect(result.h).toEqual([]);
	});

	it("snaps centers to centers", () => {
		// moving center x = 152, static center x = 155 — no edge pair in range
		const result = snapMovedBox(box(127, 500, 50, 100), [box(100, 0, 110, 100)], 8);
		expect(result.dx).toBe(3);
		expect(result.v).toEqual([155]);
	});

	it("snaps opposing edges — a right edge onto a static's left edge", () => {
		const result = snapMovedBox(box(0, 500, 96, 100), [box(100, 0, 100, 100)], 8);
		expect(result.dx).toBe(4);
		expect(result.v).toEqual([100]);
	});

	it("prefers the closest alignment when several are in range", () => {
		const result = snapMovedBox(box(103, 500, 100, 100), [box(100, 0, 100, 100), box(102, 300, 100, 100)], 8);
		expect(result.dx).toBe(-1);
		expect(result.v).toEqual([102]);
	});

	it("collapses statics sharing the winning coordinate into one guide", () => {
		const result = snapMovedBox(box(103, 500, 100, 100), [box(100, 0, 50, 100), box(100, 300, 80, 100)], 8);
		expect(result.dx).toBe(-3);
		expect(result.v).toEqual([100]);
		expect(result.h).toEqual([]);
	});

	it("snaps both axes independently", () => {
		const result = snapMovedBox(box(103, 205, 100, 100), [box(100, 200, 100, 100)], 8);
		expect(result.dx).toBe(-3);
		expect(result.dy).toBe(-5);
		expect(result.v).toEqual([100]);
		expect(result.h).toEqual([200]);
	});

	it("leaves the box alone beyond the threshold", () => {
		const result = snapMovedBox(box(120, 500, 100, 100), [box(100, 0, 100, 100)], 8);
		expect(result).toEqual({ dx: 0, dy: 0, v: [], h: [] });
	});

	it("never snaps an edge to a center or a center to an edge", () => {
		// static center x = 150; moving left edge at 147 — 3 away from the center,
		// while no edge pair or center pair is anywhere near
		const result = snapMovedBox(box(147, 500, 40, 10), [box(100, 0, 100, 100)], 8);
		expect(result.dx).toBe(0);
		expect(result.v).toEqual([]);
	});
});
