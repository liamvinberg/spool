import { describe, expect, it } from "vitest";
import type { Deck } from "../../deck/layout";
import { type Aim, aimOf, bandReach, deckOfRead, edgePan, gapOf, type Hold, leanAt, leanOf } from "./deck-drag";

// slides at x = 0, 1440, 2880, 4320 (1280 wide, one slot is 1440); the band runs down to y = 720 + 160; loose cells
// from y = 1360
const talk = { w: 1280, h: 720 };
const SLOT = 1440;
const deck: Deck = {
	talk,
	line: ["a", "b", "c", "d"],
	loose: [
		{ folder: "x", col: 0, row: 1 },
		{ folder: "y", col: 1, row: 1 },
	],
	sizes: { a: talk, b: talk, c: talk, d: talk, x: talk, y: talk },
};
const ZOOM = 0.25;
/** what is held, with the middle of the one grabbed at (cx, cy), the hand going `dir` */
const hold = (frames: string[], cx: number, cy: number, dir: Hold["dir"] = 0): Hold => ({
	frames,
	grabbed: frames[0] as string,
	at: { x: cx - talk.w / 2, y: cy - talk.h / 2 },
	dir,
});
const aim = (frames: string[], cx: number, cy: number, dir: Hold["dir"] = 0, prior: Aim | null = null) =>
	aimOf(deck, hold(frames, cx, cy, dir), ZOOM, prior);

/**
 * A slide's middle carried a page pixel at a time from `from` towards `to` along the band, the gap read each step as
 * the canvas reads it, the hand's way measured as it goes: where along the way each new gap opened.
 */
function carry(frames: string[], from: number, to: number): { at: number; gap: number }[] {
	let lean = leanAt(from);
	let gap: number | null = null;
	const opened: { at: number; gap: number }[] = [];
	const step = Math.sign(to - from);
	for (let x = from; x !== to + step; x += step) {
		lean = leanOf(lean, x, ZOOM);
		const next = gapOf(deck, hold(frames, x, 360, lean.dir), x, ZOOM, gap);
		if (next !== gap) opened.push({ at: x, gap: next });
		gap = next;
	}
	return opened;
}

describe("a slide carried along the band", () => {
	it("opens the next gap once its middle, read 0.3 of a slot ahead, is past half a slot: a quarter of the neighbour covered", () => {
		// b from its own slot to the right: c steps aside once b's middle is 0.2 of a slot and the stick past b's
		const opened = carry(["b"], SLOT + 640, 3 * SLOT + 640);
		expect(opened[0]).toEqual({ at: SLOT + 640, gap: 1 });
		const stick = 6 / ZOOM;
		expect(opened[1]?.gap).toBe(2);
		expect(opened[1]?.at).toBe(Math.floor(SLOT + 640 + 0.2 * SLOT + stick) + 1);
	});

	it("moves nothing under a hand held still or trembling a few pixels on a boundary", () => {
		// carried on until c has just stepped aside, then trembling three screen pixels either way for two seconds
		const opened = carry(["b"], SLOT + 640, 3 * SLOT);
		const edge = opened.find((one) => one.gap === 2)?.at ?? 0;
		let lean = leanOf(leanAt(SLOT + 640), edge, ZOOM);
		let gap = gapOf(deck, hold(["b"], edge, 360, lean.dir), edge, ZOOM, 1);
		expect(gap).toBe(2);
		for (let i = 0; i < 120; i++) {
			const x = edge + ((i % 2 === 0 ? 3 : -3) * ((i % 3) + 1)) / 3 / ZOOM;
			lean = leanOf(lean, x, ZOOM);
			gap = gapOf(deck, hold(["b"], x, 360, lean.dir), x, ZOOM, gap);
			expect(lean.dir).toBe(1);
			expect(gap).toBe(2);
		}
	});

	it("moves the last slide at the same point as one in the middle, going out and coming back", () => {
		// how far past a slide's own slot the middle goes before the gap moves, and how far back before it returns
		const at = (from: number, to: number) => {
			const out = carry(["a"], from * SLOT + 640, to * SLOT + 640 + SLOT);
			const there = [...out].reverse().find((one) => one.gap === to)?.at ?? 0;
			const back = carry(["a"], there + SLOT, from * SLOT + 640);
			return {
				out: (out.find((one) => one.gap === to)?.at ?? 0) - (to - 1) * SLOT,
				back: to * SLOT - (back.find((one) => one.gap === to - 1)?.at ?? 0),
			};
		};
		// a, taken out, leaves b c d: its gap 2 is in the middle of them, its gap 3 the end
		const middle = at(0, 2);
		const end = at(0, 3);
		expect(end).toEqual(middle);
	});

	it("holds the gap at the band's ends wherever the hand goes past them", () => {
		expect(aim(["b"], 9000, 360, 1)?.rule).toEqual({ kind: "reorder", frame: "b", to: 3 });
		expect(aim(["b"], -4000, 360, -1)?.rule).toEqual({ kind: "reorder", frame: "b", to: 0 });
	});
});

