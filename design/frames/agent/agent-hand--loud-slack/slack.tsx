import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { type BlockId, layout } from "./home-slack";

/**
 * The compile's wall, with the presence rebuilt so the thread carries a quantity.
 *
 * `agent-hand--spool` gave the thread two positions. Taut while a call is open, slack
 * while none is, on a 90ms-on / 320ms-off envelope that was derived rather than
 * chosen. It is a good object and it is a boolean in a physical costume: a thread can
 * be under a hundred kilos or under one, and that frame draws both the same.
 *
 * **Here the thread has a load, and the load is a number.** What hangs on it is what
 * the agent is holding at this frame right now: nothing between calls, one for a call
 * that does one thing, and for a run of writes, however many writes the run has landed
 * so far. The line bows away from the frame in proportion. Six writes deep, the bow is
 * 11 pixels. One `look`, it is 4.7. In the dead air it is nothing at all and the line
 * is straight.
 *
 * **That inverts `--spool`'s polarity and the inversion is the whole decision.** There,
 * slack meant idle and taut meant working. A quantity needs a zero, and slack is not a
 * zero — it is the maximum of a different quantity. So the null state here is a
 * straight, still line, and every departure from straight is load. The reader gets a
 * ruler for free: the unloaded run of the same thread, at the same x, immediately
 * above the loaded span.
 *
 * **The load hangs below the anchor and the word stands above it.** The plate opens
 * upward out of the head for 38 pixels; the loaded span is the 38 pixels directly
 * below it. They never meet, which is what makes it possible to keep both, and it
 * divides the wall along a line a reader can state: above the head is what the agent
 * is doing, below it is how much.
 *
 * **The span is fixed at 38 and does not follow the posture.** Length is the kind of
 * hold and it moves between 329 and 76; if the bow spanned half of whatever that is,
 * one write during a `look` would be a 4.7px lie over 164 pixels and one write during
 * a run would be the same 4.7 over 38, and the second would look like far more load
 * than the first. Fixing the span makes depth the only thing that varies, which is the
 * point of having a quantity at all.
 *
 * **The pluck is gone and that is a deletion rather than an omission.** `--spool` and
 * the compile both flick the line on every write, on the argument that a write is an
 * event and events belong on the tension channel. Here a write *is* a step of load, so
 * the line already drops on every one of them. A shiver on top of a step is the same
 * event drawn twice.
 *
 * **What it costs.** The steps compress: 0 to 1 is 4.7 pixels, 5 to 6 is 0.6. So the
 * curve is honest about the reading it can support and dishonest about the one it
 * cannot, and the frame's own verdict on that is in `frame.tsx`. And the assembly is
 * wider: the compile reached 23 pixels into a 44px gutter, this reaches 27 at the
 * capture's peak and 31 if a run ever gets long enough to saturate.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/**
	 * What is on the thread. Nothing between calls, one for a call that does one thing,
	 * and the run's landed writes for a run — so a run gets heavier as it goes and lets
	 * go all at once when it closes.
	 */
	readonly load: number;
	/** the `shot` call is open: the ink leaves the wall and goes to the corners */
	readonly picturing: boolean;
	/** the blocks the open run has written, newest last, and empty the moment it closes */
	readonly traces: readonly BlockId[];
}

/**
 * Which verbs change the frame, and which only take it in.
 *
 * Three postures absorb five verbs, inherited from every frame in this family without
 * argument. This capture plays `write`, `shot`, `look`, `logs` and `edit`, and `read`,
 * which it happens not to contain, lands in the posture it already belongs to with
 * nothing new drawn.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is and what it is carrying, read off the same rows the rail reads.
 *
 * When no call is open the hand falls back to the last row that had one: the agent is
 * between calls and has not gone anywhere, so the object keeps its posture, drops its
 * word, and puts its load down. That last part is the change — the compile's hand
 * reported a count that only ever meant *how many the plate should print*, and this one
 * reports a weight the drawing is going to hang off a line.
 */
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
		// a call that does one thing weighs one. Only a run weighs what it has done
		load: open === null ? 0 : open.runs ? landed : 1,
		picturing: open !== null && open.verb === "shot",
		traces: open === null ? [] : tracesOn(script, turn, open, lands),
	};
}

