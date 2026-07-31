import type { ReactNode } from "react";
import { WARNED, CAPTURED_NOW } from "../lib/agent-limit";
import { CAPTURED } from "../lib/agent-model";
import { ELSEWHERE } from "../lib/agent-threads";
import { cn } from "../lib/utils";
import { CoffeeScreen } from "./coffee-screens";
import { RailTabs } from "./spool-canvas-chrome";
import { SpoolEmptyScreen } from "./spool-empty-screen";
import {
	AgentIcon,
	BackIcon,
	CheckIcon,
	CloseIcon,
	ConnectionsIcon,
	CursorIcon,
	DotsIcon,
	ExpandIcon,
	FolderIcon,
	HandIcon,
	HintIcon,
	InspectorIcon,
	MotionIcon,
	PlayIcon,
	PlusIcon,
	RestartIcon,
	SearchIcon,
	SelectIcon,
	ThreadIcon,
} from "./spool-icons";
import { KaffeHome } from "./kaffe-home";
import { LimitLine } from "./spool-limit";
import { SpoolMark } from "./spool-mark";
import { ModelLine } from "./spool-model-control";
import { StateMark } from "./spool-play-rail";
import { PillButton } from "./spool-player-stage";
import { Caret } from "./spool-say";
import { SpoolShell } from "./spool-shell";
import { ThreadMark } from "./spool-thread-mark";
import { ThreadStrip } from "./spool-thread-strip";
import { BrokenGlyph, OffPageGlyph } from "./spool-walk-marks";

/**
 * What the components page is made of, so three takes on it can argue about
 * layout rather than about content (#189).
 *
 * The registry below is this project's real `shared/ui/`: fifty-four files, the
 * component count read off each one, and sixteen authored examples that render
 * live. Nothing here is a placeholder — a specimen is the component itself,
 * built with the props a demo file would hand it, so a card that looks wrong is
 * a component that is wrong.
 *
 * A demo is a sibling of the component it shows, `spool-mark.demo.tsx` beside
 * `spool-mark.tsx`, on the same rule frames already live by: writing the file is
 * the whole registration. A file with no sibling has nothing to render and is
 * listed rather than drawn, which is the state thirty-nine of these are in and the
 * state every library starts in.
 *
 * **Building it found one thing, which is the argument for the page.** A live
 * gallery runs every specimen's mount effects, and `ThreadStrip` calls
 * `scrollIntoView` on the open thread with no guard (`spool-thread-strip.tsx:65`).
 * That walks every scrollable ancestor, so one 34px specimen scrolled a whole
 * gallery to itself the first time it was drawn below the fold. Every layout here
 * clips with `overflow-clip` rather than `overflow-hidden` for that reason —
 * `hidden` is still a scroll container and can be scrolled programmatically,
 * `clip` is not one at all. A components page is where a component that reaches
 * outside itself gets caught, and this one was caught by existing.
 */

/* ---------- the marking ---------- */

/**
 * What the components page wears where a page wears a folder.
 *
 * Two boxes, one behind the other, at the folder's own 14px and the folder's own
 * stroke: a component is the thing that is in more than one place at once, and
 * the back box is the second place. It takes no accent — the rail's one red is
 * the page you are standing on, and this row is a page like the rest.
 */
export function ComponentFace({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={cn("h-3.5 w-3.5", className)} fill="none" aria-hidden="true">
			<rect x="4.75" y="1.75" width="7.5" height="7.5" rx="1.6" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.45" />
			<rect x="1.75" y="4.75" width="7.5" height="7.5" rx="1.6" stroke="currentColor" strokeWidth="1.2" fill="var(--color-bg)" />
		</svg>
	);
}

/* ---------- the folder, read ---------- */

export interface LibFile {
	/** the file name without its extension, which is how spool names everything */
	readonly name: string;
	/** every component it exports, in source order */
	readonly parts: readonly string[];
}

