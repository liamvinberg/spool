import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { cn } from "../lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "./coffee-screens";
import { SpoolShell } from "./spool-shell";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const PANEL_WIDTH = 248;
const RAIL_WIDTH = 44;

export function SpoolFileTreeSnap() {
	return (
		<SpoolShell
			activeTab="kaffe"
			homeTarget="spool-home"
			liveTarget="spool-canvas--live"
			designTarget="spool-canvas--file-tree-snap"
			playTarget="spool-player"
			mode="design"
			zoom="72%"
		>
			<SnapDock />
		</SpoolShell>
	);
}

function SnapDock() {
	const reduceMotion = useReducedMotion();
	const [width, setWidth] = useState(PANEL_WIDTH);
	const [dragging, setDragging] = useState(false);
	const drag = useRef<{
		pointerId: number;
		startWidth: number;
		startX: number;
		latestWidth: number;
	} | null>(null);
	const collapsed = width <= 72;

	function finishDrag(target: HTMLElement, pointerId: number) {
		const current = drag.current;
		if (current === null || current.pointerId !== pointerId) return;
		target.releasePointerCapture(pointerId);
		drag.current = null;
		setDragging(false);
		setWidth(current.latestWidth < 144 ? RAIL_WIDTH : Math.max(200, current.latestWidth));
	}

	return (
		<div className="flex h-full min-h-0">
			<motion.aside
				initial={false}
				animate={{ width }}
				transition={reduceMotion || dragging ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
				className="relative z-20 h-full shrink-0 overflow-hidden border-border border-r bg-bg"
			>
				<AnimatePresence initial={false} mode="popLayout">
					{collapsed ? (
						<motion.div
							key="rail"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: reduceMotion ? 0 : 0.1 }}
							className="h-full"
						>
							<FrameRail onExpand={() => setWidth(PANEL_WIDTH)} />
						</motion.div>
					) : (
						<motion.div
							key="panel"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: reduceMotion ? 0 : 0.1 }}
							className="h-full min-w-[200px]"
						>
							<TreePanel footer="Drag edge to resize" onCollapse={() => setWidth(RAIL_WIDTH)} />
						</motion.div>
					)}
				</AnimatePresence>

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
						const next = Math.min(320, Math.max(RAIL_WIDTH, current.startWidth + event.clientX - current.startX));
						current.latestWidth = next;
						setWidth(next);
					}}
					onPointerUp={(event) => finishDrag(event.currentTarget, event.pointerId)}
					onPointerCancel={(event) => finishDrag(event.currentTarget, event.pointerId)}
					className="group absolute -right-1.5 top-0 z-30 h-full w-3 cursor-col-resize touch-none outline-none"
				>
					<span className="absolute bottom-0 left-[5px] top-0 w-px bg-transparent group-hover:bg-thread group-focus-visible:bg-thread" />
				</button>
			</motion.aside>
			<CanvasPreview />
		</div>
	);
}

function TreePanel({ footer, onCollapse }: { footer: string; onCollapse: () => void }) {
	return (
		<div className="flex h-full w-full min-w-[200px] flex-col bg-bg">
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-3.5">
				<div className="flex items-center gap-2.5">
					<h1 className="font-semibold text-base leading-base">Frames</h1>
					<span className="font-mono text-muted text-xs leading-xs">3</span>
				</div>
				<button
					type="button"
					onClick={onCollapse}
					className="flex h-6 w-6 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-text active:scale-[0.97]"
					aria-label="Collapse frames panel"
				>
					<PanelCloseIcon className="h-3.5 w-3.5" />
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden py-2 text-xs leading-xs whitespace-nowrap">
				<FrameRow name="menu" />
				<FrameRow expanded name="cart" />
				<div className="relative">
					<span className="absolute bottom-1 left-[18px] top-0 w-px bg-border-raised" />
					<TreeRow branch depth={0} label="CoffeeCart" tag="div" />
					<TreeRow branch depth={1} label="Content" tag="div" />
					<TreeRow depth={2} label="Din varukorg" tag="h1" />
					<TreeRow branch count="2" depth={2} label="cart.map(…)" tag="div" />
					<TreeRow depth={3} label="1 × Cortado · 42 kr" tag="[0]" />
					<TreeRow depth={3} label="1 × Flat white · 48 kr" tag="[1]" />
					<TreeRow branch depth={1} label="Footer" tag="div" />
					<TreeRow branch depth={2} label="Total" tag="div" />
					<TreeRow depth={3} label="Totalt" tag="span" />
					<TreeRow depth={3} label="90 kr" tag="span" />
					<TreeRow depth={2} label="Betala med kort eller Klarna" selected tag="button" />
				</div>
				<FrameRow name="receipt" />
			</div>

			<div className="flex h-9 shrink-0 items-center border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
				{footer}
			</div>
		</div>
	);
}

