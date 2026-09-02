/**
 * The explorer's tree and every pure move a file explorer makes over it.
 *
 * Pages hold pages and frames, to any depth — the proposal the rail is arguing
 * for. Frame names stay unique across the whole project, the way spool already
 * requires, so every copy, paste and duplicate renames as it lands. Nothing in
 * here touches React: the rail keeps one tree in state and each gesture is one
 * function from this file.
 */

/** the synthetic container above the page list; never drawn */
export const TOP_ID = "#top";
/** the permanent first page: the frames directory itself */
export const ROOT_ID = "p-root";

export const PAGE_ROW = 32;
export const FRAME_ROW = 28;
/** one depth step — 10px reproduces the shipped rail's page-to-frame offset exactly */
export const INDENT = 10;

export interface FrameNode {
	readonly kind: "frame";
	readonly id: string;
	readonly name: string;
	readonly entry: "frame.tsx" | "term.tsx";
}

export interface PageNode {
	readonly kind: "page";
	readonly id: string;
	readonly name: string;
	readonly children: readonly ExplorerNode[];
}

export type ExplorerNode = FrameNode | PageNode;

export function isPage(node: ExplorerNode): node is PageNode {
	return node.kind === "page";
}

let counter = 0;
export function freshId(prefix: string): string {
	counter += 1;
	return `${prefix}-n${counter}`;
}

/* ── reading ─────────────────────────────────────────────────────────── */

function chainFrom(node: ExplorerNode, id: string): ExplorerNode[] | null {
	if (node.id === id) return [node];
	if (!isPage(node)) return null;
	for (const child of node.children) {
		const found = chainFrom(child, id);
		if (found !== null) return [node, ...found];
	}
	return null;
}

/** every node from the top page down to `id`, the top container dropped */
export function chainTo(tree: PageNode, id: string): readonly ExplorerNode[] {
	const found = chainFrom(tree, id);
	return found === null ? [] : found.slice(1);
}

export function nodeAt(tree: PageNode, id: string): ExplorerNode | null {
	if (id === tree.id) return tree;
	return chainTo(tree, id).at(-1) ?? null;
}

export function pageAt(tree: PageNode, id: string): PageNode | null {
	const node = nodeAt(tree, id);
	return node !== null && isPage(node) ? node : null;
}

export function parentOf(tree: PageNode, id: string): PageNode {
	const parent = chainTo(tree, id).at(-2);
	return parent !== undefined && isPage(parent) ? parent : tree;
}

/** `explorations/chat` — what the page reads as in a path */
export function pagePath(tree: PageNode, id: string): string {
	return chainTo(tree, id)
		.filter(isPage)
		.filter((page) => page.id !== ROOT_ID)
		.map((page) => page.name)
		.join("/");
}

export function isWithin(tree: PageNode, ancestorId: string, id: string): boolean {
	return chainTo(tree, id).some((node) => node.id === ancestorId && node.id !== id);
}

export function everyNode(page: PageNode): readonly ExplorerNode[] {
	return page.children.flatMap((node) => (isPage(node) ? [node, ...everyNode(node)] : [node]));
}

export function frameCount(node: ExplorerNode): number {
	if (!isPage(node)) return 1;
	return node.children.reduce((total, child) => total + frameCount(child), 0);
}

export function pageCount(tree: PageNode): number {
	return everyNode(tree).filter(isPage).length;
}

/** A page as the field beside the rail sees one of its own pages. */
export interface StagePage {
	readonly id: string;
	readonly name: string;
	/** its own frames in order — the covers anything drawing it as a stack reads */
	readonly frames: readonly FrameNode[];
	/** its own pages */
	readonly pages: number;
	/** every frame under it, its own pages' included */
	readonly count: number;
}

export function stagePages(page: PageNode): readonly StagePage[] {
	return page.children.filter(isPage).map((sub) => ({
		id: sub.id,
		name: sub.name,
		frames: sub.children.filter((node): node is FrameNode => !isPage(node)),
		pages: sub.children.filter(isPage).length,
		count: frameCount(sub),
	}));
}

export function frameNames(tree: PageNode): Set<string> {
	return new Set(everyNode(tree).flatMap((node) => (isPage(node) ? [] : [node.name])));
}

/* ── the visible list ────────────────────────────────────────────────── */

export interface Row {
	readonly node: ExplorerNode;
	readonly depth: number;
	readonly parentId: string;
	readonly index: number;
	readonly siblings: number;
	readonly top: number;
	readonly height: number;
}

