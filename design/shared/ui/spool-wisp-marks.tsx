import { type MotionProps, motion } from "motion/react";
import type { ReactNode } from "react";
import type { Wire } from "../lib/ribbon-state";
import { cn } from "../lib/utils";
import {
	SLIT_AREA,
	SLIT_BOX,
	SLIT_MASK,
	TAPER_4,
	TAPER_5,
	WAIST_5,
	WAIST_DEPTH,
	WISP_W,
	pinch,
} from "../lib/wisp-taper";

/**
 * Seven small marks, none of them the logo and all of them the logo's numbers.
 *
 * Every drawing here is absolutely positioned `<span>`s inside a fixed box, moved with
 * `transform` and `opacity` and nothing else, which is the one thing round three's meter set was
 * built to separate (`--weight` and `--glyph` both lost on being paint). The tapers are static
 * `clip-path` wedges: a clip is paint, but it is painted once and never animated, so it costs a
 * rasterisation at mount and nothing per frame.
 *
 * **Every take that moves keeps moving while a request is out.** That is not a detail. The four
 * waits in this script are 7,572ms of a 13,407ms turn, so a take that draws `sent` as a still
 * picture is a still rail for 56% of the turn, which is what the whole round exists to avoid.
 * `sent` and `working` are told apart by *what shape is moving* rather than by whether anything
 * is — and the reduced-motion swatches are where that claim is checked, because a state told
 * apart by rate alone collapses the moment the motion stops.
 */

export type WispTake = "waist" | "reel" | "cross" | "drift" | "hank" | "slit" | "nib";

export interface TakeProps {
	readonly wire: Wire;
	readonly still: boolean;
}

type Move = Pick<MotionProps, "animate" | "transition">;

const FOREVER = Number.POSITIVE_INFINITY;
/** long enough to read as a change of state, short enough to be one */
const SETTLE = { duration: 0.4, ease: "easeOut" } as const;
/** the borrowed property, as a clip: full at the root, 40% at the tip */
const WEDGE = "polygon(0% 0%, 100% 30%, 100% 70%, 0% 100%)";

/** the mark's box: 16px wide always, and as tall as the take needs, which is the headline number */
function Frame({ h, tone, children }: { h: number; tone: string; children: ReactNode }) {
	return (
		<span
			className={cn("relative block shrink-0 transition-colors duration-300", tone)}
			style={{ width: WISP_W, height: h }}
		>
			{children}
		</span>
	);
}

function Stroke({
	top,
	left = 0,
	height,
	width,
	origin = "left center",
	taper = true,
	animate,
	transition,
}: {
	top: number;
	left?: number;
	height: number;
	width: number;
	origin?: string;
	taper?: boolean;
} & Move) {
	return (
		<motion.span
			className="absolute block bg-current"
			style={{
				top,
				left,
				height,
				width,
				transformOrigin: origin,
				...(taper ? { clipPath: WEDGE } : {}),
			}}
			initial={false}
			animate={animate}
			transition={transition}
		/>
	);
}

function tone(state: Wire["state"]): string {
	return state === "parked" ? "text-thread" : "text-text";
}

/* ---------- waist: the taper is the only borrowed property, and the waist moves ---------- */

const WAIST_H = 1.4;
const WAIST_GAP = 1.4;
const WAIST_N = 5;
export const WAIST_BOX = { w: WISP_W, h: WAIST_N * WAIST_H + (WAIST_N - 1) * WAIST_GAP };
const WAIST_MS = 1500;
const SENT_MS = 1400;
/** the pinch's centre over one cycle: down the cascade and back up it */
const WAIST_WALK = [0.6, 1.5, 2.4, 3.2, 3.4, 3.2, 2.4, 1.5, 0.6];