/**
 * The blocks the open run has written, one mark each.
 *
 * **This is `agent-hand--ghost-lane`'s rule with its clock corrected, and the
 * correction cost it its subject.** There a mark stood until its own photograph landed,
 * so the lane was exactly the writes the picture had not shown yet — a real quantity
 * with a real end and no constant in it. On the write clock the picture is never
 * behind: the canvas redraws on the write, `written` and `shown` are the same number at
 * every instant, and that backlog is empty for all 37.7 seconds. It is not a smaller
 * quantity here, it is the zero function.
 *
 * What survives is the shape of the rule rather than the quantity: **a mark stands
 * until the work it belongs to is finished, and the work is the run.** The run's close
 * is an event on the wire, so there is still nothing chosen. What the lane now reports
 * is *where this run has been so far*, which is a set — a block written twice is one
 * mark, and how many times is the thread's job and the rail's.
 *
 * Run 2 is where the two channels visibly disagree and it is worth watching for: four
 * writes into two blocks, so the thread bows to load 4 while the lane holds two marks.
 */
function tracesOn(script: Script, turn: Turn, open: ToolRow, lands: readonly BlockId[]): readonly BlockId[] {
	if (open.verb !== "edit") return [];
	const seen: BlockId[] = [];
	let index = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== open.frame || row.verb !== "edit") continue;
		const mine = row.cue === open.cue;
		for (const child of row.children) {
			const block = lands[index];
			index += 1;
			if (!mine || block === undefined || !turn.at(child.cue)) continue;
			if (!seen.includes(block)) seen.push(block);
		}
	}
	return seen;
}

/* ---------- the field's geometry, copied ----------
 * `spool-play-field.tsx` has no slot for another layer and shared/ is not this frame's
 * to change, so everything here is a sibling of the field drawn in the same
 * coordinates. That holds exactly as long as the camera is still, which is why this
 * frame never centres on anything. */

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const FW = 152;
const FH = 329;
/** the frame's own corner, so the corners can be struck concentric with it */
const RADIUS = 12;
/** what a frame is authored at, so a block's box becomes a height on the wall */
const NAT_W = 240;
const S = FW / NAT_W;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the object ---------- */

/**
 * How far outside the wall the presence's centre line sits, and it is the compile's 15
 * unchanged.
 *
 * Forced rather than chosen, by the same arithmetic: the lane claims the five pixels
 * nearest the frame, the plate is 16 wide and centred on this line, and two pixels of
 * air between them is the least that keeps them from reading as one object. The bow
 * changes none of that, because the bow only ever goes outward.
 */
const OUT = 15;

/**
 * Where the `shot` corners are struck, and this is the one number the compile could not
 * find a value for.
 *
 * It measured the collision exactly: struck from `OUT`, the corners' top rail sits at
 * `ROW_1 - 15 = 31` and the frame's own name sets in a 12px line box running y 29 to
 * 41, so the name is struck; the corners clear it only below 6 and the lane plus the
 * presence need at least 9; there is no single value that satisfies both. It also named
 * the only escape that deletes no channel — **decouple the corners from the stand-off**
 * — and did not take it. This takes it. The corners are struck at 6, the top rail is at
 * y 40, and the name clears by a pixel.
 *
 * The cost is the reading that the shot ink is the grip's own leaving the wall. That
 * reading was already mostly spent: `agent-hand--ghost` broke the ring into four
 * corners because a closed rectangle outside a frame is a selection ring, and four
 * corners cannot be a path a line walks out onto and back. What is left to lose is the
 * shared distance, and it buys the frame's name back.
 */
const SHOT_OUT = 6;

const THREAD = 2;
const PART = 76;
/** the plate shut: the parent's head, built the way the plate is built */
const REST = 9;
const PLATE_W = 16;

/**
 * The plate open, and it is `--plate`'s own 38 rather than the compile's 51.
 *
 * The compile grew it to hold `edit ×6` and named that its first cut, because *the
 * plate never resizes* was the whole of what the object bought over a chip and a run
 * length has no bound: `edit ×13` wants 56 and a hundred-write run wants 63. The count
 * comes off here for that reason and for one more — **the bow is the count**, drawn as
 * weight nine pixels away. So the vocabulary is closed again at `label()`, `write` is
 * the longest at 30.9px (6.18 a glyph at 10px Fragment Mono), and 30.9 plus 3.5 of air
 * at each end is 38.
 */
