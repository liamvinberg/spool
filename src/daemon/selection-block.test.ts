import { describe, expect, it } from "vitest";
import type { SelectionEntry } from "./selection";
import { EXCERPT_BUDGET, selectionBlock } from "./selection-block";

/**
 * The one rendering of the selection (#116): the block a prompt carries and the
 * bytes `spool selection` prints are this function called twice, so what is
 * asserted here holds for both readers.
 *
 * The law under test is which half is droppable. A pointer is the whole promise —
 * nobody typed it and the agent can read the file from it — so every entry
 * contributes one whatever the budget says, and an excerpt is the only thing a
 * budget may take. What is dropped says so, because a block quietly holding less
 * than it appears to is the one failure an agent cannot see.
 */

const frame = (name: string): SelectionEntry => ({
	kind: "frame",
	frame: name,
	path: `design/frames/app/${name}/frame.tsx`,
	size: { w: 480, h: 640 },
});

const element = (name: string, excerpt: string, lines: [number, number] = [44, 56]): SelectionEntry => ({
	kind: "element",
	frame: "checkout",
	name,
	path: "design/frames/app/checkout/frame.tsx",
	lines,
	selector: `div:nth-child(${lines[0]})`,
	excerpt,
});

describe("the selection block", () => {
	it("is nothing at all when nothing is pointed at", () => {
		expect(selectionBlock([])).toBe("");
	});

	it("draws a frame as its name, its path and its size", () => {
		expect(selectionBlock([frame("cart")])).toBe(
			["<selection>", "cart — design/frames/app/cart/frame.tsx — 480×640", "</selection>"].join("\n"),
		);
	});

	it("draws an element as its frame, its noun, its path and its lines, with the excerpt under it", () => {
		expect(selectionBlock([element("line-item", '<li className="flex">…')])).toBe(
			[
				"<selection>",
				"checkout · line-item — design/frames/app/checkout/frame.tsx:44-56",
				'  <li className="flex">…',
				"</selection>",
			].join("\n"),
		);
	});

	it("carries every entry in pick order, frames and elements alike", () => {
		const block = selectionBlock([frame("cart"), frame("menu"), element("total-row", "<div>76 kr</div>", [61, 70])]);

		expect(block.split("\n").slice(1, -1)).toEqual([
			"cart — design/frames/app/cart/frame.tsx — 480×640",
			"menu — design/frames/app/menu/frame.tsx — 480×640",
			"checkout · total-row — design/frames/app/checkout/frame.tsx:61-70",
			"  <div>76 kr</div>",
		]);
	});

	it("keeps every pointer over budget and elides only excerpts, saying how many", () => {
		const long = "x".repeat(240);
		const entries = Array.from({ length: 5 }, (_, at) => element(`row-${at}`, long, [at + 1, at + 2]));

		// two excerpts fit in a budget of 500, three do not
		const block = selectionBlock(entries, 500);

		for (const at of [0, 1, 2, 3, 4]) {
			expect(block).toContain(`checkout · row-${at} — design/frames/app/checkout/frame.tsx:${at + 1}-${at + 2}`);
		}
		expect(block.split("\n").filter((line) => line.includes(long))).toHaveLength(2);
		expect(block).toContain("  3 excerpts elided over budget — read the paths");
	});

	it("counts one elision in the singular", () => {
		const long = "x".repeat(240);

		const block = selectionBlock([element("a", long), element("b", long)], 300);

		expect(block).toContain("  1 excerpt elided over budget — read the paths");
	});

	it("never elides a frame, because a frame has no excerpt to take", () => {
		const forty = Array.from({ length: 40 }, (_, at) => frame(`frame-${at}`));

		const block = selectionBlock(forty, 0);

		expect(block.split("\n")).toHaveLength(42);
		expect(block).not.toContain("elided");
	});

	it("spends a budget nobody set, so the default is what a prompt really carries", () => {
		const long = "x".repeat(240);
		const sixteen = Array.from({ length: 16 }, (_, at) => element(`row-${at}`, long));

		expect(selectionBlock(sixteen)).not.toContain("elided");
		expect(EXCERPT_BUDGET).toBe(4000);
	});
});
