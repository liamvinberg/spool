import { useEffect, useMemo, useRef, useState } from "react";
import type { CanvasMode, ProjectedFrame } from "../api";
import type { TreeRow } from "./element-tree";
import { rowSelectors } from "./element-tree";
import { type PickedSelection, pickKey } from "./overlays";
import { pageLabel, pageList } from "./pages";

/**
 * The frames sidebar (#39) with the element tree layered in (#37), to the
 * settled file-tree design: one collapsible left panel — pages above the
 * active page's frame list, each frame row expandable into its element tree
 * in design mode. The panel is a navigator over the projection and the live
 * DOM: rows select, switch, and jump; they never author. One grammar across
 * every list: shift ranges over visible rows, ⌘/Ctrl toggles, a single click
 * selects and never moves the camera — double-click flies (frames) or opens
 * the editor (elements). Dragging the edge resizes; past the snap threshold
 * it collapses to the rail.
 */

const PANEL_WIDTH = 248;
const RAIL_WIDTH = 44;
const MIN_WIDTH = 200;
const MAX_WIDTH = 320;
const SNAP_BELOW = 144;
const COLLAPSED_BELOW = 72;

const ROW_INDENT = 16;

export interface SelectModifiers {
	shift: boolean;
	toggle: boolean;
}

const modifiersOf = (event: React.MouseEvent): SelectModifiers => ({
	shift: event.shiftKey,
	toggle: event.metaKey || event.ctrlKey,
});