describe("a frame held over a deck page", () => {
	it("goes into the talk at the gap from anywhere over the band, and never trades", () => {
		// over the middle of b, of its left edge and of its right: always the gap the middle reads
		expect(aim(["x"], SLOT + 640, 360)?.rule).toEqual({ kind: "insert", frames: ["x"], at: 1 });
		expect(aim(["x"], SLOT + 1100, 360)?.rule).toEqual({ kind: "insert", frames: ["x"], at: 1 });
		expect(aim(["x"], 2 * SLOT + 100, 360)?.rule).toEqual({ kind: "insert", frames: ["x"], at: 2 });
		expect(aim(["x"], 9000, 400)?.deck.line).toEqual(["a", "b", "c", "d", "x"]);
		expect(aim(["x"], -900, 400)?.deck.line).toEqual(["x", "a", "b", "c", "d"]);
	});

	it("brings several in as one block in the order they stood, the gap as wide as the block", () => {
		// y grabbed: it lands where its middle reads, x before it, and the slides after part by two
		const both = aim(["y", "x"], 2 * SLOT + 640, 360);
		expect(both?.deck.line).toEqual(["a", "x", "y", "b", "c", "d"]);
		expect(both?.gap).toBe(1);
	});

	it("takes a slide out once its middle is past the band's lower edge, with give either way", () => {
		const edge = 720 + 160;
		const give = 10 / ZOOM;
		const band = aim(["b"], SLOT + 640, 360);
		expect(aim(["b"], SLOT + 640, edge + give - 1, 0, band)?.gap).toBe(1);
		const out = aim(["b"], SLOT + 640, edge + give + 1, 0, band);
		expect(out?.gap).toBeNull();
		expect(out?.deck.line).toEqual(["a", "c", "d"]);
		expect(aim(["b"], SLOT + 640, edge - give + 1, 0, out)?.gap).toBeNull();
		expect(aim(["b"], SLOT + 640, edge - give - 1, 0, out)?.gap).toBe(1);
		// over the cell y rests in, y is pushed down the column to make room
		const over = aim(["b"], SLOT + 640, 1360 + 360, 0, out);
		expect(over?.rule).toEqual({ kind: "place", frames: ["b"], cell: { col: 1, row: 1 } });
		expect(over?.deck.loose).toContainEqual({ folder: "y", col: 1, row: 2 });
	});

	it("pushes a loose frame down only once the middle of what is held is over it, and holds a cell within its slack", () => {
		// y rests in column 1; x held in the gap beside it stays in its own cell, and nobody moves
		const beside = aim(["x"], 1360, 1360 + 360);
		expect(beside?.rule).toEqual({ kind: "place", frames: ["x"], cell: { col: 0, row: 1 } });
		expect(beside?.same).toBe(true);
		const over = aim(["x"], 1500, 1360 + 360);
		expect(over?.deck.loose).toContainEqual({ folder: "y", col: 1, row: 2 });
		// back towards x's own cell: y's stays taken until the middle is the slack off its edge
		const boundary = 1440;
		expect(aim(["x"], boundary - 4 / ZOOM, 1360 + 360, -1, over)?.rule).toEqual(over?.rule);
		expect(aim(["x"], boundary - 40 / ZOOM, 1360 + 360, -1, over)?.rule).not.toEqual(over?.rule);
	});

	it("says a frame let go where it stood changes nothing", () => {
		expect(aim(["x"], 640, 1360 + 360)?.same).toBe(true);
		expect(aim(["b"], SLOT + 640, 360)?.same).toBe(true);
		expect(aim(["x"], 640, 360)?.same).toBe(false);
	});
});

describe("the band scrolling under a hand at the canvas's side", () => {
	const reach = bandReach(talk, 30);
	const k = 0.1;
	const pan = (pointer: number, x: number) =>
		edgePan({ pointer, width: 1000, camera: { x, k }, talk, reach, dt: 0.1 }) - x;

	it("scrolls faster the deeper the hand, as the depth squared, up to ten slots a second", () => {
		expect(pan(100, -2000)).toBe(0);
		expect(pan(36, -2000)).toBeCloseTo(0.25 * 10 * SLOT * k * 0.1);
		expect(pan(0, -2000)).toBeCloseTo(10 * SLOT * k * 0.1);
		expect(pan(-50, -2000)).toBeCloseTo(10 * SLOT * k * 0.1);
		expect(pan(1000, -2000)).toBeCloseTo(-10 * SLOT * k * 0.1);
	});

	it("stops with an end of the band 36 pixels in from the side, and never takes a band back from further in", () => {
		expect(pan(0, 30)).toBeCloseTo(6);
		expect(pan(0, 36)).toBe(0);
		expect(pan(0, 200)).toBe(0);
		const end = 1000 - 36 - reach.to * k;
		expect(pan(1000, end + 5)).toBeCloseTo(-5);
		expect(pan(1000, end)).toBe(0);
		// a short band that fits scrolls neither way
		const short = bandReach(talk, 5);
		const fit = (1000 - 72) / short.to;
		for (const pointer of [0, 1000])
			expect(edgePan({ pointer, width: 1000, camera: { x: 36, k: fit }, talk, reach: short, dt: 0.1 })).toBe(36);
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
