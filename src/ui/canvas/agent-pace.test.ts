import { describe, expect, it } from "vitest";
import { longestStreamed } from "../../test-helpers";
import { DRAIN_MS, drawnBy, FLOOR_MS_PER_CHAR, type Landed } from "./agent-pace";

/**
 * The pace (#149, #192, #195): how much of an arriving message is on screen at a given
 * millisecond. Asserted on the three properties that make it a smoother rather than a
 * delay — it never runs ahead of the wire, it never unwrites a character, and it speeds
 * up when it falls behind — and then against a numeric integration of its own rule,
 * because a closed form is only worth having if it agrees with the thing it replaced.
 */

/** one chunk every `every` ms, `size` characters each, the shape a real message has */
const stream = (count: number, size: number, every: number): Landed[] =>
	Array.from({ length: count }, (_, index) => ({ at: (index + 1) * every, upto: (index + 1) * size }));

/**
 * The real deltas of the longest message the repo holds, on the beat its recording implies.
 *
 * The sizes are the wire's own — 43 uneven fragments of a 3,372-character message — and
 * the spacing is the 460ms mean the parent recording was measured at, because
 * `stream_event` carries no timestamp of its own. So the schedule is a real message
 * arriving at a real rate rather than an authored one.
 */
function recorded(): Landed[] {
	let upto = 0;
	return longestStreamed("claude-mcp").deltas.map((size, index) => {
		upto += size;
		return { at: (index + 1) * 460, upto };
	});
}

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

/**
 * The two properties that let the edge be read off a clock rather than accumulated.
 *
 * Monotonicity is the one the renderer rests on: a word is animated on mount, so a
 * character leaving the screen again would remount every word after it. And the closed
 * form is only worth having if it is the rule it claims to be, so it is checked against
 * a 1ms integration of that rule rather than against a remembered number.
 */
/** gaps swinging 150ms to 1.2s, which is where spending a chunk across a fixed beat fails both ways */
function jittered(): Landed[] {
	const landed: Landed[] = [];
	let at = 0;
	let upto = 0;
	for (const [index, gap] of [40, 1200, 150, 900, 150, 460, 700, 150].entries()) {
		at += gap;
		upto += 40 + index * 30;
		landed.push({ at, upto });
	}
	return landed;
}

describe("the pace as a function of the clock", () => {
	const schedules: readonly (readonly [string, Landed[]])[] = [
		["the recorded message", recorded()],
		["an even stream", stream(20, 80, 460)],
		["a jittered stream", jittered()],
	];

	for (const [name, landed] of schedules) {
		it(`never unwrites a character of ${name}`, () => {
			const end = (landed[landed.length - 1] as Landed).at + 2000;
			const back: number[] = [];
			let previous = 0;
			for (let ms = 0; ms <= end; ms += 1) {
				const drawn = drawnBy(landed, ms);
				if (drawn < previous) back.push(ms);
				previous = drawn;
			}

			expect(back).toEqual([]);
		});

		it(`matches a numeric integration of its own rule on ${name}`, () => {
			const end = (landed[landed.length - 1] as Landed).at + 2000;
			/*
			 * The rule, stepped rather than solved: one character every
			 * `min(FLOOR_MS_PER_CHAR, DRAIN_MS / pending)` milliseconds, and the backlog grows
			 * by whatever a delta brought. Nothing here knows the closed form.
			 */
			let pending = 0;
			let arrived = 0;
			let next = 0;
			let worst = 0;
			for (let ms = 0; ms <= end; ms += 1) {
				while (next < landed.length && (landed[next] as Landed).at <= ms) {
					const delta = landed[next] as Landed;
					pending += delta.upto - arrived;
					arrived = delta.upto;
					next += 1;
				}
				const stepped = Math.max(0, Math.min(arrived, Math.floor(arrived - pending)));
				worst = Math.max(worst, Math.abs(stepped - drawnBy(landed, ms)));
				pending = Math.max(
					0,
					pending - 1 / Math.min(FLOOR_MS_PER_CHAR, pending > 0 ? DRAIN_MS / pending : FLOOR_MS_PER_CHAR),
				);
			}

			// within a character, which is the integration's own error at a 1ms step
			expect(worst).toBeLessThanOrEqual(1);
		});
	}

	/** the schedule the check runs on is the real one, so a re-cut capture cannot empty it */
	it("reads the recorded message off the capture rather than off a constant", () => {
		const landed = recorded();

		expect(landed).toHaveLength(43);
		expect(landed[landed.length - 1]?.upto).toBe(3372);
	});
});
