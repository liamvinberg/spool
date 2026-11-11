import { describe, expect, it } from "vitest";
import type { DeckRule } from "../../deck/changes";
import type { Deck } from "../../deck/layout";
import { aimOf, deckOfRead } from "./deck-drag";

// slides at x = 0, 1440, 2880 (1280 wide); the band runs down to y = 720 + 160; loose cells from y = 1360
const talk = { w: 1280, h: 720 };
const deck: Deck = {
	talk,
	line: ["a", "b", "c"],
	loose: [
		{ folder: "x", col: 0, row: 1 },
		{ folder: "y", col: 1, row: 1 },
	],
	sizes: { a: talk, b: talk, c: talk, x: talk, y: talk },
};
/** where letting go of `frames` would put them, with the middle of the one grabbed at (cx, cy) */
const aim = (frames: string[], cx: number, cy: number) =>
	aimOf(deck, { frames, grabbed: frames[0] as string, at: { x: cx - talk.w / 2, y: cy - talk.h / 2 } });

describe("a frame held over a deck page", () => {
	it("goes in before a slide from its left fifth, after it from its right fifth, and trades over its middle", () => {
		// over b: its left fifth, its middle, its right fifth
		expect(aim(["x"], 1440 + 200, 360)?.rule).toEqual({ kind: "insert", frames: ["x"], at: 1 });
		expect(aim(["x"], 1440 + 640, 360)?.rule).toEqual({ kind: "trade", frame: "x", slide: "b" });
		expect(aim(["x"], 1440 + 1100, 360)?.rule).toEqual({ kind: "insert", frames: ["x"], at: 2 });
		// in the gap after b, which is past its right fifth
		expect(aim(["x"], 1440 + 1350, 360)?.rule).toEqual({ kind: "insert", frames: ["x"], at: 2 });
		// the outline is where the frame lands, and the band lifts for it
		const traded = aim(["x"], 1440 + 640, 360);
		expect(traded?.landing).toEqual({ x: 1440, y: 0, w: 1280, h: 720 });
		expect(traded?.band).toBe(true);
	});

	it("joins the end past the last slide, and the start before the first", () => {
		expect(aim(["x"], 6000, 400)?.deck.line).toEqual(["a", "b", "c", "x"]);
		expect(aim(["x"], -900, 400)?.deck.line).toEqual(["x", "a", "b", "c"]);
	});

	it("moves a slide along the talk over the band, and takes it out into the cell it is held over under it", () => {
		expect(aim(["a"], 2880 + 640, 300)?.rule).toEqual({ kind: "reorder", frame: "a", to: 2 });
		const out = aim(["b"], 1440 + 640, 1360 + 360);
		expect(out?.rule).toEqual({ kind: "place", frames: ["b"], cell: { col: 1, row: 1 } });
		expect(out?.deck.line).toEqual(["a", "c"]);
		// y stood there and is pushed down the column to make room
		expect(out?.deck.loose).toContainEqual({ folder: "y", col: 1, row: 2 });
		expect(out?.band).toBe(false);
		// the band's room under the slides still counts as the band
		expect(aim(["b"], 1440 + 640, 720 + 150)?.rule.kind).toBe("reorder");
	});

	it("brings several in together in the order they stood, on the nearer side of a slide's middle", () => {
		expect(aim(["y", "x"], 640 + 300, 360)?.deck.line).toEqual(["a", "x", "y", "b", "c"]);
		expect(aim(["y", "x"], 640 - 300, 360)?.deck.line).toEqual(["x", "y", "a", "b", "c"]);
	});

	it("keeps the aim shown while the hand stays within its slack of it", () => {
		// b's left fifth ends at 1440 + 256: just past it the middle trades, unless the edge was shown and is near
		const edge = aim(["x"], 1440 + 250, 360);
		expect(edge?.rule.kind).toBe("insert");
		const held = (cx: number) =>
			aimOf(
				deck,
				{ frames: ["x"], grabbed: "x", at: { x: cx - talk.w / 2, y: 0 } },
				{ rule: edge?.rule as DeckRule, slack: 50 },
			)?.rule.kind;
		expect(held(1440 + 290)).toBe("insert");
		expect(held(1440 + 320)).toBe("trade");
	});

	it("pushes a loose frame down only once the middle of what is held is over it", () => {
		// y rests in column 1; x held in the gap beside it stays in its own cell, and nobody moves
		const beside = aim(["x"], 1360, 1360 + 360);
		expect(beside?.rule).toEqual({ kind: "place", frames: ["x"], cell: { col: 0, row: 1 } });
		expect(beside?.same).toBe(true);
		const over = aim(["x"], 1500, 1360 + 360);
		expect(over?.deck.loose).toContainEqual({ folder: "y", col: 1, row: 2 });
	});

	it("says a frame let go where it stood changes nothing", () => {
		expect(aim(["x"], 640, 1360 + 360)?.same).toBe(true);
		expect(aim(["b"], 1440 + 640, 360)?.same).toBe(true);
		expect(aim(["x"], 640, 360)?.same).toBe(false);
	});
});

it("reads a deck's frames by their folder on its page, at the sizes the canvas has them", () => {
	const read = deckOfRead(
		{
			page: "talk",
			size: talk,
			slides: [{ name: "talk/a", beats: [], live: false, notes: [""] }],
			loose: [{ name: "talk/phone", cell: { col: 0, row: 1 } }],
			problems: [],
		},
		(name) => (name === "talk/phone" ? { w: 390, h: 844 } : undefined),
	);
	expect(read).toEqual({
		talk,
		line: ["a"],
		loose: [{ folder: "phone", col: 0, row: 1 }],
		sizes: { a: talk, phone: { w: 390, h: 844 } },
	});
});
