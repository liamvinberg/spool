import { type CSSProperties, type ReactNode, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * The product imagery for site-clean--plate.
 *
 * Wherever this page shows spool, it shows spool. Every number below is read off
 * the shipped source rather than eyeballed, and where the running canvas and a
 * drawing disagreed the canvas won:
 *
 *   app bar          src/ui/app.tsx: h-11, border-b, px-4, the mark and the
 *                    wordmark at text-md, the tab strip at h-[26px], the zoom
 *                    read-out in mono at the right
 *   pages rail       src/ui/canvas/sidebar.tsx and rail-rows.ts: 248 wide,
 *                    an h-11 header, py-2 list, PAGE_ROW 32, FRAME_ROW 28,
 *                    INDENT 10, contentX = depth*10+24, guideX = (depth-1)*10+18,
 *                    an h-9 footer that says what a folder press does
 *   dock strip       src/ui/canvas/dock.tsx: STRIP_WIDTH 44, border-l, two
 *                    h-8 glyphs, properties over agent
 *   the field        src/ui/canvas/canvas.tsx: bg-canvas and nothing else.
 *                    There is no dot grid on spool's canvas, so there is none
 *                    here either
 *   a frame          rounded at shellRadius, 12px at 1:1, no border of its own
 *   the label        src/ui/canvas/frame-label.tsx: mono text-sm/leading-4,
 *                    pb-2.5, thread when selected, and the selection carries
 *                    `play` at the far end of its own row
 *   the ring         src/ui/canvas/overlays.tsx: 1.5px thread inset 3, radius
 *                    14, four 8px handles centred on its corners, and the size
 *                    chip 14px below the frame
 *   the unseen mark  src/ui/canvas/unseen-mark.tsx: white ink, a filled disc
 *                    for new, in a 14px box so the name never shifts
 *   an arrow         src/ui/canvas/flow-arrows.tsx: 1.5px thread, head 10 long
 *                    and 9 across, bow max(40, distance * 0.4)
 *
 * The other rule: red belongs to spool and nothing else. Rings, threads, labels
 * and the rail's spine carry the thread; chamfer, the product standing on the
 * canvas, brings its own greys, its own two typefaces and its own five status
 * colours. So a visitor can tell at a glance which pixels are the tool and which
 * are the thing being designed.
 *
 * Screens are drawn at the size they are shown, 1:1. Where a composition is
 * smaller than life it is one transform on a real screen, with the labels and
 * rings left at screen size because that is what the canvas does at any zoom.
 */

export const MONO = "font-mono [font-variant-ligatures:none]";

/* ---------- glyphs, verbatim from src/ui/icons.tsx and sidebar.tsx ---------- */

export function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2 1.2 8.4 5 2 8.8Z" />
		</svg>
	);
}

export function ArrowUpRight({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M3.6 8.4 8.4 3.6M4.7 3.6h3.7v3.7"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function DownloadGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
			<path
				d="M7 1.9v7.3M4 6.2 7 9.2l3-3M2.5 11.8h9"
				stroke="currentColor"
				strokeWidth="1.35"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<rect x="4.4" y="4.4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
			<path
				d="M2.7 7.6h-.45a.8.8 0 0 1-.8-.8V2.3a.8.8 0 0 1 .8-.8h4.5a.8.8 0 0 1 .8.8v.5"
				stroke="currentColor"
				strokeWidth="1.1"
				strokeLinecap="round"
			/>
		</svg>
	);
}

export function Tick({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M2.5 6.4 4.9 8.7 9.5 3.4"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function FolderIcon({ className }: { className?: string }) {
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

function FrameIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={cn("origin-center text-muted", open && "rotate-90", className)}
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

function PanelCaret({ dir, className }: { dir: "left" | "right"; className?: string }) {
	const d = dir === "left" ? "m7.5 3.5-4 4.5 4 4.5" : "m4.5 3.5 4 4.5-4 4.5";
	return (
		<svg viewBox="0 0 12 16" className={className} fill="none" aria-hidden="true">
			<path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function PlusIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" className={className} fill="none" aria-hidden="true">
			<path d="M5 .75v8.5M.75 5h8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

function FoldIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 1.5 5 4.25 8.25 1.5M1.75 8.5 5 5.75 8.25 8.5"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function EdgeIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<circle cx="4.2" cy="4.6" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<circle cx="11.8" cy="11.4" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<path d="M5.7 6.1 10.3 9.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

function PropertiesIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M5.5 2.4v3.1M5.5 9.1v4.5M10.5 2.4v6.3M10.5 12.3v1.3"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
			<circle cx="5.5" cy="7.3" r="1.5" fill="currentColor" />
			<circle cx="10.5" cy="10.5" r="1.5" fill="currentColor" />
		</svg>
	);
}

function AgentIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<circle cx="3.2" cy="5.4" r="1.15" fill="currentColor" />
			<circle cx="3.2" cy="10.6" r="1.15" fill="currentColor" />
			<path d="M6.4 5.4h7.2M6.4 10.6h4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

function SelectIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<path
				d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"
				fill="currentColor"
			/>
		</svg>
	);
}

function EditIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
			<path
				d="M12.03 12.68a.5.5 0 0 1 .65-.65l9 3.5a.5.5 0 0 1-.03.95l-3.45 1.06a1 1 0 0 0-.66.66l-1.06 3.45a.5.5 0 0 1-.95.03z"
				fill="currentColor"
			/>
			<path
				d="M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h2M14 3h1M3 9v1M21 9v2M3 14v1"
				stroke="currentColor"
				strokeWidth="1.9"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function HandIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
			<path
				d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** unseen-mark.tsx: white ink in a 14px box, a filled disc for new. */
function UnseenMark({ mark, className }: { mark: "new" | "changed"; className?: string }) {
	return (
		<span aria-hidden="true" className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
			<span
				className={cn(
					"block rounded-full",
					mark === "new" ? "h-[5px] w-[5px] bg-text/85" : "h-[7px] w-[7px] border-[1.5px] border-text/70",
				)}
			/>
		</span>
	);
}

/* ---------- chamfer: the product standing on the canvas ---------- */

/**
 * chamfer runs automations and keeps the record of what they did. It was
 * prototyped in spool, so the frames on this page are the ones that exist:
 * pt-home, pt-runs, pt-graph and pt-journal with its siblings, at the 1440 by
 * 900 every frame on that canvas measures.
 *
 * Its whole system arrives from chamfer's design/shared/tokens.css and nothing
 * is invented here: Geist and Geist Mono, six named greys in oklch, an ink
 * accent that marks only what you can press, five status colours that are a
 * closed set the accent never joins, and one chamfered corner on the one
 * primary action. Light is :root, so these panels stand white on spool's dark
 * field and each frame reads as an object without spool drawing a border round
 * it.
 *
 * The plane ladder runs the other way under light, which is the one thing a
 * reader of the dark screens has to translate: a table there rises to a lighter
 * grey, here it rises to --panel, which is white, and the rail and the table
 * head are the greys under the page rather than over it.
 *
 *   the app ground   --page      the rail          --sunk
 *   a plane          --panel     a row under you   --hover
 *   a tag, the head  --sunk      the row you took  --acc-wash
 *
 * The five status marks are chamfer's shapes, not colour alone: a hollow ring
 * queued, a dot inside a ring running, a half-filled square waiting, a filled
 * square succeeded, a ringed minus failed. Only the running dot breathes, and
 * it is the one thing on this page that moves by itself.
 */

const APP_W = 1440;
const APP_H = 900;
const ASK_W = 460;
const ASK_H = 372;

const CHAMFER_CSS = `@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap');
.chm {
	--page: oklch(0.975 0 0);
	--panel: oklch(1 0 0);
	--line: oklch(0.898 0 0);
	--line-lift: oklch(0.836 0 0);
	--t3: oklch(0.530 0 0);
	--t2: oklch(0.45 0 0);
	--t1: oklch(0.196 0 0);
	--hover: oklch(0.957 0 0);
	--sunk: oklch(0.947 0 0);
	--acc: oklch(0.165 0 0);
	--acc-hover: oklch(0.265 0 0);
	--acc-ink: oklch(0.995 0 0);
	--acc-wash: oklch(0.950 0 0);
	--st-queued: oklch(0.615 0.008 250);
	--st-running: oklch(0.518 0.172 254);
	--st-waiting: oklch(0.555 0.115 66);
	--st-succeeded: oklch(0.53 0.13 152);
	--st-failed: oklch(0.53 0.195 24);
	font-family: Geist, ui-sans-serif, system-ui, sans-serif;
}
.chm .font-mono { font-family: "Geist Mono", ui-monospace, monospace; }
@keyframes chamfer-breathe {
	0%, 100% { opacity: 1; transform: scale(1); }
	50% { opacity: 0.35; transform: scale(0.82); }
}
@media (prefers-reduced-motion: reduce) {
	@keyframes chamfer-breathe { 0%, 100% { opacity: 0.7; transform: scale(1); } }
}`;

/** One stylesheet for the whole demo product, mounted with every plate. */
function ChamferType() {
	// biome-ignore lint/security/noDangerouslySetInnerHtml: a stylesheet, written here
	return <style dangerouslySetInnerHTML={{ __html: CHAMFER_CSS }} />;
}

/* ---- the five states, as shapes ---- */

type RunState = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

const stateVar: Record<RunState, string> = {
	queued: "var(--st-queued)",
	running: "var(--st-running)",
	waiting: "var(--st-waiting)",
	succeeded: "var(--st-succeeded)",
	failed: "var(--st-failed)",
	cancelled: "var(--t3)",
};

const stateWord: Record<RunState, string> = {
	queued: "Queued",
	running: "Running",
	waiting: "Waiting on a human",
	succeeded: "Succeeded",
	failed: "Failed",
	cancelled: "Cancelled",
};

/** Coloured only when something is being asked or something stopped. */
function wordColour(state: RunState): string {
	if (state === "failed" || state === "waiting" || state === "running") return stateVar[state];
	return "var(--t3)";
}

function StateMark({ state, size = 10, live = true }: { state: RunState; size?: number; live?: boolean }) {
	const c = stateVar[state];
	const s = size;
	const mid = s / 2;
	const box = { width: s, height: s, viewBox: `0 0 ${s} ${s}` };

	if (state === "succeeded") {
		return (
			<svg {...box} aria-hidden="true" className="shrink-0">
				<rect width={s} height={s} fill={c} />
			</svg>
		);
	}
	if (state === "waiting") {
		return (
			<svg {...box} fill="none" aria-hidden="true" className="shrink-0">
				<rect x={0.5} y={0.5} width={s - 1} height={s - 1} stroke={c} strokeWidth={1} />
				<rect x={0.5} y={0.5} width={(s - 1) / 2} height={s - 1} fill={c} />
			</svg>
		);
	}
	if (state === "failed" || state === "cancelled") {
		return (
			<svg {...box} fill="none" aria-hidden="true" className="shrink-0">
				<circle cx={mid} cy={mid} r={mid - s * 0.11} stroke={c} strokeWidth={s * 0.13} />
				<rect x={s * 0.26} y={mid - s * 0.065} width={s * 0.48} height={s * 0.13} fill={c} />
			</svg>
		);
	}
	const dot: CSSProperties =
		state === "running" && live
			? { transformOrigin: "center", animation: "chamfer-breathe 2400ms cubic-bezier(0.4, 0, 0.6, 1) infinite" }
			: {};
	return (
		<svg {...box} fill="none" aria-hidden="true" className="shrink-0">
			<circle cx={mid} cy={mid} r={mid - s * 0.11} stroke={c} strokeWidth={s * 0.13} />
			{state === "running" ? <circle cx={mid} cy={mid} r={s * 0.19} fill={c} style={dot} /> : null}
		</svg>
	);
}

