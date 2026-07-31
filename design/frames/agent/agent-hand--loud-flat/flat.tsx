import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { type BlockId, type Box, layout } from "./home-flat";
import { NameWord, wordFits } from "./name-word";

/**
 * The compile, with the word taken off the wall and set the way a person reads.
 *
 * Five objects and one rule, and the only thing changed from `agent-hand--ghost-loud`
 * is where the fourth one lives:
 *
 *   node      `--presence`: the participant, welded to the wall, unchanging
 *   thread    `--spool`: length is the kind of hold, tension is whether a call is open
 *   word      `--plate`'s verb and `--ghost-word`'s count, horizontal, on the name row
 *   lane      `--accrue`: one mark per write, at the height of the block it changed
 *   corners   `--ghost`: the `shot` posture, four corners, never closing
 *   ladder    `--roster`: the object is drawn on the smallest thing containing the frame
 *
 * **The stand-off had no solution at six channels and it has one at five.** The compile
 * listed four claims on the wall and the plate was the widest of them, so the centre
 * was forced to `8 + 5 + 2 = 15`. Take the plate off the wall and what is left is:
 *
 *   the lane           wall + 0 to wall + 5
 *   the slack thread   centre ± 4, plus a 2px stroke
 *   the node           centre ± 4.5
 *   the corners        struck at the centre's own offset
 *
 * The thread is now the widest at centre ± 5, so the centre stands at `5 + 5 + 2` =
 * **12**, which is `--accrue`'s own number for the lane alone. Three pixels back, and
 * the assembly's reach into the 44px gutter goes from 23 to **16.5**.
 *
 * **It does not buy back the frame's name, and nothing in this family can.** The
 * corners' top rail is at `ROW_1 - 12 = 34` and the name's 12px line box runs y 29 to
 * 41, so it is still struck. Worse, a corner's arc is concentric with the frame's own
 * 12px radius, so its horizontal arm runs **x 322 to 333 whatever the stand-off is** —
 * `home` sets its four glyphs at 310, 317.4, 324.8 and 332.3, and the arm lands on `o`,
 * `m` and the leading edge of `e`. The one number in play only moves y.
 *
 * What the word's move does buy is that **it never joins that collision.** Set after
 * the name it starts at x 345.7, which is 12.7px past where the arm ends. The `shot`
 * posture and the word that says `shot` are on the same row and do not touch.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

/** one write, still on the wall */
export interface Trace {
	/** the block, and which write put it there — a second write to one block restarts the mark rather than stacking */
	readonly key: string;
	readonly block: BlockId;
	/** the block's box at the revision the write made, which on the write clock is the revision on screen */
	readonly box: Box;
}

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/**
	 * The word on the row, in the machine's own lowercase. Never absent: the presence is
	 * derived from a row and every row has a verb, so a wall with a node on it always has
	 * something true to say.
	 */
	readonly word: string;
	/** writes landed so far in the run, so the count climbs the way the rail's count climbs */
	readonly count: number;
	/** a call is open on this frame right now */
	readonly live: boolean;
	/** the `shot` call is open: the ink leaves the wall and goes to the corners */
	readonly picturing: boolean;
	/** every block a landed write named, newest last */
	readonly traces: readonly Trace[];
}

/**
 * Which verbs change the frame, and which only take it in.
 *
 * Inherited from every frame in this family without argument, because it is the one
 * property all of them agree on: three postures absorb five verbs. This capture plays
 * `write`, `shot`, `look`, `logs` and `edit`, and `read`, which it happens not to
 * contain, lands in the posture it already belongs to with nothing new drawn.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is and what it has left behind, read off the same rows the rail is
 * reading.
 *
 * When no call is open the hand falls back to the last row that had one: the agent is
 * between calls and has not gone anywhere, so the object keeps its posture, the row
 * keeps its word as a receipt, and only `live` goes false. The lane does not care
 * whether a call is open at all — a mark is a write that landed, and it goes on
 * decaying through the dead air.
 *
 * **A row is skipped until its subject has landed**, on `--plate`'s rule, and it matters
 * more here than it did there. A tool block opens with an empty input and the file name
 * arrives in the argument deltas behind it, so for 157ms at the first row the rail can
 * honestly print `edit` with nothing after it. Out here the subject is the address, and
 * on this variation the address is *the frame's own name six pixels to the left* — a
 * verb with no address would set itself beside a name it has no claim on.
 */
