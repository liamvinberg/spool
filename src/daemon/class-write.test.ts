import { describe, expect, it } from "vitest";
import { anatomyOf, type ClassTheme, familyOf, parseScope, screenConflict, writeClass } from "./class-write";

/**
 * The write-back (#253), which is where `set-class` decides what the file says
 * afterwards. Every case here is one token in and a whole literal out: the
 * folds, the scopes, the defaults, and the spellings the author's own file
 * chose and keeps.
 */

const write = (className: string | null, token: string, scope = "", remove = false, theme?: ClassTheme) =>
	writeClass(className, { token, scope, ...(remove ? { remove: true } : {}) }, theme);

describe("anatomy", () => {
	it("reads a token as where it applies, its sign, itself and its weight", () => {
		expect(anatomyOf("md:hover:-mt-2!")).toEqual({
			variants: ["md", "hover"],
			negative: true,
			base: "mt-2",
			important: true,
		});
		expect(anatomyOf("p-4")).toEqual({ variants: [], negative: false, base: "p-4", important: false });
		expect(anatomyOf("w-[calc(100%-2rem)]")).toEqual({
			variants: [],
			negative: false,
			base: "w-[calc(100%-2rem)]",
			important: false,
		});
	});

	it("reads a scope as the chain it means, and refuses what is not one", () => {
		expect(parseScope("")).toEqual([]);
		expect(parseScope("md:")).toEqual(["md"]);
		expect(parseScope("md:hover:")).toEqual(["md", "hover"]);
		expect(parseScope("md")).toBeUndefined();
		expect(parseScope("MD:")).toBeUndefined();
	});
});

describe("padding, the fold everything else is shaped like", () => {
	it("writes one token when every side agrees", () => {
		expect(write("flex p-2", "p-4")).toBe("flex p-4");
		expect(write("flex", "p-4")).toBe("flex p-4");
	});

	it("writes the axes when opposite sides agree", () => {
		expect(write("p-4", "pt-2")).toBe("p-4 pt-2");
		expect(write("p-4 pt-2", "pb-2")).toBe("py-2 px-4");
	});

	it("writes the whole plus its exception when three sides agree", () => {
		expect(write("px-4 py-4", "pt-2")).toBe("p-4 pt-2");
	});

	it("writes four sides when nothing agrees", () => {
		expect(write("pt-1 pr-2 pb-3 pl-4", "pt-5")).toBe("pr-2 pb-3 pl-4 pt-5");
	});

	it("keeps the logical spelling a literal already had", () => {
		expect(write("ps-4 pe-2 pt-1 pb-1", "pt-3")).toBe("ps-4 pe-2 pb-1 pt-3");
	});

	it("drops a default at the base and writes it under a scope", () => {
		expect(write("flex p-4", "p-0")).toBe("flex");
		expect(write("flex p-4", "p-0", "md:")).toBe("flex p-4 md:p-0");
	});

	it("takes a family away on remove, and only that family", () => {
		expect(write("flex p-4 pt-2 gap-2", "p-4", "", true)).toBe("flex gap-2");
	});

	it("writes an arbitrary value as the author typed it", () => {
		expect(write("p-4", "pt-[13px]")).toBe("p-4 pt-[13px]");
	});
});

describe("the other folds", () => {
	it("folds gap into one token or its two axes", () => {
		expect(write("flex gap-2", "gap-x-4")).toBe("flex gap-x-4 gap-y-2");
		expect(write("flex gap-x-4 gap-y-2", "gap-y-4")).toBe("flex gap-4");
	});

	it("folds radius, three corners agreeing into the whole plus one", () => {
		expect(write("rounded-md", "rounded-tl-none")).toBe("rounded-md rounded-tl-none");
		expect(write("rounded-md rounded-tl-none", "rounded-tl-md")).toBe("rounded-md");
		expect(write("rounded-t-lg", "rounded-b-lg")).toBe("rounded-lg");
	});

	it("keeps a bare radius bare", () => {
		expect(write("rounded", "rounded-tl-none")).toBe("rounded rounded-tl-none");
	});

	it("drops radius at the base when it is none", () => {
		expect(write("flex rounded-md", "rounded-none")).toBe("flex");
		expect(write("flex rounded-md", "rounded-none", "hover:")).toBe("flex rounded-md hover:rounded-none");
	});

	it("folds border widths, the bare token meaning one", () => {
		expect(write("border", "border-b-2")).toBe("border border-b-2");
		expect(write("border border-b-2", "border-b")).toBe("border");
		expect(write("border-2", "border-t-0")).toBe("border-2 border-t-0");
	});

	it("keeps a colour off the width fold", () => {
		expect(write("border border-border", "border-2")).toBe("border-border border-2");
	});
});

