import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ui } from "spool";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-hub, the spool.page landing, and the site's navigation, in one frame.
 *
 * It inherits landing--fourthwall-scroll wholesale: the site is its own demo.
 * Scroll 0 is the full landing (statement, install, scroll hint). Scrolling
 * shrinks the whole page into its red-ringed "landing" frame on a dot-grid
 * canvas, and the canvas that resolves around it is the navigation: four
 * enterable section frames (flows, frames, terminals, your disk), each a
 * faithful mini-wireframe with a mono name tab and the smooth hover ring. A
 * click walks (data-go) to that section; the tile's view-transition-name morphs
 * it into the section's hero, and the statement carries site-home-hero so the
 * sections' back chips zoom home.
 *
 * Getting back: crossing the reveal threshold writes ui.state.hubRevealed. A
 * visitor returning from a section (its "canvas" chip walks here) boots straight
 * at the canvas pose; scrolling up from there un-reveals to the hero. Fully
 * reversible, transform/opacity only, nothing measured at runtime, the whole
 * scene is one fixed 1440x900 coordinate space.
 */

/* ---------- fixed coordinate space + camera constants ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;
const TRACK_H = 2400; // scroll room; scroll distance = TRACK_H - VIEW_H = 1500px
const LIVE = { x: 548, y: 333, w: 456, h: 285 };
const SCALE = LIVE.w / VIEW_W; // 0.3167, the docked min scale
const P1 = 0.55; // progress at which the zoom completes and the reveal begins
const REVEAL = 0.85; // past here the canvas is the navigation; mark it seen

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t); // smoothstep, no overshoot

const zAt = (v: number) => smooth(clamp01(v / P1));
const scaleAt = (v: number) => 1 + (SCALE - 1) * zAt(v);
const rampAt = (v: number, a: number, b: number) => smooth(clamp01((v - a) / (b - a)));

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};
const dotGridMini: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)",
	backgroundSize: "9px 9px",
};
const liveSpine: CSSProperties = {
	background:
		"linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--color-thread) 55%, transparent) 4%, color-mix(in srgb, var(--color-thread) 55%, transparent) 96%, transparent 100%)",
};

/* eased opacity + rise, in lockstep with scroll progress */
function useRamp(sp: MotionValue<number>, a: number, b: number, rise = 14) {
	const opacity = useTransform(sp, (v) => rampAt(v, a, b));
	const y = useTransform(sp, (v) => (1 - rampAt(v, a, b)) * rise);
	return { opacity, y };
}

/* ---------- canonical copy-to-clipboard (verbatim from landing) ---------- */

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const ta = document.createElement("textarea");
			ta.value = text;
			ta.setAttribute("readonly", "");
			ta.style.position = "fixed";
			ta.style.top = "0";
			ta.style.left = "0";
			ta.style.width = "1px";
			ta.style.height = "1px";
			ta.style.padding = "0";
			ta.style.border = "none";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			ta.setSelectionRange(0, text.length);
			const ok = document.execCommand("copy");
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
}

function Tick({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<path
				d="M2.5 6.5 5 8.75 9.5 3.5"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CopyGlyph({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
			className={cn("h-3 w-3 shrink-0", className)}
		>
			<rect x="4.25" y="4.25" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
			<path
				d="M2.75 7.75h-.5a.75.75 0 0 1-.75-.75V2.25a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 .75.75v.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function CommandLine({
	command,
	prompt = "$",
}: {
	command: string;
	prompt?: string;
}) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	async function handleCopy() {
		const ok = await copyText(command);
		if (!ok) return;
		setCopied(true);
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 1500);
	}

	// Reflow-proof swap in the canonical spot: the path part of the prompt never
	// changes, and only the trailing "$" crossfades with the copy glyph / tick,
	// which sit as absolute overlays in a fixed 1ch slot. The line box is
	// identical across rest, hover, and copied. The prompt names the working
	// directory, so "in your repo" is said the terminal way.
	const path = prompt.endsWith("$") ? prompt.slice(0, -1) : `${prompt} `;
	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className="group/cmd block w-full cursor-pointer text-left focus-visible:outline-none"
		>
			<span className="select-none text-muted">{path}</span>
			<span className="relative mr-[1ch] inline-block w-[1ch] select-none text-center align-baseline">
				<span
					className={cn(
						"text-muted transition-opacity duration-150",
						copied
							? "opacity-0"
							: "group-hover/cmd:opacity-0 group-focus-visible/cmd:opacity-0",
					)}
				>
					$
				</span>
				<CopyGlyph
					className={cn(
						"-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-thread opacity-0 transition-opacity duration-150",
						!copied && "group-hover/cmd:opacity-100 group-focus-visible/cmd:opacity-100",
					)}
				/>
				<Tick
					className={cn(
						"-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-thread transition-opacity duration-150",
						copied ? "opacity-100" : "opacity-0",
					)}
				/>
			</span>
			{command}
		</button>
	);
}

