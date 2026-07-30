import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type Slot, useSlot } from "../lib/alive-slot";
import { useShift } from "../lib/edge-shift";
import { EDGE_ASK, EDGE_CHIP, EDGE_SCRIPT, TTFT_MEASURED, edgeLog } from "../lib/edge-wait-turn";
import { CHIP_INK, useInk } from "../lib/ribbon-ink";
import { PINCH, STRAND_TAPER } from "../lib/ribbon-strands";
import { type Wire, type Work, WORK_ORDER, dwellLine, useDwell, wireNow } from "../lib/ribbon-state";
import { type PlayEntry, useTicker, useTurn } from "../lib/turn-play";
import { cn } from "../lib/utils";
import { useChurn } from "../lib/wait-churn";
import { ChevronIcon } from "./spool-icons";
import { StateMark } from "./spool-play-rail";
import { MARK_H, MARK_W, MaskedMark, SpunMark, StrandStack } from "./spool-ribbon-mark";
import { Caret, Said } from "./spool-say";

/**
 * Round four, and it exists because round three drew ten indicators and not one of them was
 * spool.
 *
 *   "i want to explore more agent alive though, cause currently none is using the spool icon
 *    or like the 'spool' identity i guess, or if we come up with something special and
 *    unique. the rule was a bit interesting as well but i dont know, feel like we should
 *    explore this further and make something really cool."
 *
 * **The precedent objection is overruled on purpose, and it is worth saying why rather than
 * quietly ignoring it.** Round two read six real chat surfaces at the source and found that
 * none of them animates its own brand mark, and round three used that to kill
 * `agent-wait--mark`. That is an argument from precedent, and the goal here is
 * distinctiveness — so "nobody else does this" is a reason to look harder rather than a
 * disqualifier. What survives from that research is only the functional findings, and those
 * still bind absolutely: nothing blinks, a gradient is painted once and carried by a
 * transform, `prefers-reduced-motion` gets a drawn state that does not land on an existing
 * meaning, nothing implies progress it does not have, a cycle is bounded by the measured
 * 878/1970/4043ms a wait really lasts, and the thing is always mounted.
 *
 * **The mark was already an animation rig and nobody had opened it.** `SPOOL_MARK_PATH` is
 * nine separate subpaths — nine tapering strands, stacked, cascading wide to pinched to wide,
 * with a natural order and a measured waist at strand 5. `ribbon-strands.ts` splits them and
 * asserts the rejoin byte-identical, so every take here draws the identity rather than an
 * abstraction of it. That is the whole difference from `agent-alive--fold`, which reduced the
 * ribbon to three hairlines and was the thing being reacted against.
 *
 * **And the metaphor is the product's own vocabulary rather than one imported to justify a
 * logo.** spool means winding thread; this product calls its conversations threads;
 * `say-pace.ts` already paces text by the wire's own backlog. "The agent is spinning a
 * thread" is what the thing is literally called, and no frame had said it.
 *
 * **The state question is answered per take rather than once.** `ribbon-state.ts` separates
 * the six cases the wire really distinguishes, every frame prints which of them its take
 * draws and how long each was live, and a take that collapses five into one has to survive
 * its own dwell meter saying so.
 */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;
/** clear of the header's 48px fade, so an anchored first line is not dimmed by it */
const TOP_INSET = 10;
/** the composer's own resting height */
const FIELD_H = 60;
/** how long the rail sits still between turns, so both states are legible */
const REST_MS = 2400;
/** the first send fires on boot: a still of this frame should catch the rail at work */
const OPEN_MS = 50;
/** the composer's own padding: 391px of box inside the shipped 420 rail (#184) */
const CHROME = 29;
/**
 * The slot's own height. 30 of it is the mark, which is what a legible ribbon costs.
 *
 * Round three's slot was 36 and its glyphs were 14. Nine strands need 30 to separate — drawn
 * at six sizes in `spool-ribbon-mark.tsx` rather than reasoned — so this row gives up 4px more
 * transcript than every take before it, on every thread, forever. It is the one cost the round
 * adds, and it is printed on every frame rather than absorbed.
 */
const SLOT_H = 40;

