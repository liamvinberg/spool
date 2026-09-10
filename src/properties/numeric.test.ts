import { expect, it } from "vitest";
import { type Kind, lengthOf, parseTyped, stepLength } from "./families";

it.each<[Kind, string, string, boolean]>([
	["spacing", "7.999px", "[7.999px]", false],
	["spacing", "16px", "[16px]", false],
	["spacing", "-.333rem", "[.333rem]", true],
	["spacing", "1.25em", "[1.25em]", false],
	["spacing", "33.333%", "[33.333%]", false],
	["spacing", "50%", "[50%]", false],
	["spacing", ".125", "[0.125px]", false],
	["spacing", "700", "[700px]", false],
	["spacing", "4", "[4px]", false],
	["spacing", "-2.5", "[2.5px]", true],
	["spacing", "1/2", "1/2", false],
	["percent", "37.5%", "[37.5%]", false],
	["percent", "37.5", "37.5", false],
	["deg", ".125turn", "[.125turn]", false],
	["deg", "12.5deg", "[12.5deg]", false],
	["ms", ".3333s", "[.3333s]", false],
	["ms", "-1.25ms", "[1.25ms]", true],
	["px", "-1.25px", "[1.25px]", true],
])("keeps the exact numeric intent for %s %s", (kind, typed, value, negative) => {
	expect(parseTyped(kind, typed)).toEqual({ value, negative });
});

it("refuses fractional counts, invalid ratios and nonfinite numbers without rounding them into another request", () => {
	for (const typed of ["1.5", "1.000000000000000001", "1.5px", "Infinity", "NaN", "9".repeat(400)])
		expect(parseTyped("count", typed)).toBeNull();
	expect(parseTyped("spacing", "1/0")).toBeNull();
});

it.each<[Kind, string, string, number, string, boolean]>([
	["spacing", "p-[7.999px]", "p", 1, "[8.999px]", false],
	["spacing", "p-[.333rem]", "p", 1, "[1.333rem]", false],
	["spacing", "m-[1.25em]", "m", -10, "[8.75em]", true],
	["spacing", "m-[0.000000000000000001px]", "m", 1, "[1.000000000000000001px]", false],
	["spacing", "p-1.25", "p", 1, "2.25", false],
	["spacing", "p-px", "p", 1, "[2px]", false],
	["spacing", "-m-1.25", "m", 10, "8.75", false],
	["spacing", "w-[33.333%]", "w", 1, "[34.333%]", false],
	["spacing", "w-1/2", "w", 1, "51/100", false],
	["spacing", "w-1/3", "w", 1, "103/300", false],
	["percent", "opacity-37.5", "opacity", 1, "38.5", false],
	["ms", "duration-150", "duration", 1, "151", false],
	["ms", "duration-[.3333s]", "duration", 10, "[10.3333s]", false],
	["deg", "rotate-[.125turn]", "rotate", -1, "[0.875turn]", true],
	["px", "border-[1.25px]", "border", 1, "[2.25px]", false],
])(
	"steps the displayed unit of %s %s by %s without changing its reference kind",
	(kind, token, family, units, value, negative) => {
		const current = lengthOf(token, family);
		expect(current).not.toBeNull();
		expect(stepLength(kind, current, 100, units)).toEqual({ value, negative });
	},
);

it("detaches an unknown value to its actual fractional measure without inferring a spacing token", () => {
	expect(stepLength("spacing", lengthOf("p-(--space)", "p"), 7.999, 1)).toEqual({
		value: "[8.999px]",
		negative: false,
	});
	expect(stepLength("spacing", null, 15, 1)).toEqual({ value: "[16px]", negative: false });
	expect(stepLength("spacing", null, Number.NaN, 1)).toBeNull();
	expect(stepLength("spacing", null, 15, Number.NaN)).toBeNull();
	expect(stepLength("count", lengthOf("z-1.5", "z"), 2, 1)).toBeNull();
});

it("refuses a nonzero scientific value outside the native numeric range before stepping", () => {
	expect(stepLength("spacing", lengthOf("p-[1e-1000px]", "p"), 0, 1)).toBeNull();
	expect(stepLength("spacing", lengthOf("p-[0e-1000px]", "p"), 0, 1)).toEqual({ value: "[1px]", negative: false });
});

it("keeps count integrality exact for authored scientific values", () => {
	expect(stepLength("count", lengthOf("z-[1e-1]", "z"), 0, 1)).toBeNull();
	expect(stepLength("count", lengthOf("z-[1.000000000000000001e0]", "z"), 1, 1)).toBeNull();
	expect(stepLength("count", lengthOf("z-[1e1]", "z"), 10, 1)).toEqual({ value: "[11]", negative: false });
	expect(stepLength("count", lengthOf("z-[1.5e1]", "z"), 15, 1)).toEqual({ value: "[16]", negative: false });
});