const MONO_2XS = 6.18;
const PLATE_PAD = 3.5;
const PLATE_H = Math.ceil("write".length * MONO_2XS + 2 * PLATE_PAD);
/** the plate opening or shutting; the word cuts, the shape moves */
const SHUT_MS = 0.2;

/* the lane's own claim, against the frame's edge and inside everything else */
const MARK_IN = 2;
const MARK_W = 3;
/**
 * What a mark is worth. `--ghost-lane`'s 0.55: under the thread's own 0.78 while a call
 * is open, and the loudest thing on the wall in the dead air, because in the dead air
 * the run's shape is the only news.
 */
const MARK_INK = 0.55;
/** an arrival is an event, so it is quick and it is not eased in from nothing */
const MARK_RISE = 0.12;

/**
 * How deep the bow goes, and how quickly it gets there.
 *
 * `BOW_MAX` is an asymptote rather than a maximum, so no run length can push the object
 * out of the gutter: the reach is `OUT + BOW_MAX + 1` = 31 of 44 in the worst case a
 * hundred writes could produce, and 27 at this capture's own peak of six.
 *
 * `BOW_K` sets where the curve spends its range, and it spends most of it on the first
 * unit on purpose: nothing to something is the largest change of meaning available, so
 * it gets the largest step. The depths are 0, **4.7, 7.1, 8.7, 9.7, 10.4, 11.0** for
 * loads 0 through 6, which is 4.7 for the first and 0.6 for the sixth.
 */
const BOW_MAX = 15;
const BOW_K = 2.2;

/**
 * The span the load hangs in, directly below the head, and it is the plate's own 38
 * mirrored.
 *
 * Fixed rather than proportional to the posture, so depth is the only thing that
 * varies. Above the head, 38 pixels of plate; below it, 38 pixels of loaded thread; and
 * whatever the posture is, the rest of the run carries on straight.
 */
const SPAN = 38;

/**
 * The envelope, and its justification is weaker here than in `--spool`, which is worth
 * saying.
 *
 * There the asymmetry was load-bearing: five of the twelve calls run under 320ms, so a
 * symmetric channel toggled twelve times in 37 seconds and blinked, and 90-on against
 * 320-off meant a burst of short calls never let go of taut. On the write clock nothing
 * needs defending — the shortest call in this window is 186ms and the shortest gap
 * between two calls is 741ms, so every call reaches its full depth and every gap
 * returns to straight whatever the numbers are. What is left is that a weight arriving
 * is instant and a line coming back is not, which is true and is no longer proof.
 */
const LOAD_MS = 0.09;
const SHED_MS = 0.32;

/** the thread's one strength: it never changes, because the agent is never half here */
const INK = 0.78;

/** how far past the arc each corner arm runs */
const ARM = 11;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * How wide a frame must draw before the canvas mounts its document — `src/cover.ts:8`,
 * enforced at `lifecycle.ts:245` as `frame.w * camera.k < LIVE_MIN_CSS_PX`.
 */
const LIVE_MIN_CSS_PX = 400;

export function laneLives(drawn: number): boolean {
	return drawn >= LIVE_MIN_CSS_PX;
}

/**
 * The one fiction in this frame, named at the line that introduces it.
 *
 * `spool-play-field.tsx` draws every frame at 152px, so `laneLives(152)` is false and
 * the honest lane here is no lane: below the threshold there is no document to resolve
 * a write's line against and a mark's height cannot be obtained at all. `--accrue`
 * overrode that because a frame that correctly draws nothing cannot be judged, and it
 * is inherited with the same reason.
 *
 * **The fiction is now smaller than it was, and by the same fact that killed the
 * backlog.** Below the threshold the frame is a stored photograph, so nothing on the
 * canvas redraws on a write and the whole spine of this frame is unavailable there. The
 * frame this drawing is really about is the one above 400 drawn pixels, where the
 * document is live, `data-spool-source` resolves a line to a box, and the lane's
 * heights are obtainable rather than staged.
 */
const DIAGRAM = true;

/**
 * What the whole assembly claims of the gutter it docks in.
 *
 * The lane reaches 5 out from the wall, the plate reaches `OUT + PLATE_W / 2` = 23, and
 * the bow reaches `OUT + bow + 1`: **27 at this capture's deepest load and 31 at the
 * asymptote**. The gutter here is 44, so it fits and never has to be shed, and the cost
 * against the compile is four pixels the compile did not spend.
 */
