import { describe, expect, it } from "vitest";
import type { CompiledTheme } from "../api";
import {
	borderWidthsOf,
	colourOf,
	cornersOf,
	describe as describeValue,
	FILTER_SET,
	gapOf,
	gradientCss,
	gradientOf,
	insetOf,
	knockedOut,
	lengthOf,
	parseTyped,
	sidesOf,
	sizeModeOf,
	stepLength,
	themeOf,
	toggledOf,
	wordOf,
} from "./properties-families";

/**
 * The mechanics under the rows (#257): what a token is made of once a sign, a
 * fraction, a unit, an alpha or a variant is on it, and how the folds read a
 * literal written in logical sides.
 */

const theme: CompiledTheme = {
	colour: [
		{ name: "thread", value: "#F5391A", from: "project" },
		{ name: "border", value: "#262626", from: "project" },
		{ name: "raised", value: "#282828", from: "project" },
	],
	text: [{ name: "md", value: "14px", from: "project" }],
	weight: [{ name: "medium", value: "500", from: "project" }],
	font: [],
	leading: [],
	tracking: [],
	radius: [
		{ name: "md", value: "8px", from: "project" },
		{ name: "lg", value: "12px", from: "project" },
	],
	shadow: [],
	ease: [],
	screen: [],
	step: 4,
};

describe("a number box takes a sign, a fraction and a unit", () => {
	it("reads what was typed as what the class would say", () => {
		expect(parseTyped("spacing", "-4")).toEqual({ value: "4", negative: true });
		expect(parseTyped("spacing", "50%")).toEqual({ value: "1/2", negative: false });
		expect(parseTyped("spacing", "1/2")).toEqual({ value: "1/2", negative: false });
		expect(parseTyped("spacing", "347px")).toEqual({ value: "[347px]", negative: false });
		expect(parseTyped("spacing", "16px")).toEqual({ value: "4", negative: false });
		expect(parseTyped("deg", "12deg")).toEqual({ value: "12", negative: false });
		expect(parseTyped("ms", ".3s")).toEqual({ value: "300", negative: false });
		expect(parseTyped("count", "10")).toEqual({ value: "10", negative: false });
		// `border-1.5` is a class Tailwind refuses, so a fraction of a pixel brackets
		expect(parseTyped("px", "1.5px")).toEqual({ value: "[1.5px]", negative: false });
		expect(parseTyped("percent", "37.5")).toEqual({ value: "37.5", negative: false });
	});

	it("counts in the project's own scale", () => {
		expect(describeValue("spacing", "4", false, 4)).toBe("16px");
		expect(describeValue("spacing", "4", false, 8)).toBe("32px");
		expect(describeValue("spacing", "2", true)).toBe("-8px");
		expect(describeValue("spacing", "1/2")).toBe("50%");
		expect(describeValue("spacing", "[347px]")).toBe("347px");
		expect(describeValue("ms", "150")).toBe("150ms");
		expect(parseTyped("spacing", "16px", 8)).toEqual({ value: "2", negative: false });
	});

	it("steps by one unit of what the row measures", () => {
		expect(stepLength("spacing", lengthOf("p-4", "p"), 0, 1)).toEqual({ value: "5", negative: false });
		expect(stepLength("spacing", lengthOf("-mt-2", "mt"), 0, 1)).toEqual({ value: "1", negative: true });
		expect(stepLength("percent", lengthOf("opacity-50", "opacity"), 0, 1)).toEqual({ value: "55", negative: false });
		expect(stepLength("ms", lengthOf("duration-150", "duration"), 0, 1)).toEqual({ value: "200", negative: false });
		// nothing set yet: the step is off what the element measures
		expect(stepLength("spacing", null, 44, 1)).toEqual({ value: "12", negative: false });
	});
});

