import {
	motion,
	useMotionValue,
	useScroll,
	useSpring,
	useTime,
	useTransform,
	type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * landing--livewire — scroll cinema built on the brand's literal name, the röda
 * tråden. One continuous red thread runs the whole page and is drawn by scroll
 * progress: it spools out of the hero mark, underlines the statement, becomes
 * the rule beside the install lines, weaves through the four stance points
 * (a node cinches at each), and ties off beside the footer wordmark. Scrolling
 * draws it; scrolling back undraws it. Sections reveal in lockstep with the
 * thread reaching them.
 *
 * The path lives in one fixed 1440x3100 coordinate space (SVG user units ==
 * layout px), so nothing is measured at runtime — no getBoundingClientRect,
 * which lies under the player's scale (#53). motion's useScroll is bound to the
 * frame's own scroll container; scrollYProgress maps to a normalized pathLength
 * through a piecewise ramp whose keypoints (offline arc-length fractions of the
 * path vs. each stance's scroll moment) hold the drawn frontier exactly on the
 * reading line. A soft, overdamped spring gives the draw its trail. A traveling
 * pulse and a bright frontier tip ride the drawn portion so the resting states
 * stay alive.
 */

// ---- fixed page coordinate space: SVG user units are layout px ----
const PAGE_W = 1440;
const PAGE_H = 3100;

// The one thread. Every anchor below is a real point on this path.
const THREAD_D = [
	"M 1140 300", // spool origin, on the mark
	"C 1176 296 1188 330 1150 344", // curl off the spool
	"C 1092 402 902 470 720 502", // sweep down-left
	"C 560 512 360 512 198 508", // underline the statement  (= draw0)
	"C 176 620 176 1000 198 1120", // corner + vertical rule beside install
	"C 214 1210 236 1268 255 1330", // into stance 1 node       (= f1)
	"C 255 1490 1185 1530 1185 1690", // weave to stance 2 node (= f2)
	"C 1185 1850 255 1890 255 2050", // weave to stance 3 node  (= f3)
	"C 255 2210 1185 2250 1185 2410", // weave to stance 4 node (= f4)
	"C 1185 2640 560 2960 255 2960", // sweep down to the footer
	"C 300 2952 306 3006 262 3006", // tie-off knot, part one
	"C 226 3006 228 2966 258 2960", // tie-off knot, part two
].join(" ");

// scrollYProgress -> normalized pathLength. Keypoints are the offline
// arc-length fractions of the path at each anchor, paired with the scroll
// moment (node-Y centered in the viewport) at which the thread should reach it.
const DRAW_SCROLL = [0, 0.4, 0.5636, 0.7273, 0.8909, 1];
const DRAW_LENGTH = [0.1691, 0.3013, 0.4651, 0.629, 0.7929, 1];
const BOOT_DRAW = DRAW_LENGTH[0]; // thread is this drawn at scroll 0 (hero hand-span)

type Side = "left" | "right";
const STANCES: {
	k: string;
	v: string;
	nx: number;
	ny: number;
	side: Side;
	sp: number;
}[] = [
	{
		k: "your agent",
		v: "works through files and a cli, not a captive chat.",
		nx: 255,
		ny: 1330,
		side: "left",
		sp: 0.4,
	},
	{
		k: "your disk",
		v: "local-first. plain files inside your repo. git-friendly, no cloud, no accounts.",
		nx: 1185,
		ny: 1690,
		side: "right",
		sp: 0.5636,
	},
	{
		k: "real depth",
		v: "frames are real tsx. arbitrary js, real motion, real state.",
		nx: 255,
		ny: 2050,
		side: "left",
		sp: 0.7273,
	},
	{
		k: "flows",
		v: "walk screen to screen, with morphing transitions.",
		nx: 1185,
		ny: 2410,
		side: "right",
		sp: 0.8909,
	},
];

const INSTALL_TOP = 876;
const FOOTER_Y = 2960;
const LABEL_W = 380;
const LABEL_INSET = 305; // node sits 50px outboard of the label on both sides

// expo-out: firm arrival, no bounce.
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
// eased 0..1 ramp across [start,end] — function form only, so it clamps hard
// at both ends (the useTransform options object does not, in this pin).
const ramp = (v: number, start: number, end: number) =>
	expoOut(clamp01((v - start) / (end - start)));

const PULSE_LEN = 0.06; // length of the traveling current, as a path fraction
const PULSE_MS = 4200;
const TIP_LEN = 0.006; // bright spark sitting on the drawn frontier

/* ---------- copy-to-clipboard, verbatim from the canonical landing ---------- *
 * Frames run in a null-origin sandboxed srcdoc, so the async Clipboard API can
 * reject outright — try it, then fall back to the classic hidden-textarea
 * execCommand path. Silent on both branches: no console output. */
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
 * is paste-ready; the copied tick holds for a beat. The prompt cell has a fixed
 * 2ch footprint so the swaps never reflow the line.
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

/* ---------- reveal in lockstep with the thread ---------- */
function useReveal(sp: MotionValue<number>, start: number, end: number) {
	const opacity = useTransform(sp, (v) => ramp(v, start, end));
	const y = useTransform(sp, (v) => (1 - ramp(v, start, end)) * 22);
	return { opacity, y };
}

/* ---------- a node cinching onto the thread as the frontier passes ---------- *
 * Positioned by the exact path coordinate it sits on, so it rides the drawn
 * thread with no measurement. CSS transform on an HTML element scales about its
 * own centre — no SVG transform-box needed. */
function ThreadNode({ sp, node }: { sp: MotionValue<number>; node: { nx: number; ny: number; sp: number } }) {
	const t = useTransform(sp, (v) => ramp(v, node.sp - 0.09, node.sp + 0.008));
	const scale = useTransform(t, [0, 1], [1.9, 1]);
	return (
		<motion.div
			className="pointer-events-none absolute"
			style={{ left: node.nx, top: node.ny, x: "-50%", y: "-50%", scale, opacity: t }}
		>
			<div className="relative h-[9px] w-[9px]">
				<div className="absolute -inset-[7px] rounded-full border border-thread/30" />
				<div className="absolute -inset-[3px] rounded-full bg-bg" />
				<div className="absolute inset-0 rounded-full bg-thread" />
			</div>
		</motion.div>
	);
}

/* ---------- one stance pair, tucked into the crook of the weave ---------- */
function StanceLabel({ sp, stance }: { sp: MotionValue<number>; stance: (typeof STANCES)[number] }) {
	const { opacity, y } = useReveal(sp, stance.sp - 0.1, stance.sp);
	const right = stance.side === "right";
	return (
		<div
			className="absolute"
			style={{
				top: stance.ny,
				width: LABEL_W,
				transform: "translateY(-50%)",
				...(right ? { right: LABEL_INSET } : { left: LABEL_INSET }),
			}}
		>
			<motion.div style={{ opacity, y }} className={cn(right ? "text-right" : "text-left")}>
				<div className="text-[26px] font-semibold leading-[1.05] tracking-tight">
					{stance.k}
				</div>
				<p className="mt-3 text-[16px] leading-[24px] text-muted">{stance.v}</p>
			</motion.div>
		</div>
	);
}

export default function LandingLivewire() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({ container: scrollRef });

	// scroll -> draw. Piecewise ramp holds the frontier on the reading line;
	// the overdamped spring gives it a soft trailing draw with no overshoot.
	const rawLength = useTransform(scrollYProgress, DRAW_SCROLL, DRAW_LENGTH);
	const pathLength = useSpring(rawLength, {
		stiffness: 120,
		damping: 26,
		mass: 0.45,
	});

	// a slow current traveling the drawn portion, plus a spark on the frontier.
	// motion only wires up SVG path drawing when the length is a MotionValue,
	// so the dash lengths are held as motion values, not plain numbers.
	const pulseLen = useMotionValue(PULSE_LEN);
	const tipLen = useMotionValue(TIP_LEN);
	const time = useTime();
	const loop = useTransform(time, (t) => (t % PULSE_MS) / PULSE_MS);
	const pulseOffset = useTransform(
		[loop, pathLength] as MotionValue<number>[],
		([p, L]: number[]) => Math.max(0, p * (L - PULSE_LEN)),
	);
	const pulseOpacity = useTransform(loop, [0, 0.12, 0.85, 1], [0, 1, 1, 0]);
	const tipOffset = useTransform(pathLength, (L) => Math.max(0, L - TIP_LEN));

	return (
		<div
			ref={scrollRef}
			className="h-full w-full overflow-y-auto overflow-x-hidden bg-bg font-sans text-text antialiased"
		>
			<div className="relative w-full" style={{ height: PAGE_H }}>
				{/* faint livewire glow behind the hero mark — depth, not a card */}
				<div
					className="pointer-events-none absolute z-0"
					style={{
						top: 90,
						left: 800,
						width: 600,
						height: 540,
						background:
							"radial-gradient(closest-side, color-mix(in srgb, var(--color-thread) 12%, transparent), transparent 72%)",
					}}
				/>

				{/* the big spool the thread unwinds from */}
				<motion.div
					className="pointer-events-none absolute z-[1]"
					style={{ top: 172, left: 965, width: 300 }}
					animate={{ y: [0, -7, 0] }}
					transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
				>
					<SpoolMark className="w-full text-thread opacity-90" title="spool ribbon" />
				</motion.div>

				{/* the one thread, drawn by scroll */}
				<svg
					className="pointer-events-none absolute inset-0 z-[2]"
					width={PAGE_W}
					height={PAGE_H}
					viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
					fill="none"
				>
					<defs>
						<filter id="lw-glow" x="-25%" y="-25%" width="150%" height="150%">
							<feGaussianBlur stdDeviation="5" />
						</filter>
						<filter id="lw-spark" x="-300%" y="-300%" width="700%" height="700%">
							<feGaussianBlur stdDeviation="3.5" />
						</filter>
					</defs>

					{/* ambient glow under the thread */}
					<motion.path
						className="stroke-thread"
						d={THREAD_D}
						strokeWidth={10}
						strokeLinecap="round"
						strokeOpacity={0.22}
						filter="url(#lw-glow)"
						style={{ pathLength }}
					/>
					{/* the thread core */}
					<motion.path
						className="stroke-thread"
						d={THREAD_D}
						strokeWidth={2.4}
						strokeLinecap="round"
						style={{ pathLength }}
					/>
					{/* traveling current — on-thread light running the drawn wire */}
					<motion.path
						className="stroke-on-thread"
						d={THREAD_D}
						strokeWidth={3.2}
						strokeLinecap="round"
						filter="url(#lw-glow)"
						style={{
							pathLength: pulseLen,
							pathOffset: pulseOffset,
							opacity: pulseOpacity,
						}}
					/>
					{/* spark riding the drawn frontier */}
					<motion.path
						className="stroke-on-thread"
						d={THREAD_D}
						strokeWidth={4}
						strokeLinecap="round"
						filter="url(#lw-spark)"
						style={{ pathLength: tipLen, pathOffset: tipOffset }}
					/>
					{/* the spool origin, anchoring where the thread comes off */}
					<circle className="fill-thread" cx={1140} cy={300} r={3} />
				</svg>

				{/* the four cinching nodes, on the thread */}
				<div className="absolute inset-0 z-[3]">
					{STANCES.map((s) => (
						<ThreadNode
							key={s.k}
							sp={scrollYProgress}
							node={{ nx: s.nx, ny: s.ny, sp: s.sp }}
						/>
					))}
				</div>

				{/* content */}
				<div className="absolute inset-0 z-[4]">
					{/* header */}
					<div className="absolute flex items-center gap-2.5" style={{ top: 44, left: 200 }}>
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="text-md font-semibold tracking-tight">spool</span>
					</div>
					<div
						className="absolute flex items-center gap-6 font-mono text-xs text-muted"
						style={{ top: 48, right: 120 }}
					>
						<span>spool.page</span>
						<a
							href="https://github.com/liamvinberg/spool"
							className="text-text transition-colors hover:text-thread"
						>
							github.com/liamvinberg/spool
						</a>
					</div>

					{/* hero statement */}
					<h1
						className="absolute text-[76px] font-semibold leading-[0.98] tracking-[-0.02em]"
						style={{ top: 296, left: 200, width: 660 }}
					>
						feel an app
						<br />
						before it exists
					</h1>
					<p
						className="absolute text-[19px] leading-[28px] text-muted"
						style={{ top: 540, left: 200, width: 470 }}
					>
						a live prototyping canvas. your agent authors live tsx frames on an
						infinite canvas and links them into walkable flows. you feel the real
						thing, interactions and motion and inputs, before it exists.
					</p>

					{/* install — the thread is the rule beside these lines */}
					<InstallBlock sp={scrollYProgress} />

					{/* the four stance pairs */}
					{STANCES.map((s) => (
						<StanceLabel key={s.k} sp={scrollYProgress} stance={s} />
					))}

					{/* footer — the thread ties off beside the wordmark */}
					<FooterBlock sp={scrollYProgress} />
				</div>
			</div>
		</div>
	);
}

function InstallBlock({ sp }: { sp: MotionValue<number> }) {
	const { opacity, y } = useReveal(sp, 0.03, 0.17);
	return (
		<motion.div
			className="absolute"
			style={{ top: INSTALL_TOP, left: 240, opacity, y }}
		>
			<div className="w-[360px] font-mono text-[16px] leading-[34px]">
				<CommandLine command="npm i -g spool.page" />
				<CommandLine command="spool init" />
				<CommandLine command="spool serve" />
			</div>
			<div className="mt-6 font-mono text-xs text-muted">
				requires node 22+ · best in chrome · macos-first today
			</div>
		</motion.div>
	);
}

function FooterBlock({ sp }: { sp: MotionValue<number> }) {
	const { opacity, y } = useReveal(sp, 0.86, 0.97);
	return (
		<div
			className="absolute flex items-center justify-between"
			style={{ top: FOOTER_Y, left: 200, right: 120, transform: "translateY(-50%)" }}
		>
			<motion.div className="flex items-center gap-2.5" style={{ opacity, y }}>
				<SpoolMark className="h-4 w-4 text-thread" />
				<span className="text-sm text-muted">spool.page</span>
			</motion.div>
			<motion.a
				href="https://github.com/liamvinberg/spool"
				className="font-mono text-xs text-muted transition-colors hover:text-thread"
				style={{ opacity, y }}
			>
				github.com/liamvinberg/spool
			</motion.a>
		</div>
	);
}
