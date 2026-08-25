import { describe, expect, it } from "vitest";
import { bareToken, scopeKey, scopeLabel, scopesOf, scopeWhen, tokensUnder, underScope } from "./properties-scope";

/**
 * The scope bar's own vocabulary (#256): which scopes a literal carries, what
 * sits under each, and how a chain is spelled where it has to be typed.
 */

describe("scopesOf", () => {
	it("always carries the base, and every chain the literal has, once", () => {
		expect(scopesOf("flex hover:bg-thread p-4 hover:text-text md:p-8").map(scopeLabel)).toEqual([
			"base",
			"hover:",
			"md:",
		]);
	});

	it("has the base even when nothing is written at the base", () => {
		expect(scopesOf("hover:bg-thread").map(scopeLabel)).toEqual(["base", "hover:"]);
		expect(scopesOf("").map(scopeLabel)).toEqual(["base"]);
	});

	it("orders the chains by the variant table rather than by where the literal put them", () => {
		expect(scopesOf("md:p-8 dark:bg-bg hover:p-2").map(scopeLabel)).toEqual(["base", "hover:", "md:", "dark:"]);
	});

	it("keeps a chain of two as one scope, spelled the way the token spells it", () => {
		expect(scopesOf("md:hover:p-8").map(scopeLabel)).toEqual(["base", "md:hover:"]);
		// the two spell the same rule and are two scopes all the same, because the
		// literal keeps them apart and a token has to be written back as it was
		expect(scopesOf("md:hover:p-8 hover:md:p-8").map(scopeLabel)).toEqual(["base", "hover:md:", "md:hover:"]);
	});
});

describe("what sits under a scope", () => {
	const literal = "flex p-4 hover:bg-thread hover:-mt-2! md:p-8";

	it("takes the tokens of one scope and leaves the others where they are", () => {
		expect(tokensUnder(literal, [])).toEqual(["flex", "p-4"]);
		expect(tokensUnder(literal, ["hover"])).toEqual(["hover:bg-thread", "hover:-mt-2!"]);
		expect(tokensUnder(literal, ["md"])).toEqual(["md:p-8"]);
		expect(tokensUnder(literal, ["dark"])).toEqual([]);
	});

	it("reads a bracket value as one token, colons and all", () => {
		expect(underScope("[mask-type:luminance]", [])).toBe(true);
		expect(underScope("hover:[mask-type:luminance]", ["hover"])).toBe(true);
	});
});

describe("the spellings", () => {
	it("says base where there is no prefix to print, and the prefix everywhere else", () => {
		expect(scopeLabel([])).toBe("base");
		expect(scopeKey([])).toBe("");
		expect(scopeLabel(["md", "hover"])).toBe("md:hover:");
		expect(scopeKey(["md", "hover"])).toBe("md:hover:");
	});

	it("takes the variants off a token, and keeps its sign and its weight", () => {
		expect(bareToken("hover:-mt-2!")).toBe("-mt-2!");
		expect(bareToken("p-4")).toBe("p-4");
		expect(bareToken("md:hover:bg-thread/50")).toBe("bg-thread/50");
	});

	it("says what a chain applies under, and nothing for one it does not know", () => {
		expect(scopeWhen([])).toBeUndefined();
		expect(scopeWhen(["hover"])).toBe(":hover");
		expect(scopeWhen(["md", "dark"])).toBe("width >= 48rem and prefers-color-scheme: dark");
		expect(scopeWhen(["print"])).toBeUndefined();
	});
});
