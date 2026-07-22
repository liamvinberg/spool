import { describe, expect, it } from "vitest";
import { snapEdge, snapMovedBox } from "./snap";

/**
 * Snap math for the hands (#23): drag-move pulls the selection's bounding box
 * onto other frames' edges and centers, resize pulls the dragged edge alone.
 * The closest alignment corrects the gesture; every alignment the corrected
 * geometry lands on becomes a guide line — an equal-size match shows both
 * edge lines and drops the redundant center, the Figma pattern.
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
		const result = snapMovedBox(box(103, 500, 100, 100), [box(100, 0, 100, 100), box(102, 300, 90, 100)], 8);
		expect(result.dx).toBe(-1);
		expect(result.v).toEqual([102]);
	});

	it("collapses statics sharing the winning coordinate into one guide", () => {
		const result = snapMovedBox(box(103, 500, 100, 100), [box(100, 0, 50, 100), box(100, 300, 80, 100)], 8);
		expect(result.dx).toBe(-3);
		expect(result.v).toEqual([100]);
		expect(result.h).toEqual([]);
	});

	it("shows every edge alignment an equal-size match lands on", () => {
		// same width and height: both edges align on both axes — two lines per
		// axis, stable, with the coincident center line dropped as redundant
		const result = snapMovedBox(box(103, 205, 100, 100), [box(100, 200, 100, 100)], 8);
		expect(result.dx).toBe(-3);
		expect(result.dy).toBe(-5);
		expect(result.v).toEqual([100, 200]);
		expect(result.h).toEqual([200, 300]);
	});

	it("keeps top and bottom lines steady while dragging an equal-height neighbor", () => {
		const result = snapMovedBox(box(320, 103, 200, 100), [box(0, 100, 300, 100)], 8);
		expect(result.dy).toBe(-3);
		expect(result.h).toEqual([100, 200]);
		expect(result.v).toEqual([]);
	});

	it("snaps only the closer edge of a nearly equal height", () => {
		// heights 100 vs 102: the bottoms are closer, the tops miss — one line
		const result = snapMovedBox(box(320, 103, 200, 100), [box(0, 100, 300, 102)], 8);
		expect(result.dy).toBe(-1);
		expect(result.h).toEqual([202]);
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

describe("snapEdge", () => {
	it("pulls the dragged edge onto the nearest stop", () => {
		expect(snapEdge(103, [box(100, 0, 50, 50)], "x", 8)).toEqual({ value: 100, guides: [100] });
	});

	it("snaps to a static's center as well as its edges", () => {
		expect(snapEdge(126, [box(100, 0, 50, 50)], "x", 8)).toEqual({ value: 125, guides: [125] });
	});

	it("reads heights on the y axis", () => {
		expect(snapEdge(206, [box(0, 100, 50, 100)], "y", 8)).toEqual({ value: 200, guides: [200] });
	});

	it("leaves the edge alone beyond the threshold", () => {
		// stops sit at 100/125/150 — 137 misses all three by more than 8
		expect(snapEdge(137, [box(100, 0, 50, 50)], "x", 8)).toEqual({ value: 137, guides: [] });
	});

	it("collapses statics sharing the stop into one guide", () => {
		const result = snapEdge(98, [box(100, 0, 50, 50), box(100, 300, 80, 60)], "x", 8);
		expect(result).toEqual({ value: 100, guides: [100] });
	});
});
