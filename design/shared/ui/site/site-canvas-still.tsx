import { animate, type MotionValue, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * The revealed canvas, as a phone can have it.
 *
 * A phone cannot walk the hub's scroll arc, so the mobile landing shows the
 * canvas instead of describing it. Three things this got wrong the first time
 * and now does not:
 *
 * 1. The frames on it are site-hub--composed's own section wires, lifted whole,
 *    not grey placeholder pills. They were composed to be read at a section's
 *    real size and they carry the thread accent, so they read as an application
 *    rather than as a sketch of one.
 * 2. Fidelity is a question about scale, not about drawing. Fitting all of
 *    1440x900 into 314px puts the frames at 51px, where nothing survives no
 *    matter how faithfully it is drawn. So the still owns a camera: it crops
 *    into the composition and lets it run off the edges, which buys the scale
 *    back and is why the wires are legible at all.
 * 3. `reveal` plays the desktop's own moment once on load: the landing fills the
 *    box, the camera pulls back, the canvas resolves around it and the threads
 *    draw themselves in. That is what makes the resting pose readable — you
 *    watched those small rectangles be the page a second ago.
 *
 * Nothing here is a hit target, and every ambient loop stops under
 * prefers-reduced-motion.
 */

/* ---------- the fixed coordinate space, verbatim from the hub ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;
const RAIL_W = 248;
const BAR_H = 44;

/** the landing's docked rect, in stage coordinates: clear of the rail. */
const LIVE = { x: 580, y: 306, w: 440, h: 275 };

const EASE = [0.22, 1, 0.36, 1] as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rampAt = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));

const dotGridMini = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)",
	backgroundSize: "9px 9px",
};

/* ---------- the small parts the wires are built from ---------- */

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

/* ---------- the four sections, exactly as site-hub--composed draws them ---------- */

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
					transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", repeatDelay: 0.9 }}
				/>
			) : null}
		</div>
	);
}

