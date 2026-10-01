import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Camera } from "../api";
import { type CameraStore, createCameraStore, FLIGHT_MS } from "./camera-store";

/**
 * The camera outside React (#81): one value that moves at once, and one frame
 * that draws it. The frames here are the test's own, so each one runs exactly
 * when the test says a display frame has come.
 */

let frames: FrameRequestCallback[] = [];
let clock = 0;

beforeEach(() => {
	frames = [];
	clock = 1000;
	vi.spyOn(performance, "now").mockImplementation(() => clock);
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frames.push(callback);
		return frames.length;
	});
});

afterEach(() => {
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

/** Every camera the store draws, in order. */
function listen(store: CameraStore): Camera[] {
	const drawn: Camera[] = [];
	store.subscribe((camera) => drawn.push(camera));
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
		const leave = store.subscribe((camera) => second.push(camera.x));

		store.set({ x: 1, y: 1, k: 1 });
		frame();
		leave();
		store.set({ x: 2, y: 2, k: 1 });
		frame();

		expect(first.map((camera) => camera.x)).toEqual([1, 2]);
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

		expect(drawn.map((camera) => camera.x)).toEqual([1, 2]);
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
		expect(drawn.map((camera) => camera.x)).toEqual([0, 87.5, 100]);

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

		// the same camera arriving again is an arrival, and is drawn again
		const back = { x: 5, y: 5, k: 1 };
		store.set(back);
		frame();
		store.set(null);
		store.set(back);
		frame();
		expect(drawn).toEqual([back, back]);
	});
});
