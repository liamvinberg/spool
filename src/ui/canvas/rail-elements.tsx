import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "../cn";
import { TreeRow } from "../primitives/structure";
import {
	ancestorsOf,
	type TreeRow as ElementRow,
	frameOpening,
	TREE_MOST,
	treeDepth,
	treeHeight,
	treeRows,
} from "./element-tree";
import { type ElementNode, elementsMessage } from "./protocol";
import type { RailUnder } from "./sidebar";

/**
 * The element tree in the pages rail (#342).
 *
 * While the Edit tool is on, the frame the hand is in shows its elements under
 * its own row: pages, then frames, then elements, one tree. It is a third
 * reader of the one selection the canvas already holds, beside the outline and
 * the name label. A click on a row is the same selection a click on the canvas
 * makes, and a selection made anywhere opens the tree down to its row and
 * scrolls it into view. It keeps no selection of its own.
 *
 * The rows come from one read of the frame, asked again whenever the frame's
 * document may have changed under it: a reload, a hand write, an undo. Only
 * one frame's tree is open, and putting Edit down folds it away.
 */

/** the fold, which the rail's room plays on the house curve */
const FOLD_MS = 300;
/** a burst of changes to one document is read once */
const REREAD_MS = 60;

export interface ElementTreeInput {
	editOn: boolean;
	/** the frame the hand is in: the one its elements are held in, else the one frame selected */
	frame: string | null;
	/** the elements held, in whatever frames they are in; the last one is the anchor */
	held: readonly { readonly frame: string; readonly selector: string }[];
	/** the frame is held on its own, with no element in it */
	frameHeld: boolean;
	/** a message to one frame's document; false when that frame has none */
	post: (frame: string, message: unknown) => boolean;
	onSelect: (frame: string, selector: string) => void;
	/** a row under the pointer, or none: the canvas outlines its element without taking it */
	onHover: (frame: string, selector: string | null) => void;
}

export interface ElementTree {
	/** what the pages rail draws under the frame's row, or nothing */
	under: RailUnder | null;
	/** the frame's answer to a read */
	receive: (answer: { frame: string; id: number; nodes: readonly ElementNode[] }) => void;
	/** this frame's document may have changed: read it again if its tree is showing */
	stale: (frame: string) => void;
}

export function useElementTree(input: ElementTreeInput): ElementTree {
	const { editOn, frame, held, frameHeld } = input;
	const latest = useRef(input);
	latest.current = input;

	// the frame whose tree stands in the rail; it outlives Edit by one fold
	const [shown, setShown] = useState<string | null>(null);
	useEffect(() => {
		if (editOn && frame !== null) setShown(frame);
	}, [editOn, frame]);
	useEffect(() => {
		if (editOn) return;
		const timer = setTimeout(() => setShown(null), FOLD_MS);
		return () => clearTimeout(timer);
	}, [editOn]);

	const [read, setRead] = useState<{ frame: string; nodes: readonly ElementNode[] } | null>(null);
	const asked = useRef<{ frame: string; id: number } | null>(null);
	const seq = useRef(0);
	const rereadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const ask = useCallback((target: string) => {
		clearTimeout(rereadTimer.current);
		const id = ++seq.current;
		asked.current = { frame: target, id };
		latest.current.post(target, elementsMessage(id));
	}, []);

	useEffect(() => {
		if (editOn && shown !== null) ask(shown);
	}, [editOn, shown, ask]);
	useEffect(() => () => clearTimeout(rereadTimer.current), []);

	const now = useRef({ editOn, shown });
	now.current = { editOn, shown };
	const stale = useCallback(
		(target: string) => {
			if (!now.current.editOn || now.current.shown !== target) return;
			clearTimeout(rereadTimer.current);
			rereadTimer.current = setTimeout(() => ask(target), REREAD_MS);
		},
		[ask],
	);
	const receive = useCallback((answer: { frame: string; id: number; nodes: readonly ElementNode[] }) => {
		const wanted = asked.current;
		if (wanted === null || wanted.id !== answer.id || wanted.frame !== answer.frame) return;
		setRead({ frame: answer.frame, nodes: answer.nodes });
	}, []);

	const nodes = useMemo(() => (read !== null && read.frame === shown ? read.nodes : []), [read, shown]);

	// what is open, by selector: a re-read of the same document keeps it
	const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
	useEffect(() => {
		if (shown !== null) setOpen(new Set());
	}, [shown]);
	const widen = useCallback((selectors: readonly string[]) => {
		if (selectors.length === 0) return;
		setOpen((was) => (selectors.every((each) => was.has(each)) ? was : new Set([...was, ...selectors])));
	}, []);

	const mine = useMemo(
		() => new Set(held.filter((pick) => pick.frame === shown).map((pick) => pick.selector)),
		[held, shown],
	);
	const anchor = [...mine].at(-1) ?? null;

	// a selection made anywhere opens the tree down to it; one the read has
	// never heard of is a document that changed since, read once more
	const missed = useRef<string | null>(null);
	useEffect(() => {
		if (anchor === null || nodes.length === 0 || shown === null) return;
		if (nodes.some((node) => node.selector === anchor)) {
			widen(ancestorsOf(nodes, anchor));
			return;
		}
		if (missed.current === anchor) return;
		missed.current = anchor;
		ask(shown);
	}, [anchor, nodes, shown, widen, ask]);
	useEffect(() => {
		if (frameHeld && anchor === null) widen(frameOpening(nodes));
	}, [frameHeld, anchor, nodes, widen]);

	// and scrolls its row into view, once, when it moves
	const [reveal, setReveal] = useState<string | null>(null);
	useEffect(() => setReveal(anchor), [anchor]);

	const rows = useMemo(() => treeRows(nodes, open), [nodes, open]);
	const toggle = useCallback(
		(selector: string) =>
			setOpen((was) => {
				const next = new Set(was);
				if (next.has(selector)) next.delete(selector);
				else next.add(selector);
				return next;
			}),
		[],
	);

	const under = useMemo((): RailUnder | null => {
		if (shown === null) return null;
		const target = shown;
		return {
			frame: target,
			height: Math.min(treeHeight(rows), TREE_MOST),
			open: editOn,
			held: mine.size > 0,
			content: (
				<TreeRows
					rows={rows}
					held={mine}
					reveal={reveal}
					onRevealed={() => setReveal(null)}
					onToggle={toggle}
					onSelect={(selector) => latest.current.onSelect(target, selector)}
					onHover={(selector) => latest.current.onHover(target, selector)}
				/>
			),
		};
	}, [shown, rows, editOn, mine, reveal, toggle]);

	return { under, receive, stale };
}

