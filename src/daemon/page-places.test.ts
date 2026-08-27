import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_FRAME_AREA } from "../page-box";
import { makeTempDir, writeDesignFile, writeFrame, writePageFrame } from "../test-helpers";
import { writePlaces } from "./canvas-places";
import { listProjectFrames, pageObjectBox, placePages } from "./projection";

/**
 * A page standing on the field that holds it (#265), as the daemon completes it.
 *
 * A page's place is an arrangement, so nothing here re-derives one somebody
 * made; what it checks is the two things the daemon owes a page that has none —
 * a coordinate beside the field it belongs to, and that coordinate written down
 * so the next machine to pull the project sees the same canvas.
 */

const TSX = "export default () => null;\n";

/** the median-area default, drawn as one frame's worth of box */
const ONE_FRAME = Math.round(Math.sqrt(DEFAULT_FRAME_AREA * 1.6));

function canvasJson(root: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(root, "design", "canvas.json"), "utf8"));
}

describe("the box a page occupies on its field", () => {
	const frames = [
		{ name: "home", x: 0, y: 0, w: 1440, h: 900 },
		{ name: "one", page: "explorations", x: 0, y: 0, w: 1440, h: 900 },
		{ name: "two", page: "explorations/chat", x: 2000, y: 0, w: 1440, h: 900 },
	];

	it("counts everything under the page, its own pages' frames included", () => {
		const deep = pageObjectBox("explorations", frames);
		const shallow = pageObjectBox("explorations/chat", frames);
		expect(deep.w * deep.h).toBeGreaterThan(shallow.w * shallow.h);
	});

	it("draws a page of one frame exactly one frame big", () => {
		expect(pageObjectBox("explorations/chat", frames)).toEqual({ w: ONE_FRAME, h: Math.round(ONE_FRAME / 1.6) });
	});

	it("takes its size from the field it stands on and its shape from what is inside it", () => {
		// `explorations/chat` stands among `explorations`' own frames, which are
		// desktop-sized; the one frame inside it is tiny and sets the shape alone
		const tiny = [
			{ name: "big", page: "explorations", x: 0, y: 0, w: 1440, h: 900 },
			{ name: "small", page: "explorations/chat", x: 0, y: 0, w: 100, h: 100 },
		];
		const box = pageObjectBox("explorations/chat", tiny);
		expect(box.w * box.h).toBeCloseTo(1440 * 900, -4);
		expect(box.w / box.h).toBeCloseTo(1, 2);
	});
});

describe("completing a page that has no place", () => {
	const frames = [
		{ name: "home", x: 0, y: 200, w: 1000, h: 600 },
		{ name: "next", x: 1200, y: 400, w: 1000, h: 600 },
		{ name: "inside", page: "explorations", x: 0, y: 0, w: 1000, h: 600 },
	];

	it("stands it beside the parent's own field, on that field's top line", () => {
		const { places, filled } = placePages(["explorations"], frames, {});
		expect(filled).toBe(true);
		// the right edge of the field is 2200, the top line is y 200
		expect(places.explorations).toEqual({ x: 2200 + 80, y: 200 });
	});

	it("stands the first page of an empty field at the gutter", () => {
		const { places } = placePages(["explorations"], [{ page: "explorations", x: 0, y: 0, w: 10, h: 10 }], {});
		expect(places.explorations).toEqual({ x: 80, y: 80 });
	});

	it("never puts one page on top of another", () => {
		const { places } = placePages(["alpha", "beta"], frames, {});
		const alpha = places.alpha;
		const beta = places.beta;
		if (alpha === undefined || beta === undefined) throw new Error("both pages should be placed");
		expect(beta.x).toBeGreaterThan(alpha.x + pageObjectBox("alpha", frames).w);
	});

	it("leaves a stored place exactly where it is, and a stale key alone", () => {
		const stored = { explorations: { x: -500, y: -500 }, "gone/for/good": { x: 3, y: 3 } };
		const { places, filled } = placePages(["explorations"], frames, stored);
		expect(filled).toBe(false);
		expect(places).toEqual(stored);
	});

	it("places a page inside a page against its own parent's field", () => {
		const { places } = placePages(["explorations", "explorations/chat"], frames, {});
		// `chat` stands among `explorations`' frames, which start at the origin
		expect(places["explorations/chat"]).toEqual({ x: 1000 + 80, y: 0 });
	});
});

describe("the projection's places", () => {
	it("hands back a place for every page and writes the ones it filled in", () => {
		const root = makeTempDir();
		writeFrame(root, "home", TSX);
		writePageFrame(root, "explorations", "notes", TSX);
		writePageFrame(root, "explorations/chat", "said", TSX);

		const { places, pages } = listProjectFrames(root);
		expect(Object.keys(places).sort()).toEqual(pages);
		expect(canvasJson(root).places).toEqual(places);
	});

	it("is stable across reads, so a second open does not move anything", () => {
		const root = makeTempDir();
		writeFrame(root, "home", TSX);
		writePageFrame(root, "explorations", "notes", TSX);

		const first = listProjectFrames(root).places;
		expect(listProjectFrames(root).places).toEqual(first);
	});

	it("keeps what a hand arranged", () => {
		const root = makeTempDir();
		writeFrame(root, "home", TSX);
		writePageFrame(root, "explorations", "notes", TSX);
		writePlaces(root, { explorations: { x: -4000, y: 120 } });

		expect(listProjectFrames(root).places.explorations).toEqual({ x: -4000, y: 120 });
	});

	it("has nothing to place in a flat project, and leaves it without a canvas.json", () => {
		const root = makeTempDir();
		writeFrame(root, "home", TSX);
		expect(listProjectFrames(root).places).toEqual({});
		expect(existsSync(join(root, "design", "canvas.json"))).toBe(false);
	});

	it("does not refuse to open a project whose canvas.json somebody broke", () => {
		const root = makeTempDir();
		writeFrame(root, "home", TSX);
		writePageFrame(root, "explorations", "notes", TSX);
		writeDesignFile(root, "canvas.json", "not json at all\n");

		const { places } = listProjectFrames(root);
		expect(places.explorations).toBeDefined();
		expect(readFileSync(join(root, "design", "canvas.json"), "utf8")).toBe("not json at all\n");
	});
});
