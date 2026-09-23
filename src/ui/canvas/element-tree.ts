import type { ElementNode } from "./protocol";

/**
 * The element tree's rows (#342), worked out from one read of the frame.
 *
 * The frame answers with every element a selection can stand on, in document
 * order, each pointing at the one it sits in. What the rail draws is the part
 * of that which is open, read the way the code is written: a list a `.map()`
 * renders is one `.map ×N` row with its rows numbered under it, and a row
 * whose code is in another file than the row above it says which file.
 *
 * Rows are one fixed height, so the tree's height is arithmetic, the same way
 * the rail's own rows are placed without anything measuring the DOM.
 */

export const TREE_ROW = 24;
/** the space above the first row and below the last */
export const TREE_PAD = 4;
/** one level in; the step stops at DEEPEST so a row 23 levels down keeps its name */
export const TREE_STEP = 10;
export const DEEPEST = 14;
/** the tallest the tree stands in the rail; a longer one scrolls inside that */
export const TREE_MOST = 600;

export function treeIndent(depth: number): number {
	return 6 + Math.min(depth, DEEPEST) * TREE_STEP;
}

export type TreeRow =
	| {
			readonly kind: "element";
			readonly node: ElementNode;
			readonly depth: number;
			readonly open: boolean;
			readonly hasChildren: boolean;
			/** the file's name, when the code crosses into another file here */
			readonly file: string | null;
			/** a mapped row's place in its list, counted from 1 */
			readonly number: number | null;
	  }
	| { readonly kind: "map"; readonly key: string; readonly depth: number; readonly count: number };

/** Each element's children, by index; the top-level elements under -1. */
export function childrenByParent(nodes: readonly ElementNode[]): ReadonlyMap<number, readonly number[]> {
	const out = new Map<number, number[]>();
	nodes.forEach((node, index) => {
		const list = out.get(node.parent) ?? [];
		list.push(index);
		out.set(node.parent, list);
	});
	return out;
}

/** `shared/ui/site/opening.tsx` → `opening.tsx` */
export const fileName = (file: string): string => file.split("/").at(-1) ?? file;

/**
 * The rows the rail draws: every top-level element, and under each open one
 * what it holds. `open` holds selectors, which is what survives a re-read of
 * the same document.
 */
export function treeRows(nodes: readonly ElementNode[], open: ReadonlySet<string>): TreeRow[] {
	const children = childrenByParent(nodes);
	const rows: TreeRow[] = [];
	const element = (index: number, depth: number, parentFile: string | null, number: number | null) => {
		const node = nodes[index];
		if (node === undefined) return;
		const isOpen = open.has(node.selector);
		const kids = children.get(index) ?? [];
		rows.push({
			kind: "element",
			node,
			depth,
			open: isOpen,
			hasChildren: kids.length > 0,
			file: node.file !== null && node.file !== parentFile ? fileName(node.file) : null,
			number,
		});
		if (isOpen) level(kids, depth + 1, node.file);
	};
	const level = (kids: readonly number[], depth: number, parentFile: string | null) => {
		for (let at = 0; at < kids.length; at++) {
			const index = kids[at] as number;
			const map = nodes[index]?.row?.map;
			if (map === undefined) {
				element(index, depth, parentFile, null);
				continue;
			}
			// the rows one map renders stand side by side, all written by the one
			// JSX the callback returns, each at its own place in the array
			let end = at;
			while (end + 1 < kids.length && nodes[kids[end + 1] as number]?.row?.map === map) end++;
			const members = kids.slice(at, end + 1);
			const places = [...new Set(members.map((member) => nodes[member]?.row?.index))];
			// one place is no list: an element handed on in an array (children
			// passed through), or a component that draws several roots. A map of
			// one row looks the same from the page, so it reads as its row
			if (places.length < 2) {
				for (const member of members) element(member, depth, parentFile, null);
				at = end;
				continue;
			}
			rows.push({ kind: "map", key: `map:${nodes[index]?.selector}`, depth, count: places.length });
			for (const member of members) {
				element(member, depth + 1, parentFile, places.indexOf(nodes[member]?.row?.index) + 1);
			}
			at = end;
		}
	};
	level(children.get(-1) ?? [], 0, null);
	return rows;
}

export function treeHeight(rows: readonly TreeRow[]): number {
	return rows.length === 0 ? 0 : rows.length * TREE_ROW + 2 * TREE_PAD;
}

/** The selectors of every element above one, top-level first; empty when the frame holds no such element. */
export function ancestorsOf(nodes: readonly ElementNode[], selector: string): string[] {
	const index = nodes.findIndex((node) => node.selector === selector);
	if (index === -1) return [];
	const out: string[] = [];
	for (let at = nodes[index]?.parent ?? -1; at !== -1; at = nodes[at]?.parent ?? -1) {
		const node = nodes[at];
		if (node === undefined) break;
		out.unshift(node.selector);
	}
	return out;
}

/**
 * What a held frame opens to: its first top-level element and each of that
 * one's children, so the first look at a tree is the page's sections rather
 * than one closed row.
 */
export function frameOpening(nodes: readonly ElementNode[]): string[] {
	const children = childrenByParent(nodes);
	const top = children.get(-1)?.[0];
	if (top === undefined) return [];
	const first = nodes[top];
	if (first === undefined) return [];
	return [first.selector, ...(children.get(top) ?? []).flatMap((index) => nodes[index]?.selector ?? [])];
}
