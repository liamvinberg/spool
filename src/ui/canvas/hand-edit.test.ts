import { describe, expect, it } from "vitest";
import { deleteGesture, GENERATED, MANY_RUNGS, NO_STAMP, secondClick, stampOf } from "./hand-edit";
import type { PickedSelection } from "./overlays";

/**
 * The two gestures' own decisions (#255): what a pick can be acted on at all,
 * what one delete writes, and which press is the second click.
 */

const pick = (over: Partial<PickedSelection> = {}): PickedSelection => ({
	frame: "cart",
	selector: "screen > h1",
	tag: "h1",
	outerHtml: "<h1>Pay now</h1>",
	rect: { x: 10, y: 10, w: 100, h: 40 },
	radius: 0,
	source: "frames/cart/frame.tsx:7:4",
	generated: false,
	...over,
});

describe("the stamp a gesture acts on", () => {
	it("is the pick's own, and nothing when the pick never carried one", () => {
		expect(stampOf(pick())).toBe("frames/cart/frame.tsx:7:4");
		expect(stampOf(pick({ source: null }))).toBe(NO_STAMP);
		expect(stampOf(pick({ source: "" }))).toBe(NO_STAMP);
	});

	it("refuses a box the file has no line for, whatever the ancestor's stamp says", () => {
		expect(stampOf(pick({ generated: true }))).toBe(GENERATED);
	});
});

describe("delete", () => {
	it("writes one op against the held rung's own stamp", () => {
		expect(deleteGesture([pick()])).toEqual({
			frame: "cart",
			ops: [{ kind: "delete", source: "frames/cart/frame.tsx:7:4" }],
			on: expect.objectContaining({ selector: "screen > h1" }),
		});
	});

	it("has nothing to do with nothing held", () => {
		expect(deleteGesture([])).toBeUndefined();
	});

	it("refuses a set, because a refusal has to name one element", () => {
		expect(deleteGesture([pick(), pick({ selector: "screen > p" })])).toBe(MANY_RUNGS);
	});

	it("refuses a rung the file has no line for", () => {
		expect(deleteGesture([pick({ generated: true })])).toBe(GENERATED);
	});
});

describe("the second click", () => {
	it("is a press inside the one element already held", () => {
		expect(secondClick([pick()], "cart", { x: 20, y: 20 })?.selector).toBe("screen > h1");
	});

	it("is not a press outside its box, which is a click onto something else", () => {
		expect(secondClick([pick()], "cart", { x: 200, y: 20 })).toBeUndefined();
		expect(secondClick([pick()], "cart", { x: 20, y: 200 })).toBeUndefined();
	});

	it("is not a press on another frame, and not one with more than a rung held", () => {
		expect(secondClick([pick()], "checkout", { x: 20, y: 20 })).toBeUndefined();
		expect(secondClick([pick(), pick({ selector: "screen > p" })], "cart", { x: 20, y: 20 })).toBeUndefined();
	});

	it("is nothing at all with nothing held, which is the click that selects", () => {
		expect(secondClick([], "cart", { x: 20, y: 20 })).toBeUndefined();
	});
});
