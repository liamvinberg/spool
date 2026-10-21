import { describe, expect, it } from "vitest";
import type { HistoryStretch } from "../api";
import { compareLayout, framesTouched, setAsideFrame } from "./history-compare-model";

const stretch = (paths: string[]): HistoryStretch => ({
	from: 4,
	to: 9,
	start: 0,
	end: 0,
	by: { accountId: "ben", name: "ben", color: "#f0a", device: "mac" },
	saves: paths.length,
	setAside: 0,
	paths,
	more: 0,
});

describe("the frames a stretch touched", () => {
	it("in a frame's history is that frame, its imports' saves included", () => {
		expect(framesTouched(stretch(["shared/ui/order-button.tsx"]), { kind: "frame", frame: "cart" })).toEqual([
			"cart",
		]);
	});

	it("in the project's are the frames whose own files it saved, each once", () => {
		expect(
			framesTouched(
				stretch([
					"frames/checkout/receipt/frame.tsx",
					"frames/cart/frame.tsx",
					"frames/cart/frame.json",
					"shared/ui/order-button.tsx",
				]),
				{ kind: "project" },
			),
		).toEqual(["cart", "checkout/receipt"]);
	});
});

describe("the frame a set-aside save compares", () => {
	it("is the frame the file is in, or the frame whose history shows a shared file", () => {
		expect(setAsideFrame("frames/cart/frame.tsx", { kind: "project" })).toBe("cart");
		expect(setAsideFrame("shared/ui/order-button.tsx", { kind: "frame", frame: "cart" })).toBe("cart");
		expect(setAsideFrame("shared/ui/order-button.tsx", { kind: "project" })).toBeNull();
	});
});

describe("where Compare stands the frames", () => {
	it("puts the old frame where today's stood and slides today's aside past it", () => {
		expect(
			compareLayout([
				{ name: "cart", now: { x: 100, y: 50, w: 400, h: 300 }, then: { x: 0, y: 0, w: 480, h: 320 } },
			]),
		).toEqual({
			then: [{ name: "cart", box: { x: 100, y: 50, w: 400, h: 300 }, deleted: false }],
			now: [{ name: "cart", from: { x: 100, y: 50, w: 400, h: 300 }, to: { x: 580, y: 50, w: 400, h: 300 } }],
		});
	});

	it("brings a frame deleted since back in its old place, and moves today's past every old one", () => {
		const layout = compareLayout([
			{ name: "cart", now: { x: 0, y: 0, w: 400, h: 300 }, then: { x: 0, y: 0, w: 400, h: 300 } },
			{ name: "promo", now: null, then: { x: 500, y: 0, w: 300, h: 300 } },
		]);
		expect(layout.then).toEqual([
			{ name: "cart", box: { x: 0, y: 0, w: 400, h: 300 }, deleted: false },
			{ name: "promo", box: { x: 500, y: 0, w: 300, h: 300 }, deleted: true },
		]);
		// past the old frames' right edge (800), a gap on
		expect(layout.now).toEqual([
			{ name: "cart", from: { x: 0, y: 0, w: 400, h: 300 }, to: { x: 880, y: 0, w: 400, h: 300 } },
		]);
	});

	it("stands a frame that didn't exist then where today's is, to say so", () => {
		expect(compareLayout([{ name: "promo", now: { x: 0, y: 0, w: 300, h: 200 }, then: null }]).then).toEqual([
			{ name: "promo", box: { x: 0, y: 0, w: 300, h: 200 }, deleted: false },
		]);
	});
});
