import { describe, expect, it } from "vitest";
import type { RungRead } from "../api";
import {
	authoredSpelling,
	draggedAngle,
	draggedRect,
	drawnHandles,
	handlesFor,
	type ResizeMeasurement,
	resizedBox,
	resizeFields,
	resizeStyle,
	rotateTokens,
	rotationOf,
	turnValue,
} from "./hand-resize";

/**
 * Resize by handle (#259), as decisions.
 *
 * Which handles the file leaves live, what the pointer's numbers come to, and
 * what a drag writes when it is let go. Everything here is answerable before
 * the file is touched, which is what makes a dead drag impossible rather than
 * merely unlikely.
 */

const rung = (className: string, extra: Partial<RungRead> = {}): RungRead => ({
	source: "frames/cart/frame.tsx:9:4",
	name: "div",
	className,
	path: "design/frames/cart/frame.tsx",
	line: 9,
	...extra,
});

describe("which handles are live", () => {
	it("draws none until the read lands", () => {
		expect(handlesFor(undefined)).toEqual({ w: false, h: false, rotate: false });
	});

	it("draws none on a literal no hand may write", () => {
		const refused = rung("", { refusal: { code: "computed-class", says: "className is an expression" } });
		expect(handlesFor(refused)).toEqual({ w: false, h: false, rotate: false });
	});

	it("draws all three on a plain literal, and on an element with no className at all", () => {
		expect(handlesFor(rung("flex flex-col gap-2"))).toEqual({ w: true, h: true, rotate: true });
		expect(handlesFor(rung(""))).toEqual({ w: true, h: true, rotate: true });
	});

	it("keeps every handle on an element a shared file defines", () => {
		// a class cell several uses share is exactly what the source owner edits,
		// so the old lane's shared-definition no is not this ring's answer
		const shared = rung("w-40 h-24", {
			refusal: { code: "shared-definition", says: "defined in shared/card.tsx:1, rendered by 2 frames" },
		});
		expect(handlesFor(shared)).toEqual({ w: true, h: true, rotate: true });
	});

	it("takes one axis off where a breakpoint pins it, and leaves the other", () => {
		// a base `w-56` under a live `md:w-96` is a class the frame would not
		// show, so there is no honest width drag — the height is untouched
		expect(handlesFor(rung("w-40 md:w-96"))).toEqual({ w: false, h: true, rotate: true });
		expect(handlesFor(rung("lg:h-24"))).toEqual({ w: true, h: false, rotate: true });
	});

	it("takes both size handles off where one token pins both axes", () => {
		// `md:size-8` is a width and a height in one token, so neither a base
		// width nor a base height can honestly beat it
		expect(handlesFor(rung("md:size-8"))).toEqual({ w: false, h: false, rotate: true });
	});

	it("takes the size handles off an element already turned, and keeps the rotate zones", () => {
		// the box the canvas has is the one around a turned element rather than
		// the one it is, so a drag would write a width nobody asked for
		expect(handlesFor(rung("rotate-6 p-4"))).toEqual({ w: false, h: false, rotate: true });
	});
});

describe("the turn a literal already wears", () => {
	it.each([
		["", 0],
		["rotate-12", 12],
		["-rotate-45", -45],
		["rotate-[30deg]", 30],
		["hover:rotate-90", 0],
	])("reads %s as %i", (className, deg) => {
		expect(rotationOf(className)).toBe(deg);
	});
});

describe("the numbers a drag makes", () => {
	it("keeps the corner layout gave the element: a ring pins nothing", () => {
		// anchoring the far edge would promise a position the write cannot keep
		expect(draggedRect({ x: 10, y: 20, w: 200, h: 120 }, { w: 247, h: 84 })).toEqual({
			x: 10,
			y: 20,
			w: 247,
			h: 84,
		});
	});

	it("turns in whole degrees, snapping to 15 while shift is held", () => {
		const quarter = Math.PI / 2;
		expect(draggedAngle(0, 0, quarter, false)).toBe(90);
		expect(draggedAngle(0, 0, 0.14, false)).toBe(8);
		expect(draggedAngle(0, 0, 0.14, true)).toBe(15);
		// wrapped to (-180, 180], so a turn past the bottom reads as negative
		expect(draggedAngle(170, 0, quarter / 3, false)).toBe(-160);
	});
});

