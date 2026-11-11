import { expect, it } from "vitest";
import { Spring, tune } from "./spring";

/** Where a spring is at each drawn frame of `seconds` at `hz`. */
const run = (spring: Spring, seconds: number, hz = 60): number[] => {
	const track: number[] = [];
	for (let frame = 0; frame < Math.round(seconds * hz); frame++) {
		spring.step(1 / hz, 0.01);
		track.push(spring.x);
	}
	return track;
};

it("lands a spring with no bounce once, never past its target, in about its duration", () => {
	const spring = new Spring(0, tune(0.3));
	spring.aim(100);
	const track = run(spring, 1);
	expect(Math.max(...track)).toBe(100);
	// all but there at its duration, and at rest at its target soon after, never moving again
	expect(track[Math.round(0.3 * 60) - 1]).toBeGreaterThan(95);
	const landed = track.indexOf(100);
	expect(landed).toBeGreaterThan(0);
	expect(track.slice(landed).every((x) => x === 100)).toBe(true);
	expect(spring.step(1 / 60, 0.01)).toBe(false);
});

it("turns round from where it is at the speed it has when given a new target mid-flight", () => {
	const spring = new Spring(0, tune(0.3));
	spring.aim(100);
	run(spring, 0.08);
	const turned = spring.x;
	const speed = spring.v;
	spring.aim(0);
	expect(spring.x).toBe(turned);
	expect(spring.v).toBe(speed);
	// it carries on a little the way it was going before it comes back, never jumping
	const back = run(spring, 1);
	expect(back[0]).toBeGreaterThan(turned);
	expect(Math.abs((back[0] ?? 0) - turned)).toBeLessThan(10);
	expect(back.at(-1)).toBe(0);
});

it("lands with a little bounce from the speed it was handed", () => {
	const spring = new Spring(0, tune(0.3));
	spring.aim(100, tune(0.36, 0.12), 800);
	const track = run(spring, 1.5);
	const over = Math.max(...track) - 100;
	expect(over).toBeGreaterThan(0);
	expect(over).toBeLessThan(25);
	expect(track.at(-1)).toBe(100);
});

it("moves the same at any frame rate", () => {
	const at = (hz: number) => {
		const spring = new Spring(0, tune(0.3));
		spring.aim(100);
		return run(spring, 0.1, hz).at(-1) ?? 0;
	};
	expect(Math.abs(at(60) - at(120))).toBeLessThan(2);
});

it("is set, not run, when its duration is nothing", () => {
	const spring = new Spring(0, tune(0.3));
	spring.aim(100, tune(0));
	expect(spring.x).toBe(100);
	expect(spring.resting).toBe(true);
});
