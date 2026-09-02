import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { ui } from "spool";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * site-hub--tutorial. The revealed pose of site-hub only: no hero, no scroll
 * story. The camera has already pulled back, the landing sits docked in its
 * ringed frame, the four sections stand around it, and a left rail lists the
 * site's pages exactly the way spool's own Pages rail does.
 *
 * The direction: it teaches you. A coaching layer draws itself onto the canvas
 * a beat after it resolves, in the language of annotations on a technical
 * drawing. Hairline leaders off a small thread anchor, a shelf, a mono label
 * sitting on the shelf. No bubbles, no cards, no numbering, no next.
 *
 * Three rules keep it out of product-tour territory:
 *
 *   1. Every annotation is bound to one gesture and retracts the instant that
 *      gesture happens. Doing the thing is the only dismissal, so there is
 *      nothing to close and nothing that can be in the way. The boot pose is
 *      composed, not sequenced: this frame is already the revealed state, so
 *      there is no resolve for a label to arrive after. The whole motion budget
 *      goes to the retraction, which is the moment that carries the meaning.
 *   2. An annotation appears only when it becomes relevant. "double-click to
 *      go inside" does not exist until you point at a frame, and then it hangs
 *      off the frame you are pointing at.
 *   3. A lesson performed is a lesson gone for good. Each one writes to
 *      ui.state, so a visitor coming back from a section gets only the gestures
 *      they never did, and a visitor who did all three gets a silent canvas.
 *      On the shipped site this key is localStorage, same shape.
 *
 * The selection model is the wordless half of the teaching. Click selects and
 * the red ring physically slides from the landing onto what you picked, rail
 * row following; double-click walks in. That is spool's real two-tier gesture,
 * learned by using it rather than by being told.
 *
 * Pulling back is real too: the wheel scales the scene toward 82%, the zoom
 * readout in the corner ticks with it, and the earlier takes parked outside the
 * viewport come into view. The payoff is the lesson.
 */

/* ---------- fixed coordinate space ---------- */

const RAIL_W = 248;
const FRAME_W = 1440;
const FRAME_H = 900;
const SCENE_W = FRAME_W - RAIL_W; // 1192
const SCENE_H = FRAME_H; // 900

const MIN_ZOOM = 0.82; // where a full pull-back lands
const EASE = [0.22, 1, 0.36, 1] as const;

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

/* ---------- glyphs ---------- */

function Bar({ w, className }: { w: string | number; className?: string }) {
	return <div className={cn("h-[3px] rounded-full bg-border-raised", className)} style={{ width: w }} />;
}

function PlayTri({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M2.5 1.6 8 5 2.5 8.4Z" />
		</svg>
	);
}

