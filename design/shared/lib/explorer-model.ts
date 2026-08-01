import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type ExplorerNode,
	type FrameNode,
	type PageNode,
	ROOT_ID,
	chainTo,
	cloneSubtree,
	everyNode,
	flatten,
	frameCount,
	frameNames,
	freshId,
	insertInto,
	isPage,
	moveNodes,
	nodeAt,
	pageAt,
	pagePath,
	parentOf,
	removeIds,
	renameNode,
	seedExpanded,
	seedTree,
	uniqueName,
	uniquePageName,
} from "./explorer-tree";

/**
 * Everything the explorer rail knows, as one hook.
 *
 * The rail draws it and the fake canvas beside it reads it, so both stay in
 * step without either owning the other. Every mutation snapshots first: undo is
 * one stack, and the delete toast is the only place it is advertised.
 */

export interface SelectModifiers {
	readonly shift: boolean;
	readonly toggle: boolean;
}

export interface RenameState {
	readonly id: string;
	readonly draft: string;
	/** a page that has never had a name: cancelling removes it rather than reverting */
	readonly born: boolean;
}

export interface ToastState {
	readonly id: number;
	readonly text: string;
}

interface Snapshot {
	readonly tree: PageNode;
	readonly expanded: ReadonlySet<string>;
	readonly selection: readonly string[];
	readonly activePageId: string;
}

const TOAST_MS = 6000;

