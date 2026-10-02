import { describe, expect, it } from "vitest";
import { framesOnScreen } from "./booth-view";

const frame = (name: string, x: number, y: number, w = 100, h = 100) => ({ name, x, y, w, h });

describe("the frames a resting camera shows", () => {
	it("names every frame the viewport reaches, partly or whole, and none past it", () => {
		const frames = [frame("inside", 10, 10), frame("edge", 950, 10), frame("beyond", 1100, 10)];
		expect(framesOnScreen(frames, { x: 0, y: 0, k: 1 }, { width: 1000, height: 800 })).toEqual(["inside", "edge"]);
	});

	it("reads the viewport through the camera's pan and zoom", () => {
		const frames = [frame("near", 0, 0), frame("far", 4000, 0)];
		// zoomed out to a tenth, the far frame is 400 px in
		expect(framesOnScreen(frames, { x: 0, y: 0, k: 0.1 }, { width: 1000, height: 800 })).toEqual(["near", "far"]);
		// panned so the world starts 3900 to the left
		expect(framesOnScreen(frames, { x: -3900, y: 0, k: 1 }, { width: 1000, height: 800 })).toEqual(["far"]);
	});

	it("shows nothing before there is a camera or a viewport to show it in", () => {
		const frames = [frame("inside", 10, 10)];
		expect(framesOnScreen(frames, null, { width: 1000, height: 800 })).toEqual([]);
		expect(framesOnScreen(frames, { x: 0, y: 0, k: 1 }, null)).toEqual([]);
		expect(framesOnScreen(frames, { x: 0, y: 0, k: 1 }, { width: 0, height: 0 })).toEqual([]);
	});
});
