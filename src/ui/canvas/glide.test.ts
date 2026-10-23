import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGlide } from "./glide";

let frames = new Map<number, FrameRequestCallback>();
let ids = 0;
let clock = 0;

/** one display frame, `ms` after the last */
function frame(ms = 1000 / 120): void {
	clock += ms;
	const due = [...frames.values()];
	frames = new Map();
	for (const callback of due) callback(clock);
}

beforeEach(() => {
	clock = 0;
	frames = new Map();
	vi.spyOn(performance, "now").mockImplementation(() => clock);
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frames.set(++ids, callback);
		return ids;
	});
	vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const A = { x: 0, y: 0, w: 100, h: 20 };
const B = { x: 200, y: 40, w: 60, h: 20 };

describe("createGlide", () => {
	it("starts where it is first put, then eases to the next box within its duration without passing it", () => {
		const glide = createGlide(() => 180);
		glide.to(A);
		expect(glide.at()).toEqual(A);

		const heard = vi.fn();
		glide.listen(heard);
		glide.to(B);
		const xs: number[] = [];
		for (let i = 0; i < 120 && frames.size > 0; i++) {
			frame();
			xs.push(glide.at().x);
		}
		expect(xs.every((x, i) => x >= (xs[i - 1] ?? 0) && x <= B.x)).toBe(true);
		// within a step of its duration it is all but there
		expect(B.x - (xs[Math.round(180 / (1000 / 120))] ?? 0)).toBeLessThan(B.x * 0.01);
		expect(glide.at()).toEqual(B);
		expect(heard).toHaveBeenCalledTimes(xs.length);
	});

	it("bends toward a new box from wherever it stands, mid-flight", () => {
		const glide = createGlide(() => 180);
		glide.to(A);
		glide.to(B);
		frame();
		frame();
		const midway = glide.at().x;
		glide.to(A);
		const after: number[] = [];
		for (let i = 0; i < 120 && frames.size > 0; i++) {
			frame();
			after.push(glide.at().x);
		}
		// carried a little further by the way it was going, then back, never past either end
		expect(Math.max(...after)).toBeLessThan(B.x);
		expect(Math.max(...after)).toBeLessThan(midway * 2);
		expect(Math.min(...after)).toBeGreaterThanOrEqual(A.x);
		expect(glide.at()).toEqual(A);
		expect(frames.size).toBe(0);
	});

	it("cuts where the motion scale is zero, as stillness makes it", () => {
		const glide = createGlide(() => 0);
		glide.to(A);
		const heard = vi.fn();
		glide.listen(heard);
		glide.to(B);
		expect(glide.at()).toEqual(B);
		expect(frames.size).toBe(0);
		// whatever draws the box hears the cut, or it stays drawn where it was
		expect(heard).toHaveBeenCalledTimes(1);
	});

	it("jumps when told to, ending any flight", () => {
		const glide = createGlide(() => 180);
		glide.to(A);
		glide.to(B);
		frame();
		glide.jump(A);
		expect(glide.at()).toEqual(A);
		expect(frames.size).toBe(0);
	});
});
