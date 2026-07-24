import {
	AnimatePresence,
	MotionConfig,
	motion,
	useMotionValue,
	useSpring,
	useTransform,
} from "motion/react";
import type { MotionValue } from "motion/react";
import type { ComponentType } from "react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { CommandLine, LandingHero } from "../../../shared/ui/landing-hero";
import {
	BAND_ANCHORS,
	DRAFTS,
	EDGES,
	FIELD,
	HUB,
	LINEAGE,
	ROUNDS,
	SLOTS,
	type Rect,
} from "./drafts";

/**
 * site-hub--drafts: the landing, and the twenty-six it was chosen from.
 *
 * One camera over one coordinate space. Scroll pulls it back twice:
 *
 *   0            the landing fills the viewport.
 *   0 -> 0.46    it shrinks into its own frame and the neighbouring frames
 *                resolve around it. the first "oh".
 *   0.46 -> 1    the camera keeps pulling back until the whole genealogy is in
 *                view: every round the page went through, every frame drawn to
 *                the frame it came from. the second "oh".
 *
 * Nothing here is a picture of the product. Every frame in the field is the
 * real component, imported from its real folder and rendered at its real width;
 * the camera is the only thing that scales. That is what lets a click simply
 * fly to a frame and hand over the pointer. landing--twohands-you is playable
 * in place. The field's arrangement is the one thing that is authored rather
 * than found: one band per generation (drafts.ts BANDS), because the real
 * frame.json coordinates interleave the rounds and read as noise.
 *
 * The camera interpolates in (centre-x, centre-y, log scale), which is what
 * makes a long dolly read evenly instead of racing at the end, and everything
 * hangs off MotionValues so scrolling never re-renders React.
 *
 * Cost: twenty-six live pages is a lot of ambient motion to run behind a moving
 * camera, so the field is wrapped in MotionConfig reducedMotion="always" and
 * only the frame being looked at is allowed to animate.
 */

/* ---------- the one coordinate space ---------- */

const VIEW_W = 1440;
const VIEW_H = 900;
const HUB_NAME = "site-hub--drafts";
const TRACK_H = 3900; // 3000px of scroll for the two-stage pull-back
const P1 = 0.46; // progress where the dock lands and the wide pull-back begins

/** Where the docked landing sits on screen at the end of stage one. */
const DOCK_BOX = { x: 548, y: 333, w: 456 };
/** Where the whole canvas sits on screen at the end of stage two: the field
 * takes the left, the closing statement takes the right. */
const WIDE_BOX = { x: 88, y: 24, h: 852 };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A camera: the canvas point held at the viewport centre, and a scale. */
interface Pose {
	cx: number;
	cy: number;
	s: number;
}

/** The pose that lands `rect` on screen at (x, y) with the given width. */
function poseFitting(rect: Rect, screenX: number, screenY: number, s: number): Pose {
	return {
		s,
		cx: rect.x + (VIEW_W / 2 - screenX) / s,
		cy: rect.y + (VIEW_H / 2 - screenY) / s,
	};
}

const HOME: Pose = poseFitting(HUB, 0, 0, 1);
const DOCK: Pose = poseFitting(HUB, DOCK_BOX.x, DOCK_BOX.y, DOCK_BOX.w / HUB.w);
const WIDE: Pose = poseFitting(FIELD, WIDE_BOX.x, WIDE_BOX.y, WIDE_BOX.h / FIELD.h);

/**
 * Fit one frame in the viewport with breathing room, for the click-to-focus
 * fly. The box is the frame's slot in the field, but its real height: a focused
 * frame is lifted out of its 900px window and shown whole.
 */
function focusPose(slot: Rect, realH: number): Pose {
	const raw = Math.min((VIEW_W - 200) / slot.w, (VIEW_H - 168) / realH);
	const s = Math.min(0.86, Math.max(0.34, raw));
	return { s, cx: slot.x + slot.w / 2, cy: slot.y + realH / 2 };
}

/** Dolly evenly: centre lerps, scale lerps in log space. */
function poseAt(p: number): Pose {
	if (p <= P1) {
		const t = smooth(clamp01(p / P1));
		return {
			cx: lerp(HOME.cx, DOCK.cx, t),
			cy: lerp(HOME.cy, DOCK.cy, t),
			s: Math.exp(lerp(Math.log(HOME.s), Math.log(DOCK.s), t)),
		};
	}
	const t = smooth(clamp01((p - P1) / (1 - P1)));
	return {
		cx: lerp(DOCK.cx, WIDE.cx, t),
		cy: lerp(DOCK.cy, WIDE.cy, t),
		s: Math.exp(lerp(Math.log(DOCK.s), Math.log(WIDE.s), t)),
	};
}

