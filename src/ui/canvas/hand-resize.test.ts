import { describe, expect, it } from "vitest";
import type { RungRead } from "../api";
import {
	draggedAngle,
	draggedRect,
	drawnHandles,
	handlesFor,
	previewTokens,
	resizedBox,
	resizeFields,
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
	it("shows absolute pixels while the pointer is down", () => {
		expect(previewTokens({ w: 247, h: 120 }, 1, 1)).toEqual(["w-[247px]", "h-[120px]"]);
		expect(previewTokens({ w: 247, h: 120 }, 1, 0)).toEqual(["w-[247px]"]);
	});

	it("writes a turn as one signed token, and takes the family away at rest", () => {
		expect(rotateTokens(12)).toEqual(["rotate-12"]);
		expect(rotateTokens(-45)).toEqual(["-rotate-45"]);
		expect(rotateTokens(0)).toEqual([]);
		// a turn back to rest takes the family away rather than writing a zero
		expect(turnValue(0)).toEqual({ kind: "remove" });
		expect(turnValue(-45)).toEqual({ kind: "binding", tokens: ["-rotate-45"] });
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
	const free = { minW: 0, maxW: Number.POSITIVE_INFINITY, minH: 0, maxH: Number.POSITIVE_INFINITY };
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
		const bounded = { minW: 120, maxW: 260, minH: 0, maxH: Number.POSITIVE_INFINITY };
		expect(resizedBox({ w: 200, h: 120 }, "e", 400, 0, still, bounded).w).toBe(260);
		expect(resizedBox({ w: 200, h: 120 }, "e", -400, 0, still, bounded).w).toBe(120);
		const contradictory = { minW: 300, maxW: 100, minH: 0, maxH: Number.POSITIVE_INFINITY };
		expect(resizedBox({ w: 200, h: 120 }, "e", 0, 0, still, contradictory).w).toBe(300);
	});
});

describe("what one resize gesture writes", () => {
	const at = { left: 24, top: 16 };

	it("writes the grabbed axis alone, on the project's own scale", () => {
		expect(resizeFields(["width"], { w: 224, h: 84 }, { x: 0, y: 0 }, at, 4)).toEqual([
			{ property: "width", value: { kind: "binding", tokens: ["w-56"] } },
		]);
	});

	it("writes both axes of a corner as one gesture's fields", () => {
		expect(resizeFields(["width", "height"], { w: 224, h: 347 }, { x: 0, y: 0 }, at, 4)).toEqual([
			{ property: "width", value: { kind: "binding", tokens: ["w-56"] } },
			{ property: "height", value: { kind: "binding", tokens: ["h-[347px]"] } },
		]);
	});

	it("moves an already free element's own offsets, signed", () => {
		expect(resizeFields(["width", "left", "top"], { w: 224, h: 84 }, { x: -40, y: -20 }, at, 4)).toEqual([
			{ property: "width", value: { kind: "binding", tokens: ["w-56"] } },
			{ property: "left", value: { kind: "binding", tokens: ["-left-4"] } },
			{ property: "top", value: { kind: "binding", tokens: ["-top-1"] } },
		]);
	});
});
