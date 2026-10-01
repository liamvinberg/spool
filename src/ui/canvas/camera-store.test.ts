import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Camera } from "../api";
import { type CameraStore, createCameraStore, FLIGHT_MS, REST_MS } from "./camera-store";

/**
 * The camera outside React (#81): one value that moves at once, one frame that
 * draws it, and a rest once it has been left alone. The frames and the clock
 * here are the test's own, so each one runs exactly when the test says.
 */

let frames: FrameRequestCallback[] = [];
let clock = 0;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	frames = [];
	clock = 1000;
	vi.spyOn(performance, "now").mockImplementation(() => clock);
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frames.push(callback);
		return frames.length;
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** One display frame: everything asked for before it runs, stamped with the time given. */
function frame(at = clock): void {
	clock = at;
	const due = frames;
	frames = [];
	for (const callback of due) callback(at);
}

/** Every camera the store draws while it moves, in order: null where it went away. */
function listen(store: CameraStore): (Camera | null)[] {
	const drawn: (Camera | null)[] = [];
	store.subscribe((camera, moving) => {
		if (moving || camera === null) drawn.push(camera);
	});
	return drawn;
}

describe("the camera store", () => {
	it("moves at once and draws once per frame, however many moves arrive before it", () => {
		const store = createCameraStore();
		const drawn = listen(store);

		store.set({ x: 0, y: 0, k: 1 });
		store.set({ x: 10, y: 0, k: 1 });
		store.set({ x: 20, y: 5, k: 1 });

		// a hit test in the same event already reads where the camera is
		expect(store.get()).toEqual({ x: 20, y: 5, k: 1 });
		expect(drawn).toEqual([]);
		expect(frames).toHaveLength(1);

		frame();
		expect(drawn).toEqual([{ x: 20, y: 5, k: 1 }]);

		// a frame with nothing new to draw tells nobody
		frame();
		expect(drawn).toHaveLength(1);
	});

	it("tells every listener in the one frame, and none after it leaves", () => {
		const store = createCameraStore();
		const first = listen(store);
		const second: number[] = [];
		const leave = store.subscribe((camera) => second.push(camera?.x ?? Number.NaN));

		store.set({ x: 1, y: 1, k: 1 });
		frame();
		leave();
		store.set({ x: 2, y: 2, k: 1 });
		frame();

		expect(first.map((camera) => camera?.x)).toEqual([1, 2]);
		expect(second).toEqual([1]);
	});

	it("keeps drawing when a frame runs before requestAnimationFrame has even returned", () => {
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(clock);
			return 1;
		});
		const store = createCameraStore();
		const drawn = listen(store);

		store.set({ x: 1, y: 0, k: 1 });
		store.set({ x: 2, y: 0, k: 1 });

		expect(drawn.map((camera) => camera?.x)).toEqual([1, 2]);
	});

	it("flies on the cubic ease-out, drawing each frame of the flight", () => {
		const store = createCameraStore();
		const drawn = listen(store);
		store.set({ x: 0, y: 0, k: 1 });
		frame();

		store.fly({ x: 100, y: 0, k: 2 }, 200);
		frame(clock + 100);
		// half the time is seven eighths of the way: 1 - (1 - 0.5)^3
		expect(store.get()).toEqual({ x: 87.5, y: 0, k: 1.875 });
		frame(clock + 100);
		expect(store.get()).toEqual({ x: 100, y: 0, k: 2 });
		expect(drawn.map((camera) => camera?.x)).toEqual([0, 87.5, 100]);

		// landed: the flight asks for no more frames
		expect(frames).toHaveLength(0);
	});

	it("starts a flight from its start when the frame drawing it began before it was asked for", () => {
		const store = createCameraStore();
		store.set({ x: 0, y: 0, k: 1 });
		frame();

		store.fly({ x: 100, y: 0, k: 1 });
		frame(clock - 4);
		expect(store.get()).toEqual({ x: 0, y: 0, k: 1 });

		frame(clock + 4 + FLIGHT_MS);
		expect(store.get()).toEqual({ x: 100, y: 0, k: 1 });
	});

	it("ends a flight where it stands on a stop, and when a camera is put in its place", () => {
		const store = createCameraStore();
		store.set({ x: 0, y: 0, k: 1 });
		frame();

		store.fly({ x: 100, y: 0, k: 1 }, 200);
		frame(clock + 100);
		store.stop();
		frame(clock + 100);
		expect(store.get()?.x).toBe(87.5);

		store.fly({ x: 0, y: 0, k: 1 }, 200);
		store.set({ x: 40, y: 40, k: 1 });
		frame(clock + 200);
		expect(store.get()).toEqual({ x: 40, y: 40, k: 1 });
	});

	it("has nothing to fly from before there is a camera, and nothing to draw while there is none", () => {
		const store = createCameraStore();
		const drawn = listen(store);

		store.fly({ x: 1, y: 1, k: 1 });
		frame();
		expect(store.get()).toBeNull();

		store.set({ x: 5, y: 5, k: 1 });
		store.set(null);
		frame();
		expect(drawn).toEqual([]);

		// gone and back inside one frame was never anything else on screen
		const back = { x: 5, y: 5, k: 1 };
		store.set(back);
		frame();
		store.set(null);
		store.set(back);
		frame();
		expect(drawn).toEqual([back]);

		// gone for a frame is heard as gone, and the same camera after it is drawn again
		store.set(null);
		frame();
		store.set(back);
		frame();
		expect(drawn).toEqual([back, null, back]);
	});

	it("says when the camera has been left alone, once, after the last frame it was drawn in", () => {
		const store = createCameraStore();
		const rests: Camera[] = [];
		store.subscribe((camera, moving) => {
			if (!moving && camera !== null) rests.push(camera);
		});

		store.set({ x: 1, y: 0, k: 1 });
		frame();
		vi.advanceTimersByTime(REST_MS - 1);
		// still inside the window, and a pan carries on
		store.set({ x: 2, y: 0, k: 1 });
		frame();
		vi.advanceTimersByTime(REST_MS - 1);
		expect(rests).toEqual([]);
		expect(store.rest()).toBeNull();

		vi.advanceTimersByTime(1);
		expect(rests).toEqual([{ x: 2, y: 0, k: 1 }]);
		expect(store.rest()).toBe(store.get());
		vi.advanceTimersByTime(REST_MS * 4);
		expect(rests).toHaveLength(1);
	});

	it("keeps a quiet window going while a move waits for its frame", () => {
		const store = createCameraStore();
		const rests: Camera[] = [];
		store.subscribe((camera, moving) => {
			if (!moving && camera !== null) rests.push(camera);
		});
		store.set({ x: 1, y: 0, k: 1 });
		frame();

		// moved, but the frame that draws it has not come by the time the window ends
		store.set({ x: 2, y: 0, k: 1 });
		vi.advanceTimersByTime(REST_MS);
		expect(rests).toEqual([]);

		frame();
		vi.advanceTimersByTime(REST_MS);
		expect(rests).toEqual([{ x: 2, y: 0, k: 1 }]);
	});

	it("forgets a rest the moment the camera goes", () => {
		const store = createCameraStore();
		store.set({ x: 1, y: 0, k: 1 });
		frame();
		vi.advanceTimersByTime(REST_MS);
		expect(store.rest()).not.toBeNull();

		store.set(null);
		frame();
		expect(store.rest()).toBeNull();
	});
});