const rampAt = (v: number, a: number, b: number) => smooth(clamp01((v - a) / (b - a)));

const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 9%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
};
/* ---------- the field: real frames, one band per generation ---------- */

/**
 * One frame in the field. The content renders at its natural 1440 width and the
 * world's transform does the scaling, so this is the frame itself, not a
 * thumbnail of it. The content is inert; the catcher above it owns hover and
 * click so a draft's own buttons never steal them. `contain: layout paint` keeps each frame's
 * paint and layout to itself, which is what stops one draft from invalidating
 * the whole field. Size containment is deliberately not used: several drafts
 * lay themselves out against a full-height parent.
 */
function FrameShell({
	slot,
	onHover,
	onPick,
	name,
	children,
}: {
	slot: Rect;
	onHover: (name: string | null) => void;
	onPick: (name: string) => void;
	name: string;
	children: React.ReactNode;
}) {
	return (
		<div className="absolute" style={{ left: slot.x, top: slot.y, width: slot.w, height: slot.h }}>
			{/* Every band shows the same window onto every page, the top 1440x900,
			    the shape of the thing they are all drafts of, so the frames are
			    comparable down a column instead of being different heights. */}
			<div
				className="pointer-events-none absolute inset-0 overflow-hidden bg-bg"
				style={{ contain: "layout paint" }}
			>
				{children}
			</div>

			{/* Edges are drawn once, in the field's own SVG, with stroke widths
			    divided by the camera: a border here would be multiplied by it and
			    vanish to a quarter-pixel at the full pull-back. */}

			<button
				type="button"
				aria-label={`look at ${name}`}
				onPointerEnter={() => onHover(name)}
				onPointerLeave={() => onHover(null)}
				onClick={() => onPick(name)}
				className="absolute inset-0 cursor-pointer focus-visible:outline-none"
			/>
		</div>
	);
}

/* ---------- chrome drawn in screen space, over the world ---------- */

/**
 * The ring around whatever the pointer is on, in screen space so it stays a
 * real 2px whether the frame is 120px wide or 1200. The label does not ride the
 * frame: the bands are tight enough that a tag above a frame lands on the band
 * above it, so the naming happens in one fixed panel (HoverNote) instead.
 */
function HoverRing({
	rect,
	cam,
}: {
	rect: Rect;
	cam: { cx: MotionValue<number>; cy: MotionValue<number>; s: MotionValue<number> };
}) {
	const x = useTransform([cam.cx, cam.s], ([cx, s]: number[]) => (rect.x - cx) * s + VIEW_W / 2);
	const y = useTransform([cam.cy, cam.s], ([cy, s]: number[]) => (rect.y - cy) * s + VIEW_H / 2);
	const w = useTransform(cam.s, (s) => rect.w * s);
	const h = useTransform(cam.s, (s) => rect.h * s);
	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 z-40"
			style={{ x, y, width: w, height: h }}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.14, ease: "easeOut" }}
		>
			<div className="absolute inset-0 outline outline-[2px] outline-thread" />
		</motion.div>
	);
}

/**
 * What the pointer is on. It takes the right-hand column, the same place the
 * closing statement sits. That column is the page's reading column, and the
 * statement steps back to 12% the moment a frame is hovered. Anywhere else on
 * screen is field: the bands are tight enough that a label near a frame lands
 * on its neighbour.
 */
function HoverNote({
	title,
	note,
	meta,
	from,
}: {
	title: string;
	note: string;
	meta: string;
	from?: string;
}) {
	return (
		<motion.div
			className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-[60px] z-40 w-[306px]"
			initial={{ opacity: 0, y: 5 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.15, ease: "easeOut" }}
		>
			<div className="font-mono text-[12px] text-thread leading-[18px]">{title}</div>
			<div className="mt-1 font-mono text-[10px] text-muted/50 leading-[16px]">{meta}</div>
			<div className="mt-4 font-mono text-[11px] text-muted leading-[18px]">{note}</div>
			{from ? (
				<div className="mt-4 border-border border-t pt-3 font-mono text-[11px] leading-[18px]">
					<span className="text-muted/50">came out of</span>
					<div className="text-thread/85">{from}</div>
				</div>
			) : null}
		</motion.div>
	);
}