/** `shared/ui/` as it stands, counted off disk */
export const FILES: readonly LibFile[] = [
	{ name: "coffee-empty-takes", parts: ["CartEmptyRestrained", "CartEmptyReorder", "CartEmptyExpressive"] },
	{ name: "coffee-screens", parts: ["CoffeeScreen"] },
	{ name: "kaffe-home", parts: ["KaffeHome"] },
	{ name: "site-canvas-still", parts: ["SiteCanvasStill"] },
	{
		name: "site-local-shell",
		parts: ["CopyCommand", "PortLink", "ThreadNode", "ProbeDrop", "DoorPlate", "SiteLocalShell"],
	},
	{ name: "site-section", parts: ["SiteSection"] },
	{
		name: "spool-agent-rail",
		parts: ["StateMark", "AgentRail", "CellShell", "ToolName", "ToolCell", "TaskCell", "Approval"],
	},
	{ name: "spool-agent-screen", parts: ["SpoolAgentScreen"] },
	{ name: "spool-agent-turn", parts: ["Caret", "AgentTurnRail"] },
	{ name: "spool-agent-turn-screen", parts: ["SpoolAgentTurnScreen"] },
	{ name: "spool-agent-wall", parts: ["InstallWall", "LoginStrip"] },
	{ name: "spool-alive-rail", parts: ["AliveFrame"] },
	{ name: "spool-canvas-chrome", parts: ["CanvasChrome", "RailTabs"] },
	{ name: "spool-canvas-screen", parts: ["SpoolCanvasScreen"] },
	{ name: "spool-components", parts: ["ComponentFace", "Specimen", "Slot"] },
	{ name: "spool-deck-app", parts: ["DeckApp"] },
	{ name: "spool-deck-shell", parts: ["DeckShell", "ProjectTabs", "CaseStrip"] },
	{ name: "spool-edge-rail", parts: ["EdgeFrame"] },
	{ name: "spool-empty-screen", parts: ["SpoolEmptyScreen"] },
	{ name: "spool-find-palette", parts: ["FindPalette"] },
	{ name: "spool-find-screen", parts: ["SpoolFindScreen"] },
	{ name: "spool-home-screen", parts: ["SpoolHomeScreen"] },
	{
		name: "spool-icons",
		parts: [
			"PlayIcon",
			"PlusIcon",
			"BackIcon",
			"RestartIcon",
			"MotionIcon",
			"CloseIcon",
			"CheckIcon",
			"ThreadIcon",
			"AgentIcon",
			"ConnectionsIcon",
			"InspectorIcon",
			"ExpandIcon",
			"CompressIcon",
			"HintIcon",
			"CursorIcon",
			"SelectIcon",
			"HandIcon",
			"DotsIcon",
			"SearchIcon",
			"FolderIcon",
			"ChevronIcon",
			"PanelCaret",
		],
	},
	{ name: "spool-lightbox", parts: ["Lightbox"] },
	{ name: "spool-limit", parts: ["LimitLine", "LimitStrip"] },
	{ name: "spool-many-rail", parts: ["ManyRail"] },
	{ name: "spool-many-readout", parts: ["ManyReadout"] },
	{ name: "spool-mark", parts: ["SpoolMark"] },
	{ name: "spool-model-control", parts: ["ModelLine", "ModelMenu", "ModelAxes"] },
	{ name: "spool-play-field", parts: ["FrameThumb", "PlayField"] },
	{ name: "spool-play-rail", parts: ["StateMark", "PlayRail", "PlanStrip"] },
	{ name: "spool-player-stage", parts: ["PlayerStage", "TickFrame", "PillButton"] },
	{ name: "spool-pulse-rail", parts: ["PulseFrame"] },
	{ name: "spool-quiet-rail", parts: ["QuietFrame"] },
	{
		name: "spool-rail-nav",
		parts: ["AgentOrbit", "NavCell", "NavRow", "HostRow", "RailColumn", "ConnectionsBody", "PaneBack"],
	},
	{ name: "spool-ribbon-mark", parts: ["StrandStack", "MaskedMark", "SpunMark"] },
	{ name: "spool-ribbon-rail", parts: ["RibbonFrame"] },
	{ name: "spool-rich-say", parts: ["RichCaret", "RichSaid"] },
	{
		name: "spool-rich-sheet",
		parts: ["RichSheet", "RichHead", "RichNote", "RailColumn", "StreamWalk", "WalkTable"],
	},
	{ name: "spool-rich-take", parts: ["RichTake"] },
	{ name: "spool-say", parts: ["Caret", "Said"] },
	{ name: "spool-shell", parts: ["SpoolShell"] },
	{ name: "spool-spun-rail", parts: ["SpunFrame"] },
	{ name: "spool-system", parts: ["SpoolSystem"] },
	{ name: "spool-think-field", parts: ["ThinkField"] },
	{ name: "spool-think-rail", parts: ["ThinkFrame", "ThinkRail", "ThinkReadout"] },
	{ name: "spool-thread-mark", parts: ["ThreadMark"] },
	{ name: "spool-thread-strip", parts: ["ThreadStrip"] },
	{ name: "spool-wait-rail", parts: ["ShimmerWord", "WaitFrame"] },
	{ name: "spool-walk-ghosts", parts: ["GhostWindow"] },
	{ name: "spool-walk-lens", parts: ["WalkLensWindow"] },
	{
		name: "spool-walk-marks",
		parts: ["OffPageGlyph", "BrokenGlyph", "WalkMark", "WalkSheet", "WalkCanvas", "MarkWindow"],
	},
	{ name: "spool-wisp-marks", parts: ["WispMark"] },
	{ name: "spool-wisp-rail", parts: ["WispFrame"] },
];

