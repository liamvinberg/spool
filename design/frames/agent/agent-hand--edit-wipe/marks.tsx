import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { type BlockId, type Box, wideLayout } from "./kaffe-home-both";
import { ROW_1, S, VIEW_W, WIDE_H, WIDE_W, WIDE_X } from "./wipe-field";

/**
 * `agent-hand--ghost-loud`'s wall, kept, and put against a frame 3.7 times wider than the
 * one it was designed on.
 *
 * Four objects and one rule, unchanged from the compile:
 *
 *   thread    `--spool`: length is the kind of hold, tension is whether a call is open
 *   plate     `--plate`: the head opens along the wall to hold the verb, with its count
 *   lane      `--accrue`: one mark per write, at the height of the block it changed
 *   corners   `--ghost`: the `shot` posture, four corners, never closing
 *   ladder    `--roster`: the object is drawn on the smallest thing containing the frame
 *
 * The compile's own stand-off arithmetic is inherited whole and so is its failure: the
 * plate is 16 wide and the lane claims the 5 pixels nearest the frame, so the centre line
 * stands at 8 + 5 + 2 of air = **15**, the corners are struck from the same number, and
 * the box's top rail lands at `ROW_1 - 15` inside the frame's own 12px name.
 *
 * **What is new is that the collision turns out to be size-invariant, and that is worth
 * knowing before anybody tries to fix it by zooming in.** A corner's arc is struck
 * concentric with the frame's own 12px radius, so its horizontal arm runs from
 * `frame.x + 12` to 11 past that — eleven pixels of ink starting 12 pixels in from the
 * left edge — and the name starts at the left edge and sets at 7.42px a glyph. Neither
 * number is a function of the frame's width. A 152px frame and a 561px frame put the same
 * arm through the same three glyphs. **The one thing everybody assumed more room would
 * fix is the one thing more room does not touch.**
 *
 * **Two things the width does change, and one of them is a real defect.**
 *
 * *The lane stops being a fiction.* `laneLives(561)` is true, so above `LIVE_MIN_CSS_PX`
 * there is a live document to resolve a write's line against and the heights are
 * obtainable rather than drawn from a table standing in for a request nobody can make.
 * `--accrue` and the compile both flagged the lane as the one channel that is invented at
 * canvas zoom; on a desktop frame it is the only channel that is *more* honest than it
 * was.
 *
 * *And the lane conflates the columns.* A lane is a projection of the page onto one
 * vertical axis. A phone is one column, so the projection loses nothing. This desktop page
 * is two: the hero sits at x 452 to 814 and the text at 72 to 412, and they span the same
 * heights. So a mark level with the headline and a mark level with the top of the hero are
 * the same mark at the same y, 240 authored pixels apart on the page and zero pixels apart
 * on the wall. **The lane says *how far down* and a desktop layout needs *where*.** That is
 * not a tuning problem and it is not fixable by moving the lane: the wall has one
 * dimension and the page has two.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

/** one write, still on the wall */
export interface Trace {
	/** the block, and which write put it there — a second write to one block restarts the mark rather than stacking */
	readonly key: string;
	readonly block: BlockId;
	/** the block's box at the revision the write made, which is not the revision before it */
	readonly box: Box;
}

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** writes landed so far in a run, so the plate counts the way the row counts */
	readonly count: number;
	/** the `shot` call is open: the ink leaves the wall and goes to the corners */
	readonly picturing: boolean;
	/** every block a landed write named, newest last */
	readonly traces: readonly Trace[];
}

/**
 * Which verbs change the frame, and which only take it in.
 *
 * Inherited from every frame in this family without argument: three postures absorb five
 * verbs. This capture plays `write`, `shot`, `look`, `logs` and `edit`, and `read`, which
 * it happens not to contain, lands in the posture it already belongs to.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is and what it has left behind, read off the same rows the rail is
 * reading.
 *
 * When no call is open the hand falls back to the last row that had one: the agent is
 * between calls and has not gone anywhere, so the object keeps its posture and drops its
 * word. The lane does not care whether a call is open — a mark is a write that landed, and
 * it goes on decaying through the dead air, which is 21.6 of these 37.7 seconds.
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
		count: open === null ? 0 : landed,
		picturing: open !== null && open.verb === "shot",
		traces: tracesOn(script, turn, frame, lands),
	};
}

/**
 * The writes that have landed, one mark per block, each carrying the box the block had at
 * the moment its write made it.
 *
 * Two things are deliberately not marked. `write home` at 117ms is
 * `frames/home/frame.json`, so geometry moved the rectangle and left the design alone. And
 * a block written twice carries one mark that restarts rather than two stacked: the wall
 * says *here, again, just now*, and how many times is the plate's and the rail's.
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
	return [...latest].map(([block, nth]) => ({ key: `${block}:${nth}`, block, box: wideLayout(nth)[block] }));
}

/* ---------- the object ---------- */

