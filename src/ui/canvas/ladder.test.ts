import { describe, expect, it } from "vitest";
import { atRung, type LadderScope, oneDown, oneUp, rungOf } from "./ladder";
import type { PickedHit } from "./protocol";

/**
 * The selection ladder (#254). Every rung is a selector, so the whole walk is
 * decidable off the ancestry the shim answers with and the rung already held.
 */

const hit = (selector: string): PickedHit => ({
	selector,
	tag: "div",
	outerHtml: `<div data-node="${selector}" />`,
	rect: { x: 0, y: 0, w: 10, h: 10 },
	radius: 0,
	source: null,
	generated: false,
});

const chainOf = (...selectors: readonly string[]): PickedHit[] => selectors.map(hit);

/** screen › footer › pay › label, the deepest branch of the cart document */
const PAY = chainOf("screen", "footer", "pay", "label");
/** screen › footer › total, a sibling branch that diverges at the footer */
const TOTAL = chainOf("screen", "footer", "total");
/** screen › header › title, a branch that diverges one rung higher */
const TITLE = chainOf("screen", "header", "title");

const scope = (chain: readonly PickedHit[], selector: string): LadderScope => ({ chain, selector });

describe("rungOf", () => {
	it("counts the held element's place in its own ancestry", () => {
		expect(rungOf(scope(PAY, "pay"))).toBe(2);
	});

	it("answers -1 with no scope, and for an element the ancestry no longer holds", () => {
		expect(rungOf(null)).toBe(-1);
		expect(rungOf(scope(PAY, "gone"))).toBe(-1);
	});
});

describe("atRung", () => {
	it("takes the root element when no scope holds", () => {
		expect(atRung(PAY, null)?.selector).toBe("screen");
	});

	it("takes the sibling at the held rung inside the shared ancestry", () => {
		expect(atRung(TOTAL, scope(PAY, "pay"))?.selector).toBe("total");
	});

	it("takes the divergence point outside the shared ancestry", () => {
		expect(atRung(TITLE, scope(PAY, "pay"))?.selector).toBe("header");
	});

	it("stays on the held element when the ancestry is the same one", () => {
		expect(atRung(PAY, scope(PAY, "pay"))?.selector).toBe("pay");
	});

	it("has nothing to take on the frame background", () => {
		expect(atRung([], scope(PAY, "pay"))).toBeUndefined();
	});
});

describe("oneDown", () => {
	it("starts at the root element with no scope held", () => {
		expect(oneDown(PAY, null)?.selector).toBe("screen");
	});

	it("walks one rung at a time down the pointer's own ancestry", () => {
		expect(oneDown(PAY, scope(PAY, "screen"))?.selector).toBe("footer");
		expect(oneDown(PAY, scope(PAY, "footer"))?.selector).toBe("pay");
		expect(oneDown(PAY, scope(PAY, "pay"))?.selector).toBe("label");
	});

	it("stops at the leaf rather than running off the end", () => {
		expect(oneDown(PAY, scope(PAY, "label"))?.selector).toBe("label");
	});

	it("restarts at the root element when the scope is held on another branch", () => {
		expect(oneDown(TITLE, scope(PAY, "pay"))?.selector).toBe("screen");
	});

	it("keeps descending while the held rung is still on this ancestry", () => {
		expect(oneDown(TOTAL, scope(PAY, "footer"))?.selector).toBe("total");
	});

	it("has nothing to take on the frame background", () => {
		expect(oneDown([], null)).toBeUndefined();
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