/** The handles and size chip around the focused frame; it draws its own ring. */
function FocusRing({
	rect,
	cam,
}: {
	rect: Rect;
	cam: { cx: MotionValue<number>; cy: MotionValue<number>; s: MotionValue<number> };
}) {
	const x = useTransform([cam.cx, cam.s], ([cx, s]: number[]) => (rect.x - cx) * s + VIEW_W / 2);
	const y = useTransform([cam.cy, cam.s], ([cy, s]: number[]) => (rect.y - cy) * s + VIEW_H / 2);
	const w = useTransform(cam.s, (s) => rect.w * s);
	const h = useTransform(cam.s, (s) => rect.h * s);
	const corner = "absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";
	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 z-40"
			style={{ x, y, width: w, height: h }}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.2, ease: "easeOut" }}
		>
			<span className={cn(corner, "-left-[7px] -top-[7px]")} />
			<span className={cn(corner, "-right-[7px] -top-[7px]")} />
			<span className={cn(corner, "-left-[7px] -bottom-[7px]")} />
			<span className={cn(corner, "-right-[7px] -bottom-[7px]")} />
			<div className="-translate-x-1/2 -bottom-[9px] absolute left-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-none">
				{rect.w} × {rect.h}
			</div>
		</motion.div>
	);
}

/**
 * The live frame's chrome: name tab, corner handles, size chip. Drawn in screen
 * space so mono stays mono at every zoom.
 *
 * The ring is deliberately NOT here. It is drawn in the world with every other
 * frame's edge (FieldEdges), because a ring in screen space and a frame in world
 * space are two transforms computing the same position by different routes: they
 * agree algebraically and disagree by a subpixel per frame, and a doubled edge
 * disagreeing every frame is visible as jitter. Nothing that has to sit exactly
 * on the frame edge belongs in screen space. The handles and chip hang outside
 * the edge, where a subpixel is invisible, and they fade out as the camera
 * passes the docked scale so they never swamp a 130px frame.
 */
function LiveChrome({
	cam,
	base,
	detail,
}: {
	cam: { cx: MotionValue<number>; cy: MotionValue<number>; s: MotionValue<number> };
	base: MotionValue<number>;
	detail: MotionValue<number>;
}) {
	const x = useTransform([cam.cx, cam.s], ([cx, s]: number[]) => (HUB.x - cx) * s + VIEW_W / 2);
	const y = useTransform([cam.cy, cam.s], ([cy, s]: number[]) => (HUB.y - cy) * s + VIEW_H / 2);
	const w = useTransform(cam.s, (s) => HUB.w * s);
	const h = useTransform(cam.s, (s) => HUB.h * s);
	const corner = "absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread";
	return (
		<motion.div
			className="pointer-events-none absolute top-0 left-0 z-30"
			style={{ x, y, width: w, height: h, opacity: base }}
		>
			<div className="-top-[21px] absolute left-0 flex items-center gap-2 whitespace-nowrap font-mono text-thread text-xs leading-none">
				<span className="text-[8px] opacity-80">{"▶"}</span>
				<span>landing</span>
				<span className="text-muted/70">this page</span>
			</div>
			<motion.div className="absolute inset-0" style={{ opacity: detail }}>
				<span className={cn(corner, "-left-[7px] -top-[7px]")} />
				<span className={cn(corner, "-right-[7px] -top-[7px]")} />
				<span className={cn(corner, "-left-[7px] -bottom-[7px]")} />
				<span className={cn(corner, "-right-[7px] -bottom-[7px]")} />
				<div className="-translate-x-1/2 -bottom-[9px] absolute left-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-none">
					1440 × 900
				</div>
			</motion.div>
		</motion.div>
	);
}

/**
 * Every frame's edge, in one SVG in world coordinates. The stroke widths are
 * divided by the camera scale so they land on screen at a true hairline at any
 * zoom. vector-effect cannot help here, because it corrects the SVG's own
 * user-space transform, not the CSS scale on an ancestor. That hairline is the
 * whole difference between a canvas of objects and a soup of floating content.
 */
function FieldEdges({ s }: { s: MotionValue<number> }) {
	const line = new Set(LINEAGE);
	const hair = useTransform(s, (k) => 1.4 / k);
	const thread = useTransform(s, (k) => 2 / k);
	return (
		<svg
			className="pointer-events-none absolute overflow-visible"
			style={{ left: FIELD.x, top: FIELD.y, width: FIELD.w, height: FIELD.h }}
			viewBox={`${FIELD.x} ${FIELD.y} ${FIELD.w} ${FIELD.h}`}
			fill="none"
			aria-hidden="true"
		>
			{Object.entries(SLOTS).map(([name, r]) =>
				// the docked page draws its own edge, on its own layer
				name === HUB_NAME ? null : (
					<motion.rect
						key={name}
						x={r.x}
						y={r.y}
						width={r.w}
						height={r.h}
						stroke={line.has(name) ? "var(--color-thread)" : "var(--color-border-raised)"}
						strokeOpacity={line.has(name) ? 0.45 : 1}
						strokeWidth={line.has(name) ? thread : hair}
					/>
				),
			)}
		</svg>
	);
}