/* ---- the type and the small parts ---- */

function Mono({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn("font-mono text-[11.5px] tracking-[0.005em]", className)}>{children}</span>;
}

function Note({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn("text-[12px] leading-[1.5] text-[var(--t3)]", className)}>{children}</span>;
}

function ChamferHead({ children }: { children: ReactNode }) {
	return <h2 className="text-[16px] font-semibold leading-[1.35] tracking-[-0.008em] text-[var(--t1)]">{children}</h2>;
}

function ChamferH1({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<h1 className={cn("text-[30px] font-semibold leading-[1.24] tracking-[-0.022em] text-[var(--t1)]", className)}>
			{children}
		</h1>
	);
}

/** A reading, so it takes a ground rather than an edge. */
function Tag({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex h-[18px] shrink-0 items-center rounded-[4px] px-1.5 font-mono text-[11.5px] tracking-[0.005em] text-[var(--t2)]",
				className,
			)}
			style={{ background: "var(--sunk)" }}
		>
			{children}
		</span>
	);
}

/**
 * The cut marks the action. One primary per screen, bottom right at 45 degrees
 * with leg = height / 4, and every other corner square. A secondary is a plane
 * step, a quiet one is ink alone, and a destructive one is red ink and never a
 * fill.
 */
function Btn({
	kind = "secondary",
	height = 36,
	className,
	onClick,
	children,
}: {
	kind?: "primary" | "secondary" | "quiet" | "danger";
	height?: number;
	className?: string;
	onClick?: () => void;
	children: ReactNode;
}) {
	const shared =
		"inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap px-4 text-[13.5px] font-medium leading-none transition-colors duration-150";
	if (kind === "primary") {
		// leg = height / 4, cut into the shape rather than rounded off it, so a small
		// button and a large one are the same device rather than two angles.
		const leg = height / 4;
		return (
			<button
				type="button"
				onClick={onClick}
				style={{
					height,
					borderRadius: 6,
					clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${leg}px), calc(100% - ${leg}px) 100%, 0 100%)`,
				}}
				className={cn(shared, "bg-[var(--acc)] text-[var(--acc-ink)] hover:bg-[var(--acc-hover)]", className)}
			>
				{children}
			</button>
		);
	}
	return (
		<button
			type="button"
			onClick={onClick}
			style={{ height }}
			className={cn(
				shared,
				"rounded-[6px]",
				kind === "secondary" && "bg-[var(--sunk)] text-[var(--t1)] hover:bg-[var(--hover)]",
				kind === "quiet" && "bg-transparent text-[var(--t2)] hover:bg-[var(--sunk)] hover:text-[var(--t1)]",
				kind === "danger" && "bg-[var(--sunk)] text-[var(--st-failed)] hover:bg-[var(--hover)]",
				className,
			)}
		>
			{children}
		</button>
	);
}

/** A closed set, so it is a chip. Selected is an accent fill and stays square. */
function Chip({ label, count, on }: { label: string; count?: string; on?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex h-9 select-none items-center gap-2.5 rounded-[6px] px-3.5 text-[13px] leading-none",
				on === true ? "bg-[var(--acc)] text-[var(--acc-ink)]" : "bg-[var(--panel)] text-[var(--t2)]",
			)}
		>
			<span>{label}</span>
			{count === undefined ? null : (
				<span className="font-mono text-[11.5px] tabular-nums" style={{ opacity: on === true ? 0.8 : 0.66 }}>
					{count}
				</span>
			)}
		</span>
	);
}

function Selector({ value, width = 196 }: { value: string; width?: number }) {
	return (
		<span
			className="flex h-9 items-center justify-between gap-2 rounded-[6px] px-3.5 text-[13px] text-[var(--t2)]"
			style={{ width, background: "var(--panel)" }}
		>
			<span className="truncate">{value}</span>
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
				<path d="M4.75 3 7.75 6l-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
			</svg>
		</span>
	);
}

/** A chamfer is a flat cut off a square edge, so the mark is that shape, in ink. */
function ChamferMark({ size = 19 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
			<path
				d="M5 0.75 H19 A4.25 4.25 0 0 1 23.25 5 V14.6 L14.6 23.25 H5 A4.25 4.25 0 0 1 0.75 19 V5 A4.25 4.25 0 0 1 5 0.75 Z"
				fill="var(--t1)"
			/>
		</svg>
	);
}

/* ---- the rail ---- */

interface Room {
	label: string;
	count?: string;
	waiting?: boolean;
	badge?: string;
}

const PROJECT_ROOMS: readonly Room[] = [
	{ label: "Automations", count: "3" },
	{ label: "Runs" },
	{ label: "Versions", count: "v41" },
	{ label: "Secrets", count: "5" },
	{ label: "Settings" },
];

const INSTANCE_ROOMS: readonly Room[] = [
	{ label: "Inbox", count: "2", waiting: true },
	{ label: "Connections", count: "7" },
	{ label: "Members", count: "6" },
	{ label: "Instance settings", badge: "v0.4.2" },
];

function RoomRow({ room, on }: { room: Room; on: boolean }) {
	return (
		<span
			className={cn(
				"flex h-10 items-center rounded-[6px] px-3 text-[13.5px]",
				on ? "text-[var(--t1)]" : "text-[var(--t2)]",
			)}
			style={on ? { background: "var(--panel)" } : undefined}
		>
			<span>{room.label}</span>
			{room.badge !== undefined ? (
				<span
					className="ml-auto rounded-[4px] px-1.5 py-[3px] font-mono text-[11.5px] leading-none text-[var(--t1)]"
					style={{ background: "var(--panel)" }}
				>
					{room.badge}
				</span>
			) : room.count === undefined ? null : (
				<span
					className="ml-auto font-mono text-[11.5px] tabular-nums"
					style={{ color: room.waiting === true ? "var(--st-waiting)" : "var(--t3)" }}
				>
					{room.count}
				</span>
			)}
		</span>
	);
}

/** 264 wide, on the ground under the page, so the split reads with no line in it. */
function ChamferRail({ active, home = false }: { active: string; home?: boolean }) {
	return (
		<nav className="flex w-[264px] shrink-0 flex-col p-4" style={{ background: "var(--sunk)" }}>
			<span
				className="flex h-11 items-center gap-2.5 rounded-[6px] px-2.5"
				style={home ? { background: "var(--panel)" } : undefined}
			>
				<ChamferMark />
				<span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--t1)]">Eidra</span>
				<Mono className="ml-auto text-[var(--t3)]">fjord-prod</Mono>
			</span>

			<span
				className="mt-4 flex h-10 items-center justify-between rounded-[6px] px-3 text-[13.5px] text-[var(--t1)]"
				style={{ background: "var(--page)" }}
			>
				<span>fjord-automations</span>
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="text-[var(--t3)]">
					<path d="M4.75 3 7.75 6l-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
				</svg>
			</span>

			<span className="mt-5 flex flex-col gap-0.5">
				{PROJECT_ROOMS.map((r) => (
					<RoomRow key={r.label} room={r} on={r.label === active} />
				))}
			</span>

			<span className="mt-auto flex flex-col gap-0.5">
				{INSTANCE_ROOMS.map((r) => (
					<RoomRow key={r.label} room={r} on={r.label === active} />
				))}
			</span>

			<span className="mt-5 flex h-11 items-center gap-3 rounded-[6px] px-2.5" style={{ background: "var(--page)" }}>
				<span
					className="flex size-7 items-center justify-center rounded-[6px] font-mono text-[11px] text-[var(--t2)]"
					style={{ background: "var(--sunk)" }}
				>
					LV
				</span>
				<span className="text-[13px] text-[var(--t1)]">Liam Vinberg</span>
				<span className="ml-auto text-[12px] text-[var(--t3)]">Admin</span>
			</span>
		</nav>
	);
}

function ChamferShell({ active, home = false, children }: { active: string; home?: boolean; children: ReactNode }) {
	return (
		<div
			className="chm flex overflow-hidden text-[var(--t1)] antialiased"
			style={{ width: APP_W, height: APP_H, background: "var(--page)" }}
		>
			<ChamferType />
			<ChamferRail active={active} home={home} />
			<main className="flex h-full min-w-0 flex-1 flex-col px-10 pb-8 pt-9">{children}</main>
		</div>
	);
}

/* ---- pt-home ---- */

interface HomeProject {
	id: string;
	mark: RunState;
	automations: string;
	automation?: string;
	sentence: string;
	last: { at: string; state: RunState };
	failedToday: number;
	waiting: number;
	version: string;
	action?: boolean;
}

const HOME_PROJECTS: readonly HomeProject[] = [
	{
		id: "fjord-automations",
		mark: "waiting",
		automations: "3 Automations",
		automation: "hris-workspace-sync",
		sentence: "412 checked against Personio, 36 updated",
		last: { at: "4 seconds ago", state: "succeeded" },
		failedToday: 0,
		waiting: 2,
		version: "v41",
	},
	{
		id: "liam-personal",
		mark: "failed",
		automations: "2 Automations",
		automation: "gmail-to-slack",
		sentence: "page the on-call stopped on invalid_auth from Slack, not retried",
		last: { at: "20 minutes ago", state: "failed" },
		failedToday: 1,
		waiting: 0,
		version: "v7",
		action: true,
	},
	{
		id: "fjord-finance",
		mark: "succeeded",
		automations: "4 Automations",
		automation: "invoice-digest",
		sentence: "channel #people-ops, posted 6",
		last: { at: "1 hour ago", state: "succeeded" },
		failedToday: 0,
		waiting: 0,
		version: "v12",
	},
	{
		id: "fjord-onboarding",
		mark: "succeeded",
		automations: "2 Automations",
		sentence: "onboarding waits for a webhook from Personio.",
		last: { at: "3 days ago", state: "succeeded" },
		failedToday: 0,
		waiting: 0,
		version: "v3",
	},
];

/** A zero keeps the mark's slot without drawing one, so the digits stay on a rail. */
function HomeCount({ n, state }: { n: number; state: RunState }) {
	if (n === 0) {
		return (
			<>
				<span className="block h-[9px] w-[9px] shrink-0" />
				<Mono className="tabular-nums text-[var(--t3)]">0</Mono>
			</>
		);
	}
	return (
		<>
			<StateMark state={state} size={9} live={false} />
			<span className="font-mono text-[11.5px] tabular-nums" style={{ color: stateVar[state] }}>
				{n}
			</span>
		</>
	);
}

function HomeFact({ w, label, children }: { w: number; label: string; children: ReactNode }) {
	return (
		<div className="shrink-0" style={{ width: w }}>
			<div className="flex h-4 items-center gap-2">{children}</div>
			<div className="mt-1.5 text-[12px] leading-none text-[var(--t3)]">{label}</div>
		</div>
	);
}

function HomeBlock({ p }: { p: HomeProject }) {
	return (
		<div className="-mx-4 flex gap-4 rounded-[6px] px-4 py-[18px]">
			<span className="mt-[3px] shrink-0">
				<StateMark state={p.mark} size={14} live={p.mark !== "failed"} />
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2.5">
					<h3 className="text-[16px] font-semibold leading-[1.3] tracking-[-0.008em] text-[var(--t1)]">{p.id}</h3>
					<span className="text-[12px] text-[var(--t3)]">{p.automations}</span>
				</div>
				{p.automation === undefined ? (
					<p className="mt-1.5 max-w-[720px] text-[13.5px] leading-[1.6] text-[var(--t2)]">{p.sentence}</p>
				) : (
					<div className="mt-1.5 flex max-w-[860px] items-baseline gap-3">
						<span className="w-[140px] shrink-0 truncate">
							<Mono className="text-[var(--t1)]">{p.automation}</Mono>
						</span>
						<span className="min-w-0 flex-1 text-[13.5px] leading-[1.6] text-[var(--t2)]">{p.sentence}</span>
					</div>
				)}
				<div className="mt-3.5 flex">
					<HomeFact w={148} label="Last Run">
						<StateMark state={p.last.state} size={9} live={false} />
						<Mono className="text-[var(--t2)]">{p.last.at}</Mono>
					</HomeFact>
					<HomeFact w={116} label="Failed today">
						<HomeCount n={p.failedToday} state="failed" />
					</HomeFact>
					<HomeFact w={128} label="Waiting on you">
						<HomeCount n={p.waiting} state="waiting" />
					</HomeFact>
					<HomeFact w={96} label="Live">
						<Mono className="text-[var(--t1)]">{p.version}</Mono>
					</HomeFact>
				</div>
			</div>
			{p.action === true ? (
				<div className="flex shrink-0 items-center gap-2 self-start">
					<Btn kind="quiet" height={32} className="px-3 text-[12.5px]">
						Read why
					</Btn>
					<Btn kind="primary" height={32} className="px-3 text-[12.5px]">
						Retry
					</Btn>
				</div>
			) : (
				<div className="w-[18px] shrink-0" />
			)}
		</div>
	);
}

function Counter({ value, label, state }: { value: string; label: string; state?: RunState }) {
	return (
		<div className="shrink-0">
			<div className="text-[26px] font-medium leading-none tracking-[-0.02em] tabular-nums text-[var(--t1)]">
				{value}
			</div>
			<div className="mt-2.5 flex items-center gap-1.5">
				{state === undefined ? null : <StateMark state={state} size={9} live={false} />}
				<span className="text-[12px] text-[var(--t3)]">{label}</span>
			</div>
		</div>
	);
}

export function HomeScreen() {
	return (
		<ChamferShell active="Home" home>
			<div className="flex shrink-0 items-start gap-8">
				<ChamferH1 className="max-w-[880px]">
					<span className="whitespace-nowrap">liam-personal</span> stopped 20 minutes ago. Two Runs in{" "}
					<span className="whitespace-nowrap">fjord-automations</span> are waiting on you.
				</ChamferH1>
				<span className="ml-auto flex shrink-0 items-baseline gap-2 pt-1.5 text-[12px] text-[var(--t3)]">
					<span>Monday 24 August</span>
					<span>·</span>
					<Mono className="text-[var(--t2)]">06:12</Mono>
				</span>
			</div>

			<section className="mt-7 flex shrink-0 flex-col">
				<div className="flex items-baseline gap-3">
					<ChamferHead>Projects</ChamferHead>
					<Note>Four Projects deploy to this Instance.</Note>
				</div>
				<div className="mt-2.5">
					{HOME_PROJECTS.map((p) => (
						<HomeBlock key={p.id} p={p} />
					))}
				</div>
			</section>

			<section className="mt-8 flex shrink-0 flex-col">
				<div className="flex items-baseline gap-3">
					<ChamferHead>Since midnight</ChamferHead>
					<Note>All four Projects together.</Note>
				</div>
				<div className="mt-4 flex items-end gap-14">
					<Counter value="62" label="Runs" />
					<Counter value="58" label="Succeeded" state="succeeded" />
					<Counter value="1" label="Failed" state="failed" />
					<Counter value="2" label="Waiting" state="waiting" />
					<Counter value="6m 11s" label="Longest" />
				</div>
			</section>

			<p className="pt-7 text-[13px] leading-[1.65] text-[var(--t3)]">
				birthday-bot fires at 07:00 and hris-workspace-sync at 12:00. Nothing else is scheduled before then.
			</p>
		</ChamferShell>
	);
}

/* ---- pt-runs ---- */

interface RunLine {
	id: string;
	automation: string;
	at: string;
	did: string;
	took: string;
	state: RunState;
}

const RUN_ROWS: readonly RunLine[] = [
	{
		id: "run_8f21c4",
		automation: "hris-workspace-sync",
		at: "06:00:04",
		did: "Running update, 3m 53s into the Step",
		took: "4m 14s",
		state: "running",
	},
	{
		id: "run_2c7b10",
		automation: "offboarding",
		at: "05:58:11",
		did: "Waiting on an approval in the Inbox since 06:02",
		took: "6m 7s",
		state: "waiting",
	},
	{
		id: "run_91de40",
		automation: "offboarding",
		at: "04:41:52",
		did: "suspended bo@fjord.co, groups 4, drive ida@fjord.co",
		took: "38.2s",
		state: "succeeded",
	},
	{
		id: "run_5a0c83",
		automation: "hris-workspace-sync",
		at: "03:58:20",
		did: "update ines@fjord.co stopped on 403 Rate Limit Exceeded, retried three times",
		took: "1m 12s",
		state: "failed",
	},
	{
		id: "run_4d17a2",
		automation: "hris-workspace-sync",
		at: "03:12:40",
		did: "Liam cancelled it at update, 18 of 409 updated",
		took: "47.1s",
		state: "cancelled",
	},
	{
		id: "run_77b2ef",
		automation: "hris-workspace-sync",
		at: "02:14:06",
		did: "1 checked against Personio, 1 updated",
		took: "6.4s",
		state: "succeeded",
	},
	{
		id: "run_38aa71",
		automation: "offboarding",
		at: "00:31:44",
		did: "suspended cleo@fjord.co, groups 2, drive ida@fjord.co",
		took: "41.9s",
		state: "succeeded",
	},
	{
		id: "run_0e4419",
		automation: "hris-workspace-sync",
		at: "00:00:02",
		did: "411 checked against Personio, 0 updated",
		took: "22.6s",
		state: "succeeded",
	},
];

/** RUN_COLS: 20 / 112 / 168 / grows / 76 / 132, gap-4 inside px-4. */
const RUN_RAILS = "20px 112px 168px minmax(0,1fr) 76px 132px";

export function RunsScreen() {
	return (
		<ChamferShell active="Runs">
			<div className="flex shrink-0 items-start gap-8">
				<ChamferH1 className="max-w-[700px]">
					Eight Runs since midnight. One is running and one is waiting on you.
				</ChamferH1>
				<div className="ml-auto flex shrink-0 items-center gap-5 pt-1">
					<span className="flex items-baseline gap-2 text-[12px] text-[var(--t3)]">
						Now
						<Mono className="text-[var(--t2)]">06:04:18</Mono>
					</span>
					<Btn kind="primary">Run by hand</Btn>
				</div>
			</div>

			<div className="mb-3.5 mt-7 flex shrink-0 items-baseline gap-3">
				<ChamferHead>Runs</ChamferHead>
				<Note>Newest first. A Run is pinned to the Version that was live when it started.</Note>
			</div>

			<div className="mb-4 flex shrink-0 items-center gap-2">
				<Chip label="All" count="8" on />
				<Chip label="Running" count="1" />
				<Chip label="Waiting" count="1" />
				<Chip label="Failed" count="1" />
				<Chip label="Succeeded" count="4" />
				<Chip label="Cancelled" count="1" />
				<span className="ml-auto flex items-center gap-2">
					<Selector value="Every Automation" width={198} />
					<Selector value="Every Trigger" width={140} />
					<Selector value="Since midnight" width={152} />
				</span>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden rounded-[8px]" style={{ background: "var(--panel)" }}>
				<div
					className="grid h-10 items-center gap-4 px-4 text-[12px] text-[var(--t3)]"
					style={{ background: "var(--sunk)", gridTemplateColumns: RUN_RAILS }}
				>
					<span />
					<span className="flex items-center gap-1 text-[var(--t1)]">
						Started
						<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="rotate-90">
							<path d="M4.75 3 7.75 6l-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
						</svg>
					</span>
					<span>Automation</span>
					<span>What it did</span>
					<span className="text-right">Took</span>
					<span>State</span>
				</div>
				{RUN_ROWS.map((r, i) => (
					<div
						key={r.id}
						className="grid h-11 items-center gap-4 px-4"
						style={{
							gridTemplateColumns: RUN_RAILS,
							background: i === 0 ? "var(--hover)" : "transparent",
						}}
					>
						<StateMark state={r.state} />
						<Mono className="tabular-nums text-[var(--t3)]">{r.at}</Mono>
						<span className="truncate text-[13.5px] text-[var(--t1)]">{r.automation}</span>
						<span
							className="truncate text-[13.5px] leading-[1.65]"
							style={{ color: r.state === "failed" ? "var(--st-failed)" : "var(--t2)" }}
						>
							{r.did}
						</span>
						<Mono className="text-right tabular-nums text-[var(--t2)]">{r.took}</Mono>
						<span className="truncate text-[13px]" style={{ color: wordColour(r.state) }}>
							{stateWord[r.state]}
						</span>
					</div>
				))}
			</div>

			<div className="mt-3 flex shrink-0 items-center gap-3">
				<Mono className="tabular-nums text-[var(--t3)]">8</Mono>
				<p className="text-[13px] text-[var(--t3)]">Runs since midnight, and every one of them is here.</p>
				<span className="ml-auto">
					<Btn kind="quiet">Widen to the last 90 days</Btn>
				</span>
			</div>

			<p className="shrink-0 pt-6 text-[13px] leading-[1.65] text-[var(--t3)]">
				hris-workspace-sync fires again at 12:00, and birthday-bot at 07:00.
			</p>
		</ChamferShell>
	);
}

/* ---- the Run page head, shared by the Graph and the Journal ---- */

interface RunHead {
	id: string;
	version: string;
	trigger: string;
	startedAt: string;
	state: RunState;
	title: string;
	elapsed: string;
	entries?: number;
}

const VERB: Record<RunState, string> = {
	queued: "Queued for",
	running: "Running for",
	waiting: "Waiting,",
	succeeded: "Took",
	failed: "Failed after",
	cancelled: "Cancelled after",
};

function RunPageHead({ run, tab, action }: { run: RunHead; tab: "journal" | "graph"; action: ReactNode }) {
	return (
		<>
			<div className="flex shrink-0 items-start gap-8 pb-6">
				<div className="min-w-0 flex-1">
					<div className="flex items-start gap-2.5">
						<span className="mt-[12px] shrink-0">
							<StateMark state={run.state} size={13} />
						</span>
						<ChamferH1 className="max-w-[700px]">{run.title}</ChamferH1>
					</div>
					<div className="mt-2.5 flex items-baseline gap-2 pl-[23px] text-[12px] text-[var(--t3)]">
						<Mono className="text-[var(--t2)]">{run.id}</Mono>
						<span>·</span>
						<Mono className="text-[var(--t2)]">{run.version}</Mono>
						<span>·</span>
						<span>
							{run.trigger} fired at <Mono className="text-[var(--t2)]">{run.startedAt}</Mono>
						</span>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-5 pt-1.5">
					<span className="flex items-baseline gap-2 text-[12px] text-[var(--t3)]">
						{VERB[run.state]}
						<Mono className="tabular-nums text-[var(--t2)]">{run.elapsed}</Mono>
						{run.state === "waiting" ? <span>in</span> : null}
					</span>
					{action}
				</div>
			</div>

			<div className="flex shrink-0 items-end">
				{(["journal", "graph"] as const).map((id) => (
					<span
						key={id}
						className={cn(
							"relative inline-flex items-center gap-2 px-3.5 pb-2.5 text-[13.5px] leading-none",
							id === tab ? "text-[var(--t1)]" : "text-[var(--t2)]",
						)}
					>
						{id === "journal" ? "Journal" : "Graph"}
						{id === "journal" && run.entries !== undefined ? (
							<Mono className="tabular-nums text-[var(--t3)]">{run.entries}</Mono>
						) : null}
						<span
							aria-hidden="true"
							className="absolute inset-x-0 bottom-0 h-[2px] rounded-[1px]"
							style={{ background: id === tab ? "var(--acc)" : "var(--sunk)" }}
						/>
					</span>
				))}
			</div>
		</>
	);
}

/* ---- pt-journal and its siblings ---- */

interface JournalRow {
	name: string;
	depth: number;
	state: RunState;
	at: string;
	took: string;
	tag?: string;
	fan?: { total: number; succeeded: number; failed: number; running: number; queued: number };
	attempts?: number;
	picked?: boolean;
}

interface Tally {
	tally: true;
	count: string;
	sentence: string;
}

type JournalLine = JournalRow | Tally;

const isTally = (l: JournalLine): l is Tally => "tally" in l;

/** The four Runs the sibling frames stand on, in the order the page was designed. */
export type JournalTake = "running" | "failed" | "waiting" | "queued";

interface JournalDef {
	run: RunHead;
	action: ReactNode;
	rows: readonly JournalLine[];
	detail: ReactNode;
}

function FanBar({ fan }: { fan: NonNullable<JournalRow["fan"]> }) {
	const seg = (key: string, n: number, colour: string) =>
		n === 0 ? null : <span key={key} style={{ flex: n, background: colour }} />;
	return (
		<span className="flex h-[3px] w-16 shrink-0 gap-0.5 overflow-hidden rounded-[2px]">
			{seg("s", fan.succeeded, stateVar.succeeded)}
			{seg("f", fan.failed, stateVar.failed)}
			{seg("r", fan.running, stateVar.running)}
			{seg("q", fan.queued, stateVar.queued)}
		</span>
	);
}

/** 14 / 62 / grows / 68 / 18 at gap-4 inside px-4, against a 520px column. */
const JOURNAL_RAILS = "14px 62px minmax(0,1fr) 68px 18px";
const JOURNAL_LIST_W = 520;

function DetailLabel({ children }: { children: string }) {
	return <span className="w-[92px] shrink-0 pt-[1px] text-[12px] leading-[1.5] text-[var(--t3)]">{children}</span>;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex gap-3">
			<DetailLabel>{label}</DetailLabel>
			{children}
		</div>
	);
}

function Payload({ children }: { children: string }) {
	return (
		<pre
			className="min-w-0 flex-1 overflow-hidden whitespace-pre rounded-[6px] p-3 font-mono text-[11.5px] leading-[1.55] text-[var(--t1)]"
			style={{ background: "var(--sunk)" }}
		>
			{children}
		</pre>
	);
}

const JOURNAL_TAKES: Record<JournalTake, JournalDef> = {
	running: {
		run: {
			id: "run_8f21c4",
			version: "v14",
			trigger: "every6h",
			startedAt: "06:00:04",
			state: "running",
			title: "hris-workspace-sync is 31 items into a fan-out of 37, and one of them failed.",
			elapsed: "4m 14s",
			entries: 12,
		},
		action: <Btn kind="secondary">Cancel the Run</Btn>,
		rows: [
			{ name: "fetch HRIS changes", depth: 0, state: "succeeded", at: "06:00:04", took: "11.9s", attempts: 2 },
			{ name: "diff against Workspace", depth: 0, state: "succeeded", at: "06:00:16", took: "240ms" },
			{ name: "classify", depth: 0, state: "succeeded", at: "06:00:16", took: "8.2s", tag: "Agent" },
			{
				name: "update ${p.email}",
				depth: 0,
				state: "running",
				at: "06:00:25",
				took: "3m 53s",
				tag: "×37",
				fan: { total: 37, succeeded: 31, failed: 1, running: 2, queued: 3 },
			},
			{ name: "update ada@fjord.co", depth: 1, state: "succeeded", at: "06:00:25", took: "420ms" },
			{ name: "update bo@fjord.co", depth: 1, state: "succeeded", at: "06:00:26", took: "380ms" },
			{
				name: "update cleo@fjord.co",
				depth: 1,
				state: "failed",
				at: "06:03:41",
				took: "9.1s",
				attempts: 3,
				picked: true,
			},
			{ name: "update dev@fjord.co", depth: 1, state: "running", at: "06:04:16", took: "2.2s" },
			{ name: "update eve@fjord.co", depth: 1, state: "running", at: "06:04:16", took: "1.9s" },
			{ tally: true, count: "29", sentence: "more finished, the slowest in 1.2s." },
		],
		detail: (
			<>
				<div className="flex flex-col gap-3">
					<div className="flex items-baseline gap-3">
						<span className="text-[13.5px] font-medium" style={{ color: "var(--st-failed)" }}>
							Failed at 06:03:52
						</span>
						<Note>3 Attempts</Note>
					</div>
					<DetailField label="Called">
						<span className="flex min-w-0 flex-1 items-center gap-2">
							<Mono className="truncate text-[var(--t1)]">directory.users.update</Mono>
							<Tag>write</Tag>
						</span>
					</DetailField>
					<DetailField label="Threw">
						<Mono className="text-[var(--t1)]">StepError</Mono>
					</DetailField>
					<DetailField label="Cause">
						<Mono className="text-[var(--t1)]">RetryableError: 503 Backend Error</Mono>
					</DetailField>
					<DetailField label="Response">
						<span className="flex items-center gap-2">
							<Mono className="text-[var(--t1)]">503</Mono>
							<Note>·</Note>
							<Mono className="text-[var(--t1)]">backendError</Mono>
						</span>
					</DetailField>
				</div>

				<DetailField label="Attempts">
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						{[
							{ at: "06:03:41", says: "503 backendError, retrying in 2s", ms: "1.9s" },
							{ at: "06:03:45", says: "503 backendError, retrying in 6s", ms: "1.9s" },
							{ at: "06:03:52", says: "503 backendError, retries exhausted", ms: "1.8s" },
						].map((a) => (
							<div key={a.at} className="flex items-baseline gap-3">
								<span className="shrink-0 translate-y-[1px]">
									<StateMark state="failed" size={9} />
								</span>
								<Mono className="w-[86px] shrink-0 tabular-nums text-[var(--t3)]">{a.at}</Mono>
								<span
									className="min-w-0 flex-1 text-[13px] leading-[1.5]"
									style={{ color: "var(--st-failed)" }}
								>
									{a.says}
								</span>
								<Mono className="shrink-0 tabular-nums text-[var(--t3)]">{a.ms}</Mono>
							</div>
						))}
					</div>
				</DetailField>

				<DetailField label="Input">
					<Payload>{`{
  "email": "cleo@fjord.co",
  "title": "Head of Design",
  "department": "Design",
  "manager": "ida@fjord.co"
}`}</Payload>
				</DetailField>

				<DetailField label="Written at">
					<Mono className="text-[var(--t2)]">index.ts line 63</Mono>
				</DetailField>
			</>
		),
	},
	failed: {
		run: {
			id: "run_5a0c83",
			version: "v14",
			trigger: "changed",
			startedAt: "03:58:20",
			state: "failed",
			title: "hris-workspace-sync stopped at update ines@fjord.co, and nothing caught the error.",
			elapsed: "1m 12s",
			entries: 9,
		},
		action: <Btn kind="primary">Retry the Run</Btn>,
		rows: [
			{ name: "fetch HRIS changes", depth: 0, state: "succeeded", at: "03:58:20", took: "9.4s" },
			{ name: "diff against Workspace", depth: 0, state: "succeeded", at: "03:58:30", took: "180ms" },
			{ name: "classify", depth: 0, state: "succeeded", at: "03:58:30", took: "7.1s", tag: "Agent" },
			{
				name: "update ${p.email}",
				depth: 0,
				state: "failed",
				at: "03:58:37",
				took: "54.8s",
				tag: "×6",
				fan: { total: 6, succeeded: 5, failed: 1, running: 0, queued: 0 },
			},
			{ name: "update alva@fjord.co", depth: 1, state: "succeeded", at: "03:58:37", took: "390ms" },
			{
				name: "update ines@fjord.co",
				depth: 1,
				state: "failed",
				at: "03:59:19",
				took: "12.6s",
				attempts: 3,
				picked: true,
			},
			{ tally: true, count: "4", sentence: "more finished, the slowest in 0.9s." },
		],
		detail: (
			<>
				<div className="flex flex-col gap-3">
					<div className="flex items-baseline gap-3">
						<span className="text-[13.5px] font-medium" style={{ color: "var(--st-failed)" }}>
							Failed at 03:59:32
						</span>
						<Note>3 Attempts</Note>
					</div>
					<DetailField label="Called">
						<span className="flex min-w-0 flex-1 items-center gap-2">
							<Mono className="truncate text-[var(--t1)]">directory.users.update</Mono>
							<Tag>write</Tag>
						</span>
					</DetailField>
					<DetailField label="Threw">
						<Mono className="text-[var(--t1)]">StepError</Mono>
					</DetailField>
					<DetailField label="Cause">
						<Mono className="text-[var(--t1)]">RetryableError: 403 Rate Limit Exceeded</Mono>
					</DetailField>
					<DetailField label="Response">
						<span className="flex items-center gap-2">
							<Mono className="text-[var(--t1)]">403</Mono>
							<Note>·</Note>
							<Mono className="text-[var(--t1)]">rateLimitExceeded</Mono>
						</span>
					</DetailField>
				</div>
				<DetailField label="Input">
					<Payload>{`{
  "email": "ines@fjord.co",
  "title": "Finance Lead",
  "manager": "johan@fjord.co"
}`}</Payload>
				</DetailField>
				<DetailField label="Written at">
					<Mono className="text-[var(--t2)]">index.ts line 63</Mono>
				</DetailField>
			</>
		),
	},
	waiting: {
		run: {
			id: "run_2c7b10",
			version: "v41",
			trigger: "left",
			startedAt: "05:58:11",
			state: "waiting",
			title: "offboarding is holding at wait.approval, and nothing has been written yet.",
			elapsed: "6m 7s",
			entries: 6,
		},
		action: <Btn kind="primary">Open the Inbox</Btn>,
		rows: [
			{ name: "read the leaver", depth: 0, state: "succeeded", at: "05:58:11", took: "1.4s" },
			{ name: "find the accounts", depth: 0, state: "succeeded", at: "05:58:13", took: "3.8s" },
			{ name: "draft the plan", depth: 0, state: "succeeded", at: "05:58:17", took: "12.2s", tag: "Agent" },
			{ name: "wait.approval", depth: 0, state: "waiting", at: "06:02:05", took: "2m 6s", tag: "Wait", picked: true },
		],
		detail: (
			<>
				<div className="flex flex-col gap-2.5">
					<div className="flex items-start gap-2.5">
						<span className="mt-[3px] shrink-0">
							<StateMark state="waiting" size={11} />
						</span>
						<span className="text-[13.5px] leading-[1.45]" style={{ color: "var(--st-waiting)" }}>
							Suspend anna@fjord.co in Google Workspace
						</span>
					</div>
					<div className="pl-[23px]">
						<Note>Expires in 21h 21m. Nothing is written until somebody answers.</Note>
					</div>
				</div>
				<DetailField label="Called">
					<Mono className="text-[var(--t1)]">google-directory.suspendUser</Mono>
				</DetailField>
				<DetailField label="Input">
					<Payload>{`{
  "userKey": "anna@fjord.co",
  "reason": "Left the company on 22 August",
  "sendNotification": false
}`}</Payload>
				</DetailField>
				<DetailField label="Written at">
					<Mono className="text-[var(--t2)]">index.ts line 41</Mono>
				</DetailField>
			</>
		),
	},
	queued: {
		run: {
			id: "run_1ab907",
			version: "v9",
			trigger: "received",
			startedAt: "09:41:12",
			state: "running",
			title: "gmail-to-slack is queued at digest behind a Harness Step in fjord-finance.",
			elapsed: "1h 3m",
			entries: 5,
		},
		action: <Btn kind="secondary">Cancel the Run</Btn>,
		rows: [
			{ name: "read the thread", depth: 0, state: "succeeded", at: "09:41:12", took: "2.1s" },
			{ name: "summarise", depth: 0, state: "succeeded", at: "09:41:15", took: "9.6s", tag: "Agent" },
			{ name: "digest", depth: 0, state: "queued", at: "09:41:25", took: "1h 2m", tag: "Harness", picked: true },
		],
		detail: (
			<>
				<div className="flex flex-col gap-2.5">
					<div className="flex items-start gap-2.5">
						<span className="mt-[3px] shrink-0">
							<StateMark state="queued" size={11} />
						</span>
						<span className="text-[13.5px] leading-[1.45] text-[var(--t1)]">
							Queued for the Harness lane, which runs one Step at a time.
						</span>
					</div>
					<div className="flex flex-col gap-1 pl-[23px]">
						<Note>Waiting since 09:41:25.</Note>
						<Note>Two Runs ahead of it, both in fjord-finance.</Note>
						<Note>The lane frees when invoice-digest finishes.</Note>
					</div>
				</div>
				<DetailField label="Called">
					<Mono className="text-[var(--t1)]">harness.run</Mono>
				</DetailField>
				<DetailField label="Written at">
					<Mono className="text-[var(--t2)]">index.ts line 28</Mono>
				</DetailField>
			</>
		),
	},
};

export function JournalScreen({ take = "running" }: { take?: JournalTake }) {
	const def = JOURNAL_TAKES[take];
	return (
		<ChamferShell active="Runs">
			<RunPageHead run={def.run} tab="journal" action={def.action} />

			<div className="mb-3.5 mt-7 flex shrink-0 items-baseline gap-3">
				<ChamferHead>Journal</ChamferHead>
				<Note>Every entry this Run has written.</Note>
			</div>

			<div className="flex min-h-0 flex-1 gap-3">
				<div
					className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[8px]"
					style={{ width: JOURNAL_LIST_W, background: "var(--panel)" }}
				>
					<div className="min-h-0 flex-1 overflow-hidden">
						<div
							className="grid h-10 items-center gap-4 px-4 text-[12px] text-[var(--t3)]"
							style={{ background: "var(--sunk)", gridTemplateColumns: JOURNAL_RAILS }}
						>
							<span />
							<span>At</span>
							<span>Step</span>
							<span className="text-right">Took</span>
							<span />
						</div>

						{def.rows.map((line) =>
							isTally(line) ? (
								<div key={line.sentence} className="flex h-11 shrink-0 items-center gap-2 px-4">
									<Mono className="tabular-nums text-[var(--t3)]">{line.count}</Mono>
									<span className="truncate text-[13px] text-[var(--t3)]">{line.sentence}</span>
								</div>
							) : (
								<div
									key={line.name}
									className="grid h-11 items-center gap-4 px-4"
									style={{
										gridTemplateColumns: JOURNAL_RAILS,
										background: line.picked === true ? "var(--acc-wash)" : "transparent",
									}}
								>
									<StateMark state={line.state} size={11} />
									<Mono className="tabular-nums text-[var(--t3)]">{line.at}</Mono>
									<span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: line.depth * 18 }}>
										<span
											className="truncate text-[13.5px] font-medium"
											style={{ color: line.state === "failed" ? stateVar.failed : "var(--t1)" }}
										>
											{line.name}
										</span>
										{line.tag === undefined ? null : <Tag>{line.tag}</Tag>}
										{line.fan === undefined ? null : <FanBar fan={line.fan} />}
										{line.attempts === undefined ? null : (
											<span className="shrink-0 text-[12px] text-[var(--t3)]">
												{`${line.attempts} Attempts`}
											</span>
										)}
									</span>
									<Mono className="text-right tabular-nums text-[var(--t2)]">{line.took}</Mono>
									<span className="text-[var(--t3)]">
										{line.picked === true ? (
											<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
												<path
													d="M4.75 3 7.75 6l-3 3"
													stroke="currentColor"
													strokeWidth="1.4"
													strokeLinecap="round"
												/>
											</svg>
										) : null}
									</span>
								</div>
							),
						)}
					</div>

					<div
						className="flex h-11 shrink-0 items-center gap-2 px-4"
						style={{ background: "var(--sunk)" }}
					>
						<Mono className="tabular-nums text-[var(--t3)]">{def.run.entries}</Mono>
						<span className="truncate text-[13px] text-[var(--t3)]">entries so far.</span>
					</div>
				</div>

				<div
					className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-[8px]"
					style={{ background: "var(--panel)" }}
				>
					<div className="flex flex-col gap-3.5 p-5">{def.detail}</div>
				</div>
			</div>
		</ChamferShell>
	);
}

/* ---- pt-graph ---- */

interface GraphNode {
	id: string;
	label: string;
	detail: string;
	x: number;
	y: number;
	trigger?: boolean;
	tag?: string;
	state?: RunState;
	ahead?: boolean;
	picked?: boolean;
	fan?: NonNullable<JournalRow["fan"]>;
	attempts?: number;
}

/** SIZES.down from the shipped graph: 258 by 58, ranks 114 apart, columns 298. */
const NODE_W = 258;
const NODE_H = 58;

const GRAPH_NODES: readonly GraphNode[] = [
	{ id: "t1", label: "every6h", detail: 'cron "0 */6 * * *", tz "Europe/Stockholm"', x: 40, y: 0, trigger: true, tag: "onSchedule" },
	{ id: "t2", label: "changed", detail: 'fields ["title", "manager"]', x: 338, y: 0, trigger: true, tag: "Connector", ahead: true },
	{ id: "n1", label: "fetch HRIS changes", detail: "hris.people.list", x: 189, y: 114, tag: "Harness", state: "succeeded", attempts: 2 },
	{ id: "n2", label: "diff against Workspace", detail: "directory.users.list", x: 189, y: 228, tag: "Harness", state: "succeeded" },
	{ id: "n3", label: "finish quietly", detail: "slack.chat.postMessage", x: 40, y: 342, tag: "Harness", ahead: true },
	{ id: "n5", label: "classify", detail: "claude-sonnet-5 · 2 Turns · 1 Tool call", x: 338, y: 342, tag: "Agent", state: "succeeded" },
	{ id: "n4", label: "output", detail: "{ checked: people.length, updated…", x: 40, y: 456, tag: "Output", ahead: true },
	{
		id: "n6",
		label: "update ${p.email}",
		detail: "directory.users.update",
		x: 338,
		y: 456,
		tag: "×37",
		state: "running",
		picked: true,
		fan: { total: 37, succeeded: 31, failed: 1, running: 2, queued: 3 },
	},
	{ id: "n7", label: "post the summary", detail: "slack.chat.postMessage", x: 338, y: 570, tag: "Harness", ahead: true },
];

const GRAPH_EDGES: readonly { from: string; to: string; travelled: boolean; label?: string }[] = [
	{ from: "t1", to: "n1", travelled: true },
	{ from: "t2", to: "n1", travelled: false },
	{ from: "n1", to: "n2", travelled: true },
	{ from: "n2", to: "n3", travelled: false, label: "changed.length === 0" },
	{ from: "n3", to: "n4", travelled: false },
	{ from: "n2", to: "n5", travelled: true },
	{ from: "n5", to: "n6", travelled: true },
	{ from: "n6", to: "n7", travelled: false },
];

const nodeAt = (id: string) => GRAPH_NODES.find((n) => n.id === id);

function GraphEdges({ w, h }: { w: number; h: number }) {
	return (
		<svg width={w} height={h} className="absolute left-0 top-0 overflow-visible" fill="none" aria-hidden="true">
			{GRAPH_EDGES.map((e) => {
				const a = nodeAt(e.from);
				const b = nodeAt(e.to);
				if (a === undefined || b === undefined) return null;
				const ax = a.x + NODE_W / 2;
				const ay = a.y + NODE_H;
				const bx = b.x + NODE_W / 2;
				const by = b.y;
				const d =
					Math.abs(ax - bx) < 1
						? `M${ax},${ay} V${by}`
						: `M${ax},${ay} V${ay + (by - ay) / 2} H${bx} V${by}`;
				return (
					<g
						key={`${e.from}-${e.to}`}
						stroke={e.travelled ? "var(--line-lift)" : "var(--line)"}
						strokeWidth={1.4}
						strokeLinecap="butt"
					>
						<path d={d} strokeDasharray={e.travelled ? undefined : "2 4"} />
						<path d={`M${bx - 4},${by - 4} L${bx},${by} L${bx + 4},${by - 4}`} strokeLinejoin="round" />
					</g>
				);
			})}
		</svg>
	);
}

function GraphNodeBox({ n }: { n: GraphNode }) {
	const box = { left: n.x, top: n.y, width: NODE_W, height: NODE_H };
	if (n.trigger === true) {
		return (
			<div
				className="absolute flex flex-col justify-center gap-1 rounded-[6px] px-3"
				style={{ ...box, background: n.ahead === true ? "var(--page)" : "var(--panel)" }}
			>
				<div className="flex items-center gap-2">
					<Mono className={n.ahead === true ? "text-[var(--t3)]" : "text-[var(--t1)]"}>{n.label}</Mono>
					<Tag className="ml-auto">{n.tag ?? ""}</Tag>
				</div>
				<Note className="truncate">{n.detail}</Note>
			</div>
		);
	}
	return (
		<div
			className="absolute flex flex-col justify-center gap-1 overflow-hidden rounded-[6px] px-3"
			style={{
				...box,
				background: n.picked === true ? "var(--acc-wash)" : n.ahead === true ? "var(--page)" : "var(--panel)",
			}}
		>
			{n.picked === true ? (
				<span className="absolute bottom-0 left-0 top-0 w-[2px]" style={{ background: "var(--acc)" }} />
			) : null}
			<div className="flex items-center gap-2">
				{n.state === undefined ? null : <StateMark state={n.state} size={10} />}
				<span
					className="truncate text-[13px] font-medium"
					style={{ color: n.ahead === true ? "var(--t3)" : n.state === "failed" ? stateVar.failed : "var(--t1)" }}
				>
					{n.label}
				</span>
				<Tag className="ml-auto">{n.tag ?? ""}</Tag>
			</div>
			<div className={cn("flex items-baseline gap-2", n.state !== undefined && "pl-[18px]")}>
				<Note className="truncate">{n.detail}</Note>
				{n.attempts === undefined ? null : (
					<span className="shrink-0 text-[11.5px] text-[var(--t3)]">{`${n.attempts} Attempts`}</span>
				)}
			</div>
			{n.fan === undefined ? null : (
				<span className="ml-[18px]">
					<FanBar fan={n.fan} />
				</span>
			)}
		</div>
	);
}

export function GraphScreen() {
	const run = JOURNAL_TAKES.running.run;
	return (
		<ChamferShell active="Runs">
			<RunPageHead run={run} tab="graph" action={<Btn kind="secondary">Cancel the Run</Btn>} />

			<div className="mb-3.5 mt-7 flex shrink-0 items-baseline gap-3">
				<ChamferHead>Graph</ChamferHead>
				<Note>The shape the code has, with this Run laid over it.</Note>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden rounded-[8px] px-6 py-6" style={{ background: "var(--sunk)" }}>
				<div className="relative" style={{ width: 636, height: 628 }}>
					<GraphEdges w={636} h={628} />
					{GRAPH_NODES.map((n) => (
						<GraphNodeBox key={n.id} n={n} />
					))}
					<span
						className="absolute px-1.5 font-mono text-[11.5px] leading-[18px] text-[var(--t3)]"
						style={{ left: 80, top: 291, background: "var(--sunk)" }}
					>
						changed.length === 0
					</span>
				</div>
			</div>
		</ChamferShell>
	);
}

/* ---- pt-ask: the one card a person answers, and the live frame on this page ---- */

const TEAMS = ["Design", "Engineering", "Operations"] as const;

/**
 * The frame in the first section is not a picture of a card, it is the card. The
 * team is a real select, the manager field takes text, and pressing Answer
 * settles the item the way the Run sees it, which is the whole of what "the
 * frames run" means and cannot be said with a still.
 */
export function AskScreen() {
	const [team, setTeam] = useState<string>("Engineering");
	const [open, setOpen] = useState(false);
	const [manager, setManager] = useState("johan@fjord.co");
	const [notify, setNotify] = useState(true);
	const [answered, setAnswered] = useState(false);

	return (
		<div
			className="chm flex flex-col overflow-hidden text-[var(--t1)] antialiased"
			style={{ width: ASK_W, height: ASK_H, background: "var(--panel)" }}
		>
			<ChamferType />
			<div className="flex flex-1 flex-col p-5">
				<div className="flex shrink-0 items-center gap-2.5">
					<Tag>Ask</Tag>
					<Mono className="text-[var(--t3)]">run_2ad884</Mono>
					<span className="ml-auto flex items-center gap-2">
						{answered ? (
							<StateMark state="succeeded" size={10} live={false} />
						) : (
							<StateMark state="waiting" size={10} />
						)}
						<Note>{answered ? "Answered just now" : "23h 48m left"}</Note>
					</span>
				</div>

				<h1 className="mt-3 shrink-0 text-[15px] font-semibold leading-[1.35] tracking-[-0.012em] text-[var(--t1)]">
					Which team should noa@fjord.co join?
				</h1>

				{answered ? (
					<div className="mt-4 flex flex-1 flex-col">
						<p className="text-[12.5px] leading-[1.6] text-[var(--t2)]">
							hris-workspace-sync picked the answer up and is writing the Google Group now. The Run carries
							on from sync/turn 2.
						</p>
						<div className="mt-4 rounded-[6px] p-3" style={{ background: "var(--sunk)" }}>
							<div className="flex items-baseline gap-3">
								<span className="w-[104px] shrink-0 text-[12px] text-[var(--t3)]">Team</span>
								<Mono className="text-[var(--t1)]">{team}</Mono>
							</div>
							<div className="mt-2 flex items-baseline gap-3">
								<span className="w-[104px] shrink-0 text-[12px] text-[var(--t3)]">Manager</span>
								<Mono className="truncate text-[var(--t1)]">{manager}</Mono>
							</div>
							<div className="mt-2 flex items-baseline gap-3">
								<span className="w-[104px] shrink-0 text-[12px] text-[var(--t3)]">Post in #general</span>
								<Mono className="text-[var(--t1)]">{notify ? "true" : "false"}</Mono>
							</div>
						</div>
						<div className="mt-auto flex justify-end">
							<Btn kind="quiet" height={32} className="px-3 text-[12.5px]" onClick={() => setAnswered(false)}>
								Ask it again
							</Btn>
						</div>
					</div>
				) : (
					<div className="mt-3 flex flex-1 flex-col">
						<p className="shrink-0 text-[12.5px] leading-[1.6] text-[var(--t2)]">
							Personio has Karl Nyberg starting on 1 September with no department set. Three teams have an
							open seat, so I cannot pick one from the record.
						</p>

						<div className="relative mt-4 shrink-0">
							<div className="text-[12px] leading-none text-[var(--t3)]">Team</div>
							<button
								type="button"
								onClick={() => setOpen((v) => !v)}
								className="mt-1.5 flex h-9 w-full cursor-pointer items-center justify-between rounded-[6px] px-3 text-[13px] text-[var(--t1)] transition-colors duration-150 hover:bg-[var(--hover)]"
								style={{ background: "var(--sunk)" }}
							>
								<span>{team}</span>
								<svg
									viewBox="0 0 12 12"
									width="12"
									height="12"
									fill="none"
									aria-hidden="true"
									className={cn("text-[var(--t3)] transition-transform duration-150", open && "rotate-90")}
								>
									<path d="M4.75 3 7.75 6l-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
								</svg>
							</button>
							{open ? (
								<div
									className="absolute left-0 right-0 top-[62px] z-10 overflow-hidden rounded-[6px] py-1"
									style={{ background: "var(--panel)", outline: "1px solid var(--line)" }}
								>
									{TEAMS.map((t) => (
										<button
											key={t}
											type="button"
											onClick={() => {
												setTeam(t);
												setOpen(false);
											}}
											className={cn(
												"flex h-8 w-full cursor-pointer items-center px-3 text-left text-[13px] transition-colors duration-150 hover:bg-[var(--hover)]",
												t === team ? "text-[var(--t1)]" : "text-[var(--t2)]",
											)}
										>
											{t}
										</button>
									))}
								</div>
							) : null}
						</div>

						<div className="mt-3.5 shrink-0">
							<div className="text-[12px] leading-none text-[var(--t3)]">Manager</div>
							<input
								value={manager}
								onChange={(e) => setManager(e.target.value)}
								spellCheck={false}
								className="mt-1.5 h-9 w-full rounded-[6px] px-3 text-[13px] text-[var(--t1)] outline-none transition-shadow duration-150 focus:shadow-[inset_0_0_0_1px_var(--acc)]"
								style={{ background: "var(--sunk)" }}
							/>
						</div>

						<button
							type="button"
							onClick={() => setNotify((v) => !v)}
							className="mt-3.5 flex shrink-0 cursor-pointer items-center gap-2.5 text-left"
						>
							<span
								className="flex h-[18px] w-[30px] shrink-0 items-center rounded-full px-[2px] transition-colors duration-150"
								style={{ background: notify ? "var(--acc)" : "var(--line-lift)" }}
							>
								<span
									className="block size-[14px] rounded-full transition-transform duration-150"
									style={{
										background: "var(--acc-ink)",
										transform: notify ? "translateX(12px)" : "translateX(0)",
									}}
								/>
							</span>
							<span className="text-[12.5px] text-[var(--t2)]">Post in #general on the start date</span>
						</button>

						<div className="mt-auto flex shrink-0 items-center gap-2 pt-4">
							<Note>Answering writes the Group and the Slack channels.</Note>
							<span className="ml-auto flex items-center gap-2">
								<Btn kind="quiet" height={34} className="px-3 text-[13px]">
									Deny
								</Btn>
								<Btn kind="primary" height={34} className="px-3.5 text-[13px]" onClick={() => setAnswered(true)}>
									Answer
								</Btn>
							</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/* ---------- spool's own chrome ---------- */

const BAR_H = 44;
const RAIL_W = 248;
const STRIP_W = 44;
/** the shipped window this page is a screenshot of */
const STAGE_W = 1440;
const STAGE_H = 620;
const FIELD_W = STAGE_W - RAIL_W - STRIP_W;
const FIELD_H = STAGE_H - BAR_H;

/** shellRadius at 1:1, from canvas.tsx */
const SHELL_RADIUS = 12;
/** overlays.tsx: min(12, shellRadius * k) + 2, which is 14 at every usable zoom */
const RING_RADIUS = 14;
/** frame-label.tsx: the label's own pb-2.5 */
const LABEL_GAP = 10;
const LABEL_H = 16;

/** frame-label.tsx, whole: the name, the unseen mark, and play on the selection. */
export function FrameLabel({
	name,
	width,
	selected = false,
	unseen,
}: {
	name: string;
	width: number;
	selected?: boolean;
	unseen?: "new" | "changed";
}) {
	return (
		<div className="flex min-w-0 items-center gap-1.5 pb-2.5" style={{ width }}>
			{unseen === undefined ? null : <UnseenMark mark={unseen} className="-ml-0.5" />}
			<span
				className={cn(
					"min-w-0 truncate text-sm leading-4",
					MONO,
					selected ? "text-thread" : unseen === undefined ? "text-muted" : "text-text",
				)}
			>
				{name}
			</span>
			{selected ? (
				<span
					className={cn(
						"ml-auto flex shrink-0 items-center gap-1 rounded-xs px-1 text-2xs text-muted leading-3",
						MONO,
					)}
				>
					<PlayTri className="h-2 w-2" />
					play
				</span>
			) : null}
		</div>
	);
}

/** overlays.tsx: the ring, its four handles, and the size chip under it. */
function SelectionRing({ w, h, size = true }: { w: number; h: number; size?: boolean }) {
	const handle = "absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";
	return (
		<div className="pointer-events-none absolute inset-0">
			<div
				className="-inset-[3px] absolute border-[1.5px] border-thread"
				style={{ borderRadius: RING_RADIUS }}
			/>
			<span className={cn(handle, "-left-[7px] -top-[7px]")} />
			<span className={cn(handle, "-right-[7px] -top-[7px]")} />
			<span className={cn(handle, "-left-[7px] -bottom-[7px]")} />
			<span className={cn(handle, "-right-[7px] -bottom-[7px]")} />
			{size ? (
				<span
					className={cn(
						"-translate-x-1/2 absolute left-1/2 rounded-xs bg-thread px-2 py-[3px] text-2xs text-on-thread leading-3",
						MONO,
					)}
					style={{ top: "calc(100% + 14px)" }}
				>
					{w} × {h}
				</span>
			) : null}
		</div>
	);
}

/**
 * One frame standing on the field: its label above, the document rounded at
 * shellRadius with no border of its own, and the ring when it is the selection.
 * `k` is the camera's zoom: the document scales, the label and the ring do not,
 * which is what the canvas does.
 */
export function FieldFrame({
	name,
	x,
	y,
	dw,
	dh,
	k = 1,
	selected = false,
	size = true,
	unseen,
	children,
}: {
	name: string;
	x: number;
	y: number;
	/** the document's own size, which is what the size chip reports */
	dw: number;
	dh: number;
	k?: number;
	selected?: boolean;
	size?: boolean;
	unseen?: "new" | "changed";
	children: ReactNode;
}) {
	const w = dw * k;
	const h = dh * k;
	return (
		<div className="absolute" style={{ left: x, top: y - LABEL_H - LABEL_GAP }}>
			<FrameLabel
				name={name}
				width={w}
				selected={selected}
				{...(unseen === undefined ? {} : { unseen })}
			/>
			<div className="relative" style={{ width: w, height: h }}>
				<div
					className="overflow-hidden"
					style={{
						width: dw,
						height: dh,
						transform: `scale(${k})`,
						transformOrigin: "top left",
						borderRadius: SHELL_RADIUS / k,
					}}
				>
					{children}
				</div>
				{selected ? <SelectionRing w={dw} h={dh} size={size} /> : null}
			</div>
		</div>
	);
}

/**
 * flow-arrows.tsx's cubic, its constants included: tangents leave perpendicular
 * to the side they touch and bow with distance, never under 40.
 */
export function ThreadArrow({
	x1,
	y1,
	x2,
	y2,
	w,
	h,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	w: number;
	h: number;
}) {
	const end = x2 - 10;
	const bow = Math.max(40, Math.hypot(end - x1, y2 - y1) * 0.4);
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0 overflow-visible"
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			fill="none"
		>
			<path
				d={`M ${x1} ${y1} C ${x1 + bow} ${y1}, ${end - bow} ${y2}, ${end} ${y2}`}
				stroke="var(--color-thread)"
				strokeWidth={1.5}
			/>
			<path d={`M ${x2} ${y2} L ${end} ${y2 - 4.5} L ${end} ${y2 + 4.5} Z`} fill="var(--color-thread)" />
		</svg>
	);
}

/** app.tsx: the header, the tab strip in it, and the zoom read-out. */
function AppBar({ width }: { width: number }) {
	return (
		<div
			className="absolute top-0 left-0 flex items-center justify-between border-border border-b bg-bg px-4"
			style={{ width, height: BAR_H }}
		>
			<div className="flex h-full items-center gap-5">
				<span className="flex items-center gap-2">
					<SpoolMark className="h-[18px] w-3.5 text-thread" />
					<span className="font-semibold text-md text-text leading-sm tracking-tight">spool</span>
				</span>
				<nav className="relative flex items-center gap-unit">
					{["chamfer", "spool"].map((tab, i) => (
						<span
							key={tab}
							className={cn(
								"flex h-[26px] items-center rounded-md",
								i === 0 && "border border-border-raised bg-raised",
							)}
						>
							<span
								className={cn(
									"flex h-full items-center pr-1 pl-3 text-base leading-none",
									i === 0 ? "font-medium text-text" : "text-muted",
								)}
							>
								{tab}
							</span>
						</span>
					))}
					<span className="flex h-[26px] w-[26px] items-center justify-center rounded-sm text-muted">
						<PlusIcon className="h-2.5 w-2.5" />
					</span>
				</nav>
			</div>
			<div className="flex h-full items-center gap-4">
				<span className="flex h-7 w-7 items-center justify-center rounded-sm text-text">
					<EdgeIcon />
				</span>
				<span className={cn("min-w-9 text-right text-muted text-xs leading-xs", MONO)}>24%</span>
			</div>
		</div>
	);
}

/* sidebar.tsx + rail-rows.ts */
const PAGE_ROW = 32;
const FRAME_ROW = 28;
const INDENT = 10;
const contentX = (depth: number) => depth * INDENT + 24;
const guideX = (depth: number) => (depth - 1) * INDENT + 18;

interface RailPage {
	name: string;
	frames: readonly { name: string; unseen?: "new" | "changed" }[];
	open?: boolean;
	active?: boolean;
	total: number;
}

const RAIL_PAGES: readonly RailPage[] = [
	{
		name: "runs",
		open: true,
		active: true,
		total: 14,
		frames: [
			{ name: "pt-graph" },
			{ name: "pt-journal" },
			{ name: "pt-journal--failed", unseen: "new" },
			{ name: "pt-journal--waiting" },
			{ name: "pt-runs" },
		],
	},
	{ name: "home", frames: [], total: 3 },
	{ name: "inbox", frames: [], total: 12 },
];

function PagesRail({ height, selected }: { height: number; selected: string }) {
	return (
		<div
			className="absolute left-0 flex flex-col border-border border-r bg-bg"
			style={{ top: BAR_H, width: RAIL_W, height }}
		>
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
				<div className="flex items-baseline gap-2">
					<span className="font-semibold text-base leading-base">Pages</span>
					<span className={cn("text-muted text-xs leading-xs", MONO)}>{RAIL_PAGES.length}</span>
				</div>
				<div className="flex items-center">
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<PlusIcon className="h-2.5 w-2.5" />
					</span>
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<FoldIcon className="h-2.5 w-2.5" />
					</span>
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<PanelCaret dir="left" className="h-3.5 w-2.5" />
					</span>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden py-2">
				{RAIL_PAGES.map((page) => (
					<div key={page.name}>
						<div
							className={cn(
								"relative flex items-center pr-1.5",
								page.active === true && "bg-surface",
							)}
							style={{ height: PAGE_ROW }}
						>
							{page.active === true ? (
								<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<span className="flex h-full w-6 shrink-0 items-center justify-center">
								<ChevronIcon open={page.open === true} className="h-2.5 w-2.5" />
							</span>
							<span className="flex h-full min-w-0 flex-1 items-center gap-2 pr-3">
								<FolderIcon
									className={cn("h-3.5 w-3.5 shrink-0", page.active === true ? "text-thread" : "text-muted")}
								/>
								<span
									className={cn(
										"min-w-0 flex-1 truncate text-sm leading-sm",
										MONO,
										page.active === true ? "text-text" : "text-muted",
									)}
								>
									{page.name}
								</span>
							</span>
							<span className={cn("shrink-0 text-2xs text-muted/60 leading-3", MONO)}>{page.total}</span>
						</div>
						{page.open === true
							? page.frames.map((frame, i) => {
									const last = i === page.frames.length - 1;
									const isSelected = frame.name === selected;
									return (
										<div
											key={frame.name}
											className={cn("relative flex items-center", isSelected && "bg-surface")}
											style={{ height: FRAME_ROW }}
										>
											<span
												className="absolute w-px bg-border-raised"
												style={{ left: guideX(1), top: 0, height: last ? FRAME_ROW - 6 : FRAME_ROW }}
											/>
											<span
												className="absolute h-px w-2.5 bg-border-raised"
												style={{ left: guideX(1), top: FRAME_ROW / 2 }}
											/>
											<span
												className="flex h-full w-full min-w-0 items-center gap-2 pr-3"
												style={{ paddingLeft: contentX(1) }}
											>
												<FrameIcon
													className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-thread" : "text-muted")}
												/>
												<span
													className={cn(
														"min-w-0 flex-1 truncate text-xs leading-xs",
														MONO,
														isSelected || frame.unseen !== undefined ? "text-text" : "text-muted",
													)}
												>
													{frame.name}
												</span>
												{frame.unseen === undefined ? null : <UnseenMark mark={frame.unseen} />}
											</span>
										</div>
									);
								})
							: null}
					</div>
				))}
			</div>
			<div
				className={cn(
					"flex h-9 shrink-0 items-center justify-between border-border border-t px-3.5 text-2xs text-muted leading-3",
					MONO,
				)}
			>
				<span>folder switches page</span>
			</div>
		</div>
	);
}

/** dock.tsx: the column's index, 44 wide, properties over agent. */
function DockStrip({ left, top, height }: { left: number; top: number; height: number }) {
	return (
		<div
			className="absolute flex flex-col items-center gap-1 border-border border-l bg-bg pt-1.5"
			style={{ left, top, width: STRIP_W, height }}
		>
			<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted/70">
				<PropertiesIcon />
			</span>
			<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted/70">
				<AgentIcon />
			</span>
		</div>
	);
}

/** canvas-tools.tsx: three tools, select held. */
function CanvasTools() {
	const tools = [
		{ id: "select", Icon: SelectIcon },
		{ id: "edit", Icon: EditIcon },
		{ id: "hand", Icon: HandIcon },
	];
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
			<div className="flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1">
				{tools.map((meta) => (
					<span
						key={meta.id}
						className={cn(
							"flex h-9 w-9 items-center justify-center rounded-md",
							meta.id === "select" ? "bg-raised text-text" : "text-muted",
						)}
					>
						<meta.Icon className="h-[18px] w-[18px]" />
					</span>
				))}
			</div>
		</div>
	);
}

/* ---------- the hero: the window, cropped like a screenshot ---------- */

/**
 * The camera sits at 24%, which is where five 1440 by 900 frames stand in one
 * field: the walk across the top and the two journal siblings under it. The
 * graph is the third seat in the walk, so it is the one that runs off the right
 * edge, and how much of it a visitor sees depends on how wide the plate is. A
 * canvas that ends at the plate edge is a diagram; one that runs off it is a
 * screenshot.
 */
const HERO_K = 0.24;
const HERO_W = APP_W * HERO_K;
const HERO_H = APP_H * HERO_K;
const HERO_GAP = 42;

const HOME = { x: 36, y: 58 };
const RUNS = { x: 36 + HERO_W + HERO_GAP, y: 58 };
const GRAPH = { x: 36 + (HERO_W + HERO_GAP) * 2, y: 58 };
const JOURNAL = { x: 140, y: 58 + HERO_H + 62 };
const JOURNAL_FAILED = { x: 140 + HERO_W + HERO_GAP, y: 58 + HERO_H + 62 };

function CanvasField() {
	const mid = HERO_H / 2;
	return (
		<div
			className="absolute overflow-hidden bg-canvas"
			style={{ left: RAIL_W, top: BAR_H, width: FIELD_W, height: FIELD_H }}
		>
			<ThreadArrow
				x1={HOME.x + HERO_W}
				y1={HOME.y + mid}
				x2={RUNS.x}
				y2={RUNS.y + mid}
				w={FIELD_W}
				h={FIELD_H}
			/>
			<ThreadArrow
				x1={RUNS.x + HERO_W}
				y1={RUNS.y + mid}
				x2={GRAPH.x}
				y2={GRAPH.y + mid}
				w={FIELD_W}
				h={FIELD_H}
			/>
			<FieldFrame name="pt-home" x={HOME.x} y={HOME.y} dw={APP_W} dh={APP_H} k={HERO_K}>
				<HomeScreen />
			</FieldFrame>
			<FieldFrame name="pt-runs" x={RUNS.x} y={RUNS.y} dw={APP_W} dh={APP_H} k={HERO_K} selected>
				<RunsScreen />
			</FieldFrame>
			<FieldFrame name="pt-graph" x={GRAPH.x} y={GRAPH.y} dw={APP_W} dh={APP_H} k={HERO_K}>
				<GraphScreen />
			</FieldFrame>
			<FieldFrame name="pt-journal" x={JOURNAL.x} y={JOURNAL.y} dw={APP_W} dh={APP_H} k={HERO_K}>
				<JournalScreen />
			</FieldFrame>
			<FieldFrame
				name="pt-journal--failed"
				x={JOURNAL_FAILED.x}
				y={JOURNAL_FAILED.y}
				dw={APP_W}
				dh={APP_H}
				k={HERO_K}
				unseen="new"
			>
				<JournalScreen take="failed" />
			</FieldFrame>
			<CanvasTools />
		</div>
	);
}

export function CanvasPlate({ w, h, scale = 1 }: { w: number; h: number; scale?: number }) {
	return (
		<div className="relative overflow-hidden bg-canvas" style={{ width: w, height: h }} aria-hidden="true">
			<div
				className="absolute top-0 left-0 origin-top-left"
				style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
			>
				<CanvasField />
				<AppBar width={STAGE_W} />
				<PagesRail height={FIELD_H} selected="pt-runs" />
				<DockStrip left={STAGE_W - STRIP_W} top={BAR_H} height={FIELD_H} />
			</div>
		</div>
	);
}

/* ---------- section one: the running frame ---------- */

/** label + document + the 14px gap and the size chip under it */
const SELECTED_H = LABEL_H + LABEL_GAP + ASK_H + 30;

export function LivePlate({ w, h }: { w: number; h: number }) {
	return (
		<div className="relative overflow-hidden bg-canvas" style={{ width: w, height: h }}>
			<FieldFrame
				name="pt-ask"
				x={(w - ASK_W) / 2}
				y={(h - SELECTED_H) / 2 + LABEL_H + LABEL_GAP}
				dw={ASK_W}
				dh={ASK_H}
				selected
			>
				<AskScreen />
			</FieldFrame>
		</div>
	);
}

/* ---------- section two: four takes at once ---------- */

const TAKES: readonly { name: string; take: JournalTake; kept?: boolean }[] = [
	{ name: "pt-journal", take: "running" },
	{ name: "pt-journal--failed", take: "failed", kept: true },
	{ name: "pt-journal--waiting", take: "waiting" },
	{ name: "pt-journal--queued", take: "queued" },
];

export function TakesPlate({ w, h, k = 0.172 }: { w: number; h: number; k?: number }) {
	const cellW = APP_W * k;
	const cellH = APP_H * k + LABEL_H + LABEL_GAP;
	const gapX = 40;
	const gapY = 40;
	const x0 = (w - (cellW * 2 + gapX)) / 2;
	const y0 = (h - (cellH * 2 + gapY)) / 2 + LABEL_H + LABEL_GAP;
	return (
		<div className="relative overflow-hidden bg-canvas" style={{ width: w, height: h }} aria-hidden="true">
			{TAKES.map((take, i) => (
				<FieldFrame
					key={take.name}
					name={take.name}
					x={x0 + (i % 2) * (cellW + gapX)}
					y={y0 + Math.floor(i / 2) * (cellH + gapY)}
					dw={APP_W}
					dh={APP_H}
					k={k}
					selected={take.kept === true}
					size={false}
				>
					<JournalScreen take={take.take} />
				</FieldFrame>
			))}
		</div>
	);
}

/* ---------- section three: the folder ---------- */

interface TreeRow {
	depth: number;
	name: string;
	dir?: boolean;
	lit?: boolean;
}

const TREE: readonly TreeRow[] = [
	{ depth: 0, name: "chamfer/", dir: true },
	{ depth: 1, name: "src/", dir: true },
	{ depth: 1, name: "design/", dir: true, lit: true },
	{ depth: 2, name: "frames/", dir: true },
	{ depth: 3, name: "runs/", dir: true },
	{ depth: 4, name: "pt-graph/", dir: true },
	{ depth: 4, name: "pt-journal/", dir: true },
	{ depth: 5, name: "frame.tsx", lit: true },
	{ depth: 5, name: "frame.json" },
	{ depth: 4, name: "pt-runs/", dir: true },
	{ depth: 3, name: "home/", dir: true },
	{ depth: 2, name: "shared/", dir: true },
	{ depth: 3, name: "ui/", dir: true },
	{ depth: 3, name: "tokens.css" },
	{ depth: 1, name: "package.json" },
];

/** pt-journal/frame.tsx, as it would really read: one component, one flow call out. */
const SOURCE: readonly { indent: number; text: string; dim?: boolean }[] = [
	{ indent: 0, text: 'import { ui } from "spool";', dim: true },
	{ indent: 0, text: "" },
	{ indent: 0, text: "export default function Journal() {" },
	{ indent: 1, text: 'const [step, pick] = useState("update");' },
	{ indent: 1, text: "const entry = JOURNAL[step];" },
	{ indent: 1, text: "return (" },
	{ indent: 2, text: '<Run head={HRIS} tab="journal">' },
	{ indent: 3, text: "<Steps rows={JOURNAL} picked={step}" },
	{ indent: 4, text: "onPick={pick} />" },
	{ indent: 3, text: "<Detail entry={entry}" },
	{ indent: 4, text: 'onGraph={() => ui.go("pt-graph")} />' },
	{ indent: 2, text: "</Run>" },
	{ indent: 1, text: ");" },
	{ indent: 0, text: "}" },
];

export function RepoPlate({ w, h }: { w: number; h: number }) {
	return (
		<div className="relative flex overflow-hidden bg-canvas" style={{ width: w, height: h }} aria-hidden="true">
			<div className="w-[196px] shrink-0 border-border border-r py-5 pl-5">
				{TREE.map((r) => (
					<div
						key={r.depth + r.name}
						className={cn(
							"flex h-[22px] items-center gap-1.5 text-[10px] leading-none",
							MONO,
							r.lit === true ? "text-thread" : r.dir === true ? "text-muted" : "text-text/70",
						)}
						style={{ paddingLeft: r.depth * 11 }}
					>
						{r.dir === true ? (
							<FolderIcon className="h-[11px] w-[11px] shrink-0" />
						) : (
							<FrameIcon className="h-[11px] w-[11px] shrink-0" />
						)}
						<span className="truncate">{r.name}</span>
					</div>
				))}
			</div>
			<div className="flex min-w-0 flex-1 flex-col">
				<div
					className={cn(
						"flex h-[34px] shrink-0 items-center border-border border-b px-5 text-[10px] text-muted leading-none",
						MONO,
					)}
				>
					design/frames/runs/pt-journal/frame.tsx
				</div>
				<div className="flex-1 px-5 py-4">
					{SOURCE.map((l, i) => (
						<div
							key={`l${i}`}
							className={cn(
								"h-[19px] whitespace-pre text-[10.5px] leading-[19px]",
								MONO,
								l.dim === true ? "text-muted/70" : "text-text/75",
							)}
						>
							{"  ".repeat(l.indent)}
							{l.text}
						</div>
					))}
				</div>
				<div
					className={cn(
						"flex h-[34px] shrink-0 items-center border-border border-t px-5 text-[10px] text-muted leading-none",
						MONO,
					)}
				>
					tracked by git · nothing leaves this machine
				</div>
			</div>
		</div>
	);
}

/* ---------- section four: what arrived, and what you do with it ---------- */

/**
 * A crop of the field beside the column's index: the frame the agent wrote while
 * the canvas was elsewhere, wearing the unseen mark and the ring you put on it,
 * with the thread you drew arriving from a frame off the left edge. Every mark
 * here is one the canvas draws.
 */
export function DirectPlate({ w, h, k = 0.33 }: { w: number; h: number; k?: number }) {
	const fw = APP_W * k;
	const fh = APP_H * k;
	const x = 18;
	// pulled up so the size chip clears the tool bar the canvas keeps at the bottom
	const y = (h - fh) / 2 - 16;
	return (
		<div className="relative overflow-hidden bg-canvas" style={{ width: w, height: h }} aria-hidden="true">
			<ThreadArrow x1={-46} y1={y + fh / 2} x2={x} y2={y + fh / 2} w={w} h={h} />
			<FieldFrame
				name="pt-journal--failed"
				x={x}
				y={y}
				dw={APP_W}
				dh={APP_H}
				k={k}
				selected
				unseen="new"
			>
				<JournalScreen take="failed" />
			</FieldFrame>
			<DockStrip left={w - STRIP_W} top={0} height={h} />
			<CanvasTools />
		</div>
	);
}
