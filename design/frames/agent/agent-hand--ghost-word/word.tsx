import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * The presence of `agent-hand--ghost`, with the word put back.
 *
 * Head, grip and the four `shot` corners are the parent's and are not re-argued: a
 * seven pixel square welded to the wall says the agent is at this frame, the grip's
 * length says what kind of hold it has, the grip's ink says whether a call is open,
 * and a `shot` takes the ink off the wall to four corners that never join up.
 *
 * What is added is one string, set along the wall, and one word of code: the parent
 * wrote `open === null ? null : open.verb` and this writes `on.verb`. That is the
 * whole diff in the state, and everything else in this file is the geometry that lets
 * it fit.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/**
	 * The word on the wall, in the machine's own lowercase. Never absent: the presence
	 * is derived from a row and every row has a verb, so a wall with a head on it always
	 * has something true to say.
	 */
	readonly word: string;
	/** writes landed in the run, so the count climbs the way the rail's count climbs */
	readonly count: number;
	/** a call is open on this frame right now */
	readonly live: boolean;
	/** the `shot` call is open: the ink is off the wall and at the corners */
	readonly picturing: boolean;
}

/** which verbs change the frame; everything else is the agent taking it in */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is and what the wall says, read off the same rows the rail is
 * reading.
 *
 * **The word is the last thing the agent did to this frame, not the thing it is doing
 * now.** The parent dropped the verb the instant a call landed and drew nothing until
 * the next one opened. Measured against this capture that is 15.15 seconds of blank in
 * sixteen separate holes, the shortest 6ms and the longest 2.24s — a word that blinks
 * out sixteen times is a flicker rather than a report. Holding it costs nothing that
 * is not already carried: the grip's ink is the live channel and says outright that
 * the call is over, and the word is set a shade back while it is a receipt. So the
 * wall reads *last: edit, six of them, finished* rather than going dark and making
 * you remember.
 *
 * **A thought is not on the wall.** 4.9s of this turn has a thinking row open and it
 * is tempting, because the rail prints `thinking` right there. It is refused for one
 * reason: everything this object draws is about one frame, and a thought has no
 * frame — `handOf` has never considered a row whose `frame` is null and this is that
 * rule, not an exception to it. The turn's own state belongs to the transcript.
 *
 * **A row is skipped until its subject has landed**, on `agent-hand--plate`'s rule. A
 * tool block opens with an empty input and the file name arrives in the argument
 * deltas after it, so for a beat the rail can honestly print `edit` with nothing after
 * it and the canvas cannot print anything at all: out here the subject is the address,
 * and a verb with no address has no wall to be welded to. Measured, that beat is 157ms
 * at the first row and the presence appears at 274ms rather than at 117.
 */
export function handOf(script: Script, turn: Turn): Hand | null {
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
	};
}

/* ---------- the field's geometry, copied ----------
 * `spool-play-field.tsx` has no slot for another layer and shared/ is not this
 * frame's to change, so the presence is a sibling of the field drawn in the same
 * coordinates. That holds exactly as long as the camera is still, which is why this
 * frame never centres on anything. */

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const FW = 152;
const FH = 329;
/** the frame's own corner, so the corners can be struck concentric with it */
const RADIUS = 12;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the object ---------- */

/** how far outside the wall the object sits: the grip's centre line and the corners share it */
const OUT = 6;
const GRIP_W = 3;
const PART = 76;
const HEAD = 7;
/** one write, drawn: the segment flicks longer and settles */
const TICK_RISE = 22;
const TICK_MS = 150;
/** how far past the arc each corner arm runs */
const ARM = 11;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/* ---------- the word ---------- */

/** clear air between the grip's edge and the word's line box */
const WORD_GAP = 3;
/**
 * The line box of one 10px mono line, and the only width the word ever has.
 *
 * Measured at 12.00px in this frame's own boot, which is `leading-3` exactly. It does
 * not move with the string: turned on its side, a longer word is taller.
 */
const WORD_LINE = 12;
/** clear air between the head's edge and the first character */
const WORD_LIFT = 5;
/** a digit rolling: how far along its own reading direction it travels */
const ROLL = 5;
/** the word is a receipt rather than a live claim, and is set back while it is one */
const HELD_INK = 0.55;

/**
 * How much gutter the whole object claims.
 *
 * Wall to the far edge of the word is `OUT + GRIP_W / 2 + WORD_GAP + WORD_LINE`, which
 * is 22.5, and 30 leaves 7.5px of clear field either side. `agent-hand--presence`
 * needed 64 for the same word set across the wall and so had to drop it in the middle
 * column, where the gutter is 44. Measured here, `edit ×6` is 43.27px of Fragment Mono
 * at 10px and a chip's own padding takes it to 55.3, which still does not fit. Turned a
 * quarter turn the same string claims 12.
 */
const NEED = 30;

export type Side = "left" | "right";