/** the frame's own corner, so the corners can be struck concentric with it */
const RADIUS = 12;
/** the compile's stand-off, forced by the plate's width and the lane's claim */
const OUT = 15;
const THREAD = 2;
const PART = 76;
/** the plate shut: `--presence`'s head, built the way the plate is built */
const REST = 9;
const PLATE_W = 16;
/** `edit ×6` at 6.18px a glyph and 3.5 of air each end, which is the number the count broke */
const MONO_2XS = 6.18;
const PLATE_PAD = 3.5;
const PLATE_H = Math.ceil("edit ×6".length * MONO_2XS + 2 * PLATE_PAD);
const SHUT_MS = 0.2;

/* the lane's own claim, against the frame's edge and inside everything else */
const MARK_IN = 2;
const MARK_W = 3;
const MARK_THIN = 1;

/** how far a slack thread lies off the straight, and how long one lie of it runs */
const SLACK = 4;
const WAVE = 46;
/** one write, drawn as a pluck on a line that is already taut */
const PLUCK = 1.6;
/** tension arrives on the instant and slack comes back slowly, which is what a thread does */
const TAUT_MS = 0.09;
const SLACK_MS = 0.32;
const INK = 0.78;

/** how far past the arc each corner arm runs */
const ARM = 11;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * How long a write stays on the wall, in seconds, and the beat it holds at full before it
 * starts going. `--accrue`'s window: a mark has to outlive the run that made it (longest
 * run 4.84s) and two runs have to stay apart (shortest gap between runs 6.14s).
 */
const LIFE = 6;
const RISE = 0.08;
const HELD = 0.7;
const PEAK = 0.9;

/**
 * How wide a frame must draw before the canvas mounts its document — `src/cover.ts:8`,
 * enforced at `lifecycle.ts:245` as `frame.w * camera.k < LIVE_MIN_CSS_PX`.
 *
 * The lane's heights are the one thing here that needs a live document. Every previous
 * frame in this family drew at 152 and had to override this on purpose; the desktop frame
 * draws at 561, so for the first time the override is not needed and is not present.
 */
const LIVE_MIN_CSS_PX = 400;

export function laneLives(drawn: number): boolean {
	return drawn >= LIVE_MIN_CSS_PX;
}

/**
 * What the whole assembly claims of the wall it docks against: the lane reaches 5 out and
 * the plate reaches `OUT + PLATE_W / 2` = 23, so 23 wide with six of air.
 */
const NEED = 29;

export type Side = "left" | "right";

/**
 * Which wall.
 *
 * `--accrue`'s tie-break goes right and it is kept, though on this canvas it never fires:
 * the desktop frame sits at x 44 with 44 of wall on its left and 167 on its right, so the
 * plain rule already picks right. What the tie-break protects against is a frame with
 * equal gutters, and a walk arrow's head lands on a frame's **left** wall at `row + 186`,
 * so breaking left would park a lane, a thread and a 16px plate underneath an
 * accent-coloured triangle. The rule stays because the canvas that needs it is one row
 * down.
 */
export function dockOf(left: number, width: number): { side: Side; words: boolean } {
	const before = left;
	const after = VIEW_W - (left + width);
	return { side: before > after ? "left" : "right", words: Math.max(before, after) >= NEED };
}

/**
 * The four corners a `shot` puts the ink at, each drawn from one arm around the arc to the
 * other. A closed rectangle outside a frame is a selection ring — spool's own `Slot` draws
 * that exact shape at `inset: -1` — so it is four corners and it never closes.
 */
function corners(box: { x: number; y: number; w: number; h: number }): { d: readonly string[]; len: number } {
	const r = RADIUS + OUT;
	const x0 = box.x - OUT;
	const x1 = box.x + box.w + OUT;
	const y0 = box.y - OUT;
	const y1 = box.y + box.h + OUT;
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

/**
 * The wall run, sampled. One line through the head, `length` tall, displaced sideways by a
 * sine with a node at the head, so the thread passes through its own core at every
 * amplitude and only the lie of it changes.
 */
function wall(length: number, amp: number, line: number, mid: number, dir: number): string {
	if (length < 1) return "";
	const half = length / 2;
	const steps = Math.max(2, Math.round(length / 4));
	const points: string[] = [];
	for (let step = 0; step <= steps; step += 1) {
		const y = -half + (length * step) / steps;
		const x = line + dir * amp * Math.sin((2 * Math.PI * y) / WAVE);
		points.push(`${x.toFixed(2)} ${(mid + y).toFixed(2)}`);
	}
	return `M ${points.join(" L ")}`;
}

/**
 * The rung the object is drawn on, which is `--roster`'s ladder: the smallest thing on
 * screen that contains the frame. On this canvas the first rung always holds, so it costs
 * zero pixels — and it is still the only channel that survives the camera moving.
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
 * what the wire says. **A wipe inside a frame is not travel and does not break the rule**
 * — it never leaves the frame's own rectangle, it is drawn by the frame's own two renders
 * rather than by anything of spool's, and it says nothing about where the agent is. The
 * ban is on an object crossing the canvas between two frames, and nothing here crosses
 * anything.
 */
export function MarkLayer({ hand, subject }: { hand: Hand | null; subject: string }) {
	const rung = hand === null ? null : rungOf(hand.frame, [subject]);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || hand.frame !== subject || rung !== "frame" ? null : (
					<Held key={hand.frame} hand={hand} />
				)}
			</AnimatePresence>
		</div>
	);
}

