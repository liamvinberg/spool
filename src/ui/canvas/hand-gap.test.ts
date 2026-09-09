import { describe, expect, it } from "vitest";
import {
	authoredGap,
	gapAxisOf,
	gapBands,
	gapDragUnits,
	type GapChild,
	type GapReading,
	gapSteppable,
	steppedGap,
} from "./hand-gap";

/**
 * Gap by handle (#306), as decisions over the document's own facts.
 *
 * Which gaps a handle may stand in, which axis one drag writes, and what a
 * pointer's pixels come to on the scale the value already sits on. Nothing
 * here measures anything: the frame answers with the boxes, and these are the
 * rules read over them.
 */

const child = (x: number, y: number, w: number, h: number, extra: Partial<GapChild> = {}): GapChild => ({
	box: { x, y, w, h },
	out: false,
	displaced: false,
	...extra,
});

/** A row of three 40x20 boxes with a 16px gap between each pair. */
const row = (extra: Partial<GapReading> = {}): GapReading => ({
	display: "flex",
	direction: "row",
	wrap: "nowrap",
	justify: "flex-start",
	writing: "horizontal-tb",
	columnGap: "16px",
	rowGap: "16px",
	ambiguous: false,
	children: [child(0, 0, 40, 20), child(56, 0, 40, 20), child(112, 0, 40, 20)],
	...extra,
});

/** The same three boxes stacked, a column with a 16px row gap. */
const column = (extra: Partial<GapReading> = {}): GapReading =>
	row({
		direction: "column",
		children: [child(0, 0, 40, 20), child(0, 36, 40, 20), child(0, 72, 40, 20)],
		...extra,
	});

describe("which axis a container's gap is", () => {
	it("reads a row as the column gap and a column as the row gap", () => {
		expect(gapAxisOf(row())).toBe("column-gap");
		expect(gapAxisOf(column())).toBe("row-gap");
	});

	it("reads a reversed direction as the same axis", () => {
		expect(gapAxisOf(row({ direction: "row-reverse" }))).toBe("column-gap");
		expect(gapAxisOf(column({ direction: "column-reverse" }))).toBe("row-gap");
	});

	it("has no axis where the layout is not flex, or is not written across", () => {
		expect(gapAxisOf(row({ display: "grid" }))).toBe(null);
		expect(gapAxisOf(row({ display: "block" }))).toBe(null);
		expect(gapAxisOf(row({ writing: "vertical-rl" }))).toBe(null);
		expect(gapAxisOf(row({ display: "inline-flex" }))).toBe("column-gap");
	});
});

describe("where a handle may stand", () => {
	it("stands between each pair of a single-line row", () => {
		expect(gapBands(row(), 1)).toEqual([
			{ x: 40, y: 0, w: 16, h: 20 },
			{ x: 96, y: 0, w: 16, h: 20 },
		]);
	});

	it("stands across the column's own axis", () => {
		expect(gapBands(column(), 1)).toEqual([
			{ x: 0, y: 20, w: 40, h: 16 },
			{ x: 0, y: 56, w: 40, h: 16 },
		]);
	});

	it("reads a reversed or right-to-left row off the boxes themselves", () => {
		// the same three boxes laid the other way: adjacency is geometric, so the
		// bands are the same two spaces however the writing order runs
		const laid = row({
			direction: "row-reverse",
			children: [child(112, 0, 40, 20), child(56, 0, 40, 20), child(0, 0, 40, 20)],
		});
		expect(gapBands(laid, 1)).toEqual([
			{ x: 40, y: 0, w: 16, h: 20 },
			{ x: 96, y: 0, w: 16, h: 20 },
		]);
	});

	it("stands nowhere on a wrapped or distributed layout", () => {
		expect(gapBands(row({ wrap: "wrap" }), 1)).toEqual([]);
		expect(gapBands(row({ justify: "space-between" }), 1)).toEqual([]);
		expect(gapBands(row({ justify: "space-around" }), 1)).toEqual([]);
	});

	it("stands nowhere the container's own geometry is ambiguous", () => {
		expect(gapBands(row({ ambiguous: true }), 1)).toEqual([]);
	});

	it("stands nowhere a child carries a margin or a transform of its own", () => {
		const margined = row({
			children: [child(0, 0, 40, 20), child(66, 0, 40, 20, { displaced: true }), child(122, 0, 40, 20)],
		});
		expect(gapBands(margined, 1)).toEqual([]);
	});

	it("stands nowhere the measured distance is not the gap alone", () => {
		// an absolutely placed child between the two leaves a distance the gap
		// does not account for: no band, rather than one naming the wrong space
		const crowded = row({ children: [child(0, 0, 40, 20), child(72, 0, 40, 20), child(128, 0, 40, 20)] });
		expect(gapBands(crowded, 1)).toEqual([]);
	});

	it("passes over an out-of-flow child rather than refusing the container", () => {
		const floated = row({
			children: [child(0, 0, 40, 20), child(20, 40, 10, 10, { out: true }), child(56, 0, 40, 20)],
		});
		expect(gapBands(floated, 1)).toEqual([{ x: 40, y: 0, w: 16, h: 20 }]);
	});

	it("stands nowhere a gap is too small to grab, at this zoom", () => {
		const thin = row({
			columnGap: "4px",
			children: [child(0, 0, 40, 20), child(44, 0, 40, 20), child(88, 0, 40, 20)],
		});
		expect(gapBands(thin, 1)).toEqual([]);
		// the same gap under a magnified camera is a target a pointer can hit
		expect(gapBands(thin, 2)).toEqual([
			{ x: 40, y: 0, w: 4, h: 20 },
			{ x: 84, y: 0, w: 4, h: 20 },
		]);
	});

	it("stands nowhere a gap has no length at all", () => {
		expect(gapBands(row({ columnGap: "normal" }), 1)).toEqual([]);
		expect(gapBands(row({ columnGap: "10%" }), 1)).toEqual([]);
	});

	it("skips a pair with too little of the crossing edge to draw on", () => {
		const sliver = row({
			children: [child(0, 0, 40, 20), child(56, 19, 40, 20), child(112, 19, 40, 20)],
		});
		expect(gapBands(sliver, 1)).toEqual([{ x: 96, y: 19, w: 16, h: 20 }]);
	});
});

