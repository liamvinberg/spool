// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECK_EVERY_MS, CROWDED_FRAME_MS, watchRestStrain } from "./rest-strain";

const LATE = CROWDED_FRAME_MS + 20;

/** A canvas at rest with these frames running unattended, whose display frames run when asked. */
function setup(running: string[] = ["glass", "orbit"]) {
	let now = 0;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const frames: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frames.push(callback);
		return frames.length;
	});
	const canvas = {
		resting: true,
		running,
		held: new Set<string>(),
		frames,
		stop: () => {},
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
	};
	canvas.stop = watchRestStrain({
		resting: () => canvas.resting,
		suspects: () => canvas.running.filter((frame) => !canvas.held.has(frame)),
		hold: (frames) => {
			for (const frame of frames) canvas.held.add(frame);
		},
		release: (frames) => {
			for (const frame of frames) canvas.held.delete(frame);
		},
	});
	return canvas;
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
		expect(canvas.held).toEqual(new Set());
	});

	it("are held once the canvas is late twice running, and not on one late moment", () => {
		const canvas = setup();
		canvas.check(LATE);
		canvas.check(8);
		canvas.check(LATE);
		expect(canvas.held).toEqual(new Set());
		canvas.check(LATE);
		expect(canvas.held).toEqual(new Set(["glass", "orbit"]));
		// holding them was the cure: they stay held
		canvas.check(8);
		canvas.check(8);
		expect(canvas.held).toEqual(new Set(["glass", "orbit"]));
	});

	it("are let go when holding them did not help, and not blamed again while they are what runs", () => {
		const canvas = setup();
		canvas.check(LATE);
		canvas.check(LATE);
		expect(canvas.held).toEqual(new Set(["glass", "orbit"]));
		// still late with them held: something else is slowing the canvas
		canvas.check(LATE);
		expect(canvas.held).toEqual(new Set());
		for (let check = 0; check < 6; check++) canvas.check(LATE);
		expect(canvas.held).toEqual(new Set());

		// what runs changed, so the blame is open again
		canvas.running = ["glass"];
		canvas.check(LATE);
		canvas.check(LATE);
		expect(canvas.held).toEqual(new Set(["glass"]));
	});

	it("are not sampled at all when nothing running could be held", () => {
		const canvas = setup([]);
		canvas.check(200);
		canvas.check(200);
		expect(canvas.frames).toEqual([]);
	});

	it("are never blamed for a sample a gesture interrupted", () => {
		const canvas = setup();
		canvas.check(LATE);
		canvas.check(LATE, () => {
			canvas.resting = false;
		});
		canvas.resting = true;
		canvas.check(LATE);
		expect(canvas.held).toEqual(new Set());
	});

	it("stop being watched when the canvas goes", () => {
		const canvas = setup();
		canvas.stop();
		canvas.check(LATE);
		canvas.check(LATE);
		expect(canvas.held).toEqual(new Set());
	});
});
