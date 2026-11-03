import { expect, it } from "vitest";
import { formatShadow, lift, movePart, parseShadow, sidesOf, snapBox } from "./boxes";

/**
 * A spacing or corners value keeps the shape it was written in: one moves
 * every part, a pair moves a side with its opposite, four move one alone or,
 * under Alt, with its opposite; Shift lands on fours. A shadow is read and
 * written as one CSS box-shadow, and a lift grows its offset and blur together.
 */

it("a value moves in the shape it was written in, Alt taking the opposite part of four", () => {
	expect(movePart(20, 1, 24, false)).toBe(24);
	expect(movePart<[number, number]>([20, 22], 2, 16, false)).toEqual([16, 22]);
	expect(movePart<[number, number]>([20, 22], 3, 30, true)).toEqual([20, 30]);
	const four: [number, number, number, number] = [1, 2, 3, 4];
	expect(movePart(four, 1, 9, false)).toEqual([1, 9, 3, 4]);
	expect(movePart(four, 1, 9, true)).toEqual([1, 9, 3, 9]);
	expect(sidesOf([20, 22])).toEqual([20, 22, 20, 22]);
});

it("Shift lands a dragged length on fours, and without it on whole pixels", () => {
	expect(snapBox(18.4, false)).toBe(18);
	expect(snapBox(18.4, true)).toBe(20);
	expect(snapBox(17.9, true)).toBe(16);
});

it("a shadow reads its parts in any order and writes back as CSS", () => {
	expect(parseShadow("0 14px 36px -6px rgb(0 0 0 / 0.16)")).toEqual({
		inset: false,
		x: 0,
		y: 14,
		blur: 36,
		spread: -6,
		colour: "rgb(0 0 0 / 0.16)",
	});
	const inner = parseShadow("inset #000 0 1px");
	expect(inner).toEqual({ inset: true, x: 0, y: 1, blur: 0, spread: 0, colour: "#000" });
	expect(inner && formatShadow(inner)).toBe("inset 0 1px 0 0 #000");
	expect(parseShadow("0 1px 2px red, 0 4px 8px blue")).toBeUndefined();
	expect(parseShadow("var(--lift)")).toBeUndefined();
});

it("a lift grows the offset and the blur together, from the blur's own share", () => {
	const resting = { inset: false, x: 0, y: 10, blur: 30, spread: 0, colour: "black" };
	expect(lift(resting, 4)).toMatchObject({ y: 14, blur: 42 });
	expect(lift(resting, -20)).toMatchObject({ y: 0, blur: 0 });
	expect(lift({ ...resting, y: 0, blur: 0 }, 5)).toMatchObject({ y: 5, blur: 10 });
});
