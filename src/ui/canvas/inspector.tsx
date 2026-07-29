import { useEffect, useMemo, useRef, useState } from "react";
import { accelPressed } from "../../runtime/platform-keys";
import { InspectorIcon } from "../icons";
import type { ConnectionGroup, ConnectionRow, UnreadableRow } from "./connections";
import { rowSelectors, type TreeRow } from "./element-tree";
import { pickKey } from "./overlays";
import { pageLabel } from "./pages";
import { PanelCaret, type SelectModifiers } from "./sidebar";

/**
 * The selection inspector rail (#58): a canvas-edge sibling of the Pages
 * rail. It collapses to its own 44px strip, expands leftward, and stays put
 * across selections. An open rail shows its honest-empty line when nothing is
 * selected.
 *
 * Two tabs over one selected frame. `elements` is the resting state: the
 * frame's named rows (#55), each one a canvas selection on click and an editor
 * jump on double-click. `connections` is the frame's whole outbound list from
 * the derived graph — the only complete one, and the only home for
 * destinations no arrow can reach. Rows navigate the canvas; nothing here
 * walks the prototype.
 */

export const RAIL_WIDTH = 300;

const STRIP_WIDTH = 44;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const SNAP_BELOW = 144;
const COLLAPSED_BELOW = 72;

export type InspectorMode = "elements" | "connections";

const MODES: readonly InspectorMode[] = ["elements", "connections"];

const ROW_INDENT = 14;

export interface InspectorTarget {
	frame: string;
	page: string;
	width: number;
	height: number;
	/** A terminal is a cell grid, not a DOM: it has no elements to list (#42). */
	kind: "html" | "term";
	/** The frame's own source file, as the editor door spells it. */
	sourcePath: string;
}

const modifiersOf = (event: React.MouseEvent): SelectModifiers => ({
	shift: event.shiftKey,
	toggle: accelPressed(event),
});

