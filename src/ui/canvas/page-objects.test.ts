import { describe, expect, it } from "vitest";
import type { ProjectedFrame } from "../api";
import { framesUnder, pageIsBare, pageObjectAt, pageObjectsOn } from "./page-objects";

/**
 * What the field draws for the pages standing on it (#265).
 *
 * The claim under test is that a page object is composed from the projection
 * and nothing else: every frame under the page, at its own geometry, with the
 * cover it already has. So most of this is about which frames belong to which
 * object, and the rest is about the two pages that used to wear one picture.
 */

function frame(name: string, page: string | undefined, rect: { x: number; y: number }): ProjectedFrame {
	return { name, ...(page === undefined ? {} : { page }), ...rect, w: 1000, h: 600 };
}

const FRAMES: ProjectedFrame[] = [
	frame("home", undefined, { x: 0, y: 0 }),
	frame("notes", "explorations", { x: 0, y: 0 }),
	frame("said", "explorations/chat", { x: 2000, y: 0 }),
	frame("alone", "scratch", { x: 0, y: 0 }),
];

const PAGES = ["explorations", "explorations/chat", "scratch"];
const PLACES = {
	explorations: { x: 1200, y: 0 },
	"explorations/chat": { x: 1200, y: 0 },
	scratch: { x: 4000, y: 0 },
};

describe("the frames a page object draws", () => {
	it("takes everything under the page, its own pages' included", () => {
		expect(framesUnder("explorations", FRAMES).map((each) => each.name)).toEqual(["notes", "said"]);
	});

	it("takes nothing from a sibling page", () => {
		expect(framesUnder("scratch", FRAMES).map((each) => each.name)).toEqual(["alone"]);
	});

	it("carries each frame's cover into the picture, and says nothing where there is none", () => {
		const covered = [{ ...frame("shot", "scratch", { x: 0, y: 0 }), cover: { hash: "abc", w: 10, h: 10 } }];
		const [object] = pageObjectsOn("", ["scratch"], covered, PLACES);
		expect(object?.composition.frames[0]).toMatchObject({ name: "shot", hash: "abc" });
		const [bare] = pageObjectsOn("", ["scratch"], FRAMES, PLACES);
		expect(bare?.composition.frames[0]).not.toHaveProperty("hash");
	});
});

describe("the pages standing on a field", () => {
	it("draws a page's own pages and nothing deeper", () => {
		expect(pageObjectsOn("", PAGES, FRAMES, PLACES).map((each) => each.page)).toEqual(["explorations", "scratch"]);
		expect(pageObjectsOn("explorations", PAGES, FRAMES, PLACES).map((each) => each.page)).toEqual([
			"explorations/chat",
		]);
	});

	it("stands each one where its place says", () => {
		const [first] = pageObjectsOn("", PAGES, FRAMES, PLACES);
		expect(first).toMatchObject({ x: 1200, y: 0 });
	});

	it("counts everything under it, which is the number the rail carries", () => {
		const objects = pageObjectsOn("", PAGES, FRAMES, PLACES);
		expect(objects.map((each) => [each.name, each.count])).toEqual([
			["explorations", 2],
			["scratch", 1],
		]);
	});

	it("draws no page it has no place for, rather than guessing one", () => {
		expect(pageObjectsOn("", PAGES, FRAMES, {})).toEqual([]);
	});

	it("fits its picture inside its box whole", () => {
		const [object] = pageObjectsOn("", PAGES, FRAMES, PLACES);
		if (object === undefined) throw new Error("explorations should draw");
		const drawn = object.composition.frames.map((each) => ({
			x: object.fit.dx + each.x * object.fit.scale,
			y: object.fit.dy + each.y * object.fit.scale,
			w: each.w * object.fit.scale,
			h: each.h * object.fit.scale,
		}));
		for (const rect of drawn) {
			expect(rect.x).toBeGreaterThanOrEqual(-0.001);
			expect(rect.y).toBeGreaterThanOrEqual(-0.001);
			expect(rect.x + rect.w).toBeLessThanOrEqual(object.w + 0.001);
			expect(rect.y + rect.h).toBeLessThanOrEqual(object.h + 0.001);
		}
	});
});

describe("picking a page off the field", () => {
	const objects = pageObjectsOn("", PAGES, FRAMES, PLACES);

	it("answers the page a point landed in", () => {
		const first = objects[0];
		if (first === undefined) throw new Error("explorations should draw");
		expect(pageObjectAt(objects, { x: first.x + 5, y: first.y + 5 })?.page).toBe("explorations");
	});

	it("answers nothing out on the field", () => {
		expect(pageObjectAt(objects, { x: -9000, y: -9000 })).toBeNull();
	});
});

describe("a page with nothing anywhere", () => {
	it("is bare only when it holds neither frames nor pages", () => {
		expect(pageIsBare("fresh", [...PAGES, "fresh"], FRAMES)).toBe(true);
	});

	/** The case the two used to share: a page of pages is full, and draws them. */
	it("is not bare on a page that holds only pages", () => {
		expect(pageIsBare("explorations", PAGES, FRAMES)).toBe(false);
		expect(pageIsBare("", PAGES, FRAMES)).toBe(false);
	});

	it("is not bare on a page that holds frames of its own", () => {
		expect(pageIsBare("scratch", PAGES, FRAMES)).toBe(false);
		expect(pageIsBare("explorations/chat", PAGES, FRAMES)).toBe(false);
	});
});
