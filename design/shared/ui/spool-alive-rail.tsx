import { motion, useAnimationFrame, useMotionValue, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { type Slot, useSlot } from "../lib/alive-slot";
import { useShift } from "../lib/edge-shift";
import { EDGE_ASK, EDGE_CHIP, EDGE_SCRIPT, TTFT_MEASURED, type EdgeWait, edgeLog } from "../lib/edge-wait-turn";
import { type PlayEntry, useTicker, useTurn } from "../lib/turn-play";
import { cn } from "../lib/utils";
import { useChurn } from "../lib/wait-churn";
import { ChevronIcon } from "./spool-icons";
import { StateMark } from "./spool-play-rail";
import { Caret, Said } from "./spool-say";

/**
 * Round three, and the question narrowed twice on its way here.
 *
 * Round one drew the beat five ways and measured four of them at a flat zero movement,
 * which settled nothing because the objection was never the pixels. Round two found what
 * the objection was — an object that is **made when a request goes out and unmade when the
 * answer lands** — and found the shape that answers it, already shipping in the two
 * surfaces closest to this one: always present, never mounting, changing only whether it
 * animates. Measured, every always-on take reads 0 enters, 0 leaves, 100% on screen and
 * 0px moved, against today's 4 and 4 per wait and 24 per turn.
 *
 * So the placement is settled and it is not re-argued here: fixed above the composer,
 * mounted before the first keystroke, still mounted after the last row. What is not
 * settled is what goes in it. Round two's two finalists were both the word `waiting` with
 * something happening to it, and `waiting` is rejected:
 *
 *   "but why 'waiting'? i like that its fixed above the composer like shimmer and line,
 *    but maybe some variations on mark being there? like some animations perhaps — fan out
 *    and explore cool kind of animations while its working, or kind of so you know its
 *    working."
 *
 * **Which reopens exactly one thing and closes another.** Round two argued `agent-wait--mark`
 * down on the grounds that no readable surface animates its own brand mark, and that stands:
 * nothing on this row is the spool ribbon. But that was an argument about a *logo*, never an
 * argument that a moving glyph cannot carry this state better than a word can, and this row
 * is that argument. Ten takes, one variable: the slot is identical in every frame and only
 * its occupant differs.
 *
 * **What the meters can and cannot decide now.** Churn is a gate: every take here is
 * always-present by construction, so all ten read 0/0/100% and the number ranks nothing.
 * Shift is the same — the slot is outside the scrolling column, so nothing any of these
 * takes does can move the log. The numbers that actually separate them are in
 * `alive-slot.ts`: what the moving thing costs in transcript pixels, how much its own box
 * changes width, and how many times it rewrites the DOM over one turn. Plus three
 * judgements printed rather than argued: the cycle length against the measured 878/1970/4043ms
 * a wait really lasts, whether the animation is compositor work, and what
 * `prefers-reduced-motion` draws — which is a real trap here, because #161 found that
 * freezing a spinner is pixel-identical to what reduced motion already renders for a
 * *working* row.
 *
 * **Monochrome, all of it.** `agent-wait--mark` turned the ribbon the brand's red while a
 * request was out. That was a defect and not a style choice: state in this rail is motion,
 * and the one accent belongs to the selection.
 *
 * **The frames rest, run and rest again on a loop**, because an always-present indicator is
 * half a design until you have watched what it does when nothing is happening — which is
 * 56% of a turn and nearly all of a rail's open life.
 */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;
/** clear of the header's 48px fade, so an anchored first line is not dimmed by it */
const TOP_INSET = 10;
/** the composer's own resting height */
const FIELD_H = 60;
/** how long the rail sits still between turns, so both states are legible */
const REST_MS = 2600;
/** the first send fires on boot: a still of this frame should catch the rail at work */
const OPEN_MS = 50;
/** the composer's own padding: 391px of box inside the shipped 420 rail (#184) */
const CHROME = 29;
/** the slot's own height, which is the transcript the takes that use it give up */
const SLOT_H = 36;

/**
 * Ten ideas about how a permanent thing shows it is working.
 *
 *   fold     a mark whose geometry changes and never rotates: three threads out of the
 *            ribbon's own silhouette, lengthening in a travelling wave.
 *   churn    a loom shuttle whose rate is the wire's backlog rather than a timer's, on
 *            the shape `say-pace.ts` already uses for the words.
 *   still    the honest null: the same mark as `fold`, never moving at all, working told
 *            from resting by strength and a word.
 *   rule     a bright segment travelling the 1px border the composer already draws, so
 *            the take costs no pixels at all.
 *   orbit    a dot on a closed path, which cannot be read as a percentage because it
 *            returns.
 *   glyph    Claude Code's own six-frame growing star, in one fixed mono cell.
 *   breathe  one disc scaling and dimming on a slow eased breath.
 *   gerund   no mark: a rotating set of words, the mechanism behind Claude Code's 186.
 *   veil     no shape at all. The fade between the log and the composer breathes.
 *   weight   the word itself thickening on a weight axis this document does not have.
 */
export type AliveTake =
	| "fold"
	| "churn"
	| "still"
	| "rule"
	| "orbit"
	| "glyph"
	| "breathe"
	| "gerund"
	| "veil"
	| "weight";

interface Spec {
	/** whether a word sits beside the mark, which one, and what register it is in */
	readonly word: string;
	/** how long one loop of the animation takes, against a wait's measured 878–4,043ms */
	readonly cycle: string;
	/** transform and opacity only, or something worse, said plainly */
	readonly composited: string;
	/** px of transcript the slot takes away, forever, on every thread */
	readonly reserve: number;
	/** what `prefers-reduced-motion` draws */
	readonly reduced: string;
	/** whether that drawing already means something else in this rail (#161's trap) */
	readonly collides: string;
}

const SPECS: Record<AliveTake, Spec> = {
	fold: {
		word: "working / idle · one gerund, lowercase mono",
		cycle: "1400ms",
		composited: "yes, scaleX only",
		reserve: SLOT_H,
		reduced: "three bars in a staircase, still, lit",
		collides: "no. it is agent-alive--still exactly",
	},
	churn: {
		word: "none. the rate is the message",
		cycle: "320–1200ms, set by the backlog",
		composited: "yes, translateX only",
		reserve: SLOT_H,
		reduced: "the shuttle parked at the left of its channel",
		collides: "no. nothing else here is a channel",
	},
	still: {
		word: "working / idle · the set carries the rest state",
		cycle: "none. nothing moves",
		composited: "yes, one opacity step at the boundary",
		reserve: SLOT_H,
		reduced: "identical to what everybody else sees",
		collides: "it cannot. there is no fallback",
	},
	rule: {
		word: "none",
		cycle: "2600ms",
		composited: "yes, translateX of a static gradient",
		reserve: 0,
		reduced: "the whole rule one step brighter, still",
		collides: "a brighter border is one step from a focus ring",
	},
	orbit: {
		word: "none",
		cycle: "2000ms",
		composited: "yes, x and y only",
		reserve: SLOT_H,
		reduced: "the dot parked at the top of its path",
		collides: "no, but a parked dot is near a read thread's",
	},
	glyph: {
		word: "none. the glyph is in the word's slot",
		cycle: "720ms · six frames at 120ms",
		composited: "no. the text changes, so the run re-renders",
		reserve: SLOT_H,
		reduced: "parked on ✻",
		collides: "✻ is Claude's own figure glyph, which is worse",
	},
	breathe: {
		word: "none",
		cycle: "2400ms",
		composited: "yes, scale and opacity",
		reserve: SLOT_H,
		reduced: "a filled disc, still",
		collides: "yes. a still filled disc is #161's unread mark",
	},
	gerund: {
		word: "a rotating set. five of Claude Code's 186",
		cycle: "2800ms a word",
		composited: "opacity, but the element is replaced each cycle",
		reserve: SLOT_H,
		reduced: "one word, still, and the set never rotates",
		collides: "no",
	},
	veil: {
		word: "none",
		cycle: "3200ms",
		composited: "yes, opacity of a gradient painted once",
		reserve: 0,
		reduced: "the fade at full strength, still",
		collides: "no",
	},
	weight: {
		word: "working / idle · in the sans, off register",
		cycle: "2200ms",
		composited: "no. weight is glyph metrics, so it lays out",
		reserve: SLOT_H,
		reduced: "one weight, still",
		collides: "no",
	},
};

/* ---------- the ten marks ---------- */

/**
 * `fold` — the ribbon's silhouette rather than the ribbon.
 *
 * Three hairlines that lengthen and shorten in a travelling wave. It answers the one thing
 * a rotation cannot: there is no revolution to complete, so nothing has to be unwound when
 * the answer lands and nothing can park crooked. It also carries no percentage, because a
 * wave has no end to arrive at.
 *
 * The three stacked threads are where the spool mark comes from without being it, which is
 * the whole of what survived `agent-wait--mark`'s defeat: the shape was never the problem,
 * the logo was.
 */
/**
 * The shape the bars rest at, and it is not three equal lines.
 *
 * Found by looking at the first render: three bars of the same length in a 14px box is the
 * universal menu glyph, and both this take's resting state and its reduced-motion state are
 * exactly that picture. So the still shape is a staircase — full, two thirds, one third —
 * which is nothing else in this rail and nothing else in software either, and which reads as
 * threads of different lengths rather than as a control that opens something.
 */
const FOLD_REST = [1, 0.64, 0.36] as const;

function Fold({ on, still }: { on: boolean; still: boolean }) {
	const moving = on && !still;
	return (
		<span
			className={cn(
				"flex h-3.5 w-3.5 flex-col justify-center gap-[3px] transition-colors duration-500",
				on ? "text-text/80" : "text-muted/30",
			)}
		>
			{[0, 1, 2].map((bar) => (
				<motion.span
					key={bar}
					className="h-[1.5px] w-full origin-left rounded-full bg-current"
					initial={false}
					animate={moving ? { scaleX: [0.26, 1, 0.26] } : { scaleX: FOLD_REST[bar] ?? 1 }}
					transition={
						moving
							? {
									duration: 1.4,
									repeat: Number.POSITIVE_INFINITY,
									ease: "easeInOut",
									delay: bar * 0.16,
								}
							: { duration: 0.3, ease: "easeOut" }
					}
				/>
			))}
		</span>
	);
}

/** the slowest and fastest one crossing may take, in ms */
const SHUTTLE_SLOW = 1200;
const SHUTTLE_FAST = 320;
/** the channel and the shuttle in it */
const CHANNEL = 16;
const SHUTTLE = 5;

/** how long one crossing takes at this backlog, on `say-pace.ts`'s own shape */
export function crossing(load: number): number {
	if (load <= 0) return 0;
	return Math.max(SHUTTLE_FAST, SHUTTLE_SLOW / load);
}

/**
 * `churn` — the rate is the wire's, not a timer's.
 *
 * Every other animation on this row runs at a constant nobody chose for a reason. This one
 * borrows the shape `say-pace.ts` already ships for the words: **rate proportional to the
 * backlog, bounded by a floor**. Three tool calls open and the shuttle races; one long
 * thought and it crawls; nothing pending and it comes to rest at the end of its channel.
 * So the motion is a readout rather than a decoration, and it is the only take here whose
 * speed means something.
 *
 * It crosses and returns rather than looping, because a loom shuttle does and because a
 * reversal is not the unwind `agent-wait--mark` had to avoid — that was a logo running
 * backwards, this is the same pass in the other direction. When the backlog empties it
 * coasts to whichever end it was heading for and stops there, so the resting state is
 * always the same picture.
 *
 * **The honest risk** is the long thought: 18 seconds at a backlog of one draws a shuttle
 * crossing every 1.2 seconds, and slow is exactly what a hung process looks like.
 */
function Shuttle({ load, still }: { load: number; still: boolean }) {
	const x = useMotionValue(0);
	const phase = useRef(0);
	const rate = useRef(0);
	const homing = useRef(false);
	const span = CHANNEL - SHUTTLE;

	useAnimationFrame((_time: number, delta: number) => {
		if (still) return;
		// a backgrounded tab hands back one enormous delta; clamping it keeps the wind-down
		// from teleporting through the end it is aiming for
		const step = Math.min(delta, 50);
		const traverse = crossing(load);
		if (traverse > 0) {
			homing.current = false;
			const want = 1 / traverse;
			rate.current += (want - rate.current) * Math.min(1, step / 200);
		} else if (rate.current > 0) {
			homing.current = true;
			rate.current = Math.max(1 / (SHUTTLE_SLOW * 2.4), rate.current - (1 / SHUTTLE_SLOW / 320) * step);
		}
		if (rate.current <= 0) return;
		const next = phase.current + rate.current * step;
		if (homing.current && Math.floor(next) > Math.floor(phase.current)) {
			phase.current = Math.floor(next) % 2;
			rate.current = 0;
			homing.current = false;
		} else {
			phase.current = next % 2;
		}
		const at = phase.current < 1 ? phase.current : 2 - phase.current;
		x.set(at * span);
	});

	return (
		<span
			className={cn(
				"relative flex h-3.5 items-center transition-colors duration-500",
				load > 0 ? "text-text/80" : "text-muted/30",
			)}
			style={{ width: CHANNEL }}
		>
			<span className="absolute inset-x-0 top-1/2 h-px bg-current opacity-25" />
			<motion.span
				className="absolute top-1/2 left-0 h-[1.5px] rounded-full bg-current"
				style={{ width: SHUTTLE, x, marginTop: -0.75 }}
			/>
		</span>
	);
}

const ORBIT_W = 18;
const ORBIT_H = 8;
const ORBIT_R = ORBIT_H / 2;
const ORBIT_STRAIGHT = ORBIT_W - ORBIT_H;
const ORBIT_LEN = 2 * ORBIT_STRAIGHT + 2 * Math.PI * ORBIT_R;
const ORBIT_DOT = 3;

/** where on a stadium path a fraction of the way round is, in the box's own pixels */
function stadium(part: number): { readonly x: number; readonly y: number } {
	const d = (((part % 1) + 1) % 1) * ORBIT_LEN;
	const arc = Math.PI * ORBIT_R;
	if (d <= ORBIT_STRAIGHT) return { x: ORBIT_R + d, y: 0 };
	if (d <= ORBIT_STRAIGHT + arc) {
		const a = (d - ORBIT_STRAIGHT) / ORBIT_R - Math.PI / 2;
		return { x: ORBIT_R + ORBIT_STRAIGHT + ORBIT_R * Math.cos(a), y: ORBIT_R + ORBIT_R * Math.sin(a) };
	}
	if (d <= 2 * ORBIT_STRAIGHT + arc) return { x: ORBIT_R + ORBIT_STRAIGHT - (d - ORBIT_STRAIGHT - arc), y: ORBIT_H };
	const a = (d - 2 * ORBIT_STRAIGHT - arc) / ORBIT_R + Math.PI / 2;
	return { x: ORBIT_R + ORBIT_R * Math.cos(a), y: ORBIT_R + ORBIT_R * Math.sin(a) };
}

/**
 * `orbit` — a dot on a closed path.
 *
 * The argument is one sentence: a closed path cannot imply a percentage, because it
 * returns. A bar that fills says 40% whether or not anything knows that; a dot going round
 * says only that it is still going round, which is the entire claim this indicator is
 * entitled to make.
 *
 * The path is drawn nowhere. A visible track invites reading the dot's position along it,
 * which puts the percentage straight back, so the only thing on screen is the dot and the
 * 18×8 stadium it happens to trace. When the answer lands it coasts to the top of the path
 * and stops, so the resting state is one dot in one place.
 */
function Orbit({ on, still }: { on: boolean; still: boolean }) {
	const x = useMotionValue(stadium(0).x - ORBIT_DOT / 2);
	const y = useMotionValue(stadium(0).y - ORBIT_DOT / 2);
	const phase = useRef(0);
	const rate = useRef(0);
	const homing = useRef(false);

	useAnimationFrame((_time: number, delta: number) => {
		if (still) return;
		const step = Math.min(delta, 50);
		if (on) {
			homing.current = false;
			rate.current += (1 / 2000 - rate.current) * Math.min(1, step / 260);
		} else if (rate.current > 0) {
			homing.current = true;
			rate.current = Math.max(1 / 5200, rate.current - (1 / 2000 / 360) * step);
		}
		if (rate.current <= 0) return;
		const next = phase.current + rate.current * step;
		if (homing.current && next >= 1) {
			phase.current = 0;
			rate.current = 0;
			homing.current = false;
		} else {
			phase.current = next % 1;
		}
		const at = stadium(phase.current);
		x.set(at.x - ORBIT_DOT / 2);
		y.set(at.y - ORBIT_DOT / 2);
	});

	return (
		<span
			className={cn("relative flex h-3.5 items-center transition-colors duration-500", on ? "text-text/80" : "text-muted/30")}
			style={{ width: ORBIT_W }}
		>
			<span className="relative block" style={{ width: ORBIT_W, height: ORBIT_H }}>
				<motion.span
					className="absolute top-0 left-0 rounded-full bg-current"
					style={{ width: ORBIT_DOT, height: ORBIT_DOT, x, y }}
				/>
			</span>
		</span>
	);
}

/** the array recovered from Claude Code 2.1.220's own JSC string table, verbatim */
const STAR = ["·", "✢", "✳", "✶", "✻", "✽"] as const;
/** their cycle, which is six frames in 720ms */
const STAR_MS = 720 / STAR.length;

/**
 * `glyph` — Claude Code's growing star, as read at the source.
 *
 * The one take on the row with a shipped precedent for a *glyph* rather than a word, and it
 * is the surface this rail is being written inside. Six characters in a fixed mono cell, one
 * every 120ms: the box cannot change width, so `jump` reads zero, and nothing here can push
 * anything.
 *
 * Two costs, both measured rather than felt. It changes the **text** eight times a second,
 * so Chromium re-renders the run every 120ms and the writes meter reads about a hundred a
 * turn against every transform take's zero. And `✻` is Claude's own figure glyph, from the
 * same symbol table the array came out of, so spending it here is `agent-wait--mark`'s
 * mistake pointed at somebody else's brand instead of at spool's.
 */
function Star({ on, still }: { on: boolean; still: boolean }) {
	const [at, setAt] = useState(0);
	useEffect(() => {
		if (!on || still) return;
		const timer = window.setInterval(() => setAt((was) => (was + 1) % STAR.length), STAR_MS);
		return () => window.clearInterval(timer);
	}, [on, still]);

	const glyph = still && on ? "✻" : on ? (STAR[at] ?? "✻") : "·";
	return (
		<span
			className={cn(
				"flex h-3.5 w-3.5 items-center justify-center font-mono text-sm leading-4 transition-colors duration-500",
				on ? "text-text/80" : "text-muted/30",
			)}
		>
			{glyph}
		</span>
	);
}

/**
 * `breathe` — one disc on a slow eased breath.
 *
 * It is here because it is what assistant-ui ships and what everybody reaches for, and
 * because it is the take that walks nearest the one hard ban. It does not blink: the
 * opacity floor is 0.4 and the easing is symmetric, so there is no on and no off, only a
 * continuous swell. That is the line, and this frame is where to see where it is.
 *
 * **It loses on the fallback.** Reduced motion draws a still filled disc, and a still
 * filled disc is already #161's `unread` mark — the exact trap that ticket found when it
 * measured a frozen spinner against reduced motion's own working row. And the cycle is
 * 2400ms against a median wait of 1970ms, so the median turn never completes one breath.
 */
function Breathe({ on, still }: { on: boolean; still: boolean }) {
	const moving = on && !still;
	return (
		<span className="flex h-3.5 w-3.5 items-center justify-center">
			<motion.span
				className="h-2 w-2 rounded-full bg-text"
				initial={false}
				animate={moving ? { scale: [0.82, 1, 0.82], opacity: [0.4, 0.85, 0.4] } : { scale: 1, opacity: on ? 0.85 : 0.28 }}
				transition={
					moving
						? { duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
						: { duration: 0.4, ease: "easeOut" }
				}
			/>
		</span>
	);
}

/**
 * `gerund` — the mechanism behind Claude Code's 186 words, with no mark at all.
 *
 * Five of their list, verbatim and lowercased into this repo's machine register, crossfading
 * every 2.8 seconds. It is drawn because it is the thing Liam's "186 gerunds" points at and
 * because two measurements kill it, both of which needed a running frame to find.
 *
 * **The cycle is longer than the wait.** 2800ms a word against a median time to first token
 * of 1970ms: in half of all real waits the set never rotates once, so the mechanism that is
 * the whole take is invisible in the median case.
 *
 * **And it is the only "always-present" take that is not.** The word is a keyed element, so
 * every rotation destroys one and creates another. The churn meter does not catch it, because
 * the marker sits on the container the way every other take's does — the writes column in
 * `alive-slot.ts` is what catches it, and the width jumps with every swap.
 */
const GERUNDS = ["accomplishing", "zigzagging", "thinking", "working", "clauding"] as const;

function Gerund({ on, still }: { on: boolean; still: boolean }) {
	const [at, setAt] = useState(0);
	useEffect(() => {
		if (!on || still) return;
		const timer = window.setInterval(() => setAt((was) => (was + 1) % GERUNDS.length), 2800);
		return () => window.clearInterval(timer);
	}, [on, still]);

	const word = on ? (GERUNDS[at] ?? "working") : "idle";
	return (
		<motion.span
			key={word}
			className={cn("font-mono text-sm leading-4", on ? "text-text/80" : "text-muted/40")}
			initial={still ? false : { opacity: 0.2 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.22, ease: "linear" }}
		>
			{word}
		</motion.span>
	);
}

/**
 * `weight` — the word thickening, which reflows every step it takes.
 *
 * Drawn to be killed, and it takes two facts rather than the three claimed here first. The
 * status register in this repo is machine text, which is mono, and **Fragment Mono ships one
 * weight**, so the take can only exist at all by moving the status line into the sans — which
 * is what this frame does, visibly, so the cost is on screen rather than in a note. And weight
 * is glyph metrics, so every step **lays out** and the word's own box changes width, which the
 * slot meter reads directly. Either fact is enough on its own.
 *
 * **The third fact was not one.** This comment claimed the app loads Familjen Grotesk as four
 * static instances and that the axis is therefore four steps. It loads
 * `@fontsource-variable/familjen-grotesk`, which declares `font-weight: 400 700` — one
 * continuous range — so the sweep is smooth and the font was never the objection. Corrected
 * rather than deleted, because a frame on this page is read as evidence and this one was wrong.
 */
function Weight({ on, still }: { on: boolean; still: boolean }) {
	const moving = on && !still;
	return (
		<motion.span
			className={cn("font-sans text-md leading-4", on ? "text-text/85" : "text-muted/40")}
			initial={false}
			animate={moving ? { fontWeight: [400, 700, 400] } : { fontWeight: 400 }}
			transition={
				moving ? { duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" } : { duration: 0.3 }
			}
		>
			{on ? "working" : "idle"}
		</motion.span>
	);
}

/** the two-word set `fold`, `still` and `weight` share, so the mark is the only variable */
function Word({ on, still }: { on: boolean; still: boolean }) {
	const word = on ? "working" : "idle";
	return (
		<motion.span
			key={word}
			className={cn("font-mono text-sm leading-4", on ? "text-text/80" : "text-muted/40")}
			initial={still ? false : { opacity: 0.35 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.18, ease: "linear" }}
		>
			{word}
		</motion.span>
	);
}

/** the segment width for `rule`, and the distance it has to clear the box by */
const SEGMENT = 44;

/**
 * `rule` — the 1px border the composer already draws, with a bright segment travelling it.
 *
 * The only take on this row that spends **no pixels**. Every other one takes 36px of
 * transcript away on every thread forever, including the empty one; this one lives inside a
 * border that is already there and gives the log its 36px back.
 *
 * The segment is a statically painted gradient moved by a transform, which is the
 * distinction #149's finding turns on: what Chromium refuses to composite is an animated
 * `background-position`, and `agent-say-arrive` measured an `edge` gradient *freezing*
 * mid-sweep when the wire paused. Nothing here animates a gradient. The paint happens once
 * and a transform carries it.
 *
 * Its reset is invisible: the segment leaves the right edge before it reappears at the left,
 * both outside the clip. **What is honestly wrong with it** is scale. This is 391px of motion
 * at the edge of the eye, the largest moving thing anywhere in the rail, and a travelling
 * segment on a full-width rule is the indeterminate progress bar — which is either the one
 * widget in the world whose meaning is already "nobody knows how long", or a progress bar,
 * depending on who is looking.
 */
function TravellingRule({
	on,
	still,
	hold,
}: {
	on: boolean;
	still: boolean;
	hold: RefObject<HTMLSpanElement | null>;
}) {
	const [box, setBox] = useState(0);
	const line = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const node = line.current;
		if (node === null) return;
		const read = () => setBox(Math.round(node.getBoundingClientRect().width));
		read();
		const watch = new ResizeObserver(read);
		watch.observe(node);
		return () => watch.disconnect();
	}, []);
	const moving = on && !still && box > 0;
	return (
		<span
			ref={line}
			data-wait-part="alive"
			className="pointer-events-none absolute inset-x-0 top-0 block h-px overflow-hidden"
		>
			<span ref={hold} className="absolute inset-0 block">
				<span
					className={cn(
						"absolute inset-0 block transition-colors duration-500",
						on && still ? "bg-border-raised" : "bg-transparent",
					)}
				/>
				<motion.span
					key={box}
					className="absolute top-0 left-0 block h-px bg-gradient-to-r from-transparent via-text/70 to-transparent"
					style={{ width: SEGMENT }}
					initial={false}
					animate={moving ? { x: [-SEGMENT, box], opacity: 1 } : { x: -SEGMENT, opacity: 0 }}
					transition={
						moving
							? { duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: "linear" }
							: { duration: 0.4, ease: "easeOut" }
					}
				/>
			</span>
		</span>
	);
}

/**
 * `veil` — only motion, with no shape at all.
 *
 * Nothing is drawn. The fade that already sits between the last line of the log and the
 * composer breathes its own opacity, so the boundary softens and firms and there is no
 * object anywhere to have arrived. It is the far end of the row on purpose: if liveness can
 * be carried by a field rather than by a thing, this is what that looks like.
 *
 * **Two real objections.** It has no locus, so the eye cannot find what changed and reads
 * the whole rail as unsteady rather than the indicator as alive. And what it modulates is
 * the human's own last words, which is the one surface in this rail that must not be
 * touched — #163 went to the trouble of leaving *no element at all* behind a settled
 * message, and this take dims it twice a turn.
 */
function Veil({
	on,
	still,
	hold,
}: {
	on: boolean;
	still: boolean;
	hold: RefObject<HTMLSpanElement | null>;
}) {
	const moving = on && !still;
	return (
		<motion.span
			ref={hold}
			data-wait-part="alive"
			className="pointer-events-none absolute inset-x-0 bottom-0 block h-10 bg-gradient-to-b from-transparent to-bg"
			initial={false}
			animate={moving ? { opacity: [0.5, 1, 0.5] } : { opacity: on ? 1 : 0.78 }}
			transition={
				moving ? { duration: 3.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" } : { duration: 0.5 }
			}
		/>
	);
}

/** the occupant of the slot, for the eight takes that have one */
function Mark({ take, on, load, still }: { take: AliveTake; on: boolean; load: number; still: boolean }) {
	if (take === "fold" || take === "still")
		return (
			<>
				<Fold on={on} still={still || take === "still"} />
				<Word on={on} still={still} />
			</>
		);
	if (take === "churn") return <Shuttle load={load} still={still} />;
	if (take === "orbit") return <Orbit on={on} still={still} />;
	if (take === "glyph") return <Star on={on} still={still} />;
	if (take === "breathe") return <Breathe on={on} still={still} />;
	if (take === "gerund") return <Gerund on={on} still={still} />;
	if (take === "weight") return <Weight on={on} still={still} />;
	return null;
}

/* ---------- the transcript ---------- */

interface Item {
	readonly key: string;
	/** a row-shaped thing, which sits tighter against another one */
	readonly tight: boolean;
	readonly node: ReactNode;
}

function gapBefore(previous: Item | undefined, item: Item): number {
	if (previous === undefined) return 0;
	return previous.tight && item.tight ? 6 : 14;
}

function Arrive({ gap, children }: { gap: number; children: ReactNode }) {
	const still = useReducedMotion() === true;
	return (
		<motion.div
			className="shrink-0 overflow-hidden"
			initial={still ? false : { height: 0, opacity: 0 }}
			animate={{ height: "auto", opacity: 1 }}
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

function Transcript({
	entries,
	take,
	on,
	load,
	still,
	view,
	hold,
}: {
	entries: readonly PlayEntry[];
	take: AliveTake;
	on: boolean;
	load: number;
	still: boolean;
	view: RefObject<HTMLDivElement | null>;
	hold: RefObject<HTMLSpanElement | null>;
}) {
	const [follow, setFollow] = useState(true);
	const reserve = SPECS[take].reserve > 0;

	const items: Item[] = [];
	for (const entry of entries) {
		if (entry.kind === "user")
			items.push({ key: entry.key, tight: false, node: <Asked text={entry.text} context={entry.context ?? ""} /> });
		else if (entry.kind === "prose") items.push({ key: entry.key, tight: false, node: <Say entry={entry} /> });
		else if (entry.kind === "line") items.push({ key: entry.key, tight: true, node: <Row entry={entry} /> });
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
				className={cn("pages-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-6", reserve ? "pb-10" : "pb-4")}
			>
				<div className="mt-auto shrink-0">
					{items.map((item, index) => (
						<div key={item.key} data-edge-key={item.key}>
							<Arrive gap={gapBefore(items[index - 1], item)}>{item.node}</Arrive>
						</div>
					))}
				</div>
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
			{take === "veil" ? (
				<Veil on={on} still={still} hold={hold} />
			) : (
				<span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-bg" />
			)}
			{reserve ? (
				<div
					data-wait-part="alive"
					className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center px-3.5"
					style={{ height: SLOT_H }}
				>
					<span ref={hold} className="flex w-fit items-center gap-2">
						<Mark take={take} on={on} load={load} still={still} />
					</span>
				</div>
			) : null}
		</div>
	);
}

/* ---------- the box under it ---------- */

/**
 * The composer footer, at #184's resolved shape: the model and the stop and nothing else,
 * the name truncating and never shortening, the stop `shrink-0`.
 *
 * **Nothing on this row goes in here**, which is round two's own finding carried forward:
 * `agent-wait--fact` wanted 389 of 391 and blew past the box at a 300 rail, and the
 * placement Liam settled on is the transcript's bottom edge rather than the footer. It is
 * still measured on every frame, the way `agent-footer-fit` does it — the row drawn twice
 * with an invisible `w-max` copy asked how wide it wants to be — because a take that
 * claimed to be free and quietly cost the footer 24px would be caught by exactly this
 * number and by nothing else.
 */
function Composer({
	take,
	running,
	on,
	still,
	rule,
	onStop,
	onWanted,
}: {
	take: AliveTake;
	running: boolean;
	on: boolean;
	still: boolean;
	rule: RefObject<HTMLSpanElement | null>;
	onStop: () => void;
	onWanted: (px: number) => void;
}) {
	const ghost = useRef<HTMLDivElement>(null);
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
			{/* the chevron is #184's: the model is a menu trigger, and the 160 that ticket
			    measured includes it */}
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
		<div className="relative flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			{take === "rule" ? <TravellingRule on={on} still={still} hold={rule} /> : null}
			<div className="flex min-h-0 flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5">
				<span className="flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border border-border-raised bg-raised pr-2.5 pl-2">
					<span className="h-3 w-[2px] shrink-0 rounded-full bg-thread/55" />
					<span className="min-w-0 truncate font-mono text-xs text-text/85 leading-4">{EDGE_CHIP}</span>
				</span>
				<textarea
					rows={3}
					readOnly
					spellCheck={false}
					placeholder="say what to change"
					aria-label="say what to change"
					className="w-full resize-none bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
					style={{ height: FIELD_H }}
				/>
			</div>
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

/* ---------- the frame ---------- */

/** the numbers this is being decided against, on every frame */
function Carried() {
	return (
		<p className="font-mono text-2xs text-muted/35 leading-4">
			carried: today 4 in / 4 out a wait · 24 a turn · ttft {TTFT_MEASURED.min}/{TTFT_MEASURED.median}/
			{TTFT_MEASURED.max}ms · 56% of the turn is wait
		</p>
	);
}

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
			<span className="w-[86px] shrink-0 text-muted/45">{label}</span>
			<span className="min-w-0 flex-1 text-muted/70">{children}</span>
		</div>
	);
}

/**
 * The reduced-motion state, drawn rather than described.
 *
 * #161 found the trap this answers: freezing a spinner is pixel-identical to what reduced
 * motion already renders for a *working* row, so a fallback that only stops can land on top
 * of a meaning the rail already has. That cannot be judged from a sentence, so every frame
 * on this row draws its own fallback beside the verdict — the same mark with `still` forced
 * true and a request out.
 *
 * It is not a switcher. Nothing about the rail above changes, and no take is drawn twice: it
 * is a swatch of one state, the way the meters are readings of one number.
 */
function Fallback({ take }: { take: AliveTake }) {
	return (
		<div className="flex items-center gap-3">
			<span className="flex h-9 items-center gap-2 rounded-sm border border-border bg-bg px-2.5">
				{take === "rule" ? (
					<span className="block h-px w-16 bg-border-raised" />
				) : take === "veil" ? (
					<span className="block h-4 w-16 bg-gradient-to-b from-transparent to-text/20" />
				) : (
					<Mark take={take} on load={2} still />
				)}
			</span>
			<p className="min-w-0 flex-1 font-mono text-2xs text-muted/60 leading-4">{SPECS[take].reduced}</p>
		</div>
	);
}

export function AliveFrame({
	take,
	title,
	claim,
	notes,
}: {
	take: AliveTake;
	/** what this take is, in one mono line */
	title: string;
	/** what it claims, which the meters beside it either back or do not */
	claim: string;
	notes: readonly string[];
}) {
	const spec = SPECS[take];
	const still = useReducedMotion() === true;
	const turn = useTurn(EDGE_SCRIPT.cues);
	const elapsed = useTicker(turn.run, EDGE_SCRIPT.total);
	/** the scrolling column, which is what movement is measured against */
	const view = useRef<HTMLDivElement>(null);
	/* the whole rail, which is what churn is counted over: two takes put their indicator
	   outside the transcript on purpose, and an instrument that could only see inside the
	   scroll box would report both of them as absent */
	const rail = useRef<HTMLDivElement>(null);
	/** whatever the take actually draws, which is what the slot meter watches */
	const hold = useRef<HTMLSpanElement>(null);
	const [wanted, setWanted] = useState<number | null>(null);
	const { entries, waits } = edgeLog(EDGE_SCRIPT, turn, elapsed);
	const running = turn.phase === "playing";
	const shift = useShift(view, turn.run, running);
	const churn = useChurn(rail, turn.run, running);
	const slot: Slot = useSlot(hold, turn.run, running);

	const live = waits.some((one: EdgeWait) => one.live);
	/** what the wire has out right now: a request, plus every call still open */
	const load = (live ? 1 : 0) + entries.filter((one) => one.kind === "line" && one.state === "running").length;
	const on = load > 0;

	/* rest, run, rest, again. The resting state is half of every take here, so a frame that
	   only ever plays is only ever showing half of what it proposes. */
	useEffect(() => {
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
	}, [turn.phase, turn.send, turn.replay]);

	const share = churn.ofMs === 0 ? 0 : Math.round((churn.onMs / churn.ofMs) * 100);
	const box = 420 - CHROME;
	const cycle = take === "churn" ? (on ? `${Math.round(crossing(load))}ms · backlog ${load}` : "at rest") : spec.cycle;

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div ref={rail} className="flex min-h-0 flex-1 flex-col">
				<Transcript entries={entries} take={take} on={on} load={load} still={still} view={view} hold={hold} />
				<Composer
					take={take}
					running={running}
					on={on}
					still={still}
					rule={hold}
					onStop={turn.cut}
					onWanted={setWanted}
				/>
			</div>
			<div className="flex h-[440px] shrink-0 flex-col gap-2 border-border border-t bg-surface/40 px-3.5 py-3">
				<div className="flex items-baseline gap-2">
					<span className="shrink-0 font-mono text-2xs text-text leading-3">{title}</span>
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-3">
						{running ? "running" : "resting"}
					</span>
				</div>
				<p className="font-mono text-2xs text-muted/60 leading-4">{claim}</p>
				<div className="flex h-4 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="enters" value={String(churn.enters)} hot={churn.enters > 0} />
					<Meter label="leaves" value={String(churn.leaves)} hot={churn.leaves > 0} />
					<Meter label="on screen" value={`${share}%`} hot={false} />
					<Meter label="moved down" value={`${shift.worst}px`} hot={shift.worst > 0} />
				</div>
				<div className="flex h-4 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="writes" value={String(slot.writes)} hot={slot.writes > 40} />
					<Meter label="box" value={`${slot.widest}px`} hot={false} />
					<Meter label="widest step" value={`${slot.jump}px`} hot={slot.jumps > 4} />
					<span className="shrink-0 text-muted/45">
						in <span className={cn("tabular-nums", slot.jumps > 4 ? "text-thread" : "text-text")}>{slot.jumps}</span>
					</span>
				</div>
				<div className="flex h-4 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<span className="shrink-0 text-muted/45">
						footer wants{" "}
						<span className={cn("tabular-nums", wanted !== null && wanted > box ? "text-thread" : "text-text")}>
							{wanted === null ? "…" : wanted}
						</span>{" "}
						of {box}
					</span>
					<span className="shrink-0 text-muted/45">
						transcript gives up <span className="text-text tabular-nums">{spec.reserve}px</span>
					</span>
				</div>
				<div className="flex flex-col gap-1 border-border/60 border-t pt-2">
					<Fact label="cycle">{cycle}</Fact>
					<Fact label="compositor">{spec.composited}</Fact>
					<Fact label="word">{spec.word}</Fact>
					<Fact label="collision">{spec.collides}</Fact>
				</div>
				<div className="border-border/60 border-t pt-2">
					<Fallback take={take} />
				</div>
				<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
					{notes.map((note) => (
						<p key={note} className="font-mono text-2xs text-muted/45 leading-4">
							{note}
						</p>
					))}
					<Carried />
				</div>
			</div>
		</div>
	);
}