/** flows: three screens, one thread through them, a player pill under the strip. */
function FlowsWire({ still }: { still: boolean }) {
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
			<FlowArrowMini x={76} w={47} y={48} pulse={!still} />
			<FlowArrowMini x={169} w={47} y={48} pulse={false} />
			<div
				className="-translate-x-1/2 absolute left-1/2 flex items-center gap-2 rounded-full border border-border-raised bg-bg/80 px-2.5 py-1.5"
				style={{ top: 96, width: 140 }}
			>
				<motion.span
					className="text-thread"
					animate={still ? {} : { opacity: [0.5, 1, 0.5] }}
					transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
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
function FramesWire({ still }: { still: boolean }) {
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
									animate={still ? {} : { opacity: [1, 0.15] }}
									transition={{
										duration: 0.72,
										repeat: Number.POSITIVE_INFINITY,
										repeatType: "reverse",
										ease: "easeInOut",
									}}
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

function StatesWire({ still }: { still: boolean }) {
	const [seed, setSeed] = useState(0);

	useEffect(() => {
		if (still) return;
		const id = window.setInterval(() => setSeed((s) => (s + 1) % SEEDS.length), 2400);
		return () => window.clearInterval(id);
	}, [still]);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="flex items-center justify-between border-border border-b px-3 py-1.5 font-mono text-[9px] text-muted">
				<span>scenario</span>
				<span className="opacity-60">no backend</span>
			</div>
			<div className="relative flex-1">
				{SEEDS.map((label, i) => {
					const isLive = seed === i;
					return (
						<div key={label} className="absolute" style={{ left: 14 + i * 84, top: 14 }}>
							<div
								className={cn(
									"overflow-hidden rounded-[3px] border bg-canvas transition-colors duration-300",
									isLive ? "border-thread/55" : "border-border",
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
									isLive ? "text-thread" : "text-muted/60",
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

/* ---------- where the four stand, and what links them ---------- */

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface SectionSpec extends Rect {
	id: string;
	Wire: (props: { still: boolean }) => React.ReactNode;
	/** reveal ramp start; the four arrive in reading order */
	at: number;
}

const SECTIONS: readonly SectionSpec[] = [
	{ id: "flows", x: 336, y: 120, w: 236, h: 148, Wire: FlowsWire, at: 0.42 },
	{ id: "disk", x: 1100, y: 136, w: 236, h: 148, Wire: DiskWire, at: 0.47 },
	{ id: "frames", x: 372, y: 656, w: 276, h: 172, Wire: FramesWire, at: 0.52 },
	{ id: "states", x: 1068, y: 640, w: 264, h: 165, Wire: StatesWire, at: 0.57 },
];

type Side = "n" | "s" | "e" | "w";

interface EdgeSpec {
	from: Rect;
	to: Rect;
	exit: Side;
	exitAt: number;
	entry: Side;
	entryAt: number;
}

const rectOf = (id: string): Rect => SECTIONS.find((s) => s.id === id) ?? LIVE;

const EDGES: readonly EdgeSpec[] = [
	{ from: LIVE, to: rectOf("flows"), exit: "w", exitAt: 0.2, entry: "s", entryAt: 0.45 },
	{ from: LIVE, to: rectOf("disk"), exit: "e", exitAt: 0.2, entry: "s", entryAt: 0.45 },
	{ from: LIVE, to: rectOf("frames"), exit: "s", exitAt: 0.1, entry: "e", entryAt: 0.25 },
	{ from: LIVE, to: rectOf("states"), exit: "s", exitAt: 0.9, entry: "w", entryAt: 0.25 },
];

const HEAD_LENGTH = 10;
const HEAD_HALF_WIDTH = 4.5;

function anchorPoint(box: Rect, side: Side, t: number) {
	if (side === "n") return { x: box.x + box.w * t, y: box.y };
	if (side === "s") return { x: box.x + box.w * t, y: box.y + box.h };
	if (side === "w") return { x: box.x, y: box.y + box.h * t };
	return { x: box.x + box.w, y: box.y + box.h * t };
}

/** flow-arrows.tsx's cubic: tangents leave perpendicular, bowing with distance. */
function drawEdge(spec: EdgeSpec, i: number) {
	const tail = anchorPoint(spec.from, spec.exit, spec.exitAt);
	const tip = anchorPoint(spec.to, spec.entry, spec.entryAt);
	const out = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } };
	const a = out[spec.exit];
	const b = out[spec.entry];
	const bow = Math.max(60, Math.hypot(tip.x - tail.x, tip.y - tail.y) * 0.42);
	const end = { x: tip.x + b.x * HEAD_LENGTH, y: tip.y + b.y * HEAD_LENGTH };
	const c1 = { x: tail.x + a.x * bow, y: tail.y + a.y * bow };
	const c2 = { x: end.x + b.x * bow, y: end.y + b.y * bow };
	const flank = { x: b.y, y: -b.x };
	return {
		key: `edge-${i}`,
		path: `M ${tail.x} ${tail.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
		head: `M ${tip.x} ${tip.y} L ${end.x + flank.x * HEAD_HALF_WIDTH} ${end.y + flank.y * HEAD_HALF_WIDTH} L ${end.x - flank.x * HEAD_HALF_WIDTH} ${end.y - flank.y * HEAD_HALF_WIDTH} Z`,
	};
}

const ARROWS = EDGES.map(drawEdge);

/**
 * The landing, docked.
 *
 * This one is drawn at the landing's real size and scaled into its rect, the way
 * the shipped site does it, rather than approximated at the rect's size. It
 * matters because this is the frame the ring closes around and the eye goes to
 * it first: every other frame on the canvas looked like an application and this
 * one looked like five grey bars in a box. Every number below is
 * LandingContent's own — the 200px spine, the 320/112 gutters, the 66px
 * headline, the 430px command column, the 236px ribbon.
 */
function LandingMini() {
	const k = LIVE.w / VIEW_W;
	return (
		<div className="absolute inset-0 overflow-hidden rounded-[7px] border border-border-raised bg-bg">
			<div
				className="absolute top-0 left-0 origin-top-left"
				style={{ width: VIEW_W, height: VIEW_H, transform: `scale(${k})` }}
			>
				<div className="absolute inset-y-0 left-[200px] w-px bg-thread/45" />
				<div className="flex h-full flex-col pr-[112px] pl-[320px]">
					<div className="flex shrink-0 items-center justify-between py-9">
						<div className="flex items-center gap-2.5">
							<span className="block h-5 w-5 rounded-[3px] bg-thread/80" />
							<span className="block h-[13px] w-[52px] rounded-[2px] bg-raised" />
						</div>
						<div className="flex items-center gap-6">
							<span className="block h-[9px] w-[62px] rounded-[2px] bg-surface" />
							<span className="block h-[9px] w-[124px] rounded-[2px] bg-raised" />
						</div>
					</div>

					<div className="flex flex-1 flex-col justify-center">
						<div className="flex items-center justify-between gap-12">
							<div className="w-[560px] shrink-0">
								<span className="block h-[58px] w-[402px] rounded-[3px] bg-raised" />
								<span className="mt-[7px] block h-[58px] w-[520px] rounded-[3px] bg-raised" />
								<div className="mt-6 space-y-[9px]">
									<Bar w={452} className="h-[9px]" />
									<Bar w={430} className="h-[9px]" />
									<Bar w={286} className="h-[9px]" />
								</div>
								<div className="mt-9 flex gap-5">
									<span className="w-px shrink-0 self-stretch bg-thread/70" />
									<div className="w-[430px] space-y-[13px] py-[6px]">
										<Bar w={232} className="h-[11px] bg-raised" />
										<Bar w={186} className="h-[11px] bg-raised" />
										<Bar w={204} className="h-[11px] bg-raised" />
									</div>
								</div>
								<Bar w={300} className="mt-5 ml-[25px] h-[8px]" />
							</div>
							{/* the ribbon, which is the real mark and not a stand-in: it is the
							    one shape on the landing that is not a rectangle, and the eye
							    finds it before it finds anything else on the canvas */}
							<SpoolMark className="w-[236px] shrink-0 text-thread" />
						</div>
					</div>

					<div className="flex shrink-0 items-center justify-between border-border border-t py-7">
						<span className="block h-[11px] w-[96px] rounded-[2px] bg-surface" />
						<span className="block h-[9px] w-[150px] rounded-[2px] bg-surface" />
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---------- the camera ---------- */

interface Cam {
	k: number;
	x: number;
	y: number;
}

/** the camera that puts `rect` dead centre of the box at scale `k`. */
function centreOn(rect: Rect, k: number, boxW: number, boxH: number): Cam {
	return {
		k,
		x: boxW / 2 - k * (rect.x + rect.w / 2),
		y: boxH / 2 - k * (rect.y + rect.h / 2),
	};
}

export interface SiteCanvasStillProps {
	/** the visible window, in CSS px. The composition runs off it on purpose. */
	boxW: number;
	boxH: number;
	/**
	 * Stage scale at rest. `boxW / 1440` fits the whole composition exactly;
	 * anything above that crops into it and buys back the scale the frames need
	 * to be legible.
	 */
	zoom: number;
	/**
	 * What the resting camera centres on. "stage" is the whole application, rail
	 * and bar included, and wants a contained box — bled to a page edge, the
	 * rail's background is the page's background and its rows read as debris in
	 * the margin rather than as a sidebar. "field" drops the chrome and centres
	 * the canvas, which is what a full-bleed band wants.
	 */
	focus?: "stage" | "field";
	/** play the desktop's pull-back once on load instead of booting at rest. */
	reveal?: boolean;
}

export function SiteCanvasStill({ boxW, boxH, zoom, focus = "stage", reveal = false }: SiteCanvasStillProps) {
	const reduce = useReducedMotion() === true;
	// reduced motion gets the resting pose and no loops: the page still makes its
	// point, it just makes it in one frame.
	const plays = reveal && !reduce;

	const rest = centreOn(
		focus === "field" ? { x: RAIL_W, y: 0, w: VIEW_W - RAIL_W, h: VIEW_H } : { x: 0, y: 0, w: VIEW_W, h: VIEW_H },
		zoom,
		boxW,
		boxH,
	);
	// The landing, overfilling the box: where the arc starts, because on the
	// desktop the landing is not a frame yet, it is the whole page. Cover alone is
	// not enough — at exactly cover the frame's own border and rounded corners sit
	// on the box edge and give away that it is already a frame, which is the one
	// thing the first beat must not say. The margin pushes them out of shot.
	const k0 = Math.max(boxW / LIVE.w, boxH / LIVE.h) * 1.18;
	const start = centreOn(LIVE, k0, boxW, boxH);

	const p = useMotionValue(plays ? 0 : 1);
	useEffect(() => {
		if (!plays) return;
		const controls = animate(p, 1, { duration: 2.4, delay: 0.5, ease: EASE });
		return () => controls.stop();
	}, [p, plays]);

	const camK = useTransform(p, (v) => lerp(start.k, rest.k, v));
	const camX = useTransform(p, (v) => lerp(start.x, rest.x, v));
	const camY = useTransform(p, (v) => lerp(start.y, rest.y, v));
	const gridOpacity = useTransform(p, (v) => clamp01(v / 0.25));
	const ringOpacity = useTransform(p, (v) => rampAt(v, 0.2, 0.55));
	const threadLength = useTransform(p, (v) => rampAt(v, 0.5, 0.92));
	const headOpacity = useTransform(p, (v) => rampAt(v, 0.86, 1));
	// the grid pitch has to be read off the resting camera, not the live one: a
	// grid that scales with a 3x zoom-out swims, and the eye reads the swim as the
	// page moving rather than the camera pulling back.
	const gridPitch = Math.max(9, 30 * zoom);

	return (
		<div
			aria-hidden="true"
			className="relative select-none overflow-hidden bg-canvas"
			style={{ width: boxW, height: boxH }}
		>
			<motion.div
				className="absolute inset-0"
				style={{ ...dotGridMini, backgroundSize: `${gridPitch}px ${gridPitch}px`, opacity: gridOpacity }}
			/>

			<motion.div
				className="absolute top-0 left-0 origin-top-left"
				style={{ width: VIEW_W, height: VIEW_H, x: camX, y: camY, scale: camK }}
			>
				<svg
					className="absolute top-0 left-0 overflow-visible"
					width={VIEW_W}
					height={VIEW_H}
					viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
					fill="none"
					aria-hidden="true"
				>
					{ARROWS.map((arrow) => (
						<g key={arrow.key}>
							<motion.path
								d={arrow.path}
								stroke="var(--color-thread)"
								strokeWidth={1.5}
								strokeLinecap="round"
								style={{ pathLength: threadLength, opacity: threadLength }}
							/>
							<motion.path d={arrow.head} fill="var(--color-thread)" style={{ opacity: headOpacity }} />
						</g>
					))}
				</svg>

				{SECTIONS.map((spec) => (
					<Tile key={spec.id} spec={spec} p={p} plays={plays} reduce={reduce} />
				))}

				{/* the landing, and the ring that says it is a frame now */}
				<div className="absolute" style={{ left: LIVE.x, top: LIVE.y, width: LIVE.w, height: LIVE.h }}>
					<LandingMini />
				</div>
				<motion.div
					className="absolute rounded-[9px] border-2 border-thread"
					style={{
						left: LIVE.x - 3,
						top: LIVE.y - 3,
						width: LIVE.w + 6,
						height: LIVE.h + 6,
						opacity: ringOpacity,
					}}
				/>

				{/* the chrome, which is what makes it an app and not a drawing */}
				<div
					className="absolute top-0 left-0 flex items-center gap-[14px] border-border border-b bg-bg px-[18px]"
					style={{ width: VIEW_W, height: BAR_H }}
				>
					<div className="h-[9px] w-[9px] rounded-full bg-thread" />
					<div className="h-[8px] w-[62px] rounded-full bg-raised" />
					<div className="h-[8px] w-[40px] rounded-full bg-surface" />
				</div>
				<div
					className="absolute left-0 flex flex-col gap-[15px] border-border border-r bg-bg px-[18px] py-[22px]"
					style={{ top: BAR_H, width: RAIL_W, height: VIEW_H - BAR_H }}
				>
					<div className="h-[8px] w-[58%] rounded-full bg-raised" />
					<div className="ml-[14px] h-[7px] w-[52%] rounded-full bg-thread/60" />
					{["a", "b", "c", "d"].map((row) => (
						<div key={row} className="ml-[14px] h-[7px] w-[44%] rounded-full bg-surface" />
					))}
					<div className="mt-[6px] h-[8px] w-[46%] rounded-full bg-raised" />
				</div>
			</motion.div>
		</div>
	);
}

/** a section, arriving on the ramp its spec names, then holding. */
function Tile({
	spec,
	p,
	plays,
	reduce,
}: {
	spec: SectionSpec;
	p: MotionValue<number>;
	plays: boolean;
	reduce: boolean;
}) {
	const opacity = useTransform(p, (v) => rampAt(v, spec.at, spec.at + 0.16));
	const y = useTransform(p, (v) => (1 - rampAt(v, spec.at, spec.at + 0.16)) * 14);
	return (
		<motion.div
			className="absolute overflow-hidden rounded-[7px] border border-border-raised bg-bg"
			style={{
				left: spec.x,
				top: spec.y,
				width: spec.w,
				height: spec.h,
				opacity: plays ? opacity : 1,
				y: plays ? y : 0,
			}}
		>
			<spec.Wire still={reduce} />
		</motion.div>
	);
}