/**
 * The turn parks here, and the frame moves it on by itself.
 *
 * `parked` is the one state in the six that a capture cannot produce — under `-p` nothing was
 * there to answer, so #145 built the hold and every frame that needs a person in the loop
 * uses it. This row holds on the third group's own row and releases after 1.7s, because a
 * frame nobody presses still has to show the state: five of the six happen on the clock and
 * this one never would.
 *
 * What is *not* drawn is the question itself. #145 owns that drawing and #162 owns its
 * refusal; this row owns the mark, so the log holds an open row and the mark does the talking.
 */
const HOLD = "open:read-press";
const PARK_MS = 1700;

/**
 * Six takes, one slot, and the mark is the only variable.
 *
 *   wind      a crest of strength travels the nine strands. The backlog sets its
 *             **amplitude** rather than its rate, so the cycle never races and never crawls.
 *   aperture  the mark becomes a `mask-image` and light passes behind it. The taper does the
 *             work for free: the band dwells on the wide strands and skims the waist.
 *   spin      the nine strands as channels, with a fixed-length thread running each closed
 *             outline. Winding, literally. Direction says whether it is thinking.
 *   rest      the ribbon at rest is a still logo, and work is the coil twisting. Drawn in
 *             the accent, always, which is half of the accent question.
 *   count     **which strands are lit is the state.** Four shapes for four states and a
 *             still one for idle, with the accent spent only on the one that needs a person.
 *   wound     the strands lay themselves down in order, as if being wound. Drawn to be
 *             killed: nine steps that fill is a progress bar, and it has no progress.
 */
export type RibbonTake = "wind" | "aperture" | "spin" | "rest" | "count" | "wound";

interface Spec {
	/** how long one loop takes, against a wait's measured 878–4,043ms */
	readonly cycle: string;
	/** transform and opacity only, or something worse, said plainly */
	readonly composited: string;
	/** px of transcript the slot takes away, forever, on every thread */
	readonly reserve: number;
	/** which of the six states get their own drawing, and what the rest are folded into */
	readonly states: string;
	/** where the red goes, which is Liam's call and needs both sides drawn */
	readonly accent: string;
	/** whether any drawing here already means something else in this rail (#161's trap) */
	readonly collides: string;
	/** the states this take draws differently, which is what the fallback row swatches */
	readonly shows: readonly Work[];
	/** constraints from the brief this take fails, by number, or empty */
	readonly fails: readonly string[];
}

const EVERY: readonly Work[] = ["idle", "sent", "thinking", "tooling", "parked"];

const SPECS: Record<RibbonTake, Spec> = {
	wind: {
		cycle: "1170ms · nine strands 130ms apart",
		composited: "yes. opacity of nine html elements, nothing else",
		reserve: SLOT_H,
		states: "three. working, parked, idle. the backlog is amplitude inside working",
		accent: "none. monochrome, so the selection keeps the red",
		collides: "no. a nine-step ramp is nothing else here",
		shows: ["idle", "tooling", "parked"],
		fails: [],
	},
	aperture: {
		cycle: "1400ms · one pass of the band",
		composited: "yes. translateX of a gradient painted once, behind a static mask",
		reserve: SLOT_H,
		states: "three. working, parked, idle. it argues the other three are one",
		accent: "none. monochrome",
		collides: "no",
		shows: ["idle", "tooling", "parked"],
		fails: [],
	},
	spin: {
		cycle: "1600ms a lap · nine laps 178ms apart",
		composited: "no. a dash offset repaints its stroke every frame, nine paths",
		reserve: SLOT_H,
		states: "four. thinking runs the thread inward, work pays it out, plus parked and idle",
		accent: "none. monochrome",
		collides: "no, but frozen the two directions are a lean and not a shape",
		shows: ["idle", "thinking", "tooling", "parked"],
		fails: [],
	},
	rest: {
		cycle: "1500ms · a standing twist, no travel",
		composited: "yes. translateX of nine html elements",
		reserve: SLOT_H,
		states: "two, and it says so: moving or not, plus parked",
		accent: "the whole mark, always, at every state. this is the A side",
		collides: "no. a still red ribbon is nothing else here",
		shows: ["idle", "tooling", "parked"],
		fails: [],
	},
	count: {
		cycle: "1400ms sent · 1800ms thinking · 1100ms working",
		composited: "yes. opacity of nine html elements",
		reserve: SLOT_H,
		states: "four drawn as four shapes. saying folds into working, on the dwell",
		accent: "parked only. red arrives when a person has to, and leaves. the B side",
		collides: "no. every shape here is a set of strands, and nothing else is",
		shows: EVERY,
		fails: [],
	},
	wound: {
		cycle: "2280ms · 9 × 180ms laid, 400ms held, 260ms back",
		composited: "yes. opacity of nine html elements",
		reserve: SLOT_H,
		states: "one. it cannot carry a second, because the shape is already spent",
		accent: "none. monochrome",
		collides: "yes. still, it is the plain logo, which is --rest at idle",
		shows: ["idle", "tooling", "parked"],
		fails: ["4 · nine strands filling in order is a percentage", "5 · 2280ms over a 1970ms median wait"],
	},
};

