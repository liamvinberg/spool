import { describe, expect, it } from "vitest";
import { buildTreeRows, revealKeys, rowSelectors, type TreeRow, visibleRows } from "./element-tree";
import type { RawTreeNode } from "./protocol";

/**
 * The rail's elements tab (#55 as amended by #58): the frame's raw DOM walk
 * read through its stamps, kept to named things only. Same-stamp siblings
 * collapse into one call-site row with [n] instances, a stamp-file change
 * inserts a boundary row marking the edit cliff, and anonymous wrappers stop
 * being rows — their children promote to the nearest named row, so depth reads
 * as authored depth rather than React's nesting.
 */

const FRAME_FILE = "frames/cart/frame.tsx";

function node(partial: Partial<RawTreeNode> & { tag: string; selector: string }): RawTreeNode {
	return { source: null, text: "", label: "", children: [], ...partial };
}

const cartTree: RawTreeNode[] = [
	node({
		tag: "main",
		selector: "main",
		source: "frames/cart/frame.tsx:3:3",
		children: [
			node({ tag: "h1", selector: "main > h1", source: "frames/cart/frame.tsx:5:4", text: "Din varukorg" }),
			node({
				tag: "ul",
				selector: "main > ul",
				source: "frames/cart/frame.tsx:8:4",
				children: [
					node({
						tag: "li",
						selector: "main > ul > li:nth-of-type(1)",
						source: "frames/cart/frame.tsx:10:5",
						text: "1 × Cortado",
					}),
					node({
						tag: "li",
						selector: "main > ul > li:nth-of-type(2)",
						source: "frames/cart/frame.tsx:10:5",
						text: "1 × Flat white",
					}),
				],
			}),
			node({
				tag: "button",
				selector: "main > button",
				source: "shared/ui/button.tsx:5:2",
				children: [
					node({
						tag: "span",
						selector: "main > button > span",
						source: "frames/cart/frame.tsx:12:6",
						text: "Betala",
					}),
				],
			}),
			node({ tag: "aside", selector: "main > aside", source: null, text: "toast" }),
		],
	}),
];

describe("buildTreeRows", () => {
	it("drops anonymous wrappers and promotes their children to the nearest named row", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);

		// <main> and <ul> carry no words: they were never named, so they are not rows
		expect(rows.map((row) => row.kind)).toEqual(["element", "callsite", "boundary", "element"]);
		expect(rows[0]).toMatchObject({ kind: "element", tag: "h1", label: "Din varukorg" });
		expect(rows[3]).toMatchObject({ kind: "element", tag: "aside", label: "toast" });
	});

	it("names an element with no words of its own by its accessible label", () => {
		const rows = buildTreeRows(
			[
				node({
					tag: "button",
					selector: "button",
					source: "frames/cart/frame.tsx:4:3",
					label: "Close",
					children: [node({ tag: "svg", selector: "button > svg" })],
				}),
			],
			FRAME_FILE,
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ kind: "element", tag: "button", label: "Close" });
		// the icon inside it is anonymous — it stops being a row
		expect(rows[0]?.children).toEqual([]);
	});

	it("collapses same-stamp siblings into one call-site row with [n] instances", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);
		const callsite = rows[1];

		expect(callsite).toMatchObject({
			kind: "callsite",
			source: "frames/cart/frame.tsx:10:5",
			tag: "li",
			count: 2,
		});
		expect((callsite as { children: TreeRow[] }).children).toMatchObject([
			{ kind: "instance", index: 0, selector: "main > ul > li:nth-of-type(1)", label: "1 × Cortado" },
			{ kind: "instance", index: 1, selector: "main > ul > li:nth-of-type(2)", label: "1 × Flat white" },
		]);
	});

	it("inserts a boundary row where the stamp file changes, nesting back on return", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);

		const boundary = rows[2];
		expect(boundary).toMatchObject({ kind: "boundary", file: "shared/ui/button.tsx", basename: "button.tsx" });
		// <button> itself is anonymous, so the return boundary promotes into it
		const back = (boundary as { children: TreeRow[] }).children[0];
		expect(back).toMatchObject({ kind: "boundary", file: FRAME_FILE, basename: "frame.tsx" });
		expect((back as { children: TreeRow[] }).children[0]).toMatchObject({
			kind: "element",
			tag: "span",
			label: "Betala",
		});
	});

	it("keeps unstamped DOM in its parent's group — no boundary, no stamp", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);

		expect(rows[3]).toMatchObject({ kind: "element", tag: "aside", label: "toast", source: null });
	});
});

describe("visibleRows", () => {
	it("flattens only through expanded rows, top level always visible", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);

		expect(visibleRows(rows, new Set()).map((row) => row.kind)).toEqual([
			"element",
			"callsite",
			"boundary",
			"element",
		]);

		const callsite = rows[1] as TreeRow;
		expect(visibleRows(rows, new Set([callsite.key])).map((row) => row.kind)).toEqual([
			"element",
			"callsite",
			"instance",
			"instance",
			"boundary",
			"element",
		]);
	});
});

describe("revealKeys", () => {
	it("answers every ancestor row to expand, boundary and call-site rows included", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);
		const callsite = rows[1] as TreeRow;
		const boundary = rows[2] as TreeRow & { children: TreeRow[] };
		const back = boundary.children[0] as TreeRow;

		expect(revealKeys(rows, "main > ul > li:nth-of-type(2)")?.ancestors).toEqual([callsite.key]);
		expect(revealKeys(rows, "main > button > span")?.ancestors).toEqual([boundary.key, back.key]);
		// a wrapper that never earned a row has nothing to reveal
		expect(revealKeys(rows, "main")).toBeUndefined();
		expect(revealKeys(rows, "main > ghost")).toBeUndefined();
	});
});

describe("rowSelectors", () => {
	it("answers the selectors a row stands for", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);
		const callsite = rows[1] as TreeRow;
		const boundary = rows[2] as TreeRow;

		expect(rowSelectors(rows[0] as TreeRow)).toEqual(["main > h1"]);
		expect(rowSelectors(callsite)).toEqual(["main > ul > li:nth-of-type(1)", "main > ul > li:nth-of-type(2)"]);
		// a boundary stands for the component's rendered roots, named or not
		expect(rowSelectors(boundary)).toEqual(["main > button"]);
	});
});
