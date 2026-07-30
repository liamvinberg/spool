import { describe, expect, it } from "vitest";
import type { SelectionEntry } from "../../daemon/selection";
import { chipWidth, composerWidth, contextLine, countLabel, idOf, stripOf } from "./agent-chips";
import { pickKey } from "./protocol";

/**
 * The chip strip's one rule (#116): the selection never takes more than one line of
 * the composer. Either every chip fits on that line or the strip is a count that
 * opens into a list, and there is no third shape.
 *
 * What is measured here is the fit, the words, and the line the transcript keeps —
 * the drawing is `agent-rail.test.ts`'s.
 */

const frame = (name: string): SelectionEntry => ({
	kind: "frame",
	frame: name,
	path: `design/frames/app/${name}/frame.tsx`,
	size: { w: 390, h: 844 },
});

const element = (frameName: string, name: string, lines: [number, number], selector = name): SelectionEntry => ({
	kind: "element",
	frame: frameName,
	name,
	path: `design/frames/app/${frameName}/frame.tsx`,
	lines,
	selector,
	excerpt: `<${name} />`,
});

/** the composer at the rail's own default */
const WIDE = composerWidth(420);

describe("the chip strip", () => {
	it("is nothing at all when nothing is pointed at", () => {
		expect(stripOf([], WIDE)).toEqual({ kind: "none" });
		expect(contextLine([], WIDE)).toBeNull();
	});

	it("draws every entry the daemon serves, not just the first", () => {
		const strip = stripOf([frame("menu"), frame("cart"), frame("receipt")], WIDE);

		expect(strip.kind).toBe("chips");
		expect(strip.kind === "chips" && strip.chips.map((chip) => chip.label)).toEqual(["menu", "cart", "receipt"]);
	});

	it("keeps chips while they fit on the line", () => {
		const three = [frame("menu"), frame("cart"), frame("receipt")];

		// three short names fit at the default and collapsing would say less than any
		// one of them
		expect(stripOf(three, WIDE).kind).toBe("chips");
		expect(chipWidth("menu") + chipWidth("cart") + chipWidth("receipt")).toBeLessThan(WIDE);
	});

	it("collapses to an openable count the moment they would not", () => {
		// five elements down one frame's tree: a label is a noun and a line range,
		// three times the width of a frame name, so this never fits and never will
		const five = [
			element("cart", "cart-title", [36, 40]),
			element("cart", "line-item", [44, 56], "div:nth-child(1)"),
			element("cart", "line-item", [44, 56], "div:nth-child(2)"),
			element("cart", "total-row", [61, 70]),
			element("cart", "pay-button", [73, 81]),
		];

		const strip = stripOf(five, WIDE);

		expect(strip.kind).toBe("count");
		expect(strip.kind === "count" && strip.label).toBe("5 elements in cart");
		// the list is still there behind the count, individually droppable
		expect(strip.kind === "count" && strip.chips).toHaveLength(5);
		expect(strip.kind === "count" && strip.chips.map((chip) => chip.label)).toEqual([
			"cart-title · 36-40",
			"line-item · 44-56",
			"line-item · 44-56",
			"total-row · 61-70",
			"pay-button · 73-81",
		]);
	});

	it("collapses at a narrow rail what it drew as chips at a wide one", () => {
		const three = [frame("menu"), frame("cart"), frame("receipt")];

		// the same selection, at the 200 floor the rail can be dragged to
		expect(stripOf(three, composerWidth(200)).kind).toBe("count");
		expect(countLabel(three)).toBe("3 frames");
	});

	it("names the frame once when every entry shares it, and per entry when they do not", () => {
		const shared = [element("cart", "line-item", [44, 56], "a"), element("cart", "total-row", [61, 70])];
		const spread = [element("cart", "line-item", [44, 56], "a"), element("menu", "row", [12, 14])];

		expect(stripOf(shared, 4000).kind === "chips" && stripOf(shared, 4000)).toMatchObject({
			chips: [{ label: "line-item · 44-56" }, { label: "total-row · 61-70" }],
		});
		expect(stripOf(spread, 4000)).toMatchObject({
			chips: [{ label: "cart · line-item · 44-56" }, { label: "menu · row · 12-14" }],
		});
		expect(countLabel(spread)).toBe("2 elements");
	});

	it("tells two picks of one list row apart by what the canvas knows, never by their words", () => {
		const twins = [
			element("cart", "line-item", [44, 56], "div > div:nth-child(1)"),
			element("cart", "line-item", [44, 56], "div > div:nth-child(2)"),
		];

		// one string in the rail, two boxes out there — which is why removal reaches
		// the canvas and why the ids differ though the labels cannot
		const [first, second] = twins.map((entry) => idOf(entry));
		expect(first).not.toBe(second);
		// and the id is the canvas's own name for a pick, not a second one: a chip's ✕
		// reaches a pick by exactly this string
		expect(first).toBe(pickKey("cart", "div > div:nth-child(1)"));
		expect(stripOf(twins, 4000)).toMatchObject({
			chips: [{ label: "line-item · 44-56" }, { label: "line-item · 44-56" }],
		});
	});

	it("draws the frame the hands stepped into as one ordinary chip", () => {
		const strip = stripOf([frame("cart")], WIDE, true);

		expect(strip).toEqual({ kind: "chips", chips: [{ id: "cart", label: "cart" }], inside: true });
	});

	it("keeps a line under the words saying exactly what the strip said", () => {
		const three = [frame("menu"), frame("cart"), frame("receipt")];

		expect(contextLine(three, WIDE)).toBe("menu, cart, receipt");
		// and when the strip was a count, the line is that count and not the list it
		// hides: the strip is the promise, and the receipt repeats it
		expect(contextLine(three, composerWidth(200))).toBe("3 frames");
		expect(contextLine([frame("cart")], WIDE, true)).toBe("cart");
	});
});
