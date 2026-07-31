import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { type BlockId, type Box, layout } from "./home-loud";

/**
 * Every channel this family has decided, on one wall, at once.
 *
 * Five objects and one rule, and nothing here is softened to make them fit:
 *
 *   head      `--presence`: the participant, welded to the wall, unchanging
 *   thread    `--spool`: length is the kind of hold, tension is whether a call is open
 *   plate     `--plate`: the head opens along the wall to hold the verb, with its count
 *   lane      `--accrue`: one mark per write, at the height of the block it changed
 *   corners   `--ghost`: the `shot` posture, four corners, never closing
 *   ladder    `--roster`: the object is drawn on the smallest thing containing the frame
 *
 * **The stand-off is where they collide, and the collision has no solution.** Each of
 * them wants a distance from the frame's wall and they are not compatible:
 *
 *   the lane           wall + 0 to wall + 5
 *   the slack thread   centre ± 4, plus a 2px stroke
 *   the plate          centre ± 8
 *   the corners        struck at the centre's own offset
 *
 * The plate is the widest, so the centre has to stand at 8 + 5 + 2 of air = **15**,
 * against the 6 the parent used and the 12 `--accrue` needed for the lane alone. And
 * the corners are struck from that same number, so the box's top edge is at
 * `ROW_1 - 15 = 31` — inside the frame's own name, whose 12px line box runs y 29 to
 * 41. **No stand-off clears both.** The corners clear the name only below 6, and the
 * lane plus a slack thread need at least 9. The two are exclusive at every value.
 *
 * Worse, and this is the part that makes it structural rather than a tuning problem:
 * a corner's arc is struck concentric with the frame's own 12px radius, so its
 * horizontal arm starts at `frame.x + RADIUS` and ends `ARM` past that — **x 322 to
 * 333 whatever the stand-off is**. The name `home` sets from x 310 at 7.42px a glyph,
 * so its four characters occupy 310, 317.4, 324.8 and 332.3. The arm lands on `o`,
 * `m` and the leading edge of `e`, and no value of the one number in play moves it,
 * because that number only moves y.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
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
 * between calls and has not gone anywhere, so the object keeps its posture and drops
 * its word. The lane does not care whether a call is open at all — a mark is a write
 * that landed, and it goes on decaying through the dead air.
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
 * The writes that have landed, one mark per block, each carrying the box the block
 * had at the moment its write made it.
 *
 * That is the part flow layout costs: `--accrue` could read one constant box per
 * block, because its page was placed absolutely and no write ever moved a neighbour.
 * Here a block's y is a function of the revision, so a mark laid down at write 2 and
 * a mark laid down at write 12 are level with two different pages — and the marks
 * that are alive together on the wall are, correctly, level with where their blocks
 * were rather than where they are.
 *
 * Two things are deliberately not marked. `write home` at 117ms is
 * `frames/home/frame.json`, so geometry moved the rectangle and left the design alone.
 * And a block written twice carries one mark that restarts rather than two stacked:
 * the wall says *here, again, just now*, and how many times is the plate's and the
 * rail's.
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
 * `spool-play-field.tsx` has no slot for another layer and shared/ is not this
 * frame's to change, so everything here is a sibling of the field drawn in the same
 * coordinates. That holds exactly as long as the camera is still, which is why this
 * frame never centres on anything. */

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const FW = 152;
const FH = 329;
/** the frame's own corner, so the corners can be struck concentric with it */
const RADIUS = 12;
/* the frame's name sits 22px above it in a 22px row, so its 12px line box runs y 29
 * to 41 — the number the corners have to clear and cannot */
/** what a frame is authored at, so a block's box becomes a height on the wall */
const NAT_W = 240;
const S = FW / NAT_W;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the object ---------- */

/**
 * How far outside the wall the presence's centre line sits.
 *
 * `--presence` stands at 6, `--accrue` at 12, and the compile stands at **15**. The
 * arithmetic is in this file's header and it is forced rather than chosen: the plate
 * is 16 wide, the lane claims the 5 pixels nearest the frame, and two pixels of air
 * between them is the least that keeps them from reading as one object.
 *
 * Every pixel of that is paid twice. The head is two and a half times as far from the
 * thing it is holding as the parent's, and the corners are struck from the same
 * number, so the box's top edge runs at y 31 — through the frame's own name.
 */
const OUT = 15;
const THREAD = 2;
const PART = 76;
/** the plate shut: the parent's head, built the way the plate is built */
const REST = 9;
const PLATE_W = 16;