describe("what a drag writes", () => {
	it("writes a turn as one signed token, and takes the family away at rest", () => {
		expect(rotateTokens(12)).toEqual(["rotate-12"]);
		expect(rotateTokens(-45)).toEqual(["-rotate-45"]);
		expect(rotateTokens(0)).toEqual([]);
		// a turn back to rest takes off the token it started in rather than
		// writing a zero, and names it, because the literal is edited in place
		expect(turnValue(0, 30)).toEqual({ kind: "remove", tokens: ["rotate-30"] });
		expect(turnValue(0, 0)).toEqual({ kind: "remove", tokens: [] });
		expect(turnValue(-45, 0)).toEqual({ kind: "binding", tokens: ["-rotate-45"] });
	});

	it("wears the same numbers on the element that it writes to the file", () => {
		const held: ResizeMeasurement = {
			modifiers: { center: false, proportional: false },
			properties: ["width", "height"],
			writes: {
				width: { unit: "px", per: 1 },
				height: { unit: "px", per: 1 },
				left: { unit: "px", per: 1 },
				top: { unit: "px", per: 1 },
			},
			start: { w: 990, h: 400 },
			extra: { w: 0, h: 0 },
			offset: { left: 0, top: 0 },
			limits: { minW: 0, minH: 0, maxW: null, maxH: null },
			raw: { w: 640, h: 400 },
			live: { w: 640, h: 400 },
			shift: { x: 0, y: 0 },
		};
		expect(resizeStyle(held)).toEqual({ width: "640px", height: "400px" });
		// the properties the gesture never opened on stay off the element
		expect(resizeStyle({ ...held, properties: ["width"] })).toEqual({ width: "640px" });
		// a free element's placement rides along, off the shift the size made
		expect(
			resizeStyle({
				...held,
				properties: ["width", "left"],
				offset: { left: 20, top: 0 },
				shift: { x: 350, y: 0 },
			}),
		).toEqual({ width: "640px", left: "370px" });
		// a fractional sample is spelled short rather than at full precision
		expect(resizeStyle({ ...held, properties: ["height"], live: { w: 640, h: 400.126 } })).toEqual({
			height: "400.13px",
		});
	});
});

describe("which of the eight targets the ring draws", () => {
	const live = { w: true, h: true, rotate: true };

	it("draws four corners and four edges on a box with room for them", () => {
		expect(drawnHandles({ w: 200, h: 120 }, live, null)).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
	});

	it("keeps an edge target off a side shorter than the approved 72px", () => {
		// a 64px-wide box has no room for a top or bottom strip, and the corners
		// stay: they are how that box is resized at all
		expect(drawnHandles({ w: 64, h: 120 }, live, null)).toEqual(["nw", "ne", "e", "se", "sw", "w"]);
		expect(drawnHandles({ w: 200, h: 64 }, live, null)).toEqual(["nw", "n", "ne", "se", "s", "sw"]);
	});

	it("draws nothing on a target under 24px on its smaller dimension", () => {
		expect(drawnHandles({ w: 200, h: 20 }, live, null)).toEqual([]);
	});

	it("keeps the grabbed target drawn however small the box becomes mid-drag", () => {
		expect(drawnHandles({ w: 200, h: 6 }, live, "se")).toEqual(["se"]);
	});

	it("omits every target whose only axis the file has pinned", () => {
		expect(drawnHandles({ w: 200, h: 120 }, { w: false, h: true, rotate: true }, null)).toEqual([
			"nw",
			"n",
			"ne",
			"se",
			"s",
			"sw",
		]);
	});
});

describe("the box a handle drags to", () => {
	const free = { minW: 0, minH: 0, maxW: null, maxH: null };
	const still = { center: false, proportional: false };

	it("moves the grabbed axes and leaves the rest of the box alone", () => {
		expect(resizedBox({ w: 200, h: 120 }, "e", 40, 90, still, free)).toEqual({
			w: 240,
			h: 120,
			shiftX: 0,
			shiftY: 0,
		});
	});

	it("moves the near edge off a west or north grab", () => {
		// the far edge is where it was: the box grew to the left, so its own
		// left moved by exactly what it gained
		expect(resizedBox({ w: 200, h: 120 }, "nw", -40, -20, still, free)).toEqual({
			w: 240,
			h: 140,
			shiftX: -40,
			shiftY: -20,
		});
	});

	it("grows from the centre while option is held, at twice the pointer", () => {
		expect(resizedBox({ w: 200, h: 120 }, "e", 40, 0, { center: true, proportional: false }, free)).toEqual({
			w: 280,
			h: 120,
			shiftX: -40,
			shiftY: 0,
		});
	});

	it("keeps the proportions it started with while shift is held", () => {
		// the dominant relative change decides one scale, and both axes take it
		expect(resizedBox({ w: 200, h: 100 }, "se", 100, 0, { center: false, proportional: true }, free)).toEqual({
			w: 300,
			h: 150,
			shiftX: 0,
			shiftY: 0,
		});
	});

	it("clamps to the measured minimum and maximum, and the minimum wins a contradiction", () => {
		const bounded = { minW: 120, maxW: 260, minH: 0, maxH: null };
		expect(resizedBox({ w: 200, h: 120 }, "e", 400, 0, still, bounded).w).toBe(260);
		expect(resizedBox({ w: 200, h: 120 }, "e", -400, 0, still, bounded).w).toBe(120);
		const contradictory = { minW: 300, maxW: 100, minH: 0, maxH: null };
		expect(resizedBox({ w: 200, h: 120 }, "e", 0, 0, still, contradictory).w).toBe(300);
	});
});