describe("what the element authors on that axis", () => {
	it("reads the axis half and the shorthand alike", () => {
		expect(authoredGap("flex gap-4", "column-gap")).toBe("4");
		expect(authoredGap("flex gap-4", "row-gap")).toBe("4");
		expect(authoredGap("flex gap-x-6 gap-4", "column-gap")).toBe("6");
		expect(authoredGap("flex gap-x-6 gap-4", "row-gap")).toBe("4");
	});

	it("reads nothing where the class cell sets no gap", () => {
		expect(authoredGap("flex", "column-gap")).toBe(null);
	});

	it("reads the base scope, never a screen variant's", () => {
		expect(authoredGap("flex md:gap-8", "column-gap")).toBe(null);
	});
});

describe("what a drag may move", () => {
	it("moves a scale reference, a custom length and an unset gap", () => {
		expect(gapSteppable(null)).toBe(true);
		expect(gapSteppable("4")).toBe(true);
		expect(gapSteppable("[13px]")).toBe(true);
		expect(gapSteppable("[50%]")).toBe(true);
		expect(gapSteppable("px")).toBe(true);
	});

	it("leaves an expression it cannot move without renaming it", () => {
		expect(gapSteppable("[var(--pad)]")).toBe(false);
		expect(gapSteppable("(--pad)")).toBe(false);
	});
});

describe("what a pointer's pixels come to", () => {
	it("counts a scale reference in whole steps of the project's own scale", () => {
		expect(gapDragUnits("4", 16, 4, false)).toBe(4);
		expect(gapDragUnits("4", 6, 4, false)).toBe(2);
		expect(gapDragUnits("4", -16, 4, false)).toBe(-4);
	});

	it("counts a custom length in document pixels", () => {
		expect(gapDragUnits("[13px]", 16, 4, false)).toBe(16);
		expect(gapDragUnits(null, 7, 4, false)).toBe(7);
	});

	it("moves in tens while the coarse modifier is held", () => {
		expect(gapDragUnits("4", 60, 4, true)).toBe(20);
		expect(gapDragUnits("4", 12, 4, true)).toBe(0);
		expect(gapDragUnits("[13px]", 47, 4, true)).toBe(50);
	});
});

describe("the value a drag settles on", () => {
	it("keeps a scale reference on the scale", () => {
		expect(steppedGap("4", 16, 2)).toBe("6");
	});

	it("keeps a custom length in its own unit", () => {
		expect(steppedGap("[13px]", 13, 2)).toBe("[15px]");
		expect(steppedGap("[50%]", 0, 1)).toBe("[51%]");
		expect(steppedGap("[13.5px]", 13.5, 1)).toBe("[14.5px]");
	});

	it("writes what an unset gap measures, in pixels", () => {
		expect(steppedGap(null, 20, 4)).toBe("[24px]");
	});

	it("stops at nothing rather than stepping through zero", () => {
		expect(steppedGap("2", 8, -5)).toBe("0");
		expect(steppedGap("[6px]", 6, -20)).toBe("0");
	});

	it("moves nothing at all where it cannot move honestly", () => {
		expect(steppedGap("[var(--pad)]", 12, 2)).toBe(undefined);
	});
});