function FrameGlyph({ className }: { className?: string }) {
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
				d="M1.75 3.5h3.5l1.25 1.5h5.75v5.5H1.75z"
				stroke="currentColor"
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Caret({ open, className }: { open: boolean; className?: string }) {
	return (
		<svg
			viewBox="0 0 12 12"
			className={cn("origin-center transition-transform duration-[160ms]", open && "rotate-90", className)}
			style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
			fill="none"
			aria-hidden="true"
		>
			<path d="m4 2.5 3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/* ---------- the site's frames, as the canvas lays them out ---------- */

interface FrameSpec {
	id: string;
	/** the frame name, as the rail and the tab both say it */
	name: string;
	/** the one-line tab caption under the name */
	sub: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** where the "double-click to go inside" leader hangs when this is the first frame hovered */
	anno: { ax: number; ay: number; ex: number; ey: number; sx: number };
	Wire?: () => React.ReactNode;
}

const LANDING: FrameSpec = {
	id: "landing",
	name: "landing",
	sub: "The page you are on",
	x: 332,
	y: 306,
	w: 440,
	h: 275,
	anno: { ax: 500, ay: 581, ex: 538, ey: 617, sx: 718 },
};

const SECTIONS: readonly FrameSpec[] = [
	{
		id: "flows",
		name: "flows",
		sub: "Walk screen to screen",
		x: 108,
		y: 132,
		w: 292,
		h: 130,
		anno: { ax: 300, ay: 132, ex: 340, ey: 100, sx: 520 },
		Wire: FlowsWire,
	},
	{
		id: "disk",
		name: "disk",
		sub: "Plain files in your repo",
		x: 852,
		y: 136,
		w: 196,
		h: 212,
		anno: { ax: 940, ay: 348, ex: 978, ey: 384, sx: 1158 },
		Wire: DiskWire,
	},
	{
		id: "frames",
		name: "frames",
		sub: "The code and what it renders",
		x: 124,
		y: 656,
		w: 276,
		h: 154,
		anno: { ax: 200, ay: 810, ex: 238, ey: 846, sx: 418 },
		Wire: FramesWire,
	},
	{
		id: "states",
		name: "states",
		sub: "One screen, seeded three ways",
		x: 820,
		y: 640,
		w: 264,
		h: 164,
		anno: { ax: 900, ay: 804, ex: 938, ey: 840, sx: 1118 },
		Wire: StatesWire,
	},
];

const ALL_FRAMES: readonly FrameSpec[] = [LANDING, ...SECTIONS];

/** every site frame is a 1440x900 page; the ring's chip says so. */
const PAGE_SIZE = "1440 × 900";

/* ---------- the earlier takes, parked outside the resting viewport ---------- */

interface GhostSpec {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** pull-back progress at which this one has fully arrived */
	at: number;
}

const GHOSTS: readonly GhostSpec[] = [
	{ name: "landing--quiet", x: -106, y: 126, w: 122, h: 78, at: 0.5 },
	{ name: "landing--terminal", x: -96, y: 452, w: 118, h: 74, at: 0.58 },
	{ name: "landing--editorial", x: 1096, y: 372, w: 124, h: 78, at: 0.54 },
	{ name: "landing--kinetic", x: 1108, y: 690, w: 116, h: 74, at: 0.62 },
	{ name: "landing--specimen", x: 452, y: 934, w: 152, h: 96, at: 0.66 },
];

/* ---------- the four section wireframes ---------- */

function FlowArrowMini({ x, w, y, pulse }: { x: number; w: number; y: number; pulse: boolean }) {
	return (
		<div className="absolute" style={{ left: x, top: y, width: w, height: 1 }}>
			<div className="absolute inset-0 bg-thread/55" />
			<span className="-right-px -top-[3px] absolute block h-[7px] w-[7px] rotate-45 border-thread/75 border-t border-r" />
			{pulse ? (
				<motion.span
					className="-top-[2px] absolute left-0 block h-[5px] w-[5px] rounded-full bg-thread"
					style={{ boxShadow: "0 0 6px 1px color-mix(in srgb, var(--color-thread) 60%, transparent)" }}
					animate={{ x: [0, w - 3], opacity: [0, 1, 1, 0] }}
					transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.9 }}
				/>
			) : null}
		</div>
	);
}

/** flows: three screens, one thread through them, a player pill under the strip. */
function FlowsWire() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="relative h-full w-full" style={dotGridMini}>
			{[30, 123, 216].map((lx, i) => (
				<div
					key={lx}
					className="absolute overflow-hidden rounded-[3px] border border-border bg-canvas"
					style={{ left: lx, top: 14, width: 46, height: 68 }}
				>
					<div className="space-y-[4px] p-1.5">
						<div className="h-[7px] w-[70%] rounded-[1px] bg-raised" />
						<Bar w="82%" />
						<Bar w="56%" />
						{i === 2 ? (
							<span className="mx-auto mt-[7px] block h-2.5 w-2.5 rounded-full bg-thread/80" />
						) : (
							<div className="mt-[7px] h-2.5 w-full rounded-[1px] bg-thread/70" />
						)}
					</div>
				</div>
			))}
			<FlowArrowMini x={76} w={47} y={48} pulse={!reduce} />
			<FlowArrowMini x={169} w={47} y={48} pulse={false} />
			<div
				className="-translate-x-1/2 absolute left-1/2 flex items-center gap-2 rounded-full border border-border-raised bg-bg/80 px-2.5 py-1.5"
				style={{ top: 96, width: 140 }}
			>
				<motion.span
					className="text-thread"
					animate={reduce ? undefined : { opacity: [0.5, 1, 0.5] }}
					transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
				>
					<PlayTri className="h-2 w-2" />
				</motion.span>
				<div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border-raised">
					<div className="h-full w-1/3 rounded-full bg-thread" />
				</div>
				<div className="flex items-center gap-1">
					{[0, 1, 2].map((s) => (
						<span key={s} className={cn("h-1 w-1 rounded-full", s === 0 ? "bg-thread" : "bg-border-raised")} />
					))}
				</div>
			</div>
		</div>
	);
}

