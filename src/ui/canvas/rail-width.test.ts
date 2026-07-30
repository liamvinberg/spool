import { describe, expect, it } from "vitest";
import {
	COLLAPSED_BELOW,
	isRailWidth,
	MAX_WIDTH,
	MIN_WIDTH,
	SNAP_BELOW,
	STRIP_WIDTH,
	settledWidth,
} from "./rail-width";

/**
 * The two positions a rail can settle in, and the gap between them.
 *
 * A rail is either a column you read or an edge you press. Nothing lives between the strip
 * and the floor, and that is the vocabulary rather than an accident of the numbers — which
 * is why a remembered width inside the gap is discarded rather than clamped into range.
 */

describe("where a rail lands when the hand lets go", () => {
	it("shuts rather than sitting at a width too narrow to read", () => {
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

	/** every settled width is one the collapsed test can read without a third case */
	it("only ever lands somewhere the rail can draw", () => {
		for (let latest = 0; latest <= 600; latest += 1) {
			const width = settledWidth(latest);
			expect(isRailWidth(width)).toBe(true);
			expect(width <= COLLAPSED_BELOW).toBe(width === STRIP_WIDTH);
		}
	});
});

describe("whether a remembered number is a width", () => {
	it("takes the strip and the whole open range", () => {
		expect(isRailWidth(STRIP_WIDTH)).toBe(true);
		expect(isRailWidth(MIN_WIDTH)).toBe(true);
		expect(isRailWidth(MAX_WIDTH)).toBe(true);
		expect(isRailWidth(321)).toBe(true);
	});

	/** the gap is a shape this app never puts a rail in, so it is not narrowed into one */
	it("refuses the gap between the strip and the floor", () => {
		expect(isRailWidth(STRIP_WIDTH + 1)).toBe(false);
		expect(isRailWidth(COLLAPSED_BELOW)).toBe(false);
		expect(isRailWidth(MIN_WIDTH - 1)).toBe(false);
	});

	it("refuses a width off either end", () => {
		expect(isRailWidth(0)).toBe(false);
		expect(isRailWidth(-420)).toBe(false);
		expect(isRailWidth(MAX_WIDTH + 1)).toBe(false);
	});

	it("refuses anything that is not a finite number", () => {
		expect(isRailWidth(Number.NaN)).toBe(false);
		expect(isRailWidth(Number.POSITIVE_INFINITY)).toBe(false);
		expect(isRailWidth("420")).toBe(false);
		expect(isRailWidth(null)).toBe(false);
		expect(isRailWidth({ width: 420 })).toBe(false);
	});
});
