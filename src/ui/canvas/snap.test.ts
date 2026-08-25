import { describe, expect, it } from "vitest";
import { runOf, snapEdge, snapMovedBox } from "./snap";

/**
 * Snap math for the hands (#23): drag-move pulls the selection's bounding box
 * onto other frames' edges and centers and its gaps onto the spacing its run
 * already keeps (#241), resize pulls the dragged edge alone. The closest
 * candidate on an axis corrects the gesture; the marks are read off the
 * corrected geometry — an alignment draws a guide line, an equal-size match
 * showing both edge lines and dropping the redundant center, and a matched
 * spacing draws a span in every gap of the run carrying that value.
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
		expect(result).toEqual({ dx: 0, dy: 0, v: [], h: [], spans: [] });
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

describe("runOf", () => {
	it("takes one pixel of perpendicular overlap as membership", () => {
		const run = runOf(box(300, 99, 100, 100), [box(0, 0, 100, 100)], "x");
		expect(run).toHaveLength(1);
	});

	it("drops a frame that only touches the perpendicular extent", () => {
		expect(runOf(box(300, 100, 100, 100), [box(0, 0, 100, 100)], "x")).toEqual([]);
	});

	it("orders the run along the axis", () => {
		const run = runOf(box(300, 0, 100, 100), [box(150, 0, 100, 100), box(0, 0, 100, 100)], "x");
		expect(run.map((b) => b.x)).toEqual([0, 150]);
	});
});

describe("snapMovedBox — equal gaps", () => {
	const row = [box(0, 0, 100, 100), box(150, 0, 100, 100)];

	it("appends a frame onto the gutter the row already keeps", () => {
		const result = snapMovedBox(box(296, 10, 100, 100), row, 8);
		expect(result.dx).toBe(4);
		expect(result.dy).toBe(0);
	});

	it("draws a span in every gap carrying the matched value", () => {
		const result = snapMovedBox(box(296, 10, 100, 100), row, 8);
		expect(result.spans).toEqual([
			{ axis: "x", from: 100, to: 150, at: 50 },
			{ axis: "x", from: 250, to: 300, at: 55 },
		]);
	});

	it("centers a frame dropped between two run members", () => {
		const result = snapMovedBox(box(198, 0, 100, 100), [box(0, 0, 100, 100), box(400, 0, 100, 100)], 8);
		expect(result.dx).toBe(2);
		expect(result.spans).toEqual([
			{ axis: "x", from: 100, to: 200, at: 50 },
			{ axis: "x", from: 300, to: 400, at: 50 },
		]);
	});

	it("keeps a one-pixel overlap in the run", () => {
		const result = snapMovedBox(box(296, 99, 100, 100), row, 8);
		expect(result.dx).toBe(4);
	});

	it("gives no gap candidates to a frame with no perpendicular overlap", () => {
		const result = snapMovedBox(box(296, 100, 100, 100), row, 8);
		expect(result.dx).toBe(0);
		expect(result.spans).toEqual([]);
	});

	it("never takes a gap from outside the dragged box's own run", () => {
		// the top row keeps 50, the bottom row 80 — 50 would be in reach, and is not offered
		const statics = [...row, box(0, 500, 100, 100), box(180, 500, 100, 100)];
		const result = snapMovedBox(box(334, 500, 100, 100), statics, 8);
		expect(result.dx).toBe(0);
		expect(result.spans).toEqual([]);
	});

	it("lets the smaller correction win between an alignment and a gap", () => {
		const result = snapMovedBox(box(296, 0, 100, 100), [...row, box(298, 300, 60, 60)], 8);
		expect(result.dx).toBe(2);
		expect(result.v).toEqual([298]);
		expect(result.spans).toEqual([]);
	});

	it("gives an exact tie to alignment", () => {
		const result = snapMovedBox(box(297, 0, 100, 100), [...row, box(294, 300, 60, 60)], 8);
		expect(result.dx).toBe(-3);
		expect(result.v).toEqual([294]);
		expect(result.spans).toEqual([]);
	});

	it("draws the guide and the spans together when the correction satisfies both", () => {
		const result = snapMovedBox(box(296, 3, 100, 100), row, 8);
		expect(result.dx).toBe(4);
		expect(result.dy).toBe(-3);
		expect(result.h).toEqual([0, 100]);
		expect(result.spans).toEqual([
			{ axis: "x", from: 100, to: 150, at: 50 },
			{ axis: "x", from: 250, to: 300, at: 50 },
		]);
	});

	it("mirrors the whole behavior on the y axis", () => {
		const column = [box(0, 0, 100, 100), box(0, 150, 100, 100)];
		const result = snapMovedBox(box(10, 296, 100, 100), column, 8);
		expect(result.dy).toBe(4);
		expect(result.dx).toBe(0);
		expect(result.spans).toEqual([
			{ axis: "y", from: 100, to: 150, at: 50 },
			{ axis: "y", from: 250, to: 300, at: 55 },
		]);
	});

	it("suppresses every correction and every mark under the platform modifier", () => {
		const result = snapMovedBox(box(296, 3, 100, 100), row, 8, { suppressed: true });
		expect(result).toEqual({ dx: 0, dy: 0, v: [], h: [], spans: [] });
	});

	it("draws no span when the gap the box lands on is the run's only one", () => {
		const result = snapMovedBox(box(150, 0, 100, 100), [box(0, 0, 100, 100)], 8);
		expect(result.spans).toEqual([]);
	});
});

describe("snapMovedBox — a run whose members miss each other", () => {
	// a tall frame joins both, so their gutter is a spacing it can reach for,
	// but the gutter itself has no shared band a bar could lie in
	const staggered = [box(0, 0, 100, 100), box(150, 200, 100, 100)];

	it("still offers a gutter kept by two frames that do not overlap each other", () => {
		expect(snapMovedBox(box(296, 0, 100, 320), staggered, 8).dx).toBe(4);
	});

	it("marks only the gap a bar can honestly sit in", () => {
		const result = snapMovedBox(box(296, 0, 100, 320), staggered, 8);
		expect(result.spans).toEqual([{ axis: "x", from: 250, to: 300, at: 250 }]);
	});
});
