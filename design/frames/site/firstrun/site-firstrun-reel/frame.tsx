import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-firstrun--reel. The spool.page landing as a reel: the first ten minutes
 * read in order, one pose at a time, with scroll as the only control.
 *
 * The mechanism is a held plate. The right column parks one 712x445 plate at eye
 * height and never moves it; the left column scrolls eight captions past it and
 * the plate swaps pose to match. So the eight steps read as one screen changing
 * rather than eight pictures side by side, which is what the first run actually
 * is: the same window, filling up.
 *
 * Every pose is a still and says so — a mono strip under the plate carries the
 * word "still" and the locator that pose is about (a command, a path, a count).
 * Nothing in a pose is a hit target, because none of it could do anything.
 *
 * The eight are the real order: install, or the app; the empty first run; "+" on
 * a folder you already have; the project with nothing in it; the first frame
 * arriving; a second project; and spool's own design/ at 142 frames.
 */

/* ---------- page geometry, all fixed ---------- */

const PAGE_L = 160; // left margin
const PAGE_R = 96; // right margin
const SPINE_X = 112; // the thread down the margin
const COL_L = 400; // caption column
const COL_GAP = 72;

const HERO_H = 880;
const STEP_H = 400;
const PLATE_TOP = 210; // where the held plate parks inside the viewport

const PLATE_W = 712;
const PLATE_H = 445;

const M_BAR = 28; // the plate's app bar
const M_RAIL = 150; // the plate's pages rail

const EASE = [0.22, 1, 0.36, 1] as const;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

const dots: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "13px 13px",
};

/* ---------- small marks ---------- */

function PlusGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	);
}

function FolderGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Caret({ open, className }: { open: boolean; className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={cn(open && "rotate-90", className)} fill="none" aria-hidden="true">
			<path
				d="m4 2.5 3.5 3.5L4 9.5"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function SearchGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" className={className} fill="none" aria-hidden="true">
			<circle cx="5.25" cy="5.25" r="3.25" stroke="currentColor" strokeWidth="1.2" />
			<path d="m7.75 7.75 2.25 2.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
		</svg>
	);
}

function DownGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 14" fill="none" aria-hidden="true" className={className}>
			<path
				d="M6 1.5v9M2.5 7 6 10.5 9.5 7"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M3.25 2 10 6l-6.75 4Z" />
		</svg>
	);
}

/** the thread's node in the left margin, filled while its step is the one held */
function SpineNode({ y, lit }: { y: number; lit: boolean }) {
	return (
		<span className="absolute block h-[9px] w-[9px]" style={{ left: SPINE_X - 4, top: y }}>
			<span
				className={cn(
					"absolute inset-0 rounded-full border-[1.5px] transition-colors duration-300",
					lit ? "border-thread bg-thread" : "border-border-raised bg-bg",
				)}
			/>
			{lit ? <span className="-inset-[5px] absolute rounded-full border border-thread/30" /> : null}
		</span>
	);
}

/* ---------- the copy line for a command, with real copy-to-clipboard ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function CommandLine({ prompt, command }: { prompt: string; command: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	return (
		<button
			type="button"
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1400);
				});
			}}
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			className="group/cmd block w-full cursor-pointer text-left font-mono text-[15px] leading-[30px] focus-visible:outline-none"
		>
			<span className="select-none text-muted">{prompt} </span>
			<span className="text-text">{command}</span>
			<span
				className={cn(
					"ml-3 select-none font-mono text-2xs transition-opacity duration-150",
					copied ? "text-thread opacity-100" : "text-muted opacity-0 group-hover/cmd:opacity-100",
				)}
			>
				{copied ? "copied" : "copy"}
			</span>
		</button>
	);
}

/* ---------- the plate's chrome: spool's own geometry, drawn small ---------- */

function MiniBar({ tabs, active, litPlus }: { tabs: readonly string[]; active: string; litPlus: boolean }) {
	return (
		<div
			className="flex shrink-0 items-center justify-between border-border border-b bg-bg px-2.5"
			style={{ height: M_BAR }}
		>
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-1.5">
					<SpoolMark className="h-3 w-[9px] text-thread" />
					<span className="font-semibold text-[10px] leading-none tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-1">
					{tabs.map((tab) => (
						<span
							key={tab}
							className={cn(
								"flex h-[17px] items-center rounded-[4px] px-2 font-mono text-[9px] leading-none",
								tab === active ? "border border-border-raised bg-raised text-text" : "text-muted",
							)}
						>
							{tab}
						</span>
					))}
					<span className="relative flex h-[17px] w-[17px] items-center justify-center rounded-[4px] text-muted">
						{litPlus ? (
							<span className="-inset-[3px] absolute rounded-[6px] border border-thread" />
						) : null}
						<PlusGlyph className={cn("h-2 w-2", litPlus && "text-thread")} />
					</span>
				</div>
			</div>
			<div className="flex items-center gap-2 font-mono text-[9px] text-muted leading-none">
				<span>72%</span>
			</div>
		</div>
	);
}

