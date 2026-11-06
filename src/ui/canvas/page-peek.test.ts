import { describe, expect, it } from "vitest";
import { canLand, peekFit, placesAt, worldAt } from "./page-peek";

describe("the peek's map", () => {
	/** a frame let go on a spot of the map lands on the folder's canvas under that spot */
	it("fits a folder's frames in the box, centred, and reads a point on it back as the world under it", () => {
		const frames = [
			{ x: 100, y: 50, w: 400, h: 300 },
			{ x: 700, y: 50, w: 400, h: 300 },
		];
		const fit = peekFit(frames, 296, 184, 12);
		// the wider of the two sides decides: 1000 world px across 272 map px
		expect(fit.s).toBeCloseTo(272 / 1000);
		// the frames' middle is the box's middle
		const middle = worldAt(fit, 148, 92);
		expect(middle.x).toBeCloseTo(600);
		expect(middle.y).toBeCloseTo(200);
		// the box's padded corner is the frames' corner
		const corner = worldAt(fit, 12, 92 - (300 * fit.s) / 2);
		expect(corner.x).toBeCloseTo(100);
		expect(corner.y).toBeCloseTo(50);
	});

	it("centres the frames carried on the spot, each keeping its place among the others", () => {
		const placed = placesAt(
			[
				{ name: "a", x: 0, y: 0, w: 100, h: 80 },
				{ name: "b", x: 140, y: 20, w: 100, h: 80.4 },
			],
			{ x: 1000, y: 500.6 },
		);
		expect(placed).toEqual({
			a: { x: 880, y: 450, w: 100, h: 80 },
			b: { x: 1020, y: 470, w: 100, h: 80 },
		});
	});
});

describe("canLand", () => {
	const pageOf = (name: string) => name.slice(0, Math.max(0, name.lastIndexOf("/")));

	it("takes frames anywhere but the page they are all on already", () => {
		const carried = { kind: "frame" as const, names: ["shop/cart", "shop/pay"] };
		expect(canLand(carried, "shop", pageOf)).toBe(false);
		expect(canLand(carried, "app", pageOf)).toBe(true);
		expect(canLand({ kind: "frame", names: ["shop/cart", "home"] }, "shop", pageOf)).toBe(true);
	});

	it("takes a page anywhere but into itself, under itself, or where it already is", () => {
		const carried = { kind: "page" as const, names: ["explore/checkout"] };
		expect(canLand(carried, "explore/checkout", pageOf)).toBe(false);
		expect(canLand(carried, "explore/checkout/tipping", pageOf)).toBe(false);
		expect(canLand(carried, "explore", pageOf)).toBe(false);
		expect(canLand(carried, "app", pageOf)).toBe(true);
	});
});
