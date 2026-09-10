import { describe, expect, it } from "vitest";
import {
	authoredGap,
	type GapChild,
	type GapDrag,
	type GapReading,
	gapAxisOf,
	gapBands,
	gapDragSign,
	gapDragUnits,
	gapField,
	gapMoved,
	gapPaint,
	gapSample,
	gapSteppable,
	gapStyle,
	gapValuePixels,
	gapWritable,
	ownedGap,
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
	rtl: false,
	inline: false,
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

describe("which way a drag makes the gap bigger", () => {
	it("follows the flow, not the screen", () => {
		expect(gapDragSign(row())).toBe(1);
		expect(gapDragSign(row({ direction: "row-reverse" }))).toBe(-1);
		expect(gapDragSign(row({ rtl: true }))).toBe(-1);
		// both turned round is the way it started
		expect(gapDragSign(row({ direction: "row-reverse", rtl: true }))).toBe(1);
	});

	it("leaves a column's own axis alone under right-to-left", () => {
		expect(gapDragSign(column({ rtl: true }))).toBe(1);
		expect(gapDragSign(column({ direction: "column-reverse" }))).toBe(-1);
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
	it("moves a scale reference and a custom length", () => {
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
		expect(gapDragUnits("[13px]", 7, 4, false)).toBe(7);
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

	it("stops at nothing rather than stepping through zero", () => {
		expect(steppedGap("2", 8, -5)).toBe("0");
		expect(steppedGap("[6px]", 6, -20)).toBe("0");
	});

	it("moves nothing at all where it cannot move honestly", () => {
		expect(steppedGap("[var(--pad)]", 12, 2)).toBe(undefined);
	});
});

describe("what the file leaves a gap drag", () => {
	const rung = (className: string, extra: Record<string, unknown> = {}) => ({
		source: "frames/cart/frame.tsx:9:4",
		name: "div",
		className,
		path: "design/frames/cart/frame.tsx",
		line: 9,
		...extra,
	});

	it("leaves nothing until the read lands", () => {
		expect(gapWritable(undefined)).toBe(false);
	});

	it("leaves nothing on a literal no hand may write", () => {
		expect(gapWritable(rung("", { refusal: { code: "computed-class", says: "className is an expression" } }))).toBe(
			false,
		);
	});

	it("writes a class cell several uses share, which is the ordinary case", () => {
		expect(gapWritable(rung("flex gap-4", { shared: { frames: ["cart", "bag", "about"] } }))).toBe(true);
	});

	it("leaves nothing where a screen variant pins the gap", () => {
		expect(gapWritable(rung("flex md:gap-8"))).toBe(false);
	});
});

describe("what a written gap is worth on screen", () => {
	it("reads a scale reference through the project's own step", () => {
		expect(gapValuePixels("4", 4)).toBe(16);
		expect(gapValuePixels("px", 4)).toBe(1);
	});

	it("reads a custom pixel length as itself", () => {
		expect(gapValuePixels("[13px]", 4)).toBe(13);
	});

	it("reads nothing off a value only the document could resolve", () => {
		expect(gapValuePixels("[50%]", 4)).toBe(null);
		expect(gapValuePixels("[var(--pad)]", 4)).toBe(null);
	});
});

describe("what one gap gesture writes", () => {
	it("folds a shorthand into the axis it names, leaving the other alone", () => {
		expect(gapField("column-gap", "8", { scoped: "flex gap-4", theme: null })).toEqual({
			kind: "binding",
			tokens: ["gap-x-8"],
		});
		expect(gapField("row-gap", "2", { scoped: "flex gap-4", theme: null })).toEqual({
			kind: "binding",
			tokens: ["gap-y-2"],
		});
	});
});

describe("whether the class cell owns the gap the layout is using", () => {
	it("owns it where the authored value is what the document measures", () => {
		expect(ownedGap(row(), "column-gap", "flex gap-4", 4)).toBe("4");
		expect(ownedGap(row(), "column-gap", "flex gap-x-[16px]", 4)).toBe("[16px]");
	});

	it("owns nothing where the class cell authors no gap at all", () => {
		// a stylesheet or a parent rule put it there; the rail reads it for what
		// it is and a band would offer to write a pixel count nobody authored
		expect(ownedGap(row(), "column-gap", "flex", 4)).toBe(null);
	});

	it("owns nothing where something else in the cascade won", () => {
		expect(ownedGap(row(), "column-gap", "flex gap-2", 4)).toBe(null);
	});

	it("owns nothing where an inline style holds the property", () => {
		expect(ownedGap(row({ inline: true }), "column-gap", "flex gap-4", 4)).toBe(null);
	});

	it("owns nothing it could not move without renaming it", () => {
		expect(ownedGap(row(), "column-gap", "flex gap-(--pad)", 4)).toBe(null);
	});

	it("reads the axis the container actually is", () => {
		expect(ownedGap(column(), "row-gap", "flex flex-col gap-4", 4)).toBe("4");
		expect(ownedGap(column(), "row-gap", "flex flex-col gap-y-4", 4)).toBe("4");
	});
});

describe("what one drag decides", () => {
	const drag = (extra: Partial<GapDrag> = {}): GapDrag => ({
		axis: "column-gap",
		index: 0,
		band: { x: 40, y: 0, w: 16, h: 20 },
		sign: 1,
		from: { x: 100, y: 100 },
		authored: "4",
		measured: 16,
		units: 0,
		live: null,
		...extra,
	});

	it("is still a click until the pointer has travelled", () => {
		expect(gapSample(drag(), { x: 102, y: 100 }, false, 1, 4, 3)).toBe(null);
	});

	it("reads the pointer along its own axis, in the document's pixels", () => {
		expect(gapSample(drag(), { x: 116, y: 100 }, false, 1, 4, 3)).toEqual({ units: 4, live: "8" });
		// the same travel under a doubled camera is half as far in the document
		expect(gapSample(drag(), { x: 116, y: 100 }, false, 2, 4, 3)).toEqual({ units: 2, live: "6" });
		// movement across the axis is not this drag's
		expect(gapSample(drag(), { x: 100, y: 140 }, false, 1, 4, 3)).toBe(null);
	});

	it("follows the flow when it runs backwards", () => {
		expect(gapSample(drag({ sign: -1 }), { x: 84, y: 100 }, false, 1, 4, 3)).toEqual({ units: 4, live: "8" });
	});

	it("samples nothing where the value has not moved", () => {
		expect(gapSample(drag({ units: 4, live: "8" }), { x: 116, y: 100 }, false, 1, 4, 3)).toBe(null);
	});

	it("draws the band the size the value makes, and reads it in pixels", () => {
		expect(gapPaint(drag({ units: 4, live: "8" }), 4)).toEqual({
			band: { x: 40, y: 0, w: 32, h: 20 },
			says: "32px",
		});
		// a column grows across the other axis
		expect(gapPaint(drag({ axis: "row-gap", band: { x: 0, y: 20, w: 40, h: 16 }, units: 4, live: "8" }), 4)).toEqual({
			band: { x: 0, y: 20, w: 40, h: 32 },
			says: "32px",
		});
	});

	it("leaves the band where it was grabbed for a value only the document resolves", () => {
		expect(gapPaint(drag({ authored: "[50%]", units: 1, live: "[51%]" }), 4)).toEqual({
			band: { x: 40, y: 0, w: 16, h: 20 },
			says: "[51%]",
		});
	});

	it("wears the space it is making on the one axis it grabbed", () => {
		expect(gapStyle(drag({ units: 4, live: "8" }), 4)).toEqual({ "column-gap": "32px" });
		expect(gapStyle(drag({ axis: "row-gap", units: 4, live: "8" }), 4)).toEqual({ "row-gap": "32px" });
		// a gap authored in its own unit previews in that unit rather than in pixels
		expect(gapStyle(drag({ authored: "[1rem]", units: 1, live: "[2rem]" }), 4)).toEqual({
			"column-gap": "2rem",
		});
		// `px` is Tailwind's own name for one pixel
		expect(gapStyle(drag({ authored: "px", units: 0, live: "px" }), 4)).toEqual({ "column-gap": "1px" });
		// a percentage the band cannot draw is still a gap the element can wear
		expect(gapStyle(drag({ authored: "[50%]", units: 1, live: "[51%]" }), 4)).toEqual({
			"column-gap": "51%",
		});
		// nothing before the first sample, and nothing that is not a length
		expect(gapStyle(drag(), 4)).toBe(null);
		expect(gapStyle(drag({ authored: "(--gap)", units: 1, live: "(--gap)" }), 4)).toBe(null);
	});

	it("has nothing to save until it moved a step", () => {
		expect(gapMoved(drag())).toBe(false);
		expect(gapMoved(drag({ units: 0, live: "4" }))).toBe(false);
		expect(gapMoved(drag({ units: 4, live: "8" }))).toBe(true);
	});
});
