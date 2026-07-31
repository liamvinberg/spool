import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * The presence: one object docked to the frame the agent is working on, and the
 * verbs as states of it.
 *
 * **This is `agent-hand--presence`'s file, byte for byte, and the copy is the
 * argument.** This direction's proposal is that the frame changing is the whole of
 * what an edit needs, so the presence had to be given nothing and taken nothing
 * from: any diff here would be a second variable in an experiment with one
 * question. What did change is where `home` sits — the middle column rather than
 * the end — and `dockOf` answers that on its own. Both gutters measure 44px against
 * the 64 a word needs, so out here the presence is a head and a grip and no chip at
 * all, which is the case the parent designed for and never drew.
 *
 * Two parts and they mean different things. The **head** is the participant — a
 * small square welded to the frame's wall that arrives when the agent starts on
 * this frame, never changes while it is there, and goes when it moves on. The
 * **grip** is what the head has hold of: the wall's whole height while the agent
 * is taking the frame in, a short segment while it is changing it, and nothing at
 * all for the beat it is photographing it, because that is the one call where the
 * grip leaves the wall and runs around the box.
 *
 * Two channels, and keeping them apart is the whole of the drawing. **Length is
 * the kind of hold** and it survives the gaps between calls, because the agent has
 * not let go of anything by pausing. **Ink is whether a call is open right now**,
 * so the gap reads as the same object gone quiet rather than as a different one.
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
	/** the `shot` call is open: the grip is off the wall and around the frame */
	readonly picturing: boolean;
}

/**
 * Which verbs change the frame.
 *
 * The three verbs this direction was briefed on are `read`, `shot` and `edit`, and
 * the capture holds five: `session` + `run` on `claude-edits` projects `write`,
 * `shot`, `look`, `logs` and `edit`, twenty-one rows, every one of them naming
 * `home`. That is the argument for a posture rather than a lookup — three postures
 * absorb five verbs, and `read`, which this window happens not to contain, lands in
 * the one it belongs to without a new drawing.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is, read off the same rows the rail is reading.
 *
 * The row's frame is known the moment the tool block opens, a beat before the
 * subject has typed itself in — the rail waits for it because it has to print a
 * word, and the canvas does not, because taking hold of the frame *is* the naming.
 *
 * When no call is open the hand falls back to the last row that had one. That is
 * the dead air: the agent is between calls and has not gone anywhere, so the object
 * keeps the posture it was in and drops its word.
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
 * frame's to change, so the presence is a sibling of the field drawn in the same
 * coordinates. That holds exactly as long as the camera is still, which is why this
 * frame never centres on anything: `PlayField` translates its own contents and
 * would leave this layer behind. */

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const FW = 152;
const FH = 329;
/** the frame's own corner, so the outline can be struck concentric with it */
const RADIUS = 12;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the object ---------- */

/** how far outside the wall the object sits: the grip's centre line and the outline share it */
const OUT = 6;
const GRIP_W = 3;
const PART = 76;
const HEAD = 7;
const CHIP_H = 18;
const CHIP_GAP = 6;
/** one write, drawn: the segment flicks longer and settles */
const TICK_RISE = 22;
const TICK_MS = 150;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * What a chip needs to be worth docking: `edit ×6` is 54px at 10px mono with its
 * padding, plus the six it stands off the head.
 */
const NEED = 64;

export type Side = "left" | "right";