/**
 * Which wall.
 *
 * Three 152px frames at 114, 310 and 506 in a 772px viewport leave 114 of open field at
 * each end of the row and 44 between neighbours, so a frame in the middle ties. **The
 * tie goes right**, because `spool-play-field.tsx` lands an incoming walk's arrowhead
 * on the left wall at `ROW_1 + 186` and the parent's left-first rule parks the whole
 * presence under it.
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
 * the other. One path per corner and one length for all four, because they are the same
 * shape rotated and the stroke has to arrive on all four at once. The parent's fix for
 * the selection ring, carried over whole: a corner is not a ring at any weight, because
 * it is not closed.
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
 * The layer, over the field. The whole answer to travel is the `key`: a presence keyed
 * on the frame it is at cannot move between two frames, so it lets go here and takes
 * hold there, both at once, which is what the wire says.
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
	const trace = corners(box);

	// one write, drawn where the writing is: the segment flicks longer and settles
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

	/*
	 * The word runs up the wall from the head, so its length is height and the count is
	 * free.
	 *
	 * Up rather than down, on either wall, and that is the walks rather than taste.
	 * `spool-play-field.tsx` lands an incoming arrowhead on a frame's left wall at
	 * `ROW_1 + 186` and starts an outgoing edge on its right wall at `ROW_1 + 158`,
	 * which are 21.5px below the frame's centre and 6.5px above it. Above the higher of
	 * the two both walls are clear; below the lower one neither is. So the word grows
	 * away from the walks and the head stays welded exactly where the parent put it.
	 *
	 * The residual, drawn rather than hidden: on the right wall that departing edge
	 * leaves at y 204 and passes over the head's top edge at y 207, clearing it by 0.1px
	 * at the worst point in the word's own column. It is a graze rather than a
	 * collision, and it is the mirror of the defect the parent named on the left.
	 */
	const wordLeft = dir === 1 ? line + GRIP_W / 2 + WORD_GAP : line - GRIP_W / 2 - WORD_GAP - WORD_LINE;
	const foot = mid - HEAD / 2 - WORD_LIFT;

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
						transition={{ duration: still ? 0 : hand.picturing ? 0.26 : 0.2, ease: ARRIVE }}
					/>
				))}
			</svg>
			{/* the grip: length is what the agent has hold of, ink is whether it is doing
			    anything to it. Both ends grow from the head, so a posture change is the
			    same object opening rather than a second one arriving */}
			<motion.span
				className="absolute rounded-full bg-text"
				style={{ left: line - GRIP_W / 2, width: GRIP_W }}
				initial={{ height: 0, top: mid, opacity: 0 }}
				animate={{ height: length, top: mid - length / 2, opacity: hand.live ? 0.85 : 0.34 }}
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
			{dock.words ? <Word hand={hand} left={wordLeft} foot={foot} still={still} /> : null}
		</>
	);
}

/**
 * The word, and the count climbing inside it.
 *
 * One line box rotated a quarter turn about its own top-left corner and anchored at the
 * head: after the rotation the text runs up the wall from the anchor and the line box
 * lies across it, so the string's length is height and the twelve pixels it claims of
 * the gutter never change however long it gets. That is `agent-hand--plate`'s find, and
 * what that frame did not carry was the count, on the grounds that `edit ×6` will not
 * fit a fixed plate. True of a plate and not of a word: there is no plate here, so
 * nothing has to be sized for the longest string it will ever hold.
 *
 * **The verb cuts and the count rolls.** One verb replacing another is two different
 * facts, and two words crossfading at 10px are two words on top of each other, so the
 * text is swapped in one commit under a stable key. A count replacing itself is the
 * same fact one larger, so the old digit leaves along the reading direction and the
 * new one arrives behind it — 160ms against the 573ms shortest gap between two writes
 * in this capture, so two digits are never in the air at once. Nothing here loops.
 */
function Word({ hand, left, foot, still }: { hand: Hand; left: number; foot: number; still: boolean }) {
	return (
		<div className="absolute" style={{ left, top: foot, width: WORD_LINE, height: 0 }}>
			<motion.span
				className="absolute block whitespace-nowrap font-mono text-2xs text-text leading-3"
				style={{ left: 0, top: 0, transformOrigin: "0 0", transform: "rotate(-90deg)" }}
				initial={{ opacity: 0 }}
				animate={{ opacity: hand.live ? 1 : HELD_INK }}
				exit={{ opacity: 0 }}
				transition={{ duration: still ? 0 : 0.22, ease: ARRIVE }}
			>
				{hand.word}
				{hand.count > 1 ? (
					<>
						{" ×"}
						<span className="relative inline-block">
							{/* an in-flow copy holds the box and the baseline, so the rolling digits
							    can be absolute and the string never reflows under them */}
							<span className="invisible">{hand.count}</span>
							<AnimatePresence initial={false}>
								<motion.span
									key={hand.count}
									className="absolute inset-0"
									initial={{ opacity: 0, x: -ROLL }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: ROLL }}
									transition={{ duration: still ? 0 : 0.16, ease: ARRIVE }}
								>
									{hand.count}
								</motion.span>
							</AnimatePresence>
						</span>
					</>
				) : null}
			</motion.span>
		</div>
	);
}
