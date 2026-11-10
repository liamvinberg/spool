import { expect, it } from "vitest";
import { MENU_IN, MENU_SPRING, PULL_SPRING } from "./player-size-model";
import { spring, springEasing } from "./spring";

const run = (at: (t: number) => { value: number; done: boolean }) => {
	const values: number[] = [];
	for (let t = 0; t < 5; t += 1 / 120) {
		const step = at(t);
		values.push(step.value);
		if (step.done) return { values, seconds: t };
	}
	return { values, seconds: Number.POSITIVE_INFINITY };
};

it("takes a page through its breakpoints on the menu's spring without overshooting, and rests on the size", () => {
	const { values, seconds } = run(spring(MENU_SPRING, 1280, 390, 0));
	expect(Math.min(...values)).toBeGreaterThanOrEqual(390);
	expect(values.at(-1)).toBe(390);
	expect(seconds).toBeGreaterThan(0.2);
	expect(seconds).toBeLessThan(0.6);
});

it("carries the hand's speed into a spring started mid-pull", () => {
	// let go while still pulling outward at 2000px/s: it goes on outward before it comes back to rest
	const at = spring(PULL_SPRING, 800, 800, 2000);
	const { values } = run(at);
	expect(Math.max(...values)).toBeGreaterThan(820);
	expect(values.at(-1)).toBe(800);
});

it("eases a CSS transition along the same spring, from 0 to 1 in the time it takes to rest", () => {
	const { duration, easing } = springEasing(MENU_IN);
	// a visual duration of 0.18s rests a little after it
	expect(duration).toBeGreaterThan(180);
	expect(duration).toBeLessThan(400);
	expect(easing.startsWith("linear(0,")).toBe(true);
	expect(easing.endsWith(", 1)")).toBe(true);
});
