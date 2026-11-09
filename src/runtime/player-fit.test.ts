import { expect, it } from "vitest";
import { fittedBox, fittedScale } from "./player-fit";

it("lays a frame bigger than the room out at its authored size, shrunk until all of it fits", () => {
	const room = { w: 1000, h: 610 };
	// too short: the authored box, shrunk by the height
	const short = fittedBox({ w: 1440, h: 944 }, room);
	expect(short).toEqual({ w: 1440, h: 944 });
	expect(fittedScale(short, room)).toBeCloseTo(610 / 944);
	// too wide for a tall window: shrunk by the width, and the room below it is the frame's too
	const tall = { w: 1000, h: 1200 };
	const wide = fittedBox({ w: 1440, h: 944 }, tall);
	expect(wide).toEqual({ w: 1440, h: 1728 });
	expect(fittedScale(wide, tall)).toBeCloseTo(1000 / 1440);
	expect(wide.h * fittedScale(wide, tall)).toBeLessThanOrEqual(tall.h);
});

it("gives a frame that fits the room the box responsive gives it, unscaled", () => {
	const room = { w: 1512, h: 915 };
	const box = fittedBox({ w: 390, h: 844 }, room);
	expect(box).toEqual({ w: 390, h: 915 });
	expect(fittedScale(box, room)).toBe(1);
});