const NEED = 33;

export type Side = "left" | "right";

/**
 * Which wall.
 *
 * The tie breaks right, inherited from `--accrue` and unchanged. A walk arrow's head
 * lands on a frame's **left** wall — `spool-play-field.tsx` draws it at `x - 9`,
 * `ROW_1 + 186` — so on a frame with equal 44px gutters, breaking left would put the
 * lane, the thread and the plate underneath an accent-coloured triangle.
 *
 * The residual is the compile's, and the bow makes it slightly worse: the outgoing edge
 * leaves at `x + w + 3`, `ROW_1 + 158`, which is x 465, y 204. That is inside the lane's
 * 464 to 467, and the loaded span runs from y 210 down to y 248, so a deep bow at
 * `whole` posture now also passes within a few pixels of where that edge sets off.
 */
export function dockOf(index: number, count: number): { side: Side; words: boolean } {
	const here = COLS[index] ?? 0;
	const before = COLS[index - 1];
	const after = COLS[index + 1];
	const left = index === 0 || before === undefined ? here : here - (before + FW);
	const right = index === count - 1 || after === undefined ? VIEW_W - (here + FW) : after - (here + FW);
	return { side: left > right ? "left" : "right", words: Math.max(left, right) >= NEED };
}

/**
 * The four corners a `shot` puts the ink at, each drawn from one arm around the arc to
 * the other, struck at `SHOT_OUT` rather than at the presence's own stand-off.
 *
 * `--ghost` established that a closed rectangle outside a frame is a selection ring —
 * spool's own `Slot` draws that exact shape at `inset: -1` — and held for the 670 to
 * 750ms a `spool shot` takes it will be read as one. So it is four corners, and a corner
 * is not a ring at any weight because it is not closed.
 */
function corners(box: { x: number; y: number; w: number; h: number }): { d: readonly string[]; len: number } {
	const r = RADIUS + SHOT_OUT;
	const x0 = box.x - SHOT_OUT;
	const x1 = box.x + box.w + SHOT_OUT;
	const y0 = box.y - SHOT_OUT;
	const y1 = box.y + box.h + SHOT_OUT;
	return {
		d: [
			`M ${x0} ${y0 + r + ARM} V ${y0 + r} A ${r} ${r} 0 0 1 ${x0 + r} ${y0} H ${x0 + r + ARM}`,
			`M ${x1 - r - ARM} ${y0} H ${x1 - r} A ${r} ${r} 0 0 1 ${x1} ${y0 + r} V ${y0 + r + ARM}`,
			`M ${x1} ${y1 - r - ARM} V ${y1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${y1} H ${x1 - r - ARM}`,
			`M ${x0 + r + ARM} ${y1} H ${x0 + r} A ${r} ${r} 0 0 1 ${x0} ${y1 - r} V ${y1 - r - ARM}`,
		],
		len: 2 * ARM + (Math.PI * r) / 2,
	};
}

/** how far the line lies off the straight under a given load */
export function bowOf(load: number): number {
	if (load <= 0) return 0;
	return BOW_MAX * (1 - 1 / (1 + load / BOW_K));
}

/**
 * The wall run, sampled.
 *
 * One line through the head, `length` tall. The 38 pixels below the head are pushed out
 * by a single lobe pinned at both of its ends, so the thread leaves the straight at the
 * head and comes back to it 38 pixels later and the deflection is a shape rather than a
 * drift. Everything above the head, and everything below the lobe, is dead straight and
 * is the ruler the depth is read against.
 *
 * A polyline rather than a curve, rewritten in place only while the depth is moving:
 * `agent-spun--slack` established that cost and bounded it the same way. A straight line
 * is two points, so the dead air between calls writes nothing at all.
 */
function wall(length: number, bow: number, line: number, mid: number, dir: number): string {
	if (length < 1) return "";
	const half = length / 2;
	const top = mid - half;
	const foot = mid + half;
	const span = Math.min(SPAN, half);
	if (bow < 0.04 || span < 1) return `M ${line} ${top.toFixed(2)} L ${line} ${foot.toFixed(2)}`;
	const steps = Math.max(8, Math.round(span / 3));
	const points = [`${line} ${top.toFixed(2)}`];
	for (let step = 0; step <= steps; step += 1) {
		const t = step / steps;
		const x = line + dir * bow * Math.sin(Math.PI * t);
		points.push(`${x.toFixed(2)} ${(mid + span * t).toFixed(2)}`);
	}
	if (half > span) points.push(`${line} ${foot.toFixed(2)}`);
	return `M ${points.join(" L ")}`;
}

