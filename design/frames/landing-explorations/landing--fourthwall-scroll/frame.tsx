import {
	motion,
	useScroll,
	useSpring,
	useTransform,
	type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--fourthwall-scroll
 * The v2 of landing--fourthwall. Same inception reveal (the site is the product
 * demo: the whole landing shrinks into one frame on spool's own canvas, ringed
 * thread, surrounded by the ghosts it was chosen from) but nobody has to opt in.
 * Scroll drives it. Every visitor who scrolls gets the reveal, and it is fully
 * reversible: scroll back up and the page reassembles.
 *
 * There is no scroll hijack. The root is the frame's own overflow-y scroller; a
 * tall track gives it room; a pinned stage holds the camera. useScroll reads the
 * container's scrollYProgress, an overdamped spring smooths it, and function-form
 * useTransform (manual clamp; the options-object clamp silently fails in this
 * motion pin) maps the smoothed progress onto one wrapper's transform.
 *
 * The camera, by progress:
 *   0            the condensed landing fills the viewport (fourthwall's rest
 *                pose); a bare mono "scroll" hint hangs off the thread.
 *   0 -> ~0.55   the landing shrinks continuously into its docked frame; the
 *                dot-grid canvas parallax-settles in around it; the frame chrome
 *                (name tab, selection ring, size chip) arrives hugging the live
 *                rect as the scale passes ~0.75.
 *   ~0.55 -> 1   the camera drifts up-left across the canvas while the real
 *                current exploration set fades in as dim mini-wireframes, the
 *                walked arrow draws into the live frame, and the caption lands.
 *
 * Every continuous value is transform/opacity. Nothing is measured at runtime:
 * the whole canvas is one fixed 1440x900 coordinate space, so gBCR never lies
 * under the player's scale (#53). The live frame's content stays legible the
 * whole zoom, crisp at 1x and believable at min scale.
 */

/* ---------- fixed coordinate space + camera constants ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;
const TRACK_H = 2400; // scroll room; scroll distance = TRACK_H - VIEW_H = 1500px
const LIVE = { x: 548, y: 333, w: 456, h: 285 };
const SCALE = LIVE.w / VIEW_W; // 0.3167 — the docked min scale
const P1 = 0.55; // progress at which the zoom completes and the drift begins
const DRIFT_X = 92;
const DRIFT_Y = 56;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t); // smoothstep, no overshoot

// zoom progress and the docked-frame transform, as pure functions of progress.
const zAt = (v: number) => smooth(clamp01(v / P1));
const scaleAt = (v: number) => 1 + (SCALE - 1) * zAt(v);
// drift progress across the second half.
const dAt = (v: number) => smooth(clamp01((v - P1) / (1 - P1)));
// eased reveal ramp for staggered fade-ins.
const rampAt = (v: number, a: number, b: number) => smooth(clamp01((v - a) / (b - a)));

const dotGrid: React.CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};
const dotGridMini: React.CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)",
	backgroundSize: "9px 9px",
};

const liveSpine: React.CSSProperties = {
	background:
		"linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--color-thread) 55%, transparent) 4%, color-mix(in srgb, var(--color-thread) 55%, transparent) 96%, transparent 100%)",
};
const ghostSpine: React.CSSProperties = {
	background:
		"linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-thread) 42%, transparent) 15%, color-mix(in srgb, var(--color-thread) 42%, transparent) 85%, transparent)",
};

/* ---------- reveal hook: eased opacity + rise, in lockstep with progress ---------- */

function useRamp(sp: MotionValue<number>, a: number, b: number, rise = 14) {
	const opacity = useTransform(sp, (v) => rampAt(v, a, b));
	const y = useTransform(sp, (v) => (1 - rampAt(v, a, b)) * rise);
	return { opacity, y };
}

/* ---------- copy-to-clipboard, verbatim from the canonical landing ---------- */

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
			<rect
				x="4.25"
				y="4.25"
				width="6"
				height="6"
				rx="1"
				stroke="currentColor"
				strokeWidth="1.2"
			/>
			<path
				d="M2.75 7.75h-.5a.75.75 0 0 1-.75-.75V2.25a.75.75 0 0 1 .75-.75H7a.75.75 0 0 1 .75.75v.5"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/**
 * One install line. The whole line is the button; the "$" prompt is the
 * affordance, hover or focus swaps it for a thread copy glyph, the command is
 * never covered. Copying strips the prompt so the clipboard is paste-ready; the
 * copied tick holds for a beat. The prompt cell keeps a fixed 2ch footprint so
 * the swaps never reflow the line.
 */
function CommandLine({ command }: { command: string }) {
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

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={copied ? `copied ${command}` : `copy ${command}`}
			className="group block w-full cursor-pointer text-left focus-visible:outline-none"
		>
			<span className="inline-flex w-[2ch] select-none items-center align-middle">
				{copied ? (
					<Tick className="text-thread" />
				) : (
					<>
						<span className="text-muted group-hover:hidden group-focus-visible:hidden">
							$
						</span>
						<CopyGlyph className="hidden text-thread group-hover:block group-focus-visible:block" />
					</>
				)}
			</span>
			{command}
		</button>
	);
}

