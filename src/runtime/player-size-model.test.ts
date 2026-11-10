import { describe, expect, it } from "vitest";
import {
	fitScale,
	heightStops,
	holdAt,
	marked,
	pullAt,
	pullRest,
	stopWord,
	widthStops,
	zoneAt,
} from "./player-size-model";

const landing = { w: 1280, h: 720 };
const room = { w: 1440, h: 870 };

describe("a pull", () => {
	it("holds softly on a device's width or the frame's own, and only within reach of it", () => {
		const stops = widthStops(landing);
		expect(stops).toEqual([390, 834, 1280, 1440, 1920]);
		expect(holdAt(402, 320, 1416, stops)).toEqual({ v: 390, snap: 390 });
		expect(holdAt(1268, 320, 1416, stops)).toEqual({ v: 1280, snap: 1280 });
		// past the snap's reach the size is the hand's, on a whole even number so the box centres on a pixel
		expect(holdAt(406.6, 320, 1416, stops)).toEqual({ v: 406, snap: null });
		// a stop the desk has no room for holds nothing
		expect(holdAt(1914, 320, 1416, stops).snap).toBe(null);
		// a phone's height is a stop for heights too
		expect(heightStops(landing)).toContain(844);
	});

	it("stretches a little past the most the desk allows and resists below the least", () => {
		// far past the most: never more than 8 over it
		expect(holdAt(5000, 320, 1000, [])).toEqual({ v: 1008, snap: null });
		// just past it: a little over, growing slower than the hand
		expect(holdAt(1016, 320, 1000, []).v).toBe(1008);
		expect(holdAt(1004, 320, 1000, []).v).toBe(1004);
		// far under the least: never more than 36 under it
		expect(holdAt(0, 320, 1000, [])).toEqual({ v: 284, snap: null });
	});

	it("moves only the side pulled, its edge under the pointer, the other side kept past the room too", () => {
		// Tablet in a room 872 tall: drawn at 73% for its 1194 height
		const tall = { w: 1440, h: 872 };
		const tablet = { w: 834, h: 1194 };
		const s = fitScale(tablet, tall);
		const edge = (tablet.w * s) / 2;
		const grab = { sx: 1, sy: 0, x: edge + 6, y: 40, ...tablet, s } as const;
		const held = pullAt(grab, edge + 56, 90, landing, tall);
		expect(held.h).toBe(1194);
		// drawn at the scale that height keeps it at, the edge has come the pointer's 50px, so it is still under it
		expect(Math.abs((held.w * fitScale(held, tall)) / 2 - (edge + 50))).toBeLessThanOrEqual(1);
		expect(pullRest(grab, held, tall)).toEqual({ w: held.w, h: 1194 });
		// a corner moves both, as far as the desk has room for
		const corner = pullAt({ ...grab, sy: 1, y: 300 }, edge + 56, 310, landing, tall);
		expect(corner.h).toBeLessThan(1194);
		expect(pullRest({ ...grab, sy: 1, y: 300 }, corner, tall).h).toBe(Math.round((tall.h - 24) / s / 2) * 2);
	});

	it("names the stop it holds on: the device of that width, or as drawn at the frame's own size", () => {
		expect(stopWord(390, 720, landing)).toBe("phone");
		expect(stopWord(1280, 720, landing)).toBe("as drawn");
		expect(stopWord(1280, 700, landing)).toBe(null);
		expect(stopWord(500, 720, landing)).toBe(null);
	});
});

describe("the grips on the desk", () => {
	const box = { w: 1280, h: 720 };

	it("grabs an edge or a corner from just outside the frame, and never from inside it", () => {
		// the pointer against the box's centre: 640 is the right edge
		expect(zoneAt(600, 0, box, room)).toBe(null);
		expect(zoneAt(646, 10, box, room)).toEqual({ sx: 1, sy: 0, hit: true, strength: 1 });
		expect(zoneAt(-646, 0, box, room)?.sx).toBe(-1);
		expect(zoneAt(646, 366, box, room)).toEqual({ sx: 1, sy: 1, hit: true, strength: 1 });
	});

	it("shows a grip fading in on the way to an edge, before it can be grabbed", () => {
		const near = zoneAt(640 + 43, 0, box, room);
		expect(near).toEqual({ sx: 1, sy: 0, hit: false, strength: 0.5 });
		expect(zoneAt(640 + 80, 0, box, room)).toBe(null);
	});

	it("has no grip on an edge with less than a gutter of desk past it", () => {
		// the frame fills the window's width: its sides have nowhere to be grabbed, its ends still do
		const wide = { w: 1430, h: 720 };
		expect(zoneAt(720, 0, wide, room)).toBe(null);
		expect(zoneAt(0, 366, wide, room)?.sy).toBe(1);
	});
});

describe("the row the menu marks", () => {
	it("is the row picked, even where another row has the same size", () => {
		const phone = { w: 390, h: 844 };
		expect(marked({ id: "phone", size: phone }, phone, room)).toBe("phone");
		expect(marked({ id: "drawn", size: phone }, phone, room)).toBe("drawn");
	});

	it("is the first row of a size pulled by hand, or none", () => {
		expect(marked({ id: null, size: { w: 834, h: 1194 } }, landing, room)).toBe("tablet");
		expect(marked({ id: null, size: { w: 1280, h: 720 } }, landing, room)).toBe("drawn");
		expect(marked({ id: null, size: { w: 1440, h: 870 } }, landing, room)).toBe("window");
		expect(marked({ id: null, size: { w: 600, h: 720 } }, landing, room)).toBe(null);
	});
});
