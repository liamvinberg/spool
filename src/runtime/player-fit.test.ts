import { expect, it, onTestFinished, vi } from "vitest";
import { fittedBox, fittedScale, heldBox, readStart, writeStart } from "./player-fit";

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

it("plays a device or a pulled size whole, shrunk to the room, and keeps the long-page rule for As drawn", () => {
	const room = { w: 1440, h: 792 };
	const landing = { w: 1440, h: 5523 };
	// a tablet is a screen 1194 tall: all of it, smaller, never cut to the window's height
	const tablet = heldBox({ id: "tablet", size: { w: 834, h: 1194 } }, landing, room);
	expect(tablet).toEqual({ w: 834, h: 1194 });
	expect(fittedScale(tablet, room)).toBeCloseTo(0.663, 3);
	const pulled = heldBox({ id: null, size: { w: 600, h: 2000 } }, landing, room);
	expect(pulled).toEqual({ w: 600, h: 2000 });
	// as drawn, the same landing is still a page as wide as itself, scrolling
	expect(heldBox({ id: "drawn", size: landing }, landing, room)).toEqual({ w: 1440, h: 792 });
	// and Window is the whole room, whatever the frame was drawn at
	expect(heldBox({ id: "window", size: room }, { w: 390, h: 844 }, room)).toEqual(room);
});

it("starts where this browser last picked As drawn or Window, reading what older versions stored", () => {
	const stored = new Map<string, string>();
	vi.stubGlobal("window", {
		localStorage: {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => stored.set(key, value),
			removeItem: (key: string) => stored.delete(key),
		},
	});
	onTestFinished(() => {
		vi.unstubAllGlobals();
	});
	expect(readStart()).toBe("drawn");
	// responsive was Window's name before the size could be chosen, and still is in storage
	stored.set("spool:player-fit", "responsive");
	expect(readStart()).toBe("window");
	writeStart("drawn");
	expect(readStart()).toBe("drawn");
	writeStart("window");
	expect(stored.get("spool:player-fit")).toBe("responsive");
});
