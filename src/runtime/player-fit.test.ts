import { expect, it } from "vitest";
import { fittedBox, fittedScale } from "./player-fit";

it("plays a screen at its authored size, shrunk only as far as the room needs and never stretched", () => {
	// a phone in a big window: its own size, unscaled, with no room below invented for it
	const big = { w: 2000, h: 1070 };
	const phone = fittedBox({ w: 390, h: 844 }, big);
	expect(phone).toEqual({ w: 390, h: 844 });
	expect(fittedScale(phone, big)).toBe(1);
	// a desktop frame in a small window (spool#553): all of it, shrunk by the height
	const small = { w: 1000, h: 610 };
	const desktop = fittedBox({ w: 1440, h: 944 }, small);
	expect(desktop).toEqual({ w: 1440, h: 944 });
	expect(fittedScale(desktop, small)).toBeCloseTo(0.646, 3);
});

it("plays a page too long to show whole at its width's own scale, as tall as the window, scrolling", () => {
	// showing all 5523 would cost more than half the size its width allows
	const laptop = { w: 1512, h: 915 };
	const landing = fittedBox({ w: 1440, h: 5523 }, laptop);
	expect(landing).toEqual({ w: 1440, h: 915 });
	expect(fittedScale(landing, laptop)).toBe(1);
	// narrower than its width: shrunk by the width, and its box fills the window's height at that scale
	const narrow = { w: 1000, h: 640 };
	const shrunk = fittedBox({ w: 1440, h: 5523 }, narrow);
	expect(shrunk).toEqual({ w: 1440, h: 921 });
	expect(fittedScale(shrunk, narrow)).toBeCloseTo(1000 / 1440);
	expect(shrunk.h * fittedScale(shrunk, narrow)).toBeLessThanOrEqual(narrow.h);
});
