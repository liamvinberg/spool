import { describe, expect, it } from "vitest";
import { ROOT_PAGE } from "./pages";
import {
	FRAME_ROW,
	frameLanding,
	type Landing,
	landingGuideX,
	listHeight,
	PAGE_ROW,
	pageLanding,
	type RailFrame,
	railRows,
	rowKey,
	sameLanding,
} from "./rail-rows";

const html = (name: string): RailFrame => ({ name, kind: "html" });

/** root: home, shell · shop (shut): cart · admin: users */
const pages = [ROOT_PAGE, "shop", "admin"];
const framesByPage = new Map<string, readonly RailFrame[]>([
	[ROOT_PAGE, [html("home"), html("shell")]],
	["shop", [html("cart")]],
	["admin", [html("users")]],
]);
const rows = railRows(pages, framesByPage, new Set([ROOT_PAGE, "admin"]));

/** the middle of a row, in content space */
const midOf = (index: number): number => {
	const row = rows[index];
	if (row === undefined) throw new Error(`no row ${index}`);
	return row.top + row.height / 2;
};

describe("the visible list", () => {
	it("draws a page and then the frames of an open one, at the shipped metrics", () => {
		expect(rows.map(rowKey)).toEqual([
			"page:",
			"frame:home",
			"frame:shell",
			"page:shop",
			"page:admin",
			"frame:users",
		]);
		expect(rows[0]?.height).toBe(PAGE_ROW);
		expect(rows[1]?.height).toBe(FRAME_ROW);
		expect(rows[1]?.top).toBe(PAGE_ROW);
		expect(listHeight(rows)).toBe(PAGE_ROW * 3 + FRAME_ROW * 3);
	});

	it("keeps a shut page's frames out of the list without forgetting the count", () => {
		const shut = rows.find((row) => row.kind === "page" && row.page === "shop");
		expect(shut?.kind === "page" && shut.count).toBe(1);
		expect(rows.some((row) => row.kind === "frame" && row.name === "cart")).toBe(false);
	});

	it("marks the last frame of a page, which is where the spine stops", () => {
		const last = rows.find((row) => row.kind === "frame" && row.name === "shell");
		expect(last?.kind === "frame" && last.last).toBe(true);
	});

	it("waits a page still being named at the end of the list, at a page's own height", () => {
		const naming = railRows(pages, framesByPage, new Set([ROOT_PAGE, "admin"]), true);
		const last = naming.at(-1);
		expect(last?.kind).toBe("born");
		if (last !== undefined) expect(rowKey(last)).toBe("born");
		expect(last?.height).toBe(PAGE_ROW);
		expect(last?.top).toBe(listHeight(rows));
	});
});

describe("where dragged frames land", () => {
	it("reads the middle of a page row as that page taking them", () => {
		expect(frameLanding(rows, midOf(3))).toEqual({ kind: "into", page: "shop" });
	});

	it("reads a gap between two frames as their own page's list", () => {
		const between = (rows[2]?.top ?? 0) - 2;
		expect(frameLanding(rows, between)).toEqual({ kind: "frames", page: ROOT_PAGE, index: 1, y: rows[2]?.top });
	});

	it("reads the gap under an open page row as the top of its list", () => {
		const under = (rows[4]?.top ?? 0) + PAGE_ROW * 0.85;
		expect(frameLanding(rows, under)).toEqual({ kind: "frames", page: "admin", index: 0, y: rows[5]?.top });
	});

	it("reads the gap under a shut page as that page taking them, since it has no list to draw in", () => {
		const under = (rows[3]?.top ?? 0) + PAGE_ROW * 0.85;
		expect(frameLanding(rows, under)).toEqual({ kind: "into", page: "shop" });
	});

	it("lands nothing above the root page's own row", () => {
		expect(frameLanding(rows, -10)).toBeNull();
	});

	it("lands nothing in or under a page that has no folder yet", () => {
		const naming = railRows(pages, framesByPage, new Set([ROOT_PAGE, "admin"]), true);
		const born = naming.at(-1);
		const inside = (born?.top ?? 0) + PAGE_ROW / 2;
		expect(frameLanding(naming, inside)).toBeNull();
		expect(frameLanding(naming, listHeight(naming) + 20)).toBeNull();
		expect(pageLanding(naming, listHeight(naming) + 20)).toBeNull();
	});

	it("lands at the end of the last page below everything", () => {
		expect(frameLanding(rows, listHeight(rows) + 40)).toEqual({
			kind: "frames",
			page: "admin",
			index: 1,
			y: listHeight(rows),
		});
	});
});

describe("where a dragged page lands", () => {
	it("snaps to whole blocks rather than to the gap under the pointer", () => {
		// dropped among the root page's own frames, which is not a slot a page has:
		// the line goes under that whole block instead
		expect(pageLanding(rows, midOf(1))).toEqual({ kind: "pages", index: 0, y: rows[3]?.top });
		expect(pageLanding(rows, midOf(5))).toEqual({ kind: "pages", index: 2, y: listHeight(rows) });
	});

	it("counts in named pages, so the slot under the root page's block is the first one", () => {
		expect(pageLanding(rows, (rows[3]?.top ?? 0) + 4)).toEqual({ kind: "pages", index: 0, y: rows[3]?.top });
		expect(pageLanding(rows, midOf(3))).toEqual({ kind: "pages", index: 1, y: rows[4]?.top });
	});

	it("refuses to sort anything above the permanent root page", () => {
		expect(pageLanding(rows, -10)).toBeNull();
	});
});

describe("what the drag layer draws", () => {
	it("puts a frame's insertion line on the spine and a page's at the margin", () => {
		const frames: Landing = { kind: "frames", page: ROOT_PAGE, index: 0, y: 0 };
		const pagesLanding: Landing = { kind: "pages", index: 0, y: 0 };
		expect(landingGuideX(frames)).toBeGreaterThan(landingGuideX(pagesLanding));
	});

	it("compares landings by what they mean, not by where the line happens to be", () => {
		expect(sameLanding({ kind: "into", page: "shop" }, { kind: "into", page: "shop" })).toBe(true);
		expect(sameLanding({ kind: "into", page: "shop" }, { kind: "into", page: "admin" })).toBe(false);
		expect(sameLanding(null, null)).toBe(true);
		expect(sameLanding({ kind: "pages", index: 1, y: 0 }, null)).toBe(false);
	});
});