export function handOf(script: Script, turn: Turn, lands: readonly BlockId[]): Hand | null {
	if (turn.phase !== "playing") return null;
	const reached = script.rows.filter(
		(row): row is ToolRow =>
			row.kind === "tool" &&
			row.frame !== null &&
			turn.at(row.cue) &&
			(row.subjectCue === null || turn.at(row.subjectCue)),
	);
	const last = reached.at(-1);
	if (last === undefined) return null;
	const open = reached.filter((row) => row.doneCue === null || !turn.at(row.doneCue)).at(-1) ?? null;
	const on = open ?? last;
	const frame = on.frame;
	if (frame === null) return null;
	return {
		frame,
		hold: HOLD[on.verb] ?? "whole",
		word: on.verb,
		count: on.runs ? on.children.filter((child) => turn.at(child.cue)).length : 0,
		live: open !== null,
		picturing: open !== null && open.verb === "shot",
		traces: tracesOn(script, turn, frame, lands),
	};
}

/**
 * The writes that have landed, one mark per block, each carrying the box the block
 * had at the moment its write made it.
 *
 * That is the part flow layout costs: `--accrue` could read one constant box per block,
 * because its page was placed absolutely and no write ever moved a neighbour. Here a
 * block's y is a function of the revision, so a mark laid down at write 2 and a mark
 * laid down at write 12 are level with two different pages.
 *
 * Two things are deliberately not marked. `write home` at 117ms is
 * `frames/home/frame.json`, so geometry moved the rectangle and left the design alone.
 * And a block written twice carries one mark that restarts rather than two stacked: the
 * wall says *here, again, just now*, and how many times is the row's and the rail's.
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
/** the name sits in a 22px row this far above the frame, and its 12px line box runs y 29 to 41 */
const LABEL_LIFT = 22;
/** what a frame is authored at, so a block's box becomes a height on the wall */
const NAT_W = 240;
const S = FW / NAT_W;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the object ---------- */

/**
 * How far outside the wall the presence's centre line sits.
 *
 * `--presence` stands at 6, `--accrue` at 12, the compile at 15, and this at **12**.
 * The three the compile paid for the plate come straight back: with the word on the
 * name row the widest claim on the wall is the slack thread's centre ± 4 plus its 2px
 * stroke, against the lane's five pixels nearest the frame, and two pixels of air
 * between them is the least that keeps them from reading as one object.
 *
 * It is still paid twice, because the corners are struck from the same number and the
 * top rail lands at y 34, inside the name's y 29 to 41. There is no value that satisfies
 * both the lane and the name; cutting the lane takes this to 6 and the rail to y 40.
 */
const OUT = 12;
const THREAD = 2;
const PART = 76;
/** the node: `--presence`'s head, built the way the compile built its plate shut */
const NODE = 9;

/* the lane's own claim, against the frame's edge and inside everything else */
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

/** how far past the arc each corner arm runs */
const ARM = 11;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * How long a write stays on the wall, in seconds, and the beat it holds at full before
 * it starts going.
 *
 * `--accrue` measured the window and it is 1.3 seconds wide: a mark has to outlive the
 * run that made it, and the longest run of writes here spans 4.84s, and two runs have to
 * stay apart, and the shortest gap between runs is 6.14s. Six sits near the top of
 * [4.84, 6.14] and nothing about the word's orientation moves it.
 */
const LIFE = 6;
const RISE = 0.08;
const HELD = 0.7;
const PEAK = 0.9;

/**
 * How wide a frame must draw before the canvas mounts its document — `src/cover.ts:8`,
 * enforced at `lifecycle.ts:245` as `frame.w * camera.k < LIVE_MIN_CSS_PX`.
 *
 * The lane's heights are the one thing here that needs a live document: below this there
 * is no DOM to resolve a write's line against, so a mark's y cannot be obtained at all
 * and the correct degrade is no lane. **This is also the constant the compile mistook
 * for a clock.** Below 400 the frame on screen is a stored still and the canvas lags the
 * source, which is a defect in the capture errand rather than a property of a write, and
 * this frame draws the target: the frame re-renders on every write, all thirteen.
 */
