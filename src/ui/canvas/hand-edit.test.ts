import { describe, expect, it } from "vitest";
import { askText, GENERATED, NO_STAMP, restamped, secondClick, stampOf, wordsOf } from "./hand-edit";
import type { PickedSelection } from "./overlays";

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

describe("after a save that is not a reload", () => {
	const shifts = [
		{ line: 7, column: 41, delta: -5 },
		{ line: 7, column: 90, delta: 2 },
	];

	it("moves the stamps on the patched line past each patch, and no other", () => {
		expect(restamped("frames/veil/frame.tsx:7:117", "frames/veil/frame.tsx", shifts)).toBe(
			"frames/veil/frame.tsx:7:114",
		);
		expect(restamped("frames/veil/frame.tsx:7:60", "frames/veil/frame.tsx", shifts)).toBe(
			"frames/veil/frame.tsx:7:55",
		);
		expect(restamped("frames/veil/frame.tsx:7:37", "frames/veil/frame.tsx", shifts)).toBe(
			"frames/veil/frame.tsx:7:37",
		);
		expect(restamped("frames/veil/frame.tsx:8:50", "frames/veil/frame.tsx", shifts)).toBe(
			"frames/veil/frame.tsx:8:50",
		);
		expect(restamped("shared/ui/parts.tsx:7:50", "frames/veil/frame.tsx", shifts)).toBe("shared/ui/parts.tsx:7:50");
	});

	it("reads the words of what the frame handed back, a line break for each <br>", () => {
		expect(wordsOf([{ text: "Make" }, { tag: "br", nodes: [] }, { tag: "span", nodes: [{ text: "it" }] }])).toBe(
			"Make\nit",
		);
	});

	it("prepares the ask in plain words: what was tried, where, and why the hand could not", () => {
		const text = askText(
			{
				frame: "home",
				selector: "main > h2",
				refusal: { code: "expression-text", says: "{title} is an expression; edit it in code or ask the agent" },
				attempted: "Studio",
			},
			pick({ tag: "h2", source: "frames/home/frame.tsx:9:5" }),
		);
		expect(text).toBe(
			'Change the words of the h2 at design/frames/home/frame.tsx:9:5 to "Studio". {title} is an expression; edit it in code or ask the agent, so the hand could not write it in place.',
		);
	});
});