/* ---------- the six marks ---------- */

interface TakeProps {
	readonly wire: Wire;
	readonly still: boolean;
	readonly onLengths?: (total: number) => void;
}

/** the shared boundary crossfade: long enough to read as a change, short enough to be one */
const SETTLE = { duration: 0.4, ease: "easeOut" } as const;
const FOREVER = Number.POSITIVE_INFINITY;

/**
 * `wind` — a crest of strength travelling the nine strands, with the backlog as amplitude.
 *
 * The plainest use of the rig and the reference the other five are read against: the whole
 * ribbon is always there, the wave is the work. Each strand crossfades between 0.20 and 1.0
 * over 1,170ms, 130ms apart, so the crest crosses the mark in a shade under the 1,970ms
 * median wait and the reader sees at least one whole pass in half of all real waits.
 *
 * **The backlog sets amplitude and not rate**, which is the one thing separating it from
 * `--churn`. That take's honest risk was the long thought: 18 seconds at a backlog of one
 * draws a shuttle crawling, and slow is what a hung process looks like. Here the period is
 * fixed and the *depth* of the wave carries the load — one request out and the crest is
 * faint, three calls open and it is at full strength. Nothing can read as stuck and nothing
 * can read as frantic.
 *
 * The amplitude lives on a **parent** opacity rather than in the keyframes, so a call opening
 * mid-wave fades the whole mark up without restarting the crest. Round three had no take
 * where the rate could change without the animation jumping; this is what that costs, and it
 * is one extra element.
 */
const WIND_MS = 1170;

function windAmp(load: number): number {
	if (load <= 0) return 0.34;
	return 0.42 + (Math.min(load, 3) / 3) * 0.58;
}

/** the crest frozen at one phase: a ramp from strand 0 to strand 8, and nothing else here is */
function windFrozen(index: number): number {
	return 0.95 - index * 0.085;
}

function Wind({ wire, still }: TakeProps) {
	const parked = wire.state === "parked";
	const moving = wire.on && !parked && !still;
	return (
		<motion.span
			className="block text-text"
			initial={false}
			animate={{ opacity: parked ? 1 : windAmp(wire.load) }}
			transition={SETTLE}
		>
			<StrandStack
				strand={(index) =>
					moving
						? {
								animate: { opacity: [0.2, 1, 0.2] },
								transition: {
									duration: WIND_MS / 1000,
									repeat: FOREVER,
									ease: "easeInOut",
									delay: (index * WIND_MS) / 9000,
								},
							}
						: {
								animate: { opacity: parked ? 0.92 : still && wire.on ? windFrozen(index) : 0.8 },
								transition: SETTLE,
							}
				}
			/>
		</motion.span>
	);
}

/**
 * `aperture` — the mark is the window, and light passes behind it.
 *
 * The first of the two genuinely new mechanisms, and the novelty is that the ribbon is not
 * the moving object at all. It is a `mask-image`, painted once and never touched; what moves
 * is one ordinary element carrying one static gradient, translated. So the take satisfies
 * #149's rule by construction rather than by care — there is no gradient paint to animate and
 * nothing that can freeze mid-sweep the way `agent-say-arrive`'s `edge` did when the wire
 * paused.
 *
 * **The taper does the design work for free, which is the argument for using the real path.**
 * A band sweeping left to right crosses 446 units of strand 8 and 165 of strand 5, so it
 * dwells on the wide strands and flicks past the waist without a single number saying it
 * should. The rhythm is the logo's own geometry.
 *
 * **It cannot imply progress**: the band is a fixed 62% of the mark's width and leaves the
 * right edge before it re-enters at the left, both outside the mask, so nothing accumulates
 * and there is no state further along than another.
 *
 * It draws three states and argues the rest are one, which is the honest position for a
 * mechanism with a single moving part. There is one band; a second band, or a slower one,
 * would be a vocabulary rather than a signal.
 */
