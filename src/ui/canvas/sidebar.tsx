import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { accelPressed } from "../../runtime/platform-keys";
import type { ProjectedFrame } from "../api";
import { framesOnPage, pageLabel, pageList } from "./pages";

const PANEL_WIDTH = 248;
const STRIP_WIDTH = 44;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const SNAP_BELOW = 144;
const COLLAPSED_BELOW = 72;

export interface SelectModifiers {
	shift: boolean;
	toggle: boolean;
}

const modifiersOf = (event: React.MouseEvent): SelectModifiers => ({
	shift: event.shiftKey,
	toggle: accelPressed(event),
});

/** The pages navigator: a collapsible folder tree over the full projection. */
export function CanvasSidebar({
	pages,
	activePage,
	frames,
	selected,
	onSwitchPage,
	onSelectFrame,
	onDoubleClickFrame,
	litPage = null,
}: {
	/** Named pages, sorted; the root page is implied and listed first. */
	pages: readonly string[];
	activePage: string;
	/** Every projected frame; the canvas itself mounts only the active page. */
	frames: readonly ProjectedFrame[];
	selected: readonly string[];
	onSwitchPage: (page: string) => void;
	onSelectFrame: (name: string, modifiers: SelectModifiers) => void;
	onDoubleClickFrame: (name: string) => void;
	/** The page holding the finder's pick — its row lights while the palette is up. */
	litPage?: string | null;
}) {
	const [width, setWidth] = useState(PANEL_WIDTH);
	const [dragging, setDragging] = useState(false);
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [pageTooltip, setPageTooltip] = useState<{ page: string; x: number; y: number } | null>(null);
	const drag = useRef<{ pointerId: number; startWidth: number; startX: number; latestWidth: number } | null>(null);
	const tooltipId = useId();
	const collapsed = width <= COLLAPSED_BELOW;
	const orderedPages = pageList(pages);

	function activatePage(page: string) {
		onSwitchPage(page);
	}

	function finishDrag(target: HTMLElement, pointerId: number) {
		const current = drag.current;
		if (current === null || current.pointerId !== pointerId) return;
		target.releasePointerCapture(pointerId);
		drag.current = null;
		setDragging(false);
		setWidth(current.latestWidth < SNAP_BELOW ? STRIP_WIDTH : Math.max(MIN_WIDTH, current.latestWidth));
	}

	function showPageTooltip(page: string, target: HTMLButtonElement) {
		const box = target.getBoundingClientRect();
		setPageTooltip({ page, x: box.right + 8, y: box.top + box.height / 2 });
	}

	return (
		<aside
			className={`relative z-20 h-full shrink-0 overflow-hidden border-border border-r bg-bg ${
				dragging
					? ""
					: "transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
			}`}
			style={{ width }}
		>
			{collapsed ? (
				<div className="flex h-full w-11 flex-col items-center">
					<button
						type="button"
						aria-label="Expand pages"
						onClick={() => setWidth(PANEL_WIDTH)}
						className="flex h-11 w-11 items-center justify-center text-muted/70 hover:text-text"
					>
						<PanelCaret dir="right" className="h-3.5 w-2.5" />
					</button>
					<div
						className="pages-scrollbar flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto pt-1"
						onScroll={() => setPageTooltip(null)}
					>
						{orderedPages.map((page) => {
							const active = page === activePage;
							return (
								<button
									key={page}
									type="button"
									aria-label={`${pageLabel(page)} page`}
									aria-current={active ? "page" : undefined}
									aria-describedby={pageTooltip?.page === page ? tooltipId : undefined}
									onClick={() => activatePage(page)}
									onPointerEnter={(event) => showPageTooltip(page, event.currentTarget)}
									onPointerLeave={(event) => {
										if (document.activeElement !== event.currentTarget) setPageTooltip(null);
									}}
									onFocus={(event) => showPageTooltip(page, event.currentTarget)}
									onBlur={() => setPageTooltip(null)}
									className="relative flex h-9 w-11 items-center justify-center"
								>
									{active ? (
										<span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-thread" />
									) : null}
									<FolderIcon className={`h-4 w-4 ${active ? "text-thread" : "text-muted"}`} />
								</button>
							);
						})}
					</div>
				</div>
			) : (
				<div className="flex h-full min-w-[200px] flex-col">
					<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
						<div className="flex items-baseline gap-2">
							<h1 className="font-semibold text-base leading-base">Pages</h1>
							<span className="font-mono text-muted text-xs leading-xs">{orderedPages.length}</span>
						</div>
						<button
							type="button"
							aria-label="Collapse pages"
							onClick={() => setWidth(STRIP_WIDTH)}
							className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60 hover:text-text"
						>
							<PanelCaret dir="left" className="h-3.5 w-2.5" />
						</button>
					</div>

					<div className="pages-scrollbar min-h-0 flex-1 overflow-y-auto py-2">
						{orderedPages.map((page) => {
							const pageFrames = framesOnPage(frames, page);
							const active = page === activePage;
							const open = expanded[page] ?? false;
							return (
								<div key={page}>
									<div
										className={`group relative flex h-8 items-center pr-1.5 hover:bg-surface ${active || page === litPage ? "bg-surface" : ""}`}
									>
										{active ? (
											<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
										) : null}
										<button
											type="button"
											aria-label={`${open ? "Collapse" : "Expand"} ${pageLabel(page)}`}
											aria-expanded={open}
											onClick={() => setExpanded((current) => ({ ...current, [page]: !open }))}
											className="flex h-8 w-6 shrink-0 items-center justify-center"
										>
											<ChevronIcon open={open} className="h-2.5 w-2.5" />
										</button>
										<button
											type="button"
											aria-label={`${pageLabel(page)} page`}
											aria-current={active ? "page" : undefined}
											onClick={() => activatePage(page)}
											className="flex h-8 min-w-0 flex-1 items-center gap-2 text-left"
										>
											<FolderIcon
												className={`h-3.5 w-3.5 shrink-0 ${active ? "text-thread" : "text-muted"}`}
											/>
											<span
												className={`min-w-0 flex-1 truncate font-mono text-sm leading-sm ${active ? "text-text" : "text-muted"}`}
											>
												{pageLabel(page)}
											</span>
										</button>
										<span className="font-mono text-2xs text-muted/60 leading-3">{pageFrames.length}</span>
									</div>

									<div
										className={`grid transition-[grid-template-rows,opacity] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
											open
												? "grid-rows-[1fr] opacity-100 duration-[180ms]"
												: "grid-rows-[0fr] opacity-0 duration-[140ms]"
										}`}
									>
										<div className="min-h-0 overflow-hidden" inert={!open} aria-hidden={!open}>
											<div className="relative pb-0.5">
												<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
												{pageFrames.map((frame) => {
													const isSelected = selected.includes(frame.name);
													return (
														<div
															key={frame.name}
															className={`group/row relative flex h-7 items-center hover:bg-surface ${isSelected ? "bg-surface" : ""}`}
														>
															<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
															<button
																type="button"
																aria-label={`${frame.name} frame`}
																aria-pressed={isSelected}
																onClick={(event) => onSelectFrame(frame.name, modifiersOf(event))}
																onDoubleClick={() => onDoubleClickFrame(frame.name)}
																className="flex h-7 w-full min-w-0 items-center gap-2 pr-3 pl-[34px] text-left"
															>
																<FrameIcon
																	className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-thread" : "text-muted"}`}
																/>
																<span
																	className={`min-w-0 flex-1 truncate font-mono text-xs leading-xs ${isSelected ? "text-text" : "text-muted"}`}
																>
																	{frame.name}
																</span>
																<span className="pr-1 font-mono text-2xs text-muted/50 leading-3 opacity-0 transition-opacity group-hover/row:opacity-100">
																	{frame.kind === "term" ? "term.tsx" : "frame.tsx"}
																</span>
															</button>
														</div>
													);
												})}
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>

					<div className="flex h-9 shrink-0 items-center border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
						folder switches page
					</div>
				</div>
			)}

			{collapsed && pageTooltip !== null
				? createPortal(
						<span
							id={tooltipId}
							role="tooltip"
							className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-text leading-3"
							style={{ left: pageTooltip.x, top: pageTooltip.y }}
						>
							{pageLabel(pageTooltip.page)}
						</span>,
						document.body,
					)
				: null}

			<button
				type="button"
				aria-label="Resize pages"
				onKeyDown={(event) => {
					if (event.key === "ArrowLeft") setWidth(STRIP_WIDTH);
					if (event.key === "ArrowRight") setWidth(PANEL_WIDTH);
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
						Math.max(STRIP_WIDTH, current.startWidth + event.clientX - current.startX),
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

function FrameIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

export function FolderIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={`${className ?? ""} origin-center text-muted transition-transform duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
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

export function PanelCaret({ dir, className }: { dir: "left" | "right"; className?: string }) {
	const d = dir === "left" ? "m7.5 3.5-4 4.5 4 4.5" : "m4.5 3.5 4 4.5-4 4.5";
	return (
		<svg viewBox="0 0 12 16" className={className} fill="none" aria-hidden="true">
			<path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
