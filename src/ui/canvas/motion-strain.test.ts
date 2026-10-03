// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Camera } from "../api";
import { type CameraStore, REST_MS } from "./camera-store";
import { CALM_MS, STRAIN_MEMORY_MS, STRAINED, STRAINED_FRAME_MS, watchMotionStrain } from "./motion-strain";

/** A camera that says it moved when told, and display frames run when asked. */
function setup() {
	let now = 0;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const frames: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frames.push(callback);
		return frames.length;
	});
	const listeners = new Set<(camera: Camera | null, moving: boolean) => void>();
	const camera = {
		subscribe(listener: (camera: Camera | null, moving: boolean) => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	} as unknown as CameraStore;
	const root = document.createElement("div");
	const stop = watchMotionStrain(camera, root);
	return {
		root,
		stop,
		/** the camera draws a moved frame at this moment */
		move(at: number) {
			now = at;
			vi.setSystemTime(at);
			for (const listener of listeners) listener({ x: at, y: 0, k: 1 }, true);
		},
		/** the display draws a frame at this moment */
		frame(at: number) {
			now = at;
			for (const callback of frames.splice(0)) callback(at);
		},
	};
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
	vi.setSystemTime(0);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("live frames sitting out a move", () => {
	it("never strains a move the display keeps up with", () => {
		const canvas = setup();
		for (let t = 0; t < 1000; t += 8) {
			canvas.move(t);
			canvas.frame(t + 4);
		}
		expect(canvas.root.hasAttribute(STRAINED)).toBe(false);
	});

	it("strains a move once it has missed frames, through the store's rests between slow draws", () => {
		const canvas = setup();
		const slow = STRAINED_FRAME_MS + 100;
		canvas.move(0);
		canvas.frame(1);
		// a draw this late lets the store's own rest fire between two of them
		canvas.move(slow);
		canvas.frame(slow + 1);
		expect(canvas.root.hasAttribute(STRAINED)).toBe(false);
		canvas.move(slow * 2);
		canvas.frame(slow * 2 + 1);
		expect(canvas.root.hasAttribute(STRAINED)).toBe(true);
	});

	it("brings the documents back once the camera is calm, and starts the next move strained", () => {
		const canvas = setup();
		const slow = STRAINED_FRAME_MS + 100;
		for (let i = 0; i < 3; i++) {
			canvas.move(i * slow);
			canvas.frame(i * slow + 1);
		}
		expect(canvas.root.hasAttribute(STRAINED)).toBe(true);
		// a frame drawn past the calm window with nothing moved, then the next one sees it
		canvas.frame(2 * slow + CALM_MS + 10);
		expect(canvas.root.hasAttribute(STRAINED)).toBe(true);
		canvas.frame(2 * slow + CALM_MS + 20);
		expect(canvas.root.hasAttribute(STRAINED)).toBe(false);

		// the documents that slowed that move are still mounted for this one
		canvas.move(2 * slow + CALM_MS + 1000);
		expect(canvas.root.hasAttribute(STRAINED)).toBe(true);
	});

	it("forgets a strained move after a while", () => {
		const canvas = setup();
		const slow = STRAINED_FRAME_MS + 100;
		for (let i = 0; i < 3; i++) {
			canvas.move(i * slow);
			canvas.frame(i * slow + 1);
		}
		const calm = 2 * slow + CALM_MS + 20;
		canvas.frame(calm - 10);
		canvas.frame(calm);
		expect(canvas.root.hasAttribute(STRAINED)).toBe(false);
		canvas.move(calm + STRAIN_MEMORY_MS + 1);
		expect(canvas.root.hasAttribute(STRAINED)).toBe(false);
	});

	it("never takes the canvas's own work after a move for strain", () => {
		const canvas = setup();
		canvas.move(0);
		canvas.frame(1);
		canvas.frame(9);
		// the camera has rested: slow frames now are a mount or a commit, not the move
		const rested = REST_MS + 20;
		canvas.frame(rested);
		canvas.frame(rested + STRAINED_FRAME_MS + 20);
		canvas.frame(rested + 2 * (STRAINED_FRAME_MS + 20));
		expect(canvas.root.hasAttribute(STRAINED)).toBe(false);
	});

	it("strains a move whose steps arrive a slow frame apart, with frames longer than the calm between", () => {
		const canvas = setup();
		const long = CALM_MS + 100;
		canvas.move(0);
		canvas.frame(1);
		canvas.frame(1 + long);
		canvas.move(2 + long);
		canvas.frame(3 + 2 * long);
		expect(canvas.root.hasAttribute(STRAINED)).toBe(true);
	});

	it("leaves nothing behind when the canvas goes", () => {
		const canvas = setup();
		canvas.root.setAttribute(STRAINED, "");
		canvas.stop();
		expect(canvas.root.hasAttribute(STRAINED)).toBe(false);
	});
});
