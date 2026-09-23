import { describe, expect, it } from "vitest";
import { axisOf, dropAt, moveAsk } from "./element-move";

const column = [
	{ x: 0, y: 0, w: 100, h: 20 },
	{ x: 0, y: 30, w: 100, h: 20 },
	{ x: 0, y: 60, w: 100, h: 20 },
];
const row = [
	{ x: 0, y: 0, w: 40, h: 20 },
	{ x: 50, y: 0, w: 40, h: 20 },
	{ x: 100, y: 0, w: 40, h: 20 },
];

describe("where a drag among siblings lands (#340)", () => {
	it("reads a column down and a row across", () => {
		expect(axisOf(column)).toBe("y");
		expect(axisOf(row)).toBe("x");
		// a grid read row by row runs across
		expect(axisOf([...row, { x: 0, y: 30, w: 40, h: 20 }, { x: 50, y: 30, w: 40, h: 20 }])).toBe("x");
	});

	it("lands after the nearest sibling when the pointer is past its middle", () => {
		expect(dropAt(column, 0, { x: 50, y: 75 })).toEqual({
			beside: 2,
			place: "after",
			line: { x: 0, y: 79, w: 100, h: 2 },
		});
		expect(dropAt(row, 2, { x: 10, y: 10 })).toEqual({
			beside: 0,
			place: "before",
			line: { x: -1, y: 0, w: 2, h: 20 },
		});
	});

	it("offers no drop where the element already stands", () => {
		// before the next sibling, and after the one before it, is where it is
		expect(dropAt(column, 0, { x: 50, y: 32 })).toBeUndefined();
		expect(dropAt(column, 2, { x: 50, y: 48 })).toBeUndefined();
		expect(dropAt([column[0] ?? { x: 0, y: 0, w: 1, h: 1 }], 0, { x: 0, y: 0 })).toBeUndefined();
	});

	it("says the move in plain words", () => {
		expect(moveAsk("a", "after", "a")).toBe("Move the a after the a");
	});
});
