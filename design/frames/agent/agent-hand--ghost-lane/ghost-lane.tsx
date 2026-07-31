import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { HOLD_MS, LEAVE, LEAVE_MS } from "./ghost";
import { type Land, layoutAt, NAT_H, NAT_W } from "./kaffe-home-lane";

/**
 * The presence, and the backlog it is carrying.
 *
 * `agent-hand--presence` is the base and both of its parts are unchanged. The **head**
 * is the participant, a seven pixel square welded to the frame's wall that arrives
 * when the agent starts on this frame, never changes while it is there, and goes when
 * it moves on. The **grip** is what it has hold of: the wall's whole height while the
 * agent is taking the frame in, a short segment while it is changing it, nothing at
 * all for the beat it is photographing it, when the ink leaves the wall for
 * `agent-hand--ghost`'s four corners. Length is the kind of hold and survives the
 * gaps; ink is whether a call is open right now.
 *
 * What is added is one **lane** outboard of the presence, and what stands in it is not
 * a trace. `agent-hand--accrue` put a mark in the margin for every write and decayed it
 * over six seconds, and its own report named the constant as the direction's weakness:
 * the legal window for it was `[4.84s, 6.14s]`, 1.3 seconds wide, and it was a
 * measurement of one capture rather than a rule.
 *
 * **Here a mark stands until its own photograph lands, and then it goes.** So the lane
 * is exactly the writes the picture on screen has not shown yet, which is a real
 * quantity with a real end, and there is no constant in it at all. The mark's life is
 * whatever the errand's lag happens to be: 2,512ms at the shortest and 7,347ms at the
 * longest across this turn, both of them measured rather than chosen.
 *
 * **Deleting the decay also removes a thing this family bans.** `--accrue`'s marks
 * never loop, but with five of them going out on overlapping six-second ramps the wall
 * is in continuous motion for most of a run, and none of that motion is caused by an
 * event. The rule here is the parent's own: everything that moves is a call opening, a
 * call landing, a write flicking the grip, or the picture catching up. Between those
 * the lane holds still.
 *
 * **Two writes, one mark.** The lane reports which blocks the picture is behind on,
 * and that is a set, so a block written twice adds nothing to it. The grip still flicks
 * on both, which is the honest split: **every write moves the grip, only a new block
 * moves the lane.** In this turn that disagreement happens three times, and once more
 * at 117ms where the grip flicks for the `frame.json` write that neither the lane nor
 * the ghost has anything to say about.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** writes landed so far in a run, so the grip ticks the way the row counts */
	readonly count: number;
	/** the `shot` call is open: the ink is off the wall and at the corners */
	readonly picturing: boolean;
}

/** which verbs change the frame; everything else is the agent taking it in */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is, read off the same rows the rail is reading. When no call is open
 * the hand falls back to the last row that had one: that is the dead air, and the
 * object keeps its posture and drops its word.
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

/**
 * The backlog: the writes that have landed on disk and are not in the picture yet.
 *
 * It is a slice, and that is the whole implementation. `written` is how many writes the
 * file has taken and `shown` is how many the newest photograph carries, so everything
 * between the two is work the canvas is behind on. When the picture catches up the
 * slice empties by itself, and there is nothing to expire, sweep or time out.
 *
 * The result is a set of places rather than a list of writes. Two writes into one block
 * are one thing the picture is behind on, and how many times is what the rail's own
 * count is for.
 */
export function backlogOf(lands: readonly Land[], shown: number, written: number): readonly Land[] {
	const seen: Land[] = [];
	for (const land of lands.slice(Math.max(0, shown), Math.max(0, written))) {
		if (!seen.includes(land)) seen.push(land);
	}
	return seen;
}

/* ---------- the field's geometry, copied ----------
 * `spool-play-field.tsx` has no slot for another layer and shared/ is not this frame's
 * to change, so both objects are siblings of the field drawn in the same coordinates.
 * That holds exactly as long as the camera is still, which is why this frame never
 * centres on anything. */

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const FW = 152;
const FH = 329;
/** the frame's own corner, so the corners can be struck concentric with it */
const RADIUS = 12;
/** what a frame is authored at, so a block's box becomes a height on the wall */
const S = FW / NAT_W;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the object ---------- */

