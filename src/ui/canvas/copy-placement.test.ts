import { describe, expect, it } from "vitest";
import { COPY_CASCADE_PX, placeCopies } from "./copy-placement";

const step = COPY_CASCADE_PX;
const view = { x: 1000, y: 1000, w: 800, h: 600 };

describe("placeCopies", () => {
	it("steps a duplicate off its original", () => {
		const frames = [{ name: "home", x: 0, y: 0, w: 390, h: 844 }];
		const rects = placeCopies([{ from: "home", to: "home-copy" }], frames, { beside: true, viewPage: "", view });
		expect(rects).toEqual({ "home-copy": { x: step, y: step, w: 390, h: 844 } });
	});

	it("keeps stepping past a copy already sitting there", () => {
		const frames = [
			{ name: "home", x: 0, y: 0, w: 390, h: 844 },
			{ name: "home-copy", x: step, y: step, w: 390, h: 844 },
		];
		const rects = placeCopies([{ from: "home", to: "home-copy-2" }], frames, { beside: true, viewPage: "", view });
		expect(rects["home-copy-2"]).toEqual({ x: 2 * step, y: 2 * step, w: 390, h: 844 });
	});

	it("pastes beside a source that is in view", () => {
		const frames = [{ name: "home", x: 1100, y: 1100, w: 100, h: 100 }];
		const rects = placeCopies([{ from: "home", to: "home-copy" }], frames, { beside: false, viewPage: "", view });
		expect(rects["home-copy"]).toEqual({ x: 1100 + step, y: 1100 + step, w: 100, h: 100 });
	});

	it("pastes into the middle of the view when the source is out of sight, keeping the group's shape", () => {
		const frames = [
			{ name: "home", x: 0, y: 0, w: 100, h: 100 },
			{ name: "about", x: 200, y: 0, w: 100, h: 100 },
		];
		const rects = placeCopies(
			[
				{ from: "home", to: "shop/home", page: "shop" },
				{ from: "about", to: "shop/about", page: "shop" },
			],
			frames,
			{ beside: false, viewPage: "shop", view },
		);
		expect(rects).toEqual({
			"shop/home": { x: 1250, y: 1250, w: 100, h: 100 },
			"shop/about": { x: 1450, y: 1250, w: 100, h: 100 },
		});
	});

	it("never moves a duplicate to the view, even out of sight", () => {
		const frames = [{ name: "home", x: 0, y: 0, w: 100, h: 100 }];
		const rects = placeCopies([{ from: "home", to: "home-copy" }], frames, { beside: true, viewPage: "", view });
		expect(rects["home-copy"]).toMatchObject({ x: step, y: step });
	});

	it("skips copies whose source it cannot find", () => {
		expect(placeCopies([{ from: "gone", to: "gone-copy" }], [], { beside: true, viewPage: "", view })).toEqual({});
	});
});