export function InspectorRail({
	mode,
	onMode,
	onOpenChange,
	outboundCount,
	target,
	rows,
	callSiteLabels,
	expandedRows,
	pickedKeys,
	revealKey,
	groups,
	unreadableConnections,
	onSelectRow,
	onDoubleClickRow,
	onToggleRow,
	onOpenConnection,
	onReload,
	onOpenEditor,
}: {
	mode: InspectorMode;
	onMode: (mode: InspectorMode) => void;
	onOpenChange: (open: boolean) => void;
	/** The selected frame's outbound links, carried by the collapsed strip. */
	outboundCount: number | null;
	/** The frame the rail is reading; null is the idle rail. */
	target: InspectorTarget | null;
	/** The target's named rows: undefined while it wakes, null when it never answered. */
	rows: TreeRow[] | null | undefined;
	callSiteLabels: Record<string, string | null>;
	expandedRows: ReadonlySet<string>;
	/** `frame\0selector` of every picked element — a row selected on the canvas. */
	pickedKeys: ReadonlySet<string>;
	/** The row key a canvas pick wants on screen. */
	revealKey: string | undefined;
	groups: ConnectionGroup[];
	/** Walks this frame declares whose destination could not be read. */
	unreadableConnections: UnreadableRow[];
	onSelectRow: (row: TreeRow, modifiers: SelectModifiers) => void;
	onDoubleClickRow: (row: TreeRow) => void;
	onToggleRow: (key: string) => void;
	onOpenConnection: (row: ConnectionRow) => void;
	onReload: () => void;
	onOpenEditor: () => void;
}) {
	const [width, setWidth] = useState(STRIP_WIDTH);
	const [dragging, setDragging] = useState(false);
	const drag = useRef<{ pointerId: number; startWidth: number; startX: number; latestWidth: number } | null>(null);
	const rowElements = useRef(new Map<string, HTMLElement>());
	const collapsed = width <= COLLAPSED_BELOW;

	function updateWidth(next: number) {
		setWidth(next);
		onOpenChange(next > COLLAPSED_BELOW);
	}

	function finishDrag(target: HTMLElement, pointerId: number) {
		const current = drag.current;
		if (current === null || current.pointerId !== pointerId) return;
		target.releasePointerCapture(pointerId);
		drag.current = null;
		setDragging(false);
		updateWidth(current.latestWidth < SNAP_BELOW ? STRIP_WIDTH : Math.max(MIN_WIDTH, current.latestWidth));
	}

	// selection sync: the revealed row scrolls into view, never centered
	useEffect(() => {
		if (revealKey === undefined) return;
		rowElements.current.get(revealKey)?.scrollIntoView({ block: "nearest" });
	}, [revealKey]);

	return (
		<aside
			aria-label="Inspector"
			data-inspector=""
			style={{ width }}
			className={`relative z-20 h-full shrink-0 overflow-hidden border-border border-l bg-bg ${
				dragging
					? ""
					: "transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
			}`}
			onPointerDown={(event) => event.stopPropagation()}
			onPointerMove={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onContextMenu={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
		>
			{collapsed ? (
				<div className="flex h-full w-11 flex-col items-center">
					<button
						type="button"
						aria-label="Expand inspector"
						onClick={() => updateWidth(RAIL_WIDTH)}
						className="flex h-11 w-11 items-center justify-center gap-1 text-muted/70 hover:text-text"
					>
						<InspectorIcon />
						{outboundCount === null ? null : (
							<span className="font-mono text-2xs text-muted leading-3">{outboundCount}</span>
						)}
					</button>
				</div>
			) : (
				<div className="flex h-full min-w-[200px] flex-col">
					<div className="flex h-11 shrink-0 items-stretch justify-between border-border border-b pr-2 pl-4">
						<div className="flex h-full items-stretch gap-5">
							{MODES.map((candidate) => {
								const active = mode === candidate;
								return (
									<button
										key={candidate}
										type="button"
										aria-pressed={active}
										onClick={() => onMode(candidate)}
										className={`relative flex h-full items-center font-mono text-xs leading-xs transition-colors ${
											active ? "text-text" : "text-muted/60 hover:text-muted"
										}`}
									>
										{candidate}
										{active ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
									</button>
								);
							})}
						</div>
						<button
							type="button"
							aria-label="Collapse inspector"
							onClick={() => updateWidth(STRIP_WIDTH)}
							className="flex h-11 w-7 shrink-0 items-center justify-center text-muted/60 hover:text-text"
						>
							<PanelCaret dir="right" className="h-3.5 w-2.5" />
						</button>
					</div>

					{target === null ? (
						<IdleLine line="select a frame to inspect it" />
					) : (
						<div className="flex min-h-0 flex-1 flex-col">
							<Identity target={target} onReload={onReload} onOpenEditor={onOpenEditor} />
							{mode === "elements" ? (
								<ElementsTab
									terminal={target.kind === "term"}
									rows={rows}
									callSiteLabels={callSiteLabels}
									expandedRows={expandedRows}
									pickedKeys={pickedKeys}
									frame={target.frame}
									rowElements={rowElements.current}
									onSelectRow={onSelectRow}
									onDoubleClickRow={onDoubleClickRow}
									onToggleRow={onToggleRow}
								/>
							) : (
								<ConnectionsTab
									groups={groups}
									unreadable={unreadableConnections}
									onOpenConnection={onOpenConnection}
								/>
							)}
						</div>
					)}
				</div>
			)}

			<button
				type="button"
				aria-label="Resize inspector"
				onKeyDown={(event) => {
					// a focused grip answers its arrows itself; stop them short of
					// the hotkey dispatch, or the same press would nudge the selection
					if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
					event.stopPropagation();
					if (event.key === "ArrowLeft") updateWidth(RAIL_WIDTH);
					if (event.key === "ArrowRight") updateWidth(STRIP_WIDTH);
				}}
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					drag.current = {
						pointerId: event.pointerId,
						startWidth: width,
						startX: event.clientX,
						latestWidth: width,
					};
					setDragging(true);
				}}
				onPointerMove={(event) => {
					const current = drag.current;
					if (current === null || current.pointerId !== event.pointerId) return;
					const next = Math.min(
						MAX_WIDTH,
						Math.max(STRIP_WIDTH, current.startWidth + current.startX - event.clientX),
					);
					current.latestWidth = next;
					updateWidth(next);
				}}
				onPointerUp={(event) => finishDrag(event.currentTarget, event.pointerId)}
				onPointerCancel={(event) => finishDrag(event.currentTarget, event.pointerId)}
				className="group -left-1.5 absolute top-0 z-30 h-full w-3 cursor-col-resize touch-none outline-none"
			>
				<span className="absolute top-0 right-[5px] bottom-0 w-px bg-transparent group-hover:bg-thread group-focus-visible:bg-thread" />
			</button>
		</aside>
	);
}

/** Honest-empty: one quiet line, nothing else. */
function IdleLine({ line }: { line: string }) {
	return (
		<div className="flex flex-1 items-center justify-center px-8 text-center">
			<span className="font-mono text-2xs text-muted/55 leading-4">{line}</span>
		</div>
	);
}

/** One-line identity: name, page and size, source path with the quiet actions. */
function Identity({
	target,
	onReload,
	onOpenEditor,
}: {
	target: InspectorTarget;
	onReload: () => void;
	onOpenEditor: () => void;
}) {
	return (
		<div className="shrink-0 px-4 pt-3.5 pb-3">
			<div className="flex items-baseline gap-2">
				<span className="font-mono text-thread text-xs leading-3">▸</span>
				<span className="min-w-0 flex-1 truncate font-mono text-text text-xs leading-3">{target.frame}</span>
				<span className="shrink-0 font-mono text-2xs text-muted leading-3">{pageLabel(target.page)}</span>
				<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">
					{target.width} × {target.height}
				</span>
			</div>
			<div className="mt-2 flex items-center gap-2">
				<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/55 leading-3">
					{target.sourcePath}
				</span>
				<div className="flex shrink-0 items-center gap-0.5">
					<GlyphButton title="Reload frame" onClick={onReload}>
						<ReloadIcon />
					</GlyphButton>
					<GlyphButton title="Open in editor" onClick={onOpenEditor}>
						<EditorIcon />
					</GlyphButton>
				</div>
			</div>
		</div>
	);
}

function ElementsTab({
	terminal,
	rows,
	callSiteLabels,
	expandedRows,
	pickedKeys,
	frame,
	rowElements,
	onSelectRow,
	onDoubleClickRow,
	onToggleRow,
}: {
	terminal: boolean;
	rows: TreeRow[] | null | undefined;
	callSiteLabels: Record<string, string | null>;
	expandedRows: ReadonlySet<string>;
	pickedKeys: ReadonlySet<string>;
	frame: string;
	rowElements: Map<string, HTMLElement>;
	onSelectRow: (row: TreeRow, modifiers: SelectModifiers) => void;
	onDoubleClickRow: (row: TreeRow) => void;
	onToggleRow: (key: string) => void;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center justify-between px-4 pt-1 pb-1">
				<span className="font-mono text-2xs text-muted leading-3">elements</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{terminal ? "" : (rows?.length ?? "")}</span>
			</div>
			{terminal ? (
				<div className="px-4 pt-3 font-mono text-2xs text-muted/55 leading-4">
					a terminal is a cell grid, not an element tree
				</div>
			) : rows === undefined ? (
				<div className="px-4 pt-3 font-mono text-2xs text-muted/55 leading-4">
					<span className="animate-pulse">waking…</span>
				</div>
			) : rows === null ? (
				<div className="px-4 pt-3 font-mono text-2xs text-muted/55 leading-4">this frame did not answer</div>
			) : rows.length === 0 ? (
				<div className="px-4 pt-3 font-mono text-2xs text-muted/55 leading-4">nothing named in this frame</div>
			) : (
				<div className="pages-scrollbar min-h-0 flex-1 overflow-y-auto pb-3">
					{rows.map((row) => (
						<ElementRowView
							key={row.key}
							row={row}
							depth={0}
							frame={frame}
							callSiteLabels={callSiteLabels}
							expandedRows={expandedRows}
							pickedKeys={pickedKeys}
							rowElements={rowElements}
							onSelect={onSelectRow}
							onDoubleClick={onDoubleClickRow}
							onToggle={onToggleRow}
						/>
					))}
				</div>
			)}
		</div>
	);
}

/** One named row: its slot, its name, and for a call-site how many it renders. */
function ElementRowView({
	row,
	depth,
	frame,
	callSiteLabels,
	expandedRows,
	pickedKeys,
	rowElements,
	onSelect,
	onDoubleClick,
	onToggle,
}: {
	row: TreeRow;
	depth: number;
	frame: string;
	callSiteLabels: Record<string, string | null>;
	expandedRows: ReadonlySet<string>;
	pickedKeys: ReadonlySet<string>;
	rowElements: Map<string, HTMLElement>;
	onSelect: (row: TreeRow, modifiers: SelectModifiers) => void;
	onDoubleClick: (row: TreeRow) => void;
	onToggle: (key: string) => void;
}) {
	const branch = row.children.length > 0;
	const open = branch && expandedRows.has(row.key);
	const selectors = rowSelectors(row);
	const selected = selectors.length > 0 && selectors.every((selector) => pickedKeys.has(pickKey(frame, selector)));
	const slot = row.kind === "instance" ? `[${row.index}]` : row.kind === "boundary" ? "<…>" : `<${row.tag}>`;
	const label =
		row.kind === "element" || row.kind === "instance"
			? row.label
			: row.kind === "boundary"
				? row.basename
				: (callSiteLabels[row.source] ?? "");
	const count = row.kind === "callsite" ? row.count : undefined;

	return (
		<div>
			<div
				ref={(el) => {
					if (el === null) rowElements.delete(row.key);
					else rowElements.set(row.key, el);
				}}
				className={`relative flex h-7 items-center hover:bg-surface ${selected ? "bg-surface" : ""}`}
			>
				{branch ? (
					<button
						type="button"
						aria-label={`${open ? "Collapse" : "Expand"} ${label === "" ? slot : label}`}
						aria-expanded={open}
						onClick={() => onToggle(row.key)}
						className="absolute z-10 flex h-7 w-5 items-center justify-center text-muted hover:text-text"
						style={{ left: 8 + depth * ROW_INDENT }}
					>
						<ChevronIcon open={open} className="h-2.5 w-2.5" />
					</button>
				) : null}
				<button
					type="button"
					aria-pressed={selected}
					title={count === undefined ? undefined : `${count} rendered`}
					onClick={(event) => onSelect(row, modifiersOf(event))}
					onDoubleClick={() => onDoubleClick(row)}
					className="flex h-7 w-full min-w-0 items-center gap-2 pr-3 text-left"
					style={{ paddingLeft: 28 + depth * ROW_INDENT }}
				>
					<span className={`shrink-0 font-mono text-2xs leading-3 ${selected ? "text-thread" : "text-muted/70"}`}>
						{slot}
					</span>
					<span
						className={`min-w-0 flex-1 truncate font-mono text-xs leading-xs ${selected ? "text-text" : "text-muted"}`}
					>
						{label}
					</span>
					{count === undefined ? null : (
						<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{count}</span>
					)}
				</button>
			</div>
			{open
				? row.children.map((child) => (
						<ElementRowView
							key={child.key}
							row={child}
							depth={depth + 1}
							frame={frame}
							callSiteLabels={callSiteLabels}
							expandedRows={expandedRows}
							pickedKeys={pickedKeys}
							rowElements={rowElements}
							onSelect={onSelect}
							onDoubleClick={onDoubleClick}
							onToggle={onToggle}
						/>
					))
				: null}
		</div>
	);
}

/** The whole outbound list, grouped by the page each link lands on. */
function ConnectionsTab({
	groups,
	unreadable,
	onOpenConnection,
}: {
	groups: ConnectionGroup[];
	unreadable: UnreadableRow[];
	onOpenConnection: (row: ConnectionRow) => void;
}) {
	const [query, setQuery] = useState("");
	const total = groups.reduce((sum, group) => sum + group.rows.length, 0) + unreadable.length;
	const q = query.trim().toLowerCase();
	const filtered = useMemo(
		() =>
			groups
				.map((group) => ({
					...group,
					rows: q === "" ? group.rows : group.rows.filter((row) => row.target.toLowerCase().includes(q)),
				}))
				.filter((group) => group.rows.length > 0),
		[groups, q],
	);
	// an unreadable site has no target to match, so the filter reads its source
	const filteredUnreadable = useMemo(
		() => (q === "" ? unreadable : unreadable.filter((row) => row.path.toLowerCase().includes(q))),
		[unreadable, q],
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center justify-between px-4 pt-1 pb-1.5">
				<span className="font-mono text-2xs text-muted leading-3">connections</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{total}</span>
			</div>

			{total === 0 ? (
				<div className="px-4 pt-3 font-mono text-2xs text-muted/55 leading-4">
					no outbound links from this frame
				</div>
			) : (
				<>
					<div className="px-3 pb-2">
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="filter links"
							aria-label="Filter links"
							className="w-full rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-2xs text-text leading-3 placeholder:text-muted/60 focus:border-border-raised focus:outline-none"
						/>
					</div>
					<div className="pages-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4">
						{filtered.map((group) => (
							<div key={group.page ?? "\0missing"} className="pt-1.5">
								<div className="flex items-center justify-between px-2 pb-1">
									<span className="font-mono text-2xs text-muted/55 leading-3">
										{group.page === null ? "missing" : pageLabel(group.page)}
									</span>
									<span className="font-mono text-2xs text-muted/35 leading-3">{group.rows.length}</span>
								</div>
								{group.rows.map((row) => (
									<ConnectionRowView key={row.target} row={row} onOpen={onOpenConnection} />
								))}
							</div>
						))}
						{filteredUnreadable.length > 0 ? (
							<div className="pt-1.5">
								<div className="flex items-center justify-between px-2 pb-1">
									<span className="font-mono text-2xs text-muted/55 leading-3">unreadable</span>
									<span className="font-mono text-2xs text-muted/35 leading-3">
										{filteredUnreadable.length}
									</span>
								</div>
								{filteredUnreadable.map((row) => (
									<UnreadableRowView key={`${row.path}:${row.line}`} row={row} />
								))}
							</div>
						) : null}
						{filtered.length === 0 && filteredUnreadable.length === 0 ? (
							<div className="px-2 pt-6 text-center font-mono text-2xs text-muted/55 leading-3">
								no links match
							</div>
						) : null}
					</div>
				</>
			)}
		</div>
	);
}

/** Certainty as the leading glyph, verified as a trailing check, missing named. */
function ConnectionRowView({ row, onOpen }: { row: ConnectionRow; onOpen: (row: ConnectionRow) => void }) {
	return (
		<button
			type="button"
			// a destination no frame answers to is real information, not a place to go
			disabled={row.missing}
			aria-label={`${row.target} connection`}
			onClick={() => onOpen(row)}
			className="group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left enabled:hover:bg-surface"
		>
			<span
				title={row.certainty === "will" ? "will navigate" : "might navigate"}
				className={`shrink-0 text-xs leading-3 ${row.certainty === "will" ? "text-thread/70" : "text-muted/45"}`}
			>
				{row.certainty === "will" ? "→" : "⇢"}
			</span>
			<span
				className={`min-w-0 flex-1 truncate font-mono text-2xs leading-3 ${
					row.missing ? "text-muted/45 line-through" : "text-muted group-hover:text-text"
				}`}
			>
				{row.target}
			</span>
			{row.missing ? <span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">missing</span> : null}
			{row.verified ? (
				<span title="verified in a session" className="shrink-0 text-2xs text-muted/50 leading-3">
					✓
				</span>
			) : null}
		</button>
	);
}

/**
 * A walk with no readable destination: its source location is the only thing
 * there is to say about it, so that is the label. Not a button — there is
 * nowhere to go — but never absent either, which was the bug: a frame whose
 * only walks are computed used to read as a frame with no walks at all.
 */
function UnreadableRowView({ row }: { row: UnreadableRow }) {
	return (
		<div
			title={`${row.path}:${row.line} — spool cannot read this destination`}
			className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
		>
			<span className="shrink-0 text-xs text-muted/45 leading-3">⇠</span>
			<span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted/45 leading-3">
				{row.path}:{row.line}
			</span>
			<span className="shrink-0 font-mono text-2xs text-muted/55 leading-3">unreadable</span>
		</div>
	);
}

function GlyphButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			onClick={onClick}
			className="flex h-5 w-5 items-center justify-center rounded-sm text-muted/70 hover:text-text"
		>
			{children}
		</button>
	);
}

function ReloadIcon() {
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
			<path d="M10 5.2A4 4 0 1 0 10.2 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
			<path
				d="M10.3 2.2v2.7H7.6"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function EditorIcon() {
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
			<path
				d="M4 2.5 1.5 6 4 9.5"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M8 2.5 10.5 6 8 9.5"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={`${className ?? ""} origin-center transition-transform duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
			fill="none"
			aria-hidden="true"
		>
			<path
				d="m4 2.5 3.5 3.5L4 9.5"
				stroke="currentColor"
				strokeWidth="1.25"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
