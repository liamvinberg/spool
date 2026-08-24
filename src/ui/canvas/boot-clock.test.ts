import { describe, expect, it } from "vitest";
import { type Curtain, nextCurtain, pickMotion, THREAD_MOTIONS } from "./boot-clock";

/**
 * The curtain only moves forward. The state that matters most is the one that
 * draws nothing: a daemon that answers inside the gate has to take the curtain
 * from `waiting` straight to `gone`, never through `showing`, or a fast boot
 * flashes something nobody asked to see.
 */
describe("the curtain's clock", () => {
	it("never draws at all when the projection beats the gate", () => {
		expect(nextCurtain("waiting", "ready")).toBe("gone");
	});

	it("fades out rather than vanishing, once it is up", () => {
		const shown = nextCurtain("waiting", "gate");
		expect(shown).toBe("showing");
		expect(nextCurtain(shown, "ready")).toBe("leaving");
		expect(nextCurtain("leaving", "exited")).toBe("gone");
	});

	it("cannot be raised again by a late signal", () => {
		const late: Curtain[] = ["leaving", "gone"];
		for (const phase of late) {
			expect(nextCurtain(phase, "gate")).toBe(phase);
			expect(nextCurtain(phase, "ready")).toBe(phase);
		}
		// the gate firing after the projection landed is the common race, and it
		// must not resurrect a curtain that was never wanted
		expect(nextCurtain("gone", "gate")).toBe("gone");
	});
});

/**
 * The roll decides how the thread travels, and the one thing it must never do
 * is fall off the end of the table: `Math.random()` can return a number as
 * close to one as makes no difference, and a boot that renders no motion at all
 * renders a thread standing still.
 */
describe("the hand the thread is drawn by", () => {
	it("reaches every motion, and only over its own range", () => {
		const reached = new Set(
			Array.from({ length: 1000 }, (_, step) => pickMotion(step / 1000).name), //
		);
		expect(reached).toEqual(new Set(THREAD_MOTIONS.map((motion) => motion.name)));
	});

	it("holds at the ends rather than falling off them", () => {
		expect(pickMotion(0)).toBe(THREAD_MOTIONS[0]);
		expect(pickMotion(0.9999999)).toBe(THREAD_MOTIONS.at(-1));
		// out of range and not a number both land on something that animates
		expect(pickMotion(1)).toBe(THREAD_MOTIONS.at(-1));
		expect(pickMotion(-1)).toBe(THREAD_MOTIONS[0]);
		expect(pickMotion(Number.NaN)).toBe(THREAD_MOTIONS[0]);
	});

	it("keeps every motion slow enough to read as waiting rather than alarm", () => {
		for (const motion of THREAD_MOTIONS) {
			expect(motion.durationMs).toBeGreaterThanOrEqual(1200);
			expect(motion.durationMs).toBeLessThanOrEqual(3000);
		}
	});
});
