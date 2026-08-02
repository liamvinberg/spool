import { describe, expect, it } from "vitest";
import { type CanvasOrder, parseOrder, withPageMoved, withPagesDropped } from "./canvas-order";

/**
 * The stored order's own rules, asked directly (#228, #231).
 *
 * Every list is per parent and holds names rather than paths, so a page that
 * moves changes two things at once: the keys naming it and everything under it,
 * which are identity, and its place among its siblings, which is arrangement.
 * The API tests drive these through a real canvas.json; these hold the rules
 * themselves, where a three-level fixture costs one object.
 */

/** explorations > chat > deeper, with a frame list at every level */
const stored: CanvasOrder = {
	pages: { "": ["explorations", "application"], explorations: ["chat"], "explorations/chat": ["deeper"] },
	frames: { "": ["home"], explorations: ["notes"], "explorations/chat/deeper": ["buried"] },
};

describe("a page that moved", () => {
	it("carries every key under it and renames it where it stands", () => {
		expect(withPageMoved(stored, "explorations", "research")).toEqual({
			pages: { "": ["research", "application"], research: ["chat"], "research/chat": ["deeper"] },
			frames: { "": ["home"], research: ["notes"], "research/chat/deeper": ["buried"] },
		});
	});

	/** The one nothing on the path names: a grandchild's list still has to arrive. */
	it("carries a grandchild's lists when the page in the middle is what moved", () => {
		expect(withPageMoved(stored, "explorations/chat", "application/chat")).toEqual({
			pages: { "": ["explorations", "application"], explorations: [], "application/chat": ["deeper"] },
			frames: { "": ["home"], explorations: ["notes"], "application/chat/deeper": ["buried"] },
		});
	});

	it("leaves the list it came out of, because where it lands is the drop's to say", () => {
		const moved = withPageMoved(stored, "explorations", "application/explorations");
		expect(moved?.pages?.[""]).toEqual(["application"]);
		expect(moved?.pages?.application).toBeUndefined();
		expect(moved?.pages?.["application/explorations"]).toEqual(["chat"]);
	});

	it("says nothing about an order that never named it", () => {
		expect(withPageMoved({ frames: { "": ["home"] } }, "explorations", "research")).toBeUndefined();
		expect(withPageMoved(stored, "site", "archive")).toBeUndefined();
	});
});

describe("pages that are gone", () => {
	it("takes the pages inside a trashed one with it, and its place in the list", () => {
		expect(withPagesDropped(stored, ["explorations"])).toEqual({
			pages: { "": ["application"] },
			frames: { "": ["home"] },
		});
	});

	it("drops a page named alongside one of its own without minding the order", () => {
		expect(withPagesDropped(stored, ["explorations/chat/deeper", "explorations/chat"])).toEqual({
			pages: { "": ["explorations", "application"], explorations: [] },
			frames: { "": ["home"], explorations: ["notes"] },
		});
	});

	it("says nothing when the order never named one", () => {
		expect(withPagesDropped(stored, ["site"])).toBeUndefined();
	});
});

describe("what the file may say", () => {
	/** A flat project's file is a bare list, and it means the root parent's. */
	it("reads a flat pages list as the root parent's own", () => {
		expect(parseOrder({ pages: ["shop", "admin"] })).toEqual({ pages: { "": ["shop", "admin"] } });
	});

	it("reads the keyed form, and refuses a key or a name that is not one", () => {
		expect(parseOrder({ pages: { "": ["shop"], shop: ["sale"] } })).toEqual({
			pages: { "": ["shop"], shop: ["sale"] },
		});
		expect(parseOrder({ pages: { "a/../b": ["c"] } })).toBeUndefined();
		expect(parseOrder({ pages: { shop: ["a/b"] } })).toBeUndefined();
		expect(parseOrder({ pages: "shop" })).toBeUndefined();
	});
});
