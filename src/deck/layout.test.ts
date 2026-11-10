import { describe, expect, it } from "vitest";
import { type Box, cellBox, type DeckFrame, placesOf, reconcilePlan, settle } from "./layout";

const talk = { w: 1280, h: 720 };
/** where `frames` stand once a plan's writes have landed */
const landed = (frames: readonly DeckFrame[], writes: ReadonlyMap<string, Box>): DeckFrame[] =>
	frames.map((frame) => {
		const at = writes.get(frame.folder);
		return at === undefined ? frame : { folder: frame.folder, size: { w: at.w, h: at.h }, at };
	});
const placed = (folder: string, at: Box): DeckFrame => ({ folder, size: { w: at.w, h: at.h }, at });

describe("a deck's layout", () => {
	it("puts the talk on the band and every other frame in a cell under it, each centred in its own", () => {
		const deck = settle(
			talk,
			["title", "phone", "close"],
			[
				{ folder: "title" },
				{ folder: "phone", size: { w: 390, h: 844 } },
				{ folder: "close" },
				{ folder: "draft" },
				{ folder: "wide", size: { w: 1600, h: 400 } },
			],
		);
		expect(Object.fromEntries(placesOf(deck))).toEqual({
			title: { x: 0, y: 0, w: 1280, h: 720 },
			// a frame of another shape keeps its size, centred in its slot
			phone: { x: 1440 + 445, y: -62, w: 390, h: 844 },
			close: { x: 2880, y: 0, w: 1280, h: 720 },
			// the first row under the band starts at h + 640, filled under the talk left to right
			draft: { x: 0, y: 1360, w: 1280, h: 720 },
			wide: { x: 1440 - 160, y: 1360 + 160, w: 1600, h: 400 },
		});
	});

	it("writes only what differs, and nothing the second time", () => {
		const frames: DeckFrame[] = [
			placed("title", { x: 500, y: 2000, w: 1280, h: 720 }),
			placed("sense", { x: 0, y: 0, w: 1280, h: 720 }),
			{ folder: "fresh", size: { w: 1280, h: 720 } },
			placed("draft", { x: 3010, y: 1400, w: 1280, h: 720 }),
		];
		const first = reconcilePlan(talk, ["sense", "title"], frames);
		// sense is already in slot 0; title moves to slot 1, fresh gets a place, the draft snaps to its cell
		expect([...first.keys()]).toEqual(["draft", "fresh", "title"]);
		expect(first.get("draft")).toEqual(cellBox(talk, { col: 2, row: 1 }));
		expect(reconcilePlan(talk, ["sense", "title"], landed(frames, first)).size).toBe(0);
		// a size a hand wrote in fractions is placed once, in whole pixels
		const odd: DeckFrame[] = [
			{ folder: "phone", size: { w: 391.4, h: 844.4 } },
			{ folder: "note", size: { w: 101.4, h: 33.5 } },
		];
		const placedOnce = reconcilePlan(talk, ["phone"], odd);
		expect(placedOnce.get("phone")).toEqual({ x: 445, y: -62, w: 391, h: 844 });
		expect(reconcilePlan(talk, ["phone"], landed(odd, placedOnce)).size).toBe(0);
	});

	it("settles the same whatever order it finds the frames in, and a shared cell goes to the first by name", () => {
		const cell = cellBox(talk, { col: 0, row: 1 });
		const frames: DeckFrame[] = [
			placed("b", cell),
			placed("a", cell),
			placed("c", { ...cell, x: cell.x + 30 }),
			{ folder: "d" },
		];
		const plan = reconcilePlan(talk, [], frames);
		expect(reconcilePlan(talk, [], [...frames].reverse())).toEqual(plan);
		expect(reconcilePlan(talk, [], [frames[2], frames[0], frames[3], frames[1]] as DeckFrame[])).toEqual(plan);
		// a keeps the cell; b and c, near it, take the nearest free cells, and the frame with no place the next
		expect(plan.has("a")).toBe(false);
		expect(Object.fromEntries(plan)).toEqual({
			b: cellBox(talk, { col: 0, row: 2 }),
			c: cellBox(talk, { col: 1, row: 1 }),
			d: cellBox(talk, { col: 0, row: 3 }),
		});
	});

	it("takes a frame left on the band by a hand under it, near where it was", () => {
		const plan = reconcilePlan(
			talk,
			["a"],
			[placed("a", { x: 0, y: 0, ...talk }), placed("gone", { x: 4320, y: 0, ...talk })],
		);
		expect(plan.get("gone")).toEqual(cellBox(talk, { col: 3, row: 1 }));
	});

	it("lays out exactly these boxes, whose every number is version 1's: a change here is a new DECK_VERSION", () => {
		// two spools on one deck must lay it out alike, or they rewrite each other's places for ever; deck.json's
		// version is what keeps them apart, so any change to these numbers, ties or rounding is a new version
		const frames: DeckFrame[] = [
			{ folder: "b-phone", size: { w: 390.4, h: 844.6 } },
			{ folder: "a-title" },
			placed("c-wide", { x: 0, y: 0, w: 1600, h: 300 }),
			placed("m", { x: 1160, y: 1240, w: 1000, h: 600 }),
			placed("l", { x: 1160, y: 1240, w: 1000, h: 600 }),
			placed("k", { x: 1190, y: 1250, w: 1000, h: 600 }),
			{ folder: "z-small", size: { w: 333, h: 111 } },
			placed("y", { x: -5000, y: 3000, w: 1000, h: 600 }),
		];
		const deck = settle({ w: 1000, h: 600 }, ["c-wide", "ghost", "b-phone", "a-title", "c-wide"], frames);
		expect(Object.fromEntries(placesOf(deck))).toEqual({
			"c-wide": { x: -300, y: 150, w: 1600, h: 300 },
			"b-phone": { x: 1465, y: -122, w: 390, h: 845 },
			"a-title": { x: 2320, y: 0, w: 1000, h: 600 },
			l: { x: 1160, y: 1240, w: 1000, h: 600 },
			m: { x: 0, y: 1240, w: 1000, h: 600 },
			k: { x: 1160, y: 2160, w: 1000, h: 600 },
			y: { x: -4640, y: 3080, w: 1000, h: 600 },
			"z-small": { x: 2654, y: 1485, w: 333, h: 111 },
		});
	});
});