export function flatten(tree: PageNode, expanded: ReadonlySet<string>): readonly Row[] {
	const rows: Row[] = [];
	let top = 0;
	const walk = (parent: PageNode, depth: number) => {
		parent.children.forEach((node, index) => {
			const height = isPage(node) ? PAGE_ROW : FRAME_ROW;
			rows.push({
				node,
				depth,
				parentId: parent.id,
				index,
				siblings: parent.children.length,
				top,
				height,
			});
			top += height;
			if (isPage(node) && expanded.has(node.id)) walk(node, depth + 1);
		});
	};
	walk(tree, 0);
	return rows;
}

export function listHeight(rows: readonly Row[]): number {
	const last = rows.at(-1);
	return last === undefined ? 0 : last.top + last.height;
}

/** the x where a depth's guide line and insertion line start */
export function guideX(depth: number): number {
	return (depth - 1) * INDENT + 18;
}

/** the x where a row's icon sits — pages and frames at one depth share it */
export function contentX(depth: number): number {
	return depth * INDENT + 24;
}

/* ── writing ─────────────────────────────────────────────────────────── */

function mapPage(tree: PageNode, id: string, fn: (page: PageNode) => PageNode): PageNode {
	const next = tree.id === id ? fn(tree) : tree;
	return {
		...next,
		children: next.children.map((child) => (isPage(child) ? mapPage(child, id, fn) : child)),
	};
}

export function renameNode(tree: PageNode, id: string, name: string): PageNode {
	const step = (node: ExplorerNode): ExplorerNode => {
		const renamed = node.id === id ? { ...node, name } : node;
		return isPage(renamed) ? { ...renamed, children: renamed.children.map(step) } : renamed;
	};
	return { ...tree, children: tree.children.map(step) };
}

export function removeIds(
	tree: PageNode,
	ids: ReadonlySet<string>,
): { tree: PageNode; taken: readonly ExplorerNode[] } {
	const taken: ExplorerNode[] = [];
	const prune = (page: PageNode): PageNode => ({
		...page,
		children: page.children.flatMap((node) => {
			if (ids.has(node.id)) {
				taken.push(node);
				return [];
			}
			return [isPage(node) ? prune(node) : node];
		}),
	});
	return { tree: prune(tree), taken };
}

export function insertInto(
	tree: PageNode,
	parentId: string,
	index: number,
	nodes: readonly ExplorerNode[],
): PageNode {
	return mapPage(tree, parentId, (page) => {
		const at = Math.max(0, Math.min(index, page.children.length));
		return { ...page, children: [...page.children.slice(0, at), ...nodes, ...page.children.slice(at)] };
	});
}

export function moveNodes(
	tree: PageNode,
	ids: readonly string[],
	parentId: string,
	index: number,
): PageNode {
	const set = new Set(ids);
	const parent = pageAt(tree, parentId);
	const lifted =
		parent === null ? 0 : parent.children.slice(0, index).filter((child) => set.has(child.id)).length;
	const { tree: pruned, taken } = removeIds(tree, set);
	return insertInto(pruned, parentId, index - lifted, taken);
}

/* ── naming ──────────────────────────────────────────────────────────── */

export function uniqueName(taken: ReadonlySet<string>, base: string): string {
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}-${n}`)) n += 1;
	return `${base}-${n}`;
}

/** a page's copy reads as prose, the way a folder duplicate does */
export function uniquePageName(siblings: readonly ExplorerNode[], base: string): string {
	const taken = new Set(siblings.map((node) => node.name));
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base} ${n}`)) n += 1;
	return `${base} ${n}`;
}

/**
 * A deep copy with fresh ids. Every frame inside is renamed as it lands,
 * because a frame name is the project's one identity key — two claimants is a
 * loud error in spool, so the explorer never mints one.
 */
export function cloneSubtree(node: ExplorerNode, takenFrames: Set<string>): ExplorerNode {
	if (!isPage(node)) {
		const name = uniqueName(takenFrames, `${node.name}-copy`);
		takenFrames.add(name);
		return { ...node, id: freshId("f"), name };
	}
	return {
		...node,
		id: freshId("p"),
		children: node.children.map((child) => cloneSubtree(child, takenFrames)),
	};
}

/* ── drop targets ────────────────────────────────────────────────────── */

export interface DropSlot {
	readonly depth: number;
	readonly parentId: string;
	readonly index: number;
}

