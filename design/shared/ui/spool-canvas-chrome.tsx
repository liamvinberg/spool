import type { ReactNode } from "react";
import type { Life } from "../lib/agent-threads";
import type { Mark } from "../lib/unseen-model";
import { cn } from "../lib/utils";
import { ChevronIcon, FolderIcon, HandIcon, PanelCaret, SelectIcon } from "./spool-icons";
import { ThreadMark } from "./spool-thread-mark";
import { UnseenMark } from "./spool-unseen-mark";

/**
 * The canvas chrome: the Pages rail on the left, the viewport between, the
 * Inspector rail on the right, and the tool bar floating over the bottom of
 * the viewport. Both rails collapse to a 44px strip; the widths here are the
 * shipped ones (248 pages, 300 inspector).
 *
 * The viewport is a slot — whatever frames the specimen wants to show go in as
 * children, positioned against it.
 */

const PAGES_W = 248;
const INSPECTOR_W = 300;

export interface PageRow {
	name: string;
	frames: readonly string[];
	/** the page whose canvas is on screen — one thread-coloured spine */
	active?: boolean;
	open?: boolean;
	/**
	 * A conversation lives on this page and is doing something you cannot see: it
	 * turns while it runs, and settles to a dot once it has finished unread. Absent
	 * unless a proposal puts agent state out here.
	 */
	mark?: Life | undefined;
	/** paired with something outside this rail that is pointing at the same page */
	lit?: boolean | undefined;
	/**
	 * What stands in the folder's slot. A page spool projects out of what the
	 * project holds is not a folder of frames, so it does not wear a folder (#189).
	 */
	face?: ReactNode | undefined;
	/** a hairline under the row, for a row that is not part of the list below it */
	ruled?: boolean | undefined;
	/** docked against the bottom of the rail instead of listed with the pages */
	foot?: boolean | undefined;
	/**
	 * Frames on this page nobody has looked at yet, by name. Collapsed, the row
	 * says only *that* something on it is unseen — the same restraint the walk
	 * tick keeps, because two numbers side by side read as one wrong number.
	 * Absent unless a proposal puts seen-state out here.
	 */
	unseen?: Readonly<Record<string, Mark>> | undefined;
	/** marks the whole page seen from the row, for a rule that never clears by itself */
	onSeen?: (() => void) | undefined;
}

