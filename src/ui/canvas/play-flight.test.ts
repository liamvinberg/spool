import { describe, expect, it } from "vitest";
import { FLIGHT_SHORT, FLIGHT_SPLIT, flightProgress } from "./play-flight";

describe("the settle flight", () => {
	it("starts where it left and lands where it was going", () => {
		expect(flightProgress(0)).toBe(0);
		expect(flightProgress(1)).toBe(1);
	});

	it("stops three per cent short at the seam, and leaves the rest to drift", () => {
		expect(flightProgress(FLIGHT_SPLIT)).toBeCloseTo(FLIGHT_SHORT, 12);
	});

	it("never goes backwards, and never overshoots", () => {
		let last = -1;
		for (let step = 0; step <= 100; step++) {
			const p = flightProgress(step / 100);
			expect(p).toBeGreaterThanOrEqual(last);
			expect(p).toBeLessThanOrEqual(1);
			last = p;
		}
	});

	it("holds at each end rather than running past them", () => {
		expect(flightProgress(-0.5)).toBe(0);
		expect(flightProgress(1.5)).toBe(1);
	});

	/**
	 * The seam is the whole reason the tail is a smoothstep: an ease-out leaves
	 * its last segment at full speed, and a second ease-out after a near-stop
	 * reads as a bump. Both sides of 97% have to be crawling.
	 */
	it("crawls into the seam and out of it again", () => {
		const step = 8 / 600;
		const before = flightProgress(FLIGHT_SPLIT) - flightProgress(FLIGHT_SPLIT - step);
		const after = flightProgress(FLIGHT_SPLIT + step) - flightProgress(FLIGHT_SPLIT);
		expect(before).toBeLessThan(0.01);
		expect(after).toBeLessThan(0.01);
	});
});