/* ---------- shared marks ---------- */

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

/* ---------- the scroll affordance: replaces v1's fourth-wall trigger ---------- */

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

/* ---------- the rest-state landing (also the live frame's content) ---------- */

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
							<h1 className="text-[66px] font-semibold leading-[0.98] tracking-[-0.02em]">
								feel an app
								<br />
								before it exists
							</h1>
							<p className="mt-6 max-w-[452px] text-[17px] leading-[26px] text-muted">
								a live prototyping canvas. your agent authors live tsx frames on
								an infinite canvas and links them into walkable flows. you feel
								the real thing, interactions and motion and inputs, before it
								exists.
							</p>

							<div className="mt-9">
								<div className="flex gap-5">
									<span className="w-px shrink-0 self-stretch bg-thread/70" />
									<div className="w-[320px] font-mono text-[15px] leading-[30px]">
										<CommandLine command="npm i -g spool.page" />
										<CommandLine command="spool init" />
										<CommandLine command="spool serve" />
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
					<span className="font-mono text-xs text-muted">
						github.com/liamvinberg/spool
					</span>
				</footer>
			</div>
		</div>
	);
}

/* ---------- ghost wireframes: one faithful silhouette per real variant ---------- */

function Bar({ w, className }: { w: string; className?: string }) {
	return (
		<div
			className={cn("h-[3px] rounded-full bg-border-raised", className)}
			style={{ width: w }}
		/>
	);
}

/** landing--twohands: a live design session on the landing. A selection ring
 *  with corner handles hugs the statement; two labelled cursors work the page. */
function GTwohands() {
	return (
		<div className="relative h-full w-full">
			<div className="absolute inset-y-1 left-[16%] w-px" style={ghostSpine} />
			<div className="absolute left-[24%] right-[8%] top-[16%]">
				<div className="relative w-fit">
					<div className="space-y-1.5">
						<div className="h-2.5 w-[94px] rounded-sm bg-raised" />
						<div className="h-2.5 w-[70px] rounded-sm bg-raised" />
					</div>
					<div className="absolute -inset-1.5 border border-thread/55" />
					{[
						"-left-[3px] -top-[3px]",
						"-right-[3px] -top-[3px]",
						"-left-[3px] -bottom-[3px]",
						"-right-[3px] -bottom-[3px]",
					].map((p) => (
						<span
							key={p}
							className={cn(
								"absolute h-[5px] w-[5px] border border-thread bg-surface",
								p,
							)}
						/>
					))}
				</div>
				<div className="mt-4 flex gap-1.5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="space-y-1">
						<Bar w="72px" />
						<Bar w="54px" />
						<Bar w="62px" />
					</div>
				</div>
			</div>
			<MiniCursor className="left-[50%] top-[26%]" tone="agent" />
			<MiniCursor className="left-[68%] top-[64%]" tone="you" />
		</div>
	);
}