const BAND_MS = 1400;
const BAND_W = Math.round(MARK_W * 0.62);

function Aperture({ wire, still }: TakeProps) {
	const parked = wire.state === "parked";
	const moving = wire.on && !parked && !still;
	const frozen = still && wire.on && !parked;
	return (
		<span className="block text-text">
			<MaskedMark base={parked ? 0.95 : wire.on ? 0.28 : 0.22}>
				<motion.span
					className="absolute inset-y-0 left-0 block bg-gradient-to-r from-transparent via-current to-transparent"
					style={{ width: BAND_W }}
					initial={false}
					animate={
						moving
							? { x: [-BAND_W, MARK_W], opacity: 1 }
							: { x: frozen ? Math.round(MARK_W * 0.34) : -BAND_W, opacity: frozen ? 1 : 0 }
					}
					transition={moving ? { duration: BAND_MS / 1000, repeat: FOREVER, ease: "linear" } : SETTLE}
				/>
			</MaskedMark>
		</span>
	);
}

/**
 * `spin` — the strands as channels, with a thread running each of them.
 *
 * The second new mechanism, and the only drawing in the family that is literally the word
 * spool. Each strand's outline is a closed loop, because every subpath returns to its own
 * start point, so a dash of fixed length running that loop travels out along the strand and
 * back along it — which is what a thread being paid off a bobbin does, and what a bobbin
 * winding one on does in reverse.
 *
 * **The loop is also the answer to the progress objection.** A `pathLength` drawing is the
 * sharpest version of the risk the brief names: a line filling up reads as a percentage
 * whether or not anything knows one. This dash never grows. It is 17% of its strand at every
 * instant, so there is no fraction to read and no end to arrive at, and the mechanism that
 * makes the thread *appear* to be spun costs nothing in false certainty.
 *
 * **Direction is the state, and it is a shape rather than a speed.** A thinking block is open
 * and the nine laps stagger from strand 8 up to strand 0 with the thread running the other
 * way: the ribbon winds *in*. Words or a tool result coming back and it runs 0 down to 8,
 * paying *out*. Same rate, same 17%, opposite sense — which is a distinction the reader can
 * see without learning a second vocabulary, because winding and unwinding are one idea.
 *
 * **What it costs, and this is the number that ranks it.** `stroke-dashoffset` is a paint
 * property: Chromium cannot hand it to the compositor, so nine stroked paths repaint on every
 * frame on the main thread. Every other take in the family is opacity or translate on HTML
 * elements. The writes meter will not catch it — `alive-slot.ts` deliberately ignores
 * attributes, and this is an attribute — so it is stated here and printed on the frame rather
 * than left to a number that structurally cannot see it.
 */
const LAP_MS = 1600;

function Spin({ wire, still, onLengths }: TakeProps) {
	const parked = wire.state === "parked";
	const running = wire.on && !parked;
	return (
		<span className="block text-text">
			<SpunMark
				fill={parked ? 0.95 : running ? 0.18 : 0.24}
				dash={running ? 0.9 : 0}
				lap={LAP_MS}
				inward={wire.state === "thinking"}
				frozen={still}
				{...(onLengths === undefined ? {} : { onLengths })}
			/>
		</span>
	);
}

