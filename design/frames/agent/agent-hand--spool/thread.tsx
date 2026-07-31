import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * The presence as thread: a core welded to the wall, and one line off it.
 *
 * Same participant as `agent-hand--presence`, same two questions asked of it, and
 * the second channel moved out of paint and into physics. The **head** is
 * unchanged, down to the pixel — a 7px square at the frame's wall, arriving when
 * the agent starts here and going when it moves on. What comes off it is one 2px
 * stroke, at one strength, forever.
 *
 * **Length is the kind of hold**, exactly as the parent has it: the wall's whole
 * height while the agent is taking the frame in, a short run while it is changing
 * it, and off the wall and around the box for the beat it is photographing it.
 *
 * **Tension is whether a call is open.** Taut is a dead straight line lying against
 * the wall. Quiet is the same line gone slack: a low, still serpentine, 4px of
 * amplitude on a 46px wave, which is the shape a thread takes when nothing is
 * pulling it. Nothing dims and nothing spins.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** writes landed so far in a run, so the chip counts the way the row counts */
	readonly count: number;
	/** the `shot` call is open: the thread is off the wall and around the frame */
	readonly picturing: boolean;
}

/**
 * Which verbs change the frame. Three postures, five verbs, unchanged from the
 * parent — this is the property that survived the brief being wrong, and nothing
 * about drawing the hold as thread gives it a reason to move.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is, read off the same rows the rail is reading.
 *
 * Byte-for-byte the parent's reader. It is copied rather than shared on purpose:
 * the two frames have to be able to disagree about the drawing while agreeing
 * exactly about the facts, and a shared reader would let a change to one quietly
 * move the other.
 */
export function handOf(script: Script, turn: Turn): Hand | null {
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
	};
}

/* ---------- the field's geometry, copied ----------
 * `spool-play-field.tsx` has no slot for another layer and shared/ is not this
 * frame's to change, so the thread is a sibling of the field drawn in the same
 * coordinates. That holds exactly as long as the camera is still. */

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const FW = 152;
const FH = 329;
/** the frame's own corner, so the ring can be struck concentric with it */
const RADIUS = 12;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the object ---------- */

/** how far outside the wall the thread's centre line sits, ring included */
const OUT = 6;
/**
 * One width, everywhere.
 *
 * The parent needs two: a 3px filled bar for the grip and a 1.5px stroke for the
 * ring, because a bar and an outline are different objects and a 3px box around a
 * frame is a border. A thread is one line whichever path it is on, so the same 2
 * carries the wall run and the whole way round the box. That is the cleanest thing
 * the metaphor buys and it is also its clearest cost: 2px is thinner than 3, and
 * length at canvas distance is carried by weight.
 */
const STROKE = 2;
const PART = 76;
const HEAD = 7;
const CHIP_H = 18;
const CHIP_GAP = 6;
/** the thread's one strength: it never changes, because the agent is never half here */
const INK = 0.78;

/** how far a slack line lies off the straight, and how long one lie of it runs */
const SLACK = 4;
const WAVE = 46;
/** one write, drawn as a pluck on a line that is already taut */
const PLUCK = 1.6;

/**
 * The envelope, and it is the whole answer to a 186ms call.
 *
 * Tension arrives on the instant and slack comes back slowly, which is what a
 * thread does and is not what an opacity ramp has any reason to do. Five of the
 * twelve calls in this window run under 320ms, so a symmetric channel toggles
 * twelve times in 37.6 seconds and blinks. At 90 on and 320 off, a burst of short
 * calls never lets go of taut and only a real gap reads as one.
 */
const TAUT_MS = 0.09;
const SLACK_MS = 0.32;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * What a chip needs to be worth docking: `edit ×6` is 54px at 10px mono with its
 * padding, plus the six it stands off the head.
 */
const NEED = 64;

export type Side = "left" | "right";

/**
 * Which wall, and whether there is room for words. The parent's arithmetic, kept
 * so the two frames dock identically: three 152px frames at 114, 310 and 506 in a
 * 772px viewport leave 114 of open field at each end and 44 between neighbours, so
 * the outer walls can hold a word and the inner ones cannot.
 */
export function dockOf(index: number, count: number): { side: Side; words: boolean } {
	const here = COLS[index] ?? 0;
	const before = COLS[index - 1];
	const after = COLS[index + 1];
	const left = index === 0 || before === undefined ? here : here - (before + FW);
	const right = index === count - 1 || after === undefined ? VIEW_W - (here + FW) : after - (here + FW);
	return { side: left >= right ? "left" : "right", words: Math.max(left, right) >= NEED };
}

/**
 * The wall run, sampled.
 *
 * One line through the head, `length` tall, displaced sideways by a sine with a
 * node at the head — so the thread passes through its own core at every amplitude
 * and only the lie of it changes. At 4px on a 46px wave the run stays between 2 and
 * 10 pixels off the frame, so a slack thread never lies over the frame it is
 * holding.
 *
 * A polyline rather than a curve, and rewritten in place while the amplitude
 * moves: `agent-spun--slack` established that cost and bounded it the same way, by
 * writing only while something is changing. Every point is 4px of run, so the whole
 * wall is 83 points and a write's segment is 20.
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
 * The frame's outline, in two halves that both start at the head.
 *
 * A `shot` is the one call whose subject is the whole frame, so it is the one state
 * where the thread stops holding a wall and goes all the way round the box: the two
 * ends run up and down from the head, around the corners, and meet on the far wall.
 * It is the same 2px line on a path four times longer, and it exists only while the
 * call is open — which is the one honest hole in the tension channel, because a
 * thread that is only ever out there under load has no slack state to draw.
 */
