import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { boxOf, type LiftSlot, RADIUS, SLOTS, wallsOf } from "./lift-field";

/**
 * The presence, inherited from the `--ghost-loud` compile with two channels taken off
 * it, and both cuts are forced rather than chosen.
 *
 * What is left is `--presence`'s head welded to the wall, `--spool`'s thread — length
 * is the kind of hold, tension is whether a call is open — and `--ghost`'s four
 * corners for a `shot`, which never close. Three postures absorbing five verbs, no
 * travel, no accent, nothing spinning. None of that is re-argued here.
 *
 * **The pluck is gone.** `--spool` shivers the thread once per write. This direction's
 * whole claim is that the element that changed is the only thing saying an edit
 * happened, so a second object firing on the same instant is the claim withdrawn nine
 * pixels from the frame's edge. The wall says *the agent is here and a call is open*;
 * the interior says *this is what it did*. Neither is redundant and neither is
 * sufficient — through the dead air, 21.6 of this turn's 37.7 seconds, the thread is
 * the only thing on screen.
 *
 * **The plate is gone, with its count.** It was the compile's own first two cuts and
 * here they are not preferences: a plate holding `edit ×6` is a third counter on one
 * screen and the second on this wall, and this direction cannot have a second thing
 * counting writes without giving up its argument. What that buys back is the number
 * the compile could not solve. The plate forced the stand-off to 15, the `shot`
 * corners are struck from the same line, and their top rail landed inside the frame's
 * own name. Without it the stand-off is `--presence`'s own **6**, and the name clears.
 *
 * **What a wide frame does to the object.** The tie-break is inherited and it never
 * fires, because beside `home` there is no tie: the left wall is the 44px gutter and
 * the right wall is seven pixels of margin. So the presence docks left, on the wall an
 * incoming walk arrowhead would land on, and it has no choice. The corners have no
 * choice either — struck at 6 they reach x 771 of a 772px viewport, one pixel inside
 * the edge.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** the `shot` call is open: the ink leaves the wall and goes to the corners */
	readonly picturing: boolean;
}

/**
 * Which verbs change the frame, and which only take it in.
 *
 * Inherited from every frame in this family without argument. This capture plays
 * `write`, `shot`, `look`, `logs` and `edit`; `read`, which it happens not to contain,
 * lands in the posture it already belongs to with nothing new drawn.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is, read off the same rows the rail is reading.
 *
 * When no call is open the hand falls back to the last row that had one: the agent is
 * between calls and has not gone anywhere, so the object keeps its posture and drops
 * its word.
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
	return {
		frame,
		hold: HOLD[on.verb] ?? "whole",
		verb: open === null ? null : open.verb,
		picturing: open !== null && open.verb === "shot",
	};
}

/* ---------- the object ---------- */

/** how far outside the wall the object sits: the thread's centre line and the corners share it */
const OUT = 6;
const THREAD = 2;
const PART = 76;
const HEAD = 7;
/** how far past the arc each corner arm runs */
const ARM = 11;

/** how far a slack thread lies off the straight, and how long one lie of it runs */
const SLACK = 4;
const WAVE = 46;
/**
 * The envelope. Tension arrives on the instant and slack comes back slowly, which is
 * what a thread does. Five of this capture's twelve calls run under 320ms, so a
 * symmetric channel toggles twelve times and blinks.
 */
const TAUT_MS = 0.09;
const SLACK_MS = 0.32;
const INK = 0.78;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * The four corners a `shot` puts the ink at, each drawn from one arm around the arc to
 * the other.
 *
 * `--ghost` established that a closed rectangle outside a frame is a selection ring —
 * spool's own `Slot` draws that exact shape at `inset: -1` — and held for the 670 to
 * 750ms a `spool shot` takes it will be read as one. A corner is not a ring at any
 * weight because it is not closed.
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
 * One line through the head, `length` tall, displaced sideways by a sine with a node
 * at the head — so the thread passes through its own core at every amplitude and only
 * the lie of it changes.
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
 * The layer, over the field.
 *
 * The whole answer to travel is the `key`. A presence keyed on the frame it is at
 * cannot move between two frames: it lets go here and takes hold there, both at once,
 * which is what the wire says.
 */
export function HandLayer({ hand }: { hand: Hand | null }) {
	const index = hand === null ? -1 : SLOTS.findIndex((slot) => slot.name === hand.frame);
	const slot = index === -1 ? undefined : SLOTS[index];
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || slot === undefined ? null : (
					<Held key={hand.frame} hand={hand} slot={slot} walls={wallsOf(index)} />
				)}
			</AnimatePresence>
		</div>
	);
}

function Held({ hand, slot, walls }: { hand: Hand; slot: LiftSlot; walls: { left: number; right: number } }) {
	const still = useReducedMotion() === true;
	const box = boxOf(slot);
	// the tie-break goes right and there is no tie beside a wide frame: 44 against 7
	const side = walls.left > walls.right ? "left" : "right";
	const dir = side === "left" ? -1 : 1;
	const wallX = side === "left" ? box.x : box.x + box.w;
	const line = wallX + dir * OUT;
	const mid = box.y + box.h / 2;
	const trace = corners(box);
	const live = hand.verb !== null;
	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;

	// two numbers and one line. Length is the hold and moves at the pace a posture
	// changes; amplitude is the pull and moves at the pace a call opens
	const length = useMotionValue(held);
	const amp = useMotionValue(live ? 0 : SLACK);
	const path = useTransform([length, amp], (latest: number[]) => wall(latest[0] ?? 0, latest[1] ?? 0, line, mid, dir));

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
			{/* the head: the participant itself. It is the one thing here that never changes,
			    because being at this frame is not a state that has degrees */}
			<motion.span
				className="absolute rounded-[2px] bg-text"
				style={{ left: line - HEAD / 2, top: mid - HEAD / 2, width: HEAD, height: HEAD }}
				initial={{ opacity: 0, scale: 0.5 }}
				animate={{ opacity: 0.92, scale: 1 }}
				exit={{ opacity: 0, scale: 0.5 }}
				transition={{ duration: still ? 0 : 0.2, ease: ARRIVE }}
			/>
		</>
	);
}
