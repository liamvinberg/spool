import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool-mark";

/**
 * site-terminal--minute. The spool.page landing argued from the clock.
 *
 * The take: the page is the first minute, measured. Two tracks run left to
 * right against one time axis. The Mac app is the top track and finishes at
 * 0:26; npm is the bottom track and finishes at 0:44, and the gap between the
 * two end caps is drawn and labelled, because that difference is the reason the
 * app leads. Every station on a track is a real step with a real time under it.
 *
 * The install line is one station on the lower track. It copies, and it is the
 * only mono the fold spends on a command.
 *
 * Below the fold the clock keeps running: what is on screen at 0:26, what "+"
 * does at 0:39, what the first frame looks like at 1:12. Then the proof sheet,
 * 159 frames drawn one rectangle each, the video, and the licence.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- reveal ---------- */

function useReveal<T extends HTMLElement>(rootRef: React.RefObject<HTMLDivElement | null>) {
	const ref = useRef<T | null>(null);
	const [shown, setShown] = useState(false);
	useEffect(() => {
		const el = ref.current;
		const root = rootRef.current;
		if (el === null || root === null) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) if (entry.isIntersecting) setShown(true);
			},
			{ root, rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
		);
		io.observe(el);
		return () => {
			io.disconnect();
		};
	}, [rootRef]);
	return { ref, shown };
}

function Reveal({
	rootRef,
	delay = 0,
	className,
	children,
}: {
	rootRef: React.RefObject<HTMLDivElement | null>;
	delay?: number;
	className?: string;
	children: ReactNode;
}) {
	const { ref, shown } = useReveal<HTMLDivElement>(rootRef);
	const reduce = useReducedMotion() === true;
	return (
		<motion.div
			ref={ref}
			className={className}
			initial={false}
			animate={{ opacity: shown ? 1 : 0, y: shown || reduce ? 0 : 16 }}
			transition={{ duration: reduce ? 0.2 : 0.6, ease: EASE, delay: shown ? delay : 0 }}
		>
			{children}
		</motion.div>
	);
}

/* ---------- small parts ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function Tick({ className }: { className?: string }) {
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

function CopyGlyph({ className }: { className?: string }) {
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

function DownloadGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
			<path
				d="M7 1.8v7.4M3.9 6.3 7 9.4l3.1-3.1M2.4 11.9h9.2"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

const dotGrid = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "20px 20px",
	backgroundPosition: "-1px -1px",
} as const;

/** the fold's one command, sized to itself, copy folded into the line box. */
function InstallLine({ prompt, command }: { prompt: string; command: string }) {
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
			aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
			onClick={() => {
				void copyText(command).then((ok) => {
					if (!ok) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => setCopied(false), 1600);
				});
			}}
			className={cn(
				"group/line flex h-[40px] w-full cursor-pointer items-center gap-2.5 rounded-md border bg-canvas px-3.5 text-left transition-colors duration-200 focus-visible:outline-none",
				copied ? "border-thread/45" : "border-border hover:border-border-raised",
			)}
		>
			<span className="select-none font-mono text-[12px] text-muted leading-none">{prompt}</span>
			<span className="min-w-0 flex-1 truncate font-mono text-[13px] text-text leading-none">{command}</span>
			<span className="relative block h-3 w-3 shrink-0">
				<CopyGlyph
					className={cn(
						"absolute inset-0 h-3 w-3 transition-opacity duration-200",
						copied ? "opacity-0" : "text-muted/70 group-hover/line:text-text",
					)}
				/>
				<Tick
					className={cn(
						"absolute inset-0 h-3 w-3 text-thread transition-opacity duration-200",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
		</button>
	);
}

/* ---------- the timeline ---------- */

/** the track's own coordinate space: 0:00 at 0, 0:48 at TRACK_W. */
const TRACK_W = 636;
const SPAN = 48;
const xAt = (t: number) => (t / SPAN) * TRACK_W;

interface Station {
	/** seconds into the run */
	t: number;
	/** what the machine or the hand did, in its own register */
	label: string;
	mono?: boolean;
}

interface Track {
	id: "app" | "npm";
	name: string;
	blurb: string;
	stations: readonly Station[];
	/** seconds at which the canvas is on screen */
	done: number;
}

