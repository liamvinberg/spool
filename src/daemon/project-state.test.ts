import { describe, expect, it } from "vitest";
import { type CanvasState, pageMovedInState, pagesDroppedFromState, parseCanvasState } from "./project-state";

/**
 * The canvas state's page bookkeeping, asked directly (#39, #231).
 *
 * The page the canvas is on and every page's camera are keyed by path, so a
 * page that moves has to be found again at its new one — including when what
 * moved is two levels above the key that names it.
 */

const camera = (x: number) => ({ x, y: x, k: 1 });

/** explorations > chat > deeper, with the canvas parked on the deepest one */
const stored: CanvasState = {
	camera: camera(0),
	activePage: "explorations/chat/deeper",
	pageCameras: {
		explorations: camera(1),
		"explorations/chat": camera(2),
		"explorations/chat/deeper": camera(3),
		site: camera(4),
	},
};

describe("a page that moved", () => {
	it("carries the active page and every camera under it", () => {
		expect(pageMovedInState(stored, "explorations", "research")).toEqual({
			camera: camera(0),
			activePage: "research/chat/deeper",
			pageCameras: {
				research: camera(1),
				"research/chat": camera(2),
				"research/chat/deeper": camera(3),
				site: camera(4),
			},
		});
	});

	/** The grandchild nothing on the path names, and the canvas standing on it. */
	it("carries a grandchild when the page in the middle is what moved", () => {
		expect(pageMovedInState(stored, "explorations/chat", "site/chat")).toMatchObject({
			activePage: "site/chat/deeper",
			pageCameras: {
				explorations: camera(1),
				"site/chat": camera(2),
				"site/chat/deeper": camera(3),
			},
		});
	});

	it("leaves the root page's own camera slot alone, so a flat file reads unchanged", () => {
		expect(pageMovedInState(stored, "explorations", "research")?.camera).toEqual(camera(0));
	});

	it("says nothing when the state never named it", () => {
		expect(pageMovedInState({ camera: camera(0) }, "explorations", "research")).toBeUndefined();
		expect(pageMovedInState(stored, "archive", "old")).toBeUndefined();
	});
});

describe("pages that are gone", () => {
	it("drops the cameras of a trashed page and of every page inside it", () => {
		expect(pagesDroppedFromState(stored, ["explorations"])).toEqual({
			camera: camera(0),
			pageCameras: { site: camera(4) },
		});
	});

	it("takes the canvas off a page that was inside the one that went", () => {
		expect(pagesDroppedFromState(stored, ["explorations/chat"])?.activePage).toBeUndefined();
	});

	it("says nothing when the state never named one", () => {
		expect(pagesDroppedFromState(stored, ["archive"])).toBeUndefined();
	});
});

describe("what the state file may say", () => {
	it("takes a page path, segment by segment", () => {
		expect(parseCanvasState({ activePage: "explorations/chat" })).toEqual({ activePage: "explorations/chat" });
		expect(parseCanvasState({ pageCameras: { "explorations/chat": camera(1) } })).toEqual({
			pageCameras: { "explorations/chat": camera(1) },
		});
	});

	it("refuses a segment that is not a name", () => {
		expect(parseCanvasState({ activePage: "explorations/../escape" })).toBeUndefined();
		expect(parseCanvasState({ activePage: "explorations/.hidden" })).toBeUndefined();
		expect(parseCanvasState({ activePage: "" })).toBeUndefined();
		expect(parseCanvasState({ pageCameras: { "a//b": camera(1) } })).toBeUndefined();
	});
});
