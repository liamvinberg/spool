import type { ReactNode } from "react";
import type { Life } from "shared/lib/spool/agent-threads";
import { cn } from "shared/lib/utils";
import { type CanvasTool, CanvasTools } from "shared/ui/spool/canvas-tools";
import { AgentIcon, ChevronIcon, FolderIcon, FrameIcon, PanelCaret, PropertiesIcon } from "shared/ui/spool/icons";
import { NumField, Row, Section, VALUE } from "shared/ui/spool/properties-fields";
import { ThreadMark } from "shared/ui/spool/thread-mark";
import { type Mark, UnseenMark } from "shared/ui/spool/unseen-mark";

/**
 * The canvas chrome as it ships: the pages rail on the left, the viewport
 * between, and the dock on the right (#268) — a 44px strip that is the
 * column's index, and one panel standing beside it at its own width: 300 for
 * properties, 420 for the agent. The strip never moves; pressing the lit glyph
 * shuts the column to the strip alone.
 *
 * The viewport is a slot — whatever frames the specimen wants to show go in as
 * children, positioned against it. The panel is a slot too: a proposal hands in
 * its own rail and says which glyph it stands behind; nothing handed in draws
 * the properties rail with the selected frame and no element held, which is
 * what the column shows by default.
 */

const PAGES_W = 248;
const STRIP_W = 44;
const PROPERTIES_W = 300;

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
}