/**
 * The plate open, and the number the count broke.
 *
 * `--plate` fixed this at 38 and rested a real argument on the fixture: the set of
 * verbs that can carry a frame is closed at `label()` in `claude-turn.ts`, seven words
 * with `write` the longest, `write` measures 30.9px at 10px Fragment Mono (6.18 a
 * glyph), and 30.9 plus 3.5 of air at each end is 38. **The plate never resizes** was
 * the whole of what the object bought over a chip.
 *
 * Compiled with the count, the vocabulary is no longer closed. `edit ×6` is seven
 * glyphs, 43.3px, and wants **51** — 34% taller, held at that size for the whole turn
 * so the plate still never resizes. And 51 is not a bound: the count is a run length,
 * `edit ×13` wants 56 and a hundred-write run wants 63. The plate can be fixed or it
 * can carry the count. It cannot do both.
 */
const MONO_2XS = 6.18;
const PLATE_PAD = 3.5;
const PLATE_H = Math.ceil("edit ×6".length * MONO_2XS + 2 * PLATE_PAD);
/** the plate opening or shutting; the word cuts, the shape moves */
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
 * How long a write stays on the wall, in seconds, and the beat it holds at full
 * before it starts going.
 *
 * `--accrue` measured the window and it is 1.3 seconds wide: a mark has to outlive the
 * run that made it, and the longest run of writes here spans 4.84s, and two runs have
 * to stay apart, and the shortest gap between runs is 6.14s. Six sits near the top of
 * [4.84, 6.14] and nothing in the compile moves it.
 */
const LIFE = 6;
const RISE = 0.08;
const HELD = 0.7;
const PEAK = 0.9;

/**
 * How wide a frame must draw before the canvas mounts its document — `src/cover.ts:8`,
 * enforced at `lifecycle.ts:245` as `frame.w * camera.k < LIVE_MIN_CSS_PX`.
 *
 * The lane's heights are the one thing here that needs a live document: below this
 * there is no DOM to resolve a write's line against, so a mark's y cannot be obtained
 * at all and the correct degrade is no lane. Every other channel in this frame is
 * drawn by the canvas outside the iframe and is true at any zoom.
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
 * that on purpose because a frame that correctly draws nothing cannot be judged, and
 * a compile that quietly dropped a channel would be answering the question by not
 * asking it. Inherited, with the same reason and the same honesty: everything about
 * the lane is true at canvas zoom except the heights, and the heights need a document.
 */
const DIAGRAM = true;

/**
 * What the whole assembly claims of the gutter it docks in.
 *
 * The lane reaches 5 out from the wall and the plate reaches `OUT + PLATE_W / 2` = 23,
 * so the object is 23 wide with six of air against whatever is next door. `--plate`
 * asked for 20 and `--presence`'s chip asked for 64; this is between them and the
 * gutter here is 44, so it fits and never has to be shed. What it does not do is leave
 * the gutter looking empty: 23 of 44 is **52% of the space between two frames**.
 */
const NEED = 29;

export type Side = "left" | "right";

/**
 * Which wall.
 *
 * The tie breaks right, which is `--accrue`'s one-character fix and it earns more here
 * than it did there. A walk arrow's head lands on a frame's **left** wall —
 * `spool-play-field.tsx` draws it at `x - 9`, `ROW_1 + 186` — so on a frame with equal
 * gutters, breaking left would put the lane, the thread and a 16px plate underneath an
 * accent-coloured triangle. Breaking right leaves them on the wall the outgoing edge
 * only grazes, and the residual is real and measured: the outgoing edge leaves at
 * `x + w + 3`, `ROW_1 + 158`, which is x 465, y 204 — **inside the lane's 464 to 467,
 * and inside the hero mark, which spans y 136 to 244 for six seconds after every write
 * to it.**
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
 * the other.
 *
 * `--ghost` established that a closed rectangle outside a frame is a selection ring —
 * spool's own `Slot` draws that exact shape at `inset: -1` — and held for the 670 to
 * 750ms a `spool shot` takes it will be read as one. So it is four corners, and a
 * corner is not a ring at any weight because it is not closed.
 *
 * **What the compile costs it**: in every other frame in this family the shot ink is
 * the grip's own, leaving the wall and running around the box, so the posture is one
 * object changing shape. Four corners cannot leave the plate — a path that leaves a
 * 16px box and reaches all four corners without joining up is a rectangle with two
 * visible breaks in it, which is a ring wearing a disguise. So the corners arrive as
 * their own mark, and the one reading the shot posture was built on is gone.
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
 * One line through the head, `length` tall, displaced sideways by a sine with a node at
 * the head — so the thread passes through its own core at every amplitude and only the
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
 * holds** — every frame in `base` is drawn, the camera never moves, and the rail is
 * open — so the ladder resolves to `frame` for all 37.7 seconds and contributes zero
 * pixels and zero information to the compile.
 *
 * That is worth having in the file rather than dropping, because it is the only
 * channel here that costs nothing, and because it is the only one that survives the
 * camera. Pan `home` out of view and the other five die in the same frame: the lane,
 * the thread, the plate and the corners are all geometry on a wall that is no longer
 * on screen, and the ghost is inside a picture that is no longer on screen. Six
 * channels to one, in one gesture.
 */