export function CanvasChrome({
	pages,
	selected,
	inspector = "elements",
	tool = "select",
	rail,
	railWidth = INSPECTOR_W,
	railLabel = "Inspector",
	targets,
	children,
}: {
	pages: readonly PageRow[];
	/** the selected frame, as both rails show it; nothing selected is a real state */
	selected?: string | undefined;
	inspector?: "elements" | "connections" | undefined;
	/** `none` draws no tool bar at all, for a surface with nothing to point at (#189) */
	tool?: "select" | "hand" | "none" | undefined;
	/** an exploration's own right rail, taking the inspector's place — proposals only */
	rail?: ReactNode | undefined;
	/** the right rail's width; the shipped inspector is 300, and 0 draws no rail at all */
	railWidth?: number | undefined;
	/** what the rail slot announces itself as; a proposal rail is not the inspector */
	railLabel?: string | undefined;
	/** where the selected frame's walks land, drawn in the tree rather than in a rail (#144) */
	targets?: readonly Target[] | undefined;
	children?: ReactNode;
}) {
	return (
		<div className="flex h-full w-full overflow-hidden bg-bg">
			<PagesRail pages={pages} selected={selected} targets={targets} />
			<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
				{children}
				<CanvasTools tool={tool} />
			</div>
			{rail === undefined ? (
				<InspectorRail mode={inspector} selected={selected} />
			) : railWidth === 0 ? null : (
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

/**
 * One destination of the selected frame, drawn where the frame itself is listed.
 *
 * `connections.ts` groups a frame's walks by the page they land on, and this rail is
 * already that grouping — every frame, under its page. A `might` edge is faint out on
 * the canvas and faint here; a name nothing answers to has no row to draw at all, so
 * it lands on the page group as a count of what is broken.
 */
export interface Target {
	readonly frame: string;
	readonly certainty: "will" | "might";
}

function PagesRail({
	pages,
	selected,
	targets = [],
}: {
	pages: readonly PageRow[];
	selected?: string | undefined;
	targets?: readonly Target[] | undefined;
}) {
	const reached = new Map(targets.map((target) => [target.frame, target]));
	const listed = pages.filter((page) => page.foot !== true);
	const footed = pages.filter((page) => page.foot === true);
	return (
		<aside className="flex shrink-0 flex-col border-border border-r bg-bg" style={{ width: PAGES_W }}>
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
				<div className="flex items-baseline gap-2">
					<h1 className="font-semibold text-base leading-base">Pages</h1>
					<span className="font-mono text-muted text-xs leading-xs">{pages.length}</span>
				</div>
				<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
					<PanelCaret dir="left" className="h-3.5 w-2.5" />
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden py-2">
				{listed.map((page) => (
					<PageBlock key={page.name} page={page} selected={selected} reached={reached} />
				))}
			</div>
			{footed.length === 0 ? null : (
				<div className="shrink-0 border-border border-t py-2">
					{footed.map((page) => (
						<PageBlock key={page.name} page={page} selected={selected} reached={reached} />
					))}
				</div>
			)}
		</aside>
	);
}

function PageBlock({
	page,
	selected,
	reached,
}: {
	page: PageRow;
	selected?: string | undefined;
	reached: Map<string, Target>;
}) {
	return (
		<div className={cn(page.ruled === true && "border-border border-b pb-2 mb-2")}>
			<div
				className={cn(
					"group relative flex h-8 items-center pr-1.5",
					(page.active === true || page.lit === true) && "bg-surface",
				)}
			>
				{page.active === true ? (
					<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
				) : null}
				<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
					<ChevronIcon open={page.open === true} className="h-2.5 w-2.5" />
				</span>
				<span className="flex h-8 min-w-0 flex-1 items-center gap-2 text-left">
					{page.face === undefined ? (
						<FolderIcon
							className={cn("h-3.5 w-3.5 shrink-0", page.active === true ? "text-thread" : "text-muted")}
						/>
					) : (
						<span className={cn("shrink-0", page.active === true ? "text-thread" : "text-muted")}>
							{page.face}
						</span>
					)}
					<span
						className={cn(
							"min-w-0 flex-1 truncate font-mono text-sm leading-sm",
							page.active === true ? "text-text" : "text-muted",
						)}
					>
						{page.name}
					</span>
				</span>
				{page.mark === undefined ? null : <ThreadMark life={page.mark} className="mr-1.5" />}
				{/* the same restraint one column over: collapsed, the page says that something on
				    it is unseen and nothing about how much */}
				{page.open === true || page.unseen === undefined ? null : (
					<UnseenMark mark={loudest(page.unseen)} className="mr-0.5" />
				)}
				{page.onSeen === undefined || loudest(page.unseen) === null ? null : (
					<button
						type="button"
						onClick={page.onSeen}
						className="mr-2 cursor-pointer font-mono text-2xs text-muted leading-3 opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
					>
						seen
					</button>
				)}
				{/* a collapsed page says only *that* it is walked to: how many is one row of
				    grey away, and two numbers side by side read as one wrong number */}
				{page.open === true || !page.frames.some((frame) => reached.has(frame)) ? null : (
					<WalkTick className="mr-2 h-2 w-2.5 text-thread" />
				)}
				<span className="font-mono text-2xs text-muted/60 leading-3">{page.frames.length}</span>
			</div>
			{page.open === true ? (
				<div className="relative pb-0.5">
					<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
					{page.frames.map((frame) => {
						const target = reached.get(frame);
						return (
							<div
								key={frame}
								className={cn("relative flex h-7 items-center", frame === selected && "bg-surface")}
							>
								<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
								<span
									className={cn(
										"min-w-0 truncate pl-[34px] font-mono text-sm leading-sm",
										frame === selected || page.unseen?.[frame] !== undefined
											? "text-text"
											: target === undefined
												? "text-muted"
												: "text-text/85",
									)}
								>
									{frame}
								</span>
									{page.unseen === undefined ? null : (
										<UnseenMark mark={page.unseen[frame] ?? null} className="ml-auto" />
									)}
								{target === undefined ? null : (
									<WalkTick
										className={cn(
											"mr-2 ml-auto h-2 w-2.5 shrink-0 text-thread",
											target.certainty === "might" && "opacity-45",
										)}
									/>
								)}
							</div>
						);
					})}
				</div>
			) : null}
		</div>
	);
}

/** what a collapsed page shows of the unseen inside it: the louder of the two, or nothing */
function loudest(unseen: Readonly<Record<string, Mark>> | undefined): Mark | null {
	if (unseen === undefined) return null;
	const marks = Object.values(unseen);
	if (marks.includes("new")) return "new";
	return marks.length > 0 ? "changed" : null;
}

/** the arrow a walked-to frame wears in the tree: the canvas's own edge, one row long */
function WalkTick({ className }: { className?: string | undefined }) {
	return (
		<svg viewBox="0 0 10 8" className={className} fill="none" aria-hidden="true">
			<path d="M0.5 4h6" stroke="currentColor" strokeWidth="1.5" />
			<path d="m9.5 4-3-1.8v3.6Z" fill="currentColor" />
		</svg>
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

/**
 * The right rail's tab strip. Two tabs as it shipped; a proposal that adds a
 * tab passes its own list, and the strip stays the same strip.
 */
export function RailTabs({ tabs, active }: { tabs: readonly string[]; active: string }) {
	return (
		<div className="flex h-11 shrink-0 items-stretch justify-between border-border border-b pr-2 pl-4">
			<div className="flex h-full items-stretch gap-5">
				{tabs.map((candidate) => (
					<span
						key={candidate}
						className={cn(
							"relative flex h-full items-center font-mono text-xs leading-xs",
							active === candidate ? "text-text" : "text-muted/60",
						)}
					>
						{candidate}
						{active === candidate ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-thread" /> : null}
					</span>
				))}
			</div>
			<span className="flex h-11 w-7 shrink-0 items-center justify-center text-muted/60">
				<PanelCaret dir="right" className="h-3.5 w-2.5" />
			</span>
		</div>
	);
}

function InspectorRail({ mode, selected }: { mode: "elements" | "connections"; selected?: string | undefined }) {
	return (
		<aside
			aria-label="Inspector"
			className="flex shrink-0 flex-col border-border border-l bg-bg"
			style={{ width: INSPECTOR_W }}
		>
			<RailTabs tabs={["elements", "connections"]} active={mode} />
			{selected === undefined ? (
				<p className="px-4 pt-3 font-mono text-2xs text-muted/55 leading-4">select a frame to inspect it</p>
			) : mode === "elements" ? (
				<ElementsTab frame={selected} />
			) : (
				<ConnectionsTab frame={selected} />
			)}
		</aside>
	);
}

function Identity({ frame }: { frame: string }) {
	return (
		<div className="flex flex-col gap-1 border-border border-b px-4 py-3">
			<span className="truncate font-mono text-sm text-text leading-sm">{frame}</span>
			<span className="truncate font-mono text-2xs text-muted/60 leading-3">frames/app/{frame}/frame.tsx</span>
		</div>
	);
}

const ELEMENTS: readonly { name: string; depth: number }[] = [
	{ name: "screen", depth: 0 },
	{ name: "header", depth: 1 },
	{ name: "menu-list", depth: 1 },
	{ name: "menu-item", depth: 2 },
	{ name: "checkout-bar", depth: 1 },
];

function ElementsTab({ frame }: { frame: string }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<Identity frame={frame} />
			<div className="flex items-center justify-between px-4 pt-1 pb-1">
				<span className="font-mono text-2xs text-muted leading-3">elements</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{ELEMENTS.length}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden pb-3">
				{ELEMENTS.map((row) => (
					<div key={row.name} className="flex h-7 items-center">
						<span
							className="truncate font-mono text-sm text-muted leading-sm"
							style={{ paddingLeft: 16 + row.depth * 14 }}
						>
							{row.name}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

const CONNECTIONS: readonly { target: string; via: string }[] = [
	{ target: "cart", via: "till kassan" },
	{ target: "receipt", via: "betala" },
];

function ConnectionsTab({ frame }: { frame: string }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<Identity frame={frame} />
			<div className="flex items-center justify-between px-4 pt-1 pb-1">
				<span className="font-mono text-2xs text-muted leading-3">connections</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{CONNECTIONS.length}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden pb-3">
				{CONNECTIONS.map((row) => (
					<div key={row.target} className="flex h-7 items-center gap-2 px-4">
						<span className="h-[2px] w-2 shrink-0 bg-thread" />
						<span className="truncate font-mono text-sm text-text leading-sm">{row.target}</span>
						<span className="ml-auto truncate font-mono text-2xs text-muted/60 leading-3">{row.via}</span>
					</div>
				))}
			</div>
		</div>
	);
}