/* ---------- the examples ---------- */

export interface Demo {
	/** the file the demo sits beside */
	readonly file: string;
	/** the component the example is of */
	readonly of: string;
	/** what this example of it is, in the demo file's own words */
	readonly example: string;
	/** what the specimen measures at true size, so a layout can decide about scale */
	readonly w: number;
	readonly h: number;
	readonly render: () => ReactNode;
}

const ICON_SET = [
	PlayIcon,
	PlusIcon,
	BackIcon,
	RestartIcon,
	MotionIcon,
	CloseIcon,
	CheckIcon,
	ThreadIcon,
	AgentIcon,
	ConnectionsIcon,
	InspectorIcon,
	ExpandIcon,
	HintIcon,
	CursorIcon,
	SelectIcon,
	HandIcon,
	DotsIcon,
	SearchIcon,
	FolderIcon,
];

export const DEMOS: readonly Demo[] = [
	{
		file: "spool-mark",
		of: "SpoolMark",
		example: "thread",
		w: 34,
		h: 42,
		render: () => <SpoolMark className="h-[42px] w-[34px] text-thread" />,
	},
	{
		file: "spool-icons",
		of: "the set",
		example: "nineteen at 16px",
		w: 208,
		h: 72,
		render: () => (
			<div className="flex w-[208px] flex-wrap gap-3 text-muted">
				{ICON_SET.map((Icon, index) => (
					<Icon key={index} className="h-4 w-4" />
				))}
			</div>
		),
	},
	{
		file: "spool-thread-mark",
		of: "ThreadMark",
		example: "three lives",
		w: 78,
		h: 14,
		render: () => (
			<div className="flex items-center gap-4">
				<ThreadMark life="unread" />
				<ThreadMark life="running" />
				<ThreadMark life="waiting" />
			</div>
		),
	},
	{
		file: "spool-play-rail",
		of: "StateMark",
		example: "five row states",
		w: 134,
		h: 14,
		render: () => (
			<div className="flex items-center gap-4">
				<StateMark state="pending" />
				<StateMark state="running" />
				<StateMark state="done" />
				<StateMark state="failed" />
				<StateMark state="stopped" />
			</div>
		),
	},
	{
		file: "spool-walk-marks",
		of: "OffPageGlyph",
		example: "and broken",
		w: 52,
		h: 16,
		render: () => (
			<div className="flex items-center gap-5 text-muted">
				<OffPageGlyph className="h-4 w-4" />
				<BrokenGlyph className="h-4 w-4" />
			</div>
		),
	},
	{
		file: "spool-say",
		of: "Caret",
		example: "the live edge",
		w: 8,
		h: 16,
		render: () => (
			<span className="font-mono text-base leading-base">
				<Caret />
			</span>
		),
	},
	{
		file: "spool-player-stage",
		of: "PillButton",
		example: "back",
		w: 28,
		h: 28,
		render: () => (
			<PillButton label="Back">
				<BackIcon className="h-4 w-4" />
			</PillButton>
		),
	},
	{
		file: "spool-model-control",
		of: "ModelLine",
		example: "as captured",
		w: 148,
		h: 12,
		render: () => <ModelLine state={CAPTURED} models={undefined} />,
	},
	{
		file: "spool-limit",
		of: "LimitLine",
		example: "warned",
		w: 168,
		h: 12,
		render: () => <LimitLine info={WARNED} now={CAPTURED_NOW} />,
	},
	{
		file: "spool-canvas-chrome",
		of: "RailTabs",
		example: "elements",
		w: 300,
		h: 44,
		render: () => (
			<div className="w-[300px] border border-border bg-bg">
				<RailTabs tabs={["elements", "connections"]} active="elements" />
			</div>
		),
	},
	{
		file: "spool-thread-strip",
		of: "ThreadStrip",
		example: "three elsewhere",
		w: 392,
		h: 34,
		render: () => (
			<div className="w-[392px] border border-border bg-bg">
				<ThreadStrip threads={ELSEWHERE} open="home" onOpen={() => undefined} />
			</div>
		),
	},
	{
		file: "spool-shell",
		of: "SpoolShell",
		example: "the bar, cropped",
		w: 640,
		h: 44,
		render: () => (
			<div className="h-11 w-[640px] overflow-hidden border border-border">
				<div className="h-[300px] w-[640px]">
					<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="72%">
						<span />
					</SpoolShell>
				</div>
			</div>
		),
	},
	{
		file: "coffee-screens",
		of: "CoffeeScreen",
		example: "menu",
		w: 240,
		h: 460,
		render: () => (
			<div className="h-[460px] w-[240px]">
				<CoffeeScreen screen="menu" />
			</div>
		),
	},
	{
		file: "coffee-screens",
		of: "CoffeeScreen",
		example: "receipt",
		w: 240,
		h: 460,
		render: () => (
			<div className="h-[460px] w-[240px]">
				<CoffeeScreen screen="receipt" />
			</div>
		),
	},
	{
		file: "kaffe-home",
		of: "KaffeHome",
		example: "default",
		w: 240,
		h: 400,
		render: () => (
			<div className="h-[400px] w-[240px]">
				<KaffeHome />
			</div>
		),
	},
	{
		file: "spool-empty-screen",
		of: "SpoolEmptyScreen",
		example: "no frames yet",
		w: 1440,
		h: 900,
		render: () => (
			<div className="h-[900px] w-[1440px] overflow-hidden border border-border">
				<SpoolEmptyScreen />
			</div>
		),
	},
];

