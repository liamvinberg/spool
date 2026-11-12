import { describe, expect, it } from "vitest";
import { applyRule, type DeckRule } from "./changes";
import type { Deck, Spot } from "./layout";

const talk = { w: 1280, h: 720 };
const deckOf = (line: string[], loose: Spot[], sizes: Deck["sizes"] = {}): Deck => ({ talk, line, loose, sizes });
const changed = (deck: Deck, rule: DeckRule) => {
	const result = applyRule(deck, rule);
	if (result.kind !== "changed") throw new Error(result.message);
	return result;
};

describe("a deck's rules", () => {
	const deck = deckOf(
		["a", "b", "c"],
		[
			{ folder: "x", col: 0, row: 1 },
			{ folder: "y", col: 2, row: 1 },
			{ folder: "z", col: 1, row: 2 },
		],
	);

	it("joins frames into the talk in the order they stood on the page, whatever order they were named in", () => {
		const joined = changed(deck, { kind: "insert", frames: ["z", "y", "x"], at: 1 }).deck;
		expect(joined.line).toEqual(["a", "x", "y", "z", "b", "c"]);
		// the cells they left stay empty
		expect(joined.loose).toEqual([]);
		// a slide among them moves with them, counted from where it stood
		expect(changed(deck, { kind: "insert", frames: ["a", "x"], at: 3 }).deck.line).toEqual(["b", "c", "a", "x"]);
		expect(changed(deck, { kind: "insert", frames: ["x"], at: 99 }).deck.line).toEqual(["a", "b", "c", "x"]);
	});

	it("sets frames down a column, pushing what stands there and under it down, and closes the talk", () => {
		const out = changed(deck, { kind: "place", frames: ["c", "b"], cell: { col: 0, row: 1 } }).deck;
		expect(out.line).toEqual(["a"]);
		expect(out.loose).toEqual([
			{ folder: "x", col: 0, row: 3 },
			{ folder: "y", col: 2, row: 1 },
			{ folder: "z", col: 1, row: 2 },
			{ folder: "b", col: 0, row: 1 },
			{ folder: "c", col: 0, row: 2 },
		]);
		// with no cell, under the talk's end: column 2's first free row
		expect(changed(deck, { kind: "place", frames: ["a"] }).deck.loose).toContainEqual({
			folder: "a",
			col: 2,
			row: 2,
		});
		// a loose frame moved into an empty cell pushes nothing
		expect(changed(deck, { kind: "place", frames: ["x"], cell: { col: 5, row: 4 } }).deck.loose).toContainEqual({
			folder: "x",
			col: 5,
			row: 4,
		});
	});

	it("reorders along the talk and arranges it as the Pages list was dragged", () => {
		expect(changed(deck, { kind: "reorder", frame: "a", to: 2 }).deck.line).toEqual(["b", "c", "a"]);
		const arranged = changed(deck, { kind: "arrange", slides: ["z", "c", "a"] }).deck;
		expect(arranged.line).toEqual(["z", "c", "a"]);
		expect(arranged.loose).toContainEqual({ folder: "b", col: 2, row: 2 });
	});

	it("resizes the slides of the talk's size and leaves frames of another shape alone", () => {
		const shaped = deckOf(["a", "phone"], [{ folder: "x", col: 0, row: 1 }], {
			a: talk,
			phone: { w: 390, h: 844 },
			x: talk,
		});
		const resized = changed(shaped, { kind: "size", size: { w: 1920, h: 1080 } }).deck;
		expect(resized.talk).toEqual({ w: 1920, h: 1080 });
		expect(resized.sizes).toEqual({ a: { w: 1920, h: 1080 }, phone: { w: 390, h: 844 }, x: talk });
		expect(changed(shaped, { kind: "size", size: { w: 10, h: 99999 } }).deck.talk).toEqual({ w: 240, h: 2160 });
	});

	it("refuses what names no frame", () => {
		expect(applyRule(deck, { kind: "insert", frames: ["nope"], at: 0 }).kind).toBe("refused");
	});

	it("keeps every frame exactly once, in the talk or in a cell of its own, through any run of changes", () => {
		let seed = 7;
		const random = (n: number) => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % n;
		};
		const all = ["a", "b", "c", "x", "y", "z", "w"];
		let now = deckOf(
			["a", "b", "c"],
			[
				{ folder: "x", col: 0, row: 1 },
				{ folder: "y", col: 2, row: 1 },
				{ folder: "z", col: 1, row: 2 },
				{ folder: "w", col: 0, row: 2 },
			],
		);
		for (let step = 0; step < 500; step++) {
			const pick = () => all[random(all.length)] as string;
			const rules: DeckRule[] = [
				{ kind: "insert", frames: [pick(), pick()], at: random(now.line.length + 2) },
				{ kind: "place", frames: [pick(), pick()], cell: { col: random(4) - 1, row: random(4) } },
				{ kind: "place", frames: [pick()] },
				{ kind: "reorder", frame: now.line[random(now.line.length)] ?? "a", to: random(5) },
				{ kind: "arrange", slides: [pick(), pick(), pick()] },
			];
			const result = applyRule(now, rules[random(rules.length)] as DeckRule);
			if (result.kind === "changed") now = result.deck;
			const names = [...now.line, ...now.loose.map((spot) => spot.folder)];
			expect(names.sort()).toEqual([...all].sort());
			const cells = now.loose.map((spot) => `${spot.col},${spot.row}`);
			expect(new Set(cells).size).toBe(cells.length);
			expect(now.loose.every((spot) => spot.row >= 1)).toBe(true);
		}
	});
});
