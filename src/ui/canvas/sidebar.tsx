import { useRef, useState } from "react";
import type { ProjectedFrame } from "../api";
import { pageLabel, pageList } from "./pages";

/**
 * The frames sidebar (#39): one collapsible navigator with pages above the
 * active page's frame list. Rows select without moving the camera and
 * double-click flies to a frame. Dragging the edge resizes; past the snap
 * threshold it collapses to the rail.
 */

const PANEL_WIDTH = 248;
const RAIL_WIDTH = 44;
const MIN_WIDTH = 200;
const MAX_WIDTH = 320;
const SNAP_BELOW = 144;
const COLLAPSED_BELOW = 72;

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
	onSwitchPage,
	onSelectFrame,
	onDoubleClickFrame,
}: {
	/** Named pages, sorted; the root page is implied and listed first. */
	pages: readonly string[];
	activePage: string;
	/** The active page's frames, projection order. */
	frames: readonly ProjectedFrame[];
	selected: readonly string[];
	onSwitchPage: (page: string) => void;
	onSelectFrame: (name: string, modifiers: SelectModifiers) => void;
	onDoubleClickFrame: (name: string) => void;
}) {
	const [width, setWidth] = useState(PANEL_WIDTH);
	const [dragging, setDragging] = useState(false);
	const drag = useRef<{ pointerId: number; startWidth: number; startX: number; latestWidth: number } | null>(null);
	const collapsed = width <= COLLAPSED_BELOW;

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
							return (
								<div
									key={frame.name}
									className={`group flex h-8 w-full items-center pr-2 font-mono text-sm leading-sm hover:bg-surface ${
										isSelected ? "text-text" : "text-muted"
									}`}
								>
									<span className="w-3 shrink-0" />
									<button
										type="button"
										aria-pressed={isSelected}
										onClick={(event) => onSelectFrame(frame.name, modifiersOf(event))}
										onDoubleClick={() => onDoubleClickFrame(frame.name)}
										className="flex h-8 min-w-0 flex-1 items-center gap-2 text-left"
									>
										<FrameIcon
											className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-thread" : "text-muted"}`}
										/>
										<span className="min-w-0 flex-1 truncate">{frame.name}</span>
										<span className="pr-1 text-2xs text-muted opacity-0 transition-opacity group-hover:opacity-100">
											{frame.kind === "term" ? "term.tsx" : "frame.tsx"}
										</span>
									</button>
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