/**
 * The rung the object is drawn on, which is `--roster`'s ladder.
 *
 * The object lands on the smallest thing on screen that contains the frame: the frame
 * itself, else the frame's row in the Pages rail, else its page's row, else the
 * collapsed rail's strip, else nothing at all. On this canvas the first rung always
 * holds — every frame in `base` is drawn, the camera never moves, and the rail is open —
 * so it resolves to `frame` for all 37.7 seconds and costs zero pixels.
 *
 * It is kept because it is the only channel here that survives the camera. Pan `home`
 * out of view and the thread, the lane, the plate and the corners are all geometry on a
 * wall that is no longer on screen, and the ghost is inside a picture that is no longer
 * on screen.
 */
export type Rung = "frame" | "row" | "page" | "strip";

export function rungOf(frame: string, drawn: readonly string[]): Rung | null {
	if (drawn.includes(frame)) return "frame";
	return null;
}

/**
 * The layer, over the field.
 *
 * The whole answer to travel is the `key`. A presence keyed on the frame it is at cannot
 * move between two frames: it lets go here and takes hold there, both at once, which is
 * what the wire says. A loaded line makes the temptation worse rather than better, since
 * a weight is exactly the thing somebody would want to see carried from one frame to the
 * next, and it is refused for the family's reason — a path between two frames is only
 * drawable when the camera happens to hold both.
 */
export function SlackLayer({
	hand,
	rev,
	base,
}: {
	hand: Hand | null;
	rev: number;
	base: readonly string[];
}) {
	const index = hand === null ? -1 : base.indexOf(hand.frame);
	const rung = hand === null ? null : rungOf(hand.frame, base);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || index === -1 || rung !== "frame" ? null : (
					<Held key={hand.frame} hand={hand} rev={rev} index={index} count={base.length} />
				)}
			</AnimatePresence>
		</div>
	);
}

function Held({ hand, rev, index, count }: { hand: Hand; rev: number; index: number; count: number }) {
	const still = useReducedMotion() === true;
	const box = { x: COLS[index] ?? 0, y: ROW_1, w: FW, h: FH };
	const dock = dockOf(index, count);
	const out = dock.side === "left" ? -1 : 1;
	const wallX = dock.side === "left" ? box.x : box.x + box.w;
	const line = wallX + out * OUT;
	const mid = box.y + box.h / 2;
	const trace = corners(box);
	const live = hand.verb !== null;
	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;

	// the plate grows up out of its node rather than around it, which is `--plate`'s own
	// fix and is what leaves the 38 pixels below the head free for the load
	const foot = mid + REST / 2;

	// two numbers and one line. Length is the kind of hold and moves at the pace a
	// posture changes; depth is the load and moves at the pace work arrives
	const length = useMotionValue(held);
	const bow = useMotionValue(bowOf(hand.load));
	const path = useTransform([length, bow], (latest: number[]) => wall(latest[0] ?? 0, latest[1] ?? 0, line, mid, out));

	useEffect(() => {
		const run = animate(length, held, { duration: still ? 0 : 0.22, ease: ARRIVE });
		return () => run.stop();
	}, [held, length, still]);

	const want = bowOf(hand.load);
	useEffect(() => {
		const heavier = want > bow.get();
		const run = animate(bow, want, {
			duration: still ? 0 : heavier ? LOAD_MS : SHED_MS,
			ease: heavier ? "easeOut" : "easeInOut",
		});
		return () => run.stop();
	}, [want, bow, still]);

	return (
		<>
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
				fill="none"
				aria-hidden="true"
			>
				{/* the thread on the wall. It arrives and leaves by winding off and back onto
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
				{/* the `shot` posture: four corners, struck at their own stand-off so the
				    frame's name survives */}
				{trace.d.map((d) => (
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
						transition={{ duration: still ? 0 : hand.picturing ? 0.26 : 0.2, ease: ARRIVE }}
					/>
				))}
			</svg>
			{/* the lane: where this run has been, standing on the picture the reader is
			    looking at. It needs a live document to know a height, so below 400 drawn
			    pixels the honest drawing is nothing and this is the frame overriding that */}
			{laneLives(FW) || DIAGRAM ? (
				<AnimatePresence>
					{hand.traces.map((block) => (
						<Mark key={block} block={block} rev={rev} box={box} wall={wallX} side={dock.side} still={still} />
					))}
				</AnimatePresence>
			) : null}
			{/* the plate: the participant, and the word it is holding. Shut it is
			    `--presence`'s head and it means the agent is here with nothing open; open it
			    is the same box grown up the thread with one word standing in it */}
			<motion.span
				className="absolute overflow-hidden rounded-[2px] border border-muted bg-canvas"
				initial={{ width: REST, height: REST, left: line - REST / 2, top: foot - REST, opacity: 0 }}
				animate={{
					width: live ? PLATE_W : REST,
					height: live ? PLATE_H : REST,
					left: line - (live ? PLATE_W : REST) / 2,
					top: foot - (live ? PLATE_H : REST),
					opacity: 1,
				}}
				exit={{ width: REST, height: REST, left: line - REST / 2, top: foot - REST, opacity: 0 }}
				transition={{ duration: still ? 0 : SHUT_MS, ease: ARRIVE }}
			>
				{/* the word runs bottom to top, which is what lets it live in a 16px column. It
				    cuts when one verb replaces another, because at 10px a crossfade is two words
				    on top of each other and neither is readable */}
				<motion.span
					className="absolute whitespace-nowrap font-mono text-2xs text-text leading-3"
					style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(-90deg)" }}
					initial={{ opacity: 0 }}
					animate={{ opacity: live ? 1 : 0 }}
					transition={{ duration: still ? 0 : 0.1, ease: "linear" }}
				>
					{hand.verb ?? ""}
				</motion.span>
			</motion.span>
		</>
	);
}