const TRACKS: readonly Track[] = [
	{
		id: "app",
		name: "The Mac app",
		blurb: "One file. Drag it to Applications and open it. It carries its own Node.",
		stations: [
			{ t: 0, label: "download", mono: true },
			{ t: 12, label: "drag to Applications" },
			{ t: 21, label: "open Spool" },
		],
		done: 26,
	},
	{
		id: "npm",
		name: "From npm",
		blurb: "One global install, then run spool inside any folder you already have.",
		stations: [
			{ t: 0, label: "npm i -g spool.page", mono: true },
			{ t: 29, label: "cd tvarso", mono: true },
			{ t: 36, label: "spool", mono: true },
		],
		done: 44,
	},
];

const clock = (t: number) => `0:${t < 10 ? "0" : ""}${t}`;

/** a tiny drawing of what lands at the end of a track: the canvas, open. */
function EndThumb() {
	return (
		<div className="h-[62px] w-[98px] overflow-hidden rounded-[5px] border border-thread/45 bg-bg">
			<div className="flex h-[11px] items-center gap-[3px] border-border border-b bg-canvas px-1.5">
				<span className="block h-[3px] w-[3px] rounded-full bg-thread" />
				<span className="block h-[3px] w-6 rounded-full bg-border-raised" />
			</div>
			<div className="flex h-[51px]">
				<div className="w-[22px] shrink-0 space-y-[4px] border-border border-r bg-canvas py-1.5 pl-1.5">
					<span className="block h-[2px] w-3.5 rounded-full bg-border-raised" />
					<span className="block h-[2px] w-2.5 rounded-full bg-border-raised/70" />
					<span className="block h-[2px] w-3 rounded-full bg-border-raised/70" />
				</div>
				<div className="flex-1" style={{ ...dotGrid, backgroundSize: "8px 8px" }} />
			</div>
		</div>
	);
}

function TrackRow({
	track,
	index,
	children,
}: {
	track: Track;
	index: number;
	children: ReactNode;
}) {
	const reduce = useReducedMotion() === true;
	// Nothing on the fold is gated on being seen: every label, node and end cap
	// is painted on the first frame. The only thing that moves is the red rail
	// running out along the grey one, which is the clock made visible.
	const [run, setRun] = useState(reduce);
	useEffect(() => {
		const id = window.setTimeout(() => setRun(true), 60);
		return () => window.clearTimeout(id);
	}, []);
	return (
		<div className="flex items-start gap-11">
			{/* what you press */}
			<div className="w-[286px] shrink-0 pt-[26px]">
				<h2 className="font-medium text-[17px] leading-none tracking-[-0.014em]">{track.name}</h2>
				<p className="mt-3 text-[13px] text-muted leading-[21px]">{track.blurb}</p>
				<div className="mt-5">{children}</div>
			</div>

			{/* what it costs */}
			<div className="relative" style={{ width: TRACK_W + 132, height: 132 }}>
				<div className="absolute top-[66px] left-0 h-px" style={{ width: TRACK_W }}>
					<span className="absolute inset-0 block bg-border-raised" />
					<motion.span
						className="absolute inset-y-0 left-0 block bg-thread/85"
						initial={false}
						animate={{ width: run ? xAt(track.done) : 0 }}
						transition={{ duration: reduce ? 0.2 : 1.05, ease: EASE, delay: reduce ? 0 : index * 0.14 }}
					/>
				</div>

				{track.stations.map((s, i) => (
					<div key={s.label} className="absolute top-[66px]" style={{ left: xAt(s.t) }}>
						<span className="-translate-x-1/2 -translate-y-1/2 absolute block h-[7px] w-[7px] rounded-full border-[1.5px] border-thread bg-bg" />
						<span
							className={cn(
								"-top-[28px] absolute whitespace-nowrap leading-none",
								i === 0 ? "left-0" : "-translate-x-1/2 left-0",
								s.mono === true ? "font-mono text-[12px] text-text/85" : "text-[13px] text-text/85",
							)}
						>
							{s.label}
						</span>
						<span
							className={cn(
								"absolute top-[13px] whitespace-nowrap font-mono text-[11px] text-muted/70 leading-none tabular-nums",
								i === 0 ? "left-0" : "-translate-x-1/2 left-0",
							)}
						>
							{clock(s.t)}
						</span>
					</div>
				))}

				{/* the end cap: the canvas, open */}
				<div className="absolute top-[66px]" style={{ left: xAt(track.done) }}>
					<span className="-translate-x-1/2 -translate-y-1/2 absolute block h-[9px] w-[9px] rounded-full bg-thread" />
					<div className="-top-[58px] absolute left-[20px]">
						<EndThumb />
					</div>
					<span className="absolute top-[13px] left-[20px] whitespace-nowrap font-mono text-[11px] text-thread leading-none tabular-nums">
						{clock(track.done)}
					</span>
				</div>
			</div>
		</div>
	);
}

