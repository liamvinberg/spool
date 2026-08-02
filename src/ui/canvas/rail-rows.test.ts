import { describe, expect, it } from "vitest";
import { ROOT_PAGE } from "../../page-path";
import {
	contentX,
	FRAME_ROW,
	frameLanding,
	guideX,
	INDENT,
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
const pages = new Map<string, readonly string[]>([[ROOT_PAGE, ["shop", "admin"]]]);
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

	it("waits a page still being named at the end of the pages it will belong to", () => {
		const naming = railRows(pages, framesByPage, new Set([ROOT_PAGE, "admin"]), ROOT_PAGE);
		const last = naming.at(-1);
		expect(last?.kind).toBe("born");
		if (last !== undefined) expect(rowKey(last)).toBe("born");
		expect(last?.height).toBe(PAGE_ROW);
		expect(last?.top).toBe(listHeight(rows));
	});

	/**
	 * The root page's own pages are the top level rather than its contents, so its
	 * chevron takes its frames off the list and never them.
	 */
	it("keeps every page drawn when the root page is shut", () => {
		const shut = railRows(pages, framesByPage, new Set(["admin"]));
		expect(shut.map(rowKey)).toEqual(["page:", "page:shop", "page:admin", "frame:users"]);
	});
});

describe("depth", () => {
	/** root · explorations > chat > agent-chat · application */
	const deepPages = new Map<string, readonly string[]>([
		[ROOT_PAGE, ["explorations", "application"]],
		["explorations", ["explorations/chat"]],
	]);
	const deepFrames = new Map<string, readonly RailFrame[]>([
		[ROOT_PAGE, [html("home")]],
		["explorations", [html("notes")]],
		["explorations/chat", [html("agent-chat")]],
	]);
	const open = new Set([ROOT_PAGE, "explorations", "explorations/chat", "application"]);
	const deep = railRows(deepPages, deepFrames, open);

	it("draws a page's frames and then the pages inside it, one step deeper each level", () => {
		expect(deep.map(rowKey)).toEqual([
			"page:",
			"frame:home",
			"page:explorations",
			"frame:notes",
			"page:explorations/chat",
			"frame:agent-chat",
			"page:application",
		]);
		expect(deep.map((row) => row.depth)).toEqual([0, 1, 0, 1, 1, 2, 0]);
	});

	it("steps one INDENT per level, landing the shipped rail's own metrics at depth one", () => {
		expect(guideX(1)).toBe(18);
		expect(contentX(1)).toBe(34);
		expect(guideX(2) - guideX(1)).toBe(INDENT);
	});

	it("counts a page's own pages after its frames, so a frame is only last with none under it", () => {
		const notes = deep.find((row) => row.kind === "frame" && row.name === "notes");
		expect(notes?.kind === "frame" && notes.tail).toBe(false);
		const chat = deep.find((row) => row.kind === "frame" && row.name === "agent-chat");
		expect(chat?.kind === "frame" && chat.tail).toBe(true);
	});

	/**
	 * The gap under the last frame of a nested page is ambiguous on purpose: it is
	 * equally next to that frame, next to its page, and next to the page holding
	 * that one. The pointer's sideways travel is what picks.
	 */
	it("reads one gap at every depth it could mean, and the pointer's x picks", () => {
		const under = listHeight(deep) - PAGE_ROW;
		expect(frameLanding(deep, under, 2)).toMatchObject({ kind: "frames", page: "explorations/chat", index: 1 });
		expect(frameLanding(deep, under, 1)).toMatchObject({ kind: "frames", page: "explorations", index: 1 });
		expect(frameLanding(deep, under, 0)).toMatchObject({ kind: "frames", page: ROOT_PAGE, index: 1 });
	});

	it("draws each of those lines at its own depth", () => {
		const under = listHeight(deep) - PAGE_ROW;
		const deepest = frameLanding(deep, under, 2);
		const shallowest = frameLanding(deep, under, 0);
		expect(deepest === null ? -1 : landingGuideX(deepest)).toBe(guideX(2));
		expect(shallowest === null ? -1 : landingGuideX(shallowest)).toBe(guideX(1));
	});

	it("never lets a line sit shallower than the row under the gap", () => {
		// between the two root-page rows there is only one depth to mean, however
		// far sideways the pointer has travelled
		const between = (deep[1]?.top ?? 0) + FRAME_ROW / 2 + 1;
		expect(frameLanding(deep, between, 0)).toMatchObject({ kind: "frames", page: ROOT_PAGE, index: 1 });
		expect(frameLanding(deep, between, 5)).toMatchObject({ kind: "frames", page: ROOT_PAGE, index: 1 });
	});

	it("takes a page into a page from the middle band, which is how one nests", () => {
		const chat = deep.findIndex((row) => row.kind === "page" && row.page === "explorations/chat");
		const row = deep[chat];
		const middle = (row?.top ?? 0) + PAGE_ROW / 2;
		expect(pageLanding(deep, middle)).toEqual({ kind: "into", page: "explorations/chat" });
	});

	it("lands a dragged page in the list of the page it was dropped in", () => {
		const under = listHeight(deep) - PAGE_ROW;
		expect(pageLanding(deep, under, 2)).toMatchObject({ kind: "pages", page: "explorations/chat", index: 0 });
		expect(pageLanding(deep, under, 0)).toMatchObject({ kind: "pages", page: ROOT_PAGE, index: 1 });
	});
});