/**
 * `rest` — the ribbon at rest is the logo, and work is the coil twisting.
 *
 * The take that starts from the other end. Every other indicator this map has drawn is a
 * thing that means *working* and happens to be quiet the rest of the time; this one is the
 * spool mark sitting above the composer, which is a reasonable thing for it to be doing at
 * three in the morning with nothing running, and it *becomes* motion when work starts.
 *
 * **The motion is a standing twist rather than a wave**, which is what keeps it distinct from
 * `wind` in kind and not only in tuning. Even strands slide one way while odd strands slide
 * the other, both on the same 1,500ms ease with no stagger at all, so nothing travels and
 * nothing has a direction — the ribbon reads as a coil under tension. Amplitude follows the
 * taper inverted: the waist bends most because the waist is the thinnest part of the shape,
 * which is the one place the physics of the drawing and the geometry of the logo agree.
 *
 * **It is the accent's A side, and that is the whole reason it exists in this set.** The mark
 * is `text-thread` in every state, including idle, including the empty thread before the
 * first keystroke. The rail's standing rule says state is motion and the one accent belongs
 * to the selection — so this take is that rule's counter-example drawn at full strength,
 * nine pixels above a composer chip whose own bar is `bg-thread/55`. The frame prints how much
 * accent ink each of them is, measured off a raster of the mask rather than guessed, because
 * the question is whether two reds in forty pixels compete and that is a quantity.
 */
const SHEAR_MS = 1500;
const SHEAR_PX = 1.7;

/** the waist bends most: amplitude is the taper inverted, and the sign alternates */
function shear(index: number): number {
	const give = 1 - (STRAND_TAPER[index] ?? 0) * 0.55;
	return SHEAR_PX * give * (index % 2 === 0 ? 1 : -1);
}

