import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeDesignFile } from "../test-helpers";
import { CanvasFileError } from "./canvas-file";
import { readOrder, writeOrder } from "./canvas-order";
import { parsePlaces, readPlaces, withPageMoved, withPagesDropped, writePlaces } from "./canvas-places";

/**
 * The places durable's own rules (#265).
 *
 * It is the second thing living in design/canvas.json, so the rule the file has
 * always been under is the one most of this checks: a write of one key carries
 * every other key through, including keys spool has never heard of.
 */

function canvasJson(root: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(root, "design", "canvas.json"), "utf8"));
}

function project(fields: Record<string, unknown> = { format: 1 }): string {
	const root = makeTempDir();
	writeDesignFile(root, "canvas.json", `${JSON.stringify(fields, null, "\t")}\n`);
	return root;
}

describe("reading places", () => {
	it("reads nothing from a project that has never been arranged", () => {
		expect(readPlaces(project())).toEqual({});
	});

	it("reads what is stored, keyed by page path", () => {
		const root = project({ format: 1, places: { "explorations/chat": { x: 240, y: -80 } } });
		expect(readPlaces(root)).toEqual({ "explorations/chat": { x: 240, y: -80 } });
	});

	it("reads a broken places key as absent rather than refusing to open the project", () => {
		expect(readPlaces(project({ format: 1, places: { "": { x: 0, y: 0 } } }))).toEqual({});
		expect(readPlaces(project({ format: 1, places: [1, 2] }))).toEqual({});
	});
});

describe("writing places", () => {
	it("keeps the order key byte for byte, and a key spool never wrote", () => {
		const root = project();
		writeOrder(root, { pages: { "": ["explorations"] }, frames: { "": ["home"] } });
		const before = canvasJson(root);
		writePlaces(root, { explorations: { x: 100, y: 200 } });
		const after = canvasJson(root);
		expect(after.order).toEqual(before.order);
		expect(readOrder(root)).toEqual({ pages: { "": ["explorations"] }, frames: { "": ["home"] } });
	});

	it("carries a hand-added key through", () => {
		const root = project({ format: 1, mine: { note: "keep me" } });
		writePlaces(root, { explorations: { x: 1, y: 2 } });
		expect(canvasJson(root).mine).toEqual({ note: "keep me" });
	});

	it("takes the key back out rather than storing an arrangement of nothing", () => {
		const root = project();
		writePlaces(root, { explorations: { x: 1, y: 2 } });
		expect(canvasJson(root)).toHaveProperty("places");
		writePlaces(root, {});
		expect(canvasJson(root)).not.toHaveProperty("places");
	});

	it("refuses a canvas.json it cannot read, rather than clobbering it", () => {
		const root = makeTempDir();
		writeDesignFile(root, "canvas.json", "not json at all\n");
		expect(() => writePlaces(root, { explorations: { x: 1, y: 2 } })).toThrow(CanvasFileError);
	});
});

describe("a page that moved", () => {
	const stored = {
		explorations: { x: 100, y: 100 },
		"explorations/chat": { x: 200, y: 200 },
		application: { x: 300, y: 300 },
	};

	it("keeps its place through a rename, because it is the same page in the same spot", () => {
		expect(withPageMoved(stored, "explorations", "research")).toEqual({
			research: { x: 100, y: 100 },
			"research/chat": { x: 200, y: 200 },
			application: { x: 300, y: 300 },
		});
	});

	it("gives its own place up when it changes parent, and its subtree keeps theirs", () => {
		expect(withPageMoved(stored, "explorations", "application/explorations")).toEqual({
			"application/explorations/chat": { x: 200, y: 200 },
			application: { x: 300, y: 300 },
		});
	});

	it("says nothing when the move touched no place it holds", () => {
		expect(withPageMoved(stored, "elsewhere", "somewhere")).toBeUndefined();
	});
});

describe("a page that was trashed", () => {
	const stored = { explorations: { x: 1, y: 1 }, "explorations/chat": { x: 2, y: 2 }, application: { x: 3, y: 3 } };

	it("takes its own place and every place inside it", () => {
		expect(withPagesDropped(stored, ["explorations"])).toEqual({ application: { x: 3, y: 3 } });
	});

	it("says nothing when it had no place to take", () => {
		expect(withPagesDropped(stored, ["elsewhere"])).toBeUndefined();
	});
});

describe("parsing a place on the way in", () => {
	it("rounds to whole world units, because a frame's sidecar does", () => {
		expect(parsePlaces({ explorations: { x: 12.6, y: -4.2 } })).toEqual({ explorations: { x: 13, y: -4 } });
	});

	it("refuses the root page, which is the field itself and stands nowhere", () => {
		expect(parsePlaces({ "": { x: 0, y: 0 } })).toBeUndefined();
	});

	it("refuses anything that is not a point", () => {
		expect(parsePlaces({ explorations: { x: 0 } })).toBeUndefined();
		expect(parsePlaces({ explorations: { x: Number.NaN, y: 0 } })).toBeUndefined();
		expect(parsePlaces("nope")).toBeUndefined();
	});

	/** Advisory: a key naming a page nothing holds any more round-trips untouched. */
	it("takes a page path it has no way of checking", () => {
		expect(parsePlaces({ "gone/for/good": { x: 5, y: 5 } })).toEqual({ "gone/for/good": { x: 5, y: 5 } });
	});
});
