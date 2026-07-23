import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--kinetic — type cinema. One screen, one colossal statement, and the
 * röda tråden drawn as a single SVG thread that literally weaves through the
 * letterforms: split into behind/front segments so it threads by paint order,
 * never by overlay measurement (the player scales the frame document, so runtime
 * getBoundingClientRect would lie — issue #53). Everything the thread must align
 * with lives in one 1440x900 SVG coordinate space, hand-composed, no measuring.
 *
 * The statement and the full weave are static at render (composed at boot; the
 * `spool shot` capture lands ~300ms in). The kinetic layer rides on top: a bright
 * highlight comet travels the whole thread on a seamless pathLength/pathOffset
 * loop, masked by the behind-words so the light dives behind them too. The type
 * breathes on a slow scale oscillation, and each word swells under the cursor on
 * a spring. Familjen Grotesk ships as static weight cuts here (400..700), so the
 * breath is optical scale, not a variable axis — never faked with blur or shadow.
 */

// ── the statement, as placed glyphs ──────────────────────────────────────────
// Each word is its own <text> so it can carry its own hover transform (SVG
// disallows transforms on <tspan>). x values are hand-set against the rendered
// metrics of Familjen Grotesk semibold; the two lines fill most of the width.
const F = 176;
const Y1 = 430;
const Y2 = 612;

type Word = { t: string; x: number };
const LINE1: Word[] = [
	{ t: "feel", x: 100 },
	{ t: "an", x: 420 },
	{ t: "app", x: 650 },
];
const LINE2: Word[] = [
	{ t: "before", x: 100 },
	{ t: "it", x: 630 },
	{ t: "exists", x: 776 },
];

// ── the thread ────────────────────────────────────────────────────────────────
// One continuous curve, authored top→bottom, entering and exiting off-canvas so
// the loop's seam is never on screen. Split at points that fall in the empty gaps
// between words, so a segment that overlaps a word is wholly in that word's layer
// and the behind→front hand-offs are invisible. FULL is the same curve unbroken,
// for the traveling comet.
const BEHIND: string[] = [
	// dive through the solid junction of the "ee" of "feel"
	"M 242 322 C 234 384, 230 436, 228 476",
	// dive through the "ore" of "before", skirting the counters
	"M 448 500 C 430 532, 416 578, 410 628",
];
const FRONT: string[] = [
	// enter from off the top, drop toward "feel"
	"M 250 -70 C 260 70, 258 215, 242 322",
	// emerge below feel, loop up over the "pp" of "app", fall away toward "before"
	"M 228 476 C 360 502, 520 494, 610 468 C 690 445, 706 432, 742 418 C 782 396, 838 396, 878 414 C 934 432, 908 488, 806 502 C 664 522, 528 514, 448 500",
	// travel below line 2, climb over the "xis" of "exists", leave off the right edge
	"M 410 628 C 590 672, 800 668, 892 636 C 958 613, 1000 586, 1014 556 C 1130 590, 1330 604, 1520 628",
];
const FULL =
	"M 250 -70 C 260 70, 258 215, 242 322 " +
	"C 234 384, 230 436, 228 476 " +
	"C 360 502, 520 494, 610 468 C 690 445, 706 432, 742 418 C 782 396, 838 396, 878 414 C 934 432, 908 488, 806 502 C 664 522, 528 514, 448 500 " +
	"C 430 532, 416 578, 410 628 " +
	"C 590 672, 800 668, 892 636 C 958 613, 1000 586, 1014 556 C 1130 590, 1330 604, 1520 628";

// words the thread passes behind — reused to occlude the comet by mask
const BEHIND_WORDS: Array<Word & { y: number }> = [
	{ t: "feel", x: 100, y: Y1 },
	{ t: "before", x: 100, y: Y2 },
];

const THREAD = "var(--color-thread)";

function StatementWord({ t, x, y }: Word & { y: number }) {
	return (
		<motion.text
			x={x}
			y={y}
			className="font-sans fill-text"
			fontSize={F}
			textAnchor="start"
			style={{
				transformBox: "fill-box",
				transformOrigin: "center",
				cursor: "default",
			}}
			initial={{ scale: 1, fontWeight: 600 }}
			whileHover={{ scale: 1.05, fontWeight: 700 }}
			transition={{ type: "spring", stiffness: 220, damping: 20, mass: 0.6 }}
		>
			{t}
		</motion.text>
	);
}

function Weave() {
	// The comet's position along the thread. Each stroke advances pathOffset one
	// full period on a linear loop; because pathOffset 1.34 ≡ 0.34 (mod 1) the wrap
	// is identical to the start, so the loop is seamless. All three strokes mount
	// together with the same timing, so halo/body/core travel in lockstep, and the
	// 0.34 start means the highlight is already on screen the moment the frame boots.
	const comet = [
		{ w: 18, o: 0.16, stroke: THREAD },
		{ w: 5, o: 1, stroke: THREAD },
		{ w: 3.5, o: 1, stroke: "#FFC2AE" },
	];

	return (
		<svg
			viewBox="0 0 1440 900"
			preserveAspectRatio="xMidYMid meet"
			className="absolute inset-0 h-full w-full"
		>
			<defs>
				<mask
					id="kinetic-weave-mask"
					maskUnits="userSpaceOnUse"
					x="0"
					y="0"
					width="1440"
					height="900"
				>
					<rect x="0" y="0" width="1440" height="900" fill="white" />
					{BEHIND_WORDS.map((w) => (
						<text
							key={w.t + w.x}
							x={w.x}
							y={w.y}
							className="font-sans"
							fill="black"
							fontSize={F}
							fontWeight={600}
							textAnchor="start"
						>
							{w.t}
						</text>
					))}
				</mask>
			</defs>

			{/* thread behind the words */}
			<g
				fill="none"
				stroke={THREAD}
				strokeWidth={4}
				strokeLinecap="round"
				strokeLinejoin="round"
				opacity={0.46}
			>
				{BEHIND.map((d) => (
					<path key={d} d={d} />
				))}
			</g>

			{/* the statement, breathing */}
			<motion.g
				style={{ transformBox: "view-box", transformOrigin: "660px 470px" }}
				animate={{ scale: [1, 1.006, 1] }}
				transition={{ duration: 15, ease: "easeInOut", repeat: Infinity }}
			>
				{LINE1.map((w) => (
					<StatementWord key={w.t + w.x} {...w} y={Y1} />
				))}
				{LINE2.map((w) => (
					<StatementWord key={w.t + w.x} {...w} y={Y2} />
				))}
			</motion.g>

			{/* thread in front of the words */}
			<g
				fill="none"
				stroke={THREAD}
				strokeWidth={4}
				strokeLinecap="round"
				strokeLinejoin="round"
				opacity={0.48}
			>
				{FRONT.map((d) => (
					<path key={d} d={d} />
				))}
			</g>

			{/* traveling highlight — masked so it dives behind the behind-words too */}
			<g mask="url(#kinetic-weave-mask)" fill="none" strokeLinecap="round">
				{comet.map((c) => (
					<motion.path
						key={c.w}
						d={FULL}
						stroke={c.stroke}
						strokeWidth={c.w}
						opacity={c.o}
						initial={{ pathLength: 0.16, pathOffset: 0.34 }}
						animate={{ pathOffset: 1.34 }}
						transition={{ duration: 9, ease: "linear", repeat: Infinity }}
					/>
				))}
			</g>
		</svg>
	);
}

/**
 * Paste-ready copy. Frames run in null-origin sandboxed srcdoc, so the async
 * Clipboard API can reject outright — try it, then fall back to the classic
 * hidden-textarea execCommand path. Silent on both branches: no console output.
 */
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
 * affordance — hover (or keyboard focus) swaps it for the copy glyph, the
 * command itself is never covered. Copying strips the prompt so the clipboard
 * is paste-ready; the copied tick holds for a beat. The prompt cell has a
 * fixed 2ch footprint so the swaps never reflow the line.
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

export default function LandingKinetic() {
	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased">
			{/* the stage: statement + weaving thread, one shared coordinate space */}
			<Weave />

			{/* canonical header */}
			<header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-[100px] py-11">
				<div className="flex items-center gap-2.5">
					<SpoolMark className="h-5 w-5 text-thread" title="spool" />
					<span className="text-md font-semibold tracking-tight">spool</span>
				</div>
				<div className="flex items-center gap-6 font-mono text-xs text-muted">
					<span>spool.page</span>
					<a
						href="https://github.com/liamvinberg/spool"
						className="text-text transition-colors hover:text-thread"
					>
						github.com/liamvinberg/spool
					</a>
				</div>
			</header>

			{/* install — the one interactive beat, bottom-left, fine print beside */}
			<div className="absolute bottom-0 left-0 z-10 flex items-end gap-10 px-[100px] pb-14">
				<div className="flex gap-5">
					<span className="w-px shrink-0 self-stretch bg-thread/70" />
					<div className="w-[320px] font-mono text-[16px] leading-[32px]">
						<CommandLine command="npm i -g spool.page" />
						<CommandLine command="spool init" />
						<CommandLine command="spool serve" />
					</div>
				</div>
				<p className="pb-1.5 font-mono text-xs leading-[18px] text-muted">
					requires node 22+ · best in chrome · macos-first today
				</p>
			</div>
		</div>
	);
}
