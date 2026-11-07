import { expect, it } from "vitest";
import { clipLayout, clipParts } from "./record";

it("centres the frame in the post's shape, drawn sharp at the size it takes there", () => {
	expect(clipLayout({ w: 400, h: 300 }, "16:9")).toEqual({ width: 1920, height: 1080, scale: 3, x: 360, y: 90 });
	expect(clipLayout({ w: 1440, h: 900 }, "1:1")).toEqual({ width: 2160, height: 2160, scale: 1.5, x: 0, y: 405 });
});

it("grows a clip past 1080p until the frame is as sharp as a Mac's screen drew it", () => {
	expect(clipLayout({ w: 1448, h: 814 }, "16:9")).toMatchObject({ width: 2896, height: 1630, scale: 2 });
});

it("gives the frame's own shape at a post's pixel count, in even sizes an encoder takes", () => {
	const { width, height, x, y } = clipLayout({ w: 375, h: 812 }, "frame");
	expect((width % 2) + (height % 2)).toBe(0);
	expect(width / height).toBeCloseTo(375 / 812, 2);
	expect(width * height).toBeLessThanOrEqual(1920 * 1080);
	expect(Math.max(x, y)).toBeLessThanOrEqual(1);
});

it("splits a clip into parts that cover it in order, the later ones shorter for the replay they start with", () => {
	const parts = clipParts(18, 3618, 4);
	expect(parts[0]?.from).toBe(18);
	expect(parts.at(-1)?.to).toBe(3618);
	for (const [index, part] of parts.entries()) if (index > 0) expect(part.from).toBe(parts[index - 1]?.to);
	const lengths = parts.map((part) => part.to - part.from);
	expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
	// a clip too short to be worth more than one browser stays in one
	expect(clipParts(0, 90, 4)).toEqual([{ from: 0, to: 90 }]);
});
