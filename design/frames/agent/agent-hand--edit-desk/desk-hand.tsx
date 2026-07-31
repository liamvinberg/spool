import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { type Placed, RADIUS, S } from "./desk-field";
import { type BlockId, type Box, layout } from "./kaffe-desk";

/**
 * The grammar, re-derived from a desktop frame.
 *
 * `--ghost-loud` compiled six channels onto one wall and reported that two of them fit.
 * That verdict was measured on a phone: 329 pixels of free wall and a 44px gutter, with
 * the lane, the thread, the plate and the `shot` corners all claiming a distance from
 * the same edge and the frame's own name standing where the corners had to be struck.
 * Its own words were that there is no value that satisfies both.
 *
 * **The stand-off has no solution on a phone and it is not a problem at all on a
 * desktop frame, and nothing about the channels changed.** What changed is that the
 * frame stopped having one usable edge and started having three. Below is what each
 * part becomes.
 *
 * ## The axis, derived from the page rather than from the rectangle
 *
 * `--roster` found the axis is derived and gave the rule: a frame's only free edge is a
 * side wall, so the grip is vertical; a rail row's only free edge is the row, so it is
 * horizontal. That rule was right and its premise is gone. A desktop frame has a **561px
 * bottom edge** and a **351px right wall**, both free, so *only free edge* no longer
 * picks anything.
 *
 * The rule that replaces it: **the grip lies along the axis the page stacks along.** A
 * phone page stacks top to bottom, so the grip runs down the side wall. A desktop page
 * stacks left to right at the top level — bar, then two columns, then a band — so the
 * grip runs along the bottom. It agrees with `--roster` everywhere `--roster` had an
 * answer, and it is derived from what the frame contains rather than from the shape of
 * the box, which is the part that makes it survive a change of shape.
 *
 * Four things fall out of standing on the bottom edge and all four are wins:
 *
 *   **The name is on the opposite edge.** `--ghost-loud`'s unsolvable collision was the
 *   `shot` corners striking through `home`'s own 12px line box. From the bottom the
 *   posture never goes near it — see `sweep` below.
 *
 *   **The edge is 561 long instead of 329**, so the word runs level and the count comes
 *   back. `--plate`'s whole argument for a fixed box was that a vertical 16px column
 *   could not resize; a horizontal edge has 561px and `edit ×13` wants 57 of it.
 *
 *   **It is the one edge nothing else claims.** On a phone row the wall carries the
 *   walk graph. Here the walk graph is in the vertical gutter and in the horizontal
 *   one, and the presence is on the frame's own bottom edge — where the outgoing walk
 *   to `hours` crosses it at a right angle rather than sharing three pixels with it.
 *
 *   **The lane comes off it**, which is the whole reason the compile fits now.
 *
 * ## What replaces a y-position, which is nothing, and the measurement
 *
 * The brief's premise was that a desktop page is columns, so a height alone points at
 * three unrelated things. Measured on the real layout in `kaffe-desk.tsx`, it is the
 * other way round. Counting, for each of the nine blocks, how many other blocks its
 * span overlaps:
 *
 *     axis          mean blocks a mark cannot separate     worst
 *     y (the wall)                 1.33                    3
 *     x (the bottom edge)          5.56                    8
 *
 * **A height is four times better than a width on a desktop page**, because a desktop
 * page is still a stack of full-width bands and the columns live inside the bands. The
 * bar, the card band and the footer each span the whole measure; only the hero is split.
 * So the rotation the presence just made is exactly the rotation the *lane* must not
 * make, and the two objects come apart onto two different edges. That is the finding
 * this frame exists for: on a phone every channel is forced onto one wall and they
 * fight; give the object a bottom edge and a side wall and the same six channels fit
 * without cutting any of them.
 *
 * What a height stops being is an **identifier**. On `--ghost-loud`'s phone page the
 * seven blocks are sequential and non-overlapping, so a mark's y names exactly one
 * block, always. Here it names 1.33 on average and the two failures are the ones a
 * desktop layout is made of: three cards side by side at one height, where writes 7, 8
 * and 9 land three consecutive marks in the identical place; and a tall image beside a
 * short stack, where one mark spans the headline, the lede and the button. **A height
 * on a desktop page names the band, not the block.**
 *
 * Nothing on the wall replaces it, and the honest replacement is finally affordable:
 * `--inside`'s located box, on the frame's own surface. It needs a live document, and at
 * 561 drawn pixels this frame has one for the first time in the family — `laneLives`
 * below is **true** here and false for the phone eight pixels to its right. So the
 * frame states the gap rather than drawing a seventh channel over it: the lane survives
 * the change of shape as a band-finder, loses block-finding, and the thing that would
 * get block-finding back is a channel this canvas can now support and `--ghost-loud`'s
 * canvas could not.
 *
 * ## The ghost
 *
 * Confirmed size-independent, in the mechanism. See `ghost.tsx`: cancellation is per
 * pixel, so it does not care how many there are, and both of its constants are measured
 * against the wire rather than against the box. It is also the only channel here that
 * needs no edge, which on a canvas whose gutters are all spoken for is the difference
 * between a channel and a wish.
 *
 * Refuted size-independent in the reading, in the ghost's favour. A reflow's blast
 * radius is the width of the column it happens in: 34.2% here against a phone's 92.7%,
 * with the loudest of the thirteen writes measuring 14.1% against `--ghost-loud`'s 57.8%.
 * The reading that most nearly killed the direction — *at 57.8% the frame is two whole
 * pages printed over each other and which one is the past is unanswerable* — is a phone
 * problem.
 */