function Rest({ wire, still }: TakeProps) {
	const parked = wire.state === "parked";
	const moving = wire.on && !parked && !still;
	return (
		<span className="block text-thread">
			<StrandStack
				strand={(index) => {
					const swing = shear(index);
					return moving
						? {
								animate: { x: [-swing, swing, -swing], opacity: 0.92 },
								transition: {
									x: { duration: SHEAR_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
									opacity: SETTLE,
								},
							}
						: {
								animate: {
									x: still && wire.on && !parked ? swing : 0,
									opacity: parked ? 1 : wire.on ? 0.92 : 0.78,
								},
								transition: SETTLE,
							};
				}}
			/>
		</span>
	);
}

/**
 * `count` — which strands are lit is the state.
 *
 * The take that answers Liam's second question with shape instead of speed, and the only one
 * here where the reduced-motion fallback is not a concession. Four states get four **sets**
 * of strands, and inside a set the members trade strength against each other. One grammar,
 * four vocabularies, and the vocabulary is a picture rather than a rate:
 *
 *   sent      the waist only. Strands 4 and 5 trade over 1,400ms and the other seven sit at
 *             0.08, so the mark is at its thinnest — the request is out and nothing has come
 *             back, which is the least the rail knows and now looks like the least.
 *   thinking  the waist blooms. The set is all nine, grouped into rings by distance from
 *             strand 5, so the ribbon opens outward from its middle and closes again over
 *             1,800ms. Nothing travels; it widens.
 *   working   all nine, odd against even, 1,100ms. The fullest the mark ever is while moving.
 *   parked    all nine at full strength and **completely still**, in the accent.
 *   idle      all nine at 0.24, still. The logo, quiet.
 *
 * **`saying` and `tooling` are deliberately one drawing**, and the dwell meter on the frame is
 * the argument: in this turn words are arriving for about a third of a second out of 13.4
 * seconds. A state that is live for 2% of a turn cannot hold its own picture, however good the
 * picture is, because the reader never sees it settle. What the reader needs to know is
 * whether something is coming back, and both of those are yes.
 *
 * **The accent is spent once and given back**, which is the B side of the question `rest`
 * asks. Red appears in this rail only when a person has to act and disappears when they do —
 * so it never sits alongside the selection's own red for longer than the thing it is calling
 * you to, and when it does compete it is competing on purpose. #161 settled that being the
 * loudest of the three readings is right rather than a cost for exactly this state.
 *
 * **Nothing here collides.** A set of lit strands is not a spinner, not a disc, and not a
 * ring; freezing any of the four leaves four different pictures rather than one, which is
 * the trap #161 found and the reason this take degrades better than anything round three drew.
 */
const SENT_MS = 1400;
const BLOOM_MS = 1800;
const CREST_MS = 1100;

function Count({ wire, still }: TakeProps) {
	const state = wire.state;
	return (
		<span
			className={cn("block transition-colors duration-300", state === "parked" ? "text-thread" : "text-text")}
		>
			<StrandStack
				strand={(index) => {
					if (state === "parked") return { animate: { opacity: 1, x: 0 }, transition: SETTLE };
					if (state === "idle") return { animate: { opacity: 0.24, x: 0 }, transition: SETTLE };
					if (state === "sent") {
						if (index !== PINCH && index !== PINCH - 1)
							return { animate: { opacity: 0.08, x: 0 }, transition: SETTLE };
						const lead = index === PINCH;
						if (still) return { animate: { opacity: lead ? 0.95 : 0.42, x: 0 }, transition: SETTLE };
						return {
							animate: { opacity: lead ? [0.95, 0.4, 0.95] : [0.4, 0.95, 0.4] },
							transition: { duration: SENT_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
						};
					}
					if (state === "thinking") {
						const ring = Math.abs(index - PINCH);
						if (still) return { animate: { opacity: 0.95 - ring * 0.17, x: 0 }, transition: SETTLE };
						return {
							animate: { opacity: [0.1, 0.95, 0.1] },
							transition: { duration: BLOOM_MS / 1000, repeat: FOREVER, ease: "easeInOut", delay: ring * 0.11 },
						};
					}
					const even = index % 2 === 0;
					if (still) return { animate: { opacity: even ? 0.92 : 0.42, x: 0 }, transition: SETTLE };
					return {
						animate: { opacity: even ? [0.92, 0.34, 0.92] : [0.34, 0.92, 0.34] },
						transition: { duration: CREST_MS / 1000, repeat: FOREVER, ease: "easeInOut" },
					};
				}}
			/>
		</span>
	);
}

/**
 * `wound` — the strands lay themselves down in order, and it is a progress bar.
 *
 * Drawn because it is the most obvious thing the rig suggests, because it is the reading of
 * "spool" everybody reaches for first, and because it fails on two measured grounds that only
 * a running frame can show. It is ranked last on purpose rather than left out: a direction
 * this good-looking will be proposed again by whoever reads this page next, and the argument
 * against it has to be on the canvas.
 *
 * The strands arrive bottom to top, 180ms apart, held complete for 400ms, then the whole stack
 * drops back over 260ms and it starts again.
 *
 * **It fails constraint 4.** Nine discrete steps that fill in a fixed order and then reset is
 * a nine-segment progress bar, and nothing in this rail knows how long a turn takes. Six of
 * nine strands lit means nothing, and it will be read as two thirds.
 *
 * **It fails constraint 5.** 2,280ms against a median time to first token of 1,970ms: in half
 * of all real waits the reader never sees the stack complete, so the only thing they ever see
 * is the partial fill that means nothing. This is the same measurement that killed `--breathe`
 * and `--gerund`, arrived at from the other direction.
 *
 * **And its fallback lands on another take.** The stack complete and still is the plain spool
 * logo, which is `--rest` at idle exactly — so under reduced motion this take draws working
 * and idle as the same picture at two strengths, which `--still` already established is not a
 * distinction anybody reads.
 *
 * It does *not* fail constraint 6, and that is worth saying because it is the trap this
 * mechanism usually falls into. The nine elements are mounted from the first keystroke and
 * only their opacity moves, so churn reads 0 in and 0 out like everything else here. Being
 * always-present was never enough on its own.
 */
const WOUND_STEP = 180;
const WOUND_LAY = 9 * WOUND_STEP;
const WOUND_HOLD = 400;
const WOUND_BACK = 260;
const WOUND_MS = WOUND_LAY + WOUND_HOLD + WOUND_BACK;
const WOUND_RISE = 140;

function Wound({ wire, still }: TakeProps) {
	const parked = wire.state === "parked";
	const moving = wire.on && !parked && !still;
	return (
		<span className="block text-text">
			<StrandStack
				strand={(index) => {
					const order = 8 - index;
					const opens = Math.max((order * WOUND_STEP) / WOUND_MS, 0.004);
					const lit = (order * WOUND_STEP + WOUND_RISE) / WOUND_MS;
					return moving
						? {
								animate: { opacity: [0.06, 0.06, 1, 1, 0.06] },
								transition: {
									duration: WOUND_MS / 1000,
									times: [0, opens, lit, (WOUND_LAY + WOUND_HOLD) / WOUND_MS, 1],
									repeat: FOREVER,
									ease: "easeInOut",
								},
							}
						: { animate: { opacity: parked ? 1 : wire.on ? 0.82 : 0.24 }, transition: SETTLE };
				}}
			/>
		</span>
	);
}

function Occupant({ take, wire, still, onLengths }: { take: RibbonTake } & TakeProps) {
	const props: TakeProps = { wire, still, ...(onLengths === undefined ? {} : { onLengths }) };
	if (take === "wind") return <Wind {...props} />;
	if (take === "aperture") return <Aperture {...props} />;
	if (take === "spin") return <Spin {...props} />;
	if (take === "rest") return <Rest {...props} />;
	if (take === "count") return <Count {...props} />;
	return <Wound {...props} />;
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
	wire,
	still,
	view,
	hold,
	onLengths,
}: {
	entries: readonly PlayEntry[];
	take: RibbonTake;
	wire: Wire;
	still: boolean;
	view: RefObject<HTMLDivElement | null>;
	hold: RefObject<HTMLSpanElement | null>;
	onLengths: (total: number) => void;
}) {
	const [follow, setFollow] = useState(true);

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
				className="pages-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-6 pb-10"
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
			<span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-bg" />
			<div
				data-wait-part="ribbon"
				className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center px-3.5"
				style={{ height: SLOT_H }}
			>
				<span ref={hold} className="flex w-fit items-center">
					<Occupant take={take} wire={wire} still={still} onLengths={onLengths} />
				</span>
			</div>
		</div>
	);
}

