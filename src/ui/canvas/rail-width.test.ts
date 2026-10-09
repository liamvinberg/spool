import { describe, expect, it } from "vitest";
import { AGENT_MAX_WIDTH, MAX_WIDTH, MIN_WIDTH, SNAP_BELOW, STRIP_WIDTH, settledWidth } from "./rail-width";

/**
 * The two positions a side can settle in, and the gap between them.
 *
 * A side is either a column you read or a rail you press. Nothing lives between the strip
 * and the floor, and that is the vocabulary rather than an accident of the numbers.
 */

describe("where a side lands when the hand lets go", () => {
	it("collapses rather than sitting at a width too narrow to read", () => {
		expect(settledWidth(SNAP_BELOW - 1)).toBe(STRIP_WIDTH);
		expect(settledWidth(0)).toBe(STRIP_WIDTH);
	});

	it("opens to the floor rather than to whatever the drag reached", () => {
		expect(settledWidth(SNAP_BELOW)).toBe(MIN_WIDTH);
		expect(settledWidth(MIN_WIDTH - 1)).toBe(MIN_WIDTH);
	});

	it("keeps a width the drag actually earned, up to the ceiling", () => {
		expect(settledWidth(320)).toBe(320);
		expect(settledWidth(MAX_WIDTH)).toBe(MAX_WIDTH);
		expect(settledWidth(MAX_WIDTH + 200)).toBe(MAX_WIDTH);
	});

	it("lets the agent's side settle up to its own ceiling (#364)", () => {
		expect(MAX_WIDTH).toBe(480);
		expect(settledWidth(540, AGENT_MAX_WIDTH)).toBe(540);
		expect(settledWidth(900, AGENT_MAX_WIDTH)).toBe(560);
	});

	it("never lands in the gap between the strip and the floor", () => {
		for (let latest = 0; latest <= 600; latest += 1) {
			const width = settledWidth(latest);
			expect(width === STRIP_WIDTH || (width >= MIN_WIDTH && width <= MAX_WIDTH)).toBe(true);
		}
	});
});