export type Rung = "frame" | "row" | "page" | "strip";

export function rungOf(frame: string, drawn: readonly string[]): Rung | null {
	if (drawn.includes(frame)) return "frame";
	return null;
}

/**
 * The layer, over the field.
 *
 * The whole answer to travel is the `key`. A presence keyed on the frame it is at
 * cannot move between two frames: it lets go here and takes hold there, both at once,
 * which is what the wire says. Thread makes the temptation worse rather than better —
 * a line is exactly the object somebody would want to run from one frame to the next —
 * and it is refused for the family's reason, which is that a path between two frames is
 * only drawable when the camera happens to hold both.
 */
export function LoudLayer({ hand, base }: { hand: Hand | null; base: readonly string[] }) {
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
	const dock = dockOf(index, count);
	const out = dock.side === "left" ? -1 : 1;
	const wallX = dock.side === "left" ? box.x : box.x + box.w;
	const line = wallX + out * OUT;
	const mid = box.y + box.h / 2;
	const trace = corners(box);
	const live = hand.verb !== null;
	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;

	// the plate grows up out of its node rather than around it, which is `--plate`'s
	// own fix: an incoming walk arrowhead lands at `ROW_1 + 186`, 21.5px below the
	// frame's centre, and a 51px plate centred there would take the tip in its bottom
	// corner. Docking right keeps it off that wall anyway; the anchor stays because
	// the object has to be the same object on either side
	const foot = mid + REST / 2;

	// two numbers and one line. Length is the hold and moves at the pace a posture
	// changes; amplitude is the pull and moves at the pace a call opens
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

	// a write is a pluck rather than a length, which is `--spool`'s correction of the
	// parent: flicking the segment longer spends the posture channel on an event and
	// says the hold changed when it did not. Here the line shivers where it is already
	// taut — and it is the second place on this wall that counts a write, the plate's
	// `×N` being the first, nine pixels away
	useEffect(() => {
		if (hand.count === 0 || !live || still) return;
		const run = animate(amp, [PLUCK, 0], { duration: 0.24, ease: "easeOut" });
		return () => run.stop();
	}, [hand.count, live, amp, still]);

	const word = hand.verb === null ? "" : hand.count > 1 ? `${hand.verb} ×${hand.count}` : hand.verb;

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
				{/* the `shot` posture: four corners, struck from the same stand-off the plate
				    is centred on, which is what puts the top rail through the frame's name */}
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
			{/* the lane: the writes, where they landed, going out on their own clocks. It
			    needs a live document to know a height, so below 400 drawn pixels the honest
			    drawing is nothing at all and this is the frame overriding that on purpose */}
			{laneLives(FW) || DIAGRAM
				? hand.traces.map((mark) => (
						<Mark key={mark.key} mark={mark} box={box} wall={wallX} side={dock.side} still={still} />
					))
				: null}
			{/* the plate: the participant, and the word it is holding with its count. Shut it
			    is `--presence`'s head and it means the agent is here with nothing open; open
			    it is the same box grown along the thread with one word standing in it */}
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
					{word}
				</motion.span>
			</motion.span>
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
 * **Compiled, ink on this wall now means three things at once**: age here, tension on
 * the thread nine pixels out, and open-or-shut on the plate six pixels past that. They
 * are kept apart by being different shapes and by nothing else.
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
	// the frame's own y, at the scale the canvas is drawing it, taken from the layout
	// the write itself produced — so a mark laid down at write 2 stays level with the
	// page write 2 made, which is not the page write 12 leaves behind
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
