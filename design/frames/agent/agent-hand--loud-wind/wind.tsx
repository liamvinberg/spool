import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { type BlockId, type Box, layout, WRITES } from "./home-wind";

/**
 * The compile's wall, with the presence rebuilt as a thing that gets wound.
 *
 * Six channels, the same six, and only one of them is new:
 *
 *   plate     `--plate`: the head, opening along the wall to hold the verb and its count
 *   thread    `--spool`: length is the kind of hold, tension is whether a call is open
 *   wind      new: one pass of the shipped `agent-wind` track per write that lands
 *   store     new: the plate's shut size, growing as the square root of what is wound on
 *   lane      `--accrue`: one mark per write, at the height of the block it changed
 *   corners   `--ghost`: the `shot` posture, four corners, never closing
 *   ladder    `--roster`: the object is drawn on the smallest thing containing the frame
 *
 * **The wind is emitted, never declared, and that is the whole of how a looping
 * identity gets onto a canvas that bans idle animation.** `.agent-wind` ships as
 * `1600ms linear infinite` because the rail does not know how long a turn is. A frame
 * does know something the rail does not: a write is an instant, and this turn has
 * thirteen of them. So the track runs with `animation-iteration-count: 1`, once per
 * write, and nothing else in this file ever starts one. Six writes 573 to 1605ms apart
 * emit six passes that overlap and read as the shipped loop; the writes stop and the
 * loop stops, because there was never a loop, only events close enough together to
 * look like one.
 *
 * **The keyframes are untouched and imported rather than copied**, so `agent-wind.css`
 * stays `src/ui/ui.css` byte for byte and the one declaration this frame changes is
 * visible at the call site as an inline `animationIterationCount`.
 *
 * **The stand-off is the compile's and so is its unsolved collision.** The plate is
 * still the widest occupant, so the centre stands at 15 and the `shot` corners are
 * struck from the same number, which puts their top rail at y 31 through the frame's
 * own name at y 29 to 41. The wind adds nothing to that argument: a pass rides the
 * thread's own centre line at 3px, which is inside every claim already made.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

/** one write, still on the wall */
export interface Trace {
	/** the block, and which write put it there — a second write to one block restarts the mark rather than stacking */
	readonly key: string;
	readonly block: BlockId;
	/** the block's box at the revision the write made */
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
 * Which verbs change the frame, and which only take it in. Three postures absorb five
 * verbs, inherited from every frame in this family without argument. This capture plays
 * `write`, `shot`, `look`, `logs` and `edit`; `read`, which it happens not to contain,
 * lands in the posture it already belongs to with nothing new drawn.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is and what it has left behind, read off the same rows the rail is
 * reading. The compile's reader, unchanged: when no call is open the hand falls back to
 * the last row that had one, because the agent is between calls and has not gone
 * anywhere.
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
 * The writes that have landed, one mark per block, each carrying the box the block had
 * at the moment its write made it. The compile's, unchanged.
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
/** what a frame is authored at, so a block's box becomes a height on the wall */
const NAT_W = 240;
const S = FW / NAT_W;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the object ---------- */

/**
 * How far outside the wall the presence's centre line sits: the compile's 15, forced by
 * the plate's 16px body plus the lane's 5 plus two of air, and paid for by the `shot`
 * corners striking through the frame's own name. Nothing about the wind moves it.
 */
const OUT = 15;
const THREAD = 2;
const PART = 76;
/** the plate shut with nothing wound on it yet */
const REST = 9;
const PLATE_W = 16;

/**
 * The store: how much fatter the shut plate is once the whole turn has been wound onto
 * it, and the one channel here that is still doing something in the dead air.
 *
 * **Five pixels, and the curve is the material's rather than a designer's.** Thread has
 * volume, so a spool's radius grows as the square root of the length wound on: the
 * first turn moves it most and the last barely at all. Here that is 1.39px for write
 * one and 0.20px for write thirteen, against thirteen equal steps of 0.38px which would
 * have been a creep nobody could see at either end.
 *
 * It is read at rest and only at rest, which is the whole reason it is the plate's shut
 * size rather than a mark of its own: an open plate is 16 wide and the store is
 * invisible under it, and an open plate means a call is running. So the store draws
 * exactly in the 46% of the turn when nothing else here is saying anything.
 */
const STORE = 5;

export function store(written: number): number {
	return REST + STORE * Math.sqrt(Math.max(0, Math.min(1, written / WRITES)));
}

/**
 * The plate open, and the number the count broke. `--plate` fixed this at 38 and rested
 * its whole argument on never resizing; `edit ×6` is 43.3px of mono and wants 51, and 51
 * is not a bound either. Inherited from the compile with its complaint.
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
/**
 * The envelope, and it is the whole answer to a 186ms call. Tension arrives on the
 * instant and slack comes back slowly, which is what a thread does. Nine of the twelve
 * calls in this turn run under 1600ms and five run under 320ms, so a symmetric channel
 * blinks.
 */
const TAUT_MS = 0.09;
const SLACK_MS = 0.32;
const INK = 0.78;

/**
 * The wind, and the two numbers it is allowed.
 *
 * `PASS_MS` is not a choice: it is `--animate-agent-wind`'s own 1600ms, and if it were
 * anything else this frame would not be testing what it says it is testing. `PASS_W` is
 * 3 against the thread's 2, because a swell running along a line has to be told from
 * the line, and the family has spent ink three ways on this wall already.
 */
const PASS_MS = 1600;
const PASS_W = 3;

/**
 * How long the track is, and the one honest loss in porting the shipped stroke.
 *
 * The pass runs from the top of the frame's wall down into the core, so the track is
 * half the wall: 164.5px. The shipped stroke crosses 420px in the same 1600ms, which
 * `agent-load--ride` priced at 0.26px/ms; this is 0.103. **The curve is identical in
 * proportion and 60% slower on screen**, because the keyframes are a percentage of
 * whatever they are given and a frame's wall is not a rail.
 *
 * It terminates at the core rather than crossing the whole wall on purpose. A segment
 * that runs a rectangle's full edge and comes out the other side is the thing round
 * four already named — "a segment on a track is the indeterminate progress bar". A
 * segment that runs into something and stops is thread going onto a spool.
 */
const TRACK = FH / 2;

/** how far past the arc each corner arm runs */
const ARM = 11;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * How long a write stays on the wall, in seconds, and the beat it holds at full before
 * it starts going. `--accrue` measured the window at 1.3s wide and nothing here moves it.
 */
const LIFE = 6;
const RISE = 0.08;
const HELD = 0.7;
const PEAK = 0.9;

/**
 * How wide a frame must draw before the canvas mounts its document — `src/cover.ts:8`,
 * enforced at `lifecycle.ts:245`. The lane's heights are the one thing here that needs a
 * live document; every other channel is drawn outside the iframe and is true at any zoom.
 */
const LIVE_MIN_CSS_PX = 400;

export function laneLives(drawn: number): boolean {
	return drawn >= LIVE_MIN_CSS_PX;
}

/**
 * The one fiction in this frame, named at the line that introduces it. `laneLives(152)`
 * is false and the lane is drawn anyway, because a frame that correctly draws nothing
 * cannot be judged. `--accrue`'s override, inherited with its reason.
 */
const DIAGRAM = true;

/** what the whole assembly claims of the 44px gutter it docks in: the compile's 23 of it */
const NEED = 29;

export type Side = "left" | "right";

/**
 * Which wall. The tie breaks right, which is `--accrue`'s one-character fix: a walk
 * arrow's head lands on a frame's **left** wall at `ROW_1 + 186`, so breaking left would
 * park the whole assembly under an accent triangle.
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
 * The four corners a `shot` puts the ink at. `--ghost` established that a closed
 * rectangle outside a frame is a selection ring, so it is four corners and a corner is
 * not a ring at any weight because it is not closed.
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
 * The wall run, sampled. One line through the head, `length` tall, displaced sideways by
 * a sine with a node at the head, so the thread passes through its own core at every
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
 * The rung the object is drawn on, which is `--roster`'s ladder. On this canvas the first
 * rung always holds, so it resolves to `frame` for all 37.7 seconds and costs nothing —
 * and it is still the only channel here that survives the camera moving.
 */
export type Rung = "frame" | "row" | "page" | "strip";

export function rungOf(frame: string, drawn: readonly string[]): Rung | null {
	if (drawn.includes(frame)) return "frame";
	return null;
}

/**
 * The passes in flight, which is the whole of the wind's state.
 *
 * One pass per write, mounted on the write's own cue and unmounted 1600ms later on its
 * own timer rather than on a shared clock — the same reason the lane's marks carry their
 * own: `useTicker` moves at 100ms and anything driven off it steps ten times a second.
 * Each pass keeps its timer when the next write lands, which is what lets three of them
 * be on the wall at once.
 *
 * A revision that climbs by more than one in a commit lays one pass rather than several.
 * The only thing that does that is the reduced-motion jump cut, and reduced motion lays
 * none at all.
 */
function usePasses(written: number, still: boolean): readonly number[] {
	const [live, setLive] = useState<readonly number[]>([]);
	const last = useRef(written);
	const timers = useRef<number[]>([]);

	useEffect(() => {
		const before = last.current;
		last.current = written;
		if (still) return;
		if (written <= before) {
			for (const timer of timers.current) window.clearTimeout(timer);
			timers.current = [];
			setLive([]);
			return;
		}
		setLive((prev) => [...prev, written]);
		timers.current.push(
			window.setTimeout(() => setLive((prev) => prev.filter((nth) => nth !== written)), PASS_MS),
		);
	}, [written, still]);

	useEffect(
		() => () => {
			for (const timer of timers.current) window.clearTimeout(timer);
		},
		[],
	);

	return still ? [] : live;
}

/**
 * The layer, over the field.
 *
 * The whole answer to travel is the `key`. A presence keyed on the frame it is at cannot
 * move between two frames: it lets go here and takes hold there, both at once, which is
 * what the wire says. The wind makes the temptation worse rather than better — a
 * travelling segment is exactly the object somebody would want to run from one frame to
 * the next — and it is refused for the family's reason, which is that a path between two
 * frames is only drawable when the camera happens to hold both.
 */
export function WindLayer({
	hand,
	base,
	written,
}: {
	hand: Hand | null;
	base: readonly string[];
	written: number;
}) {
	const index = hand === null ? -1 : base.indexOf(hand.frame);
	const rung = hand === null ? null : rungOf(hand.frame, base);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || index === -1 || rung !== "frame" ? null : (
					<Held key={hand.frame} hand={hand} index={index} count={base.length} written={written} />
				)}
			</AnimatePresence>
		</div>
	);
}