/**
 * Which wall, and whether there is room for words.
 *
 * `agent-walk-ambient` found that the side a docked object takes is a property of
 * the frame's situation rather than of the mark, and this arrangement says it in
 * numbers: three 152px frames at 114, 310 and 506 in a 772px viewport leave 114 of
 * open field at each end of the row and 44 between neighbours. So the outer walls
 * can hold a chip and the inner ones cannot, and a frame with neighbours on both
 * sides keeps the head and the grip and loses the word — which is the same law the
 * covers and the walk tags already obey: below the size where words are worth their
 * ink, the words go and the stub stays.
 *
 * **The tie is broken by the threads, and that is the one line of this file the
 * parent did not have to write.** A frame in the middle of a row has 44px on both
 * sides, so `left >= right` was picking the left wall on nothing — and the left wall
 * is where an incoming walk lands its arrowhead, at `ROW_1 + 186` in
 * `spool-play-field.tsx`, which is 21.5px below the head and straight through a grip
 * of any length. Rendered at 10x it reads as the walk terminating in the presence.
 * The right wall carries only the outgoing edge's tail, a 1.5px stroke crossing a
 * 3px bar at a right angle, which reads as a line passing behind a mark and is what
 * every other crossing on a canvas looks like. So on a tie the object takes the wall
 * the walk leaves from rather than the one it arrives at: a head is a terminus and a
 * tail is a passage.
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
 * The frame's outline, in two halves that both start where the grip is.
 *
 * A `shot` is the one call whose subject is the whole frame, so it is the one state
 * where the object stops holding a wall: the grip's two ends run up and down from
 * the head, around the corners, and meet again on the far wall. It is the same ink
 * spread over a path four times longer than the wall, which is why it is struck at
 * 1.5px and not at 3 — a 3px box around a frame is a border, and this is not one.
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
 * The whole answer to travel is the `key`. A presence keyed on the frame it is at
 * cannot move between two frames: it lets go here and takes hold there, and the two
 * halves run at once because that is what the wire says — one call ends and the next
 * begins. Nothing crosses the canvas, because there is no crossing to draw. The
 * agent is not in the room and does not walk; a token that slid from one frame to
 * the next would be the fake cursor with a different head on it, and it would only
 * be drawable at all when both frames happened to be on screen, which makes the
 * object's grammar a property of where the camera is pointing.
 */
export function HandLayer({ hand, base }: { hand: Hand | null; base: readonly string[] }) {
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
	const dir = dock.side === "left" ? -1 : 1;
	const wall = dock.side === "left" ? box.x : box.x + box.w;
	const line = wall + dir * OUT;
	const mid = box.y + box.h / 2;
	const trace = halves(box, dock.side);
	const live = hand.verb !== null;

	// one write, drawn where the writing is: the segment flicks longer and settles.
	// Nothing here loops — every movement on this canvas is a call starting, a call
	// landing, or one of the six writes inside a run
	const [bump, setBump] = useState(false);
	useEffect(() => {
		if (hand.count === 0) return;
		setBump(true);
		const timer = window.setTimeout(() => setBump(false), TICK_MS);
		return () => window.clearTimeout(timer);
	}, [hand.count]);

	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;
	const length = held === 0 || still || !bump ? held : held + TICK_RISE;
	const move = { duration: still ? 0 : 0.22, ease: ARRIVE };

	const word = hand.verb === null ? "" : hand.count > 1 ? `${hand.verb} ×${hand.count}` : hand.verb;

	return (
		<>
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
				fill="none"
				aria-hidden="true"
			>
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
						transition={{ duration: still ? 0 : hand.picturing ? 0.3 : 0.24, ease: ARRIVE }}
					/>
				))}
			</svg>
			{/* the grip: length is what the agent has hold of, ink is whether it is
			    doing anything to it. Both ends grow from the head, so a posture change
			    is the same object opening rather than a second one arriving */}
			<motion.span
				className="absolute rounded-full bg-text"
				style={{ left: line - GRIP_W / 2, width: GRIP_W }}
				initial={{ height: 0, top: mid, opacity: 0 }}
				animate={{ height: length, top: mid - length / 2, opacity: live ? 0.85 : 0.34 }}
				exit={{ height: 0, top: mid, opacity: 0 }}
				transition={move}
			/>
			{/* the head: the participant itself. It is the one thing here that never
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
						left: line + dir * (HEAD / 2 + CHIP_GAP),
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
								/* the ink tells the truth on the instant and the word is allowed to
								   linger: five of the twelve calls here are under 320ms, and a word
								   that is gone that fast was never for reading */
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
