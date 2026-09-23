import { describe, expect, it } from "vitest";
import { deepest, openingOf, parentOf, wordsAsk } from "./element-selection";
import type { PickedSelection } from "./overlays";
import type { PickedHit } from "./protocol";

/**
 * The Edit tool's selection, as the decisions it makes from what is already
 * held (#339). Everything here is a walk over the selectors the frame handed
 * out, so it is decidable without a document.
 */

function hit(selector: string, extra: Partial<PickedHit> = {}): PickedHit {
	return {
		selector,
		tag: selector.split(" > ").at(-1)?.replace(/:.*$/, "") ?? "div",
		outerHtml: "",
		rect: { x: 0, y: 0, w: 10, h: 10 },
		radius: 0,
		source: `frames/home/frame.tsx:${selector.length}:3`,
		generated: false,
		...extra,
	};
}

const pick = (selector: string, extra: Partial<PickedHit> = {}): PickedSelection => ({
	frame: "home",
	...hit(selector, extra),
});

const CHAIN = [hit("main"), hit("main > ul"), hit("main > ul > li:nth-of-type(2)")];
const held = (...selectors: string[]) => ({
	picks: selectors.map((selector) => pick(selector)),
	chain: { frame: "home", chain: CHAIN },
});

describe("deepest", () => {
	it("is the last of the ancestry, and nothing on the frame's background", () => {
		expect(deepest(CHAIN)?.selector).toBe("main > ul > li:nth-of-type(2)");
		expect(deepest([])).toBeUndefined();
	});
});

describe("parentOf", () => {
	it("climbs one element up the ancestry the pick was found in", () => {
		const up = parentOf(held("main > ul > li:nth-of-type(2)"));
		expect(up?.hit?.selector).toBe("main > ul");
		// the ancestry the parent now stands at the bottom of
		expect(up?.chain.map((one) => one.selector)).toEqual(["main", "main > ul"]);
	});

	it("climbs from the frame's top-level element to the frame itself", () => {
		expect(parentOf(held("main"))).toEqual({ frame: "home", chain: [], hit: null });
	});

	it("climbs from several siblings to the parent they share", () => {
		const up = parentOf(held("main > ul > li:nth-of-type(1)", "main > ul > li:nth-of-type(2)"));
		expect(up?.hit?.selector).toBe("main > ul");
	});

	it("has no one parent for elements in different places, or named by an id", () => {
		expect(parentOf(held("main > h1", "main > ul > li:nth-of-type(2)"))).toBeUndefined();
		expect(parentOf(held("#lede", "main > ul > li:nth-of-type(2)"))).toBeUndefined();
	});

	it("has nothing to say where the ancestry is another frame's, or no longer holds the pick", () => {
		expect(parentOf({ picks: [pick("main > ul")], chain: { frame: "cart", chain: CHAIN } })).toBeUndefined();
		expect(parentOf({ picks: [pick("main > nav")], chain: { frame: "home", chain: CHAIN } })).toBeUndefined();
		expect(parentOf({ picks: [], chain: null })).toBeUndefined();
	});
});

describe("openingOf", () => {
	const words = pick("main > h1", { words: true, source: "frames/home/frame.tsx:4:5" });

	it("opens the words of an element with words of its own", () => {
		expect(openingOf(words, undefined)).toEqual({ kind: "words" });
		expect(openingOf(words, { source: "frames/home/frame.tsx:4:5" })).toEqual({ kind: "words" });
	});

	it("steps into the children of a group, which has no words to open", () => {
		expect(openingOf(pick("main > ul"), undefined)).toEqual({ kind: "children" });
	});

	it("says the file's refusal before anything is typed, when the read is this element's", () => {
		const refusal = { code: "expression-text", says: "{title} is an expression" };
		expect(openingOf(words, { source: "frames/home/frame.tsx:4:5", words: refusal })).toEqual({
			kind: "refused",
			refusal,
		});
		// a read about another element says nothing about these words
		expect(openingOf(words, { source: "frames/home/frame.tsx:9:5", words: refusal })).toEqual({ kind: "words" });
	});

	it("names the attempt the refusal hands the agent", () => {
		expect(wordsAsk(words)).toBe("Change the words of the h1");
	});
});
