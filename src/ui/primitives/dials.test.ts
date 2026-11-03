import { expect, it } from "vitest";
import { settleTime, springPhysics, springTime } from "./dials";

/**
 * A spring's tab is the form it is written in, so switching rewrites it in
 * the other's terms: the two must read as the same spring both ways.
 */

it("a spring in time and in physics terms converts as Motion runs it, and back", () => {
	const physics = springPhysics({ duration: 0.35, bounce: 0.3 });
	expect(physics).toEqual({ stiffness: 224, damping: 20.9, mass: 1 });
	expect(springTime(physics)).toEqual({ duration: 0.35, bounce: 0.3 });
	// overdamped, it reads as no bounce at all; a mass left out is one
	expect(springTime({ stiffness: 100, damping: 40 }).bounce).toBe(0);
	expect(springPhysics({ stiffness: 100, damping: 40 }).mass).toBe(1);
});

it("a spring settles when it last leaves 1% of home, later the more it bounces", () => {
	expect(settleTime({ duration: 0.35, bounce: 0.3 })).toBe(0.44);
	expect(settleTime({ duration: 0.35, bounce: 0.6 })).toBeGreaterThan(0.44);
});