/* ---------- what falls out of the two lists ---------- */

const DEMO_FILES = new Set(DEMOS.map((demo) => demo.file));

/** the files with a sibling demo, in folder order */
export const SHOWN: readonly LibFile[] = FILES.filter((file) => DEMO_FILES.has(file.name));

/** the files with nothing to render: listed, never drawn */
export const BARE: readonly LibFile[] = FILES.filter((file) => !DEMO_FILES.has(file.name));

export const PARTS = FILES.reduce((total, file) => total + file.parts.length, 0);

export function demosOf(file: string): readonly Demo[] {
	return DEMOS.filter((demo) => demo.file === file);
}

/* ---------- drawing one ---------- */

/**
 * A specimen at true size where it fits, and scaled where it does not.
 *
 * A component library is not one size. `Caret` is 8px wide and
 * `SpoolEmptyScreen` is 1440, and a gallery that normalises them is lying about
 * both. So the box is fixed and the thing inside it keeps its own proportions,
 * with the scale said out loud in the same mono the canvas says its zoom in —
 * a specimen you are reading at 17% is a fact worth having.
 */
export function fitScale(demo: Demo, box: number, tall: number): number {
	return Math.min(1, box / demo.w, tall / demo.h);
}

export function Specimen({
	demo,
	box,
	tall,
	readout = "over",
	className,
}: {
	demo: Demo;
	/** the width the specimen has to live in */
	box: number;
	/** the height it has to live in */
	tall: number;
	/**
	 * Where the scale goes. `over` is the corner of the well; `off` is for a layout
	 * that has somewhere better to put it, which every layout with a caption does —
	 * a specimen that is itself a piece of chrome already has a readout in that
	 * corner, and two of them stack into one unreadable number.
	 */
	readout?: "over" | "off" | undefined;
	className?: string | undefined;
}) {
	const scale = fitScale(demo, box, tall);
	return (
		<div className={cn("relative flex items-center justify-center overflow-clip", className)} style={{ height: tall }}>
			<div
				style={{
					width: demo.w,
					height: demo.h,
					transform: scale === 1 ? undefined : `scale(${scale})`,
					transformOrigin: "center",
				}}
			>
				{demo.render()}
			</div>
			{scale === 1 || readout === "off" ? null : (
				<span className="absolute right-2 bottom-1.5 font-mono text-2xs text-muted/45 leading-3">
					{Math.round(scale * 100)}%
				</span>
			)}
		</div>
	);
}

/**
 * The place a specimen would be if the file had a demo beside it.
 *
 * A dashed hairline rather than a solid one, because the only other dashed line
 * in this product means *might* — a walk the source cannot promise — and a slot
 * is the same tense: a component that might be drawn, once somebody writes the
 * one file it needs.
 */
export function Slot({ file, width, tall }: { file: string; width?: number | undefined; tall: number }) {
	return (
		<div
			className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-border-raised/70 border-dashed px-3"
			style={{ width, height: tall }}
		>
			<span className="max-w-full truncate font-mono text-sm text-muted/45 leading-sm">no demo</span>
			{/* the empty state says the one file that fills it, at the place it would fill */}
			<span className="max-w-full truncate font-mono text-2xs text-muted/25 leading-3">{file}.demo.tsx</span>
		</div>
	);
}