/**
 * The tree's own scroll, then the rail list's, each moved just far enough to
 * show one row whole.
 */
function intoRail(row: HTMLElement): void {
	for (const box of [row.closest<HTMLElement>("[data-element-tree]"), row.closest<HTMLElement>('[role="tree"]')]) {
		if (box === null) continue;
		const at = row.getBoundingClientRect();
		const edge = box.getBoundingClientRect();
		if (at.top < edge.top) box.scrollTop -= edge.top - at.top + 4;
		else if (at.bottom > edge.bottom) box.scrollTop += at.bottom - edge.bottom + 4;
	}
}

/**
 * A press on a row must not take the keyboard: the rail's own keys trash and
 * rename, and every key the Edit tool binds belongs to the canvas whichever
 * reader made the selection.
 */
const keepFocus = (event: React.PointerEvent) => event.preventDefault();

function TreeRows({
	rows,
	held,
	reveal,
	onRevealed,
	onToggle,
	onSelect,
	onHover,
}: {
	rows: readonly ElementRow[];
	held: ReadonlySet<string>;
	reveal: string | null;
	onRevealed: () => void;
	onToggle: (selector: string) => void;
	onSelect: (selector: string) => void;
	onHover: (selector: string | null) => void;
}) {
	const tree = useRef<HTMLDivElement | null>(null);
	useLayoutEffect(() => {
		if (reveal === null) return;
		const row = tree.current?.querySelector<HTMLElement>(`[data-element-row="${CSS.escape(reveal)}"]`);
		if (row === null || row === undefined) return;
		intoRail(row);
		onRevealed();
	}, [reveal, onRevealed]);

	return (
		<div
			ref={tree}
			data-element-tree=""
			className="pages-scrollbar overflow-y-auto py-1"
			style={{ maxHeight: TREE_MOST }}
		>
			{rows.map((row) => {
				if (row.kind === "map") {
					return (
						<TreeRow
							key={row.key}
							role="none"
							depth={treeDepth(row.depth)}
							mono
							label={
								<>
									<span className="text-primary">.map</span> ×{row.count}
								</>
							}
						/>
					);
				}
				const { node } = row;
				const label = node.component ?? node.tag;
				return (
					<TreeRow
						key={node.selector}
						// the rail's roving stop is the list's own; a row is reached by pointer
						tabIndex={-1}
						data-element-row={node.selector}
						depth={treeDepth(row.depth)}
						{...(row.hasChildren ? { branch: { open: row.open, onToggle: () => onToggle(node.selector) } } : {})}
						selected={held.has(node.selector)}
						mono
						label={
							<>
								{row.number === null ? null : (
									<>
										<span className="text-tertiary type-detail">{row.number}</span>{" "}
									</>
								)}
								<span className={cn(node.component !== null && "text-primary")}>{`<${label}>`}</span>
								{node.words === null ? null : (
									<>
										{" "}
										<span className="text-secondary type-detail">{node.words}</span>
									</>
								)}
							</>
						}
						meta={row.file ?? undefined}
						decor={
							<button
								type="button"
								tabIndex={-1}
								aria-label={`<${label}>`}
								onClick={() => onSelect(node.selector)}
								className="absolute inset-0 z-1 cursor-default"
							/>
						}
						// in the capture, so the chevron's own press keeps the keyboard where it was too
						onPointerDownCapture={keepFocus}
						onPointerEnter={() => onHover(node.selector)}
						onPointerLeave={() => onHover(null)}
						// the rail's menu is about pages and frames, and this is neither
						onContextMenu={(event) => {
							event.preventDefault();
							event.stopPropagation();
						}}
					/>
				);
			})}
		</div>
	);
}
