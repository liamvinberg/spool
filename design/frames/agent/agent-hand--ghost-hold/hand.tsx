import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * The presence, carried from `agent-hand--ghost` with the dock tie-break settled.
 *
 * A **head** — a seven pixel square welded to the wall — says the agent is at this
 * frame, and never changes for as long as it is. A **grip** says what it has hold
 * of: the wall's whole height while it is taking the frame in, a short segment
 * while it is changing it. Length is the kind of hold and survives the gaps,
 * because pausing is not letting go; ink is whether a call is open right now.
 *
 * **What changed is the `shot` posture.** The parent ran the grip around the whole
 * box at 6px of stand-off, and a closed rectangle outside a frame is a selection
 * ring at 1.5px and at 2px alike — spool's own `Slot` draws exactly that shape at
 * `inset: -1` for a selected frame, so the mark was borrowing chrome that already
 * means something else, and holding it for the 670 to 750ms a `spool shot` takes is
 * long enough to read it as one. It is four corners now instead. A corner is not a
 * ring at any weight because it is not closed, and the corners of a viewfinder being
 * the corners of the thing already on screen is a relationship that needs no legend
 * — `agent-hand--inside` found that and it survives the frame it was found in. The
 * ink still leaves the wall and still runs around the box; it just never joins up.
 *
 * **The tie-break goes right, which is the one line changed here.** Three 152px
 * frames at 114, 310 and 506 leave both of `home`'s gutters at exactly 44px, so
 * `left >= right` was picking the left wall on nothing at all — and the left wall is
 * where an incoming walk lands its arrowhead, at `ROW_1 + 186`, 21.5px under the
 * head and straight through a grip of any length. `agent-hand--land` found it and
 * fixed it to `left > right`; this copy carries the fix rather than the defect.
 *
 * Three postures, five verbs, no travel, no accent, nothing spinning. All of that is
 * the parent's and none of it is re-argued here.
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
	/** the `shot` call is open: the ink is off the wall and at the corners */
	readonly picturing: boolean;
}

/** which verbs change the frame; everything else is the agent taking it in */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is, read off the same rows the rail is reading. When no call is
 * open the hand falls back to the last row that had one: that is the dead air, and
 * the object keeps its posture and drops its word.
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
const CHIP_H = 18;
const CHIP_GAP = 6;
/** one write, drawn: the segment flicks longer and settles */
const TICK_RISE = 22;
const TICK_MS = 150;
/** how far past the arc each corner arm runs */
const ARM = 11;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/** what a chip needs to be worth docking: `edit ×6` is 54px at 10px mono, plus its stand-off */
const NEED = 64;

export type Side = "left" | "right";

/**
 * Which wall, and whether there is room for words.
 *
 * Three 152px frames at 114, 310 and 506 in a 772px viewport leave 114 of open field
 * at each end of the row and 44 between neighbours. So a frame at either end can hold
 * a word and one in the middle cannot, which is the same law the covers and the walk
 * tags obey: below the size where words are worth their ink, the words go and the
 * stub stays. `home` is in the middle here, so this frame never draws one.
 *
 * On a tie the object takes the wall the outgoing walk leaves from rather than the
 * one the incoming walk arrives at, which is `left > right` and not `left >= right`.
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
 * The four corners a `shot` puts the ink at, each drawn from one arm around the arc
 * to the other. One path per corner and one length for all four, because they are
 * the same shape rotated and the stroke has to arrive on all four at once.
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
 * The layer, over the field. The whole answer to travel is the `key`: a presence
 * keyed on the frame it is at cannot move between two frames, so it lets go here and
 * takes hold there, both at once, which is what the wire says.
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
	const live = hand.verb !== null;

	// one write, drawn where the writing is: the segment flicks longer and settles.
	// It is the only thing on the canvas that fires on the `frame.json` write, which
	// changed the rectangle and left the design alone — so the posture says a write
	// landed and the ghost says whether it changed anything, and they disagree once
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
						transition={{ duration: still ? 0 : hand.picturing ? 0.26 : 0.2, ease: ARRIVE }}
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
