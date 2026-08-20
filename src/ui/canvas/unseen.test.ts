import { describe, expect, it } from "vitest";
import type { Camera } from "../api";
import { advanceDwell, DWELL_MS, looked, TICK_MS } from "./unseen";

/** a phone frame at the origin, the shape the rule is hardest on */
const PHONE = { x: 0, y: 0, w: 390, h: 844 };
/** a landing page: the other shape, which will never fill a window's height */
const PAGE = { x: 0, y: 0, w: 1440, h: 900 };

const VW = 1200;
const VH = 800;

/** the camera that puts a box's top-left at (0, 0) at scale k */
const at = (k: number): Camera => ({ x: 0, y: 0, k });

describe("looked", () => {
	it("passes a phone frame that fills half the viewport's height", () => {
		// 844 * 0.48 = 405, past half of 800
		expect(looked(PHONE, at(0.48), VW, VH)).toBe(true);
	});

	it("fails the same frame one notch smaller", () => {
		// 844 * 0.44 = 371, and its width is nowhere near half of 1200
		expect(looked(PHONE, at(0.44), VW, VH)).toBe(false);
	});

	it("passes a landing page on its width, which is the only direction it can", () => {
		// 1440 * 0.45 = 648 across, 900 * 0.45 = 405 down: half the width, not the height
		expect(looked(PAGE, at(0.45), VW, VH)).toBe(true);
	});

	it("fails a frame that is off screen entirely", () => {
		expect(looked(PHONE, { x: -4000, y: 0, k: 1 }, VW, VH)).toBe(false);
	});

	it("fails a frame prominent across but showing a sliver down", () => {
		// ten viewports wide at 1:1, with 20px of its top edge on screen: the width
		// test alone would call this read
		const banner = { x: 0, y: 0, w: 12000, h: 4000 };
		expect(looked(banner, { x: 0, y: -3980, k: 1 }, VW, VH)).toBe(false);
	});

	it("passes a frame larger than the viewport that fills it", () => {
		const banner = { x: 0, y: 0, w: 12000, h: 4000 };
		expect(looked(banner, { x: -100, y: -100, k: 1 }, VW, VH)).toBe(true);
	});

	it("fails a frame more than half off the edge", () => {
		// 390 at 1:1, pushed left so only 150 of it is on screen
		expect(looked(PHONE, { x: -240, y: 0, k: 1 }, VW, VH)).toBe(false);
	});

	it("has no opinion without a viewport", () => {
		expect(looked(PHONE, at(1), 0, 0)).toBe(false);
	});
});

describe("advanceDwell", () => {
	it("names a frame only once it has held the whole dwell", () => {
		const held = new Map<string, number>();
		const ticks = Math.ceil(DWELL_MS / TICK_MS);
		for (let tick = 1; tick < ticks; tick++) {
			expect(advanceDwell(held, ["home"])).toEqual([]);
		}
		expect(advanceDwell(held, ["home"])).toEqual(["home"]);
	});

	it("drops the time a frame banked before it left the screen", () => {
		const held = new Map<string, number>();
		advanceDwell(held, ["home"], 800, 900);
		advanceDwell(held, []);
		expect(held.has("home")).toBe(false);
		expect(advanceDwell(held, ["home"], 800, 900)).toEqual([]);
	});

	it("counts every frame in view on its own clock", () => {
		const held = new Map<string, number>();
		advanceDwell(held, ["home", "pricing"], 500, 900);
		advanceDwell(held, ["home"], 300, 900);
		// pricing left, so it banked nothing; home is 800 in and one tick short
		expect(held.get("pricing")).toBeUndefined();
		expect(advanceDwell(held, ["home", "pricing"], 200, 900)).toEqual(["home"]);
		expect(held.get("pricing")).toBe(200);
	});

	it("forgets a frame once it has crossed, so it cannot cross twice", () => {
		const held = new Map<string, number>();
		expect(advanceDwell(held, ["home"], 900, 900)).toEqual(["home"]);
		expect(held.size).toBe(0);
	});
});
