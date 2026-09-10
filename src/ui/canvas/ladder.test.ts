import { describe, expect, it } from "vitest";
import { atRung, firstRung, type LadderScope, oneDown, oneUp, rungOf } from "./ladder";
import type { PickedHit } from "./protocol";

/**
 * The selection ladder (#254). Every rung is a selector, so the whole walk is
 * decidable off the ancestry the shim answers with and the rung already held.
 */

const hit = (selector: string, rect = { x: 0, y: 0, w: 10, h: 10 }): PickedHit => ({
	selector,
	tag: "div",
	outerHtml: `<div data-node="${selector}" />`,
	rect,
	radius: 0,
	source: null,
	generated: false,
});

const chainOf = (...selectors: readonly string[]): PickedHit[] => selectors.map((selector) => hit(selector));

/** screen › footer › pay › label, the deepest branch of the cart document */
const PAY = chainOf("screen", "footer", "pay", "label");
/** screen › footer › total, a sibling branch that diverges at the footer */
const TOTAL = chainOf("screen", "footer", "total");
/** screen › header › title, a branch that diverges one rung higher */
const TITLE = chainOf("screen", "header", "title");

const scope = (chain: readonly PickedHit[], selector: string): LadderScope => ({ chain, selector });

/** the frame the cart is drawn in, and a root element drawn over the whole of it */
const FRAME = { w: 390, h: 780 };
const WRAPPED = [hit("screen", { x: 0, y: 0, w: 390, h: 780 }), ...PAY.slice(1)];

describe("rungOf", () => {
	it("counts the held element's place in its own ancestry", () => {
		expect(rungOf(scope(PAY, "pay"))).toBe(2);
	});

	it("answers -1 with no scope, and for an element the ancestry no longer holds", () => {
		expect(rungOf(null)).toBe(-1);
		expect(rungOf(scope(PAY, "gone"))).toBe(-1);
	});
});

describe("firstRung", () => {
	it("takes the root element, which is a component of its own", () => {
		expect(firstRung(PAY, FRAME)?.selector).toBe("screen");
	});

	it("goes past a root wrapper drawn over the whole frame", () => {
		expect(firstRung(WRAPPED, FRAME)?.selector).toBe("footer");
	});

	it("keeps a wrapper with nothing inside it, and one measured against no frame", () => {
		expect(firstRung(WRAPPED.slice(0, 1), FRAME)?.selector).toBe("screen");
		expect(firstRung(WRAPPED, null)?.selector).toBe("screen");
	});
});

describe("atRung", () => {
	it("takes the top-level child under the pointer when no scope holds", () => {
		expect(atRung(PAY, null, FRAME)?.selector).toBe("screen");
		expect(atRung(WRAPPED, null, FRAME)?.selector).toBe("footer");
	});

	it("takes the sibling at the held rung inside the shared ancestry", () => {
		expect(atRung(TOTAL, scope(PAY, "pay"), FRAME)?.selector).toBe("total");
	});

	it("takes the divergence point outside the shared ancestry", () => {
		expect(atRung(TITLE, scope(PAY, "pay"), FRAME)?.selector).toBe("header");
	});

	it("stays on the held element when the ancestry is the same one", () => {
		expect(atRung(PAY, scope(PAY, "pay"), FRAME)?.selector).toBe("pay");
	});

	it("holds the root wrapper once a climb has put the scope on it", () => {
		expect(atRung(WRAPPED, scope(WRAPPED, "screen"), FRAME)?.selector).toBe("screen");
	});

	it("has nothing to take on the frame background", () => {
		expect(atRung([], scope(PAY, "pay"), FRAME)).toBeUndefined();
	});
});

describe("oneDown", () => {
	it("starts where a first click starts, with no scope held", () => {
		expect(oneDown(PAY, null, FRAME)?.selector).toBe("screen");
		expect(oneDown(WRAPPED, null, FRAME)?.selector).toBe("footer");
	});

	it("walks one rung at a time down the pointer's own ancestry", () => {
		expect(oneDown(PAY, scope(PAY, "screen"), FRAME)?.selector).toBe("footer");
		expect(oneDown(PAY, scope(PAY, "footer"), FRAME)?.selector).toBe("pay");
		expect(oneDown(PAY, scope(PAY, "pay"), FRAME)?.selector).toBe("label");
	});

	it("answers with nothing at the leaf, where the words are what the clicks meant", () => {
		expect(oneDown(PAY, scope(PAY, "label"), FRAME)).toBeUndefined();
	});

	it("restarts at the top when the scope is held on another branch", () => {
		expect(oneDown(TITLE, scope(PAY, "pay"), FRAME)?.selector).toBe("screen");
	});

	it("keeps descending while the held rung is still on this ancestry", () => {
		expect(oneDown(TOTAL, scope(PAY, "footer"), FRAME)?.selector).toBe("total");
	});

	it("has nothing to take on the frame background", () => {
		expect(oneDown([], null, FRAME)).toBeUndefined();
	});
});

describe("oneUp", () => {
	it("climbs to the parent", () => {
		expect(oneUp(scope(PAY, "pay"))?.selector).toBe("footer");
	});

	it("has no parent at the root element, which is where the frame is", () => {
		expect(oneUp(scope(PAY, "screen"))).toBeUndefined();
		expect(oneUp(null)).toBeUndefined();
	});
});
