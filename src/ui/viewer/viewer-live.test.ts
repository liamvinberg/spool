import { describe, expect, it } from "vitest";
import { chooseLive, KEEP_PX, LIVE_LIMIT, type LiveInput, READABLE_PX } from "./viewer-live";

const VIEW = { w: 1000, h: 800 };
const none = new Set<string>();

/** A row of 800 x 600 frames, 1000 apart. */
const row = (count: number) =>
	Array.from({ length: count }, (_, i) => ({ name: `f${i}`, x: i * 1000, y: 0, w: 800, h: 600 }));

const input = (more: Partial<LiveInput>): LiveInput => ({
	frames: row(3),
	camera: { x: 0, y: 0, k: 1 },
	viewport: VIEW,
	stale: none,
	focus: null,
	was: none,
	failed: none,
	...more,
});

describe("which frames hold a document", () => {
	it("makes frames live at readable size near the view, nearest the middle first", () => {
		// f0 fills the view; f1 is in the ring past its right edge; f2 is beyond it
		expect(chooseLive(input({ camera: { x: 100, y: 100, k: 1 } }))).toEqual(["f0", "f1"]);
	});

	it("keeps every frame drawn too small to read as its picture or placeholder", () => {
		const k = (READABLE_PX - 1) / 800;
		expect(chooseLive(input({ camera: { x: 0, y: 0, k } }))).toEqual([]);
	});

	it("holds a live frame through small changes at the threshold and the ring's edge", () => {
		// just under readable: a new frame waits, a live one stays
		const k = (KEEP_PX + 10) / 800;
		expect(chooseLive(input({ camera: { x: 0, y: 0, k } }))).toEqual([]);
		expect(chooseLive(input({ camera: { x: 0, y: 0, k }, was: new Set(["f0"]) }))).toEqual(["f0"]);
		// past the keep size it goes
		const small = (KEEP_PX - 10) / 800;
		expect(chooseLive(input({ camera: { x: 0, y: 0, k: small }, was: new Set(["f0"]) }))).toEqual([]);
		// past the ring a new frame waits, a live one stays until the wider ring
		const far = { x: -1100, y: 0, k: 1 };
		expect(chooseLive(input({ camera: far }))).toEqual(["f1", "f2"]);
		expect(chooseLive(input({ camera: far, was: new Set(["f0"]) }))).toEqual(["f1", "f2", "f0"]);
	});

	it("caps the documents, a live frame keeping its place over a new one about as near", () => {
		const wide = { camera: { x: 0, y: 0, k: 1 }, viewport: { w: 3000, h: 800 } };
		expect(chooseLive(input({ ...wide, limit: 2 }))).toEqual(["f1", "f2"]);
		expect(chooseLive(input({ ...wide, limit: 2, was: new Set(["f0"]) }))).toEqual(["f1", "f0"]);
		expect(
			chooseLive(input({ frames: row(40), camera: { x: 0, y: 0, k: 1 }, viewport: { w: 40000, h: 800 } })),
		).toHaveLength(LIVE_LIMIT);
	});

	it("makes a stale frame live on screen at any size, and only on screen", () => {
		const camera = { x: 0, y: 0, k: 0.1 };
		expect(chooseLive(input({ camera, stale: new Set(["f1"]) }))).toEqual(["f1"]);
		expect(chooseLive(input({ frames: row(20), camera, stale: new Set(["f15"]) }))).toEqual([]);
	});

	it("reads the frame under a pin at any size, and keeps what it read while the tool is out", () => {
		const camera = { x: 0, y: 0, k: 0.1 };
		expect(chooseLive(input({ camera, focus: "f2" }))).toEqual(["f2"]);
		expect(chooseLive(input({ camera, focus: "f1", placing: true, was: new Set(["f2"]) }))).toEqual(["f1", "f2"]);
		expect(chooseLive(input({ camera, focus: null, placing: false, was: new Set(["f1", "f2"]) }))).toEqual([]);
	});

	it("leaves a failed frame as its picture", () => {
		expect(chooseLive(input({ camera: { x: 100, y: 100, k: 1 }, failed: new Set(["f0"]) }))).toEqual(["f1"]);
	});
});
