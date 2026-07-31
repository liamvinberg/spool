import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../../shared/lib/utils";
import { ChevronIcon, FolderIcon, HandIcon, PanelCaret, SelectIcon } from "../../../shared/ui/spool-icons";
import { chipOf, type Hand, RowChip, RowHold, StripHold } from "./hand";

/**
 * The canvas chrome, copied so the Pages rail can hold a presence.
 *
 * `spool-canvas-chrome.tsx` cannot carry this and it is worth being exact about
 * why, because it is the shared component's own shape rather than an oversight.
 * `PageRow` is a *page*, and the only per-frame channel it has is `targets`, which
 * belongs to the walk graph. The frames under an open page are rendered from a bare
 * list of strings, so there is nowhere to hang anything on the row for `home`.
 * `PageRow.lit` reaches the page and only the page, and it spends `bg-surface` —
 * the same wash `selected` uses — which is exactly the treatment this object must
 * not be confusable with.
 *
 * So what the shared rail would have to grow is one thing: **a frame under an open
 * page has to be addressable**, the way `targets` already addresses one. Everything
 * else here is the shipped rail unchanged.
 *
 * Two affordances the shipped chrome draws but does not wire are wired here,
 * because the ladder cannot be shown without them: a page row switches the canvas
 * to that page, and the header caret collapses the rail to its 44px strip. Both are
 * real product behaviour; this frame only needs them to be pressable.
 */

const PAGES_W = 248;
const STRIP_W = 44;
const PAGE_ROW_H = 32;
const FRAME_ROW_H = 28;
/** what sits to the right of the mark in each kind of row: the count, or nothing */
const PAGE_GUTTER = 19;
const FRAME_GUTTER = 8;

export interface RosterPage {
	readonly name: string;
	readonly frames: readonly string[];
	readonly active?: boolean | undefined;
	readonly open?: boolean | undefined;
}

/** where the presence has landed inside this rail, if it has landed here at all */
export interface RailHold {
	readonly hand: Hand;
	/** the page whose row carries it, or whose tree holds the frame's row */
	readonly page: string;
	/** the frame's own row, when the page is open under you; null puts it on the page row */
	readonly frame: string | null;
}

export function RosterChrome({
	pages,
	tool = "select",
	rail,
	railWidth = 300,
	railLabel = "Inspector",
	open = true,
	onToggle,
	onOpenPage,
	hold = null,
	strip = false,
	children,
}: {
	pages: readonly RosterPage[];
	tool?: "select" | "hand" | "none" | undefined;
	rail?: ReactNode | undefined;
	railWidth?: number | undefined;
	railLabel?: string | undefined;
	/** the Pages rail is expanded rather than collapsed to its strip */
	open?: boolean | undefined;
	onToggle?: (() => void) | undefined;
	onOpenPage?: ((page: string) => void) | undefined;
	hold?: RailHold | null | undefined;
	/** the presence has fallen past the rows and is on the collapsed strip */
	strip?: boolean | undefined;
	children?: ReactNode;
}) {
	return (
		<div className="flex h-full w-full overflow-hidden bg-bg">
			<PagesRail
				pages={pages}
				open={open}
				onToggle={onToggle}
				onOpenPage={onOpenPage}
				hold={hold}
				strip={strip}
			/>
			<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
				{children}
				<CanvasTools tool={tool} />
			</div>
			{railWidth === 0 ? null : (
				<aside
					aria-label={railLabel}
					className="flex shrink-0 flex-col border-border border-l bg-bg"
					style={{ width: railWidth }}
				>
					{rail}
				</aside>
			)}
		</div>
	);
}

function PagesRail({
	pages,
	open,
	onToggle,
	onOpenPage,
	hold,
	strip,
}: {
	pages: readonly RosterPage[];
	open: boolean;
	onToggle?: (() => void) | undefined;
	onOpenPage?: ((page: string) => void) | undefined;
	hold: RailHold | null | undefined;
	strip: boolean;
}) {
	return (
		<aside
			className="relative flex shrink-0 flex-col border-border border-r bg-bg"
			style={{ width: open ? PAGES_W : STRIP_W }}
		>
			<div
				className={cn(
					"flex h-11 shrink-0 items-center border-border border-b",
					open ? "justify-between pr-2 pl-3.5" : "justify-center",
				)}
			>
				{open ? (
					<div className="flex items-baseline gap-2">
						<h1 className="font-semibold text-base leading-base">Pages</h1>
						<span className="font-mono text-muted text-xs leading-xs">{pages.length}</span>
					</div>
				) : null}
				<button
					type="button"
					aria-label={open ? "Collapse pages" : "Expand pages"}
					className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60 hover:bg-surface hover:text-muted"
					onClick={onToggle}
				>
					<PanelCaret dir={open ? "left" : "right"} className="h-3.5 w-2.5" />
				</button>
			</div>
			{open ? (
				<div className="min-h-0 flex-1 overflow-hidden py-2">
					{pages.map((page) => (
						<PageBlock key={page.name} page={page} onOpenPage={onOpenPage} hold={hold} />
					))}
				</div>
			) : null}
			{/* the last rung. It is the head alone: a strip has no rows, so there is
			    nothing with a shape for the grip to lie along */}
			<AnimatePresence>
				{strip && hold !== null && hold !== undefined ? <StripHold key="strip" hand={hold.hand} /> : null}
			</AnimatePresence>
		</aside>
	);
}

