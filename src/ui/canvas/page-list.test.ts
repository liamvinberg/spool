import { describe, expect, it } from "vitest";
import type { ProjectedFrame } from "../api";
import { chainOf, downOf, holdsLine, listsPages, type PageWorld, pageListRows, pageTreeOf } from "./page-list";

function frame(name: string, hash?: string): ProjectedFrame {
	const cut = name.lastIndexOf("/");
	return {
		name,
		...(cut === -1 ? {} : { page: name.slice(0, cut) }),
		x: 0,
		y: 0,
		w: 390,
		h: 844,
		...(hash === undefined ? {} : { cover: { hash } }),
	} as ProjectedFrame;
}

// the take's fixture: the root holds frames, explore holds only pages
const KAFFE: PageWorld = {
	pages: ["app", "explore", "explore/checkout", "explore/checkout/tipping", "explore/loyalty"],
	frames: [
		frame("home"),
		frame("app/menu"),
		frame("explore/checkout/pay", "p1"),
		frame("explore/checkout/cart", "c1"),
		frame("explore/checkout/tipping/tip"),
	],
	waiting: [{ page: "explore/loyalty" }],
	order: { pages: { explore: ["loyalty", "checkout"] }, frames: { "explore/checkout": ["cart", "pay"] } },
};

describe("a page of pages", () => {
	it("is a list only while it holds pages and nothing of its own", () => {
		expect(listsPages("explore", KAFFE)).toBe(true);
		expect(listsPages("", KAFFE)).toBe(false);
		expect(listsPages("", { ...KAFFE, frames: KAFFE.frames.filter((f) => f.name !== "home") })).toBe(true);
		// a placeholder is something of its own: the designer's frame is on its way there
		expect(listsPages("explore", { ...KAFFE, waiting: [{ page: "explore" }] })).toBe(false);
		expect(listsPages("app", KAFFE)).toBe(false);
	});

	it("rows its pages in rail order, each with its first frame's still and what it holds", () => {
		expect(pageListRows("explore", KAFFE)).toEqual([
			{ page: "explore/loyalty", name: "loyalty", count: 1, holds: [] },
			{
				page: "explore/checkout",
				name: "checkout",
				count: 3,
				holds: ["tipping"],
				still: { frame: "explore/checkout/cart", hash: "c1" },
			},
		]);
		// a page of only pages takes its still from the first of them
		expect(pageListRows("", KAFFE).find((row) => row.page === "explore")?.still).toEqual({
			frame: "explore/checkout/cart",
			hash: "c1",
		});
		expect(holdsLine({ count: 3, holds: ["tipping"] })).toBe("3 frames · tipping");
		expect(holdsLine({ count: 1, holds: [] })).toBe("1 frame");
	});

	it("goes down into the page picked, else the first, and names its chain from the root", () => {
		const tree = pageTreeOf(KAFFE);
		expect(downOf("explore", "explore/checkout", tree)).toBe("explore/checkout");
		expect(downOf("explore", "app", tree)).toBe("explore/loyalty");
		expect(downOf("app", null, tree)).toBeNull();
		expect(chainOf("explore/checkout")).toEqual(["", "explore", "explore/checkout"]);
		expect(chainOf("")).toEqual([""]);
	});
});
