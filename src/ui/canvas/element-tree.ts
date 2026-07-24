import { parseStampRef, type RawTreeNode } from "./protocol";

/**
 * The inspector rail's elements tab (#55, re-homed by #58): the frame's raw
 * DOM walk read through its compile-time stamps. Same-stamp siblings collapse
 * into one call-site row (`cart.map(…)`) with [n] instance children; where the
 * stamp file changes — components stamp where they are authored — a boundary
 * row marks the edit cliff, nesting back when children props return over it;
 * unstamped DOM inherits its parent's group.
 *
 * Rows are named things only: component boundaries, call-sites, and elements
 * carrying text or an accessible label. An anonymous wrapper is not a row —
 * its children promote to the nearest named one — so depth reads as authored
 * depth instead of React's nesting. Rows are selection context only: the tab
 * never writes source.
 */

interface RowBase {
	key: string;
	children: TreeRow[];
}

export type TreeRow =
	| (RowBase & { kind: "element"; selector: string; tag: string; label: string; source: string | null })
	| (RowBase & { kind: "callsite"; source: string; tag: string; count: number })
	| (RowBase & { kind: "instance"; index: number; selector: string; tag: string; label: string; source: string })
	| (RowBase & {
			kind: "boundary";
			file: string;
			basename: string;
			/** The component's rendered roots, held from before the prune — a boundary
			 * stands for what it wraps whether or not those elements earned rows. */
			selectors: string[];
	  });

export function buildTreeRows(roots: readonly RawTreeNode[], frameFile: string): TreeRow[] {
	return prune(buildList(roots, frameFile));
}

/** What an element is called: its own words, else the label its author wrote. */
function nameOf(node: RawTreeNode): string {
	return node.text !== "" ? node.text : node.label;
}

function buildList(nodes: readonly RawTreeNode[], contextFile: string): TreeRow[] {
	// siblings sharing a stamp collapse into one call-site row at the first
	// occurrence — adjacency not required: interleaved map output still groups
	const counts = new Map<string, number>();
	for (const node of nodes) {
		if (node.source !== null) counts.set(node.source, (counts.get(node.source) ?? 0) + 1);
	}

	const built: { row: TreeRow; file: string }[] = [];
	const consumed = new Set<string>();
	for (const node of nodes) {
		const source = node.source;
		const file = fileOf(source) ?? contextFile;
		if (source !== null && (counts.get(source) ?? 0) > 1) {
			if (consumed.has(source)) continue;
			consumed.add(source);
			const members = nodes.filter((sibling) => sibling.source === source);
			const row: TreeRow = {
				kind: "callsite",
				key: `c:${source}@${node.selector}`,
				source,
				tag: node.tag,
				count: members.length,
				children: members.map((member, index) => ({
					kind: "instance",
					key: `i:${member.selector}`,
					index,
					selector: member.selector,
					tag: member.tag,
					label: nameOf(member),
					source,
					children: buildList(member.children, file),
				})),
			};
			built.push({ row, file });
			continue;
		}
		const row: TreeRow = {
			kind: "element",
			key: `e:${node.selector}`,
			selector: node.selector,
			tag: node.tag,
			label: nameOf(node),
			source: node.source,
			children: buildList(node.children, file),
		};
		built.push({ row, file });
	}

	// a run of rows from another file goes behind one boundary row — the edit
	// cliff: selection paths inside it point at the shared file
	const out: TreeRow[] = [];
	let index = 0;
	while (index < built.length) {
		const entry = built[index];
		if (entry === undefined) break;
		if (entry.file === contextFile) {
			out.push(entry.row);
			index++;
			continue;
		}
		const run: TreeRow[] = [];
		const file = entry.file;
		while (index < built.length && built[index]?.file === file) {
			const member = built[index];
			if (member !== undefined) run.push(member.row);
			index++;
		}
		out.push({
			kind: "boundary",
			key: `b:${file}@${run[0]?.key ?? String(index)}`,
			file,
			basename: file.split("/").pop() ?? file,
			selectors: run.flatMap((row) => rowSelectors(row)),
			children: run,
		});
	}
	return out;
}

/**
 * The named-rows law (#55): an element with no name of its own is not a row —
 * its (already pruned) children take its place in the list. Boundaries,
 * call-sites and their instances are named by what they are and always stand.
 */
function prune(rows: readonly TreeRow[]): TreeRow[] {
	const out: TreeRow[] = [];
	for (const row of rows) {
		const children = prune(row.children);
		if (row.kind === "element" && row.label === "") {
			out.push(...children);
			continue;
		}
		out.push({ ...row, children });
	}
	return out;
}

/** "frames/cart/frame.tsx:10:5" → the file part; undefined for no stamp. */
function fileOf(source: string | null): string | undefined {
	return parseStampRef(source)?.rel;
}

/** The rows on screen, visual order: children appear under expanded rows only. */
export function visibleRows(rows: readonly TreeRow[], expanded: ReadonlySet<string>): TreeRow[] {
	const out: TreeRow[] = [];
	const walk = (list: readonly TreeRow[]) => {
		for (const row of list) {
			out.push(row);
			if (expanded.has(row.key)) walk(row.children);
		}
	};
	walk(rows);
	return out;
}

/** The row for a selector and every ancestor row that must expand to show it. */
export function revealKeys(
	rows: readonly TreeRow[],
	selector: string,
): { ancestors: string[]; key: string } | undefined {
	const walk = (list: readonly TreeRow[], path: string[]): { ancestors: string[]; key: string } | undefined => {
		for (const row of list) {
			if ((row.kind === "element" || row.kind === "instance") && row.selector === selector) {
				return { ancestors: path, key: row.key };
			}
			const found = walk(row.children, [...path, row.key]);
			if (found !== undefined) return found;
		}
		return undefined;
	};
	return walk(rows, []);
}

/** The elements a row stands for when selected — a boundary stands for the
 * component's rendered roots it wraps, a call-site for its instances. */
export function rowSelectors(row: TreeRow): string[] {
	switch (row.kind) {
		case "element":
		case "instance":
			return [row.selector];
		case "callsite":
			return row.children.flatMap((child) => (child.kind === "instance" ? [child.selector] : []));
		case "boundary":
			return row.selectors;
	}
}