function MiniCursor({
	className,
	tone,
}: {
	className?: string;
	tone: "agent" | "you";
}) {
	const fill = tone === "agent" ? "var(--color-thread)" : "var(--color-text)";
	return (
		<span className={cn("absolute", className)}>
			<svg width="11" height="12" viewBox="0 0 22 24" fill="none" className="block">
				<path
					d="M2 2 L2 16.8 L6.1 12.9 L8.9 19.2 L11.1 18.3 L8.4 12.2 L13.5 12 Z"
					fill={fill}
					stroke="var(--color-surface)"
					strokeWidth="1.8"
					strokeLinejoin="round"
				/>
			</svg>
			<span
				className={cn(
					"absolute left-[9px] top-[8px] block h-1.5 rounded-[1px]",
					tone === "agent" ? "w-4 bg-thread" : "w-3 bg-text",
				)}
			/>
		</span>
	);
}

/** landing--selfsource: a source rail types the page's own frame.tsx while the
 *  page assembles beside it. Left: mono lines + gutter + caret. Right: content. */
function GSelfsource() {
	const lines = ["68px", "40px", "76px", "52px", "60px", "44px"];
	return (
		<div className="flex h-full w-full overflow-hidden rounded-[2px]">
			<div className="relative flex h-full w-[47%] shrink-0 flex-col border-r border-border bg-canvas">
				<div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
					<span className="h-1.5 w-1.5 rounded-full bg-thread" />
					<div className="h-1.5 w-9 rounded-sm bg-raised" />
				</div>
				<div className="space-y-[5px] p-2">
					{lines.map((w, i) => (
						<div key={w + i} className="flex items-center gap-1.5">
							<span className="h-[3px] w-1.5 rounded-full bg-border-raised/70" />
							<div
								className="h-[3px] rounded-full bg-border-raised"
								style={{ width: w }}
							/>
							{i === lines.length - 1 ? (
								<span className="block h-2.5 w-[2px] bg-thread" />
							) : null}
						</div>
					))}
				</div>
			</div>
			<div className="relative flex-1 p-2.5" style={dotGridMini}>
				<div className="space-y-1.5">
					<div className="h-2.5 w-[74%] rounded-sm bg-raised" />
					<div className="h-2.5 w-[54%] rounded-sm bg-raised" />
				</div>
				<div className="mt-3 flex gap-1.5">
					<span className="w-px shrink-0 self-stretch bg-thread/60" />
					<div className="space-y-1">
						<Bar w="80%" />
						<Bar w="60%" />
					</div>
				</div>
			</div>
		</div>
	);
}

/** landing--stage: a type-led hero over a lit stage canvas carrying a walk (a
 *  ringed tall frame) with supporting frames and a player pill. */
function GStage() {
	return (
		<div className="flex h-full w-full flex-col items-center">
			<div className="mt-0.5 flex flex-col items-center gap-1">
				<div className="h-2 w-[92px] rounded-sm bg-raised" />
				<div className="h-2 w-[66px] rounded-sm bg-raised" />
			</div>
			<div
				className="relative mt-2.5 h-[60%] w-[90%] overflow-hidden rounded-[3px] border border-border bg-canvas"
				style={dotGrid}
			>
				<div className="absolute left-[8%] top-[12%] h-[74%] w-[27%] overflow-hidden rounded-[2px] border border-thread/55 bg-surface">
					<div className="space-y-[3px] p-1.5">
						<div className="h-4 w-full rounded-[1px] bg-raised" />
						<Bar w="80%" className="bg-raised" />
						<Bar w="58%" className="bg-raised" />
					</div>
				</div>
				<div className="absolute right-[10%] top-[14%] h-[36%] w-[32%] space-y-1 rounded-[2px] border border-border bg-canvas p-1.5">
					<Bar w="72%" className="bg-raised" />
					<Bar w="52%" className="bg-raised" />
				</div>
				<div className="absolute right-[12%] bottom-[16%] h-[30%] w-[28%] rounded-[2px] border border-border bg-canvas" />
				<div className="absolute bottom-[9%] left-[9%] flex h-[13px] w-[42%] items-center gap-1 rounded-full border border-border bg-surface px-1.5">
					<svg width="6" height="6" viewBox="0 0 8 8" aria-hidden="true">
						<path d="M2 1.5 6.5 4 2 6.5Z" fill="var(--color-thread)" />
					</svg>
					<div className="h-[2px] flex-1 overflow-hidden rounded-full bg-border-raised">
						<div className="h-full w-1/3 rounded-full bg-thread" />
					</div>
				</div>
			</div>
		</div>
	);
}