export function CanvasChrome({
	pages,
	selected,
	tool = "select",
	rail,
	railWidth = PROPERTIES_W,
	railLabel = "properties",
	life,
	targets,
	children,
}: {
	pages: readonly PageRow[];
	/** the selected frame, as both rails show it; nothing selected is a real state */
	selected?: string | undefined;
	/** `none` draws no tool bar at all, for a surface with nothing to point at (#189) */
	tool?: CanvasTool | "none" | undefined;
	/**
	 * What stands in the dock's panel. Absent draws the shipped properties rail;
	 * `null` shuts the column to the strip. A proposal's rail is drawn at
	 * `railWidth` behind the glyph `railLabel` names.
	 */
	rail?: ReactNode | undefined;
	/** the panel's width; properties is 300, the agent is 420, and 0 shuts the column */
	railWidth?: number | undefined;
	/** which glyph the panel stands behind: `agent` lights the agent, anything else lights properties */
	railLabel?: string | undefined;
	/** what the agent glyph says while the agent surface is shut */
	life?: Life | undefined;
	/** where the selected frame's walks land, drawn in the tree rather than in a rail (#144) */
	targets?: readonly Target[] | undefined;
	children?: ReactNode;
}) {
	const shut = rail === null || railWidth === 0;
	const lit: DockSurface | null = shut ? null : railLabel.toLowerCase() === "agent" ? "agent" : "properties";
	return (
		<div className="flex h-full w-full overflow-hidden bg-bg">
			<PagesRail pages={pages} selected={selected} targets={targets} />
			<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
				{children}
				{tool === "none" ? null : <CanvasTools tool={tool} />}
			</div>
			<Dock lit={lit} width={shut ? 0 : rail === undefined ? PROPERTIES_W : railWidth} life={life}>
				{rail === undefined ? <FrameHeld name={selected} /> : rail}
			</Dock>
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
				{page.open === true || page.unseen === undefined ? null : <PageMark unseen={page.unseen} />}
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
								{/* contentX(1) in `rail-rows.ts`: one indent step of 10, off the 24 margin */}
								<span className="flex min-w-0 flex-1 items-center gap-2 pl-[34px]">
									<FrameIcon
										className={cn("h-3.5 w-3.5 shrink-0", frame === selected ? "text-thread" : "text-muted")}
									/>
									<span
										className={cn(
											"min-w-0 flex-1 truncate font-mono text-xs leading-xs",
											frame === selected || page.unseen?.[frame] !== undefined
												? "text-text"
												: target === undefined
													? "text-muted"
													: "text-text/85",
										)}
									>
										{frame}
									</span>
								</span>
									<FrameMark mark={page.unseen?.[frame]} className="ml-auto" />
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

/**
 * What a shut page shows of the unseen inside it: the louder of the two, or the
 * 14px it would have taken, so the counts down the rail stay in one column.
 */
function PageMark({ unseen }: { unseen: Readonly<Record<string, Mark>> }) {
	const marks = Object.values(unseen);
	const loudest = marks.includes("new") ? "new" : marks.length > 0 ? "changed" : undefined;
	return <FrameMark mark={loudest} className="mr-0.5" />;
}

/** one row's mark, or the space it would take: a name never moves when one arrives */
function FrameMark({ mark, className }: { mark: Mark | undefined; className?: string | undefined }) {
	if (mark === undefined) return <span aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", className)} />;
	return <UnseenMark mark={mark} className={className} />;
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

type DockSurface = "properties" | "agent";

const AXES = [
	{ key: "x", of: "position" },
	{ key: "y", of: "position" },
	{ key: "w", of: "size" },
	{ key: "h", of: "size" },
] as const;

const FRAME_GEOMETRY = { x: 325, y: 170, w: 390, h: 844 } as const;

/**
 * The properties rail (#256) as the column shows it by default: the selected
 * frame in the crumbs, and its geometry, which is what frame.json owns. Nothing
 * selected says so and stops.
 */
function FrameHeld({ name }: { name?: string | undefined }) {
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<div className="flex h-9 shrink-0 items-center border-border border-b px-2.5">
				<span className={cn(name === undefined ? "text-muted/50" : "text-text", VALUE)}>
					{name ?? "no selection"}
				</span>
			</div>
			{name === undefined ? (
				<div className="flex h-9 items-center px-2.5">
					<span className={cn("text-muted/50", VALUE)}>select a frame</span>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto [&>div:first-child]:border-t-0">
					{(["position", "size"] as const).map((section) => (
						<Section key={section} name={section} reason="frame.json">
							{AXES.filter((axis) => axis.of === section).map((axis) => (
								<Row key={axis.key} name={axis.key}>
									<NumField value={String(FRAME_GEOMETRY[axis.key])} readout="px" ok onCommit={() => {}} />
								</Row>
							))}
						</Section>
					))}
				</div>
			)}
		</div>
	);
}

/**
 * The right column (#268): one panel and the strip that indexes it.
 *
 * The panel's edge is the only thing that moves, 300ms on the house curve, and
 * whatever stands in it is laid out at the width it will settle at and clipped,
 * so a rail never re-lays on its way in. The strip is 44 and always there.
 */
function Dock({
	lit,
	width,
	life,
	children,
}: {
	lit: DockSurface | null;
	width: number;
	life?: Life | undefined;
	children: ReactNode;
}) {
	return (
		<aside aria-label="Dock" data-dock="" className="relative z-20 flex h-full shrink-0">
			<div
				data-dock-panel=""
				className="relative h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
				style={{ width }}
			>
				{lit === null ? null : (
					<div
						aria-label={lit}
						className="absolute inset-y-0 right-0 flex flex-col border-border border-l bg-bg"
						style={{ width }}
					>
						{children}
					</div>
				)}
			</div>
			<div
				data-dock-strip=""
				className="flex h-full shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-1.5"
				style={{ width: STRIP_W }}
			>
				<Glyph label="properties" lit={lit === "properties"}>
					<PropertiesIcon className="h-4 w-4" />
				</Glyph>
				<Glyph label="agent" lit={lit === "agent"} life={life}>
					<AgentIcon className="h-4 w-4" />
				</Glyph>
			</div>
		</aside>
	);
}

/**
 * One surface, as the index draws it: colour in 140ms on the house curve, the
 * glyph gives under the finger. A shut agent with something to say says it
 * here — a turning ring while a turn runs, one dot after it lands unread. The
 * dot grows in and then holds still; nothing pulses.
 */
function Glyph({
	label,
	lit,
	life,
	children,
}: {
	label: DockSurface;
	lit: boolean;
	life?: Life | undefined;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			// a project may hold a page called `agent`, and the pages rail labels its
			// row's chevron "Expand agent" too, so the glyph carries a hook of its own
			data-dock-glyph={label}
			aria-label={`${lit ? "Shut" : "Expand"} ${label}`}
			aria-pressed={lit}
			className={cn(
				"relative flex h-8 w-8 items-center justify-center rounded-sm transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-90 motion-reduce:transition-none",
				lit ? "bg-raised text-text" : "text-muted/70 hover:text-text",
			)}
		>
			{children}
			{lit || life === undefined ? null : life === "running" || life === "streaming" ? (
				<svg
					viewBox="0 0 14 14"
					aria-hidden="true"
					fill="none"
					className="-right-1 absolute top-0 h-3 w-3 animate-agent-spin text-text/60"
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
				</svg>
			) : life === "unread" ? (
				<span
					aria-hidden="true"
					className="-right-0.5 absolute top-0.5 h-1.5 w-1.5 animate-unseen-in rounded-full bg-thread"
				/>
			) : null}
		</button>
	);
}