export function CanvasSidebar({
	pages,
	activePage,
	frames,
	selected,
	mode,
	picked,
	rowsByFrame,
	callSiteLabels,
	expandedFrames,
	expandedRows,
	pendingWakes,
	revealTarget,
	onSwitchPage,
	onSelectFrame,
	onDoubleClickFrame,
	onToggleFrame,
	onSelectRow,
	onDoubleClickRow,
	onToggleRow,
}: {
	/** Named pages, sorted; the root page is implied and listed first. */
	pages: readonly string[];
	activePage: string;
	/** The active page's frames, projection order. */
	frames: readonly ProjectedFrame[];
	selected: readonly string[];
	mode: CanvasMode;
	picked: readonly PickedSelection[];
	/** Each expanded frame's element tree, once its DOM has answered. */
	rowsByFrame: Record<string, TreeRow[]>;
	callSiteLabels: Record<string, string | null>;
	expandedFrames: ReadonlySet<string>;
	expandedRows: ReadonlySet<string>;
	/** Expanded frames whose DOM has not answered yet — the quiet wake state. */
	pendingWakes: ReadonlySet<string>;
	/** The row key a canvas pick wants on screen. */
	revealTarget: string | undefined;
	onSwitchPage: (page: string) => void;
	onSelectFrame: (name: string, modifiers: SelectModifiers) => void;
	onDoubleClickFrame: (name: string) => void;
	onToggleFrame: (name: string) => void;
	onSelectRow: (frame: string, row: TreeRow, modifiers: SelectModifiers) => void;
	onDoubleClickRow: (frame: string, row: TreeRow) => void;
	onToggleRow: (key: string) => void;
}) {
	const [width, setWidth] = useState(PANEL_WIDTH);
	const [dragging, setDragging] = useState(false);
	const drag = useRef<{ pointerId: number; startWidth: number; startX: number; latestWidth: number } | null>(null);
	const collapsed = width <= COLLAPSED_BELOW;
	const rowElements = useRef(new Map<string, HTMLElement>());

	// selection sync (#37): the revealed row scrolls into view, never centered
	useEffect(() => {
		if (revealTarget === undefined) return;
		rowElements.current.get(revealTarget)?.scrollIntoView({ block: "nearest" });
	}, [revealTarget]);

	const pickedKeys = useMemo(() => new Set(picked.map((pick) => pickKey(pick.frame, pick.selector))), [picked]);

	function finishDrag(target: HTMLElement, pointerId: number) {
		const current = drag.current;
		if (current === null || current.pointerId !== pointerId) return;
		target.releasePointerCapture(pointerId);
		drag.current = null;
		setDragging(false);
		setWidth(current.latestWidth < SNAP_BELOW ? RAIL_WIDTH : Math.max(MIN_WIDTH, current.latestWidth));
	}

	return (
		<aside
			className={`relative z-20 h-full shrink-0 overflow-hidden border-border border-r bg-bg ${
				dragging ? "" : "transition-[width] duration-200 motion-reduce:transition-none"
			}`}
			style={{ width }}
		>
			{collapsed ? (
				<div className="flex h-11 w-11 items-center justify-center border-border border-b">
					<button
						type="button"
						onClick={() => setWidth(PANEL_WIDTH)}
						aria-label="Expand frames panel"
						className="flex h-7 w-7 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-text"
					>
						<PanelOpenIcon className="h-3.5 w-3.5" />
					</button>
				</div>
			) : (
				<div className="flex h-full min-w-[200px] flex-col">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-3.5">
						<div className="flex items-center gap-2.5">
							<h1 className="font-semibold text-base leading-base">Frames</h1>
							<span className="font-mono text-muted text-xs leading-xs">{frames.length}</span>
						</div>
						<button
							type="button"
							onClick={() => setWidth(RAIL_WIDTH)}
							aria-label="Collapse frames panel"
							className="flex h-6 w-6 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-text"
						>
							<PanelCloseIcon className="h-3.5 w-3.5" />
						</button>
					</div>

					{pages.length > 0 && (
						<div className="shrink-0 border-border border-b py-2">
							<div className="flex h-6 items-center px-3.5 font-mono text-2xs text-muted leading-3">Pages</div>
							{/* many pages scroll inside their cap — they never crowd out the frame list */}
							<div className="max-h-44 overflow-y-auto">
								{pageList(pages).map((page) => {
									const active = page === activePage;
									return (
										<button
											key={page}
											type="button"
											aria-pressed={active}
											onClick={() => onSwitchPage(page)}
											className={`flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left font-mono text-sm leading-sm hover:bg-surface ${
												active ? "text-text" : "text-muted"
											}`}
										>
											<PageIcon
												className={`h-3.5 w-3.5 shrink-0 ${active ? "text-thread" : "text-muted"}`}
											/>
											<span className="min-w-0 flex-1 truncate">{pageLabel(page)}</span>
										</button>
									);
								})}
							</div>
						</div>
					)}

					<div className="min-h-0 flex-1 overflow-y-auto py-2">
						{frames.map((frame) => {
							const isSelected = selected.includes(frame.name);
							// a terminal is a cell grid, not an element tree (#42): no expansion
							const expandable = mode === "design" && frame.kind !== "term";
							const open = expandable && expandedFrames.has(frame.name);
							const rows = rowsByFrame[frame.name];
							return (
								<div key={frame.name}>
									<div
										className={`group flex h-8 w-full items-center pr-2 font-mono text-sm leading-sm hover:bg-surface ${
											isSelected ? "text-text" : "text-muted"
										}`}
									>
										{/* element expansion is design's (#7): live rows carry no chevron */}
										{expandable ? (
											<button
												type="button"
												aria-label={open ? `Collapse ${frame.name}` : `Expand ${frame.name}`}
												aria-expanded={open}
												onClick={() => onToggleFrame(frame.name)}
												className="flex h-8 w-6 shrink-0 items-center justify-center text-muted hover:text-text"
											>
												<ChevronIcon open={open} className="h-2.5 w-2.5" />
											</button>
										) : (
											// hold the chevron column in design so term rows align
											<span className={mode === "design" ? "w-6 shrink-0" : "w-3 shrink-0"} />
										)}
										<button
											type="button"
											aria-pressed={isSelected}
											onClick={(event) => onSelectFrame(frame.name, modifiersOf(event))}
											onDoubleClick={() => onDoubleClickFrame(frame.name)}
											onKeyDown={(event) => {
												if (!expandable) return;
												if (event.key === "ArrowRight" && !open) {
													event.preventDefault();
													onToggleFrame(frame.name);
												}
												if (event.key === "ArrowLeft" && open) {
													event.preventDefault();
													onToggleFrame(frame.name);
												}
											}}
											className="flex h-8 min-w-0 flex-1 items-center gap-2 text-left"
										>
											<FrameIcon
												className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-thread" : "text-muted"}`}
											/>
											<span className="min-w-0 flex-1 truncate">{frame.name}</span>
											<span className="pr-1 text-2xs text-muted opacity-0 transition-opacity group-hover:opacity-100">
												frame.tsx
											</span>
										</button>
									</div>

									{open && (
										<div className="relative pb-1">
											<span className="absolute top-0 bottom-2 left-[18px] w-px bg-border-raised" />
											{rows === undefined
												? pendingWakes.has(frame.name) && (
														<div className="flex h-7 items-center pl-12 font-mono text-2xs text-muted leading-3">
															<span className="animate-pulse">waking…</span>
														</div>
													)
												: rows.map((row) => (
														<TreeRowView
															key={row.key}
															depth={0}
															frame={frame.name}
															row={row}
															callSiteLabels={callSiteLabels}
															expandedRows={expandedRows}
															pickedKeys={pickedKeys}
															rowElements={rowElements.current}
															onSelect={onSelectRow}
															onDoubleClick={onDoubleClickRow}
															onToggle={onToggleRow}
														/>
													))}
										</div>
									)}
								</div>
							);
						})}
					</div>

					<div className="flex h-9 shrink-0 items-center border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
						Shift range · ⌘/Ctrl toggle
					</div>
				</div>
			)}

			<button
				type="button"
				aria-label="Resize frames panel"
				onKeyDown={(event) => {
					if (event.key === "ArrowLeft") setWidth(RAIL_WIDTH);
					if (event.key === "ArrowRight") setWidth(PANEL_WIDTH);
				}}
				onPointerDown={(event) => {
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
						Math.max(RAIL_WIDTH, current.startWidth + event.clientX - current.startX),
					);
					current.latestWidth = next;
					setWidth(next);
				}}
				onPointerUp={(event) => finishDrag(event.currentTarget, event.pointerId)}
				onPointerCancel={(event) => finishDrag(event.currentTarget, event.pointerId)}
				className="group -right-1.5 absolute top-0 z-30 h-full w-3 cursor-col-resize touch-none outline-none"
			>
				<span className="absolute top-0 bottom-0 left-[5px] w-px bg-transparent group-hover:bg-thread group-focus-visible:bg-thread" />
			</button>
		</aside>
	);
}