/** landing--kinetic: type cinema. A colossal two-line statement with the röda
 *  tråden woven through the letterforms; the install sits bottom-left. */
function GKinetic() {
	return (
		<div className="relative h-full w-full">
			<div className="absolute left-[10%] right-[8%] top-[22%] space-y-2.5">
				<div className="h-4 w-[82%] rounded-sm bg-raised" />
				<div className="h-4 w-[60%] rounded-sm bg-raised" />
			</div>
			<svg
				viewBox="0 0 100 60"
				preserveAspectRatio="none"
				className="absolute inset-0 h-full w-full"
				aria-hidden="true"
			>
				<path
					d="M14 8 C 20 26, 6 30, 26 33 C 52 36, 60 22, 78 30"
					stroke="var(--color-thread)"
					strokeWidth="1.4"
					strokeOpacity="0.5"
					strokeLinecap="round"
					fill="none"
				/>
				<path
					d="M78 30 C 90 34, 84 48, 60 50 C 40 51.5, 28 47, 18 52"
					stroke="var(--color-thread)"
					strokeWidth="1.4"
					strokeOpacity="0.5"
					strokeLinecap="round"
					fill="none"
				/>
			</svg>
			<div className="absolute bottom-[12%] left-[10%] flex gap-1.5">
				<span className="w-px shrink-0 self-stretch bg-thread/70" />
				<div className="space-y-1">
					<Bar w="46px" />
					<Bar w="34px" />
				</div>
			</div>
		</div>
	);
}

/** landing--livewire: scroll cinema. One thread drawn down the page, weaving
 *  left and right through four cinching nodes with a stance beside each. */
function GLivewire() {
	const nodes = [
		{ x: "34%", y: "24%" },
		{ x: "66%", y: "46%" },
		{ x: "34%", y: "68%" },
		{ x: "66%", y: "88%" },
	];
	return (
		<div className="relative h-full w-full">
			<svg
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				className="absolute inset-0 h-full w-full"
				aria-hidden="true"
			>
				<path
					d="M60 2 C 40 12, 20 18, 34 24 C 58 33, 78 40, 66 46 C 42 56, 22 62, 34 68 C 58 78, 78 84, 66 88 C 52 92, 40 94, 44 99"
					stroke="var(--color-thread)"
					strokeWidth="1.3"
					strokeOpacity="0.5"
					strokeLinecap="round"
					fill="none"
				/>
			</svg>
			{nodes.map((n) => (
				<span
					key={n.x + n.y}
					className="absolute block h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-thread/70 ring-2 ring-surface"
					style={{ left: n.x, top: n.y }}
				/>
			))}
			<div className="absolute left-[10%] top-[20%] space-y-1">
				<Bar w="30px" />
				<Bar w="22px" />
			</div>
			<div className="absolute right-[10%] top-[42%] space-y-1 text-right">
				<Bar w="30px" className="ml-auto" />
				<Bar w="22px" className="ml-auto" />
			</div>
			<div className="absolute left-[10%] top-[64%] space-y-1">
				<Bar w="28px" />
				<Bar w="20px" />
			</div>
		</div>
	);
}

/** landing--quiet: the broadsheet. A masthead statement, hairline rules banding
 *  an asymmetric grid, one open margin with the sole living ribbon. */
function GQuiet() {
	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex items-center justify-between border-b border-border pb-1.5">
				<div className="h-1.5 w-6 rounded-sm bg-raised" />
				<div className="h-1 w-9 bg-border-raised" />
			</div>
			<div className="flex min-h-0 flex-1">
				<div className="flex flex-1 flex-col pr-2">
					<div className="flex flex-[1.3] items-center border-b border-border">
						<div className="space-y-1.5">
							<div className="h-3 w-[82%] rounded-sm bg-raised" />
							<div className="h-3 w-[58%] rounded-sm bg-raised" />
						</div>
					</div>
					<div className="flex flex-1 items-center border-b border-border">
						<div className="flex gap-1.5">
							<span className="w-px shrink-0 self-stretch bg-thread" />
							<div className="space-y-1">
								<Bar w="44px" />
								<Bar w="32px" />
							</div>
						</div>
					</div>
					<div className="flex flex-1 items-center">
						<div className="w-full space-y-1">
							<Bar w="64%" />
							<Bar w="48%" />
						</div>
					</div>
				</div>
				<div className="flex w-[26%] items-center justify-center border-l border-border">
					<SpoolMark className="h-7 w-7 text-thread/40" title="spool ribbon" />
				</div>
			</div>
		</div>
	);
}