/**
 * `waist` — five strokes, and the only thing that ever happens is where the waist is.
 *
 * The taper is borrowed as a function rather than as a picture, which is what lets it move. Five
 * strokes sit at the five sampled spans, and a gaussian pinch of depth 0.62 centred on the
 * narrowest reproduces those spans to within 0.06 of a stroke width — so the logo's proportion is
 * one value of one parameter, and sliding that parameter leaves the proportion intact somewhere
 * else on the cascade. Nothing rotates, nothing travels, nothing fades: `scaleX` on five spans.
 *
 * **The strokes scale about their centres rather than their left edges**, which was a correction
 * made from the first still rather than a preference. Left-aligned, five bars of different lengths
 * is a text-lines glyph — the icon every app uses for a list — and the taper is invisible inside
 * that reading. Symmetric, the same five widths are a form that narrows and opens, which is the
 * thing being borrowed. The logo's own strands are ragged at both edges, so nothing is lost.
 *
 *   idle      the pinch at the identity's own waist, still. The mark is the cascade, quiet.
 *   sent      the pinch deepens to 0.94 and breathes there. The cascade is nearly cut in two at
 *             its middle, which is the least the rail knows drawn as the least it has ever been.
 *   working   the pinch's centre walks 0.6 → 3.4 → 0.6 at a fixed depth. The waist travels.
 *   parked    all five at full width, still, in the accent. No waist at all.
 */