function Held({
	hand,
	index,
	count,
	written,
}: {
	hand: Hand;
	index: number;
	count: number;
	written: number;
}) {
	const still = useReducedMotion() === true;
	const box = { x: COLS[index] ?? 0, y: ROW_1, w: FW, h: FH };
	const dock = dockOf(index, count);
	const out = dock.side === "left" ? -1 : 1;
	const wallX = dock.side === "left" ? box.x : box.x + box.w;
	const line = wallX + out * OUT;
	const mid = box.y + box.h / 2;
	const trace = corners(box);
	const passes = usePasses(written, still);

	/**
	 * Two states, and drawing it is what separated them.
	 *
	 * `open` is a call, and it is the plate's: the box grows along the thread to hold a
	 * word, and the word is what it grew for.
	 *
	 * `taut` is a call **or** thread still running on, and it is the thread's. A slack
	 * line with thread arriving on it is not a thing, and drawing one would read as two
	 * objects that had stopped agreeing. So the last pass of a run holds the tension for
	 * up to 1600ms past the call that made it, which is measured and is the lesser of the
	 * two wrongs: it takes 2,442ms out of the turn's 19,914ms of dead air and leaves all
	 * eleven gaps standing. One of them comes out at 88 milliseconds — the last pass of
	 * the run of four ends 88ms before the `shot` opens — and at 88ms of a 320ms release
	 * the thread sags six tenths of one pixel and is pulled straight again.
	 *
	 * **They were one flag until the frame was played, and one flag is a defect**: the
	 * plate stood open holding nothing for the 830ms tail of every run, which is a box
	 * that grew to say a word and then said none. A pass is not a call and must not be
	 * able to open the plate.
	 */
	const open = hand.verb !== null;
	const taut = open || passes.length > 0;
	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;

	// the plate grows up out of its node rather than around it, which is `--plate`'s own
	// fix: an incoming walk arrowhead lands at `ROW_1 + 186`, 21.5px below the frame's
	// centre, and a 51px plate centred there would take the tip in its bottom corner
	const foot = mid + REST / 2;
	const rest = store(written);

	// two numbers and one line. Length is the hold and moves at the pace a posture
	// changes; amplitude is the pull and moves at the pace a call opens
	const length = useMotionValue(held);
	const amp = useMotionValue(taut ? 0 : SLACK);
	const path = useTransform([length, amp], (latest: number[]) => wall(latest[0] ?? 0, latest[1] ?? 0, line, mid, out));

	useEffect(() => {
		const run = animate(length, held, { duration: still ? 0 : 0.22, ease: ARRIVE });
		return () => run.stop();
	}, [held, length, still]);

	useEffect(() => {
		const run = animate(amp, taut ? 0 : SLACK, {
			duration: still ? 0 : taut ? TAUT_MS : SLACK_MS,
			ease: taut ? "easeOut" : "easeInOut",
		});
		return () => run.stop();
	}, [taut, amp, still]);

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
				{/* the `shot` posture: four corners, struck from the same stand-off the plate is
				    centred on, which is what puts the top rail through the frame's name */}
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
			{/* the lane: the writes, where they landed, going out on their own clocks. It needs
			    a live document to know a height, so below 400 drawn pixels the honest drawing is
			    nothing at all and this is the frame overriding that on purpose */}
			{laneLives(FW) || DIAGRAM
				? hand.traces.map((mark) => (
						<Mark key={mark.key} mark={mark} box={box} wall={wallX} side={dock.side} still={still} />
					))
				: null}
			{/* the wind: one pass per write, laid down the wall and into the core. Under the
			    plate, so a pass ends where the thread is taken up rather than crossing it */}
			{passes.map((nth) => (
				<Pass key={nth} line={line} top={box.y} />
			))}
			{/* the plate: the participant, the word it is holding, and how much has been wound
			    onto it. Shut it is `--presence`'s head grown by the store; open it is the same
			    box run up along the thread with one word standing in it */}
			<motion.span
				className="absolute overflow-hidden rounded-[2px] border border-muted bg-canvas"
				initial={{ width: REST, height: REST, left: line - REST / 2, top: foot - REST, opacity: 0 }}
				animate={{
					width: open ? PLATE_W : rest,
					height: open ? PLATE_H : rest,
					left: line - (open ? PLATE_W : rest) / 2,
					top: foot - (open ? PLATE_H : rest),
					opacity: 1,
				}}
				exit={{ width: rest, height: rest, left: line - rest / 2, top: foot - rest, opacity: 0 }}
				transition={{ duration: still ? 0 : SHUT_MS, ease: ARRIVE }}
			>
				{/* the word runs bottom to top, which is what lets it live in a 16px column. It
				    cuts when one verb replaces another, because at 10px a crossfade is two words
				    on top of each other and neither is readable */}
				<motion.span
					className="absolute whitespace-nowrap font-mono text-2xs text-text leading-3"
					style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(-90deg)" }}
					initial={{ opacity: 0 }}
					animate={{ opacity: open ? 1 : 0 }}
					transition={{ duration: still ? 0 : 0.1, ease: "linear" }}
				>
					{word}
				</motion.span>
			</motion.span>
		</>
	);
}