function halves(box: { x: number; y: number; w: number; h: number }, side: Side): { d: readonly string[]; len: number } {
	const dir = side === "left" ? 1 : -1;
	const r = RADIUS + OUT;
	const x0 = side === "left" ? box.x - OUT : box.x + box.w + OUT;
	const x1 = side === "left" ? box.x + box.w + OUT : box.x - OUT;
	const y0 = box.y - OUT;
	const y1 = box.y + box.h + OUT;
	const mid = (y0 + y1) / 2;
	const up = dir === 1 ? 1 : 0;
	return {
		d: [
			`M ${x0} ${mid} V ${y0 + r} A ${r} ${r} 0 0 ${up} ${x0 + dir * r} ${y0} H ${x1 - dir * r} A ${r} ${r} 0 0 ${up} ${x1} ${y0 + r} V ${mid}`,
			`M ${x0} ${mid} V ${y1 - r} A ${r} ${r} 0 0 ${1 - up} ${x0 + dir * r} ${y1} H ${x1 - dir * r} A ${r} ${r} 0 0 ${1 - up} ${x1} ${y1 - r} V ${mid}`,
		],
		len: 2 * (mid - y0 - r) + Math.PI * r + (Math.abs(x1 - x0) - 2 * r),
	};
}

/**
 * The layer, over the field.
 *
 * The whole answer to travel is still the `key`. A presence keyed on the frame it
 * is at cannot move between two frames: it lets go here and takes hold there, both
 * at once, because that is what the wire says. Thread makes the temptation worse
 * rather than better — a line is exactly the object somebody would want to run from
 * one frame to the next — and it is refused for the parent's reason, which is that
 * a path between two frames is only drawable when the camera happens to hold both.
 */
export function ThreadLayer({ hand, base }: { hand: Hand | null; base: readonly string[] }) {
	const index = hand === null ? -1 : base.indexOf(hand.frame);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || index === -1 ? null : (
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
	const trace = halves(box, dock.side);
	const live = hand.verb !== null;
	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;

	// two numbers and one line. Length is the hold and moves at the pace a posture
	// changes; amplitude is the pull and moves at the pace a call opens
	const length = useMotionValue(held);
	const amp = useMotionValue(live ? 0 : SLACK);
	const path = useTransform([length, amp], (latest: number[]) =>
		wall(latest[0] ?? 0, latest[1] ?? 0, line, mid, out),
	);

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

	// a write is a pluck rather than a length: in the parent one write flicks the
	// segment longer, which spends the posture channel on an event and says the
	// agent's hold changed when it did not. Here it rides the channel events belong
	// to, and the line shivers where it is already taut
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
				{/* the thread on the wall. It arrives and leaves by winding off and back
				    onto the head rather than by fading, so taking hold and letting go are
				    the same gesture in two directions */}
				<motion.path
					d={path}
					stroke="var(--color-text)"
					strokeOpacity={INK}
					strokeWidth={STROKE}
					strokeLinecap="round"
					initial={{ pathLength: 0, pathOffset: 0.5 }}
					animate={{ pathLength: 1, pathOffset: 0 }}
					exit={{ pathLength: 0, pathOffset: 0.5 }}
					transition={{ duration: still ? 0 : 0.24, ease: ARRIVE }}
				/>
				{/* the same thread, let all the way out around the box */}
				{trace.d.map((d) => (
					<motion.path
						key={d}
						d={d}
						stroke="var(--color-text)"
						strokeOpacity={INK}
						strokeWidth={STROKE}
						strokeLinecap="round"
						strokeDasharray={trace.len}
						initial={{ strokeDashoffset: trace.len }}
						animate={{ strokeDashoffset: hand.picturing ? 0 : trace.len }}
						exit={{ strokeDashoffset: trace.len }}
						transition={{ duration: still ? 0 : hand.picturing ? 0.3 : 0.24, ease: ARRIVE }}
					/>
				))}
			</svg>
			{/* the head: the core the thread comes off, and the one thing here that never
			    changes, because being at this frame is not a state that has degrees */}
			<motion.span
				className="absolute rounded-[2px] bg-text"
				style={{ left: line - HEAD / 2, top: mid - HEAD / 2, width: HEAD, height: HEAD }}
				initial={{ opacity: 0, scale: 0.5 }}
				animate={{ opacity: 0.92, scale: 1 }}
				exit={{ opacity: 0, scale: 0.5 }}
				transition={{ duration: still ? 0 : 0.2, ease: ARRIVE }}
			/>
			{dock.words ? (
				<div
					className="absolute"
					style={{
						left: line + out * (HEAD / 2 + CHIP_GAP),
						top: mid - CHIP_H / 2,
						...(dock.side === "left" ? { transform: "translateX(-100%)" } : {}),
					}}
				>
					<AnimatePresence>
						{hand.verb === null ? null : (
							<motion.span
								key="word"
								className="flex items-center whitespace-nowrap rounded-xs bg-canvas px-1.5 font-mono text-2xs text-text leading-3"
								style={{ height: CHIP_H }}
								initial={{ opacity: 0 }}
								/* the chip is the parent's, unchanged and deliberately so: the
								   comparison between these two frames has to be about the object
								   rather than about the receipt beside it */
								animate={{ opacity: 1, transition: { duration: still ? 0 : 0.1 } }}
								exit={{ opacity: 0, transition: { duration: still ? 0 : 0.3 } }}
							>
								{word}
							</motion.span>
						)}
					</AnimatePresence>
				</div>
			) : null}
		</>
	);
}