describe("families that swap rather than stack", () => {
	it("replaces the token on the same family", () => {
		expect(write("flex w-56 h-8", "w-72")).toBe("flex h-8 w-72");
		expect(write("text-sm text-fg", "text-lg")).toBe("text-fg text-lg");
		expect(write("bg-bg text-fg", "bg-thread/50")).toBe("text-fg bg-thread/50");
	});

	it("replaces a word with the word it excludes, and leaves the rest", () => {
		expect(write("flex flex-col items-center", "flex-row")).toBe("flex items-center flex-row");
		expect(write("absolute inset-0", "relative")).toBe("inset-0 relative");
	});

	it("splits size into the axis it kept when one axis is written", () => {
		expect(write("flex size-8", "w-12")).toBe("flex h-8 w-12");
	});

	it("appends a token it has no family for rather than guessing what it displaces", () => {
		expect(write("flex antialiased", "backdrop-blur-sm")).toBe("flex antialiased backdrop-blur-sm");
		expect(write("flex antialiased backdrop-blur-sm", "backdrop-blur-sm", "", true)).toBe("flex antialiased");
	});
});

describe("scopes", () => {
	it("writes under a scope without disturbing the base", () => {
		expect(write("flex p-4 hover:bg-thread", "p-6", "hover:")).toBe("flex p-4 hover:bg-thread hover:p-6");
		expect(write("flex p-4 md:p-6", "p-8", "md:")).toBe("flex p-4 md:p-8");
	});

	it("folds within one scope only", () => {
		expect(write("p-4 md:p-2", "pt-8", "md:")).toBe("p-4 md:p-2 md:pt-8");
	});

	it("keeps a token's weight through a swap", () => {
		expect(write("p-4!", "p-6")).toBe("p-6!");
	});
});

describe("what a base token cannot honestly beat", () => {
	it("names the screen-variant token on the same family", () => {
		expect(screenConflict("w-56 md:w-96", { token: "w-72", scope: "" })).toBe("md:w-96");
		expect(screenConflict("w-56 md:w-96", { token: "h-8", scope: "" })).toBeUndefined();
		expect(screenConflict("w-56 hover:w-96", { token: "w-72", scope: "" })).toBeUndefined();
		expect(screenConflict("w-56 md:w-96", { token: "w-72", scope: "md:" })).toBeUndefined();
	});
});

describe("familyOf", () => {
	it("tells the two readings of one prefix apart", () => {
		expect(familyOf("text-sm")).toBe("text:size");
		expect(familyOf("text-fg")).toBe("text:color");
		expect(familyOf("text-center")).toBe(familyOf("text-left"));
		expect(familyOf("border-2")).toBe("border:width");
		expect(familyOf("border-border")).toBe("border:color");
		expect(familyOf("rounded-md")).toBe("radius");
	});

	it("has no family for what it does not know", () => {
		expect(familyOf("backdrop-blur-sm")).toBeUndefined();
	});
});

describe("familyOf, against the project's own theme (#257)", () => {
	/** kaffe's theme: a type scale of its own, and a colour Tailwind never had. */
	const theme = {
		colour: new Set(["thread", "muted", "bg", "red-500"]),
		text: new Set(["2xs", "xs", "sm", "base", "md", "lg"]),
		weight: new Set(["regular", "medium", "semibold"]),
		font: new Set(["sans", "mono"]),
		leading: new Set(["xs", "sm", "base", "md", "lg"]),
		tracking: new Set(["tight", "normal"]),
		shadow: new Set(["sm", "md"]),
		ease: new Set(["out"]),
		radius: new Set(["xs", "sm", "md", "lg"]),
	};

	it("reads a size this project named itself as a size", () => {
		// Tailwind has no `text-md`, so without the theme it reads as a colour and
		// writing one would take the element's colour away
		expect(familyOf("text-md")).toBe("text:color");
		expect(familyOf("text-md", theme)).toBe("text:size");
		expect(familyOf("text-muted", theme)).toBe("text:color");
		expect(familyOf("font-regular", theme)).toBe("font:weight");
	});

	it("keeps a size write off the colour, and the colour write off the size", () => {
		expect(write("text-muted text-sm", "text-md", "", false, theme)).toBe("text-muted text-md");
		expect(write("text-muted text-md", "text-thread", "", false, theme)).toBe("text-md text-thread");
	});

	it("leaves alone what the theme does not name", () => {
		// a gradient is not a background colour: two properties, two families
		expect(familyOf("bg-linear-to-r", theme)).toBeUndefined();
		expect(write("bg-linear-to-r from-thread", "bg-bg", "", false, theme)).toBe("bg-linear-to-r from-thread bg-bg");
	});

	it("takes the scale and the brackets wherever a family names values too", () => {
		expect(familyOf("leading-4", theme)).toBe("leading");
		expect(familyOf("text-[15px]", theme)).toBe("text:size");
		expect(familyOf("bg-[#ff0044]", theme)).toBe("bg:color");
		expect(familyOf("bg-transparent", theme)).toBe("bg:color");
	});

	it("folds a radius this project named itself", () => {
		expect(write("rounded-md", "rounded-lg", "", false, theme)).toBe("rounded-lg");
		expect(write("rounded-lg", "rounded-tl-none", "", false, theme)).toBe("rounded-lg rounded-tl-none");
	});
});