/**
 * One write, drawn as one pass of the shipped stroke.
 *
 * **The element is the rail's own.** `origin-left`, `[transform:scaleX(0)]` as the base
 * so nothing is drawn until the keyframes take the transform over, and the `.agent-wind`
 * class straight out of `agent-wind.css`. The one declaration this frame adds is
 * `animationIterationCount: 1`, inline, where it can be read: the rail loops because it
 * does not know how long, and a write is over the moment it happens.
 *
 * **The rotation is what makes a horizontal track vertical without touching a
 * keyframe.** The wrapper is a `TRACK`-long, `PASS_W`-tall box turned 90 degrees about
 * its own top-left corner, so the animation's local +x runs down the frame's wall and
 * `translateX(0%) → translateX(100%)` is the top of the frame to the core. Nothing is
 * clipped, because the track is `scaleX(0)` at both ends of the cycle — which is also
 * why a pass needs no exit: the shipped curve ends at nothing all by itself.
 */
function Pass({ line, top }: { line: number; top: number }) {
	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute block"
			style={{
				left: line + PASS_W / 2,
				top,
				width: TRACK,
				height: PASS_W,
				transform: "rotate(90deg)",
				transformOrigin: "0 0",
			}}
		>
			<span className="agent-wind block h-full w-full origin-left bg-text [transform:scaleX(0)]" style={{ animationIterationCount: 1 }} />
		</span>
	);
}

/**
 * One write, on the wall, going out.
 *
 * It mounts when its cue fires, so the clock is the capture's own and no ticker is in the
 * path. Ink carries the age, width carries it again so a stale mark reads as residue
 * rather than as a live mark somebody drew faintly, and the mark thins toward the frame.
 *
 * **This is the third thing on this wall that counts a write**, after the plate's `×N`
 * nine pixels out and the store six past that, and the compile already flagged the first
 * two. What keeps them from being one channel repeated is that they answer three
 * different questions: the lane says where, just now; the count says how many in this
 * run; the store says how much altogether and never goes down. It is still three.
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
