import { describe, expect, it } from "vitest";
import { ancestorsOf, frameOpening, TREE_PAD, TREE_ROW, treeHeight, treeIndent, treeRows } from "./element-tree";
import type { ElementNode } from "./protocol";

/** A read of a small landing: a hero in one file, and a list of two finishes a map renders. */
function node(selector: string, parent: number, extra: Partial<ElementNode> = {}): ElementNode {
	return {
		selector,
		parent,
		tag: selector.split(" > ").at(-1)?.replace(/:.*/, "") ?? "div",
		component: null,
		words: null,
		file: "frames/landing/frame.tsx",
		row: null,
		...extra,
	};
}

const nodes: ElementNode[] = [
	node("div", -1, { component: "Landing", file: "shared/sections.tsx" }),
	node("div > section", 0, { file: "shared/opening.tsx" }),
	node("div > section > h1", 1, { words: "A canvas for working things out.", file: "shared/opening.tsx" }),
	node("div > ul", 0, { file: "shared/sections.tsx" }),
	node("div > ul > button:nth-of-type(1)", 3, {
		words: "Oxblood",
		file: "shared/sections.tsx",
		row: { map: "shared/sections.tsx:9:5", index: 0 },
	}),
	node("div > ul > button:nth-of-type(2)", 3, {
		words: "Chalk",
		file: "shared/sections.tsx",
		row: { map: "shared/sections.tsx:9:5", index: 1 },
	}),
	node("div > ul > button:nth-of-type(2) > span", 5, { file: "shared/sections.tsx" }),
];

const labels = (open: string[]) =>
	treeRows(nodes, new Set(open)).map((row) =>
		row.kind === "map"
			? `${"  ".repeat(row.depth)}.map ×${row.count}`
			: `${"  ".repeat(row.depth)}${row.number ?? ""}<${row.node.component ?? row.node.tag}>${row.node.words === null ? "" : ` ${row.node.words}`}${row.file === null ? "" : ` · ${row.file}`}`,
	);

describe("treeRows", () => {
	it("draws only what is open, and names a file where the code crosses into it", () => {
		expect(labels([])).toEqual(["<Landing> · sections.tsx"]);
		expect(labels(["div", "div > section"])).toEqual([
			"<Landing> · sections.tsx",
			"  <section> · opening.tsx",
			"    <h1> A canvas for working things out.",
			"  <ul>",
		]);
	});

	it("reads a mapped list as one map row, with its rows numbered from 1", () => {
		expect(labels(["div", "div > ul", "div > ul > button:nth-of-type(2)"])).toEqual([
			"<Landing> · sections.tsx",
			"  <section> · opening.tsx",
			"  <ul>",
			"    .map ×2",
			"      1<button> Oxblood",
			"      2<button> Chalk",
			"        <span>",
		]);
	});

	it("reads elements handed on in an array, and a component's several roots, as plain rows", () => {
		const handed: ElementNode[] = [
			node("div", -1),
			// a component drawing a header and a section, handed to its parent in an array
			node("div > header", 0, { row: { map: "shared/sections.tsx:346:4", index: 0 } }),
			node("div > section", 0, { row: { map: "shared/sections.tsx:346:4", index: 0 } }),
			node("div > main", 0, { row: { map: "shared/sections.tsx:347:4", index: 1 } }),
		];
		expect(treeRows(handed, new Set(["div"])).map((row) => (row.kind === "map" ? ".map" : row.node.tag))).toEqual([
			"div",
			"header",
			"section",
			"main",
		]);
	});

	it("is as tall as its rows, and nothing before it has any", () => {
		expect(treeHeight(treeRows(nodes, new Set()))).toBe(TREE_ROW + 2 * TREE_PAD);
		expect(treeHeight([])).toBe(0);
	});

	it("stops stepping in at 14 levels", () => {
		expect(treeIndent(0)).toBe(6);
		expect(treeIndent(14)).toBe(146);
		expect(treeIndent(23)).toBe(146);
	});
});

describe("opening the tree", () => {
	it("opens down to an element, and a held frame to its first element's children", () => {
		expect(ancestorsOf(nodes, "div > ul > button:nth-of-type(2) > span")).toEqual([
			"div",
			"div > ul",
			"div > ul > button:nth-of-type(2)",
		]);
		expect(ancestorsOf(nodes, "gone")).toEqual([]);
		expect(frameOpening(nodes)).toEqual(["div", "div > section", "div > ul"]);
	});
});