/* ---------- what the hand is doing ---------- */

/** the edge whole, or a segment of it */
export type Hold = "whole" | "part";

/** one write, still on the wall */
export interface Trace {
	/** the block, and which write put it there — a second write to one block restarts the mark rather than stacking */
	readonly key: string;
	readonly block: BlockId;
	/** the block's box at the revision the write made, which is not the revision the canvas is showing */
	readonly box: Box;
}

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** writes landed so far in a run, so the plate counts the way the row counts */
	readonly count: number;
	/** the `shot` call is open: the ink leaves the edge and runs three sides of the box */
	readonly picturing: boolean;
	/** every block a landed write named, newest last */
	readonly traces: readonly Trace[];
}

/**
 * Which verbs change the frame, and which only take it in. Inherited without argument:
 * three postures absorb five verbs. This capture plays `write`, `shot`, `look`, `logs`
 * and `edit`, and `read`, which it happens not to contain, lands in the posture it
 * already belongs to.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/** where the agent is and what it has left behind, read off the same rows the rail is reading */
export function handOf(script: Script, turn: Turn, lands: readonly BlockId[]): Hand | null {
	if (turn.phase !== "playing") return null;
	const reached = script.rows.filter((row): row is ToolRow => row.kind === "tool" && turn.at(row.cue));
	const named = reached.filter((row) => row.frame !== null);
	const last = named.at(-1);
	if (last === undefined) return null;
	const open = named.filter((row) => row.doneCue === null || !turn.at(row.doneCue)).at(-1) ?? null;
	const on = open ?? last;
	const frame = on.frame;
	if (frame === null) return null;
	const landed = on.runs ? on.children.filter((child) => turn.at(child.cue)).length : 0;
	return {
		frame,
		hold: HOLD[on.verb] ?? "whole",
		verb: open === null ? null : open.verb,
		count: open === null ? 0 : landed,
		picturing: open !== null && open.verb === "shot",
		traces: tracesOn(script, turn, frame, lands),
	};
}

/**
 * The writes that have landed, one mark per block, each carrying the box the block had
 * at the moment its write made it.
 *
 * A block written twice carries one mark that restarts rather than two stacked: the
 * wall says *here, again, just now*, and how many times is the plate's and the rail's.
 * `write home` at 117ms is `frames/home/frame.json`, so geometry moved the rectangle
 * and left the design alone, and it is deliberately not marked.
 */
function tracesOn(script: Script, turn: Turn, frame: string, lands: readonly BlockId[]): readonly Trace[] {
	const latest = new Map<BlockId, number>();
	let index = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) {
			const block = lands[index];
			index += 1;
			if (block === undefined || !turn.at(child.cue)) continue;
			latest.set(block, index);
		}
	}
	return [...latest].map(([block, nth]) => ({ key: `${block}:${nth}`, block, box: layout(nth)[block] }));
}

/* ---------- the edge the object stands on ---------- */

export type Axis = "x" | "y";

/**
 * Which axis the grip lies along, from the page rather than from the box.
 *
 * A desktop page stacks left to right at its top level, so the grip runs along the
 * bottom. A phone page stacks top to bottom, so it runs down a side wall, which is
 * `--presence`'s object unchanged and is drawn on five other frames in this row.
 *
 * The capture only ever puts the agent on `home`, so only the horizontal branch runs
 * here. The vertical one is written out because the object has to be the same object on
 * either axis, and because a rule with one branch is an assertion rather than a
 * derivation.
 */