function FrameRail({ onExpand }: { onExpand: () => void }) {
	return (
		<div className="flex h-full w-11 flex-col bg-bg">
			<div className="flex h-11 items-center justify-center border-border border-b">
				<button
					type="button"
					onClick={onExpand}
					aria-label="Expand frames panel"
					className="flex h-7 w-7 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-text active:scale-[0.97]"
				>
					<PanelOpenIcon className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}

function FrameRow({ expanded = false, name }: { expanded?: boolean; name: CoffeeScreenName }) {
	return (
		<div className="flex h-8 items-center gap-2 px-3 font-mono text-sm leading-sm">
			<ChevronIcon className="h-2.5 w-2.5" open={expanded} />
			<FrameIcon className={cn("h-3.5 w-3.5", name === "cart" ? "text-thread" : "text-muted")} />
			<span className={name === "cart" ? "text-text" : "text-muted"}>{name}</span>
		</div>
	);
}

function TreeRow({
	branch = false,
	count,
	depth,
	label,
	selected = false,
	tag,
}: {
	branch?: boolean;
	count?: string;
	depth: number;
	label: string;
	selected?: boolean;
	tag: string;
}) {
	const connectorLeft = 18 + depth * 16;
	const instance = tag.startsWith("[");
	return (
		<button
			type="button"
			title={label}
			className={cn(
				"relative flex h-7 w-full min-w-0 items-center gap-2 pr-3 text-left hover:bg-surface",
				selected ? "bg-surface text-text" : "text-muted",
			)}
			style={{ paddingLeft: 48 + depth * 16 }}
		>
			<span className="absolute top-1/2 h-px w-2.5 bg-border-raised" style={{ left: connectorLeft }} />
			{branch ? <ChevronIcon className="absolute h-2.5 w-2.5" open style={{ left: 29 + depth * 16 }} /> : null}
			<span className={cn("w-[54px] shrink-0 font-mono text-2xs", selected ? "text-thread" : "text-muted")}>
				{instance ? tag : `<${tag}>`}
			</span>
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{count ? <span className="shrink-0 font-mono text-2xs text-muted">{count}</span> : null}
		</button>
	);
}

function CanvasPreview() {
	return (
		<div className="relative h-full min-w-0 flex-1 overflow-hidden bg-canvas">
			<ThreadSvg />
			<PreviewFrame left="8%" screen="menu" top={128} />
			<PreviewFrame left="40%" screen="cart" selected top={168} />
			<PreviewFrame left="72%" screen="receipt" top={108} />
		</div>
	);
}

function PreviewFrame({
	left,
	screen,
	selected = false,
	top,
}: {
	left: string;
	screen: CoffeeScreenName;
	selected?: boolean;
	top: number;
}) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<div className="h-4 font-mono text-sm text-muted leading-xs">{screen}</div>
			<div className="relative h-[520px] w-[240px]">
				<CoffeeScreen
					screen={screen}
					scale="design"
					actionLabel={screen === "cart" ? "Betala med kort eller Klarna" : undefined}
				/>
				{selected ? (
					<>
						<div className="pointer-events-none absolute bottom-[12px] left-[12px] h-[42px] w-[216px] rounded-[10px] border border-thread" />
						<div className="absolute left-0 top-[532px] flex items-center gap-1.5 rounded-xs border border-border-raised bg-raised px-2 py-unit font-mono text-2xs leading-[14px] whitespace-nowrap">
							<span className="text-muted">frames/cart/frame.tsx:145</span>
							<span className="text-muted">·</span>
							<span>Open in editor</span>
						</div>
					</>
				) : null}
			</div>
		</div>
	);
}

function ChevronIcon({ className, open, style }: { className?: string; open: boolean; style?: React.CSSProperties }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={cn("shrink-0", className)}
			fill="none"
			aria-hidden="true"
			style={{ ...style, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
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

function ThreadSvg() {
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox="0 0 1000 856"
			preserveAspectRatio="none"
			fill="none"
			aria-hidden="true"
		>
			<path d="M280 434C330 432 345 472 390 470" stroke="var(--color-thread)" strokeWidth="1.5" />
			<path d="m398 470-9-5v10Z" fill="var(--color-thread)" />
			<path
				d="M610 470C660 468 675 414 720 414"
				stroke="var(--color-thread)"
				strokeWidth="1.5"
				strokeDasharray="5 5"
			/>
			<path d="m728 414-9-5v10Z" fill="var(--color-thread)" />
		</svg>
	);
}