describe("the folds read the logical spellings", () => {
	it("reads `ps-` and `pe-` as the sides they resolve to", () => {
		expect(sidesOf("ps-4 pe-4 pt-3", "p")).toEqual({ t: "3", r: "4", b: null, l: "4" });
		expect(sidesOf("p-4 pt-2", "p")).toEqual({ t: "2", r: "4", b: "4", l: "4" });
		expect(sidesOf("-mx-2 mt-1", "m")).toEqual({ t: "1", r: "-2", b: null, l: "-2" });
	});

	it("reads the inset and the gap through their shorthands", () => {
		expect(insetOf("inset-x-0 top-4")).toEqual({ t: "4", r: "0", b: null, l: "0" });
		expect(insetOf("start-2 end-3")).toEqual({ t: null, r: "3", b: null, l: "2" });
		expect(gapOf("gap-3")).toEqual({ x: "3", y: "3" });
		expect(gapOf("gap-x-2 gap-y-4")).toEqual({ x: "2", y: "4" });
	});

	it("reads `rounded-ss-` as a corner and `border-s` as an edge", () => {
		expect(cornersOf("rounded-lg rounded-ss-none", theme)).toEqual({ tl: "none", tr: "lg", br: "lg", bl: "lg" });
		expect(cornersOf("rounded-md", theme)).toEqual({ tl: "md", tr: "md", br: "md", bl: "md" });
		expect(borderWidthsOf("border border-b-2")).toEqual({ t: "1", r: "1", b: "2", l: "1" });
		expect(borderWidthsOf("border-s-2")).toEqual({ t: null, r: null, b: null, l: "2" });
	});
});

describe("a colour is a name, an alpha and what the theme paints", () => {
	it("reads the name off the compiled theme", () => {
		expect(colourOf("bg-thread/50", "bg", theme)).toMatchObject({ name: "thread", alpha: 50 });
		expect(colourOf("bg-thread/50", "bg", theme).paint).toContain("#F5391A");
		expect(colourOf("bg-[#ff0044]", "bg", theme)).toMatchObject({ name: "[#ff0044]", paint: "#ff0044" });
		// a gradient is not a background colour, whatever the prefix suggests
		expect(colourOf("bg-linear-to-r", "bg", theme).name).toBeNull();
		// and a colour nobody has is not one
		expect(colourOf("bg-thredd", "bg", theme).name).toBeNull();
	});

	it("tells a size from a colour on the same prefix", () => {
		expect(themeOf("text-md", "text", "text", theme)).toMatchObject({ name: "md", value: "14px" });
		expect(themeOf("text-thread", "text", "text", theme)).toBeNull();
		expect(colourOf("text-thread text-md", "text", theme)).toMatchObject({ name: "thread" });
	});
});

describe("the gradient, the sets and the size modes", () => {
	it("reads a gradient as a shape, a direction and three stops", () => {
		const gradient = gradientOf("bg-linear-to-br from-thread via-thread/70 to-raised", theme);
		if (gradient === null) throw new Error("no gradient read");
		expect(gradient.shape).toBe("linear");
		expect(gradient.stops.map((stop) => stop.colour?.name)).toEqual(["thread", "thread", "raised"]);
		expect(gradientCss(gradient)).toContain("linear-gradient(to bottom right");
		expect(gradientOf("bg-thread", theme)).toBeNull();
	});

	it("knocks out the group a chip belongs to, and the reset with it", () => {
		expect(
			toggledOf("tabular-nums ordinal", { ...FILTER_SET, groups: [["tabular-nums"], ["ordinal"]], reset: "x" }),
		).toEqual(new Set(["tabular-nums", "ordinal"]));
		expect(knockedOut(FILTER_SET, "blur-md")).toEqual(["blur-xs", "blur-sm", "blur-lg", "blur-xl", "filter-none"]);
	});

	it("reads hug, fill and fixed the HTML way", () => {
		expect(sizeModeOf("flex", "w")).toBe("hug");
		expect(sizeModeOf("w-full", "w")).toBe("fill");
		expect(sizeModeOf("w-[347px]", "w")).toBe("fixed");
		expect(sizeModeOf("size-8", "h")).toBe("fixed");
		// a height nothing sets under a `flex-1` is the layout filling it
		expect(sizeModeOf("flex-1", "h")).toBe("fill");
		expect(wordOf("flex flex-col", "direction")).toBe("flex-col");
	});
});