describe("the unit the file already says a size is in", () => {
	const units = { rem: 16, em: 20 };

	it("takes pixels where nothing is authored, and where pixels are", () => {
		expect(authoredSpelling("p-4", "w", units)).toEqual({ kind: "pixels" });
		expect(authoredSpelling("w-40", "w", units)).toEqual({ kind: "pixels" });
		expect(authoredSpelling("w-[347px]", "w", units)).toEqual({ kind: "pixels" });
	});

	it("takes pixels for the one-pixel length, which is a length like any other", () => {
		expect(authoredSpelling("w-px", "w", units)).toEqual({ kind: "pixels" });
		expect(authoredSpelling("h-px", "h", units)).toEqual({ kind: "pixels" });
	});

	it("keeps a relative unit, measured on the element itself", () => {
		expect(authoredSpelling("w-[20rem]", "w", units)).toEqual({ kind: "unit", unit: "rem", per: 16 });
		expect(authoredSpelling("h-[2em]", "h", units)).toEqual({ kind: "unit", unit: "em", per: 20 });
	});

	it("refuses a size the layout decides rather than rewriting it in pixels", () => {
		// `w-full` and `w-1/2` are answers about the containing block, and the
		// drag has no honest way to say either as a length
		for (const worn of ["w-full", "w-1/2", "w-auto", "w-screen", "w-fit"]) {
			expect(authoredSpelling(worn, "w", units)).toMatchObject({ kind: "refused" });
		}
		expect(authoredSpelling("w-full", "w", units)).toEqual({
			kind: "refused",
			says: "w-full is what the layout decides, not a length a drag can move",
		});
	});

	it("refuses a unit it cannot measure on this element, and a value it cannot read", () => {
		expect(authoredSpelling("w-[50%]", "w", units)).toMatchObject({ kind: "refused" });
		expect(authoredSpelling("w-[10vw]", "w", units)).toMatchObject({ kind: "refused" });
		// a width the project's own variable decides is not a number this drag has
		expect(authoredSpelling("w-(--card)", "w", units)).toMatchObject({ kind: "refused" });
	});

	it("reads the family it was asked about and no other", () => {
		expect(authoredSpelling("w-full h-[20rem]", "h", units)).toEqual({ kind: "unit", unit: "rem", per: 16 });
		expect(authoredSpelling("md:w-full", "w", units)).toEqual({ kind: "pixels" });
	});
});

describe("what one resize gesture writes", () => {
	const at = { left: 24, top: 16 };
	const px = { unit: "px", per: 1 };
	const pixels = { width: px, height: px, left: px, top: px };

	it("writes the grabbed axis alone, on the project's own scale", () => {
		expect(resizeFields(["width"], { w: 224, h: 84 }, { x: 0, y: 0 }, at, 4, pixels)).toEqual([
			{ property: "width", value: { kind: "binding", tokens: ["w-56"] } },
		]);
	});

	it("writes both axes of a corner as one gesture's fields", () => {
		expect(resizeFields(["width", "height"], { w: 224, h: 347 }, { x: 0, y: 0 }, at, 4, pixels)).toEqual([
			{ property: "width", value: { kind: "binding", tokens: ["w-56"] } },
			{ property: "height", value: { kind: "binding", tokens: ["h-[347px]"] } },
		]);
	});

	it("writes a size authored in a relative unit back in that unit", () => {
		// 344px on a 16px root is 21.5rem, and saying 344px instead would be a
		// different promise about what this width follows
		expect(
			resizeFields(["width"], { w: 344, h: 84 }, { x: 0, y: 0 }, at, 4, {
				...pixels,
				width: { unit: "rem", per: 16 },
			}),
		).toEqual([{ property: "width", value: { kind: "binding", tokens: ["w-[21.5rem]"] } }]);
	});

	it("moves an already free element's own offsets, signed", () => {
		expect(resizeFields(["width", "left", "top"], { w: 224, h: 84 }, { x: -40, y: -20 }, at, 4, pixels)).toEqual([
			{ property: "width", value: { kind: "binding", tokens: ["w-56"] } },
			{ property: "left", value: { kind: "binding", tokens: ["-left-4"] } },
			{ property: "top", value: { kind: "binding", tokens: ["-top-1"] } },
		]);
	});
});
