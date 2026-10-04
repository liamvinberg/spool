// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECK_EVERY_MS, CROWDED_FRAME_MS, watchRestStrain } from "./rest-strain";

/** A canvas at rest whose display frames run when asked, this far apart. */
function setup(worth = () => true) {
	let now = 0;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const frames: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frames.push(callback);
		return frames.length;
	});
	const crowded = vi.fn();
	const stop = watchRestStrain({ worthChecking: () => worth(), crowded });
	return {
		crowded,
		stop,
		/** one check: its wait, then a sample of display frames `gap` apart */
		check(gap: number, during?: () => void) {
			now += CHECK_EVERY_MS;
			vi.advanceTimersByTime(CHECK_EVERY_MS);
			during?.();
			for (let frame = 0; frame < 20 && frames.length > 0; frame++) {
				now += gap;
				for (const callback of frames.splice(0)) callback(now);
			}
		},
		frames,
	};
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("frames holding back a canvas at rest", () => {
	it("are never blamed while the canvas keeps up", () => {
		const canvas = setup();
		for (let check = 0; check < 10; check++) canvas.check(8);
		expect(canvas.crowded).not.toHaveBeenCalled();
	});

	it("are held once the canvas is late twice running, and not on one late moment", () => {
		const canvas = setup();
		canvas.check(CROWDED_FRAME_MS + 20);
		canvas.check(8);
		canvas.check(CROWDED_FRAME_MS + 20);
		expect(canvas.crowded).not.toHaveBeenCalled();
		canvas.check(CROWDED_FRAME_MS + 20);
		expect(canvas.crowded).toHaveBeenCalledTimes(1);
	});

	it("are not sampled at all when nothing running could be held", () => {
		const canvas = setup(() => false);
		canvas.check(200);
		canvas.check(200);
		expect(canvas.crowded).not.toHaveBeenCalled();
		expect(canvas.frames).toEqual([]);
	});

	it("are never blamed for a sample something else interrupted", () => {
		let worth = true;
		const canvas = setup(() => worth);
		canvas.check(200);
		// the camera moved while the second sample ran
		canvas.check(200, () => {
			worth = false;
		});
		worth = true;
		canvas.check(200);
		expect(canvas.crowded).not.toHaveBeenCalled();
	});

	it("stop being watched when the canvas goes", () => {
		const canvas = setup();
		canvas.stop();
		canvas.check(200);
		canvas.check(200);
		expect(canvas.crowded).not.toHaveBeenCalled();
	});
});