/**
 * Every depth a drop in the gap before `gap` could mean, shallowest first.
 *
 * A gap after the last child of a nested page is ambiguous on purpose: it is
 * equally "next to that frame", "next to its page", and "next to its page's
 * page". The pointer's x picks one, Notion-style, and the caller does the
 * picking because only it knows where the pointer is.
 */
export function betweenSlots(
	rows: readonly Row[],
	expanded: ReadonlySet<string>,
	gap: number,
): readonly DropSlot[] {
	const prev = rows[gap - 1];
	if (prev === undefined) return [{ depth: 0, parentId: TOP_ID, index: 0 }];
	const slots: DropSlot[] = [];
	if (isPage(prev.node) && expanded.has(prev.node.id)) {
		slots.push({ depth: prev.depth + 1, parentId: prev.node.id, index: 0 });
	}
	let cursor: Row | undefined = prev;
	while (cursor !== undefined) {
		const here: Row = cursor;
		slots.push({ depth: here.depth, parentId: here.parentId, index: here.index + 1 });
		if (here.parentId === TOP_ID || here.index !== here.siblings - 1) break;
		cursor = rows.find((row) => row.node.id === here.parentId);
	}
	const floor = rows[gap]?.depth ?? 0;
	const usable = slots.filter((slot) => slot.depth >= floor).reverse();
	return usable.length > 0 ? usable : slots.slice(-1);
}

/** whether a set of dragged nodes can land in a page at all */
export function canLandIn(tree: PageNode, dragged: readonly string[], parentId: string): boolean {
	if (dragged.includes(parentId)) return false;
	if (dragged.some((id) => isWithin(tree, id, parentId))) return false;
	// the top level is a list of pages; a frame lives on the root page, not beside it
	if (parentId === TOP_ID && dragged.some((id) => nodeAt(tree, id)?.kind === "frame")) return false;
	return true;
}

export function slotAllowed(tree: PageNode, dragged: readonly string[], slot: DropSlot): boolean {
	if (!canLandIn(tree, dragged, slot.parentId)) return false;
	// the root page is permanent and first: nothing sorts above it
	if (slot.parentId === TOP_ID && slot.index === 0) return false;
	return true;
}

/* ── the fixture ─────────────────────────────────────────────────────── */

function frame(id: string, name: string, entry: "frame.tsx" | "term.tsx" = "frame.tsx"): FrameNode {
	return { kind: "frame", id: `f-${id}`, name, entry };
}

function page(id: string, name: string, children: readonly ExplorerNode[]): PageNode {
	return { kind: "page", id: `p-${id}`, name, children };
}

/** a project with enough in it that dragging has somewhere to go */
export function seedTree(): PageNode {
	return {
		kind: "page",
		id: TOP_ID,
		name: TOP_ID,
		children: [
			{
				kind: "page",
				id: ROOT_ID,
				name: "root",
				children: [frame("home", "home"), frame("home-dark", "home--dark"), frame("install", "install", "term.tsx")],
			},
			page("explorations", "explorations", [
				page("chat", "chat", [
					frame("agent-chat", "agent-chat"),
					frame("agent-chat-empty", "agent-chat--empty"),
					frame("agent-rail", "agent-rail"),
				]),
				page("exp-landing", "landing-page", [
					frame("hero", "hero"),
					frame("hero-dense", "hero--dense"),
					frame("sections", "sections"),
				]),
				page("pricing", "pricing", [frame("plans", "plans"), frame("plans-annual", "plans--annual")]),
			]),
			page("application", "application", [
				frame("checkout", "checkout"),
				frame("checkout-empty", "checkout--empty"),
				frame("shell", "shell"),
				page("app-landing", "landing-page", [
					frame("marketing-home", "marketing-home"),
					frame("waitlist", "waitlist"),
				]),
				page("onboarding", "onboarding", [
					frame("signup", "signup"),
					frame("verify-email", "verify-email"),
					frame("workspace", "workspace"),
				]),
			]),
			page("directing", "directing", [
				frame("annotate", "annotate"),
				frame("measure", "measure"),
				frame("pointer", "pointer"),
			]),
			page("site", "site", [frame("docs-index", "docs-index"), frame("changelog", "changelog")]),
			// a page nobody has written into yet: the other empty, and the one no
			// treatment can answer by pointing at what is inside
			page("scratch", "scratch", []),
		],
	};
}

/** open enough of the fixture that the list overflows its rail on arrival */
export function seedExpanded(): ReadonlySet<string> {
	return new Set([
		ROOT_ID,
		"p-explorations",
		"p-chat",
		"p-exp-landing",
		"p-pricing",
		"p-application",
		"p-onboarding",
	]);
}