describe("where dragged frames land", () => {
	it("reads the middle of a page row as that page taking them", () => {
		expect(frameLanding(rows, midOf(3))).toEqual({ kind: "into", page: "shop" });
	});

	it("reads a gap between two frames as their own page's list", () => {
		const between = (rows[2]?.top ?? 0) - 2;
		expect(frameLanding(rows, between)).toEqual({
			kind: "frames",
			page: ROOT_PAGE,
			index: 1,
			depth: 1,
			y: rows[2]?.top,
		});
	});

	it("reads the gap under an open page row as the top of its list", () => {
		const under = (rows[4]?.top ?? 0) + PAGE_ROW * 0.85;
		expect(frameLanding(rows, under)).toEqual({
			kind: "frames",
			page: "admin",
			index: 0,
			depth: 1,
			y: rows[5]?.top,
		});
	});

	it("reads the gap under a shut page as that page taking them, since it has no list to draw in", () => {
		const under = (rows[3]?.top ?? 0) + PAGE_ROW * 0.85;
		expect(frameLanding(rows, under)).toEqual({ kind: "into", page: "shop" });
	});

	it("lands nothing above the root page's own row", () => {
		expect(frameLanding(rows, -10)).toBeNull();
	});

	it("lands nothing in or under a page that has no folder yet", () => {
		const naming = railRows(pages, framesByPage, new Set([ROOT_PAGE, "admin"]), ROOT_PAGE);
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
			depth: 1,
			y: listHeight(rows),
		});
	});
});

describe("where a dragged page lands", () => {
	it("draws its line where the row will be rather than in the gap under the pointer", () => {
		// dropped among the root page's own frames, which is not a slot a page has:
		// the line goes under that whole block instead
		expect(pageLanding(rows, midOf(1))).toEqual({
			kind: "pages",
			page: ROOT_PAGE,
			index: 0,
			depth: 0,
			y: rows[3]?.top,
		});
	});

	it("counts in the pages of the page it lands in, so the slot under the root block is the first", () => {
		expect(pageLanding(rows, (rows[3]?.top ?? 0) + 4)).toEqual({
			kind: "pages",
			page: ROOT_PAGE,
			index: 0,
			depth: 0,
			y: rows[3]?.top,
		});
		expect(pageLanding(rows, (rows[4]?.top ?? 0) + 4)).toEqual({
			kind: "pages",
			page: ROOT_PAGE,
			index: 1,
			depth: 0,
			y: rows[4]?.top,
		});
	});

	it("refuses to sort anything above the permanent root page", () => {
		expect(pageLanding(rows, -10)).toBeNull();
	});
});

describe("what the drag layer draws", () => {
	it("puts a frame's insertion line on the spine and a top-level page's at the margin", () => {
		const frames: Landing = { kind: "frames", page: ROOT_PAGE, index: 0, depth: 1, y: 0 };
		const pagesLanding: Landing = { kind: "pages", page: ROOT_PAGE, index: 0, depth: 0, y: 0 };
		expect(landingGuideX(frames)).toBeGreaterThan(landingGuideX(pagesLanding));
	});

	it("compares landings by what they mean, not by where the line happens to be", () => {
		expect(sameLanding({ kind: "into", page: "shop" }, { kind: "into", page: "shop" })).toBe(true);
		expect(sameLanding({ kind: "into", page: "shop" }, { kind: "into", page: "admin" })).toBe(false);
		expect(sameLanding(null, null)).toBe(true);
		expect(sameLanding({ kind: "pages", page: ROOT_PAGE, index: 1, depth: 0, y: 0 }, null)).toBe(false);
	});
});
