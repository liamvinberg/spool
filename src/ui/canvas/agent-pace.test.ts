import { describe, expect, it } from "vitest";
import { drawnBy, type Landed } from "./agent-pace";

/**
 * The pace (#149, #192): how much of an arriving message is on screen at a given
 * millisecond. Asserted on the two properties that make it a smoother rather than
 * a delay — it never runs ahead of the wire, and it speeds up when it falls behind.
 */

/** one chunk every `every` ms, `size` characters each, the shape a real message has */
const stream = (count: number, size: number, every: number): Landed[] =>
	Array.from({ length: count }, (_, index) => ({ at: (index + 1) * every, upto: (index + 1) * size }));

describe("drawnBy", () => {
	it("draws nothing before the first delta has landed", () => {
		expect(drawnBy(stream(4, 80, 460), 100)).toBe(0);
	});

	it("never draws a character before its own delta arrived", () => {
		const landed = stream(6, 80, 460);
		for (let ms = 0; ms < 4000; ms += 7) {
			const arrived = landed.filter((delta) => delta.at <= ms).at(-1)?.upto ?? 0;
			expect(drawnBy(landed, ms)).toBeLessThanOrEqual(arrived);
		}
	});

	it("moves the edge on the frames between two deltas, which is the whole point", () => {
		const landed = stream(6, 80, 460);
		const mid = drawnBy(landed, 700);

		expect(mid).toBeGreaterThan(drawnBy(landed, 600));
		expect(drawnBy(landed, 800)).toBeGreaterThan(mid);
	});

	it("drains a bigger backlog faster, so a late chunk does not leave the edge stranded", () => {
		const small: Landed[] = [{ at: 100, upto: 40 }];
		const big: Landed[] = [{ at: 100, upto: 400 }];

		expect(drawnBy(big, 200) - 0).toBeGreaterThan(drawnBy(small, 200));
	});

	/** the whole message, however it got there: a settled transcript has nothing to pace */
	it("hands back everything once the clock has run past the last delta", () => {
		const landed = stream(6, 80, 460);

		expect(drawnBy(landed, 60_000)).toBe(480);
	});

	it("hands back everything on an infinite clock, which is what reduced motion asks for", () => {
		expect(drawnBy(stream(6, 80, 460), Number.POSITIVE_INFINITY)).toBe(480);
	});

	/**
	 * The lag is bounded and one-directional: the rail always shows slightly less
	 * than it has, and the residue is spent within a second of the wire going quiet.
	 * A constant-rate smoother has neither property — it accumulates without bound,
	 * so a long message finishes minutes late.
	 */
	it("spends what is left within a second of the last delta, however long the message ran", () => {
		const short = stream(6, 80, 460);
		const long = stream(60, 80, 460);

		expect(drawnBy(short, (short.at(-1) as Landed).at + 1000)).toBe(480);
		expect(drawnBy(long, (long.at(-1) as Landed).at + 1000)).toBe(4800);
		// and the lag never grows with the message: the backlog is in equilibrium
		expect((long.at(-1) as Landed).upto - drawnBy(long, (long.at(-1) as Landed).at)).toBeLessThan(
			(short.at(-1) as Landed).upto - drawnBy(short, (short.at(-1) as Landed).at) + 8,
		);
	});

	it("says nothing about a message with no deltas in it", () => {
		expect(drawnBy([], 500)).toBe(0);
	});
});