/** landing--fourthwall: the inception itself. A dot-grid canvas carrying a
 *  thread-ringed live frame surrounded by its own ghost set, one arrow walked in. */
function GFourthwall() {
	return (
		<div
			className="relative h-full w-full overflow-hidden rounded-[2px] bg-canvas"
			style={dotGridMini}
		>
			<div className="absolute left-[8%] top-[14%] h-[24%] w-[22%] rounded-[1px] border border-border bg-surface/70" />
			<div className="absolute right-[9%] top-[16%] h-[22%] w-[21%] rounded-[1px] border border-border bg-surface/70" />
			<div className="absolute left-[11%] bottom-[13%] h-[22%] w-[22%] rounded-[1px] border border-border bg-surface/70" />
			<div className="absolute right-[11%] bottom-[15%] h-[20%] w-[20%] rounded-[1px] border border-border bg-surface/70" />
			<div className="absolute left-[31%] top-[30%] h-[42%] w-[38%] rounded-[3px] border border-thread/30" />
			<div className="absolute left-[34%] top-[34%] h-[34%] w-[32%] overflow-hidden rounded-[2px] border border-thread/60 bg-surface">
				<div className="space-y-1 p-1.5">
					<Bar w="82%" className="bg-raised" />
					<Bar w="56%" className="bg-raised" />
				</div>
			</div>
			<svg
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				className="absolute inset-0 h-full w-full"
				aria-hidden="true"
			>
				<path
					d="M22 32 C 30 40, 32 44, 34 47"
					stroke="var(--color-thread)"
					strokeWidth="1"
					strokeOpacity="0.55"
					strokeDasharray="3 3"
					fill="none"
				/>
			</svg>
		</div>
	);
}

/* ---------- ghost placement around the live frame, in scene coordinates ---------- */

interface Spec {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	C: () => React.ReactNode;
	start: number;
}

const GHOSTS: Spec[] = [
	{ name: "landing--selfsource", x: 262, y: 398, w: 206, h: 150, C: GSelfsource, start: 0.52 },
	{ name: "landing--kinetic", x: 566, y: 96, w: 220, h: 122, C: GKinetic, start: 0.55 },
	{ name: "landing--twohands", x: 206, y: 150, w: 214, h: 132, C: GTwohands, start: 0.575 },
	{ name: "landing--quiet", x: 928, y: 150, w: 196, h: 130, C: GQuiet, start: 0.6 },
	{ name: "landing--livewire", x: 1074, y: 322, w: 190, h: 156, C: GLivewire, start: 0.625 },
	{ name: "landing--fourthwall", x: 300, y: 648, w: 230, h: 150, C: GFourthwall, start: 0.65 },
	{ name: "landing--stage", x: 648, y: 672, w: 238, h: 150, C: GStage, start: 0.675 },
];

/**
 * Hover is transform/opacity only: a gentle lift-scale on the tile, a thread
 * ring fading in around it, and the name tab warming to thread. Nothing here
 * touches layout properties, so hovering can never reflow the canvas.
 */
function Ghost({ spec, sp }: { spec: Spec; sp: MotionValue<number> }) {
	const { opacity, y } = useRamp(sp, spec.start, spec.start + 0.14);
	return (
		<motion.div
			className="group absolute"
			style={{ left: spec.x, top: spec.y, opacity, y }}
		>
			<div className="mb-1.5 flex items-center gap-1 font-mono text-[10px] leading-none text-muted transition-colors duration-200 group-hover:text-thread">
				<span className="text-[8px] opacity-60">▸</span>
				<span>{spec.name}</span>
			</div>
			<motion.div
				className="relative rounded-[4px]"
				style={{ width: spec.w, height: spec.h }}
				whileHover={{ scale: 1.015 }}
				transition={{ type: "spring", stiffness: 300, damping: 24 }}
			>
				<div className="absolute inset-0 overflow-hidden rounded-[4px] border border-border bg-surface">
					<div className="absolute inset-0 p-2.5">
						<spec.C />
					</div>
				</div>
				<div className="pointer-events-none absolute -inset-px rounded-[4px] border border-thread/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
			</motion.div>
		</motion.div>
	);
}

