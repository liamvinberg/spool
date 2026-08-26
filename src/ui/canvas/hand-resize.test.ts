import { describe, expect, it } from "vitest";
import type { RungRead } from "../api";
import {
	draggedAngle,
	draggedRect,
	draggedSize,
	handlesFor,
	landed,
	previewTokens,
	rotateOps,
	rotateTokens,
	rotationOf,
	sizeOps,
	sizeTokens,
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
	it("moves only the axes the handle grabbed", () => {
		expect(draggedSize({ w: 200, h: 120 }, 1, 0, 47, 300)).toEqual({ w: 247, h: 120 });
		expect(draggedSize({ w: 200, h: 120 }, 0, 1, 300, -20)).toEqual({ w: 200, h: 100 });
	});

	it("grows to the left off a west grab, and never shrinks past the floor", () => {
		expect(draggedSize({ w: 200, h: 120 }, -1, 0, -47, 0)).toEqual({ w: 247, h: 120 });
		expect(draggedSize({ w: 200, h: 120 }, 1, 1, -400, -400)).toEqual({ w: 8, h: 8 });
	});

	it("rounds the axis nobody touched, because the box it started from is measured", () => {
		// a `getBoundingClientRect` comes fractional, and a readout saying
		// `220.53125 × 48` is one nobody can act on
		expect(draggedSize({ w: 220.53125, h: 48 }, 0, 1, 0, 12)).toEqual({ w: 221, h: 60 });
	});

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

	it("lands a whole step as the bare class and everything else as pixels", () => {
		// a whole step is byte-identical to what the frame's author would have
		// written; anything else meant absolute pixels and stays them
		expect(sizeTokens({ w: 224, h: 347 }, 1, 1, 4)).toEqual(["w-56", "h-[347px]"]);
		// the step is the compiled stylesheet's, never an assumption
		expect(sizeTokens({ w: 224, h: 347 }, 1, 1, 8)).toEqual(["w-28", "h-[347px]"]);
	});

	it("writes both axes of a corner as one gesture's ops", () => {
		expect(sizeOps("frames/cart/frame.tsx:9:4", ["w-56", "h-24"])).toEqual([
			{ kind: "set-class", source: "frames/cart/frame.tsx:9:4", token: "w-56", scope: "" },
			{ kind: "set-class", source: "frames/cart/frame.tsx:9:4", token: "h-24", scope: "" },
		]);
	});

	it("writes a turn as one signed token, and takes the family away at rest", () => {
		expect(rotateTokens(12)).toEqual(["rotate-12"]);
		expect(rotateTokens(-45)).toEqual(["-rotate-45"]);
		expect(rotateTokens(0)).toEqual([]);
		expect(rotateOps("frames/cart/frame.tsx:9:4", 0)).toEqual([
			{ kind: "set-class", source: "frames/cart/frame.tsx:9:4", token: "rotate-0", scope: "", remove: true },
		]);
	});
});

describe("measure after apply", () => {
	it("asks only about the axes the drag wrote", () => {
		// the other one was never written, so whatever layout does with it is
		// layout's own business rather than a mismatch
		expect(landed({ intent: { w: 240, h: 100 }, sx: 1, sy: 0 }, { w: 240, h: 733 })).toBe(true);
		expect(landed({ intent: { w: 240, h: 100 }, sx: 1, sy: 0 }, { w: 180, h: 100 })).toBe(false);
	});

	it("takes sub-pixel slack, and nothing a clamp would leave", () => {
		expect(landed({ intent: { w: 240, h: 100 }, sx: 1, sy: 1 }, { w: 240.5, h: 99.5 })).toBe(true);
		expect(landed({ intent: { w: 240, h: 100 }, sx: 1, sy: 1 }, { w: 240, h: 64 })).toBe(false);
	});
});