export function useExplorer() {
	const [tree, setTree] = useState<PageNode>(seedTree);
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(seedExpanded);
	const [selection, setSelection] = useState<readonly string[]>([]);
	const [activePageId, setActivePageId] = useState<string>(ROOT_ID);
	const [clipboard, setClipboard] = useState<readonly FrameNode[]>([]);
	const [renaming, setRenaming] = useState<RenameState | null>(null);
	const [toast, setToast] = useState<ToastState | null>(null);
	const [revealed, setRevealed] = useState<{ name: string; token: number } | null>(null);
	const anchor = useRef<string | null>(null);
	const history = useRef<readonly Snapshot[]>([]);
	const toastSeq = useRef(0);

	const rows = useMemo(() => flatten(tree, expanded), [tree, expanded]);

	useEffect(() => {
		if (toast === null) return;
		const timer = window.setTimeout(() => setToast(null), TOAST_MS);
		return () => window.clearTimeout(timer);
	}, [toast]);

	const remember = useCallback(() => {
		history.current = [...history.current.slice(-24), { tree, expanded, selection, activePageId }];
	}, [tree, expanded, selection, activePageId]);

	const undo = useCallback(() => {
		const last = history.current.at(-1);
		if (last === undefined) return false;
		history.current = history.current.slice(0, -1);
		setTree(last.tree);
		setExpanded(last.expanded);
		setSelection(last.selection);
		setActivePageId(last.activePageId);
		setToast(null);
		return true;
	}, []);

	/* ── expanding ─────────────────────────────────────────────────── */

	const setOpen = useCallback(
		(id: string, open: boolean, deep = false) => {
			const node = nodeAt(tree, id);
			const ids =
				deep && node !== null && isPage(node)
					? [id, ...everyNode(node).filter(isPage).map((page) => page.id)]
					: [id];
			setExpanded((was) => {
				const next = new Set(was);
				for (const each of ids) {
					if (open) next.add(each);
					else next.delete(each);
				}
				return next;
			});
		},
		[tree],
	);

	const toggleOpen = useCallback(
		(id: string, deep = false) => setOpen(id, !expanded.has(id), deep),
		[expanded, setOpen],
	);

	const collapseAll = useCallback(() => setExpanded(new Set()), []);

	/** open every ancestor so a node has a row to stand on */
	const reveal = useCallback(
		(id: string) => {
			const ancestors = chainTo(tree, id)
				.filter((node) => node.id !== id)
				.map((node) => node.id);
			setExpanded((was) => new Set([...was, ...ancestors]));
		},
		[tree],
	);

	/* ── selecting ─────────────────────────────────────────────────── */

	const activate = useCallback((pageId: string) => setActivePageId(pageId), []);

	const select = useCallback(
		(id: string, modifiers: SelectModifiers = { shift: false, toggle: false }) => {
			const node = nodeAt(tree, id);
			if (node === null) return;
			if (isPage(node)) {
				anchor.current = id;
				setSelection([id]);
				return;
			}
			setActivePageId(parentOf(tree, id).id);
			const from = anchor.current;
			if (modifiers.shift && from !== null) {
				const order = rows.map((row) => row.node.id);
				const a = order.indexOf(from);
				const b = order.indexOf(id);
				if (a !== -1 && b !== -1) {
					const span = rows.slice(Math.min(a, b), Math.max(a, b) + 1);
					setSelection(span.filter((row) => !isPage(row.node)).map((row) => row.node.id));
					return;
				}
			}
			anchor.current = id;
			if (modifiers.toggle) {
				setSelection((was) => (was.includes(id) ? was.filter((each) => each !== id) : [...was, id]));
				return;
			}
			setSelection([id]);
		},
		[tree, rows],
	);

	const clearSelection = useCallback(() => {
		anchor.current = null;
		setSelection([]);
	}, []);

	/* ── moving ────────────────────────────────────────────────────── */

	const move = useCallback(
		(ids: readonly string[], parentId: string, index: number) => {
			remember();
			setTree(moveNodes(tree, ids, parentId, index));
			setExpanded((was) => new Set([...was, parentId]));
		},
		[tree, remember],
	);

	/* ── renaming ──────────────────────────────────────────────────── */

	const beginRename = useCallback(
		(id: string) => {
			const node = nodeAt(tree, id);
			if (node === null || id === ROOT_ID) return;
			setRenaming({ id, draft: node.name, born: false });
		},
		[tree],
	);

	const setDraft = useCallback((draft: string) => {
		setRenaming((was) => (was === null ? null : { ...was, draft }));
	}, []);

	const commitRename = useCallback(() => {
		const was = renaming;
		if (was === null) return;
		setRenaming(null);
		const node = nodeAt(tree, was.id);
		if (node === null) return;
		const wanted = was.draft.trim().toLowerCase();
		if (wanted === "") {
			if (was.born) setTree(removeIds(tree, new Set([was.id])).tree);
			return;
		}
		if (wanted === node.name) return;
		if (!was.born) remember();
		if (isPage(node)) {
			const siblings = parentOf(tree, was.id).children.filter((each) => each.id !== was.id);
			setTree(renameNode(tree, was.id, uniquePageName(siblings, wanted)));
			return;
		}
		const taken = frameNames(tree);
		taken.delete(node.name);
		setTree(renameNode(tree, was.id, uniqueName(taken, wanted)));
	}, [renaming, tree, remember]);

	const cancelRename = useCallback(() => {
		const was = renaming;
		if (was === null) return;
		setRenaming(null);
		if (!was.born) return;
		setTree(removeIds(tree, new Set([was.id])).tree);
		setSelection([]);
	}, [renaming, tree]);

	/* ── the verbs ─────────────────────────────────────────────────── */

	const remove = useCallback(
		(ids: readonly string[]) => {
			const targets = ids.filter((id) => id !== ROOT_ID);
			if (targets.length === 0) return;
			remember();
			const doomed = targets.flatMap((id) => {
				const node = nodeAt(tree, id);
				return node === null ? [] : [node];
			});
			setTree(removeIds(tree, new Set(targets)).tree);
			setSelection([]);
			if (targets.some((id) => id === activePageId)) setActivePageId(ROOT_ID);
			toastSeq.current += 1;
			setToast({ id: toastSeq.current, text: deletionLine(doomed) });
		},
		[tree, remember, activePageId],
	);

	const duplicate = useCallback(
		(ids: readonly string[]) => {
			const targets = ids.filter((id) => id !== ROOT_ID);
			if (targets.length === 0) return;
			remember();
			const taken = frameNames(tree);
			const minted: string[] = [];
			let next = tree;
			for (const id of targets) {
				const node = nodeAt(next, id);
				if (node === null) continue;
				const parent = parentOf(next, id);
				const at = parent.children.findIndex((child) => child.id === id) + 1;
				const clone = cloneSubtree(node, taken);
				const named = isPage(clone)
					? { ...clone, name: uniquePageName(parent.children, `${node.name} copy`) }
					: clone;
				minted.push(named.id);
				next = insertInto(next, parent.id, at, [named]);
			}
			setTree(next);
			setSelection(minted);
		},
		[tree, remember],
	);

	const copy = useCallback(() => {
		const frames = selection.flatMap((id) => {
			const node = nodeAt(tree, id);
			return node !== null && !isPage(node) ? [node] : [];
		});
		if (frames.length === 0) return 0;
		setClipboard(frames);
		return frames.length;
	}, [selection, tree]);

	/** the page a paste lands on: the selected page, a selected frame's page, or the active one */
	const pasteTarget = useCallback((): string => {
		const first = selection[0];
		if (first !== undefined) {
			const node = nodeAt(tree, first);
			if (node !== null) return isPage(node) ? node.id : parentOf(tree, first).id;
		}
		return pageAt(tree, activePageId) === null ? ROOT_ID : activePageId;
	}, [selection, tree, activePageId]);

	const paste = useCallback(
		(pageId?: string) => {
			if (clipboard.length === 0) return;
			const target = pageId ?? pasteTarget();
			if (pageAt(tree, target) === null) return;
			remember();
			const taken = frameNames(tree);
			const copies = clipboard.map((node) => cloneSubtree(node, taken));
			const page = pageAt(tree, target);
			setTree(insertInto(tree, target, page?.children.length ?? 0, copies));
			setExpanded((was) => new Set([...was, target]));
			setSelection(copies.map((node) => node.id));
			setActivePageId(target);
		},
		[clipboard, pasteTarget, tree, remember],
	);

	const newPage = useCallback(
		(parentId: string, index?: number) => {
			remember();
			const born: PageNode = { kind: "page", id: freshId("p"), name: "untitled", children: [] };
			const parent = pageAt(tree, parentId);
			if (parent === null) return;
			setTree(insertInto(tree, parentId, index ?? parent.children.length, [born]));
			setExpanded((was) => new Set([...was, parentId, born.id]));
			setSelection([born.id]);
			setActivePageId(born.id);
			setRenaming({ id: born.id, draft: "untitled", born: true });
		},
		[tree, remember],
	);

	const revealOnCanvas = useCallback(
		(id: string) => {
			const node = nodeAt(tree, id);
			if (node === null || isPage(node)) return;
			reveal(id);
			setSelection([id]);
			setActivePageId(parentOf(tree, id).id);
			setRevealed((was) => ({ name: node.name, token: (was?.token ?? 0) + 1 }));
		},
		[tree, reveal],
	);

	/* ── what the canvas beside the rail shows ─────────────────────── */

	const stage = useMemo(() => {
		const page = pageAt(tree, activePageId) ?? pageAt(tree, ROOT_ID);
		return {
			label: page === null ? "root" : page.name,
			path: page === null ? "" : pagePath(tree, page.id),
			frames: page === null ? [] : page.children.filter((node): node is FrameNode => !isPage(node)),
		};
	}, [tree, activePageId]);

	const selectedFrame = useMemo(() => {
		const first = selection[0];
		if (first === undefined) return null;
		const node = nodeAt(tree, first);
		return node !== null && !isPage(node) ? node : null;
	}, [selection, tree]);

	const sourcePath = useCallback(
		(id: string): string => {
			const node = nodeAt(tree, id);
			if (node === null) return "";
			const under = pagePath(tree, parentOf(tree, id).id);
			const prefix = under === "" ? "frames" : `frames/${under}`;
			return isPage(node) ? `${prefix}/${node.name}/` : `${prefix}/${node.name}/${node.entry}`;
		},
		[tree],
	);

	return {
		tree,
		rows,
		expanded,
		selection,
		activePageId,
		clipboard,
		renaming,
		toast,
		revealed,
		stage,
		selectedFrame,
		sourcePath,
		setOpen,
		toggleOpen,
		collapseAll,
		reveal,
		select,
		clearSelection,
		activate,
		move,
		beginRename,
		setDraft,
		commitRename,
		cancelRename,
		remove,
		duplicate,
		copy,
		paste,
		pasteTarget,
		newPage,
		revealOnCanvas,
		undo,
		dismissToast: () => setToast(null),
	};
}

export type ExplorerModel = ReturnType<typeof useExplorer>;

/** `deleted explorations · 8 frames` — the machine saying what it just did */
function deletionLine(nodes: readonly ExplorerNode[]): string {
	const first = nodes[0];
	if (first === undefined) return "deleted nothing";
	if (nodes.length > 1) {
		const frames = nodes.reduce((total, node) => total + frameCount(node), 0);
		return `deleted ${nodes.length} items · ${frames} frames`;
	}
	if (!isPage(first)) return `deleted ${first.name}`;
	const frames = frameCount(first);
	return `deleted ${first.name} · ${frames} ${frames === 1 ? "frame" : "frames"}`;
}
