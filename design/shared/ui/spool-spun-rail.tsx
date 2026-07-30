import { type MotionValue, motion, useAnimationFrame, useMotionValue, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { type Slot, useSlot } from "../lib/alive-slot";
import { useShift } from "../lib/edge-shift";
import {
	EDGE_ASK,
	EDGE_CHIP,
	PARK_MS,
	SPUN_SCRIPT,
	type Spun,
	type SpunState,
	THOUGHT_MS,
	TTFT_MEASURED,
	passMs,
	spunLog,
} from "../lib/spun-script";
import { type PlayEntry, useTicker, useTurn } from "../lib/turn-play";
import { cn } from "../lib/utils";
import { useChurn } from "../lib/wait-churn";
import { ChevronIcon } from "./spool-icons";
import { StateMark } from "./spool-play-rail";
import { Caret, Said } from "./spool-say";

/**
 * Round four, one half of it: the line, the edge and the drawn stroke.
 *
 * Round three drew ten marks in a 36px slot above the composer and Liam kept one thing
 * out of it:
 *
 *   > "the rule was a bit interesting as well but i dont know, feel like we should
 *    explore this further and make something really cool."
 *
 * `agent-alive--rule` is a 44px gradient segment travelling the composer's 1px border. It
 * was the only take on that row costing **zero transcript pixels**, and its two problems
 * were named on its own frame: 420px of peripheral motion is the largest moving thing in
 * the rail, and a segment on a track is the indeterminate progress bar.
 *
 * **Why a line at all, which is the argument this half is built on and no frame has made.**
 * spool means winding thread. This product calls its conversations threads. `say-pace.ts`
 * already paces the words by the wire's own backlog. A moving stroke is closer to spool's
 * identity than a spinner is, and it gets there **without spending the logo** — which is
 * the thing `agent-wait--mark` was rightly killed for and the thing the other half of this
 * round is testing from the mark's own side.
 *
 * **What separates these six from `rule` re-timed.** Three things, and each of them is a
 * property a segment on a track does not have:
 *
 *   *A stroke has ends.* Every take here is a solid stroke with two ends rather than a
 *   gradient with none. A gradient reads as light moving along a track — the track is the
 *   object and the light is passing over it. A stroke with ends reads as a thread with a
 *   beginning, which is the thing being drawn.
 *
 *   *Two ends move independently.* One `translateX` plus one `scaleX` on one element is a
 *   single composited transform matrix, and it gives an arbitrary segment `[tail, head]`.
 *   So a thread can be **laid down** and **taken up** rather than only carried, at no cost
 *   over `rule`'s single transform.
 *
 *   *The line is already on screen.* Every take replaces the composer's own `border-t`
 *   with a 1px span of exactly `--color-border` and draws over it. At rest all six are
 *   pixel-identical to the rail as it ships, and the transcript gives up **0px** — which
 *   was `rule`'s one uncontested win and is now the floor rather than the exception.
 *
 * **The state question, which every take answers on its own line.** Spool can tell five
 * things apart off the wire (`spun-script.ts` has the receipts) and the frames print what
 * each take does with each of them, with the live one lit as the turn plays. Nobody has to
 * take a claim on trust: the table is a readout.
 *
 * **The one distinction worth a shape of its own is `asking`**, because it is the only
 * state that is a call to act. Four of the six takes converge on the same answer without
 * being made to — **the line breaks** — and that was not planned. A break is static, which
 * is correct for a thing that has stopped; it is 18px wide, which is cheaper than any
 * motion; nothing else in this rail is a discontinuous line, so it collides with nothing;
 * and it survives `prefers-reduced-motion` unchanged, because there was never any motion
 * in it. It is also the plainest possible reading of a thread: it stops at you.
 *
 * **Nothing here blinks** (#149: thirteen surfaces read at source, zero blink), nothing
 * animates a gradient's paint (#149: `blur` and `soften` will not composite and `edge`
 * freezes mid-sweep when the wire pauses), and every take draws a `prefers-reduced-motion`
 * state that is the take itself frozen rather than a sentence about it.
 */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;
/** clear of the header's 48px fade, so an anchored first line is not dimmed by it */
const TOP_INSET = 10;
/** the composer's own resting height */
const FIELD_H = 54;
/** how long the rail sits still between turns, so both states are legible */
const REST_MS = 2400;
/** the first send fires on boot: a still of this frame should catch the rail at work */
const OPEN_MS = 50;
/** the composer's own padding: 391px of box inside the shipped 420 rail (#184) */
const CHROME = 29;
/** the band the edge layer owns, which is the composer's own padding and not the log's */
const EDGE_H = 14;

export type SpunTake = "wind" | "slack" | "hair" | "pass" | "wound" | "tell";

/* ---------- the arithmetic every stroke shares ---------- */

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** smoothstep, so a stroke starts and stops without a corner in its speed */
function smooth(u: number): number {
	const c = clamp01(u);
	return c * c * (3 - 2 * c);
}

/**
 * A solid stroke, positioned by one composited matrix.
 *
 * The element is the full width of the track and never changes size: `x` is the tail and
 * `scaleX` about a left origin is the length. `transform: translateX(t) scaleX(s)` is one
 * matrix, so a segment with two independently moving ends costs exactly what `rule`'s
 * single travelling segment costs, and the slot meter reads zero writes for both.
 */
function Solid({
	x,
	scaleX,
	className,
}: {
	x: MotionValue<number>;
	scaleX: MotionValue<number>;
	className?: string | undefined;
}) {
	return (
		<motion.span
			className={cn("absolute top-0 left-0 block h-px w-full origin-left rounded-full bg-text/75", className)}
			style={{ x, scaleX }}
		/>
	);
}

/** the 18px break, which is four of six takes' answer to `asking` */
function Break({ shown, tone }: { shown: boolean; tone: string }) {
	return (
		<motion.span
			className={cn("absolute top-0 left-1/2 block h-px w-[18px] -translate-x-1/2", tone)}
			initial={false}
			animate={{ opacity: shown ? 1 : 0 }}
			transition={{ duration: 0.22, ease: "linear" }}
		/>
	);
}

/* ---------- wind ---------- */

/** one lay-and-take-up, against a wait's measured 878ms floor */
const WIND_MS = 1600;
/** the fraction of the cycle the head takes to cross, and how far behind the tail starts */
const WIND_LAY = 0.78;
const WIND_LAG = 0.22;

/** where the two ends are at a phase, as fractions of the track */
function windAt(phase: number): { readonly tail: number; readonly head: number } {
	return { head: smooth(phase / WIND_LAY), tail: smooth((phase - WIND_LAG) / WIND_LAY) };
}

/**
 * `wind` — the thread is drawn out of the left edge and reeled off the right.
 *
 * The development of `rule` the brief asked for, and the difference is that **the two ends
 * are not tied together**. The head leaves the left edge first and the tail follows a fifth
 * of a cycle later, so the stroke lengthens as it is laid down, carries at its full 172px,
 * and is taken up into the right edge as the head sits there waiting for the tail. A
 * segment on a track has one length and travels; this one has a *beginning* at a place.
 *
 * **It cannot be read as a progress bar for a measurable reason.** The stroke reaches at
 * most 41% of the track (`windAt` peaks at 0.41), so there is no state of it that is full,
 * and its length is falling for the second half of the cycle — a bar that empties on the way
 * to completion is not the idiom. Its reset is genuinely invisible rather than hidden
 * off-screen the way `rule`'s is: at phase 0 and phase 1 the length is **0**, so there is
 * nothing on screen at the moment it starts over.
 *
 * **What it does about state: two.** Working and idle, and it argues that is right for a
 * stroke that travels — a reader watching the left edge learns nothing from the difference
 * between a request being out and a `read` being open, because in both cases the answer to
 * *is it working* is yes and the answer to *do I need to do anything* is no. `asking` is not
 * one of the two: the stroke stops mid-pass and the line breaks under it, which is a
 * different kind of picture rather than the same picture slower.
 */
function Wind({ track, spun, still }: { track: number; spun: Spun; still: boolean }) {
	const x = useMotionValue(0);
	const scaleX = useMotionValue(0);
	const phase = useRef(0);
	const going = useRef(false);
	const on = spun.out || spun.state === "thinking" || spun.state === "saying";

	useAnimationFrame((_time: number, delta: number) => {
		if (still || track <= 0) return;
		// a backgrounded tab hands back one enormous delta; clamping it stops the stroke
		// teleporting through the end of its own pass
		const step = Math.min(delta, 50);
		if (spun.parked) {
			// stopped where it was: a turn waiting on a person has not moved on
			return;
		}
		if (on) going.current = true;
		if (!going.current) return;
		let next = phase.current + step / WIND_MS;
		if (next >= 1) {
			next -= 1;
			if (!on) {
				going.current = false;
				next = 0;
			}
		}
		phase.current = next;
		const at = windAt(next);
		x.set(at.tail * track);
		scaleX.set(Math.max(0, at.head - at.tail));
	});

	useEffect(() => {
		if (!still) return;
		const at = windAt(0.34);
		x.set(at.tail * track);
		scaleX.set(Math.max(0, at.head - at.tail));
	}, [still, track, x, scaleX]);

	return (
		<>
			<span className="absolute inset-x-0 top-0 block h-px bg-border" />
			<Solid x={x} scaleX={scaleX} />
			<Break shown={spun.parked} tone="bg-bg" />
		</>
	);
}

/* ---------- slack ---------- */

/** the deepest the thread bows, in px, at a backlog of three or more */
const SAG = 8;
/** the backlog at which the bow is full */
const SAG_FULL = 3;
/** how fast the bow eases toward the load it is carrying, per ms */
const SAG_EASE = 1 / 260;
/** how many points the curve is sampled at: enough that no facet is visible at 1px */
const SAG_STEPS = 40;

/** a raised cosine: zero and flat at both ends, so it joins the hairline without a corner */
function sagPath(track: number, depth: number): string {
	if (track <= 0) return "M0 0.5 L0 0.5";
	const points: string[] = [`M0 0.5`];
	for (let step = 1; step <= SAG_STEPS; step += 1) {
		const u = step / SAG_STEPS;
		const y = 0.5 + (depth / 2) * (1 - Math.cos(2 * Math.PI * u));
		points.push(`L${(u * track).toFixed(2)} ${y.toFixed(2)}`);
	}
	return points.join(" ");
}

/**
 * `slack` — the thread has weight, so it bows under what it is carrying.
 *
 * The most literal reading of the identity in the round and the one nobody had drawn. At
 * rest the line is dead straight and **is** the composer's border. When the wire has work
 * away from it the line sags, and the depth is the backlog: one request out is a shallow
 * bow, a request and two open calls is the full 8px. When the work lands it comes back up.
 *
 * **Its motion budget is 8px, vertical, about ten times a turn** — against `wind`'s 420px
 * of lateral travel every 1.6 seconds. That is the whole proposition: a loaded thread does
 * not need to move to say it is loaded, it needs to be *bent*, and a shape held is far
 * cheaper at the edge of the eye than a shape travelling. The bow eases over 260ms on every
 * change, so what a reader catches out of the corner of their eye is the *transition* — the
 * line dipping when a request goes up and lifting when it lands — which is a movement that
 * means something rather than a loop that means only that the loop is running.
 *
 * **It cannot imply progress at all**, and it is the only take here for which that is
 * unarguable: depth is not a length, there is no track to be some way along, and the
 * quantity it draws goes *up* as more work opens. Nothing about it points at an end.
 *
 * **What it does about state: four.** idle is flat, `out` is a shallow bow, `doing` deepens
 * with every open call, `thinking` holds one steady bow of its own depth, and `asking` cuts
 * the thread at the apex. `saying` is deliberately not one of them: while words are arriving
 * the backlog is the words, and the line lifts as they land.
 *
 * **The fallback is the take.** Under `prefers-reduced-motion` the bow is drawn at the same
 * depth and simply does not ease into it, so a reader who asked for stillness sees the same
 * picture everybody else sees. No other take here can say that, and #161's trap — a frozen
 * indicator landing on a meaning the rail already has — cannot be sprung, because nothing
 * else in this rail is a curve.
 *
 * **The honest cost.** The path is a 40-point polyline rewritten in place while the depth is
 * moving, which is a main-thread write rather than a composited transform. It is bounded: it
 * writes only while the depth changes, so a 3-second thought is **zero** writes and a whole
 * turn is around 250, against a per-frame transform take's ~800 style writes that
 * `alive-slot.ts` deliberately does not count.
 */
function Slack({ track, spun, still }: { track: number; spun: Spun; still: boolean }) {
	const path = useRef<SVGPathElement>(null);
	const depth = useRef(0);
	const drawn = useRef<number | null>(null);
	const want = spun.parked
		? SAG
		: spun.state === "thinking"
			? SAG * 0.55
			: spun.load > 0
				? SAG * Math.min(1, spun.load / SAG_FULL)
				: 0;

	const paint = (value: number) => {
		const node = path.current;
		if (node === null) return;
		const before = drawn.current;
		if (before !== null && Math.abs(before - value) < 0.04) return;
		drawn.current = value;
		node.setAttribute("d", sagPath(track, value));
	};

	useAnimationFrame((_time: number, delta: number) => {
		if (still) return;
		const step = Math.min(delta, 50);
		const gap = want - depth.current;
		if (Math.abs(gap) < 0.02) {
			depth.current = want;
			paint(want);
			return;
		}
		depth.current += gap * Math.min(1, step * SAG_EASE);
		paint(depth.current);
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: paint reads refs and is stable
	useEffect(() => {
		if (still) depth.current = want;
		paint(depth.current);
	}, [still, want, track]);

	return (
		<span className="absolute inset-x-0 top-0 block text-border" style={{ height: EDGE_H }}>
			<svg
				aria-hidden="true"
				className="absolute inset-0 block h-full w-full overflow-visible"
				viewBox={`0 0 ${Math.max(1, track)} ${EDGE_H}`}
				preserveAspectRatio="none"
			>
				<path
					ref={path}
					d={sagPath(track, 0)}
					fill="none"
					stroke="currentColor"
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<motion.span
				className="absolute left-1/2 block w-[18px] -translate-x-1/2 bg-bg"
				style={{ top: 0, height: EDGE_H }}
				initial={false}
				animate={{ opacity: spun.parked ? 1 : 0 }}
				transition={{ duration: 0.22, ease: "linear" }}
			/>
		</span>
	);
}

/* ---------- hair ---------- */

/** how far each half reaches, so the line is never uniformly lit */
const HAIR_REACH = 0.62;
const HAIR_MS = 1500;

/**
 * `hair` — the stroke is the boundary, so at rest there is nothing extra on screen at all.
 *
 * The zero-cost rest state, drawn literally. The composer's `border-t` is replaced by a 1px
 * span of exactly `--color-border`, and the take's own drawing is two strokes over it that
 * grow **out of the centre** and return. Nothing is added, nothing is reserved, and a still
 * of the rail at rest is byte-identical to the rail as it ships.
 *
 * **Out of the centre, which is what keeps it out of the progress idiom.** Every bar in
 * software fills from an end. Two strokes parting from the middle is a line being *pulled
 * taut from where it is held*, and neither half ever reaches its end: `HAIR_REACH` caps each
 * at 62%, so 260px of the 420 is the most that is ever lit and the resting hairline is
 * always visible past both of them.
 *
 * **What it does about state: two, and it is honest about why.** Working and idle. It has
 * one dimension to spend — how far the halves reach — and reach is the least readable of
 * the properties a line has at the edge of the eye, so spending it on the difference between
 * `thinking` and `doing` would be spending it on nothing. `asking` breaks the line at the
 * exact point the two strokes leave from, which is the one place a reader's eye is already
 * going.
 *
 * **The soft spot is the fallback**, and it is `rule`'s own: reduced motion draws both halves
 * held at full reach, which is a brighter border, and a brighter border is one step from a
 * focus ring — the only other reason a border in this rail changes strength. It is drawn on
 * the frame rather than argued about.
 */
function Hair({ spun, still }: { spun: Spun; still: boolean }) {
	const on = (spun.out || spun.state === "saying" || spun.state === "thinking") && !spun.parked;
	const moving = on && !still;
	const held = { scaleX: still && on ? HAIR_REACH : 0 };
	const swing = { scaleX: [0, HAIR_REACH, 0] };
	const beat = { duration: HAIR_MS / 1000, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" } as const;
	const settle = { duration: 0.3, ease: "easeOut" } as const;
	return (
		<>
			<span className="absolute inset-x-0 top-0 block h-px bg-border" />
			<motion.span
				className="absolute top-0 left-1/2 block h-px w-1/2 origin-left rounded-full bg-text/75"
				initial={false}
				animate={moving ? swing : held}
				transition={moving ? beat : settle}
			/>
			<motion.span
				className="absolute top-0 right-1/2 block h-px w-1/2 origin-right rounded-full bg-text/75"
				initial={false}
				animate={moving ? swing : held}
				transition={moving ? beat : settle}
			/>
			<Break shown={spun.parked} tone="bg-bg" />
		</>
	);
}

/* ---------- pass ---------- */

const PASS_LEN = 64;
const PASS_MS = 1400;
/** the gap the two strokes hold either side of the centre when the turn stops on a person */
const PASS_GAP = 18;

/**
 * `pass` — two strokes, and the direction is which way the wire is moving.
 *
 * One stroke runs left to right while something is **away from us**: a request up with
 * nothing back, or a tool call open. One runs right to left while something is **coming
 * back**: words arriving, or a result landing. They are the same stroke and they cross in the
 * middle, which is where the loom is in this — a shuttle passing one way and then the other
 * is what winding actually looks like, and it is the reason two strokes are not simply twice
 * the noise of one.
 *
 * **This is the take that spends direction on state, and no frame in three rounds has spent
 * anything but rate.** It gives a reader something no word does: which end of the wire the
 * turn is at. Nothing has to be learned for it to work — any stroke moving means working —
 * and a reader who does notice gets `out` and `back` for free, told apart by nothing but
 * which way the eye is pulled.
 *
 * **What it does about state: five.** `out` is one stroke rightward; `doing` is the same
 * stroke, faster, because more open calls is more away from us; `saying` is one stroke
 * leftward, which is the only take here that draws the return trip at all; `thinking` is
 * both strokes running, because a thinking block is the one state where the request is
 * answered and nothing is out there, and two strokes crossing is the honest picture of a
 * turn talking to itself. `asking` stops both nose to nose with 18px between them: the
 * thread has been carried to the middle from both ends and the join is yours to make.
 *
 * **Two costs, said plainly.** It is 840px of moving stroke against `wind`'s 420, the most
 * of any take on the top edge. And when both strokes run, the moment they overlap is a
 * single longer stroke, so the two-ness is legible only either side of the crossing.
 */
function Passer({
	track,
	want,
	rate,
	back,
	park,
	still,
	parked,
}: {
	track: number;
	want: boolean;
	rate: number;
	back: boolean;
	park: number;
	still: boolean;
	parked: boolean;
}) {
	const x = useMotionValue(-PASS_LEN);
	const scaleX = useMotionValue(track <= 0 ? 0 : PASS_LEN / track);
	const phase = useRef(0);
	const going = useRef(false);

	useAnimationFrame((_time: number, delta: number) => {
		if (still || track <= 0) return;
		scaleX.set(PASS_LEN / track);
		const step = Math.min(delta, 50);
		if (parked) {
			// eased rather than cut, so the two strokes arrive at the join instead of
			// appearing there: a stop is still a movement, it just has a destination
			const at = x.get();
			x.set(at + (park - at) * Math.min(1, step / 220));
			phase.current = 0;
			going.current = false;
			return;
		}
		if (want) going.current = true;
		if (!going.current) {
			x.set(back ? track : -PASS_LEN);
			return;
		}
		let next = phase.current + step / rate;
		if (next >= 1) {
			next -= 1;
			if (!want) {
				going.current = false;
				next = 0;
			}
		}
		phase.current = next;
		const span = track + PASS_LEN;
		x.set(back ? track - next * span : -PASS_LEN + next * span);
	});

	useEffect(() => {
		if (!still || track <= 0) return;
		scaleX.set(PASS_LEN / track);
		// far enough apart that the two are two even on the 132px fallback track, where a
		// 64px stroke is half the width and the first pair of positions read as one long one
		x.set(parked ? park : back ? track * 0.62 : track * 0.04);
	}, [still, track, parked, park, back, x, scaleX]);

	return <Solid x={x} scaleX={scaleX} />;
}

function Pass({ track, spun, still }: { track: number; spun: Spun; still: boolean }) {
	const rate = spun.state === "doing" ? passMs(spun.load) : PASS_MS;
	const thinking = spun.state === "thinking";
	return (
		<>
			<span className="absolute inset-x-0 top-0 block h-px bg-border" />
			<Passer
				track={track}
				want={(spun.out || thinking) && !spun.parked}
				rate={rate}
				back={false}
				park={track / 2 - PASS_GAP / 2 - PASS_LEN}
				still={still}
				parked={spun.parked}
			/>
			<Passer
				track={track}
				want={(spun.back || thinking) && !spun.parked}
				rate={PASS_MS}
				back
				park={track / 2 + PASS_GAP / 2}
				still={still}
				parked={spun.parked}
			/>
		</>
	);
}

/* ---------- wound ---------- */

/** how fast the thread travels the field's perimeter, px per ms */
const WOUND_SPEED = 0.3;
const WOUND_SEG = 64;
const WOUND_R = 7.5;

/** the field's own rounded rectangle, as a path, so `pathOffset` has something to travel */
function fieldPath(w: number, h: number): string {
	const r = Math.min(WOUND_R, Math.min(w, h) / 2);
	const right = w - 0.5;
	const bottom = h - 0.5;
	return [
		`M${0.5 + r} 0.5`,
		`H${right - r}`,
		`A${r} ${r} 0 0 1 ${right} ${0.5 + r}`,
		`V${bottom - r}`,
		`A${r} ${r} 0 0 1 ${right - r} ${bottom}`,
		`H${0.5 + r}`,
		`A${r} ${r} 0 0 1 0.5 ${bottom - r}`,
		`V${0.5 + r}`,
		`A${r} ${r} 0 0 1 ${0.5 + r} 0.5`,
		"Z",
	].join(" ");
}

function perimeter(w: number, h: number): number {
	if (w <= 2 || h <= 2) return 0;
	const r = Math.min(WOUND_R, Math.min(w, h) / 2);
	return 2 * (w - 1 - 2 * r) + 2 * (h - 1 - 2 * r) + 2 * Math.PI * r;
}

/**
 * `wound` — the composer is the spool, and the thread winds around it.
 *
 * The one take that leaves the top edge, and it is here to be measured against the ones that
 * do not. The field the human types in is a box with a border; a thread travelling that
 * border on a closed loop is the plainest possible drawing of winding onto a spool, and it
 * puts the motion around the thing the eye is already resting on rather than at the boundary
 * above it.
 *
 * **A closed path cannot be a percentage**, which is `agent-alive--orbit`'s argument and the
 * strongest answer to the progress problem anywhere in this round: there is no end of the
 * track to arrive at, because the track returns. Its 3.3-second lap also stops mattering for
 * the same reason — nothing is incomplete when there is nothing to complete, so the measured
 * 878ms floor on a wait costs it nothing where it killed `--breathe`'s 2,400ms.
 *
 * **What it costs, and this is the number the brief asked for.** The field's perimeter is
 * about 1,000px against the top edge's 420: **2.4× the peripheral motion for the same one bit
 * of information**, and it is drawn around the composer rather than above it, so it is inside
 * the region a reader is looking at while typing rather than at the edge of it. It is also
 * the only take here that is not compositor work — a segment on a closed path is
 * `stroke-dashoffset`, which Chromium runs on the main thread.
 *
 * **And it is one step from a widget everybody has seen.** A soft beam travelling a rounded
 * rectangle is the border-beam every AI product shipped in 2025. What keeps this one out of
 * that is that it is a hard-ended 1px stroke in the border's own colour range rather than a
 * glowing gradient, and that it is off at rest. Whether that is enough is exactly what the
 * frame is for.
 *
 * **What it does about state: three.** Working, idle, and a break in the field's own border
 * at the top centre for `asking`. It cannot tell `out` from `doing` from `saying` without
 * either changing speed, which on a closed loop reads as a different animation rather than a
 * different state, or lighting a second segment, which on a box with four corners is a
 * pattern rather than a line.
 */
function Wound({ box, spun, still }: { box: { readonly w: number; readonly h: number }; spun: Spun; still: boolean }) {
	const on = (spun.out || spun.state === "saying" || spun.state === "thinking") && !spun.parked;
	const total = perimeter(box.w, box.h);
	const offset = useMotionValue(0);
	const opacity = useMotionValue(0);
	const at = useRef(0);

	/**
	 * The dash is driven here rather than through motion's `pathOffset`, for one reason worth
	 * writing down: `pathOffset` normalises against the element's own `getTotalLength()`, so the
	 * segment's length would be a fraction of a perimeter that changes with the rail's width. A
	 * 64px stroke has to stay 64px at every rail width in the 200–480 range, which means owning
	 * the dash array in px.
	 */
	useAnimationFrame((_time: number, delta: number) => {
		if (total <= 0) return;
		const step = Math.min(delta, 50);
		if (still) {
			offset.set(-total * 0.08);
			opacity.set(on ? 1 : 0);
			return;
		}
		const want = on ? 1 : 0;
		opacity.set(opacity.get() + (want - opacity.get()) * Math.min(1, step / 300));
		if (opacity.get() < 0.01 && !on) return;
		at.current = (at.current + step * WOUND_SPEED) % total;
		offset.set(-at.current);
	});

	return (
		<>
			<svg
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 block h-full w-full text-text/75"
				width={box.w}
				height={box.h}
			>
				<motion.path
					d={fieldPath(box.w, box.h)}
					fill="none"
					stroke="currentColor"
					strokeWidth={1}
					strokeLinecap="butt"
					strokeDasharray={`${WOUND_SEG} ${Math.max(1, total - WOUND_SEG)}`}
					style={{ strokeDashoffset: offset, opacity }}
				/>
			</svg>
			{/* -1px rather than 0, because an absolutely positioned child is placed against its
			    containing block's *padding* box: at top-0 the cut sat one pixel under the border it
			    is meant to break, and the border read as unbroken. */}
			<motion.span
				className="absolute left-1/2 block h-px w-[18px] -translate-x-1/2 bg-surface"
				style={{ top: -1 }}
				initial={false}
				animate={{ opacity: spun.parked ? 1 : 0 }}
				transition={{ duration: 0.22, ease: "linear" }}
			/>
		</>
	);
}

/* ---------- tell ---------- */

const TELL_LEN = 90;
const TELL_OUT_MS = 1100;
const TELL_THINK = 130;

/**
 * `tell` — one line, and it does a different thing for each state. While words arrive it
 * does nothing at all.
 *
 * The take built the other way round from the rest: instead of one motion asked to cover
 * every state, each state gets the motion that is true about it.
 *
 *   `out`       one stroke crosses, left to right, once per 1.1 seconds. A request is a
 *               thing sent, so it is drawn as a thing travelling. The measured floor of
 *               878ms is very nearly one crossing, which is the only timing in this round
 *               that was chosen by the data rather than checked against it.
 *   `thinking`  the stroke stops travelling and breathes its length in place at the centre.
 *               Thought is not transport, and a thinking block is the one thing on the wire
 *               with a clock and a token count and **no text** (346 blocks, all empty), so a
 *               mark is the only thing that can carry it at all.
 *   `doing`     the stroke travels again, at `passMs(load)` — the rate is the backlog, on
 *               `say-pace.ts`'s own shape rather than on a constant nobody chose.
 *   `saying`    nothing. The words are the indicator: they arrive at the backlog's rate with
 *               a word fading in at 170ms behind a static caret, which is a live edge already,
 *               and a second live thing 4px under it is spool saying the same fact twice.
 *   `asking`    the line breaks at the centre and holds.
 *
 * **All five, which is more than any other take here, and that is its own risk**: five
 * behaviours on one 1px line is a vocabulary nobody was taught, and three of them are a
 * reader's eye catching "a stroke, moving". What it is not is arbitrary — the fifth is a
 * break, the fourth is silence, and nothing about the set has to be learned before the rail
 * is useful.
 *
 * **It also draws the one thing this round can prove and no word can**: the gap between what
 * spool knows and what is worth saying. Round three found that the *word* `waiting` was
 * spool's own bookkeeping leaking into the rail. This take spends no words and still tells
 * `thinking` from `doing` from `needs you`.
 */
function Tell({ track, spun, still }: { track: number; spun: Spun; still: boolean }) {
	const x = useMotionValue(-TELL_LEN);
	const scaleX = useMotionValue(0);
	const phase = useRef(0);
	const going = useRef(false);
	const travelling = (spun.state === "out" || spun.state === "doing") && !spun.parked;
	const thinking = spun.state === "thinking" && !spun.parked;
	const rate = spun.state === "doing" ? passMs(spun.load) : TELL_OUT_MS;

	useAnimationFrame((_time: number, delta: number) => {
		if (still || track <= 0) return;
		scaleX.set(TELL_LEN / track);
		const step = Math.min(delta, 50);
		if (travelling) going.current = true;
		if (!going.current) {
			phase.current = 0;
			x.set(-TELL_LEN);
			return;
		}
		let next = phase.current + step / rate;
		if (next >= 1) {
			next -= 1;
			if (!travelling) {
				going.current = false;
				next = 0;
			}
		}
		phase.current = next;
		x.set(-TELL_LEN + next * (track + TELL_LEN));
	});

	useEffect(() => {
		if (!still || track <= 0) return;
		scaleX.set(TELL_LEN / track);
		x.set(track * 0.38);
	}, [still, track, x, scaleX]);

	return (
		<>
			<span className="absolute inset-x-0 top-0 block h-px bg-border" />
			<motion.span
				className="absolute inset-0 block"
				initial={false}
				animate={{
					opacity:
						travelling || (still && !spun.parked && (spun.state === "out" || spun.state === "doing")) ? 1 : 0,
				}}
				transition={{ duration: 0.18, ease: "linear" }}
			>
				<Solid x={x} scaleX={scaleX} />
			</motion.span>
			<motion.span
				className="absolute top-0 left-1/2 block h-px origin-center rounded-full bg-text/75"
				style={{ width: TELL_THINK, marginLeft: -TELL_THINK / 2 }}
				initial={false}
				animate={
					thinking && !still
						? { opacity: 1, scaleX: [0.26, 1, 0.26] }
						: { opacity: thinking ? 1 : 0, scaleX: thinking ? 1 : 0.26 }
				}
				transition={
					thinking && !still
						? {
								opacity: { duration: 0.18, ease: "linear" },
								scaleX: { duration: 1.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
							}
						: { duration: 0.18, ease: "linear" }
				}
			/>
			<Break shown={spun.parked} tone="bg-bg" />
		</>
	);
}

/* ---------- what each take says about itself ---------- */

interface Spec {
	/** the stroke in one line */
	readonly kind: string;
	readonly cycle: string;
	readonly composited: string;
	/** px of stroke that moves, as a function of the measured track */
	readonly swept: (track: number, loop: number) => string;
	/** constraint four, answered rather than waved at */
	readonly progress: string;
	readonly reduced: string;
	readonly collides: string;
	/** what the line does in each of the five, and idle */
	readonly tells: readonly (readonly [SpunState, string])[];
	/** how many of the five it tells apart */
	readonly apart: number;
}

const SPECS: Record<SpunTake, Spec> = {
	wind: {
		kind: "two ends on one matrix: laid out of the left edge, taken up into the right",
		cycle: "1600ms · 0.41 of the track at its longest",
		composited: "yes. translateX and scaleX of one element",
		swept: (track) => `${track}px lateral, 0.26px/ms`,
		progress: "no state of it is full and its length falls for half the cycle. length 0 at both ends of the loop, so the reset is on screen and invisible",
		reduced: "one stroke, held a third of the way along, 172px",
		collides: "no. nothing else in the rail is a stroke on this edge",
		tells: [
			["idle", "the border, unchanged"],
			["out", "laying and taking up"],
			["thinking", "the same"],
			["saying", "the same"],
			["doing", "the same"],
			["asking", "stopped, and the line breaks"],
		],
		apart: 2,
	},
	slack: {
		kind: "a raised cosine over the whole line: depth is the backlog",
		cycle: "none. it eases 260ms per change, about ten times a turn",
		composited: "no. a 40-point path rewritten in place while the depth moves, zero writes while it is held",
		swept: () => "8px vertical, and nothing lateral",
		progress: "it cannot. depth is not a length, there is no track to be along, and the number goes up as more work opens",
		reduced: "the same bow at the same depth. the fallback is the take",
		collides: "no. nothing else in this rail is a curve",
		tells: [
			["idle", "dead straight: it is the border"],
			["out", "a shallow bow, 2.7px"],
			["thinking", "one steady bow of its own, 4.4px"],
			["saying", "lifting as the words land"],
			["doing", "deeper per open call, to 8px"],
			["asking", "full bow, cut at the apex"],
		],
		apart: 4,
	},
	hair: {
		kind: "two strokes over the border span, parting from the centre and returning",
		cycle: "1500ms · 62% of each half at full reach",
		composited: "yes. scaleX of two elements, declarative",
		swept: (track) => `${Math.round(track * HAIR_REACH)}px lateral, both halves`,
		progress: "no bar parts from the middle, and neither half reaches its end: the hairline is visible past both of them at all times",
		reduced: "both halves held at full reach, which is a brighter border",
		collides: "a brighter border is one step from a focus ring, which is rule's own soft spot",
		tells: [
			["idle", "the border, unchanged"],
			["out", "parting and returning"],
			["thinking", "the same"],
			["saying", "the same"],
			["doing", "the same"],
			["asking", "the line breaks where they leave from"],
		],
		apart: 2,
	},
	pass: {
		kind: "two strokes: rightward while something is out, leftward while something comes back",
		cycle: "1400ms a pass, 620–900ms while calls are open",
		composited: "yes. translateX of two elements",
		swept: (track) => `${track * 2}px lateral, 2× the top edge`,
		progress: "two strokes in opposite directions, each leaving the box at the far end. nothing accumulates and nothing arrives",
		reduced: "two strokes parked at 4% and 62%, which is a pair rather than a position",
		collides: "no, but the two overlap at the crossing and read as one longer stroke",
		tells: [
			["idle", "the border, unchanged"],
			["out", "one stroke, rightward"],
			["thinking", "both, crossing: answered, and nothing is out there"],
			["saying", "one stroke, leftward"],
			["doing", "rightward at the backlog's rate"],
			["asking", "both stopped nose to nose, 18px apart"],
		],
		apart: 5,
	},
	wound: {
		kind: "a 64px segment on the composer field's own closed border",
		cycle: "3.3s a lap, and a lap has no end to complete",
		composited: "no. stroke-dashoffset, which Chromium runs on the main thread",
		swept: (_track, loop) => `${Math.round(loop)}px around the field, 2.4× the top edge`,
		progress: "a closed path returns, so there is no position along it that means nearly done",
		reduced: "the segment parked on the top-left corner",
		collides: "no, but a beam on a rounded rectangle is the border-beam every AI product shipped",
		tells: [
			["idle", "nothing at all: the field's own border"],
			["out", "winding"],
			["thinking", "the same"],
			["saying", "the same"],
			["doing", "the same"],
			["asking", "stopped, and the field's border breaks at the top"],
		],
		apart: 3,
	},
	tell: {
		kind: "one line doing a different thing per state, and nothing while words arrive",
		cycle: "1100ms a crossing, 620–900ms while calls are open, 1500ms breathing in place",
		composited: "yes. translateX and scaleX, cross-faded at 180ms on a state change",
		swept: (track) => `${track}px lateral, or 96px in place while thinking`,
		progress: "the crossing leaves the box at the right rather than filling to it, and the thinking stroke has no track at all",
		reduced: "one stroke held at 38% for out and doing, the full breathing stroke for thinking, nothing for saying",
		collides: "no. the one shape it holds still is the break, which is the only state that has stopped",
		tells: [
			["idle", "the border, unchanged"],
			["out", "one crossing, 1.1s: a request is a thing sent"],
			["thinking", "no travel. it breathes its length in place"],
			["saying", "nothing. the words are the live edge"],
			["doing", "crossing at the backlog's rate"],
			["asking", "the line breaks and holds"],
		],
		apart: 5,
	},
};

/* ---------- the edge, and the field ---------- */

function Edge({
	take,
	track,
	spun,
	still,
	hold,
}: {
	take: SpunTake;
	track: number;
	spun: Spun;
	still: boolean;
	hold?: RefObject<HTMLSpanElement | null> | undefined;
}) {
	return (
		<span
			ref={hold}
			data-wait-part="spun"
			className="pointer-events-none absolute inset-x-0 top-0 block overflow-hidden"
			style={{ height: EDGE_H }}
		>
			{take === "wind" ? <Wind track={track} spun={spun} still={still} /> : null}
			{take === "slack" ? <Slack track={track} spun={spun} still={still} /> : null}
			{take === "hair" ? <Hair spun={spun} still={still} /> : null}
			{take === "pass" ? <Pass track={track} spun={spun} still={still} /> : null}
			{take === "tell" ? <Tell track={track} spun={spun} still={still} /> : null}
			{take === "wound" ? <span className="absolute inset-x-0 top-0 block h-px bg-border" /> : null}
		</span>
	);
}

/* ---------- the transcript ---------- */

interface Item {
	readonly key: string;
	readonly tight: boolean;
	/** whether the entry gets taller after it mounts, which decides how it arrives */
	readonly grows: boolean;
	readonly node: ReactNode;
}

function gapBefore(previous: Item | undefined, item: Item): number {
	if (previous === undefined) return 0;
	return previous.tight && item.tight ? 6 : 14;
}

/**
 * An entry arriving, and one thing measured on the way here.
 *
 * The height animation is the rail's own and it is kept for a row, which is a fixed 26px and
 * never grows. It is **not** used for anything that grows after it mounts — the human's words,
 * a message, a question. Measured on this row: an entry that mounts empty animates its height
 * from 0 to the 0 it measured, and everything that arrives afterwards is clipped by its own
 * `overflow-hidden` wrapper for the rest of the turn. The question was invisible for its whole
 * 2.6-second park because of it, options and all. So a growing entry arrives on opacity and y
 * only, and its height is its own.
 */
function Arrive({ gap, grows, children }: { gap: number; grows: boolean; children: ReactNode }) {
	const still = useReducedMotion() === true;
	return (
		<motion.div
			className={cn("shrink-0", grows ? null : "overflow-hidden")}
			initial={still ? false : grows ? { opacity: 0 } : { height: 0, opacity: 0 }}
			animate={grows ? { opacity: 1 } : { height: "auto", opacity: 1 }}
			transition={
				still
					? { duration: 0 }
					: { height: { duration: 0.28, ease: ARRIVE }, opacity: { duration: 0.2, ease: "linear" } }
			}
		>
			<motion.div
				style={{ paddingTop: gap }}
				initial={still ? false : { y: 6 }}
				animate={{ y: 0 }}
				transition={still ? { duration: 0 } : { duration: 0.34, ease: ARRIVE }}
			>
				{children}
			</motion.div>
		</motion.div>
	);
}

/** the human's words, and the strip's own line under them (#196) */
function Asked({ text, context }: { text: string; context: string }) {
	return (
		<div className="relative flex flex-col gap-1.5 pl-3.5">
			<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
			<p className="whitespace-pre-wrap text-base text-text leading-base">{text}</p>
			<span className="truncate font-mono text-2xs text-muted/55 leading-3">{context}</span>
		</div>
	);
}

function Row({ entry }: { entry: Extract<PlayEntry, { kind: "line" }> }) {
	const still = useReducedMotion() === true;
	return (
		<div className="-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5">
			<StateMark state={entry.state} />
			{entry.verb === "" ? null : (
				<span
					className={cn("shrink-0 font-mono text-sm leading-4", entry.quiet === true ? "text-muted/70" : "text-muted")}
				>
					{entry.verb}
				</span>
			)}
			{entry.subject === undefined ? null : (
				<motion.span
					className={cn(
						"min-w-0 truncate font-mono text-sm leading-4",
						entry.quiet === true ? "text-muted/60 tabular-nums" : "text-text/85",
					)}
					initial={still ? false : { opacity: 0, x: -3 }}
					animate={{ opacity: 1, x: 0 }}
					transition={still ? { duration: 0 } : { duration: 0.3, ease: ARRIVE }}
				>
					{entry.subject}
				</motion.span>
			)}
		</div>
	);
}

/** the agent's words, at #149's arrival and #163's settle */
function Say({ entry }: { entry: Extract<PlayEntry, { kind: "prose" }> }) {
	const streaming = entry.shown.length < entry.full.length;
	return (
		<div className="text-base text-text/90 leading-base">
			<Said text={entry.shown} live={150} arrival="fade" caret={streaming ? <Caret /> : undefined} />
		</div>
	);
}

/**
 * The question in the log, at #197's shape: the agent's own words, its options and their
 * whole descriptions, and the composer live beside them.
 *
 * It is here because the state it creates is the one the brief says earns its own drawing.
 * Nothing about how it is drawn is this round's question — that was settled — so it is
 * `agent-play--ask-log`'s block and no more.
 */
function Ask({ entry }: { entry: Extract<PlayEntry, { kind: "ask" }> }) {
	const typing = entry.shown.length < entry.ask.question.length;
	return (
		<div className="flex flex-col gap-2">
			{/* the caret is #149's, and it is load-bearing here for a reason worth writing down:
			    a block that mounts with no content mounts at zero height, and `Arrive` animates
			    height from 0 to the 0 it measured — so everything that arrived afterwards was
			    clipped by its own wrapper, forever. A question types itself in over 800ms, so the
			    caret is both the right drawing and the thing that gives the block a height to
			    grow from. Every prose entry in this rail has been relying on the same accident. */}
			<p className="text-base text-text/90 leading-base">
				{entry.shown}
				{typing ? <Caret /> : null}
			</p>
			{entry.live
				? entry.ask.options.map((option) => (
						<div
							key={option.label}
							className={cn(
								"flex flex-col gap-1 rounded-sm border px-2.5 py-2",
								entry.state === "done" ? "border-border bg-transparent" : "border-border-raised bg-surface/60",
							)}
						>
							<span className="font-mono text-sm text-text leading-4">{option.label}</span>
							<span className="text-muted/70 text-sm leading-sm">{option.description}</span>
						</div>
					))
				: null}
		</div>
	);
}

function Transcript({
	entries,
	view,
}: {
	entries: readonly PlayEntry[];
	view: RefObject<HTMLDivElement | null>;
}) {
	const [follow, setFollow] = useState(true);

	const items: Item[] = [];
	for (const entry of entries) {
		if (entry.kind === "user")
			items.push({
				key: entry.key,
				tight: false,
				grows: true,
				node: <Asked text={entry.text} context={entry.context ?? ""} />,
			});
		else if (entry.kind === "prose")
			items.push({ key: entry.key, tight: false, grows: true, node: <Say entry={entry} /> });
		else if (entry.kind === "line")
			items.push({ key: entry.key, tight: true, grows: false, node: <Row entry={entry} /> });
		else if (entry.kind === "ask")
			items.push({ key: entry.key, tight: false, grows: true, node: <Ask entry={entry} /> });
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: the item list is what moves the end
	useEffect(() => {
		const box = view.current;
		if (box === null || !follow) return;
		const end = box.scrollHeight - box.clientHeight;
		const last = box.firstElementChild?.lastElementChild;
		if (!(last instanceof HTMLElement)) {
			box.scrollTop = end;
			return;
		}
		const top = box.scrollTop + (last.getBoundingClientRect().top - box.getBoundingClientRect().top) - TOP_INSET;
		box.scrollTop = Math.max(0, Math.min(top, end));
	}, [entries, follow]);

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<div
				ref={view}
				onScroll={(event) => {
					const box = event.currentTarget;
					setFollow(box.scrollHeight - box.scrollTop - box.clientHeight < 24);
				}}
				className="pages-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-6 pb-4"
			>
				<div className="mt-auto shrink-0">
					{items.map((item, index) => (
						<div key={item.key} data-edge-key={item.key}>
							<Arrive gap={gapBefore(items[index - 1], item)} grows={item.grows}>
								{item.node}
							</Arrive>
						</div>
					))}
				</div>
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
			<span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-bg" />
		</div>
	);
}

/* ---------- the box under it ---------- */

/**
 * The composer at #184's resolved shape, with one change every take here depends on: the
 * `border-t` is a 1px span of `--color-border` rather than a border property. A border cannot
 * be broken in the middle, cannot be bowed, and cannot have a stroke drawn over one part of
 * it, so the takes would each have had to add their own line beside the real one — which is
 * exactly the pixel this half is claiming not to spend. At rest the span is the border.
 */
function Composer({
	take,
	track,
	box,
	spun,
	still,
	running,
	hold,
	onTrack,
	onBox,
	onWanted,
	onStop,
}: {
	take: SpunTake;
	track: number;
	box: { readonly w: number; readonly h: number };
	spun: Spun;
	still: boolean;
	running: boolean;
	hold: RefObject<HTMLSpanElement | null>;
	onTrack: (px: number) => void;
	onBox: (size: { readonly w: number; readonly h: number }) => void;
	onWanted: (px: number) => void;
	onStop: () => void;
}) {
	const edge = useRef<HTMLDivElement>(null);
	const field = useRef<HTMLSpanElement>(null);
	const ghost = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const node = edge.current;
		if (node === null) return;
		const read = () => onTrack(Math.round(node.getBoundingClientRect().width));
		read();
		const watch = new ResizeObserver(read);
		watch.observe(node);
		return () => watch.disconnect();
	}, [onTrack]);

	useEffect(() => {
		const node = field.current;
		if (node === null) return;
		const read = () => {
			const rect = node.getBoundingClientRect();
			onBox({ w: Math.round(rect.width), h: Math.round(rect.height) });
		};
		read();
		const watch = new ResizeObserver(read);
		watch.observe(node);
		return () => watch.disconnect();
	}, [onBox]);

	useEffect(() => {
		const natural = ghost.current;
		if (natural === null) return;
		const read = () => onWanted(Math.round(natural.getBoundingClientRect().width));
		void document.fonts.ready.then(read);
		const watch = new ResizeObserver(read);
		watch.observe(natural);
		return () => watch.disconnect();
	}, [onWanted]);

	const row = (
		<>
			<span className="flex min-w-0 items-center gap-1 font-mono text-2xs text-muted/60 leading-3">
				<span className="min-w-0 truncate">Opus (1M context) · high</span>
				<ChevronIcon open={false} className="h-2 w-2 shrink-0" />
			</span>
			{running ? (
				<button
					type="button"
					onClick={onStop}
					className="ml-auto flex h-[18px] w-fit shrink-0 items-center gap-2 rounded-sm border border-border-raised bg-raised px-2 transition-colors duration-150 hover:border-muted/45"
				>
					<span className="h-2 w-2 shrink-0 rounded-[1px] bg-text" />
					<span className="font-mono text-2xs text-text leading-3">stop</span>
					<span className="font-mono text-2xs text-muted/60 leading-3">⎋</span>
				</button>
			) : null}
		</>
	);

	return (
		<div ref={edge} className="relative flex shrink-0 flex-col gap-2.5 p-3.5">
			<Edge take={take} track={track} spun={spun} still={still} hold={hold} />
			<span
				ref={field}
				className="relative flex min-h-0 flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5"
			>
				{take === "wound" ? <Wound box={box} spun={spun} still={still} /> : null}
				<span className="flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border border-border-raised bg-raised pr-2.5 pl-2">
					<span className="h-3 w-[2px] shrink-0 rounded-full bg-thread/55" />
					<span className="min-w-0 truncate font-mono text-xs text-text/85 leading-4">{EDGE_CHIP}</span>
				</span>
				<textarea
					rows={3}
					readOnly
					spellCheck={false}
					placeholder={spun.parked ? "enter answers" : "say what to change"}
					aria-label="say what to change"
					className="w-full resize-none bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
					style={{ height: FIELD_H }}
				/>
			</span>
			<div className="relative">
				<div className="flex h-[18px] items-center gap-2.5 overflow-hidden">{row}</div>
				<div
					ref={ghost}
					aria-hidden="true"
					className="pointer-events-none invisible absolute top-0 left-0 flex h-[18px] w-max items-center gap-2.5"
				>
					{row}
				</div>
			</div>
		</div>
	);
}

/* ---------- the panel ---------- */

function Meter({ label, value, hot }: { label: string; value: string; hot: boolean }) {
	return (
		<span className="flex shrink-0 items-baseline gap-1.5">
			<span className="text-muted/45">{label}</span>
			<span className={cn("tabular-nums", hot ? "text-thread" : "text-text")}>{value}</span>
		</span>
	);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-baseline gap-2 font-mono text-2xs leading-4">
			<span className="w-[74px] shrink-0 text-muted/45">{label}</span>
			<span className="min-w-0 flex-1 text-muted/70">{children}</span>
		</div>
	);
}

/**
 * What the take does in each state, with the live one lit.
 *
 * It is a readout rather than a switcher: nothing here is pressed and the rail above is not
 * altered by it. It exists because a claim about five states cannot be checked against a
 * frame that plays one of them at a time — the table names what to look for at the moment it
 * is on screen.
 */
function States({ take, spun }: { take: SpunTake; spun: Spun }) {
	const spec = SPECS[take];
	return (
		<div className="flex flex-col gap-1 border-border/60 border-t pt-2">
			<div className="flex items-baseline gap-2">
				<span className="font-mono text-2xs text-muted/45 leading-4">tells apart</span>
				<span className="font-mono text-2xs text-text leading-4 tabular-nums">{spec.apart} of 5</span>
			</div>
			{spec.tells.map(([state, what]) => {
				const live = spun.state === state;
				return (
					<div key={state} className="flex items-baseline gap-2 font-mono text-2xs leading-4">
						<span className={cn("w-[58px] shrink-0", live ? "text-thread" : "text-muted/45")}>{state}</span>
						<span className={cn("min-w-0 flex-1", live ? "text-text" : "text-muted/50")}>{what}</span>
					</div>
				);
			})}
		</div>
	);
}

/**
 * The reduced-motion state, drawn rather than described.
 *
 * The take itself with `still` forced true and a backlog of two, at a third of the real
 * track. #161 found the trap this answers: freezing an indicator can land exactly on a
 * meaning the rail already has, and no sentence can be trusted about that.
 */
function Fallback({ take }: { take: SpunTake }) {
	const track = 132;
	const spun: Spun = { state: "doing", load: 2, out: true, back: false, parked: false, since: 900 };
	return (
		<div className="flex items-center gap-3 border-border/60 border-t pt-2">
			<span className="relative block h-9 w-[132px] shrink-0 rounded-sm border border-border bg-bg">
				{take === "wound" ? (
					<span className="absolute inset-2 block">
						<Wound box={{ w: 116, h: 20 }} spun={spun} still />
					</span>
				) : (
					<span className="absolute inset-x-0 top-3 block">
						<Edge take={take} track={track} spun={spun} still />
					</span>
				)}
			</span>
			<p className="min-w-0 flex-1 font-mono text-2xs text-muted/60 leading-4">{SPECS[take].reduced}</p>
		</div>
	);
}

/* ---------- the frame ---------- */

export function SpunFrame({
	take,
	title,
	claim,
	notes,
}: {
	take: SpunTake;
	title: string;
	claim: string;
	notes: readonly string[];
}) {
	const spec = SPECS[take];
	const still = useReducedMotion() === true;
	const turn = useTurn(SPUN_SCRIPT.cues, SPUN_SCRIPT.hold);
	const elapsed = useTicker(turn.run, SPUN_SCRIPT.total, turn.waiting);
	/** the scrolling column, which is what movement is measured against */
	const view = useRef<HTMLDivElement>(null);
	/** the whole rail, which is what churn is counted over */
	const rail = useRef<HTMLDivElement>(null);
	/** the edge layer, which is whatever the take draws */
	const hold = useRef<HTMLSpanElement>(null);
	const [track, setTrack] = useState(0);
	const [box, setBox] = useState<{ readonly w: number; readonly h: number }>({ w: 0, h: 0 });
	const [wanted, setWanted] = useState<number | null>(null);
	const { entries, spun } = spunLog(SPUN_SCRIPT, turn, elapsed);
	const running = turn.phase === "playing";
	const shift = useShift(view, turn.run, running);
	const churn = useChurn(rail, turn.run, running);
	const slot: Slot = useSlot(hold, turn.run, running);

	/**
	 * Rest, run, park, run, rest, again.
	 *
	 * The park releases itself after 2.6s, which is the one thing on these frames that is a
	 * frame's convenience rather than a capture's fact: a real question waits as long as a
	 * person takes. It is here because a state nobody can see is a state nobody can judge,
	 * and because the frames have to loop.
	 */
	useEffect(() => {
		if (turn.waiting) {
			const timer = window.setTimeout(() => turn.resume(), PARK_MS);
			return () => window.clearTimeout(timer);
		}
		if (turn.phase === "playing") return;
		const idle = turn.phase === "idle";
		const timer = window.setTimeout(
			() => {
				if (idle) turn.send(EDGE_ASK);
				else turn.replay();
			},
			idle ? OPEN_MS : REST_MS,
		);
		return () => window.clearTimeout(timer);
	}, [turn.phase, turn.waiting, turn.send, turn.replay, turn.resume]);

	const share = churn.ofMs === 0 ? 0 : Math.round((churn.onMs / churn.ofMs) * 100);
	const inner = 420 - CHROME;
	const loop = perimeter(box.w, box.h);
	const rate = spun.state === "doing" ? `${Math.round(passMs(spun.load))}ms a pass · backlog ${spun.load}` : null;

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div ref={rail} className="flex min-h-0 flex-1 flex-col">
				<Transcript entries={entries} view={view} />
				<Composer
					take={take}
					track={track}
					box={box}
					spun={spun}
					still={still}
					running={running}
					hold={hold}
					onTrack={setTrack}
					onBox={setBox}
					onWanted={setWanted}
					onStop={turn.cut}
				/>
			</div>
			<div className="flex h-[740px] shrink-0 flex-col gap-2 border-border border-t bg-surface/40 px-3.5 py-3">
				<div className="flex items-baseline gap-2">
					<span className="shrink-0 font-mono text-2xs text-text leading-3">{title}</span>
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-3">
						{turn.waiting ? "parked" : running ? spun.state : "resting"}
					</span>
				</div>
				<p className="font-mono text-2xs text-muted/60 leading-4">{claim}</p>
				<div className="flex h-4 shrink-0 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="enters" value={String(churn.enters)} hot={churn.enters > 0} />
					<Meter label="leaves" value={String(churn.leaves)} hot={churn.leaves > 0} />
					<Meter label="on screen" value={`${share}%`} hot={false} />
					<Meter label="moved down" value={`${shift.worst}px`} hot={shift.worst > 0} />
				</div>
				<div className="flex h-4 shrink-0 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="writes" value={String(slot.writes)} hot={slot.writes > 40} />
					<Meter label="box" value={`${slot.widest}px`} hot={false} />
					<Meter label="widest step" value={`${slot.jump}px`} hot={slot.jumps > 4} />
					<Meter label="gives up" value="0px" hot={false} />
				</div>
				<div className="flex h-4 shrink-0 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="track" value={`${track}px`} hot={false} />
					<Meter label="field loop" value={`${Math.round(loop)}px`} hot={false} />
					<span className="shrink-0 text-muted/45">
						footer wants{" "}
						<span className={cn("tabular-nums", wanted !== null && wanted > inner ? "text-thread" : "text-text")}>
							{wanted === null ? "…" : wanted}
						</span>{" "}
						of {inner}
					</span>
				</div>
				<div className="flex flex-col gap-1 border-border/60 border-t pt-2">
					<Fact label="stroke">{spec.kind}</Fact>
					<Fact label="moves">{spec.swept(track, loop)}</Fact>
					<Fact label="cycle">{rate ?? spec.cycle}</Fact>
					<Fact label="compositor">{spec.composited}</Fact>
					<Fact label="progress">{spec.progress}</Fact>
					<Fact label="collision">{spec.collides}</Fact>
				</div>
				<States take={take} spun={spun} />
				<Fallback take={take} />
				<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
					{notes.map((note) => (
						<p key={note} className="font-mono text-2xs text-muted/45 leading-4">
							{note}
						</p>
					))}
					<p className="font-mono text-2xs text-muted/35 leading-4">
						carried: rule 420px · ttft {TTFT_MEASURED.min}/{TTFT_MEASURED.median}/{TTFT_MEASURED.max}ms · one
						thought {Math.round(THOUGHT_MS / 1000)}s, drawn over 3s · park releases at {PARK_MS}ms
					</p>
				</div>
			</div>
		</div>
	);
}
