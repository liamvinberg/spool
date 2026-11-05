import { expect, it } from "vitest";
import { clipLayout } from "./record";

it("centres the frame in the post's shape, drawn sharp at the size it takes there", () => {
	expect(clipLayout({ w: 400, h: 300 }, "16:9")).toEqual({ width: 1920, height: 1080, scale: 3, x: 360, y: 90 });
	expect(clipLayout({ w: 1440, h: 900 }, "1:1")).toEqual({ width: 1080, height: 1080, scale: 0.75, x: 0, y: 203 });
});

it("gives the frame's own shape at a post's pixel count, in even sizes an encoder takes", () => {
	const { width, height, x, y } = clipLayout({ w: 375, h: 812 }, "frame");
	expect((width % 2) + (height % 2)).toBe(0);
	expect(width / height).toBeCloseTo(375 / 812, 2);
	expect(width * height).toBeLessThanOrEqual(1920 * 1080);
	expect(Math.max(x, y)).toBeLessThanOrEqual(1);
});