const LIVE_MIN_CSS_PX = 400;

export function laneLives(drawn: number): boolean {
	return drawn >= LIVE_MIN_CSS_PX;
}

/**
 * The one fiction in this frame, named at the line that introduces it.
 *
 * `spool-play-field.tsx` draws every frame at 152px and the arrangement is fixed, so
 * `laneLives(152)` is false and the honest lane here is no lane. `--accrue` overrode
 * that on purpose because a frame that correctly draws nothing cannot be judged, and a
 * compile that quietly dropped a channel would be answering the question by not asking
 * it. Inherited with the same reason: everything about the lane is true at canvas zoom
 * except the heights, and the heights need a document.
 */
const DIAGRAM = true;

export type Side = "left" | "right";

/**
 * Which wall.
 *
 * The tie breaks right, which is `--accrue`'s one-character fix. A walk arrow's head
 * lands on a frame's **left** wall — `spool-play-field.tsx` draws it at `x - 9`,
 * `ROW_1 + 186` — so on a frame with equal gutters, breaking left would put the lane,
 * the thread and the node underneath an accent-coloured triangle.
 *
 * The compile also asked this function whether the gutter was wide enough for the word.
 * It is not asked any more: the word is on the name row and the row's own width decides
 * it, which is `wordFits` in `name-word.tsx`. **A dock is about a wall, and the word no
 * longer lives on one.**
 */
export function dockOf(index: number, count: number): Side {
	const here = COLS[index] ?? 0;
	const before = COLS[index - 1];
	const after = COLS[index + 1];
	const left = index === 0 || before === undefined ? here : here - (before + FW);
	const right = index === count - 1 || after === undefined ? VIEW_W - (here + FW) : after - (here + FW);
	return left > right ? "left" : "right";
}

/**
 * The four corners a `shot` puts the ink at, each drawn from one arm around the arc to
 * the other.
 *
 * `--ghost` established that a closed rectangle outside a frame is a selection ring —
 * spool's own `Slot` draws that exact shape at `inset: -1` — and held for the 670 to
 * 750ms a `spool shot` takes it will be read as one. So it is four corners, and a corner
 * is not a ring at any weight because it is not closed.
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
 * The wall run, sampled.
 *
 * One line through the node, `length` tall, displaced sideways by a sine with a node at
 * the node — so the thread passes through its own core at every amplitude and only the
 * lie of it changes. A polyline rather than a curve, rewritten in place only while the
 * amplitude is moving.
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
 * The rung the object is drawn on, which is `--roster`'s ladder.
 *
 * The object lands on the smallest thing on screen that contains the frame: the frame
 * itself, else the frame's row in the Pages rail, else its page's row, else the
 * collapsed rail's strip, else nothing at all. **On this canvas the first rung always
 * holds**, so it costs zero pixels for all 37.7 seconds.
 *
 * It is in the file rather than dropped because it is the only channel that survives the
 * camera: pan `home` out of view and the wall channels die in the same frame. The word
 * is the only one that survives a *zoom*, for the reason `name-word.tsx` sets out, and
 * between them they are the whole of what this compile still says when the canvas moves.
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
 * what the wire says. Thread makes the temptation worse rather than better — a line is
 * exactly the object somebody would want to run from one frame to the next — and it is
 * refused for the family's reason, which is that a path between two frames is only
 * drawable when the camera happens to hold both.
 */
export function FlatLayer({ hand, base }: { hand: Hand | null; base: readonly string[] }) {
	const index = hand === null ? -1 : base.indexOf(hand.frame);
	const rung = hand === null ? null : rungOf(hand.frame, base);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || index === -1 || rung !== "frame" ? null : (
					<Held key={hand.frame} hand={hand} index={index} count={base.length} />
				)}
			</AnimatePresence>
		</div>
	);
}