export function axisOf(frame: Placed): Axis {
	return frame.shape === "desk" ? "x" : "y";
}

interface Edge {
	readonly axis: Axis;
	/** the coordinate of the line the object stands on, measured across the axis */
	readonly line: number;
	/** the middle of the edge, measured along the axis */
	readonly mid: number;
	/** which way is out of the frame, across the axis */
	readonly out: 1 | -1;
	/** how long the edge is */
	readonly span: number;
}

/**
 * How far outside the edge the presence's centre line sits.
 *
 * `--presence` stands at 6, `--accrue` at 12, and `--ghost-loud` was forced to 15 by
 * four objects wanting the same strip. Here the only thing on this edge is the presence
 * itself, so the number is set by the plate alone: 8 of half-plate and 4 of air.
 * **Twelve, and it costs nothing**, because the frame's name is on the opposite edge
 * and the horizontal gutter below is 40px of clear canvas before the next frame's name
 * starts.
 */
const OUT = 12;

function edgeOf(box: Placed, axis: Axis): Edge {
	if (axis === "x") {
		return { axis, line: box.y + box.h + OUT, mid: box.x + box.w / 2, out: 1, span: box.w };
	}
	return { axis, line: box.x + box.w + OUT, mid: box.y + box.h / 2, out: 1, span: box.h };
}

/** a point on the edge's own coordinates, put back into the canvas's */
function at(edge: Edge, along: number, across: number): { x: number; y: number } {
	return edge.axis === "x" ? { x: along, y: across } : { x: across, y: along };
}

/* ---------- the object ---------- */

const THREAD = 2;
/**
 * The segment a `write` or an `edit` holds, as a fraction of the edge.
 *
 * `--presence` fixed it at 76 of a phone's 329px wall, which is 23.1%. `--roster` found
 * the fraction does not survive the fall to a 28px rail row and has to become an
 * ordinal. It survives this change intact, because a 561px edge is still an edge: 23.1%
 * of it is **130**, which reads as a segment of a line rather than as a line.
 */
const PART = 0.231;
/** the plate shut: `--presence`'s head, built the way the plate is built */
const REST = 9;
/** across the edge, always. The plate never changes this number on either axis */
const PLATE_THICK = 16;
/**
 * The plate open, and the number a phone could not afford.
 *
 * `--plate` fixed the box at 38 because the verb vocabulary is closed at `label()` and
 * `write` is the longest at 30.9px. `--ghost-loud` restored the count, found `edit ×6`
 * wanted 51, and listed the count as the first thing to cut — because a run length is
 * unbounded and the plate's only structural guarantee was that it never resizes.
 *
 * Both facts still hold and the conclusion flips. The plate is fixed at **57**, which is
 * `edit ×13` at `--plate`'s measured 6.18px a glyph with 3.5 of air each end, and 13 is
 * this turn's whole output. It never resizes, and 57 of a 561px edge is **10% of one
 * side of the frame** against 51 of a 329px wall's 15% *plus* the three pixels of
 * stand-off it forced on everything else. The count is affordable at this shape and was
 * not at that one.
 */
const MONO_2XS = 6.18;
const PLATE_PAD = 3.5;
const PLATE_LONG = Math.ceil("edit ×13".length * MONO_2XS + 2 * PLATE_PAD);
/** the plate opening or shutting; the word cuts, the shape moves */
const SHUT_MS = 0.2;

/* the lane's own claim, against the frame's wall */
const MARK_IN = 2;
const MARK_W = 3;
const MARK_THIN = 1;

/** how far a slack thread lies off the straight, and how long one lie of it runs */
const SLACK = 4;
const WAVE = 46;
/** one write, drawn as a pluck on a line that is already taut */
const PLUCK = 1.6;
/**
 * The envelope, and it is the whole answer to a 186ms call. Tension arrives on the
 * instant and slack comes back slowly, which is what a thread does. Five of the twelve
 * calls run under 320ms, so a symmetric channel toggles twelve times and blinks.
 */
const TAUT_MS = 0.09;
const SLACK_MS = 0.32;
const INK = 0.78;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * How long a write stays on the wall, in seconds, and the beat it holds at full before
 * it starts going. `--accrue` measured the window at [4.84, 6.14] and nothing about the
 * frame's shape moves it: the numbers are the capture's run lengths and gaps.
 */