/* ---------- the walked arrow: selfsource graduated into the live frame ---------- */

const ARROW_A = { x: 470, y: 474 };
const ARROW_B = { x: 546, y: 473 };
const ARROW_D = `M ${ARROW_A.x} ${ARROW_A.y} C 502 472, 522 476, ${ARROW_B.x} ${ARROW_B.y}`;

function GraduationArrow({ sp }: { sp: MotionValue<number> }) {
	const len = useTransform(sp, (v) => rampAt(v, 0.6, 0.78));
	const glow = useTransform(sp, (v) => rampAt(v, 0.6, 0.82) * 0.16);
	const head = useTransform(sp, (v) => rampAt(v, 0.74, 0.82));
	const pulse = useTransform(sp, (v) => rampAt(v, 0.66, 0.82));
	// Gate the whole svg: at pathLength 0 a round-capped stroke still renders a
	// dot at each anchor, so the undrawn arrow must not paint at all at rest.
	const gate = useTransform(sp, (v) => rampAt(v, 0.585, 0.605));
	return (
		<>
			<motion.svg
				className="pointer-events-none absolute inset-0 z-20 h-full w-full"
				viewBox="0 0 1440 900"
				fill="none"
				aria-hidden="true"
				style={{ opacity: gate }}
			>
				<motion.path
					d={ARROW_D}
					stroke="var(--color-thread)"
					strokeWidth="5"
					strokeLinecap="round"
					style={{ pathLength: len, opacity: glow }}
				/>
				<motion.path
					d={ARROW_D}
					stroke="var(--color-thread)"
					strokeWidth="1.5"
					strokeLinecap="round"
					style={{ pathLength: len, opacity: 0.9 }}
				/>
				<motion.path
					d={`M ${ARROW_B.x - 6} ${ARROW_B.y - 4} L ${ARROW_B.x} ${ARROW_B.y} L ${ARROW_B.x - 6} ${ARROW_B.y + 4}`}
					stroke="var(--color-thread)"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					style={{ opacity: head }}
				/>
			</motion.svg>
			{/* the walk: a faint pulse flowing along the graduated edge. The sp gate
			    lives on the parent so it stays invisible until the arrow is drawn;
			    the child owns the looping travel (an animate opacity here would
			    otherwise override a style-level gate and leak at rest). */}
			<motion.div
				className="pointer-events-none absolute inset-0 z-20"
				style={{ opacity: pulse }}
			>
				<motion.span
					className="absolute block h-1.5 w-1.5 rounded-full bg-thread"
					style={{
						left: ARROW_A.x - 3,
						top: ARROW_A.y - 3,
						boxShadow:
							"0 0 6px 1px color-mix(in srgb, var(--color-thread) 70%, transparent)",
					}}
					animate={{
						x: [0, ARROW_B.x - ARROW_A.x],
						y: [0, ARROW_B.y - ARROW_A.y],
						opacity: [0, 0, 1, 1, 0],
					}}
					transition={{
						duration: 2.4,
						repeat: Infinity,
						ease: "easeInOut",
						delay: 0.7,
					}}
				/>
			</motion.div>
		</>
	);
}

/* ---------- the live frame's chrome: it hugs the current rect through the zoom ---------- */

