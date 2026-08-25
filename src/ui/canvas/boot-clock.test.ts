import { describe, expect, it } from "vitest";
import { type Curtain, nextCurtain } from "./boot-clock";

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