/* ---------- shared marks + primitives ---------- */

function Node({ className }: { className?: string }) {
	return (
		<span className={cn("absolute block h-[9px] w-[9px]", className)}>
			<span className="absolute -inset-[5px] rounded-full border border-thread/25" />
			<span className="absolute inset-0 rounded-full border-[3px] border-bg bg-thread" />
		</span>
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

function Bar({ w, className }: { w: string | number; className?: string }) {
	return (
		<div className={cn("h-[3px] rounded-full bg-border-raised", className)} style={{ width: w }} />
	);
}

function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2.5 1.6 8 5 2.5 8.4Z" />
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

function FolderGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path
				d="M1.75 3.4h3.3l1.15 1.35H12.25v6.25a.55.55 0 0 1-.55.55H2.3a.55.55 0 0 1-.55-.55z"
				stroke="currentColor"
				strokeWidth="1.05"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function ArrowUpRight({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className={className}>
			<path
				d="M3.5 8.5 8.5 3.5M4.6 3.5h3.9v3.9"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** the one live-red thing in the terminal: where you are. */
function TermCaret() {
	return (
		<motion.span
			className="ml-0.5 inline-block h-[13px] w-[7px] translate-y-[2px] bg-thread align-middle"
			animate={{ opacity: [1, 0.15] }}
			transition={{ duration: 0.72, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
		/>
	);
}

/* ---------- the scroll affordance ---------- */

function ScrollHint({ opacity }: { opacity: MotionValue<number> }) {
	return (
		<motion.div
			style={{ opacity }}
			className="inline-flex items-center gap-2.5 font-mono text-sm text-muted"
		>
			<motion.span
				className="text-thread"
				animate={{ y: [0, 4, 0] }}
				transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
			>
				<DownGlyph className="h-3.5 w-3.5" />
			</motion.span>
			<span>scroll</span>
		</motion.div>
	);
}

/* ---------- the rest-state landing (also the docked frame's content) ---------- */

function LandingContent({ hint }: { hint: MotionValue<number> }) {
	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{/* thread spine + travelling pulse (transform only) */}
			<div className="absolute inset-y-0 left-[200px] w-px" style={liveSpine}>
				<motion.span
					className="absolute left-1/2 block h-24 w-[7px] -translate-x-1/2 rounded-full"
					style={{
						top: 0,
						background:
							"linear-gradient(to bottom, transparent, var(--color-thread), transparent)",
					}}
					animate={{ y: [-140, 980] }}
					transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
				/>
			</div>

			<div className="relative flex h-full flex-col pl-[320px] pr-[112px]">
				{/* header */}
				<header className="flex shrink-0 items-center justify-between py-9">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="text-md font-semibold tracking-tight">spool</span>
					</div>
					<div className="flex items-center gap-6 font-mono text-xs text-muted">
						<span>spool.page</span>
						<span className="text-text">github.com/liamvinberg/spool</span>
					</div>
				</header>

				{/* hero */}
				<main className="flex flex-1 flex-col justify-center">
					<section className="relative grid grid-cols-[1fr_auto] items-center gap-12">
						<div className="max-w-[560px]">
							<Node className="-left-[124px] top-[9px]" />
							<h1
								className="text-[66px] font-semibold leading-[0.98] tracking-[-0.02em]"
								style={{ viewTransitionName: "site-home-hero" }}
							>
								feel an app
								<br />
								before it exists
							</h1>
							<p className="mt-6 max-w-[452px] text-[17px] leading-[26px] text-muted">
								a live prototyping canvas. your agent authors real tsx frames, you
								arrange them and walk the flows. it feels real because it is.
							</p>

							<div className="mt-9">
								<div className="flex gap-5">
									<span className="w-px shrink-0 self-stretch bg-thread/70" />
									<div className="w-[430px] font-mono text-[15px] leading-[30px]">
										<CommandLine prompt="~ $" command="npm i -g spool.page" />
										<CommandLine prompt="~/your-app $" command="spool init" />
										<CommandLine prompt="~/your-app $" command="spool serve" />
									</div>
								</div>
								<div className="mt-5 pl-[25px] font-mono text-xs text-muted">
									requires node 22+ · best in chrome · macos-first today
								</div>
							</div>
						</div>

						<motion.div
							className="relative w-[236px] shrink-0"
							animate={{ y: [0, -14, 0] }}
							transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
						>
							<SpoolMark className="w-full text-thread" title="spool ribbon" />
						</motion.div>
					</section>

					{/* the scroll affordance, hung off the thread as its own node */}
					<div className="relative mt-14">
						<Node className="-left-[124px] top-1/2 -translate-y-1/2" />
						<ScrollHint opacity={hint} />
					</div>
				</main>

				{/* footer */}
				<footer className="flex shrink-0 items-center justify-between border-t border-border py-7">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-4 text-thread" />
						<span className="text-sm text-muted">spool.page</span>
					</div>
					<span className="font-mono text-xs text-muted">github.com/liamvinberg/spool</span>
				</footer>
			</div>
		</div>
	);
}

/* ---------- door 1: flows, a mini filmstrip walked by a player pill ---------- */

function FlowsWire() {
	const screenX = [44, 168, 292];
	return (
		<div className="relative h-full w-full" style={dotGridMini}>
			{screenX.map((lx, i) => (
				<div
					key={lx}
					className="absolute overflow-hidden rounded-[3px] border border-border bg-canvas"
					style={{ left: lx, top: 20, width: 60, height: 84 }}
				>
					<div className="space-y-[5px] p-2">
						<div className="h-2 w-[68%] rounded-[1px] bg-raised" />
						<Bar w="80%" />
						<Bar w="54%" />
						{i === 2 ? (
							<span className="mx-auto mt-[9px] block h-3 w-3 rounded-full bg-thread/80" />
						) : (
							<div className="mt-[9px] h-3 w-full rounded-[1px] bg-thread/70" />
						)}
					</div>
				</div>
			))}
			<FlowArrowMini x={104} w={64} y={62} pulse />
			<FlowArrowMini x={228} w={64} y={62} />
			{/* player pill */}
			<div
				className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border-raised bg-bg/80 px-2.5 py-1.5"
				style={{ top: 122, width: 158 }}
			>
				<motion.span
					className="text-thread"
					animate={{ opacity: [0.5, 1, 0.5] }}
					transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
				>
					<PlayTri className="h-2 w-2" />
				</motion.span>
				<div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border-raised">
					<div className="h-full w-1/3 rounded-full bg-thread" />
				</div>
				<div className="flex items-center gap-1">
					{[0, 1, 2].map((s) => (
						<span
							key={s}
							className={cn("h-1 w-1 rounded-full", s === 0 ? "bg-thread" : "bg-border-raised")}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

function FlowArrowMini({ x, w, y, pulse }: { x: number; w: number; y: number; pulse?: boolean }) {
	return (
		<div className="absolute" style={{ left: x, top: y, width: w, height: 1 }}>
			<div className="absolute inset-0 bg-thread/55" />
			<span className="absolute -right-px -top-[3px] block h-[7px] w-[7px] rotate-45 border-r border-t border-thread/75" />
			{pulse ? (
				<motion.span
					className="absolute -top-[2px] left-0 block h-[5px] w-[5px] rounded-full bg-thread"
					style={{
						boxShadow: "0 0 6px 1px color-mix(in srgb, var(--color-thread) 60%, transparent)",
					}}
					animate={{ x: [0, w - 3], opacity: [0, 1, 1, 0] }}
					transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.9 }}
				/>
			) : null}
		</div>
	);
}

/* ---------- door 2: frames, code-flavored lines becoming real ui ---------- */

function FramesWire() {
	const lines = ["66%", "42%", "78%", "54%", "62%"];
	return (
		<div className="flex h-full w-full overflow-hidden">
			<div className="relative flex h-full w-[45%] shrink-0 flex-col border-border border-r bg-canvas">
				<div className="flex items-center gap-1.5 border-border border-b px-2.5 py-2">
					<span className="h-1.5 w-1.5 rounded-full bg-thread" />
					<div className="h-1.5 w-10 rounded-[1px] bg-raised" />
				</div>
				<div className="space-y-[7px] p-2.5">
					{lines.map((w, i) => (
						<div key={w + i} className="flex items-center gap-1.5">
							<span className="h-[3px] w-1.5 rounded-full bg-border-raised/70" />
							<div className="h-[3px] rounded-full bg-border-raised" style={{ width: w }} />
							{i === lines.length - 1 ? (
								<span className="ml-0.5 block h-3 w-[2px] bg-thread" />
							) : null}
						</div>
					))}
				</div>
			</div>
			<div className="relative flex-1 p-3" style={dotGridMini}>
				<div className="space-y-2">
					<div className="h-3 w-[72%] rounded-[2px] bg-raised" />
					<div className="h-3 w-[50%] rounded-[2px] bg-raised" />
				</div>
				<div className="mt-3.5 flex gap-1.5">
					<span className="w-px shrink-0 self-stretch bg-thread/60" />
					<div className="space-y-1.5">
						<Bar w={72} />
						<Bar w={54} />
						<Bar w={64} />
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---------- door 3: terminals, a mini tui, a live caret ---------- */

function TerminalsWire() {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="flex items-center justify-between border-border border-b px-3 py-2">
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-1.5 rounded-full bg-thread" />
					<span className="font-mono text-[9px] text-muted">deploys.term</span>
				</div>
				<span className="font-mono text-[9px] text-muted">80 × 24</span>
			</div>
			<div className="flex-1 p-3 font-mono text-[10px] leading-[16px]">
				<div className="border border-border-raised px-2 py-1.5">
					<div className="mb-1 flex items-center justify-between text-muted">
						<span>deploys</span>
						<span>prod</span>
					</div>
					<div className="flex items-center justify-between">
						<span>api</span>
						<span className="text-muted">building</span>
					</div>
					<div className="-mx-1 flex items-center justify-between bg-thread px-1 text-on-thread">
						<span>web</span>
						<span>live</span>
					</div>
					<div className="flex items-center justify-between text-muted">
						<span>worker</span>
						<span>queued</span>
					</div>
				</div>
				<div className="mt-1.5">
					<span className="select-none text-muted">: </span>
					<TermCaret />
				</div>
			</div>
		</div>
	);
}

/* ---------- door 4: your disk, the real tree, self-referential ---------- */

interface DiskRow {
	depth: number;
	kind: "dir" | "frame";
	name: string;
	open?: boolean;
	active?: boolean;
}

const diskRows: readonly DiskRow[] = [
	{ depth: 0, kind: "dir", name: "design", open: true },
	{ depth: 1, kind: "dir", name: "frames", open: true },
	{ depth: 2, kind: "frame", name: "landing" },
	{ depth: 2, kind: "frame", name: "site-hub", active: true },
	{ depth: 2, kind: "frame", name: "site-flows" },
	{ depth: 2, kind: "frame", name: "site-frames" },
	{ depth: 2, kind: "frame", name: "site-terminals" },
	{ depth: 2, kind: "frame", name: "site-disk" },
	{ depth: 1, kind: "dir", name: "shared", open: false },
];

function DiskWire() {
	return (
		<div className="relative h-full w-full overflow-hidden py-2.5">
			{/* connector spine under the frames group */}
			<span className="absolute w-px bg-border-raised" style={{ left: 30, top: 60, height: 138 }} />
			{diskRows.map((r, i) => (
				<div
					key={r.name}
					className={cn(
						"relative flex h-[25px] items-center gap-1.5 pr-2.5",
						r.active ? "bg-raised" : "",
					)}
					style={{ paddingLeft: 12 + r.depth * 16 }}
				>
					<span
						className={cn(
							"w-2 shrink-0 text-center text-[7px] leading-none",
							r.active ? "text-thread" : "text-muted/70",
						)}
					>
						{r.kind === "dir" ? (r.open ? "▾" : "▸") : "▸"}
					</span>
					{r.kind === "frame" ? (
						<FrameIcon className={cn("h-3 w-3 shrink-0", r.active ? "text-thread" : "text-muted")} />
					) : (
						<FolderGlyph className="h-3 w-3 shrink-0 text-muted" />
					)}
					<span
						className={cn(
							"min-w-0 flex-1 truncate font-mono text-[11px] leading-none",
							r.active ? "text-thread" : "text-muted",
						)}
					>
						{r.name}
						{r.kind === "dir" ? "/" : ""}
					</span>
					{r.kind === "frame" ? (
						<span
							className={cn(
								"shrink-0 font-mono text-[9px] leading-none",
								r.active ? "text-thread/70" : "text-muted/50",
							)}
						>
							frame.tsx
						</span>
					) : null}
					{i === 0 ? <span className="shrink-0 font-mono text-[9px] text-muted/50">9</span> : null}
				</div>
			))}
		</div>
	);
}

/* ---------- the four doors: reveal with the canvas, walk on click ---------- */

interface TileSpec {
	name: string;
	sub: string;
	go: string;
	vt: string;
	x: number;
	y: number;
	w: number;
	h: number;
	start: number;
	C: () => React.ReactNode;
}

const TILES: readonly TileSpec[] = [
	{
		name: "flows",
		sub: "walk screen to screen",
		go: "site-flows",
		vt: "site-flows-card",
		x: 108,
		y: 120,
		w: 388,
		h: 164,
		start: 0.54,
		C: FlowsWire,
	},
	{
		name: "your disk",
		sub: "plain files in your repo",
		go: "site-disk",
		vt: "site-disk-card",
		x: 1052,
		y: 210,
		w: 248,
		h: 252,
		start: 0.585,
		C: DiskWire,
	},
	{
		name: "frames",
		sub: "real tsx, real depth",
		go: "site-frames",
		vt: "site-frames-card",
		x: 150,
		y: 596,
		w: 318,
		h: 188,
		start: 0.63,
		C: FramesWire,
	},
	{
		name: "terminals",
		sub: "real processes, real keys",
		go: "site-terminals",
		vt: "site-terminals-card",
		x: 1016,
		y: 600,
		w: 300,
		h: 192,
		start: 0.675,
		C: TerminalsWire,
	},
];

/**
 * A door. The tile fades in with the reveal (useRamp, scroll-driven). Hover is
 * transform/opacity only: a gentle lift-scale, a thread ring fading in, the name
 * tab warming to thread. The whole tile is a data-go walk; the wireframe box
 * carries the section's view-transition-name so the player morphs tile to page.
 */
function Tile({ spec, sp }: { spec: TileSpec; sp: MotionValue<number> }) {
	const { opacity, y } = useRamp(sp, spec.start, spec.start + 0.14);
	return (
		<motion.div
			data-go={spec.go}
			role="link"
			tabIndex={0}
			aria-label={`open ${spec.name}`}
			className="group absolute cursor-pointer select-none focus-visible:outline-none"
			style={{ left: spec.x, top: spec.y, opacity, y }}
		>
			<div className="mb-2 pl-0.5">
				<div className="flex items-center gap-1.5 font-mono text-[11px] leading-none">
					<span className="text-[8px] text-muted/70 transition-colors duration-200 group-hover:text-thread group-focus-visible:text-thread">
						{"▸"}
					</span>
					<span className="text-muted transition-colors duration-200 group-hover:text-thread group-focus-visible:text-thread">
						{spec.name}
					</span>
				</div>
				<div className="mt-1 pl-[15px] font-mono text-[10px] leading-none text-muted/70">
					{spec.sub}
				</div>
			</div>

			<motion.div
				className="relative"
				style={{ width: spec.w, height: spec.h }}
				whileHover={{ scale: 1.015 }}
				transition={{ type: "spring", stiffness: 300, damping: 24 }}
			>
				<div
					className="absolute inset-0 overflow-hidden rounded-[6px] border border-border-raised bg-surface"
					style={{ viewTransitionName: spec.vt }}
				>
					<spec.C />
				</div>
				<div className="pointer-events-none absolute -inset-px rounded-[7px] border border-thread/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
			</motion.div>
		</motion.div>
	);
}

/* ---------- the docked frame's chrome: it hugs the current rect through the zoom ---------- */

function LiveChrome({ sp }: { sp: MotionValue<number> }) {
	const x = useTransform(sp, (v) => LIVE.x * zAt(v));
	const y = useTransform(sp, (v) => LIVE.y * zAt(v));
	const w = useTransform(sp, (v) => VIEW_W * scaleAt(v));
	const h = useTransform(sp, (v) => VIEW_H * scaleAt(v));
	const opacity = useTransform(sp, (v) => clamp01((0.78 - scaleAt(v)) / (0.78 - 0.45)));
	const corner = "absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";
	return (
		<motion.div
			className="pointer-events-none absolute left-0 top-0 z-30"
			style={{ x, y, width: w, height: h, opacity }}
		>
			<div className="absolute -top-[22px] left-0 flex items-center gap-1.5 font-mono text-xs leading-none text-thread">
				<span className="text-[8px] opacity-80">{"▶"}</span>
				<span>landing</span>
			</div>
			<div className="absolute -inset-[3px] rounded-[13px] border-[1.5px] border-thread" />
			<span className={cn(corner, "-left-[7px] -top-[7px]")} />
			<span className={cn(corner, "-right-[7px] -top-[7px]")} />
			<span className={cn(corner, "-left-[7px] -bottom-[7px]")} />
			<span className={cn(corner, "-right-[7px] -bottom-[7px]")} />
			<div className="absolute left-1/2 -bottom-[9px] -translate-x-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs leading-none text-on-thread">
				1440 × 900
			</div>
		</motion.div>
	);
}

/* ---------- a quiet docs door, and the closing invite ---------- */

function DocsChip({ sp }: { sp: MotionValue<number> }) {
	const { opacity, y } = useRamp(sp, 0.72, 0.9, 10);
	return (
		<motion.a
			href="https://github.com/liamvinberg/spool"
			className="group/docs absolute z-30 inline-flex items-center gap-1.5 rounded-full border border-border-raised bg-surface/60 px-3 py-1.5 font-mono text-[11px] text-muted transition-colors duration-200 hover:border-thread/50 hover:text-thread"
			style={{ left: 168, top: 430, opacity, y }}
		>
			docs
			<ArrowUpRight className="h-2.5 w-2.5 transition-colors duration-200 group-hover/docs:text-thread" />
		</motion.a>
	);
}

/** The reveal lands last, quiet mono: the canvas is the navigation. */
function Invite({ sp }: { sp: MotionValue<number> }) {
	const { opacity, y } = useRamp(sp, 0.82, 0.98, 12);
	return (
		<motion.div
			className="absolute z-30 font-mono"
			style={{ left: 512, top: 666, width: 456, opacity, y }}
		>
			<div className="flex items-center justify-center gap-5">
				<div className="w-[150px] text-xs leading-[18px] text-muted">
					<CommandLine command="npm i -g spool.page" />
				</div>
				<span className="h-8 w-px shrink-0 bg-border" />
				<div className="text-left">
					<div className="text-xs leading-[17px] text-muted">this whole site is one canvas.</div>
					<div className="mt-1 text-sm leading-[18px] text-text">
						click any frame to walk in.
					</div>
				</div>
			</div>
		</motion.div>
	);
}

/* ---------- orchestrator ---------- */

export default function SiteHub() {
	const scrollRef = useRef<HTMLDivElement>(null);

	// a visitor who has already revealed the canvas this session (came back from a
	// section via its canvas chip) boots straight at the canvas pose, not the hero.
	// hubRevealed is undefined until the first reveal; reading it is enough.
	const returning = useRef(ui.state.hubRevealed === true);

	// Own the scroll -> progress measurement. A plain scroll listener reliably
	// catches a programmatic scroll restore across the walk-back's view-transition
	// remount, where motion's useScroll re-measures on its own clock and strands.
	// progress is 0 at the hero, 1 at the full canvas; the spring smooths it and
	// every transform derives from the spring, so the reveal stays in lockstep.
	const progress = useMotionValue(returning.current ? 1 : 0);
	const sp = useSpring(progress, { stiffness: 100, damping: 40, mass: 1 });

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const measure = () => {
			const max = el.scrollHeight - el.clientHeight;
			progress.set(max > 0 ? clamp01(el.scrollTop / max) : 0);
		};
		el.addEventListener("scroll", measure, { passive: true });
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		measure();
		return () => {
			el.removeEventListener("scroll", measure);
			ro.disconnect();
		};
	}, [progress]);

	// park the return scroll at the end once the (view-transition) layout settles;
	// the listener above then reports progress 1, the spring snaps, no boot zoom.
	useLayoutEffect(() => {
		if (!returning.current) return;
		let raf = 0;
		let tries = 0;
		const lock = () => {
			const el = scrollRef.current;
			const max = el ? el.scrollHeight - el.clientHeight : 0;
			if (el && max > 200) {
				el.scrollTop = max;
				progress.jump(1);
				sp.jump(1);
				return;
			}
			if (tries++ < 90) raf = requestAnimationFrame(lock);
		};
		lock();
		return () => cancelAnimationFrame(raf);
	}, [progress, sp]);

	// crossing the reveal threshold marks the canvas seen; the session carries it
	// to the section frames and back, so the return path knows to boot the canvas.
	useEffect(() => {
		const unsub = sp.on("change", (v) => {
			if (v > REVEAL && ui.state.hubRevealed !== true) ui.state.hubRevealed = true;
		});
		return unsub;
	}, [sp]);

	// the docked landing: transform-only zoom into its rect.
	const frameScale = useTransform(sp, scaleAt);
	const frameX = useTransform(sp, (v) => LIVE.x * zAt(v));
	const frameY = useTransform(sp, (v) => LIVE.y * zAt(v));
	const frameRadius = useTransform(sp, (v) => 44 * zAt(v));

	// the dot-grid canvas parallax-settles in behind.
	const gridScale = useTransform(sp, (v) => 1.04 - 0.04 * smooth(clamp01(v / 0.4)));
	const gridOpacity = useTransform(sp, (v) => clamp01(v / 0.16));

	// the scroll hint fades the instant the zoom begins.
	const hint = useTransform(sp, (v) => 1 - clamp01(v / 0.07));

	return (
		<div
			ref={scrollRef}
			className="h-full w-full overflow-y-auto overflow-x-hidden bg-canvas [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div style={{ height: TRACK_H }}>
				{/* the pinned stage: the camera holds here while the track scrolls */}
				<div className="sticky top-0 h-[900px] w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]">
					{/* canvas layer: dot grid, behind everything, parallax-settles in */}
					<motion.div
						className="absolute inset-[-80px]"
						style={{ ...dotGrid, scale: gridScale, opacity: gridOpacity }}
					/>

					{/* the scene: doors, docked landing, chrome and invite */}
					<div className="absolute inset-0 z-10">
						{TILES.map((spec) => (
							<Tile key={spec.go} spec={spec} sp={sp} />
						))}

						{/* the landing: one wrapper, transform-only zoom */}
						<motion.div
							className="absolute inset-0 z-10 origin-top-left overflow-hidden bg-bg [will-change:transform]"
							style={{ x: frameX, y: frameY, scale: frameScale, borderRadius: frameRadius }}
						>
							<LandingContent hint={hint} />
						</motion.div>

						<LiveChrome sp={sp} />
						<DocsChip sp={sp} />
						<Invite sp={sp} />
					</div>
				</div>
			</div>
		</div>
	);
}