const LIFE = 6;
const RISE = 0.08;
const HELD = 0.7;
const PEAK = 0.9;

/**
 * How wide a frame must draw before the canvas mounts its document — `src/cover.ts:8`,
 * enforced at `lifecycle.ts:245` as `frame.w * camera.k < LIVE_MIN_CSS_PX`.
 *
 * **This is the line the desktop frame crosses and the phone beside it does not.** At
 * 561 the lane's heights come off a real DOM; at 152 there is no document to resolve a
 * write's line against and the honest lane is no lane. `--accrue` and `--ghost-loud`
 * both drew it anyway behind a `DIAGRAM` constant, stating the fiction at the line that
 * introduced it, because a frame that correctly draws nothing cannot be judged. **There
 * is no `DIAGRAM` in this file.** Nothing here is faked; the heights are obtainable at
 * the size this frame is drawn.
 */
const LIVE_MIN_CSS_PX = 400;

export function laneLives(drawn: number): boolean {
	return drawn >= LIVE_MIN_CSS_PX;
}

/**
 * The `shot` posture: the grip's own ink leaving the edge and running three sides of the
 * frame, stopping where the fourth would start.
 *
 * `--ghost` broke the ring into four corners because a closed rectangle outside a frame
 * is a selection ring — spool's own `Slot` draws that shape at `inset: -1` — and it paid
 * for that with the reading the posture was built on: four corners cannot leave the
 * head, so they arrive as their own mark and the shot stops being one object changing
 * shape. `--ghost-loud` named that as the cost and could not get it back.
 *
 * **Standing on the bottom edge gets it back.** Two halves leave the head, run out along
 * the bottom, around the two bottom corners, up the side walls, and stop at the tangent
 * point where the top corners would begin. It is one object and it is unmistakably not
 * closed: the gap is the top edge and both of its corners, **612 of a 1,879px perimeter,
 * a third of the whole thing**.
 *
 * And it is not near the name, on either axis. `--ghost-loud` proved the collision
 * structural because a corner's horizontal arm runs from `frame.x + RADIUS` to `ARM`
 * past it whatever the stand-off is, and the name sets from `frame.x` — so the arm lands
 * on the glyphs and the one number in play only moves y. **The sweep has no horizontal
 * arm at the top at all.** Its only ink up there is two vertical runs at x 2 and x 587,
 * outside both walls, ending at y 58; the name's box is x 14 to 44, y 29 to 41, inside
 * the left wall. Nearest ink to nearest glyph is twelve pixels left and seventeen below.
 * The collision is answered by the shape rather than by a number.
 *
 * It does not generalize to a side wall, and that is the honest half. From the middle of
 * a wall the two halves are asymmetric — one runs a side and a half, the other runs half
 * a side — and the edge you would have to leave undrawn to clear the name is the top,
 * which neither half reaches naturally. A side-wall `shot` is `--ghost`'s four corners
 * and stays that way. So this is not one posture drawn twice: it is a better posture the
 * desktop edge affords and the phone edge does not.
 */
function sweep(box: Placed): { d: readonly string[]; len: number } {
	const r = RADIUS + OUT;
	const x0 = box.x - OUT;
	const x1 = box.x + box.w + OUT;
	const y0 = box.y - OUT;
	const y1 = box.y + box.h + OUT;
	const mid = box.x + box.w / 2;
	return {
		d: [
			`M ${mid} ${y1} H ${x0 + r} A ${r} ${r} 0 0 1 ${x0} ${y1 - r} V ${y0 + r}`,
			`M ${mid} ${y1} H ${x1 - r} A ${r} ${r} 0 0 0 ${x1} ${y1 - r} V ${y0 + r}`,
		],
		len: box.w / 2 - RADIUS + (Math.PI * r) / 2 + (box.h - 2 * RADIUS),
	};
}

/**
 * The wall run, sampled.
 *
 * One line through the head, `length` long, displaced across the edge by a sine with a
 * node at the head — so the thread passes through its own core at every amplitude and
 * only the lie of it changes. Written once for both axes, which is what makes the
 * rotation a rotation rather than a second object.
 */