/** One tree row (#37): slot, label, count — the file-tree design verbatim. */
function TreeRowView({
	depth,
	frame,
	row,
	callSiteLabels,
	expandedRows,
	pickedKeys,
	rowElements,
	onSelect,
	onDoubleClick,
	onToggle,
}: {
	depth: number;
	frame: string;
	row: TreeRow;
	callSiteLabels: Record<string, string | null>;
	expandedRows: ReadonlySet<string>;
	pickedKeys: ReadonlySet<string>;
	rowElements: Map<string, HTMLElement>;
	onSelect: (frame: string, row: TreeRow, modifiers: SelectModifiers) => void;
	onDoubleClick: (frame: string, row: TreeRow) => void;
	onToggle: (key: string) => void;
}) {
	const branch = row.children.length > 0;
	const open = branch && expandedRows.has(row.key);
	const selectors = rowSelectors(row);
	const isSelected = selectors.length > 0 && selectors.every((selector) => pickedKeys.has(pickKey(frame, selector)));
	const connectorLeft = 18 + depth * ROW_INDENT;
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
				className={`relative flex h-7 w-full items-center text-xs leading-xs hover:bg-surface ${
					isSelected ? "bg-surface text-text" : "text-muted"
				}`}
			>
				<span className="absolute top-1/2 h-px w-2.5 bg-border-raised" style={{ left: connectorLeft }} />
				{branch && (
					<button
						type="button"
						aria-label={open ? `Collapse ${label || slot}` : `Expand ${label || slot}`}
						aria-expanded={open}
						onClick={() => onToggle(row.key)}
						className="absolute z-10 flex h-7 w-5 items-center justify-center text-muted hover:text-text"
						style={{ left: 24 + depth * ROW_INDENT }}
					>
						<ChevronIcon open={open} className="h-2.5 w-2.5" />
					</button>
				)}
				<button
					type="button"
					aria-pressed={isSelected}
					title={count === undefined ? label || slot : `${label || slot} · ${count} rendered`}
					onClick={(event) => onSelect(frame, row, modifiersOf(event))}
					onDoubleClick={() => onDoubleClick(frame, row)}
					onKeyDown={(event) => {
						if (event.key === "ArrowRight" && branch && !open) {
							event.preventDefault();
							onToggle(row.key);
						}
						if (event.key === "ArrowLeft" && branch && open) {
							event.preventDefault();
							onToggle(row.key);
						}
					}}
					className="flex h-7 w-full min-w-0 items-center gap-2 pr-3 text-left"
					style={{ paddingLeft: 48 + depth * ROW_INDENT }}
				>
					<span className={`w-[54px] shrink-0 font-mono text-2xs ${isSelected ? "text-thread" : "text-muted"}`}>
						{slot}
					</span>
					<span className="min-w-0 flex-1 truncate">{label}</span>
					{count !== undefined && <span className="shrink-0 font-mono text-2xs text-muted">{count}</span>}
				</button>
			</div>

			{open && (
				<div className="relative">
					<span
						className="absolute top-0 bottom-1 w-px bg-border-raised"
						style={{ left: connectorLeft + ROW_INDENT }}
					/>
					{row.children.map((child) => (
						<TreeRowView
							key={child.key}
							depth={depth + 1}
							frame={frame}
							row={child}
							callSiteLabels={callSiteLabels}
							expandedRows={expandedRows}
							pickedKeys={pickedKeys}
							rowElements={rowElements}
							onSelect={onSelect}
							onDoubleClick={onDoubleClick}
							onToggle={onToggle}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function ChevronIcon({ className, open }: { className?: string; open: boolean }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={`origin-center transition-transform duration-150 motion-reduce:transition-none ${
				open ? "rotate-90" : ""
			} ${className ?? ""}`}
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

function FrameIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function PageIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.25h3.5l1.5 1.75h5.5v6H1.75z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PanelCloseIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
			<path d="M6 3v10M10.5 6 8.5 8l2 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
		</svg>
	);
}

function PanelOpenIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
			<path d="M6 3v10M8.5 6l2 2-2 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
		</svg>
	);
}