function Waist({ wire, still }: TakeProps) {
	const state = wire.state;
	const parked = state === "parked";
	const moving = wire.on && !parked && !still;
	const sent = state === "sent";
	return (
		<Frame h={WAIST_BOX.h} tone={tone(state)}>
			{TAPER_5.map((_, index) => {
				const top = index * (WAIST_H + WAIST_GAP);
				let move: Move;
				if (parked) move = { animate: { scaleX: 1, opacity: 1 }, transition: SETTLE };
				else if (state === "idle")
					move = {
						animate: { scaleX: pinch(index, WAIST_5, WAIST_DEPTH), opacity: 0.26 },
						transition: SETTLE,
					};
				else if (!moving)
					move = {
						animate: {
							scaleX: sent ? pinch(index, WAIST_5, 0.94) : pinch(index, 3.4, WAIST_DEPTH),
							opacity: 0.9,
						},
						transition: SETTLE,
					};
				else if (sent)
					move = {
						animate: {
							scaleX: [pinch(index, WAIST_5, 0.94), pinch(index, WAIST_5, 0.7), pinch(index, WAIST_5, 0.94)],
							opacity: 0.9,
						},
						transition: {
							scaleX: { duration: SENT_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
							opacity: SETTLE,
						},
					};
				else
					move = {
						animate: {
							scaleX: WAIST_WALK.map((centre) => pinch(index, centre, WAIST_DEPTH)),
							opacity: 0.92,
						},
						transition: {
							scaleX: { duration: WAIST_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
							opacity: SETTLE,
						},
					};
				return (
					<Stroke
						// biome-ignore lint/suspicious/noArrayIndexKey: the stroke's place in the cascade is its identity
						key={index}
						top={top}
						height={WAIST_H}
						width={WISP_W}
						origin="center center"
						{...move}
					/>
				);
			})}
		</Frame>
	);
}

/* ---------- reel: a core, and thread paying off it ---------- */

const CORE_W = 1.5;
const REEL_H = 1.5;
export const REEL_BOX = { w: WISP_W, h: 11 };
const REEL_RUNS = [13.8, 9.4, 11.8];
const REEL_TOPS = [1.2, 4.75, 8.3];
const REEL_MS = 1450;

/**
 * `reel` — an anchor that never moves, and three threads paying off it.
 *
 * The first of the two new mechanisms, and the only drawing on this row where something is
 * *stationary on purpose*: a 1.5px core down the left edge is the bobbin, present at every state
 * and at every strength, and the three threads leaving it are the work. Their maximum runs are
 * the sampled spans — long, short, long — so the taper is in the lengths rather than in a shape,
 * and the cascade reads even though there are three of it.
 *
 * **It cannot imply progress**, which is the trap this metaphor usually falls into and the reason
 * round four's `--wound` was drawn only to be killed. The threads do not fill in order to a
 * complete state; each pays out and draws back continuously on its own stagger, so there is no
 * arrangement that is further along than another and nothing to read as a fraction.
 *
 *   idle      three threads drawn most of the way in, dim. The thread is on the reel.
 *   sent      drawn all the way in and quivering at the root: the core, and nothing off it.
 *   working   paying out and back, 180ms apart, at three different lengths.
 *   parked    all three fully out, still, in the accent.
 */
function Reel({ wire, still }: TakeProps) {
	const state = wire.state;
	const parked = state === "parked";
	const moving = wire.on && !parked && !still;
	const sent = state === "sent";
	return (
		<Frame h={REEL_BOX.h} tone={tone(state)}>
			<motion.span
				className="absolute top-0 left-0 block bg-current"
				style={{ width: CORE_W, height: REEL_BOX.h }}
				initial={false}
				animate={{ opacity: parked ? 1 : wire.on ? 0.95 : 0.34 }}
				transition={SETTLE}
			/>
			{REEL_RUNS.map((run, index) => {
				let move: Move;
				if (parked) move = { animate: { scaleX: 1, opacity: 1 }, transition: SETTLE };
				else if (state === "idle") move = { animate: { scaleX: 0.34, opacity: 0.26 }, transition: SETTLE };
				else if (!moving)
					move = {
						animate: { scaleX: sent ? 0.1 : ([0.9, 0.55, 0.3][index] ?? 0.5), opacity: 0.9 },
						transition: SETTLE,
					};
				else if (sent)
					move = {
						animate: { scaleX: [0.08, 0.2, 0.08], opacity: 0.9 },
						transition: {
							scaleX: { duration: SENT_MS / 1000, repeat: FOREVER, ease: "easeInOut", delay: index * 0.1 },
							opacity: SETTLE,
						},
					};
				else
					move = {
						animate: { scaleX: [0.18, 1, 0.18], opacity: 0.92 },
						transition: {
							scaleX: { duration: REEL_MS / 1000, repeat: FOREVER, ease: "easeInOut", delay: index * 0.18 },
							opacity: SETTLE,
						},
					};
				return (
					<Stroke
						// biome-ignore lint/suspicious/noArrayIndexKey: the thread's place is its identity
						key={index}
						top={REEL_TOPS[index] ?? 0}
						left={CORE_W + 0.7}
						height={REEL_H}
						width={run}
						{...move}
					/>
				);
			})}
		</Frame>
	);
}

/* ---------- cross: two strokes lying across each other ---------- */

export const CROSS_BOX = { w: WISP_W, h: 10 };
const CROSS_H = 1.6;
const CROSS_MS = 1500;

/**
 * `cross` — two threads lying across each other, and the crossing is the state.
 *
 * The second new mechanism. Two tapered strokes, both the full 16px, both pinned at the box's
 * middle, and the only properties that move are `rotate` and `translateY`. Nothing about it is a
 * spinner: neither stroke ever completes a revolution, and the pair is symmetric, so there is no
 * direction of travel to mistake for one.
 *
 * It is here because thread that is not under tension *lies* — it crosses itself — and that is a
 * picture of two things at once with no vocabulary to learn. The tips taper toward the far end,
 * so the crossing thickens as it moves inward.
 *
 *   idle      parallel and aligned, dim. Two threads lying flat.
 *   sent      parallel and offset, sliding past each other without meeting.
 *   working   scissoring through each other, 1500ms, the crossing point travelling.
 *   parked    a hard symmetric X, still, in the accent.
 */
function Cross({ wire, still }: TakeProps) {
	const state = wire.state;
	const parked = state === "parked";
	const moving = wire.on && !parked && !still;
	const sent = state === "sent";
	const mid = (CROSS_BOX.h - CROSS_H) / 2;
	return (
		<Frame h={CROSS_BOX.h} tone={tone(state)}>
			{[1, -1].map((sign) => {
				let move: Move;
				if (parked) move = { animate: { rotate: sign * 21, y: 0, opacity: 1 }, transition: SETTLE };
				else if (state === "idle") move = { animate: { rotate: 0, y: sign * 2.4, opacity: 0.26 }, transition: SETTLE };
				else if (!moving)
					move = {
						animate: sent
							? { rotate: 0, y: sign * 2.8, opacity: 0.9 }
							: { rotate: sign * 11, y: sign * 1, opacity: 0.9 },
						transition: SETTLE,
					};
				else if (sent)
					move = {
						animate: { rotate: 0, y: [sign * 3.1, sign * 1.9, sign * 3.1], opacity: 0.9 },
						transition: {
							y: { duration: SENT_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
							default: SETTLE,
						},
					};
				else
					move = {
						animate: {
							rotate: [sign * 4, sign * 17, sign * 4],
							y: [sign * 2.2, 0, sign * 2.2],
							opacity: 0.92,
						},
						transition: {
							rotate: { duration: CROSS_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
							y: { duration: CROSS_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
							opacity: SETTLE,
						},
					};
				return (
					<Stroke
						key={sign}
						top={mid}
						height={CROSS_H}
						width={WISP_W}
						origin="center center"
						{...move}
					/>
				);
			})}
		</Frame>
	);
}

/* ---------- drift: the cascade's lean, and which way it leans ---------- */

const DRIFT_H = 1.5;
const DRIFT_GAP = 2;
export const DRIFT_BOX = { w: WISP_W, h: TAPER_4.length * DRIFT_H + (TAPER_4.length - 1) * DRIFT_GAP };
const DRIFT_MS = 1400;
/**
 * How far the deepest stroke shears, and it had to be raised.
 *
 * At 1.9px the four frozen swatches were nearly one picture: the mirror the take is built on was
 * real in the DOM and invisible on screen. 2.6px moves the bottom stroke across a third of the box
 * between the two leans, which is the least that reads. It is further than the logo's own drift and
 * that is the trade — a borrow nobody can see is not a borrow.
 */
const LEAN = 2.6;

/**
 * `drift` — the cascade shears, and the direction of the lean is the state.
 *
 * The logo's strands do not sit in a column: their boxes wander sideways as the shape descends,
 * and at 16px that drift is one of the two things about it a reader can still see. Four strokes
 * at the four sampled spans, each offset sideways in proportion to how far down it sits, so the
 * whole stack leans as one — a skein slipping rather than a wave passing.
 *
 * **The lean is a silhouette, which is the point.** Round four's `--spin` distinguished thinking
 * from working by direction and admitted that frozen, a direction is a lean rather than a shape.
 * Here the lean *is* the whole drawing, so frozen it is the entire silhouette that flips, and the
 * distinction survives the motion being turned off intact.
 *
 * The four strokes scale about their centres for `waist`'s reason: left-aligned, a stack of
 * different lengths reads as lines of text and the lean cannot be seen inside that.
 *
 *   idle      upright, tapered, dim.
 *   sent      leaning left and breathing there. Nothing has come back.
 *   working   leaning through upright from left to right and back, 1400ms.
 *   parked    upright, every stroke at full width, still, in the accent.
 */
function Drift({ wire, still }: TakeProps) {
	const state = wire.state;
	const parked = state === "parked";
	const moving = wire.on && !parked && !still;
	const sent = state === "sent";
	return (
		<Frame h={DRIFT_BOX.h} tone={tone(state)}>
			{TAPER_4.map((span, index) => {
				const depth = index / (TAPER_4.length - 1);
				const lean = (amount: number) => amount * depth;
				let move: Move;
				if (parked) move = { animate: { x: 0, scaleX: 1, opacity: 1 }, transition: SETTLE };
				else if (state === "idle") move = { animate: { x: 0, scaleX: span, opacity: 0.26 }, transition: SETTLE };
				else if (!moving)
					move = {
						animate: { x: lean(sent ? -LEAN * 1.3 : LEAN), scaleX: span, opacity: 0.9 },
						transition: SETTLE,
					};
				else if (sent)
					move = {
						animate: { x: [lean(-LEAN * 1.35), lean(-LEAN * 0.75), lean(-LEAN * 1.35)], scaleX: span, opacity: 0.9 },
						transition: {
							x: { duration: SENT_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
							default: SETTLE,
						},
					};
				else
					move = {
						animate: { x: [lean(-LEAN), lean(LEAN), lean(-LEAN)], scaleX: span, opacity: 0.92 },
						transition: {
							x: { duration: DRIFT_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
							default: SETTLE,
						},
					};
				return (
					<Stroke
						// biome-ignore lint/suspicious/noArrayIndexKey: the stroke's depth in the cascade is its identity
						key={index}
						top={index * (DRIFT_H + DRIFT_GAP)}
						height={DRIFT_H}
						width={WISP_W}
						origin="center center"
						{...move}
					/>
				);
			})}
		</Frame>
	);
}

/* ---------- hank: thread leaving one bundle for another ---------- */

const HANK_H = 1.6;
export const HANK_BOX = { w: WISP_W, h: 6 };
const HANK_MS = 1600;

/**
 * `hank` — two marks, and the thread moves from one to the other.
 *
 * Derived from the word rather than the shape. To spool is to wind thread off one thing and onto
 * another, and nothing about that requires a logo: two strokes, the top one anchored at its left
 * and the bottom one at its right, with what leaves the first arriving at the second. The total
 * is conserved while work is happening, so the pair is one quantity in two places rather than two
 * quantities, and the pair's own widths come off the sampled spans.
 *
 * **Two elements, and every state is still a different silhouette.** That is the thing to judge
 * it on. `nib` is smaller and its states are four lengths of one stroke, which is an amount;
 * this is barely larger and its states are top-heavy, balanced, bottom-heavy and solid, which
 * are four pictures. It is the cheapest drawing on the row that survives its own fallback.
 *
 *   idle      balanced, dim. The thread is halfway.
 *   sent      top-heavy and barely moving: it is all still on the first bundle.
 *   working   the thread crossing over and back, 1600ms.
 *   parked    both bundles full at once, still, in the accent. The conservation is broken, which
 *             is the honest picture of a thing that has stopped.
 */
function Hank({ wire, still }: TakeProps) {
	const state = wire.state;
	const parked = state === "parked";
	const moving = wire.on && !parked && !still;
	const sent = state === "sent";
	const share = (top: boolean, at: number) => Math.max(0.08, top ? at : 1 - at);
	return (
		<Frame h={HANK_BOX.h} tone={tone(state)}>
			{[true, false].map((top) => {
				let move: Move;
				if (parked) move = { animate: { scaleX: 1, opacity: 1 }, transition: SETTLE };
				else if (state === "idle") move = { animate: { scaleX: share(top, 0.5), opacity: 0.26 }, transition: SETTLE };
				else if (!moving)
					move = { animate: { scaleX: share(top, sent ? 0.93 : 0.28), opacity: 0.9 }, transition: SETTLE };
				else if (sent)
					move = {
						animate: { scaleX: [share(top, 0.94), share(top, 0.79), share(top, 0.94)], opacity: 0.9 },
						transition: {
							scaleX: { duration: SENT_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
							opacity: SETTLE,
						},
					};
				else
					move = {
						animate: { scaleX: [share(top, 0.86), share(top, 0.14), share(top, 0.86)], opacity: 0.92 },
						transition: {
							scaleX: { duration: HANK_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
							opacity: SETTLE,
						},
					};
				return (
					<Stroke
						key={top ? "off" : "on"}
						top={top ? 0.4 : HANK_BOX.h - HANK_H - 0.4}
						height={HANK_H}
						width={WISP_W}
						origin={top ? "left center" : "right center"}
						{...move}
					/>
				);
			})}
		</Frame>
	);
}

/* ---------- slit: the cascade as three slots, with light behind ---------- */

const SLIT_MS = 1400;
const BAND_WIDE = Math.round(WISP_W * 0.62);
const BAND_THIN = Math.round(WISP_W * 0.3);

/**
 * `slit` — the mark is three slots cut in the surface, and light passes behind them.
 *
 * The brief's own suggestion: round four's `--aperture` was the one mechanism worth trying at
 * 16px, because the ribbon is not the moving object at all. The three slots are a `mask-image`
 * painted once from the sampled spans; what moves is one element carrying one static gradient,
 * translated. There is no gradient paint to animate, so nothing here can freeze mid-sweep the way
 * `agent-say-arrive`'s `edge` did when the wire paused, and it is two DOM nodes at any size.
 *
 * **The taper does the rhythm for free**, which is the reason to keep it: a band crossing left to
 * right spends the full width of slot 0 and 40% of it on slot 1, so the pass dwells on the wide
 * slots and flicks past the waist without a single number saying it should.
 *
 * **And it is the take that loses the fallback, drawn so the loss is on the canvas.** Freeze it
 * and `sent` and `working` are a narrow bright patch and a wide one at the same place: an amount,
 * not a shape. It distinguishes four states while the motion runs and two when it does not, which
 * is exactly what `count` beat in round four.
 */
function Slit({ wire, still }: TakeProps) {
	const state = wire.state;
	const parked = state === "parked";
	const moving = wire.on && !parked && !still;
	const sent = state === "sent";
	const band = sent ? BAND_THIN : BAND_WIDE;
	return (
		<span
			className={cn(
				"relative block shrink-0 overflow-hidden transition-colors duration-300",
				parked ? "text-thread" : "text-text",
			)}
			style={{
				width: SLIT_BOX.w,
				height: SLIT_BOX.h,
				maskImage: SLIT_MASK,
				WebkitMaskImage: SLIT_MASK,
				maskSize: "contain",
				WebkitMaskSize: "contain",
				maskRepeat: "no-repeat",
				WebkitMaskRepeat: "no-repeat",
				maskPosition: "center",
				WebkitMaskPosition: "center",
			}}
		>
			<motion.span
				className="absolute inset-0 block bg-current"
				initial={false}
				animate={{ opacity: parked ? 1 : wire.on ? 0.26 : 0.24 }}
				transition={SETTLE}
			/>
			<motion.span
				className="absolute inset-y-0 left-0 block bg-gradient-to-r from-transparent via-current to-transparent"
				style={{ width: band }}
				initial={false}
				animate={
					moving
						? { x: [-band, SLIT_BOX.w], opacity: 1 }
						: { x: wire.on && !parked ? Math.round(SLIT_BOX.w * 0.32) : -band, opacity: wire.on && !parked ? 1 : 0 }
				}
				transition={moving ? { duration: SLIT_MS / 1000, repeat: FOREVER, ease: "linear" } : SETTLE}
			/>
		</span>
	);
}

/* ---------- nib: one tapered stroke, and nothing else ---------- */

const NIB_H = 2.2;
export const NIB_BOX = { w: WISP_W, h: 3 };
const NIB_MS = 1500;

/**
 * `nib` — one stroke, one property, the fewest marks that can still taper.
 *
 * The aggressively minimal end of the row, and it exists because the complaint is bulk and
 * somebody has to draw the floor. One tapered wedge, 16 by 2.2, anchored at its root, and the
 * only thing that ever happens is how far the thread is paid out. One DOM node, zero writes,
 * three square pixels of box past the stroke itself.
 *
 * **It fails the fallback on purpose and the frame says so.** Its four states are four lengths,
 * which is an amount rather than a shape, so frozen, `idle` at 0.5 and `working` parked at 0.72
 * are very nearly the same picture at two strengths — the exact collapse `--count` was built to
 * beat. What it buys is that at 16 by 3 there is nothing left to object to, and it is the
 * measurement of how much of "spool" survives having only the taper: honestly, not much. It is
 * a wedge. Judge whether a wedge above a composer says anything at all.
 */
function Nib({ wire, still }: TakeProps) {
	const state = wire.state;
	const parked = state === "parked";
	const moving = wire.on && !parked && !still;
	const sent = state === "sent";
	let move: Move;
	if (parked) move = { animate: { scaleX: 1, opacity: 1 }, transition: SETTLE };
	else if (state === "idle") move = { animate: { scaleX: 0.5, opacity: 0.26 }, transition: SETTLE };
	else if (!moving) move = { animate: { scaleX: sent ? 0.16 : 0.72, opacity: 0.9 }, transition: SETTLE };
	else if (sent)
		move = {
			animate: { scaleX: [0.14, 0.27, 0.14], opacity: 0.9 },
			transition: {
				scaleX: { duration: SENT_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
				opacity: SETTLE,
			},
		};
	else
		move = {
			animate: { scaleX: [0.3, 1, 0.3], opacity: 0.92 },
			transition: {
				scaleX: { duration: NIB_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
				opacity: SETTLE,
			},
		};
	return (
		<Frame h={NIB_BOX.h} tone={tone(state)}>
			<Stroke top={(NIB_BOX.h - NIB_H) / 2} height={NIB_H} width={WISP_W} {...move} />
		</Frame>
	);
}

/* ---------- the row's own numbers ---------- */

export interface Shape {
	/** the box as authored, which the frame then measures rather than trusts */
	readonly box: { readonly w: number; readonly h: number };
	/** how many elements the mark is */
	readonly nodes: number;
	/** square pixels of accent at `parked`, computed off the geometry rather than rastered */
	readonly accent: number;
}

/** a tapered stroke's own area: full height at the root, 40% of it at the tip */
function wedgeArea(width: number, height: number): number {
	return width * height * 0.7;
}

export const SHAPES: Record<WispTake, Shape> = {
	waist: { box: WAIST_BOX, nodes: WAIST_N, accent: Math.round(WAIST_N * wedgeArea(WISP_W, WAIST_H)) },
	reel: {
		box: REEL_BOX,
		nodes: 1 + REEL_RUNS.length,
		accent: Math.round(CORE_W * REEL_BOX.h + REEL_RUNS.reduce((sum, run) => sum + wedgeArea(run, REEL_H), 0)),
	},
	cross: { box: CROSS_BOX, nodes: 2, accent: Math.round(2 * wedgeArea(WISP_W, CROSS_H)) },
	drift: { box: DRIFT_BOX, nodes: TAPER_4.length, accent: Math.round(TAPER_4.length * wedgeArea(WISP_W, DRIFT_H)) },
	hank: { box: HANK_BOX, nodes: 2, accent: Math.round(2 * wedgeArea(WISP_W, HANK_H)) },
	slit: { box: SLIT_BOX, nodes: 2, accent: SLIT_AREA },
	nib: { box: NIB_BOX, nodes: 1, accent: Math.round(wedgeArea(WISP_W, NIB_H)) },
};

export function WispMark({ take, wire, still }: { take: WispTake } & TakeProps) {
	if (take === "waist") return <Waist wire={wire} still={still} />;
	if (take === "reel") return <Reel wire={wire} still={still} />;
	if (take === "cross") return <Cross wire={wire} still={still} />;
	if (take === "drift") return <Drift wire={wire} still={still} />;
	if (take === "hank") return <Hank wire={wire} still={still} />;
	if (take === "slit") return <Slit wire={wire} still={still} />;
	return <Nib wire={wire} still={still} />;
}