function Held({ hand }: { hand: Hand }) {
	const still = useReducedMotion() === true;
	const box = { x: WIDE_X, y: ROW_1, w: WIDE_W, h: WIDE_H };
	const dock = dockOf(WIDE_X, WIDE_W);
	const out = dock.side === "left" ? -1 : 1;
	const wallX = dock.side === "left" ? box.x : box.x + box.w;
	const line = wallX + out * OUT;
	const mid = box.y + box.h / 2;
	const trace = corners(box);
	const live = hand.verb !== null;
	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;

	// the plate grows up out of its node rather than around it, so an incoming walk
	// arrowhead at `row + 186` never lands in its bottom corner
	const foot = mid + REST / 2;

	// two numbers and one line. Length is the hold and moves at the pace a posture changes;
	// amplitude is the pull and moves at the pace a call opens
	const length = useMotionValue(held);
	const amp = useMotionValue(live ? 0 : SLACK);
	const path = useTransform([length, amp], (latest: number[]) => wall(latest[0] ?? 0, latest[1] ?? 0, line, mid, out));

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

	// a write is a pluck rather than a length: flicking the segment longer spends the
	// posture channel on an event and says the hold changed when it did not
	useEffect(() => {
		if (hand.count === 0 || !live || still) return;
		const run = animate(amp, [PLUCK, 0], { duration: 0.24, ease: "easeOut" });
		return () => run.stop();
	}, [hand.count, live, amp, still]);

	const word = hand.verb === null ? "" : hand.count > 1 ? `${hand.verb} ×${hand.count}` : hand.verb;

	return (
		<>
			<svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" fill="none" aria-hidden="true">
				{/* the thread on the wall. It arrives and leaves by winding off and back onto the
				    head rather than by fading, so taking hold and letting go are the same gesture
				    in two directions */}
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
				{/* the `shot` posture, struck from the same stand-off the plate is centred on,
				    which is what puts the top rail through the frame's name at any frame width */}
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
			{/* the lane: the writes, where they landed, going out on their own clocks. At 561
			    drawn pixels this is the first frame in the family where it is not a fiction */}
			{laneLives(WIDE_W)
				? hand.traces.map((mark) => (
						<Mark key={mark.key} mark={mark} box={box} wall={wallX} side={dock.side} still={still} />
					))
				: null}
			{/* the plate: the participant, and the word it is holding with its count */}
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
				{/* the word runs bottom to top, which is what lets it live in a 16px column. It cuts
				    when one verb replaces another, because at 10px a crossfade is two words on top
				    of each other and neither is readable */}
				<motion.span
					className="absolute whitespace-nowrap font-mono text-2xs text-text leading-3"
					style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(-90deg)" }}
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
 * One write, on the wall, going out.
 *
 * It mounts when its cue fires, so the clock is the capture's own and no ticker is in the
 * path. Ink carries the age, width carries it again so a stale mark reads as residue, and
 * the mark thins toward the frame, so what recedes is the part furthest from the thing it
 * is about.
 */
function Mark({
	mark,
	box,
	wall: wallX,
	side,
	still,
}: {
	mark: Trace;
	box: { x: number; y: number; w: number; h: number };
	wall: number;
	side: Side;
	still: boolean;
}) {
	// the frame's own y at the scale the canvas is drawing it, taken from the layout the
	// write itself produced
	const top = box.y + mark.box.y * S;
	const height = Math.max(4, mark.box.h * S);
	const inner = side === "left" ? wallX - MARK_IN : wallX + MARK_IN;
	const at = (width: number) => (side === "left" ? inner - width : inner);
	return (
		<motion.span
			className="absolute rounded-[1px] bg-text"
			style={{ top, height }}
			initial={{ opacity: 0, width: MARK_W, left: at(MARK_W) }}
			animate={{
				opacity: [0, PEAK, PEAK, 0],
				width: [MARK_W, MARK_W, MARK_W, MARK_THIN],
				left: [at(MARK_W), at(MARK_W), at(MARK_W), at(MARK_THIN)],
			}}
			exit={{ opacity: 0, transition: { duration: still ? 0 : 0.24, ease: ARRIVE } }}
			transition={
				still
					? { duration: 0 }
					: { duration: LIFE, times: [0, RISE / LIFE, HELD / LIFE, 1], ease: ["easeOut", "linear", "linear"] }
			}
		/>
	);
}