/* ---------- the lineage: every frame, drawn to the frame it came from ---------- */

/**
 * One parent edge, as a curve from the bottom of the parent to the top of the
 * child. Bands are stacked in generation order, so almost every edge is a short
 * downward hop and the whole graph reads without a legend. The control points
 * leave each end vertically, which is what makes a fan out of one parent (round
 * 03 all descends from `landing`) legible instead of a starburst.
 */
function edgePath(from: Rect, to: Rect): string {
	const x0 = from.x + from.w / 2;
	const y0 = from.y + from.h;
	const x1 = to.x + to.w / 2;
	const y1 = to.y;
	const dy = Math.max(120, (y1 - y0) * 0.55);
	return `M ${x0} ${y0} C ${x0} ${y0 + dy}, ${x1} ${y1 - dy}, ${x1} ${y1}`;
}

/**
 * The descent, drawn. Every edge is faint; the chain this page actually came
 * down is brighter and carries the travelling pulse; and whatever the pointer
 * is on lights its own parent and children so "what came from what" is a hover
 * away rather than a thing to work out.
 */
function Lineage({
	opacity,
	s,
	hot,
}: {
	opacity: MotionValue<number>;
	s: MotionValue<number>;
	hot: string | null;
}) {
	const faint = useTransform(s, (k) => 1.6 / k);
	const lit = useTransform(s, (k) => 2.6 / k);
	const chain = new Set<string>();
	for (let i = 0; i < LINEAGE.length - 1; i++) chain.add(`${LINEAGE[i]}>${LINEAGE[i + 1]}`);

	return (
		<motion.svg
			className="pointer-events-none absolute overflow-visible"
			style={{ left: FIELD.x, top: FIELD.y, width: FIELD.w, height: FIELD.h, opacity }}
			viewBox={`${FIELD.x} ${FIELD.y} ${FIELD.w} ${FIELD.h}`}
			fill="none"
			aria-hidden="true"
		>
			{EDGES.map(({ from, to }) => {
				const d = edgePath(SLOTS[from], SLOTS[to]);
				const onChain = chain.has(`${from}>${to}`);
				const near = hot !== null && (hot === from || hot === to);
				return (
					<motion.path
						key={`${from}>${to}`}
						d={d}
						stroke="var(--color-thread)"
						strokeLinecap="round"
						strokeWidth={near || onChain ? lit : faint}
						animate={{ strokeOpacity: near ? 1 : hot !== null ? 0.1 : onChain ? 0.72 : 0.24 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
					/>
				);
			})}
			{/* the pulse: one travelling highlight down the chain this page descends */}
			{LINEAGE.slice(0, -1).map((from, i) => (
				<motion.path
					key={`pulse-${from}`}
					d={edgePath(SLOTS[from], SLOTS[LINEAGE[i + 1]])}
					stroke="var(--color-thread)"
					strokeLinecap="round"
					strokeWidth={lit}
					pathLength={1}
					strokeDasharray="0.35 0.65"
					animate={{ strokeDashoffset: [0.35, -0.65] }}
					transition={{
						duration: 1.5,
						repeat: Infinity,
						ease: "linear",
						delay: i * 1.5,
						repeatDelay: (LINEAGE.length - 2) * 1.5,
					}}
				/>
			))}
		</motion.svg>
	);
}

/**
 * The generation labels, in screen space so mono stays mono at every zoom.
 * They hang off the left edge of each band's first frame.
 */
function BandLabels({
	cam,
	opacity,
}: {
	cam: { cx: MotionValue<number>; cy: MotionValue<number>; s: MotionValue<number> };
	opacity: MotionValue<number>;
}) {
	return (
		<motion.div className="pointer-events-none absolute inset-0 z-30" style={{ opacity }}>
			{BAND_ANCHORS.filter(({ band }) => band.label !== "").map(({ band, x, y }) => (
				<BandLabel key={band.label} band={band} x={x} y={y} cam={cam} />
			))}
		</motion.div>
	);
}

function BandLabel({
	band,
	x,
	y,
	cam,
}: {
	band: { label: string; note: string };
	x: number;
	y: number;
	cam: { cx: MotionValue<number>; cy: MotionValue<number>; s: MotionValue<number> };
}) {
	const sx = useTransform([cam.cx, cam.s], ([cx, k]: number[]) => (x - cx) * k + VIEW_W / 2);
	const sy = useTransform([cam.cy, cam.s], ([cy, k]: number[]) => (y - cy) * k + VIEW_H / 2);
	return (
		<motion.div className="absolute top-0 left-0 whitespace-nowrap" style={{ x: sx, y: sy }}>
			<div className="-translate-y-full flex items-baseline gap-2 pb-[7px] font-mono text-[10px] leading-[13px]">
				<span className="text-thread">{band.label}</span>
				<span className="text-muted/60">{band.note}</span>
			</div>
		</motion.div>
	);
}

/* ---------- the closing caption, right of the canvas at full pull-back ---------- */

function WideCaption({ opacity }: { opacity: MotionValue<number> }) {
	return (
		<motion.div
			className="-translate-y-1/2 absolute top-1/2 right-[60px] z-30 w-[306px]"
			style={{ opacity }}
		>
			<div className="font-semibold text-[38px] leading-[1] tracking-[-0.025em]">
				{DRAFTS.length} landings
				<br />
				for one page.
			</div>
			<p className="mt-5 text-[14px] text-muted leading-[22px]">
				every round it went through, and what came out of what. none of these is a screenshot: they
				are the real frames, still running.
			</p>
			<div className="mt-6 flex gap-4">
				<span className="w-px shrink-0 self-stretch bg-thread/70" />
				<div className="font-mono text-[12px] leading-[24px]">
					<CommandLine prompt="~ $" command="npm i -g spool.page" />
					<CommandLine prompt="~/your-app $" command="spool init" />
				</div>
			</div>
			<div className="mt-6 border-border border-t pt-4 font-mono text-[11px] text-muted leading-[17px]">
				<span className="text-thread">▸</span> the ring is the page you just scrolled, and the bright
				thread is the line it came down.
				<div className="mt-1.5 text-text">hover a frame to see what it came from.</div>
			</div>
		</motion.div>
	);
}

/** The quiet line under the docked landing at the end of stage one. */
function DockCaption({ opacity }: { opacity: MotionValue<number> }) {
	return (
		<motion.div
			className="absolute z-30 text-center font-mono"
			style={{ left: DOCK_BOX.x, top: 660, width: DOCK_BOX.w, opacity }}
		>
			<div className="text-[13px] text-text leading-[18px]">this page is a frame on a canvas.</div>
			<div className="mt-1.5 text-[11px] text-muted leading-[16px]">keep scrolling.</div>
		</motion.div>
	);
}

/* ---------- the focus chrome: what you get when you click a frame ---------- */

function FocusBar({
	title,
	note,
	meta,
	onExit,
}: {
	title: string;
	note: string;
	meta: string;
	onExit: () => void;
}) {
	return (
		<motion.div
			className="absolute top-[26px] left-[64px] z-40 flex items-center gap-4"
			initial={{ opacity: 0, y: -6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -6 }}
			transition={{ duration: 0.18, ease: "easeOut" }}
		>
			<button
				type="button"
				onClick={onExit}
				className="cursor-pointer rounded-full border border-border-raised bg-surface/80 px-3 py-1.5 font-mono text-[11px] text-muted leading-none transition-colors duration-200 hover:border-thread/50 hover:text-thread focus-visible:outline-none"
			>
				esc · back to the canvas
			</button>
			<div className="flex items-baseline gap-2.5 font-mono text-[11px] leading-none">
				<span className="text-thread">{title}</span>
				<span className="text-muted/60">{meta}</span>
			</div>
			<div className="max-w-[420px] font-mono text-[10px] text-muted leading-[14px]">{note}</div>
		</motion.div>
	);
}

/**
 * The page itself, docked.
 *
 * It is deliberately NOT a passenger inside the world transform. The world is
 * an enormous layer (the whole genealogy), and scaling it makes Chrome re-raster
 * its tiles as the scale crosses thresholds. Every field frame is small and soft
 * enough that the stepping does not read, but this one carries a 66px headline
 * and starts at scale 1, so it is the one place it shows, as jitter, on the one
 * frame the visitor is looking at.
 *
 * So it gets what the shipped site-hub gives it: its own element, carrying its
 * own transform, promoted with will-change. A 1440x900 layer rasters cheaply and
 * stably at any scale. Its ring lives on the same element rather than in the
 * world's SVG, so ring and page share one transform and cannot disagree by the
 * subpixel that reads as a shimmering edge.
 */
function DockedPage({
	cam,
	hint,
	onHome,
	catcher,
	ringOpacity,
}: {
	cam: { cx: MotionValue<number>; cy: MotionValue<number>; s: MotionValue<number> };
	hint: MotionValue<number>;
	onHome: () => void;
	catcher: MotionValue<string>;
	ringOpacity: MotionValue<number>;
}) {
	const x = useTransform([cam.cx, cam.s], ([cx, k]: number[]) => (HUB.x - cx) * k + VIEW_W / 2);
	const y = useTransform([cam.cy, cam.s], ([cy, k]: number[]) => (HUB.y - cy) * k + VIEW_H / 2);
	const ring = useTransform(cam.s, (k) => 2.5 / k);
	return (
		<motion.div
			className="absolute top-0 left-0 z-20 origin-top-left overflow-hidden bg-bg [will-change:transform]"
			style={{ x, y, width: HUB.w, height: HUB.h, scale: cam.s }}
		>
			<LandingHero hint={hint} />
			<motion.div
				className="pointer-events-none absolute inset-0"
				style={{
					outlineStyle: "solid",
					outlineColor: "var(--color-thread)",
					outlineWidth: ring,
					opacity: ringOpacity,
				}}
			/>
			<motion.button
				type="button"
				aria-label="back to the page"
				onClick={onHome}
				className="absolute inset-0 cursor-pointer focus-visible:outline-none"
				style={{ opacity: 0, pointerEvents: catcher }}
			/>
		</motion.div>
	);
}

/** The frame under focus, on its own layer, alive and holding the pointer. */
function FocusedFrame({
	pick,
	cam,
}: {
	pick: Pick;
	cam: { cx: MotionValue<number>; cy: MotionValue<number>; s: MotionValue<number> };
}) {
	const x = useTransform([cam.cx, cam.s], ([cx, k]: number[]) => (pick.slot.x - cx) * k + VIEW_W / 2);
	const y = useTransform([cam.cy, cam.s], ([cy, k]: number[]) => (pick.slot.y - cy) * k + VIEW_H / 2);
	const ring = useTransform(cam.s, (k) => 2 / k);
	return (
		<motion.div
			className="absolute top-0 left-0 z-30 origin-top-left overflow-hidden bg-bg [will-change:transform]"
			style={{ x, y, width: pick.slot.w, height: pick.realH, scale: cam.s }}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.18, ease: "easeOut" }}
		>
			<pick.C />
			<motion.div
				className="pointer-events-none absolute inset-0"
				style={{ outlineStyle: "solid", outlineColor: "var(--color-thread)", outlineWidth: ring }}
			/>
		</motion.div>
	);
}