/**
 * How far outside the wall the presence sits, and it is `agent-hand--ghost`'s 6 rather
 * than `agent-hand--accrue`'s 12.
 *
 * `--accrue` moved the presence out to 12 so the lane could take the six pixels nearest
 * the frame, and paid for it: the `shot` outline is struck from the same number, so its
 * top edge moved from y 40 to y 34 and ran through the frame's own name. It moved
 * because a closed rectangle 6px off a frame reads as a selection ring, and the extra
 * six pixels bought that back.
 *
 * The winner already fixed that a different way. Four corners are not a ring at any
 * weight because they never close, so nothing is left wanting the extra six pixels, and
 * the presence can stay welded where it belongs. **The lane goes outboard instead.**
 * Reading away from the frame it is wall, then the thing holding the wall, then what it
 * owes the picture, which is also the order of how permanent they are.
 */
const OUT = 6;
const GRIP_W = 3;
const PART = 76;
const HEAD = 7;
const CHIP_H = 18;
const CHIP_GAP = 6;
/** one write, drawn on the grip: the segment flicks longer and settles */
const TICK_RISE = 22;
const TICK_MS = 150;
/** how far past the arc each corner arm runs */
const ARM = 11;

/**
 * The lane, outboard of the presence.
 *
 * The grip's 3px is centred on 6, so it owns 4.5 to 7.5. The lane starts at 10 and is
 * 3 wide, which leaves 2.5px of clear wall between two objects that must never read as
 * one. The whole assembly is 13px of a 44px gutter.
 */
const LANE = 10;
const MARK_W = 3;

/**
 * What a mark is worth, and the one thing its strength now says.
 *
 * `--accrue` spent strength on age, because strength was the only clock it had. There
 * is no clock here, so strength is free, and it goes to the thing that actually varies:
 * **how well the mark knows where it is.** A write whose line carries an intrinsic
 * element resolves to a block and is drawn at 0.55. A write into a hoisted constant has
 * no element on its line, degrades to the frame's root, and is drawn across the whole
 * wall at 0.22, because a claim about everything is a weaker claim and should look like
 * one.
 *
 * 0.55 sits under the grip's live 0.85 and over its idle 0.34, which is the right order
 * twice: while a call is open the presence is the loud thing, and in the dead air
 * between calls the backlog is, because in the dead air the backlog is the only news.
 */
const MARK_INK = 0.55;
const ROOT_INK = 0.22;
/** an arrival is an event, so it is quick and it is not eased in from nothing */
const MARK_RISE = 0.12;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * What a chip needs to be worth docking: `edit ×6` is 54px at 10px mono with its
 * padding, plus the six it stands off the head. Nothing in this arrangement clears it,
 * because `home` is the middle column and both its gutters are 44, so this frame draws
 * no word anywhere. The lane takes 13 of those 44 and a word would still want 64, so
 * whatever answers that question is not answering it out of this gutter.
 */
const NEED = 64;

export type Side = "left" | "right";

/**
 * Which wall, and whether there is room for words.
 *
 * The tie goes right. Three 152px frames at 114, 310 and 506 in a 772px viewport leave
 * 114 of open field at each end and 44 between neighbours, so `home` in the middle ties,
 * and a walk arrow's head lands on a frame's **left** wall at `ROW_1 + 186`. Breaking
 * left would park the presence and the whole lane under an accent triangle. The residual
 * is real and stated: the outgoing edge leaves at the frame's vertical middle and
 * crosses both the presence and the lane on its way out.
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
 * shape rotated and the stroke has to arrive on all four at once.
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
 * The layer, over the field.
 *
 * The whole answer to travel is the `key`. A presence keyed on the frame it is at
 * cannot move between two frames: it lets go here and takes hold there, both at once,
 * which is what the wire says. The lane is keyed with it, which is the decision that a
 * backlog does not outlive the hand that is carrying it.
 */
export function HandLayer({
	hand,
	backlog,
	shown,
	base,
}: {
	hand: Hand | null;
	backlog: readonly Land[];
	shown: number;
	base: readonly string[];
}) {
	const index = hand === null ? -1 : base.indexOf(hand.frame);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || index === -1 ? null : (
					<Held key={hand.frame} hand={hand} backlog={backlog} shown={shown} index={index} count={base.length} />
				)}
			</AnimatePresence>
		</div>
	);
}