function strand(edge: Edge, length: number, amp: number): string {
	if (length < 1) return "";
	const half = length / 2;
	const steps = Math.max(2, Math.round(length / 4));
	const points: string[] = [];
	for (let step = 0; step <= steps; step += 1) {
		const along = -half + (length * step) / steps;
		const across = edge.line + edge.out * amp * Math.sin((2 * Math.PI * along) / WAVE);
		const point = at(edge, edge.mid + along, across);
		points.push(`${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
	}
	return `M ${points.join(" L ")}`;
}

/**
 * The layer, over the field.
 *
 * The whole answer to travel is the `key`. A presence keyed on the frame it is at cannot
 * move between two frames: it lets go here and takes hold there, both at once, which is
 * what the wire says.
 */
export function DeskHandLayer({ hand, frames }: { hand: Hand | null; frames: readonly Placed[] }) {
	const on = hand === null ? null : (frames.find((frame) => frame.name === hand.frame) ?? null);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || on === null ? null : <Held key={hand.frame} hand={hand} box={on} />}
			</AnimatePresence>
		</div>
	);
}

function Held({ hand, box }: { hand: Hand; box: Placed }) {
	const still = useReducedMotion() === true;
	const axis = axisOf(box);
	const edge = edgeOf(box, axis);
	const trace = sweep(box);
	const live = hand.verb !== null;
	const held = hand.picturing ? 0 : hand.hold === "whole" ? edge.span : Math.round(edge.span * PART);

	// two numbers and one line. Length is the hold and moves at the pace a posture
	// changes; amplitude is the pull and moves at the pace a call opens
	const length = useMotionValue(held);
	const amp = useMotionValue(live ? 0 : SLACK);
	const path = useTransform([length, amp], (latest: number[]) => strand(edge, latest[0] ?? 0, latest[1] ?? 0));

	useEffect(() => {
		const run = animate(length, held, { duration: still ? 0 : 0.22, ease: ARRIVE });
		return () => run.stop();
	}, [held, length, still]);

	useEffect(() => {
		const run = animate(amp, live ? 0 : SLACK, {
			duration: still ? 0 : live ? TAUT_MS : SLACK_MS,
			ease: live ? "easeOut" : "easeInOut",
		});
		return () => run.stop();
	}, [live, amp, still]);

	// a write is a pluck rather than a length, which is `--spool`'s correction of the
	// parent: flicking the segment longer spends the posture channel on an event and says
	// the hold changed when it did not
	useEffect(() => {
		if (hand.count === 0 || !live || still) return;
		const run = animate(amp, [PLUCK, 0], { duration: 0.24, ease: "easeOut" });
		return () => run.stop();
	}, [hand.count, live, amp, still]);

	const word = hand.verb === null ? "" : hand.count > 1 ? `${hand.verb} ×${hand.count}` : hand.verb;
	const plate = plateBox(edge, live);

	return (
		<>
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
				fill="none"
				aria-hidden="true"
			>
				{/* the thread on the edge. It arrives and leaves by winding off and back onto
				    the head rather than by fading, so taking hold and letting go are the same
				    gesture in two directions */}
				<motion.path
					d={path}
					stroke="var(--color-text)"
					strokeOpacity={INK}
					strokeWidth={THREAD}
					strokeLinecap="round"
					initial={{ pathLength: 0, pathOffset: 0.5 }}
					animate={{ pathLength: 1, pathOffset: 0 }}
					exit={{ pathLength: 0, pathOffset: 0.5 }}
					transition={{ duration: still ? 0 : 0.24, ease: ARRIVE }}
				/>
				{/* the `shot` posture, and the one part of the compile that is better at this
				    shape rather than merely unblocked: three sides, open by a third of the
				    perimeter, and nowhere near the name */}
				{axis === "x"
					? trace.d.map((d) => (
							<motion.path
								key={d}
								d={d}
								stroke="var(--color-text)"
								strokeOpacity={0.75}
								strokeWidth={1.5}
								strokeLinecap="round"
								strokeDasharray={trace.len}
								initial={{ strokeDashoffset: trace.len }}
								animate={{ strokeDashoffset: hand.picturing ? 0 : trace.len }}
								exit={{ strokeDashoffset: trace.len }}
								transition={{ duration: still ? 0 : hand.picturing ? 0.34 : 0.22, ease: ARRIVE }}
							/>
						))
					: null}
			</svg>

			{/* the lane, on the side wall, whichever edge the presence went to. On a phone the
			    two share one wall and fight over five pixels of it; here they are on different
			    edges of the same frame and neither knows the other is there */}
			{laneLives(box.w)
				? hand.traces.map((mark) => <Mark key={mark.key} mark={mark} box={box} still={still} />)
				: null}

			{/* the plate: the participant, and the word it is holding with its count. Shut it
			    is `--presence`'s head and it means the agent is here with nothing open; open it
			    is the same box grown along the edge with one word standing in it */}
			<motion.span
				className="absolute overflow-hidden rounded-[2px] border border-muted bg-canvas"
				initial={{ ...plate.shut, opacity: 0 }}
				animate={{ ...plate.now, opacity: 1 }}
				exit={{ ...plate.shut, opacity: 0 }}
				transition={{ duration: still ? 0 : SHUT_MS, ease: ARRIVE }}
			>
				{/* the word runs along the edge, which on the bottom edge means it runs the way
				    words run. `--ghost-loud` had to stand it on its side to live in a 16px
				    column; nothing is rotated here and the count sets beside the verb */}
				<motion.span
					className="absolute whitespace-nowrap font-mono text-2xs text-text leading-3"
					style={{
						left: "50%",
						top: "50%",
						transform: `translate(-50%, -50%)${axis === "y" ? " rotate(-90deg)" : ""}`,
					}}
					initial={{ opacity: 0 }}
					animate={{ opacity: live ? 1 : 0 }}
					transition={{ duration: still ? 0 : 0.1, ease: "linear" }}
				>
					{word}
				</motion.span>
			</motion.span>
		</>
	);
}

/**
 * The plate's box, shut and now.
 *
 * It grows out of its node along the edge rather than around it, which is `--plate`'s
 * own fix, and the anchor is the head's near corner so the object is the same object on
 * either axis.
 */
function plateBox(
	edge: Edge,
	live: boolean,
): {
	shut: { left: number; top: number; width: number; height: number };
	now: { left: number; top: number; width: number; height: number };
} {
	const long = live ? PLATE_LONG : REST;
	const thick = live ? PLATE_THICK : REST;
	const start = edge.mid - REST / 2;
	if (edge.axis === "x") {
		return {
			shut: { left: start, top: edge.line - REST / 2, width: REST, height: REST },
			now: { left: start, top: edge.line - thick / 2, width: long, height: thick },
		};
	}
	return {
		shut: { left: edge.line - REST / 2, top: start, width: REST, height: REST },
		now: { left: edge.line - thick / 2, top: start, width: thick, height: long },
	};
}

/**
 * One write, on the wall, going out.
 *
 * It mounts when its cue fires, so the clock is the capture's own and no ticker is in
 * the path. Ink carries the age, width carries it again so a stale mark reads as residue
 * rather than as a live mark somebody drew faintly, and the mark thins toward the frame.
 * The decay is linear after a 0.7s hold at full, because the one thing the lane has to
 * keep legible is the order of a run.
 *
 * **The three marks this frame is about are writes 7, 8 and 9.** They are three
 * consecutive writes to three cards that stand side by side, so all three land on the
 * same **57 drawn pixels** of wall, three times, seconds apart, and the wall cannot say
 * which card. Nothing is broken and nothing is faked; a wall has one axis and the page
 * put three blocks on it. The second case is writes 5 and 12, both to the image column,
 * whose mark spans the headline, the lede and the button as well.
 */
function Mark({ mark, box, still }: { mark: Trace; box: Placed; still: boolean }) {
	// the frame's own y, at the scale the canvas is drawing it, taken from the layout the
	// write itself produced — so a mark laid down at write 2 stays level with the page
	// write 2 made, which is not the page write 12 leaves behind
	const top = box.y + mark.box.y * S;
	const height = Math.max(4, mark.box.h * S);
	const inner = box.x + box.w + MARK_IN;
	return (
		<motion.span
			className="absolute rounded-[1px] bg-text"
			style={{ top, height, left: inner }}
			initial={{ opacity: 0, width: MARK_W }}
			animate={{ opacity: [0, PEAK, PEAK, 0], width: [MARK_W, MARK_W, MARK_W, MARK_THIN] }}
			exit={{ opacity: 0, transition: { duration: still ? 0 : 0.24, ease: ARRIVE } }}
			transition={
				still
					? { duration: 0 }
					: { duration: LIFE, times: [0, RISE / LIFE, HELD / LIFE, 1], ease: ["easeOut", "linear", "linear"] }
			}
		/>
	);
}