/**
 * One block this run has written, standing level with it.
 *
 * **It reads its box out of the revision on screen, and that is what the write clock
 * buys.** Both parents had to compromise: `--accrue` and the compile drew a mark at the
 * box its block had at the write that made it, and `--ghost-lane` drew it at the box the
 * stale photograph was still showing. Here the file and the picture are the same
 * revision, so the mark is simply level with the block, in the picture the reader is
 * looking at, with no version of the layout being remembered anywhere.
 *
 * The bill for that is the reflow: when a write pushes the blocks under it down the
 * page, every mark already standing has to go with them. It moves on the same 220ms the
 * posture moves on, and it is motion caused by an event, which is the rule this family
 * holds — a mark never moves for any other reason.
 *
 * Write 7 is drawn located and it is the case `--accrue` flagged as the source stamp's
 * own miss: the menu arriving is a write into a hoisted constant, which has no element
 * on its line, so it would degrade to the frame's root and mark the whole wall for a
 * change to three rows. The fix is upstream in what the runtime stamps, not in this
 * drawing.
 */
function Mark({
	block,
	rev,
	box,
	wall: wallX,
	side,
	still,
}: {
	block: BlockId;
	rev: number;
	box: { x: number; y: number; w: number; h: number };
	wall: number;
	side: Side;
	still: boolean;
}) {
	const at = layout(rev)[block];
	const top = box.y + at.y * S;
	const height = Math.max(4, at.h * S);
	const left = side === "left" ? wallX - MARK_IN - MARK_W : wallX + MARK_IN;
	const move = still ? { duration: 0 } : { duration: 0.22, ease: ARRIVE };
	return (
		<motion.span
			className="absolute rounded-[1px] bg-text"
			style={{ left, width: MARK_W }}
			initial={{ opacity: 0, top, height }}
			animate={{
				opacity: MARK_INK,
				top,
				height,
				transition: {
					opacity: still ? { duration: 0 } : { duration: MARK_RISE, ease: ARRIVE },
					top: move,
					height: move,
				},
			}}
			/* the whole lane goes when the run closes, which is one event rather than a
			   mark's own clock — the constant `--ghost-lane` deleted stays deleted */
			exit={{ opacity: 0, transition: still ? { duration: 0 } : { duration: 0.24, ease: ARRIVE } }}
		/>
	);
}