/** the axis both tracks are measured against. */
function Axis() {
	return (
		<div className="flex gap-11">
			<div className="w-[286px] shrink-0" />
			<div className="relative h-[22px]" style={{ width: TRACK_W + 132 }}>
				<span className="absolute top-0 left-0 block h-px bg-border" style={{ width: TRACK_W + 44 }} />
				{[0, 12, 24, 36, 48].map((t) => (
					<span key={t} className="absolute top-0" style={{ left: xAt(t) }}>
						<span className="absolute top-0 left-0 block h-[5px] w-px bg-border-raised" />
						<span className="absolute top-[10px] left-0 whitespace-nowrap font-mono text-[10px] text-muted/60 leading-none tabular-nums">
							{clock(t)}
						</span>
					</span>
				))}
			</div>
		</div>
	);
}

/** the gap between the two end caps, drawn, because it is the whole argument. */
function Gap() {
	const left = xAt(26);
	const right = xAt(44);
	return (
		<div className="flex gap-11">
			<div className="w-[286px] shrink-0" />
			<div className="relative h-[30px]" style={{ width: TRACK_W + 132 }}>
				<span className="absolute top-0 block h-[6px] w-px bg-thread/45" style={{ left }} />
				<span className="absolute top-0 block h-[6px] w-px bg-thread/45" style={{ left: right }} />
				<span className="absolute top-[6px] block h-px bg-thread/45" style={{ left, width: right - left }} />
				<span
					className="absolute top-[13px] whitespace-nowrap font-mono text-[11px] text-muted leading-none"
					style={{ left: left + 12 }}
				>
					18 seconds
				</span>
			</div>
		</div>
	);
}

/* ---------- what the clock keeps showing ---------- */

function RailRows({ rows }: { rows: readonly { name: string; active?: boolean }[] }) {
	return (
		<>
			{rows.map((r) => (
				<div
					key={r.name}
					className={cn(
						"flex h-[20px] items-center gap-1.5 pr-2 pl-2.5 font-mono text-[10px] leading-none",
						r.active === true ? "bg-raised text-text" : "text-muted",
					)}
				>
					<span className={cn("text-[6px]", r.active === true ? "text-thread" : "text-muted/60")}>▸</span>
					<span className="min-w-0 flex-1 truncate">{r.name}</span>
				</div>
			))}
		</>
	);
}

function PlusGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path d="M6 2.2v7.6M2.2 6h7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

/** moment one: the canvas opens with nothing in it. */
function MomentEmpty() {
	return (
		<div className="overflow-hidden rounded-md border border-border bg-bg">
			<div className="flex h-[28px] items-center gap-2 border-border border-b bg-canvas px-3">
				<span className="block h-[5px] w-[5px] rounded-full bg-border-raised" />
				<span className="font-mono text-[11px] text-muted/70 leading-none">no project</span>
			</div>
			<div className="relative flex h-[214px] flex-col items-center justify-center gap-2.5" style={dotGrid}>
				<SpoolMark className="h-[22px] w-[17px] text-thread/30" />
				<span className="font-mono text-[11px] text-muted/80 leading-none">no frames yet</span>
			</div>
		</div>
	);
}

/** moment two: "+" and a folder you already have. */
function MomentPick() {
	const reduce = useReducedMotion() === true;
	const rows = ["Documents", "code", "tvarso", "kaffe", "notes"];
	return (
		<div className="overflow-hidden rounded-md border border-border bg-bg">
			<div className="flex h-[28px] items-center gap-2 border-border border-b bg-canvas px-3">
				<span className="relative flex h-[17px] w-[17px] items-center justify-center rounded-xs bg-thread text-on-thread">
					<PlusGlyph className="h-2.5 w-2.5" />
					{reduce ? null : (
						<motion.span
							className="-inset-[4px] absolute rounded-sm border border-thread/45"
							animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.95, 1.05, 0.95] }}
							transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						/>
					)}
				</span>
				<span className="font-mono text-[11px] text-muted leading-none">open a folder</span>
			</div>
			<div className="h-[214px] bg-canvas/50 py-3">
				{rows.map((r, i) => (
					<div
						key={r}
						className={cn(
							"flex h-[26px] items-center gap-2.5 px-4 font-mono text-[11px] leading-none",
							i === 2 ? "bg-raised text-text" : "text-muted",
						)}
					>
						<svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className="h-3 w-3 shrink-0">
							<path
								d="M1.6 3.4h3.6l1.3 1.5h5.9v5.7H1.6z"
								stroke="currentColor"
								strokeWidth="1.15"
								strokeLinejoin="round"
								className={i === 2 ? "text-thread" : "text-muted/60"}
							/>
						</svg>
						{r}
						{i === 2 ? <span className="ml-auto text-[10px] text-muted/60">git repo</span> : null}
					</div>
				))}
			</div>
		</div>
	);
}