function Held({
	hand,
	backlog,
	shown,
	index,
	count,
}: {
	hand: Hand;
	backlog: readonly Land[];
	shown: number;
	index: number;
	count: number;
}) {
	const still = useReducedMotion() === true;
	const box = { x: COLS[index] ?? 0, y: ROW_1, w: FW, h: FH };
	const dock = dockOf(index, count);
	const dir = dock.side === "left" ? -1 : 1;
	const wall = dock.side === "left" ? box.x : box.x + box.w;
	const line = wall + dir * OUT;
	const mid = box.y + box.h / 2;
	const trace = corners(box);
	const live = hand.verb !== null;

	// one write, drawn where the writing is: the segment flicks longer and settles. It
	// fires on every write, including the two that land in a block the lane is already
	// carrying and the `frame.json` write that changes no design at all
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
			{/* the lane: what the picture is behind on, standing level with the picture on
			    screen. Everything in here goes out on the ghost's own two numbers, because
			    the marks clearing and the picture catching up are the same fact */}
			{laneLives(FW) || DIAGRAM ? (
				<AnimatePresence>
					{backlog.map((land) => (
						<Mark key={land} land={land} shown={shown} box={box} wall={wall} side={dock.side} still={still} />
					))}
				</AnimatePresence>
			) : null}
			{/* the grip: length is what the agent has hold of, ink is whether it is doing
			    anything to it. Both ends grow from the head, so a posture change is the same
			    object opening rather than a second one arriving */}
			<motion.span
				className="absolute rounded-full bg-text"
				style={{ left: line - GRIP_W / 2, width: GRIP_W }}
				initial={{ height: 0, top: mid, opacity: 0 }}
				animate={{ height: length, top: mid - length / 2, opacity: live ? 0.85 : 0.34 }}
				exit={{ height: 0, top: mid, opacity: 0 }}
				transition={move}
			/>
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

/**
 * How wide a frame must draw before the canvas mounts its document — `src/cover.ts:8`,
 * enforced at `lifecycle.ts:245` as `frame.w * camera.k < LIVE_MIN_CSS_PX`.
 */
const LIVE_MIN_CSS_PX = 400;

/**
 * Whether a mark can honestly claim a height at this drawn size.
 *
 * Above the threshold the frame is a live document and `data-spool-source` resolves a
 * write's line to a box. Below it there is no document to ask, and the correct degrade
 * is not a fainter lane or a guessed one, it is no lane. `agent-hand--accrue` found
 * this and it is inherited whole rather than re-argued.
 */
export function laneLives(drawn: number): boolean {
	return drawn >= LIVE_MIN_CSS_PX;
}

/**
 * The one fiction in this frame, named at the line that introduces it.
 *
 * `spool-play-field.tsx` draws every frame at 152px and the arrangement is fixed, so
 * this canvas is at 39% and `laneLives(152)` is false. The lane is drawn anyway, because
 * a frame that correctly draws nothing cannot be judged. Everything else here is true at
 * canvas zoom: the marks are drawn by the canvas outside the iframe, they never touch
 * the design, their timing is the capture's own, and the ghost is honest at every size
 * because two stored stills need no document at all.
 */
const DIAGRAM = true;

/**
 * One thing the picture is behind on.
 *
 * It stands at the block's box **in the picture on screen**, not in the file. That is
 * forced rather than chosen: the lane's whole claim is about the picture, the reader is
 * looking at the picture, and a mark standing where a block will be once the photograph
 * arrives would be pointing at a place nobody can see. It is also why a write that
 * reflows the page is the case the lane cannot narrate and the ghost can, because after
 * a reflow every block below has a stale y and the lane can only tell you about the one
 * that moved.
 *
 * A write that resolves nowhere takes the whole wall at 0.22. There is no honest option
 * to draw nothing: the picture really is behind, and a lane that stayed silent about it
 * would be under-reporting the quantity it exists to report. The fix is upstream, in
 * what the runtime stamps, not in this drawing.
 *
 * It leaves on the ghost's own two numbers, on the ghost's own curve, so the backlog
 * emptying and the picture catching up are one gesture rather than two events 6 pixels
 * apart: 140ms where both are at full, then 280ms where both are going.
 */
function Mark({
	land,
	shown,
	box,
	wall,
	side,
	still,
}: {
	land: Land;
	shown: number;
	box: { x: number; y: number; w: number; h: number };
	wall: number;
	side: Side;
	still: boolean;
}) {
	const region = land === "root" ? { top: 0, h: NAT_H } : layoutAt(shown)[land];
	const top = box.y + region.top * S;
	const height = Math.max(4, region.h * S);
	const left = side === "left" ? wall - LANE - MARK_W : wall + LANE;
	return (
		<motion.span
			className="absolute rounded-[1px] bg-text"
			style={{ top, height, left, width: MARK_W }}
			initial={{ opacity: 0 }}
			animate={{
				opacity: land === "root" ? ROOT_INK : MARK_INK,
				transition: still ? { duration: 0 } : { duration: MARK_RISE, ease: ARRIVE },
			}}
			/* the leave is the ghost's, to the millisecond and to the curve */
			exit={{
				opacity: 0,
				transition: still
					? { duration: 0 }
					: { delay: HOLD_MS / 1000, duration: LEAVE_MS / 1000, ease: LEAVE },
			}}
		/>
	);
}