/* ---------- the box under it ---------- */

/**
 * The composer footer at #184's resolved shape: the model and the stop and nothing else, the
 * name truncating and never shortening, the stop `shrink-0`.
 *
 * Nothing this row proposes goes in here, and it is measured on every frame anyway — the row
 * drawn twice with an invisible `w-max` copy asked how wide it wants to be, the way
 * `agent-footer-fit` does it. A take that claimed to be free and quietly cost the footer 24px
 * would be caught by exactly this number and by nothing else.
 *
 * **The chip is why it is drawn at all here.** Its 2px `bg-thread/55` bar is the selection's
 * accent, nine pixels below the slot, and it is the thing an always-red mark would be
 * competing with. Both are on screen in every frame of this row, so the accent question is
 * being looked at rather than reasoned about.
 */
function Composer({
	running,
	onStop,
	onWanted,
}: {
	running: boolean;
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

/** the six states with the live one lit, so the loop can be read while it runs */
function Trace({ state }: { state: Work }) {
	return (
		<div className="flex flex-wrap items-baseline gap-x-2 font-mono text-2xs leading-4">
			{WORK_ORDER.map((work) => (
				<span key={work} className={cn(work === state ? "text-text" : "text-muted/30")}>
					{work}
				</span>
			))}
		</div>
	);
}

/** the wire a swatch stands in for, built rather than captured: a still is not a moment */
function asWire(state: Work): Wire {
	return {
		state,
		load: state === "idle" ? 0 : state === "sent" ? 1 : 2,
		out: state === "sent",
		on: state !== "idle",
	};
}

/**
 * What `prefers-reduced-motion` draws, one swatch per state the take distinguishes.
 *
 * #161 found the trap this answers: freezing a spinner is pixel-identical to what reduced
 * motion already renders for a *working* row, so a fallback that only stops can land on top
 * of a meaning the rail already has. A sentence cannot settle that, so it is drawn.
 *
 * It is one swatch per state rather than one per take because that is where the takes
 * actually differ. A take whose states are only rates collapses to one picture the moment the
 * motion stops, and the row of swatches shows it collapsing; `count`, whose states are shapes,
 * keeps all of them. Not a switcher — nothing about the rail above changes, and no take is
 * drawn twice. These are readings of one property, the way the meters are readings of one
 * number.
 */
function Fallback({ take }: { take: RibbonTake }) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-start gap-2">
				{SPECS[take].shows.map((state) => (
					<div key={state} className="flex flex-col items-center gap-1">
						<span className="flex h-11 w-12 items-center justify-center rounded-sm border border-border bg-bg">
							<Occupant take={take} wire={asWire(state)} still />
						</span>
						<span className="font-mono text-2xs text-muted/45 leading-3">{state}</span>
					</div>
				))}
			</div>
			<p className="font-mono text-2xs text-muted/60 leading-4">{SPECS[take].collides}</p>
		</div>
	);
}