function Held({ hand, index, count }: { hand: Hand; index: number; count: number }) {
	const still = useReducedMotion() === true;
	const box = { x: COLS[index] ?? 0, y: ROW_1, w: FW, h: FH };
	const side = dockOf(index, count);
	const out = side === "left" ? -1 : 1;
	const wallX = side === "left" ? box.x : box.x + box.w;
	const line = wallX + out * OUT;
	const mid = box.y + box.h / 2;
	const trace = corners(box);
	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;

	// two numbers and one line. Length is the hold and moves at the pace a posture
	// changes; amplitude is the pull and moves at the pace a call opens
	const length = useMotionValue(held);
	const amp = useMotionValue(hand.live ? 0 : SLACK);
	const path = useTransform([length, amp], (latest: number[]) => wall(latest[0] ?? 0, latest[1] ?? 0, line, mid, out));

	useEffect(() => {
		const run = animate(length, held, { duration: still ? 0 : 0.22, ease: ARRIVE });
		return () => run.stop();
	}, [held, length, still]);

	useEffect(() => {
		const run = animate(amp, hand.live ? 0 : SLACK, {
			duration: still ? 0 : hand.live ? TAUT_MS : SLACK_MS,
			ease: hand.live ? "easeOut" : "easeInOut",
		});
		return () => run.stop();
	}, [hand.live, amp, still]);

	// a write is a pluck rather than a length, which is `--spool`'s correction of the
	// parent: flicking the segment longer spends the posture channel on an event and says
	// the hold changed when it did not. Here the line shivers where it is already taut
	useEffect(() => {
		if (hand.count === 0 || !hand.live || still) return;
		const run = animate(amp, [PLUCK, 0], { duration: 0.24, ease: "easeOut" });
		return () => run.stop();
	}, [hand.count, hand.live, amp, still]);

	const word = hand.count > 1 ? `${hand.word} ×${hand.count}` : hand.word;

	return (
		<>
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
				fill="none"
				aria-hidden="true"
			>
				{/* the thread on the wall. It arrives and leaves by winding off and back onto the
				    node rather than by fading, so taking hold and letting go are the same gesture
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
				{/* the `shot` posture: four corners, struck from the same stand-off the node is
				    centred on, which is what still puts the top rail through the frame's name */}
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
			{/* the lane: the writes, where they landed, going out on their own clocks. It needs a
			    live document to know a height, so below 400 drawn pixels the honest drawing is
			    nothing at all and this is the frame overriding that on purpose */}
			{laneLives(FW) || DIAGRAM
				? hand.traces.map((mark) => (
						<Mark key={mark.key} mark={mark} box={box} wall={wallX} side={side} still={still} />
					))
				: null}
			{/* the node: the participant itself, and the one thing here that never changes,
			    because being at this frame is not a state that has degrees. It is the compile's
			    plate with nothing left to open for, so it is drawn once and sits still */}
			<motion.span
				className="absolute rounded-[2px] border border-muted bg-canvas"
				style={{ width: NODE, height: NODE, left: line - NODE / 2, top: mid - NODE / 2 }}
				initial={{ opacity: 0, scale: 0.5 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.5 }}
				transition={{ duration: still ? 0 : 0.2, ease: ARRIVE }}
			/>
			{/* the word, on the frame's own name row rather than in the gutter */}
			{wordFits(FW, word) ? (
				<NameWord
					frame={hand.frame}
					left={box.x}
					top={box.y - LABEL_LIFT}
					width={FW}
					word={hand.word}
					count={hand.count}
					live={hand.live}
					still={still}
				/>
			) : null}
		</>
	);
}

/**
 * One write, on the wall, going out.
 *
 * It mounts when its cue fires, so the clock is the capture's own and no ticker is in
 * the path — which matters, because `useTicker` moves at 100ms and a six-second fade
 * driven off it would step ten times a second.
 *
 * Ink carries the age, width carries it again so a stale mark reads as residue rather
 * than as a live mark somebody drew faintly, and the mark thins toward the frame, so
 * what recedes is the part furthest from the thing it is about. The decay is linear
 * after a 0.7s hold at full, because the one thing the lane has to keep legible is the
 * order of a run.
 *
 * **Ink on this wall means two things now rather than three.** Age here and tension on
 * the thread ten pixels out; the third, the plate's open-or-shut, left with the word.
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
	// the frame's own y, at the scale the canvas is drawing it, taken from the layout the
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