interface RailPage {
	name: string;
	count: number;
	open?: boolean;
	frames?: readonly string[];
	active?: boolean;
}

function MiniRail({ pages }: { pages: readonly RailPage[] }) {
	return (
		<aside
			className="flex shrink-0 flex-col overflow-hidden border-border border-r bg-bg"
			style={{ width: M_RAIL }}
		>
			<div
				className="flex shrink-0 items-baseline gap-1.5 border-border border-b px-2.5"
				style={{ height: M_BAR }}
			>
				<span className="self-center font-semibold text-[10px] leading-none">Pages</span>
				<span className="self-center font-mono text-[9px] text-muted leading-none">{pages.length}</span>
			</div>
			<div className="min-h-0 flex-1 py-1">
				{pages.map((page) => (
					<div key={page.name}>
						<div
							className={cn(
								"relative flex h-[19px] items-center gap-1.5 pr-2 pl-1.5",
								page.active === true && "bg-surface",
							)}
						>
							{page.active === true ? (
								<span className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<Caret
								open={page.open === true}
								className="h-2 w-2 shrink-0 text-muted/70"
							/>
							<FolderGlyph
								className={cn("h-2.5 w-2.5 shrink-0", page.active === true ? "text-thread" : "text-muted")}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 truncate font-mono text-[9px] leading-none",
									page.active === true ? "text-text" : "text-muted",
								)}
							>
								{page.name}
							</span>
							<span className="font-mono text-[8px] text-muted/60 leading-none">{page.count}</span>
						</div>
						{page.open === true && page.frames !== undefined ? (
							<div className="relative pb-0.5">
								<span className="absolute top-0 bottom-1 left-[13px] w-px bg-border-raised" />
								{page.frames.map((frame) => (
									<div key={frame} className="relative flex h-[17px] items-center">
										<span className="absolute top-1/2 left-[13px] h-px w-2 bg-border-raised" />
										<span className="truncate pl-[25px] font-mono text-[9px] text-muted leading-none">
											{frame}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>
				))}
			</div>
		</aside>
	);
}

function MiniField({ children }: { children?: ReactNode }) {
	return (
		<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas" style={dots}>
			{children}
		</div>
	);
}

/** a frame standing on the plate's field: name tab above, body below */
function MiniFrame({
	x,
	y,
	w,
	h,
	name,
	ringed = false,
	children,
}: {
	x: number;
	y: number;
	w: number;
	h: number;
	name: string;
	ringed?: boolean;
	children?: ReactNode;
}) {
	return (
		<div className="absolute" style={{ left: x, top: y, width: w }}>
			<div className="mb-1 flex items-center gap-1 pl-px font-mono text-[8px] leading-none">
				<span className={ringed ? "text-thread" : "text-muted/70"}>{ringed ? "▶" : "▸"}</span>
				<span className={ringed ? "text-thread" : "text-muted"}>{name}</span>
			</div>
			<div className="relative">
				<div className="overflow-hidden rounded-[3px] border border-border bg-surface" style={{ height: h }}>
					{children}
				</div>
				{ringed ? <span className="-inset-[2px] absolute rounded-[5px] border-[1.5px] border-thread" /> : null}
			</div>
		</div>
	);
}

/** the generic contents of a frame on the field: bars, never words */
function FrameSkeleton({ shape }: { shape: number }) {
	if (shape === 1) {
		return (
			<div className="space-y-1.5 p-2">
				<div className="h-[7px] w-[62%] rounded-[1px] bg-raised" />
				<div className="h-[3px] w-[86%] rounded-full bg-border-raised" />
				<div className="h-[3px] w-[54%] rounded-full bg-border-raised" />
				<div className="mt-2 h-[9px] w-[40%] rounded-[2px] bg-thread/70" />
			</div>
		);
	}
	if (shape === 2) {
		return (
			<div className="flex h-full">
				<div className="w-[38%] border-border border-r bg-canvas" />
				<div className="flex-1 space-y-1.5 p-2">
					<div className="h-[6px] w-[70%] rounded-[1px] bg-raised" />
					<div className="h-[3px] w-[80%] rounded-full bg-border-raised" />
					<div className="h-[3px] w-[58%] rounded-full bg-border-raised" />
				</div>
			</div>
		);
	}
	return (
		<div className="flex h-full flex-col p-2">
			<div className="h-[44%] rounded-[2px] bg-raised/60" />
			<div className="mt-2 space-y-1.5">
				<div className="h-[3px] w-[74%] rounded-full bg-border-raised" />
				<div className="h-[3px] w-[46%] rounded-full bg-border-raised" />
			</div>
		</div>
	);
}

/* ---------- the eight poses ---------- */

const TERMINAL_LINES: readonly { prompt?: string; text: string; tone: "cmd" | "out" | "thread" }[] = [
	{ prompt: "~ $", text: "npm i -g spool.page", tone: "cmd" },
	{ text: "added 1 package in 4s", tone: "out" },
	{ text: "", tone: "out" },
	{ prompt: "~ $", text: "cd tvarso", tone: "cmd" },
	{ prompt: "~/tvarso $", text: "spool init", tone: "cmd" },
	{ text: "design/ scaffolded · project registered", tone: "out" },
	{ text: "daemon on http://localhost:7766", tone: "thread" },
	{ text: "opening the canvas in Chrome", tone: "out" },
];

function PoseInstall() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="flex h-full flex-col bg-bg">
			<div
				className="flex shrink-0 items-center gap-1.5 border-border border-b px-3"
				style={{ height: M_BAR }}
			>
				<span className="h-[7px] w-[7px] rounded-full border border-border-raised" />
				<span className="ml-1.5 font-mono text-[9px] text-muted leading-none">~/tvarso</span>
			</div>
			<div className="flex-1 px-4 py-3.5 font-mono text-[13px] leading-[26px]">
				{TERMINAL_LINES.map((line, i) => (
					<div key={`${line.text}-${String(i)}`} className="flex gap-2">
						{line.prompt === undefined ? null : <span className="text-muted">{line.prompt}</span>}
						<span
							className={
								line.tone === "cmd" ? "text-text" : line.tone === "thread" ? "text-thread" : "text-muted"
							}
						>
							{line.text}
						</span>
					</div>
				))}
				<div className="flex gap-2">
					<span className="text-muted">~/tvarso $</span>
					<motion.span
						className="mt-[9px] block h-[13px] w-[7px] bg-thread"
						animate={reduce ? undefined : { opacity: [1, 0.1] }}
						transition={{
							duration: 0.7,
							repeat: Number.POSITIVE_INFINITY,
							repeatType: "reverse",
							ease: "easeInOut",
						}}
					/>
				</div>
			</div>
		</div>
	);
}

function PoseApp() {
	return (
		<div className="flex h-full flex-col bg-bg">
			<div
				className="flex shrink-0 items-center border-border border-b px-3"
				style={{ height: M_BAR }}
			>
				<span className="font-mono text-[9px] text-muted leading-none">Spool.dmg</span>
			</div>
			<div className="flex flex-1 items-center justify-center gap-14 bg-canvas">
				<div className="flex flex-col items-center gap-3">
					<div className="flex h-[86px] w-[86px] items-center justify-center rounded-[18px] border border-border-raised bg-bg">
						<SpoolMark className="h-9 w-7 text-thread" />
					</div>
					<span className="font-mono text-[11px] text-text leading-none">Spool.app</span>
				</div>
				<svg viewBox="0 0 64 12" className="h-3 w-16 text-border-raised" fill="none" aria-hidden="true">
					<path d="M0 6h56" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 4" />
					<path d="m56 1.5 6 4.5-6 4.5Z" fill="currentColor" />
				</svg>
				<div className="flex flex-col items-center gap-3">
					<div className="flex h-[86px] w-[86px] items-center justify-center rounded-[18px] border border-border bg-surface">
						<FolderGlyph className="h-9 w-9 text-muted/60" />
					</div>
					<span className="font-mono text-[11px] text-muted leading-none">Applications</span>
				</div>
			</div>
		</div>
	);
}

function PoseHome() {
	return (
		<div className="flex h-full flex-col">
			<MiniBar tabs={[]} active="" litPlus={true} />
			<div className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-bg">
				<SpoolMark className="h-6 w-[19px] text-thread opacity-35" />
				<p className="mt-3 font-medium text-[13px] leading-none">No projects open.</p>
				<p className="mt-2.5 font-mono text-[10px] text-muted leading-none">
					press + and point spool at a folder
				</p>
				{/* the callout: a hairline from the "+" down to the label, nothing clickable */}
				<svg
					className="pointer-events-none absolute top-0 left-0 h-full w-full"
					viewBox={`0 0 ${PLATE_W} ${PLATE_H - M_BAR}`}
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M74.5 8.5 74.5 46.5 132.5 46.5"
						stroke="color-mix(in srgb, var(--color-text) 24%, transparent)"
						strokeWidth="1"
					/>
				</svg>
				<span className="absolute font-mono text-[10px] leading-none" style={{ left: 138, top: 41 }}>
					<span className="text-text">press +</span>
					<span className="text-muted"> · any folder on disk</span>
				</span>
			</div>
		</div>
	);
}

const PICKER_ROWS: readonly { name: string; note: string }[] = [
	{ name: "tvarso", note: "~/tvarso" },
	{ name: "kaffe", note: "~/code/kaffe" },
	{ name: "scratch", note: "~/scratch" },
	{ name: "spool", note: "~/projects/spool" },
];

function PosePicker() {
	return (
		<div className="flex h-full flex-col">
			<MiniBar tabs={[]} active="" litPlus={true} />
			<div className="relative flex min-h-0 flex-1 items-center justify-center bg-bg">
				<div className="absolute inset-0 bg-bg/70" />
				<div className="relative w-[320px] overflow-hidden rounded-[6px] border border-border-raised bg-surface">
					<div className="flex items-center gap-2 border-border border-b px-3 py-2.5">
						<SearchGlyph className="h-3 w-3 shrink-0 text-muted" />
						<span className="font-mono text-[11px] text-text leading-none">tva</span>
						<span className="block h-[11px] w-px bg-thread" />
					</div>
					<div className="py-1.5">
						{PICKER_ROWS.map((row, i) => (
							<div
								key={row.name}
								className={cn("flex h-[24px] items-center gap-2 px-3", i === 0 && "bg-raised")}
							>
								<FolderGlyph
									className={cn("h-3 w-3 shrink-0", i === 0 ? "text-thread" : "text-muted")}
								/>
								<span
									className={cn(
										"font-mono text-[10px] leading-none",
										i === 0 ? "text-text" : "text-muted",
									)}
								>
									{row.name}
								</span>
								<span className="ml-auto font-mono text-[9px] text-muted/55 leading-none">{row.note}</span>
							</div>
						))}
					</div>
					<div className="border-border border-t px-3 py-2 font-mono text-[9px] text-muted/60 leading-none">
						↑↓ to move · ⏎ to open
					</div>
				</div>
			</div>
		</div>
	);
}

function PoseEmpty() {
	return (
		<div className="flex h-full flex-col">
			<MiniBar tabs={["tvarso"]} active="tvarso" litPlus={false} />
			<div className="flex min-h-0 flex-1">
				<MiniRail pages={[{ name: "frames", count: 0, active: true, open: true, frames: [] }]} />
				<MiniField>
					<div className="flex h-full flex-col items-center justify-center gap-2.5">
						<SpoolMark className="h-5 w-4 text-thread opacity-35" />
						<p className="font-medium text-[12px] leading-none">No frames yet.</p>
						<p className="font-mono text-[10px] text-muted leading-none">
							an agent births a frame by writing frames/&lt;name&gt;/frame.tsx
						</p>
					</div>
				</MiniField>
			</div>
		</div>
	);
}

function PoseFirstFrame() {
	return (
		<div className="flex h-full flex-col">
			<MiniBar tabs={["tvarso"]} active="tvarso" litPlus={false} />
			<div className="flex min-h-0 flex-1">
				<MiniRail
					pages={[{ name: "frames", count: 1, active: true, open: true, frames: ["checkout"] }]}
				/>
				<MiniField>
					<MiniFrame x={168} y={116} w={226} h={148} name="checkout" ringed={true}>
						<FrameSkeleton shape={1} />
					</MiniFrame>
					<span
						className="absolute rounded-[3px] bg-thread px-1.5 py-[3px] font-mono text-[8px] text-on-thread leading-none"
						style={{ left: 236, top: 272 }}
					>
						390 × 844
					</span>
				</MiniField>
			</div>
		</div>
	);
}

function PoseSecond() {
	return (
		<div className="flex h-full flex-col">
			<MiniBar tabs={["tvarso", "scratch"]} active="scratch" litPlus={false} />
			<div className="flex min-h-0 flex-1">
				<MiniRail
					pages={[
						{ name: "frames", count: 3, active: true, open: true, frames: ["idea", "card", "sheet"] },
					]}
				/>
				<MiniField>
					<MiniFrame x={54} y={78} w={150} h={102} name="idea">
						<FrameSkeleton shape={1} />
					</MiniFrame>
					<MiniFrame x={244} y={78} w={150} h={102} name="card">
						<FrameSkeleton shape={2} />
					</MiniFrame>
					<MiniFrame x={148} y={238} w={150} h={102} name="sheet">
						<FrameSkeleton shape={3} />
					</MiniFrame>
					<svg
						className="pointer-events-none absolute top-0 left-0 h-full w-full"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M204 130 C 222 130, 226 130, 238 130"
							stroke="var(--color-thread)"
							strokeWidth="1.4"
						/>
						<path d="m244 130-7-3.4v6.8Z" fill="var(--color-thread)" />
					</svg>
				</MiniField>
			</div>
		</div>
	);
}

const SPOOL_PAGES: readonly RailPage[] = [
	{ name: "agent", count: 27 },
	{ name: "app", count: 7 },
	{ name: "booting", count: 20 },
	{ name: "components", count: 6 },
	{ name: "directing", count: 1 },
	{ name: "dock", count: 5 },
	{ name: "explorer", count: 4 },
	{ name: "manipulate", count: 14 },
	{ name: "picker", count: 6 },
	{ name: "play-tab", count: 4 },
	{ name: "site", count: 11, active: true },
	{ name: "variants", count: 37 },
];

/** the dense field: eleven site frames, laid out the way they actually sit */
const SITE_TILES: readonly { x: number; y: number; w: number; h: number; shape: number }[] = [
	{ x: 30, y: 30, w: 108, h: 70, shape: 1 },
	{ x: 158, y: 30, w: 108, h: 70, shape: 3 },
	{ x: 286, y: 30, w: 148, h: 92, shape: 2 },
	{ x: 30, y: 126, w: 108, h: 70, shape: 3 },
	{ x: 158, y: 126, w: 108, h: 70, shape: 1 },
	{ x: 286, y: 146, w: 148, h: 92, shape: 1 },
	{ x: 30, y: 222, w: 108, h: 70, shape: 2 },
	{ x: 158, y: 222, w: 108, h: 70, shape: 3 },
	{ x: 452, y: 30, w: 92, h: 60, shape: 1 },
	{ x: 452, y: 116, w: 92, h: 60, shape: 3 },
	{ x: 452, y: 202, w: 92, h: 60, shape: 2 },
];

function PoseDogfood() {
	return (
		<div className="flex h-full flex-col">
			<MiniBar tabs={["tvarso", "scratch", "spool"]} active="spool" litPlus={false} />
			<div className="flex min-h-0 flex-1">
				<MiniRail pages={SPOOL_PAGES} />
				<MiniField>
					<div className="absolute inset-0" style={{ transform: "scale(0.92)", transformOrigin: "8px 8px" }}>
						{SITE_TILES.map((tile) => (
							<div
								key={`${String(tile.x)}-${String(tile.y)}`}
								className="absolute overflow-hidden rounded-[3px] border border-border bg-surface"
								style={{ left: tile.x, top: tile.y, width: tile.w, height: tile.h }}
							>
								<FrameSkeleton shape={tile.shape} />
							</div>
						))}
					</div>
					<span className="absolute right-3 bottom-2.5 font-mono text-[9px] text-muted/60 leading-none">
						142 frames · 12 pages
					</span>
				</MiniField>
			</div>
		</div>
	);
}

/* ---------- the eight steps ---------- */

interface Step {
	n: string;
	title: string;
	body: string;
	/** the mono locator under the plate: what this pose is about */
	locator: string;
	Pose: () => ReactNode;
}

const STEP_ONE: Step = {
	n: "01",
	title: "One package, one command",
	body: "spool.page installs globally and puts spool on your path. Node 22 or newer, and the canvas wants Chrome, which renders a transformed iframe sharp.",
	locator: "npm i -g spool.page",
	Pose: PoseInstall,
};

const STEPS: readonly Step[] = [
	STEP_ONE,
	{
		n: "02",
		title: "Or drag the app in",
		body: "Spool.dmg is a window on the same daemon. Same canvas, same files, and the terminal stays out of it if you would rather it did.",
		locator: "releases/latest/download/Spool.dmg",
		Pose: PoseApp,
	},
	{
		n: "03",
		title: "The first run is empty",
		body: "spool opens with a bar and a plus. There is one thing to press, which is the whole of the onboarding.",
		locator: "http://localhost:7766",
		Pose: PoseHome,
	},
	{
		n: "04",
		title: "Point it at a folder you already have",
		body: "The picker searches your disk. Pick the repo you are working in and spool scaffolds design/ inside it, git-tracked, yours.",
		locator: "spool init ~/tvarso",
		Pose: PosePicker,
	},
	{
		n: "05",
		title: "Nothing in it, and it says so",
		body: "The project opens with the rails honest and the field bare. This is the state most tools hide behind a sample project.",
		locator: "no frames yet",
		Pose: PoseEmpty,
	},
	{
		n: "06",
		title: "Your agent writes the first frame",
		body: "One file: design/frames/checkout/frame.tsx, default-exporting a component. It is on the canvas as the file lands, at the size the sidecar asks for.",
		locator: "design/frames/checkout/frame.tsx",
		Pose: PoseFirstFrame,
	},
	{
		n: "07",
		title: "A scratch project costs ten seconds",
		body: "Press plus again on any folder. Two projects, two tabs, one daemon, and a place to throw an idea that has no repo yet.",
		locator: "~/scratch",
		Pose: PoseSecond,
	},
	{
		n: "08",
		title: "spool is designed in spool",
		body: "This repo has a design/ folder with 12 pages and 142 frames in it. The page you are reading was one of them first.",
		locator: "142 frames · 12 pages",
		Pose: PoseDogfood,
	},
];

const REEL_H = STEPS.length * STEP_H;
const REEL_TAIL = 320; // room under the last caption so the plate stays parked for it
const VIDEO_TOP = HERO_H + REEL_H + REEL_TAIL;
const VIDEO_H = 545;
const FOOT_H = 300;

function stepAt(index: number): Step {
	const found = STEPS[clamp(index, 0, STEPS.length - 1)];
	return found === undefined ? STEP_ONE : found;
}

/* ---------- the page ---------- */

export default function SiteFirstrunReel() {
	const scroller = useRef<HTMLDivElement | null>(null);
	const [active, setActive] = useState(0);
	const [scrolled, setScrolled] = useState(false);

	function onScroll() {
		const el = scroller.current;
		if (el === null) return;
		const top = el.scrollTop;
		setScrolled(top > 40);
		setActive(clamp(Math.floor((top + 430 - HERO_H) / STEP_H), 0, STEPS.length - 1));
	}

	const step = stepAt(active);
	const Pose = step.Pose;

	return (
		<div
			ref={scroller}
			onScroll={onScroll}
			className="h-full w-full overflow-y-auto overflow-x-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]"
		>
			<div
				className="relative"
				style={{ width: 1440, height: VIDEO_TOP + VIDEO_H + FOOT_H }}
			>
				{/* the thread down the margin, from the hero to the last step */}
				<span
					className="absolute w-px"
					style={{
						left: SPINE_X,
						top: 250,
						height: VIDEO_TOP - 250 - 120,
						background:
							"linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-thread) 45%, transparent) 60px, color-mix(in srgb, var(--color-thread) 45%, transparent) calc(100% - 120px), transparent)",
					}}
				/>

				<Hero scrolled={scrolled} active={active} />

				{/* the reel */}
				<div
					className="absolute"
					style={{ left: PAGE_L, top: HERO_H, width: 1440 - PAGE_L - PAGE_R }}
				>
					<div className="grid" style={{ gridTemplateColumns: `${COL_L}px 1fr`, columnGap: COL_GAP }}>
						<div>
							{STEPS.map((entry, i) => (
								<Caption key={entry.n} step={entry} lit={i === active} />
							))}
							<div style={{ height: REEL_TAIL }} />
						</div>
						<div className="relative">
							<div className="sticky" style={{ top: PLATE_TOP }}>
								<HeldPlate locator={step.locator} index={active}>
									<Pose />
								</HeldPlate>
							</div>
						</div>
					</div>
				</div>

				{STEPS.map((entry, i) => (
					<SpineNode key={entry.n} y={HERO_H + i * STEP_H + 176} lit={i === active} />
				))}

				<VideoBand />
				<Foot />
			</div>
		</div>
	);
}

/* ---------- hero ---------- */

function Hero({ scrolled, active }: { scrolled: boolean; active: number }) {
	const reduce = useReducedMotion() === true;
	return (
		<div className="absolute top-0 left-0" style={{ width: 1440, height: HERO_H }}>
			<header
				className="absolute flex items-center justify-between"
				style={{ left: PAGE_L, top: 56, width: 1440 - PAGE_L - PAGE_R }}
			>
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-4 text-thread" title="spool" />
					<span className="font-semibold text-md leading-none tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-7 font-mono text-muted text-xs leading-none">
					<span className="text-text">github.com/liamvinberg/spool</span>
					<span>MIT</span>
				</div>
			</header>

			<div className="absolute" style={{ left: PAGE_L, top: 206, width: 620 }}>
				<h1 className="font-semibold text-[62px] leading-[0.98] tracking-[-0.022em]">
					The first ten
					<br />
					minutes, before
					<br />
					you install it
				</h1>
				<p className="mt-7 max-w-[440px] text-[17px] text-muted leading-[27px]">
					spool is a prototyping canvas for real code. Below is the whole first run, in the order you
					will meet it: eight poses of the actual chrome, held one at a time as you scroll.
				</p>
				<div className="mt-10 flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="w-[420px]">
						<CommandLine prompt="~ $" command="npm i -g spool.page" />
						<CommandLine prompt="~/tvarso $" command="spool init" />
					</div>
				</div>
				<p className="mt-5 pl-[21px] font-mono text-muted text-xs leading-none">
					Node 22+ · best in Chrome · macOS and Linux, WSL on Windows
				</p>
			</div>

			{/* the reel's index, so the eight are known before the first one arrives */}
			<div className="absolute" style={{ left: 900, top: 218, width: 384 }}>
				<div className="mb-4 flex items-baseline justify-between border-border border-b pb-2.5">
					<span className="font-mono text-muted text-xs leading-none">the reel</span>
					<span className="font-mono text-muted/60 text-2xs leading-none">8 poses</span>
				</div>
				{STEPS.map((entry, i) => (
					<div key={entry.n} className="flex h-[38px] items-center gap-4">
						<span
							className={cn(
								"font-mono text-2xs leading-none transition-colors duration-300",
								i === active && scrolled ? "text-thread" : "text-muted/50",
							)}
						>
							{entry.n}
						</span>
						<span
							className={cn(
								"truncate text-[14px] leading-none transition-colors duration-300",
								i === active && scrolled ? "text-text" : "text-muted",
							)}
						>
							{entry.title}
						</span>
					</div>
				))}

				<div className="mt-12 border-border border-t pt-7">
					<h2 className="font-medium text-[17px] leading-none">Or take the app</h2>
					<p className="mt-3.5 text-[14px] text-muted leading-[24px]">
						Spool.dmg is a window on the same daemon. Drag it into Applications and the terminal stays
						out of it.
					</p>
					<p className="mt-4 font-mono text-muted/70 text-xs leading-none">
						releases/latest/download/Spool.dmg
					</p>
				</div>
			</div>

			<div className="absolute flex items-center gap-2.5" style={{ left: PAGE_L, top: 782 }}>
				<motion.span
					className="text-thread"
					animate={reduce || scrolled ? { y: 0, opacity: scrolled ? 0 : 1 } : { y: [0, 4, 0] }}
					transition={
						scrolled
							? { duration: 0.3 }
							: { duration: 1.9, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
					}
				>
					<DownGlyph className="h-3.5 w-3.5" />
				</motion.span>
				<motion.span
					className="font-mono text-muted text-sm leading-none"
					animate={{ opacity: scrolled ? 0 : 1 }}
					transition={{ duration: 0.3 }}
				>
					Scroll to run it
				</motion.span>
			</div>
		</div>
	);
}

/* ---------- the caption column ---------- */

function Caption({ step, lit }: { step: Step; lit: boolean }) {
	return (
		<div className="flex flex-col justify-center" style={{ height: STEP_H }}>
			<div
				className={cn(
					"font-mono text-2xs leading-none transition-colors duration-300",
					lit ? "text-thread" : "text-muted/45",
				)}
			>
				{step.n}
			</div>
			<h2
				className={cn(
					"mt-4 font-medium text-[26px] leading-[1.15] tracking-[-0.012em] transition-colors duration-300",
					lit ? "text-text" : "text-muted/70",
				)}
			>
				{step.title}
			</h2>
			<p
				className={cn(
					"mt-4 text-[15px] leading-[26px] transition-colors duration-300",
					lit ? "text-muted" : "text-muted/40",
				)}
			>
				{step.body}
			</p>
		</div>
	);
}

/* ---------- the held plate ---------- */

function HeldPlate({ locator, index, children }: { locator: string; index: number; children: ReactNode }) {
	return (
		<div style={{ width: PLATE_W }}>
			<div className="relative overflow-hidden rounded-[7px] border border-border" style={{ height: PLATE_H }}>
				<AnimatePresence initial={false}>
					<motion.div
						key={index}
						className="absolute inset-0"
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.34, ease: EASE }}
					>
						{children}
					</motion.div>
				</AnimatePresence>
			</div>
			<div className="mt-3 flex items-center gap-3 font-mono text-2xs leading-none">
				<span className="rounded-[3px] border border-border-raised px-1.5 py-[3px] text-muted/70">still</span>
				<span className="text-muted">{locator}</span>
			</div>
		</div>
	);
}

/* ---------- the video slot ---------- */

function VideoBand() {
	return (
		<div className="absolute" style={{ left: PAGE_L, top: VIDEO_TOP, width: 1440 - PAGE_L - PAGE_R }}>
			<div className="border-border border-t pt-14">
				<div className="grid" style={{ gridTemplateColumns: `${COL_L}px 1fr`, columnGap: COL_GAP }}>
					<div>
						<h2 className="font-medium text-[26px] leading-[1.15] tracking-[-0.012em]">
							Watch someone do it
						</h2>
						<p className="mt-4 text-[15px] text-muted leading-[26px]">
							Two minutes, one repo, from an empty folder to a walkable flow. The recording goes in the
							slot on the right.
						</p>
						<p className="mt-6 font-mono text-muted/60 text-2xs leading-none">
							video slot · 16:9 · not recorded yet
						</p>
					</div>
					<div>
						<div
							className="relative flex items-center justify-center rounded-[7px] border border-border bg-canvas"
							style={{ width: PLATE_W, height: Math.round((PLATE_W * 9) / 16) }}
						>
							<div className="flex flex-col items-center gap-3">
								<span className="flex h-11 w-11 items-center justify-center rounded-full border border-border-raised text-muted/60">
									<PlayTri className="ml-[2px] h-3.5 w-3.5" />
								</span>
								<span className="font-mono text-2xs text-muted/55 leading-none">get started · 2:00</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---------- the foot ---------- */

function Foot() {
	return (
		<div
			className="absolute"
			style={{ left: PAGE_L, top: VIDEO_TOP + VIDEO_H, width: 1440 - PAGE_L - PAGE_R }}
		>
			<div className="grid border-border border-t pt-12" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
				<div>
					<h3 className="font-medium text-[17px] leading-none">MIT</h3>
					<p className="mt-3.5 max-w-[280px] text-[14px] text-muted leading-[24px]">
						Fork it, rework it, rename it, ship it. It is a tool for designing things, so make it your
						own.
					</p>
				</div>
				<div>
					<h3 className="font-medium text-[17px] leading-none">Local, and staying that way</h3>
					<p className="mt-3.5 max-w-[280px] text-[14px] text-muted leading-[24px]">
						The daemon runs on your machine and the frames are files in your repo. Nothing you work on
						leaves it.
					</p>
				</div>
				<div className="font-mono text-xs leading-[24px]">
					<div className="text-text">spool.page</div>
					<div className="text-muted">github.com/liamvinberg/spool</div>
					<div className="text-muted">localhost:7766</div>
				</div>
			</div>
			<div className="mt-14 flex items-center gap-2.5 border-border border-t pt-7">
				<SpoolMark className="h-4 w-3 text-thread" />
				<span className="text-muted text-sm leading-none">spool</span>
				<span className="ml-auto font-mono text-muted/60 text-2xs leading-none">
					pre-1.0 · dogfooded daily
				</span>
			</div>
		</div>
	);
}