export function RibbonFrame({
	take,
	title,
	claim,
	notes,
}: {
	take: RibbonTake;
	/** what this take is, in one mono line */
	title: string;
	/** what it claims, which the meters beside it either back or do not */
	claim: string;
	notes: readonly string[];
}) {
	const spec = SPECS[take];
	const still = useReducedMotion() === true;
	const turn = useTurn(EDGE_SCRIPT.cues, HOLD);
	const elapsed = useTicker(turn.run, EDGE_SCRIPT.total, turn.waiting);
	/** the scrolling column, which is what movement is measured against */
	const view = useRef<HTMLDivElement>(null);
	/** the whole rail, which is what churn is counted over */
	const rail = useRef<HTMLDivElement>(null);
	/** whatever the take actually draws, which is what the slot meter watches */
	const hold = useRef<HTMLSpanElement>(null);
	const [wanted, setWanted] = useState<number | null>(null);
	const [outlines, setOutlines] = useState<number | null>(null);
	const onLengths = useCallback((total: number) => setOutlines(total), []);
	const { entries, waits } = edgeLog(EDGE_SCRIPT, turn, elapsed);
	const running = turn.phase === "playing";
	const shift = useShift(view, turn.run, running);
	const churn = useChurn(rail, turn.run, running);
	const slot: Slot = useSlot(hold, turn.run, running);
	const wire = wireNow(entries, waits, turn.waiting);
	const dwell = useDwell(wire.state, turn.run);
	const ink = useInk(MARK_W, MARK_H);

	/* the park is the one state a capture cannot hold, so the frame releases it itself */
	useEffect(() => {
		if (!turn.waiting) return;
		const timer = window.setTimeout(turn.resume, PARK_MS);
		return () => window.clearTimeout(timer);
	}, [turn.waiting, turn.resume]);

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

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div ref={rail} className="flex min-h-0 flex-1 flex-col">
				<Transcript
					entries={entries}
					take={take}
					wire={wire}
					still={still}
					view={view}
					hold={hold}
					onLengths={onLengths}
				/>
				<Composer running={running} onStop={turn.cut} onWanted={setWanted} />
			</div>
			<div className="flex h-[644px] shrink-0 flex-col gap-2 border-border border-t bg-surface/40 px-3.5 py-3">
				<div className="flex items-baseline gap-2">
					<span className="shrink-0 font-mono text-2xs text-text leading-3">{title}</span>
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-3">
						{running ? "running" : "resting"}
					</span>
				</div>
				<p className="font-mono text-2xs text-muted/60 leading-4">{claim}</p>
				<Trace state={wire.state} />
				<p className="h-4 overflow-hidden font-mono text-2xs text-muted/55 leading-4">{dwellLine(dwell)}</p>
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
					<Fact label="cycle">{spec.cycle}</Fact>
					<Fact label="compositor">{spec.composited}</Fact>
					<Fact label="states">{spec.states}</Fact>
					<Fact label="accent">{spec.accent}</Fact>
					<Fact label="mark">
						{MARK_W}×{MARK_H}px · 9 strands · waist at {PINCH} · ink{" "}
						{ink === null ? "…" : `${ink.px}px² (${Math.round(ink.share * 100)}%)`} against the chip's {CHIP_INK}px²
						{outlines === null ? "" : ` · outlines ${outlines} units`}
					</Fact>
					{spec.fails.length === 0 ? null : (
						<Fact label="fails">
							<span className="text-thread">{spec.fails.join(" · ")}</span>
						</Fact>
					)}
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
					<p className="font-mono text-2xs text-muted/35 leading-4">
						carried: today 4 in / 4 out a wait · 24 a turn · ttft {TTFT_MEASURED.min}/{TTFT_MEASURED.median}/
						{TTFT_MEASURED.max}ms · 56% of the turn is wait
					</p>
				</div>
			</div>
		</div>
	);
}