/** frames: honest source on the left, the thing it renders on the right. */
function FramesWire() {
	const reduce = useReducedMotion() === true;
	const lines = ["66%", "42%", "78%", "54%", "70%", "38%", "62%", "48%"];
	return (
		<div className="flex h-full w-full overflow-hidden">
			<div className="relative flex h-full w-[45%] shrink-0 flex-col border-border border-r bg-canvas">
				<div className="flex items-center gap-1.5 border-border border-b px-2.5 py-2">
					<span className="h-1.5 w-1.5 rounded-full bg-thread" />
					<div className="h-1.5 w-10 rounded-[1px] bg-raised" />
				</div>
				<div className="space-y-[7px] p-2.5">
					{lines.map((w, i) => (
						<div key={w + String(i)} className="flex items-center gap-1.5">
							<span className="h-[3px] w-1.5 rounded-full bg-border-raised/70" />
							<div className="h-[3px] rounded-full bg-border-raised" style={{ width: w }} />
							{i === lines.length - 1 ? (
								<motion.span
									className="ml-0.5 block h-3 w-[2px] bg-thread"
									animate={reduce ? undefined : { opacity: [1, 0.15] }}
									transition={{ duration: 0.72, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
								/>
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
					<div className="space-y-1.5 py-0.5">
						<Bar w={62} />
						<Bar w={46} />
						<Bar w={54} />
					</div>
				</div>
				<div className="mt-4 flex items-center gap-1.5">
					<span className="h-4 w-[52px] rounded-[3px] bg-thread/75" />
					<span className="h-4 w-[38px] rounded-[3px] border border-border-raised" />
				</div>
			</div>
		</div>
	);
}

/** states: one screen, three seeds. the picker cycles so the point makes itself. */
const SEEDS = ["full", "empty", "failing"] as const;

function StatesWire() {
	const reduce = useReducedMotion() === true;
	const [seed, setSeed] = useState(0);

	useEffect(() => {
		if (reduce) return;
		const id = window.setInterval(() => {
			setSeed((s) => (s + 1) % SEEDS.length);
		}, 2400);
		return () => window.clearInterval(id);
	}, [reduce]);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="flex items-center justify-between border-border border-b px-3 py-1.5 font-mono text-[9px] text-muted">
				<span>scenario</span>
				<span className="opacity-60">no backend</span>
			</div>
			<div className="relative flex-1">
				{SEEDS.map((label, i) => {
					const left = 14 + i * 84;
					const live = seed === i;
					return (
						<div key={label} className="absolute" style={{ left, top: 14 }}>
							<div
								className={cn(
									"overflow-hidden rounded-[3px] border bg-canvas transition-colors duration-300",
									live ? "border-thread/55" : "border-border",
								)}
								style={{ width: 68, height: 88 }}
							>
								<div className="border-border border-b px-1.5 py-1.5">
									<div className="h-[6px] w-[62%] rounded-[1px] bg-raised" />
								</div>
								<div className="space-y-[5px] p-1.5">
									{i === 0 ? (
										<>
											<Bar w="88%" />
											<Bar w="70%" />
											<Bar w="80%" />
											<span className="mt-[7px] block h-2.5 w-full rounded-[1px] bg-thread/70" />
										</>
									) : null}
									{i === 1 ? (
										<div className="flex h-[46px] flex-col items-center justify-center gap-1.5">
											<span className="block h-px w-5 rounded-full bg-border-raised" />
											<span className="block h-px w-3 rounded-full bg-border-raised/60" />
										</div>
									) : null}
									{i === 2 ? (
										<>
											<div className="border-thread/70 border-l-2 bg-thread/10 py-[5px] pl-1.5">
												<Bar w="70%" className="bg-thread/60" />
											</div>
											<Bar w="52%" />
											<Bar w="64%" />
										</>
									) : null}
								</div>
							</div>
							<div
								className={cn(
									"mt-2 text-center font-mono text-[9px] leading-none transition-colors duration-300",
									live ? "text-thread" : "text-muted/60",
								)}
							>
								{label}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

/** disk: the site's own folder, which is where this whole page lives. */
interface DiskRow {
	depth: number;
	kind: "dir" | "frame";
	name: string;
	open?: boolean;
	active?: boolean;
}

const DISK_ROWS: readonly DiskRow[] = [
	{ depth: 0, kind: "dir", name: "design", open: true },
	{ depth: 1, kind: "dir", name: "frames", open: true },
	{ depth: 2, kind: "frame", name: "landing", active: true },
	{ depth: 2, kind: "frame", name: "frames" },
	{ depth: 2, kind: "frame", name: "flows" },
	{ depth: 2, kind: "frame", name: "states" },
	{ depth: 2, kind: "frame", name: "disk" },
	{ depth: 1, kind: "dir", name: "shared" },
];

function DiskWire() {
	return (
		<div className="relative h-full w-full overflow-hidden py-2">
			<span className="absolute w-px bg-border-raised" style={{ left: 26, top: 56, height: 108 }} />
			{DISK_ROWS.map((r) => (
				<div
					key={r.depth + r.kind + r.name}
					className={cn("relative flex h-[24px] items-center gap-1.5 pr-2", r.active === true && "bg-raised")}
					style={{ paddingLeft: 10 + r.depth * 14 }}
				>
					<span
						className={cn(
							"w-2 shrink-0 text-center text-[7px] leading-none",
							r.active === true ? "text-thread" : "text-muted/70",
						)}
					>
						{r.kind === "dir" ? (r.open === true ? "▾" : "▸") : "▸"}
					</span>
					{r.kind === "frame" ? (
						<FrameGlyph className={cn("h-3 w-3 shrink-0", r.active === true ? "text-thread" : "text-muted")} />
					) : (
						<FolderGlyph className="h-3 w-3 shrink-0 text-muted" />
					)}
					<span
						className={cn(
							"min-w-0 flex-1 truncate font-mono text-[10px] leading-none",
							r.active === true ? "text-thread" : "text-muted",
						)}
					>
						{r.name}
						{r.kind === "dir" ? "/" : ""}
					</span>
				</div>
			))}
		</div>
	);
}

/* ---------- the docked landing, live at 0.31 ---------- */

function LandingBody() {
	const reduce = useReducedMotion() === true;
	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="absolute inset-y-0 left-[200px] w-px" style={liveSpine}>
				{reduce ? null : (
					<motion.span
						className="-translate-x-1/2 absolute left-1/2 block h-24 w-[7px] rounded-full"
						style={{
							top: 0,
							background: "linear-gradient(to bottom, transparent, var(--color-thread), transparent)",
						}}
						animate={{ y: [-140, 980] }}
						transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
					/>
				)}
			</div>

			<div className="relative flex h-full flex-col pr-[112px] pl-[320px]">
				<header className="flex shrink-0 items-center justify-between py-9">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-5 w-5 text-thread" title="spool" />
						<span className="font-semibold text-md tracking-tight">spool</span>
					</div>
					<div className="flex items-center gap-6 font-mono text-muted text-xs">
						<span>spool.page</span>
						<span className="text-text">github.com/liamvinberg/spool</span>
					</div>
				</header>

				<main className="flex flex-1 flex-col justify-center">
					<section className="relative grid grid-cols-[1fr_auto] items-center gap-12">
						<div className="max-w-[560px]">
							<h1 className="font-semibold text-[66px] leading-[0.98] tracking-[-0.02em]">
								Feel an app
								<br />
								before it exists
							</h1>
							<p className="mt-6 max-w-[452px] text-[17px] text-muted leading-[26px]">
								spool is a prototyping canvas for real code. Your agent writes TSX frames into your repo, you arrange them, and you click through the flow the way a user would.
							</p>

							<div className="mt-9">
								<div className="flex gap-5">
									<span className="w-px shrink-0 self-stretch bg-thread/70" />
									<div className="w-[430px] font-mono text-[15px] leading-[30px]">
										<div>
											<span className="text-muted">~ $ </span>npm i -g spool.page
										</div>
										<div>
											<span className="text-muted">~/your-app $ </span>spool init
										</div>
										<div>
											<span className="text-muted">~/your-app $ </span>spool serve
										</div>
									</div>
								</div>
								<div className="mt-5 pl-[25px] font-mono text-muted text-xs">
									Requires Node 22+ · best in Chrome · macOS-first today
								</div>
							</div>
						</div>

						<motion.div
							className="relative w-[236px] shrink-0"
							animate={reduce ? undefined : { y: [0, -14, 0] }}
							transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
						>
							<SpoolMark className="w-full text-thread" title="spool ribbon" />
						</motion.div>
					</section>
				</main>

				<footer className="flex shrink-0 items-center justify-between border-border border-t py-7">
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-4 w-4 text-thread" />
						<span className="text-muted text-sm">spool.page</span>
					</div>
					<span className="font-mono text-muted text-xs">github.com/liamvinberg/spool</span>
				</footer>
			</div>
		</div>
	);
}

/**
 * The landing rendered at true 1440x900 and scaled down into its rect, so what
 * is docked on the canvas is the page itself, not a picture of it. Nothing
 * inside takes the pointer: on a canvas a click selects, and going inside is
 * the gesture the annotation teaches.
 */
function LandingLive({ w, h }: { w: number; h: number }) {
	return (
		<div className="h-full w-full overflow-hidden bg-bg" style={{ width: w, height: h }}>
			<div
				className="pointer-events-none select-none"
				style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${w / FRAME_W})`, transformOrigin: "top left" }}
			>
				<LandingBody />
			</div>
		</div>
	);
}

/* ---------- the coaching layer ---------- */

/**
 * One annotation: a thread anchor on the thing, a hairline leader with a single
 * bend, a shelf, and a mono label sitting on the shelf. It draws from the anchor
 * outward and retracts the same way, label first. Nothing about it can be
 * clicked, and there is no way to close it other than doing what it says.
 */
function Annotation({
	w,
	h,
	ax,
	ay,
	ex,
	ey,
	sx,
	verb,
	rest,
}: {
	w: number;
	h: number;
	ax: number;
	ay: number;
	ex: number;
	ey: number;
	sx: number;
	verb?: string;
	rest: string;
}) {
	const reduce = useReducedMotion() === true;
	// half-pixel offsets keep a 1px stroke on one device pixel
	const d = `M ${ax + 0.5} ${ay + 0.5} L ${ex + 0.5} ${ey + 0.5} L ${sx + 0.5} ${ey + 0.5}`;
	return (
		<div className="pointer-events-none absolute top-0 left-0" style={{ width: w, height: h }}>
			<svg
				width={w}
				height={h}
				viewBox={`0 0 ${w} ${h}`}
				fill="none"
				aria-hidden="true"
				className="absolute top-0 left-0 overflow-visible"
			>
				<motion.path
					d={d}
					stroke="color-mix(in srgb, var(--color-text) 26%, transparent)"
					strokeWidth={1}
					strokeLinecap="round"
					strokeLinejoin="round"
					initial={reduce ? { opacity: 0 } : { pathLength: 0 }}
					animate={reduce ? { opacity: 1 } : { pathLength: 1 }}
					exit={reduce ? { opacity: 0 } : { pathLength: 0 }}
					transition={reduce ? { duration: 0.2 } : { duration: 0.42, ease: EASE }}
				/>
				<motion.circle
					cx={ax + 0.5}
					cy={ay + 0.5}
					r={2.5}
					fill="var(--color-thread)"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, transition: { duration: 0.16, delay: 0.16 } }}
					transition={{ duration: 0.22 }}
				/>
			</svg>
			<motion.div
				className="absolute whitespace-nowrap font-mono text-xs leading-4"
				style={{ left: ex + 6, top: ey - 19 }}
				initial={{ opacity: 0, x: -6 }}
				animate={{ opacity: 1, x: 0 }}
				exit={{ opacity: 0, x: -4, transition: { duration: 0.14 } }}
				transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : 0.28 }}
			>
				{verb === undefined ? null : <span className="text-text">{verb}</span>}
				<span className="text-muted">{rest}</span>
			</motion.div>
		</div>
	);
}

/**
 * The general note, drawing convention: no leader, set in the margin, rule
 * above. It arrives with the earlier takes and retires by itself once it has
 * had long enough to be read, because a reward is not an instruction.
 */
function MarginNote({ shown, text }: { shown: boolean; text: string }) {
	return (
		<AnimatePresence>
			{shown ? (
				<motion.div
					className="pointer-events-none absolute"
					style={{ left: RAIL_W + 20, top: 848 }}
					initial={{ opacity: 0, y: 5 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, transition: { duration: 0.5, ease: "easeInOut" } }}
					transition={{ duration: 0.45, ease: EASE }}
				>
					<span className="mb-2 block h-px w-7 bg-border-raised" />
					<span className="block whitespace-nowrap font-mono text-muted text-xs leading-4">{text}</span>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

/* ---------- selection chrome: the ring is wherever the selection is ---------- */

function SelectionChrome({ rect }: { rect: { x: number; y: number; w: number; h: number } }) {
	const corner = "absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";
	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 z-30"
			initial={false}
			animate={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h }}
			transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.9 }}
		>
			<div className="-inset-[3px] absolute rounded-[9px] border-[1.5px] border-thread" />
			<span className={cn(corner, "-left-[7px] -top-[7px]")} />
			<span className={cn(corner, "-right-[7px] -top-[7px]")} />
			<span className={cn(corner, "-left-[7px] -bottom-[7px]")} />
			<span className={cn(corner, "-right-[7px] -bottom-[7px]")} />
			<div className="-bottom-[9px] -translate-x-1/2 absolute left-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-none">
				{PAGE_SIZE}
			</div>
		</motion.div>
	);
}

/* ---------- the frames on the canvas ---------- */

function FrameTile({
	spec,
	selected,
	onSelect,
	onOpen,
	onFirstHover,
}: {
	spec: FrameSpec;
	selected: boolean;
	onSelect: (id: string) => void;
	onOpen: (spec: FrameSpec) => void;
	onFirstHover: (id: string) => void;
}) {
	const isLanding = spec.id === LANDING.id;
	return (
		<div className="group absolute" style={{ left: spec.x, top: spec.y - 30, width: spec.w }}>
			<div className="mb-1 h-[26px] select-none pl-0.5">
				<div className="flex items-center gap-1.5 font-mono text-xs leading-none">
					<span
						className={cn(
							"text-[8px] transition-colors duration-200",
							selected ? "text-thread" : "text-muted/70 group-hover:text-thread",
						)}
					>
						{selected ? "▶" : "▸"}
					</span>
					<span
						className={cn(
							"transition-colors duration-200",
							selected ? "text-thread" : "text-muted group-hover:text-thread",
						)}
					>
						{spec.name}
					</span>
				</div>
				<div className="mt-1 pl-[15px] font-mono text-2xs text-muted/70 leading-none">{spec.sub}</div>
			</div>

			<motion.div
				role="link"
				tabIndex={0}
				aria-label={`${spec.name}, double-click to go inside`}
				className="relative block cursor-pointer text-left focus-visible:outline-none"
				style={{ width: spec.w, height: spec.h }}
				whileHover={{ scale: 1.012 }}
				transition={{ type: "spring", stiffness: 300, damping: 24 }}
				onPointerEnter={() => onFirstHover(spec.id)}
				onFocus={() => onFirstHover(spec.id)}
				onClick={(e) => {
					e.stopPropagation();
					onSelect(spec.id);
				}}
				onDoubleClick={(e) => {
					e.stopPropagation();
					onOpen(spec);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						onOpen(spec);
					}
				}}
			>
				<div className="absolute inset-0 overflow-hidden rounded-[6px] border border-border-raised bg-surface">
					{isLanding ? <LandingLive w={spec.w} h={spec.h} /> : spec.Wire ? <spec.Wire /> : null}
				</div>
				{selected ? null : (
					<div className="-inset-px pointer-events-none absolute rounded-[7px] border border-thread/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
				)}
			</motion.div>
		</div>
	);
}

function Ghost({ spec, pull }: { spec: GhostSpec; pull: MotionValue<number> }) {
	const opacity = useTransform(pull, [spec.at - 0.36, spec.at], [0, 1]);
	return (
		<motion.div className="absolute" style={{ left: spec.x, top: spec.y - 16, width: spec.w, opacity }}>
			<div className="mb-1 truncate font-mono text-[9px] text-muted/45 leading-none">▸ {spec.name}</div>
			<div
				className="overflow-hidden rounded-[5px] border border-border bg-surface/50 p-2"
				style={{ width: spec.w, height: spec.h }}
			>
				<div className="h-2 w-[62%] rounded-[1px] bg-raised/70" />
				<div className="mt-2 space-y-1.5">
					<Bar w="84%" className="bg-border-raised/70" />
					<Bar w="58%" className="bg-border-raised/70" />
				</div>
				<div className="mt-2.5 h-2 w-[38%] rounded-[1px] bg-thread/25" />
			</div>
		</motion.div>
	);
}

/* ---------- the left rail: the site's pages, spool's own shape ---------- */

interface PageRow {
	name: string;
	count: number;
	open: boolean;
	frames: readonly string[];
}

/** reading order, not canvas order: the site as a table of contents. */
const PAGES: readonly PageRow[] = [
	{
		name: "spool.page",
		count: 5,
		open: true,
		frames: ["landing", "frames", "flows", "states", "disk"],
	},
	{ name: "drafts", count: 25, open: false, frames: [] },
];

function Rail({
	selected,
	onSelect,
	onOpen,
	onDwell,
}: {
	selected: string | null;
	onSelect: (id: string) => void;
	onOpen: (spec: FrameSpec) => void;
	onDwell: () => void;
}) {
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	// a dwell, not a brush: a pointer crossing the rail on its way somewhere else
	// has not read it, and should not cost the visitor the annotation.
	function handleEnter() {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(onDwell, 450);
	}
	function handleLeave() {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = null;
	}

	return (
		<aside
			aria-label="Pages"
			className="flex shrink-0 flex-col border-border border-r bg-bg"
			style={{ width: RAIL_W }}
			onPointerEnter={handleEnter}
			onPointerLeave={handleLeave}
		>
			<div className="flex h-11 shrink-0 items-center gap-2.5 border-border border-b pl-3.5">
				<SpoolMark className="h-4 w-4 text-thread" title="spool" />
				<span className="font-semibold text-base leading-base tracking-tight">spool</span>
			</div>

			<div className="flex h-11 shrink-0 items-baseline gap-2 border-border border-b pl-3.5">
				<h2 className="self-center font-semibold text-base leading-base">Pages</h2>
				<span className="self-center font-mono text-muted text-xs leading-xs">{PAGES.length}</span>
			</div>

			<div className="min-h-0 flex-1 overflow-hidden py-2">
				{PAGES.map((page) => (
					<div key={page.name}>
						<div className={cn("relative flex h-8 items-center pr-2", page.open && "bg-surface")}>
							{page.open ? <span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
							<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
								<Caret open={page.open} className="h-2.5 w-2.5" />
							</span>
							<span className="flex h-8 min-w-0 flex-1 items-center gap-2">
								<FolderGlyph className={cn("h-3.5 w-3.5 shrink-0", page.open ? "text-thread" : "text-muted")} />
								<span
									className={cn(
										"min-w-0 flex-1 truncate font-mono text-sm leading-sm",
										page.open ? "text-text" : "text-muted",
									)}
								>
									{page.name}
								</span>
							</span>
							<span className="font-mono text-2xs text-muted/60 leading-3">{page.count}</span>
						</div>

						{page.open ? (
							<div className="relative pb-0.5">
								<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
								{page.frames.map((frame) => {
									const spec = ALL_FRAMES.find((f) => f.name === frame);
									const active = spec !== undefined && spec.id === selected;
									return (
										<button
											key={frame}
											type="button"
											className={cn(
												"relative flex h-7 w-full cursor-pointer items-center text-left transition-colors duration-150 focus-visible:outline-none",
												active ? "bg-surface" : "hover:bg-surface/50",
											)}
											onClick={() => {
												if (spec) onSelect(spec.id);
											}}
											onDoubleClick={() => {
												if (spec) onOpen(spec);
											}}
										>
											<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
											<span
												className={cn(
													"truncate pl-[34px] font-mono text-sm leading-sm transition-colors duration-150",
													active ? "text-thread" : "text-muted",
												)}
											>
												{frame}
											</span>
										</button>
									);
								})}
							</div>
						) : null}
					</div>
				))}
			</div>

			<div className="shrink-0 border-border border-t px-3.5 py-3">
				<span className="block truncate font-mono text-2xs text-muted/70 leading-3">github.com/liamvinberg/spool</span>
			</div>
		</aside>
	);
}

/* ---------- the zoom readout: feedback for the gesture, and spool's own chrome ---------- */

function ZoomReadout({ pull }: { pull: MotionValue<number> }) {
	const [pct, setPct] = useState(100);
	useEffect(() => {
		const next = (v: number) => {
			const rounded = Math.round((1 - (1 - MIN_ZOOM) * v) * 100);
			setPct((prev) => (prev === rounded ? prev : rounded));
		};
		next(pull.get());
		return pull.on("change", next);
	}, [pull]);
	return (
		<div className="pointer-events-none absolute right-5 bottom-5 font-mono text-muted/70 text-xs leading-4 tabular-nums">
			{pct}%
		</div>
	);
}

/* ---------- orchestrator ---------- */

type Lesson = "rail" | "open" | "pullback";

export default function SiteHubTutorial() {
	const canvasRef = useRef<HTMLDivElement>(null);

	const [selected, setSelected] = useState<string | null>(LANDING.id);
	// the frame the "go inside" leader hangs off: the first one pointed at, and
	// it stays put after that so the label never chases the cursor.
	const [openAnchor, setOpenAnchor] = useState<string | null>(null);
	const [noteShown, setNoteShown] = useState(false);
	const noteFired = useRef(false);

	// a lesson performed is a lesson gone for good; the session carries it across
	// walks, so coming back from a section only ever shows what is still unlearned.
	const [done, setDone] = useState<Record<Lesson, boolean>>(() => ({
		rail: ui.state.taughtRail === true,
		open: ui.state.taughtOpen === true,
		pullback: ui.state.taughtPullback === true,
	}));

	const learn = useCallback((lesson: Lesson) => {
		setDone((prev) => (prev[lesson] ? prev : { ...prev, [lesson]: true }));
		if (lesson === "rail") ui.state.taughtRail = true;
		if (lesson === "open") ui.state.taughtOpen = true;
		if (lesson === "pullback") ui.state.taughtPullback = true;
	}, []);

	const pull = useMotionValue(0);
	const sp = useSpring(pull, { stiffness: 120, damping: 26, mass: 0.9 });
	const sceneScale = useTransform(sp, (v) => 1 - (1 - MIN_ZOOM) * v);

	// wheel is the pull-back. nothing scrolls in this frame, so the wheel is free
	// to be the camera, which is what it is on a real canvas.
	useEffect(() => {
		const el = canvasRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (Math.abs(e.deltaY) < 0.5) return;
			const next = Math.min(1, Math.max(0, pull.get() + e.deltaY / 900));
			pull.set(next);
			if (e.deltaY > 0) learn("pullback");
		};
		el.addEventListener("wheel", onWheel, { passive: true });
		return () => el.removeEventListener("wheel", onWheel);
	}, [pull, learn]);

	// the takes come into view, the note names them, and then the note retires on
	// its own. it is a payoff, not an instruction, so it does not wait to be obeyed.
	useEffect(() => {
		let hide = 0;
		const unsub = sp.on("change", (v) => {
			if (v > 0.5 && !noteFired.current) {
				noteFired.current = true;
				setNoteShown(true);
				hide = window.setTimeout(() => setNoteShown(false), 5200);
			}
		});
		return () => {
			unsub();
			if (hide !== 0) window.clearTimeout(hide);
		};
	}, [sp]);

	// literal targets, one branch each, so the flow map draws the five edges this
	// canvas actually offers instead of reporting an unreadable destination.
	// site-states is the honest gap: the section exists on the site, its frame is
	// not authored yet, and the map should say so rather than point somewhere else.
	const openFrame = useCallback(
		(spec: FrameSpec) => {
			learn("open");
			setSelected(spec.id);
			if (spec.id === "landing") ui.go("site-hub");
			else if (spec.id === "frames") ui.go("site-frames");
			else if (spec.id === "flows") ui.go("site-flows");
			else if (spec.id === "states") ui.go("site-states");
			else if (spec.id === "disk") ui.go("site-disk");
		},
		[learn],
	);

	const handleFirstHover = useCallback(
		(id: string) => {
			setOpenAnchor((prev) => (prev === null ? id : prev));
		},
		[],
	);

	const selectedSpec = ALL_FRAMES.find((f) => f.id === selected);
	const anchorSpec = ALL_FRAMES.find((f) => f.id === openAnchor);

	return (
		<div className="flex h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<Rail
				selected={selected}
				onSelect={setSelected}
				onOpen={openFrame}
				onDwell={() => learn("rail")}
			/>

			<div
				ref={canvasRef}
				className="relative min-w-0 flex-1 overflow-hidden bg-canvas"
				onClick={() => setSelected(null)}
			>
				{/* the scene: everything that belongs to the canvas scales with the camera */}
				<motion.div
					className="absolute top-0 left-0 origin-center"
					style={{ width: SCENE_W, height: SCENE_H, scale: sceneScale }}
				>
					<div className="absolute inset-[-560px]" style={dotGrid} />

					{GHOSTS.map((g) => (
						<Ghost key={g.name} spec={g} pull={sp} />
					))}

					{ALL_FRAMES.map((spec) => (
						<FrameTile
							key={spec.id}
							spec={spec}
							selected={selected === spec.id}
							onSelect={setSelected}
							onOpen={openFrame}
							onFirstHover={handleFirstHover}
						/>
					))}

					{selectedSpec === undefined ? null : (
						<SelectionChrome
							rect={{ x: selectedSpec.x, y: selectedSpec.y, w: selectedSpec.w, h: selectedSpec.h }}
						/>
					)}

					{/* annotations that point at things on the drawing live on the drawing.
					    this one has no place to be until the visitor points at a frame, so
					    it does not exist until then, and then it hangs off that frame. */}
					<AnimatePresence>
						{!done.open && anchorSpec !== undefined ? (
							<Annotation
								key="open"
								w={SCENE_W}
								h={SCENE_H}
								ax={anchorSpec.anno.ax}
								ay={anchorSpec.anno.ay}
								ex={anchorSpec.anno.ex}
								ey={anchorSpec.anno.ey}
								sx={anchorSpec.anno.sx}
								verb="Double-click"
								rest=" to go inside"
							/>
						) : null}
					</AnimatePresence>

					<AnimatePresence initial={false}>
						{done.pullback ? null : (
							<Annotation
								key="pullback"
								w={SCENE_W}
								h={SCENE_H}
								ax={569}
								ay={659}
								ex={607}
								ey={695}
								sx={737}
								verb="Scroll"
								rest=" to pull back"
							/>
						)}
					</AnimatePresence>
				</motion.div>

				<ZoomReadout pull={sp} />
			</div>

			{/* the rail annotation touches chrome, so it is drawn in chrome space and
			    never scales with the camera */}
			<div className="pointer-events-none absolute top-0 left-0" style={{ width: FRAME_W, height: FRAME_H }}>
				<AnimatePresence initial={false}>
					{done.rail ? null : (
						<Annotation
							key="rail"
							w={FRAME_W}
							h={FRAME_H}
							ax={RAIL_W}
							ay={250}
							ex={318}
							ey={320}
							sx={514}
							rest="Rail or canvas, same frames"
						/>
					)}
				</AnimatePresence>

				<MarginNote shown={noteShown} text="25 earlier takes, still here" />
			</div>
		</div>
	);
}
