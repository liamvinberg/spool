import { describe, expect, it } from "vitest";
import { buildTreeRows, revealKeys, rowSelectors, type TreeRow, visibleRows } from "./element-tree";
import type { RawTreeNode } from "./protocol";

/**
 * The sidebar tree's view of a frame (#37): the raw DOM walk read through its
 * stamps — same-stamp siblings collapse into one call-site row with [n]
 * instances, a stamp-file change inserts a boundary row marking the edit
 * cliff, and unstamped DOM inherits its parent's group.
 */

const FRAME_FILE = "frames/cart/frame.tsx";

function node(partial: Partial<RawTreeNode> & { tag: string; selector: string }): RawTreeNode {
	return { source: null, text: "", children: [], ...partial };
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
	it("collapses same-stamp siblings into one call-site row with [n] instances", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);
		const main = rows[0] as TreeRow & { children: TreeRow[] };
		const ul = main.children[1] as TreeRow & { children: TreeRow[] };

		expect(ul.children).toHaveLength(1);
		const callsite = ul.children[0];
		expect(callsite).toMatchObject({
			kind: "callsite",
			source: "frames/cart/frame.tsx:10:5",
			tag: "li",
			count: 2,
		});
		expect((callsite as { children: TreeRow[] }).children.map((row) => row)).toMatchObject([
			{ kind: "instance", index: 0, selector: "main > ul > li:nth-of-type(1)", label: "1 × Cortado" },
			{ kind: "instance", index: 1, selector: "main > ul > li:nth-of-type(2)", label: "1 × Flat white" },
		]);
	});

	it("inserts a boundary row where the stamp file changes, nesting back on return", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);
		const main = rows[0] as TreeRow & { children: TreeRow[] };

		const boundary = main.children[2];
		expect(boundary).toMatchObject({ kind: "boundary", file: "shared/ui/button.tsx", basename: "button.tsx" });
		const button = (boundary as { children: TreeRow[] }).children[0];
		expect(button).toMatchObject({ kind: "element", tag: "button", selector: "main > button" });
		// the children prop renders frame-authored DOM inside the component: a
		// boundary back to the frame's own file marks the return over the cliff
		const back = (button as { children: TreeRow[] }).children[0];
		expect(back).toMatchObject({ kind: "boundary", file: FRAME_FILE, basename: "frame.tsx" });
		expect((back as { children: TreeRow[] }).children[0]).toMatchObject({
			kind: "element",
			tag: "span",
			label: "Betala",
		});
	});

	it("keeps unstamped DOM in its parent's group — no boundary, no stamp", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);
		const main = rows[0] as TreeRow & { children: TreeRow[] };

		expect(main.children[3]).toMatchObject({ kind: "element", tag: "aside", label: "toast", source: null });
	});

	it("labels an element by its own text and leaves a textless one to its tag", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);
		const main = rows[0] as TreeRow & { children: TreeRow[] };

		expect(main).toMatchObject({ kind: "element", tag: "main", label: "" });
		expect(main.children[0]).toMatchObject({ kind: "element", tag: "h1", label: "Din varukorg" });
	});
});

describe("visibleRows", () => {
	it("flattens only through expanded rows, top level always visible", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);
		const main = rows[0] as TreeRow;

		expect(visibleRows(rows, new Set()).map((row) => row.key)).toEqual([main.key]);

		const ul = (main as { children: TreeRow[] }).children[1] as TreeRow;
		const expanded = new Set([main.key, ul.key]);
		const keys = visibleRows(rows, expanded).map((row) => row.kind);
		// main, h1, ul, callsite (instances stay folded), boundary, aside
		expect(keys).toEqual(["element", "element", "element", "callsite", "boundary", "element"]);
	});
});

describe("revealKeys", () => {
	it("answers every ancestor row to expand, boundary and call-site rows included", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);
		const main = rows[0] as TreeRow & { children: TreeRow[] };
		const ul = main.children[1] as TreeRow & { children: TreeRow[] };
		const callsite = ul.children[0] as TreeRow;

		const reveal = revealKeys(rows, "main > ul > li:nth-of-type(2)");
		expect(reveal?.ancestors).toEqual([main.key, ul.key, callsite.key]);

		const boundary = main.children[2] as TreeRow & { children: TreeRow[] };
		const button = boundary.children[0] as TreeRow;
		const inButton = revealKeys(rows, "main > button > span");
		expect(inButton?.ancestors).toEqual([
			main.key,
			boundary.key,
			button.key,
			(button as { children: TreeRow[] }).children[0]?.key,
		]);

		expect(revealKeys(rows, "main > ghost")).toBeUndefined();
	});
});

describe("rowSelectors", () => {
	it("answers the selectors a row stands for", () => {
		const rows = buildTreeRows(cartTree, FRAME_FILE);
		const main = rows[0] as TreeRow & { children: TreeRow[] };
		const ul = main.children[1] as TreeRow & { children: TreeRow[] };
		const callsite = ul.children[0] as TreeRow;
		const boundary = main.children[2] as TreeRow;

		expect(rowSelectors(main)).toEqual(["main"]);
		expect(rowSelectors(callsite)).toEqual(["main > ul > li:nth-of-type(1)", "main > ul > li:nth-of-type(2)"]);
		expect(rowSelectors(boundary)).toEqual([]);
	});
});