/* ---------- orchestrator ---------- */

interface Pick {
	name: string;
	/** The frame's window in the field: what the ring and the hover tag hug. */
	slot: Rect;
	/** The frame's real height, for the focus fly and the size chip. */
	realH: number;
	note: string;
	meta: string;
	/** Where its parent sits, so a hovered frame can name what it came from. */
	from?: string;
	C: ComponentType;
}

/** Every frame in the field. Drafts only: see the note on BANDS in drafts.ts. */
const FRAMES: readonly Pick[] = [
	...DRAFTS.map((d) => ({
		name: d.name,
		slot: SLOTS[d.name],
		realH: d.rect.h,
		note: d.note,
		meta: `${ROUNDS[d.round].label} · ${ROUNDS[d.round].note}`,
		from: d.parent,
		C: d.C,
	})),
];

const PICKS: Record<string, Pick> = Object.fromEntries(FRAMES.map((f) => [f.name, f]));

export default function SiteHubDrafts() {
	const scrollRef = useRef<HTMLDivElement>(null);
	// Raw scroll progress: the camera springs below do all the smoothing, so
	// there is exactly one spring between the wheel and the pixels. Springing
	// progress as well would stack two lags and the camera would trail a beat
	// behind the hand.
	const sp = useMotionValue(0);

	// Which field frames have ever been near the camera. A frame's contents are
	// mounted the first time it comes within a viewport's margin of being seen,
	// and never unmounted after. During the zoom-out only a frame or two is in
	// range, so the expensive phase renders almost nothing, and the rest of the
	// DOM arrives spread across the pull-back instead of all at once. Growth
	// only: the set never shrinks, so scrolling back up costs nothing.
	const [seen, setSeen] = useState<ReadonlySet<string>>(new Set([HUB_NAME]));

	// The field is heavy: twenty-six real pages of real DOM. Mount it just
	// after first paint so the boot frame (and `spool shot`) is the landing
	// alone, and the cost is paid while the visitor is still reading the hero.
	const [fieldOn, setFieldOn] = useState(false);
	const [hot, setHot] = useState<string | null>(null);
	const [focus, setFocus] = useState<string | null>(null);

	useEffect(() => {
		const t = window.setTimeout(() => setFieldOn(true), 420);
		return () => window.clearTimeout(t);
	}, []);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const measure = () => {
			const max = el.scrollHeight - el.clientHeight;
			sp.set(max > 0 ? clamp01(el.scrollTop / max) : 0);
		};
		el.addEventListener("scroll", measure, { passive: true });
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		measure();
		return () => {
			el.removeEventListener("scroll", measure);
			ro.disconnect();
		};
	}, [sp]);

	// Camera. Three springs, two drivers: scroll writes the targets unless a
	// frame is focused, in which case the focus pose owns them. Both flows land
	// on the same springs, so the fly-in and the dolly share one feel.
	const camCx = useMotionValue(HOME.cx);
	const camCy = useMotionValue(HOME.cy);
	const camLogS = useMotionValue(Math.log(HOME.s));
	const cx = useSpring(camCx, { stiffness: 120, damping: 34, mass: 1 });
	const cy = useSpring(camCy, { stiffness: 120, damping: 34, mass: 1 });
	const logS = useSpring(camLogS, { stiffness: 120, damping: 34, mass: 1 });
	const s = useTransform(logS, Math.exp);

	const focusRef = useRef<string | null>(null);
	useEffect(() => {
		focusRef.current = focus;
	}, [focus]);

	const applyScrollPose = useCallback(
		(p: number) => {
			const pose = poseAt(p);
			camCx.set(pose.cx);
			camCy.set(pose.cy);
			camLogS.set(Math.log(pose.s));
		},
		[camCx, camCy, camLogS],
	);

	useEffect(() => {
		const unsub = sp.on("change", (v) => {
			if (focusRef.current === null) applyScrollPose(v);
		});
		applyScrollPose(sp.get());
		return unsub;
	}, [sp, applyScrollPose]);

	// Focus: fly to the frame. Leaving focus hands the camera back to the scroll
	// position it was at, so the visitor lands exactly where they left.
	useEffect(() => {
		if (focus === null) {
			applyScrollPose(sp.get());
			return;
		}
		const pick = PICKS[focus];
		if (!pick) return;
		const pose = focusPose(pick.slot, pick.realH);
		camCx.set(pose.cx);
		camCy.set(pose.cy);
		camLogS.set(Math.log(pose.s));
	}, [focus, sp, applyScrollPose, camCx, camCy, camLogS]);

	useEffect(() => {
		const near = () => {
			const k = s.get();
			if (k <= 0) return;
			const halfW = (VIEW_W / 2 / k) * 2.1;
			const halfH = (VIEW_H / 2 / k) * 2.1;
			const [x0, x1] = [cx.get() - halfW, cx.get() + halfW];
			const [y0, y1] = [cy.get() - halfH, cy.get() + halfH];
			setSeen((cur) => {
				let next: Set<string> | null = null;
				for (const f of FRAMES) {
					if (cur.has(f.name)) continue;
					const r = f.slot;
					if (r.x > x1 || r.x + r.w < x0 || r.y > y1 || r.y + r.h < y0) continue;
					next ??= new Set(cur);
					next.add(f.name);
				}
				return next ?? cur;
			});
		};
		near();
		const stop = [cx.on("change", near), cy.on("change", near), s.on("change", near)];
		return () => {
			for (const off of stop) off();
		};
	}, [cx, cy, s]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setFocus(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Scrolling back to the top is how you re-enter the page. The catcher over
	// the docked landing only takes clicks once the page has actually shrunk,
	// so at rest the install lines underneath stay clickable.
	const home = useCallback(() => {
		setFocus(null);
		scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
	}, []);
	const homeCatcher = useTransform(sp, (v) => (v > 0.12 ? "auto" : "none"));

	// The world's transform, straight off the camera. No React render per frame.
	const worldX = useTransform([cx, s], ([c, k]: number[]) => VIEW_W / 2 - c * k);
	const worldY = useTransform([cy, s], ([c, k]: number[]) => VIEW_H / 2 - c * k);

	// Focusing a frame clears every scroll-driven caption and chrome at once.
	// It rides a MotionValue rather than the `focus` closure so the transforms
	// below never depend on a render having happened.
	const chromeOn = useMotionValue(1);
	useEffect(() => {
		chromeOn.set(focus === null ? 1 : 0);
	}, [focus, chromeOn]);

	// Inspecting a frame hands the right-hand column over: the closing statement
	// steps out and the hovered frame's note takes its place.
	const captionOn = useSpring(useMotionValue(1), { stiffness: 260, damping: 34 });
	useEffect(() => {
		captionOn.set(hot === null ? 1 : 0);
	}, [hot, captionOn]);

	const hint = useTransform(sp, (v) => 1 - clamp01(v / 0.06));
	const gridOpacity = useTransform(sp, (v) => clamp01(v / 0.14));
	const fieldOpacity = useTransform(sp, (v) => Math.max(rampAt(v, 0.14, 0.38), 0.001));
	const liveBase = useTransform([s, chromeOn], ([k, on]: number[]) =>
		Math.min(clamp01((0.86 - k) / 0.28), on),
	);
	const liveDetail = useTransform(s, (k) => rampAt(k, 0.14, 0.26));
	const dockCaption = useTransform([sp, chromeOn], ([v, on]: number[]) =>
		Math.min(rampAt(v, 0.32, 0.42) * (1 - rampAt(v, 0.5, 0.6)), on),
	);
	const wideCaption = useTransform([sp, chromeOn, captionOn], ([v, on, lit]: number[]) =>
		Math.min(rampAt(v, 0.74, 0.93), on, lit),
	);
	const lineageOpacity = useTransform([sp, chromeOn], ([v, on]: number[]) =>
		Math.min(rampAt(v, 0.5, 0.74), on),
	);
	const bandLabels = useTransform([sp, chromeOn], ([v, on]: number[]) =>
		Math.min(rampAt(v, 0.58, 0.8), on),
	);

	const hotPick = hot !== null && focus === null ? PICKS[hot] : undefined;
	const focusPick = focus !== null ? PICKS[focus] : undefined;

	return (
		<div
			ref={scrollRef}
			className="h-full w-full overflow-y-auto overflow-x-hidden bg-canvas [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<div style={{ height: TRACK_H }}>
				<div className="sticky top-0 h-[900px] w-full overflow-hidden bg-canvas font-sans text-text antialiased [font-synthesis:none]">
					<motion.div className="absolute inset-0" style={{ ...dotGrid, opacity: gridOpacity }} />

					{/* the world: one transform over one real coordinate space */}
					<motion.div
						className="absolute top-0 left-0 h-0 w-0 origin-top-left [will-change:transform]"
						style={{ x: worldX, y: worldY, scale: s }}
					>
						{/* The rest of the genealogy, real and running.
						    reducedMotion="always" is the load-bearing line here: it
						    reaches every motion component inside the field and stops it
						    animating transforms, so twenty-six pages of ambient pulses,
						    floats and carets are not driving the frame loop behind a
						    scrolling camera. The focused frame re-enables it below, which
						    is the only place motion is worth paying for. */}
						<MotionConfig reducedMotion="always">
							<motion.div className="absolute top-0 left-0" style={{ opacity: fieldOpacity }}>
								{fieldOn ? (
									<>
										<FieldEdges s={s} />
										<Lineage opacity={lineageOpacity} s={s} hot={hot} />
										{FRAMES.map((f) =>
											f.name === focus ? null : (
												<FrameShell
													key={f.name}
													name={f.name}
													slot={SLOTS[f.name]}
													onHover={setHot}
													onPick={setFocus}
												>
													{seen.has(f.name) ? <f.C /> : null}
												</FrameShell>
											),
										)}
									</>
								) : null}
							</motion.div>
						</MotionConfig>


					</motion.div>

					{/* The frame being read: lifted out of the field for the same reason
					    the docked page is, and so it can run at full height, animate, and
					    take the pointer. */}
					{focusPick ? <FocusedFrame key={focusPick.name} pick={focusPick} cam={{ cx, cy, s }} /> : null}

					<DockedPage
						cam={{ cx, cy, s }}
						hint={hint}
						onHome={home}
						catcher={homeCatcher}
						ringOpacity={liveBase}
					/>

					<LiveChrome cam={{ cx, cy, s }} base={liveBase} detail={liveDetail} />
					<BandLabels cam={{ cx, cy, s }} opacity={bandLabels} />

					<AnimatePresence>
						{hotPick ? <HoverRing key={hotPick.name} rect={hotPick.slot} cam={{ cx, cy, s }} /> : null}
					</AnimatePresence>

					<AnimatePresence>
						{hotPick ? (
							<HoverNote
								key={hotPick.name}
								title={hotPick.name}
								note={hotPick.note}
								meta={hotPick.meta}
								from={hotPick.from}
							/>
						) : null}
					</AnimatePresence>

					<DockCaption opacity={dockCaption} />
					<WideCaption opacity={wideCaption} />

					<AnimatePresence>
						{focusPick ? (
							<FocusRing
								key={focusPick.name}
								rect={{ ...focusPick.slot, h: focusPick.realH }}
								cam={{ cx, cy, s }}
							/>
						) : null}
					</AnimatePresence>

					<AnimatePresence>
						{focusPick ? (
							<FocusBar
								key={focusPick.name}
								title={focusPick.name}
								note={focusPick.note}
								meta={focusPick.meta}
								onExit={() => setFocus(null)}
							/>
						) : null}
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
}