function PageBlock({
	page,
	onOpenPage,
	hold,
}: {
	page: RosterPage;
	onOpenPage?: ((page: string) => void) | undefined;
	hold: RailHold | null | undefined;
}) {
	const onRow = hold !== null && hold !== undefined && hold.page === page.name && hold.frame === null;
	return (
		<div>
			<button
				type="button"
				onClick={onOpenPage === undefined ? undefined : () => onOpenPage(page.name)}
				className={cn(
					"group relative flex h-8 w-full items-center pr-1.5 text-left",
					page.active === true ? "bg-surface" : "hover:bg-surface/60",
				)}
			>
				{page.active === true ? (
					<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
				) : null}
				<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
					<ChevronIcon open={page.open === true} className="h-2.5 w-2.5" />
				</span>
				<span className="flex h-8 min-w-0 flex-1 items-center gap-2 text-left">
					<FolderIcon
						className={cn("h-3.5 w-3.5 shrink-0", page.active === true ? "text-thread" : "text-muted")}
					/>
					<span
						className={cn(
							"min-w-0 flex-1 truncate font-mono text-sm leading-sm",
							page.active === true ? "text-text" : "text-muted",
						)}
					>
						{page.name}
					</span>
				</span>
				{/* the page's row names the page and not the frame, so the chip carries the
				    frame back — the fall must not cost you which frame */}
				{onRow && hold !== null && hold !== undefined ? <RowChip text={chipOf(hold.hand, false)} /> : null}
				<AnimatePresence>
					{onRow && hold !== null && hold !== undefined ? (
						<RowHold
							key="hold"
							hand={hold.hand}
							height={PAGE_ROW_H}
							gutter={PAGE_GUTTER}
							className="mr-1.5"
						/>
					) : null}
				</AnimatePresence>
				<span className="font-mono text-2xs text-muted/60 leading-3">{page.frames.length}</span>
			</button>
			{page.open === true ? (
				<div className="relative pb-0.5">
					<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
					{page.frames.map((frame) => {
						const onFrame = hold !== null && hold !== undefined && hold.frame === frame;
						return (
							<div key={frame} className="relative flex h-7 items-center">
								<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
								<span className="min-w-0 truncate pl-[34px] font-mono text-muted text-sm leading-sm">
									{frame}
								</span>
								<span className="min-w-0 flex-1" />
								{onFrame && hold !== null && hold !== undefined ? (
									<RowChip text={chipOf(hold.hand, true)} />
								) : null}
								<AnimatePresence>
									{onFrame && hold !== null && hold !== undefined ? (
										<RowHold
											key="hold"
											hand={hold.hand}
											height={FRAME_ROW_H}
											gutter={FRAME_GUTTER}
											className="mr-2"
										/>
									) : null}
								</AnimatePresence>
							</div>
						);
					})}
				</div>
			) : null}
		</div>
	);
}

const TOOLS = [
	{ id: "select", label: "select", key: "V", Icon: SelectIcon },
	{ id: "hand", label: "hand", key: "H", Icon: HandIcon },
] as const;

function CanvasTools({ tool }: { tool: "select" | "hand" | "none" }) {
	if (tool === "none") return null;
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<div
				role="toolbar"
				aria-label="canvas tools"
				className="flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur"
			>
				{TOOLS.map((meta) => (
					<span
						key={meta.id}
						aria-label={meta.label}
						className={cn(
							"flex h-9 w-9 items-center justify-center rounded-md",
							tool === meta.id ? "bg-raised text-text" : "text-muted",
						)}
					>
						<meta.Icon className="h-[18px] w-[18px]" />
					</span>
				))}
			</div>
		</div>
	);
}