function LiveChrome({ sp }: { sp: MotionValue<number> }) {
	const x = useTransform(sp, (v) => LIVE.x * zAt(v));
	const y = useTransform(sp, (v) => LIVE.y * zAt(v));
	const w = useTransform(sp, (v) => VIEW_W * scaleAt(v));
	const h = useTransform(sp, (v) => VIEW_H * scaleAt(v));
	// arrives as the scale passes ~0.75, fully present just before the dock.
	const opacity = useTransform(sp, (v) =>
		clamp01((0.78 - scaleAt(v)) / (0.78 - 0.45)),
	);
	const corner =
		"absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";
	return (
		<motion.div
			className="pointer-events-none absolute left-0 top-0 z-30"
			style={{ x, y, width: w, height: h, opacity }}
		>
			{/* name tab */}
			<div className="absolute -top-[22px] left-0 flex items-center gap-1.5 font-mono text-xs leading-none text-thread">
				<span>landing</span>
			</div>
			{/* selection ring */}
			<div className="absolute -inset-[3px] rounded-[13px] border-[1.5px] border-thread" />
			<span className={cn(corner, "-left-[7px] -top-[7px]")} />
			<span className={cn(corner, "-right-[7px] -top-[7px]")} />
			<span className={cn(corner, "-left-[7px] -bottom-[7px]")} />
			<span className={cn(corner, "-right-[7px] -bottom-[7px]")} />
			{/* size chip */}
			<div className="absolute left-1/2 -bottom-[9px] -translate-x-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs leading-none text-on-thread">
				1440 × 900
			</div>
		</motion.div>
	);
}

/* ---------- caption: lands last, quiet mono, the install echoed beside it ---------- */

function Caption({ sp }: { sp: MotionValue<number> }) {
	const { opacity, y } = useRamp(sp, 0.82, 0.98, 12);
	return (
		<motion.div
			className="absolute z-30 font-mono"
			style={{ left: 930, top: 636, width: 470, opacity, y }}
		>
			<div className="flex items-end justify-end gap-5">
				<div className="w-[152px] shrink-0 pb-[3px] text-left text-xs leading-[18px] text-muted">
					<CommandLine command="npm i -g spool.page" />
				</div>
				<div className="text-right">
					<div className="whitespace-nowrap text-xs leading-[17px] text-muted">
						every landing you just did not see.
					</div>
					<div className="mt-1 whitespace-nowrap text-sm leading-[18px] text-text">
						one canvas, one thread.
					</div>
				</div>
			</div>
		</motion.div>
	);
}

/* ---------- orchestrator ---------- */

export default function FourthwallScroll() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({ container: scrollRef });

	// one overdamped spring smooths the scroll clock; every transform derives from
	// it, so scale, position, drift and every fade stay in exact lockstep.
	const sp = useSpring(scrollYProgress, {
		stiffness: 100,
		damping: 40,
		mass: 1,
	});

	// the one wrapper carrying the landing: transform-only zoom into the dock.
	const frameScale = useTransform(sp, scaleAt);
	const frameX = useTransform(sp, (v) => LIVE.x * zAt(v));
	const frameY = useTransform(sp, (v) => LIVE.y * zAt(v));
	const frameRadius = useTransform(sp, (v) => 44 * zAt(v));

	// the camera drift across the canvas, second half only.
	const camX = useTransform(sp, (v) => -DRIFT_X * dAt(v));
	const camY = useTransform(sp, (v) => -DRIFT_Y * dAt(v));

	// the dot-grid canvas: parallax-settles in behind, then drifts at a slower rate.
	const gridX = useTransform(sp, (v) => -DRIFT_X * 0.42 * dAt(v));
	const gridY = useTransform(sp, (v) => -DRIFT_Y * 0.42 * dAt(v));
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
					{/* canvas layer: dot grid, behind everything, parallax */}
					<motion.div
						className="absolute inset-[-80px]"
						style={{ ...dotGrid, x: gridX, y: gridY, scale: gridScale, opacity: gridOpacity }}
					/>

					{/* the scene: ghosts, arrow, live frame, chrome and caption pan together */}
					<motion.div className="absolute inset-0 z-10" style={{ x: camX, y: camY }}>
						{GHOSTS.map((spec) => (
							<Ghost key={spec.name} spec={spec} sp={sp} />
						))}

						<GraduationArrow sp={sp} />

						{/* the landing: one wrapper, transform-only zoom */}
						<motion.div
							className="absolute inset-0 z-10 origin-top-left overflow-hidden bg-bg [will-change:transform]"
							style={{ x: frameX, y: frameY, scale: frameScale, borderRadius: frameRadius }}
						>
							<LandingContent hint={hint} />
						</motion.div>

						<LiveChrome sp={sp} />
						<Caption sp={sp} />
					</motion.div>
				</div>
			</div>
		</div>
	);
}