/** moment three: the agent writes a file and it lands. */
function MomentFrames() {
	const reduce = useReducedMotion() === true;
	const tiles = [
		{ x: 18, y: 20, w: 84, h: 56 },
		{ x: 122, y: 20, w: 84, h: 56 },
		{ x: 18, y: 98, w: 84, h: 56 },
		{ x: 122, y: 98, w: 84, h: 56 },
	];
	return (
		<div className="overflow-hidden rounded-md border border-border bg-bg">
			<div className="flex h-[28px] items-center gap-2 border-border border-b bg-canvas px-3">
				<span className="block h-[5px] w-[5px] rounded-full bg-thread" />
				<span className="font-mono text-[11px] text-muted leading-none">tvarso</span>
				<span className="ml-auto font-mono text-[10px] text-muted/60 leading-none">4 frames</span>
			</div>
			<div className="flex h-[214px]">
				<div className="w-[88px] shrink-0 border-border border-r bg-canvas py-2">
					<RailRows
						rows={[{ name: "checkout", active: true }, { name: "account" }, { name: "search" }]}
					/>
				</div>
				<div className="relative flex-1" style={dotGrid}>
					{tiles.map((t, i) => (
						<motion.div
							key={`${t.x}-${t.y}`}
							className="absolute overflow-hidden rounded-[3px] border border-border bg-canvas"
							style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
							initial={false}
							animate={reduce ? undefined : { opacity: [0, 1], y: [6, 0] }}
							transition={{ duration: 0.5, ease: EASE, delay: 0.2 + i * 0.16 }}
						>
							<div className="space-y-[5px] p-2">
								<div className="h-[6px] w-[64%] rounded-[1px] bg-raised" />
								<div className="h-[3px] w-[86%] rounded-full bg-border-raised" />
								<div className="h-[3px] w-[58%] rounded-full bg-border-raised" />
								<div className="mt-[7px] h-[9px] w-[44%] rounded-[2px] bg-thread/70" />
							</div>
						</motion.div>
					))}
					{reduce ? null : (
						<motion.span
							className="absolute block h-[7px] w-[7px] rounded-full bg-thread"
							style={{ left: 200, top: 168 }}
							animate={{ opacity: [0.25, 1, 0.25] }}
							transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

function Moment({
	at,
	title,
	body,
	children,
}: {
	at: string;
	title: string;
	body: string;
	children: ReactNode;
}) {
	return (
		<div>
			{children}
			<div className="mt-5 flex items-baseline gap-3">
				<span className="font-mono text-[12px] text-thread leading-none tabular-nums">{at}</span>
				<h3 className="font-medium text-[16px] leading-none tracking-[-0.012em]">{title}</h3>
			</div>
			<p className="mt-3 text-[13px] text-muted leading-[21px]">{body}</p>
		</div>
	);
}

/* ---------- the proof sheet ---------- */

const PAGES: readonly { name: string; n: number }[] = [
	{ name: "variants", n: 45 },
	{ name: "agent", n: 27 },
	{ name: "booting", n: 20 },
	{ name: "manipulate", n: 14 },
	{ name: "site", n: 11 },
	{ name: "explorer", n: 8 },
	{ name: "dock", n: 7 },
	{ name: "app", n: 7 },
	{ name: "picker", n: 6 },
	{ name: "components", n: 6 },
	{ name: "play-tab", n: 4 },
	{ name: "play-inline", n: 3 },
	{ name: "directing", n: 1 },
];

const TOTAL = PAGES.reduce((a, p) => a + p.n, 0);

/** one rectangle per frame, grouped by the page its folder sits on. */
function ProofSheet() {
	return (
		<div className="flex flex-wrap items-start gap-x-10 gap-y-9">
			{PAGES.map((p) => (
				<div key={p.name}>
					<div className="mb-3 flex items-baseline gap-2 font-mono text-[11px] leading-none">
						<span className="text-muted">{p.name}</span>
						<span className="text-muted/50 tabular-nums">{p.n}</span>
					</div>
					<div
						className="grid gap-[3px]"
						style={{ gridTemplateColumns: `repeat(${Math.min(p.n, 8)}, 15px)` }}
					>
						{Array.from({ length: p.n }, (_, i) => (
							<span
								key={`${p.name}-${i}`}
								className="block h-[11px] w-[15px] rounded-[1.5px] border border-border-raised bg-surface"
							/>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

/* ---------- video ---------- */

function VideoSlot() {
	const [hover, setHover] = useState(false);
	return (
		<button
			type="button"
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			className="block w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-canvas text-left transition-colors duration-300 hover:border-border-raised focus-visible:outline-none"
		>
			<div className="relative flex h-[480px] items-center justify-center" style={dotGrid}>
				<span
					className={cn(
						"flex h-[58px] w-[58px] items-center justify-center rounded-full border transition-all duration-300",
						hover ? "border-thread bg-thread" : "border-border-raised bg-bg/70",
					)}
				>
					<svg
						viewBox="0 0 12 12"
						fill="currentColor"
						aria-hidden="true"
						className={cn(
							"ml-[3px] h-3.5 w-3.5 transition-colors duration-300",
							hover ? "text-on-thread" : "text-text",
						)}
					>
						<path d="M2.6 1.5 10 6 2.6 10.5Z" />
					</svg>
				</span>
				{/* the clock device, one last time: a scrubber under the slot */}
				<div className="absolute inset-x-6 bottom-5 flex items-center gap-3">
					<span className="font-mono text-[11px] text-muted leading-none tabular-nums">0:00</span>
					<span className="relative h-px flex-1 bg-border-raised">
						<span className="absolute inset-y-0 left-0 block w-[9%] bg-thread" />
						<span className="-translate-y-1/2 absolute top-1/2 left-[9%] block h-[7px] w-[7px] rounded-full bg-thread" />
					</span>
					<span className="font-mono text-[11px] text-muted leading-none tabular-nums">4:52</span>
				</div>
			</div>
		</button>
	);
}

/* ---------- the page ---------- */

export default function SiteTerminalMinute() {
	const rootRef = useRef<HTMLDivElement | null>(null);

	return (
		<div
			ref={rootRef}
			className="h-full w-full overflow-y-auto bg-bg font-sans text-text antialiased [font-synthesis:none]"
		>
			<div className="mx-auto w-[1200px]">
				<header className="flex h-[84px] items-center justify-between">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-[19px] w-[15px] text-thread" title="spool" />
						<span className="font-medium text-[15px] tracking-[-0.01em]">spool</span>
					</div>
					<div className="flex items-center gap-8">
						<span className="cursor-pointer text-[13px] text-muted transition-colors duration-200 hover:text-text">
							Docs
						</span>
						<span className="cursor-pointer text-[13px] text-muted transition-colors duration-200 hover:text-text">
							GitHub
						</span>
						<button
							type="button"
							className="flex h-[34px] cursor-pointer items-center gap-2 rounded-sm border border-border-raised px-3.5 font-medium text-[13px] leading-none transition-colors duration-200 hover:border-thread hover:text-thread focus-visible:outline-none"
						>
							<DownloadGlyph className="h-3 w-3" />
							Spool.dmg
						</button>
					</div>
				</header>

				{/* the fold */}
				<section className="pt-[54px] pb-[76px]">
					<div className="flex items-end justify-between gap-16">
						<h1 className="w-[660px] shrink-0 font-semibold text-[54px] leading-[1.06] tracking-[-0.032em]">
							From nothing to a canvas
							<br />
							in under a minute.
						</h1>
						<p className="mb-[7px] w-[380px] shrink-0 text-[15px] text-muted leading-[24px]">
							spool is a prototyping canvas that lives in your project folder. Here are both ways in,
							timed once on an M2 Air from a cold start.
						</p>
					</div>

					<div className="mt-[54px]">
						<Axis />
						<div className="mt-6 space-y-[14px]">
							{TRACKS.map((t, i) => (
								<TrackRow key={t.id} track={t} index={i}>
									{t.id === "app" ? (
										<button
											type="button"
											className="flex h-[40px] w-fit cursor-pointer items-center gap-2.5 rounded-md bg-thread px-4 font-medium text-[13px] text-on-thread leading-none transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none"
										>
											<DownloadGlyph className="h-3.5 w-3.5" />
											Download Spool.dmg
										</button>
									) : (
										<InstallLine prompt="~ $" command="npm i -g spool.page" />
									)}
									<div className="mt-3 font-mono text-[11px] text-muted/70 leading-none">
										{t.id === "app"
											? "spool.dmg · 84 mb · apple silicon"
											: "node 22+ · macos, linux, wsl"}
									</div>
								</TrackRow>
							))}
						</div>
						<div className="-mt-[30px]">
							<Gap />
						</div>
					</div>
				</section>

				{/* the clock keeps running */}
				<section className="border-border border-t pt-[86px] pb-[92px]">
					<Reveal rootRef={rootRef}>
						<div className="flex items-end justify-between gap-16 pb-11">
							<h2 className="w-[620px] shrink-0 font-semibold text-[38px] leading-[1.08] tracking-[-0.026em]">
								The clock keeps running.
							</h2>
							<p className="mb-2 w-[400px] shrink-0 text-[14px] text-muted leading-[23px]">
								Whichever door you came through, the next three moments are the same. They are the
								only setup there is.
							</p>
						</div>
					</Reveal>
					<Reveal rootRef={rootRef} delay={0.06}>
						<div className="grid grid-cols-3 gap-9">
							<Moment
								at="0:26"
								title="First run is empty."
								body="spool holds nothing until you hand it a folder. The canvas opens and says so."
							>
								<MomentEmpty />
							</Moment>
							<Moment
								at="0:39"
								title="+ takes any folder."
								body="Point it at a repo you already have. design/ appears beside your source, and the folder keeps its own tab. Open as many as you like."
							>
								<MomentPick />
							</Moment>
							<Moment
								at="1:12"
								title="The first frame lands."
								body="Your agent writes frames/checkout/frame.tsx and it shows up on the canvas, live, while you watch."
							>
								<MomentFrames />
							</Moment>
						</div>
					</Reveal>
				</section>

				{/* the proof */}
				<section className="border-border border-t pt-[86px] pb-[92px]">
					<Reveal rootRef={rootRef}>
						<div className="flex items-end justify-between gap-16 pb-12">
							<div className="w-[620px] shrink-0">
								<h2 className="font-semibold text-[38px] leading-[1.08] tracking-[-0.026em]">
									I made this for myself.
								</h2>
								<p className="mt-5 text-[15px] text-muted leading-[25px]">
									Then I kept using it. spool designs spool, and every rectangle below is one frame
									folder on disk in its canvas.
								</p>
							</div>
							<div className="mb-1 flex shrink-0 items-baseline gap-4">
								<span className="font-semibold text-[52px] leading-none tracking-[-0.03em] tabular-nums">
									{TOTAL}
								</span>
								<span className="font-mono text-[12px] text-muted leading-none">
									frames · {PAGES.length} pages
								</span>
							</div>
						</div>
					</Reveal>
					<Reveal rootRef={rootRef}>
						<ProofSheet />
					</Reveal>
				</section>

				{/* the video */}
				<section className="border-border border-t pt-[86px] pb-[92px]">
					<Reveal rootRef={rootRef}>
						<div className="flex items-end justify-between gap-16 pb-9">
							<h2 className="font-semibold text-[38px] leading-[1.08] tracking-[-0.026em]">
								Or watch it happen.
							</h2>
							<p className="mb-2 w-[340px] shrink-0 text-[14px] text-muted leading-[23px]">
								Install, open a folder, and walk a three screen flow. One take, no cuts.
							</p>
						</div>
						<VideoSlot />
					</Reveal>
				</section>

				{/* licence */}
				<section className="border-border border-t pt-[86px] pb-[62px]">
					<Reveal rootRef={rootRef}>
						<div className="flex items-end justify-between gap-16">
							<h2 className="max-w-[720px] font-semibold text-[42px] leading-[1.06] tracking-[-0.028em]">
								MIT. Fork it, rework it, rename it, ship it.
							</h2>
							<p className="mb-2 w-[300px] shrink-0 text-[14px] text-muted leading-[23px]">
								It is a tool for designing things. Make it your own if you want to.
							</p>
						</div>
					</Reveal>
				</section>

				<footer className="flex items-center justify-between border-border border-t py-8">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-[13px] text-thread" />
						<span className="text-[13px] text-muted">spool.page</span>
					</div>
					<div className="flex items-center gap-7 font-mono text-[11px] text-muted/70">
						<span>github.com/liamvinberg/spool</span>
						<span>node 22+</span>
						<span>best in Chrome</span>
					</div>
				</footer>
			</div>
		</div>
	);
}