describe("the families the rail's rows write (#257)", () => {
	it("swaps a filter and a transform rather than stacking them", () => {
		expect(write("brightness-50", "brightness-75")).toBe("brightness-75");
		expect(write("saturate-150 contrast-50", "contrast-125")).toBe("saturate-150 contrast-125");
		expect(write("skew-3", "skew-6")).toBe("skew-6");
		expect(write("rotate-x-12", "rotate-x-45")).toBe("rotate-x-45");
	});

	it("swaps a width named off the container scale", () => {
		expect(write("max-w-lg", "max-w-2xl")).toBe("max-w-2xl");
		expect(write("min-w-xs w-full", "min-w-sm")).toBe("w-full min-w-sm");
	});
});

describe("the colour rows the rail draws (#257)", () => {
	const theme: ClassTheme = {
		colour: new Set(["thread", "muted", "border", "red-500"]),
		text: new Set(["sm", "base"]),
		weight: new Set(["medium"]),
		font: new Set(["mono"]),
		leading: new Set(["base"]),
		tracking: new Set(["tight"]),
		shadow: new Set(["sm", "md"]),
		ease: new Set(["out"]),
		radius: new Set(["sm", "md", "lg"]),
	};

	it("swaps a colour on every prefix a row writes, edge by edge", () => {
		expect(write("caret-red-500", "caret-thread", "", false, theme)).toBe("caret-thread");
		expect(write("shadow-red-500", "shadow-thread", "", false, theme)).toBe("shadow-thread");
		expect(write("divide-red-500", "divide-thread", "", false, theme)).toBe("divide-thread");
		// each edge is its own family: writing the top leaves the bottom alone
		expect(write("border-t-thread border-b-muted", "border-t-muted", "", false, theme)).toBe(
			"border-b-muted border-t-muted",
		);
	});

	it("keeps a shadow's name and a shadow's colour apart", () => {
		expect(familyOf("shadow-md", theme)).toBe("shadow");
		expect(familyOf("shadow-thread", theme)).toBe("shadow:color");
		expect(write("shadow-md shadow-thread", "shadow-sm", "", false, theme)).toBe("shadow-thread shadow-sm");
	});

	it("keeps `rounded-full` a radius, which no theme names", () => {
		expect(familyOf("rounded-full", theme)).toBe("radius");
		expect(write("rounded-full", "rounded-lg", "", false, theme)).toBe("rounded-lg");
		expect(write("rounded-md", "rounded-full", "", false, theme)).toBe("rounded-full");
	});
});

describe("the inset, which folds like the padding does (#257)", () => {
	it("collapses the sides into the fewest tokens", () => {
		expect(write("absolute top-2", "bottom-2")).toBe("absolute inset-y-2");
		expect(write("absolute inset-x-4 inset-y-2", "inset-4")).toBe("absolute inset-4");
		expect(write("absolute top-0 right-0 bottom-0 left-0", "top-2")).toBe("absolute inset-0 top-2");
	});

	it("reads `inset-x-` as the two sides it sets", () => {
		// a `left-0` beside an `inset-x-4` would be two tokens saying one thing
		expect(write("absolute inset-x-4", "left-0")).toBe("absolute right-4");
		expect(write("absolute inset-0", "left-4")).toBe("absolute inset-0 left-4");
	});

	it("keeps the logical spelling a literal was written with", () => {
		expect(write("absolute start-2 end-2", "top-1")).toBe("absolute start-2 end-2 top-1");
		expect(write("absolute start-2", "start-4")).toBe("absolute start-4");
	});

	it("drops a zero at the base and writes one under a scope", () => {
		expect(write("absolute left-4", "left-0")).toBe("absolute");
		expect(write("absolute left-4", "left-0", "md:")).toBe("absolute left-4 md:left-0");
	});
});
