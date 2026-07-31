import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * The presence, as `agent-hand--presence` settled it, with two changes and a
 * demotion.
 *
 * The object is unchanged: a **head** welded to the wall, which is the participant
 * and never varies while the agent is at this frame, and a **grip**, which is what
 * it has hold of. Length is the kind of hold and survives the gaps. Ink is whether a
 * call is open. No colour, because the accent belongs to the human's selection.
 *
 * **The flick is gone.** The parent flicked the grip 22px longer for 150ms on every
 * write, because the wall was the only surface that could say a write had landed.
 * The page can say it now, and it says it where the writing is. Two objects
 * reporting one event at one instant is one of them decorating.
 *
 * **The `shot` outline no longer closes.** The parent's ran the grip's two ends
 * around the whole box and met them on the far wall, which is a ring standing 6px
 * off a frame — the exact shape a selection is, at 1.5px and at 2px both. The ends
 * now stop 18px short of each other, so there is a 36px opening on the far side and
 * the mark cannot be a ring. The 6px stand-off is kept because the grip lives on
 * that line and the two have to be the same line; what stopped it reading as
 * selection was never the distance, it was the closure.
 *
 * **And the presence is now load-bearing for something other than itself.** It is
 * what says which frame the interior arrivals are allowed to speak for. A write to
 * `shared/tokens.css` reboots every frame on the canvas at once, and every box in
 * every one of them can move; nothing in a box diff can tell which of those was the
 * work. The wall says who, the interior says what.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** a call is open on this frame right now */
	readonly live: boolean;
	/** the `shot` call is open: the grip is off the wall and around the frame */
	readonly picturing: boolean;
}

/**
 * Which verbs change the frame. Three postures absorb the capture's five verbs, and
 * `read`, which this window happens not to contain, lands in the one it already
 * belongs to with nothing new drawn.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is, read off the same rows the rail is reading.
 *
 * When no call is open the hand falls back to the last row that had one: the agent
 * is between calls and has not gone anywhere, so the object keeps its posture and
 * drops its ink. That is 57% of this turn.
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
		live: open !== null,
		picturing: open !== null && open.verb === "shot",
	};
}

/**
 * How many writes have landed on the frame's source, which is what makes it redraw.
 *
 * The run's children are the calls it collapsed, so this is the same arithmetic
 * `railEntries` does to print `×6`. The `frame.json` write is not counted, and that
 * is not a special case for it: it is a `write` rather than an `edit`, and the page
 * it does not touch has no revision to advance.
 */
export function writesOn(script: Script, turn: Turn, frame: string): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return count;
}

/**
 * How far behind the source the canvas's own picture of the frame is.
 *
 * At canvas zoom a frame is not a document. `cover.ts:8` sets `LIVE_MIN_CSS_PX` to
 * 400 and `lifecycle.ts:245` refuses to mount anything narrower — *"if (frame.w *
 * camera.k < LIVE_MIN_CSS_PX) return false"* — so a 390px frame at 39% draws 152 and
 * `frame-shell.tsx:11` describes what is there instead: *"picture: the still (or a
 * quiet placeholder), no iframe in the DOM"*. Writes do not reach it. Photographs do.
 *
 * A photograph costs `CAPTURE_AFTER_READY_MS` (1500) of quiet plus the errand's own
 * 660 to 1437ms, and any write inside that window bumps the nonce and restarts it.
 * The largest gap between two writes inside a run here is 1,605ms on the replay
 * clock, and the lag is 2,550, so **no still can finish inside a run**. That is the
 * whole derivation of the cadence: thirteen writes, three photographs, one per run.
 */
export const STILL_LAG = 2550;

/**
 * The revision the canvas is showing, which is not the revision on disk.
 *
 * The lag is laid on the replay clock uncompressed, unlike everything the capture
 * measured. That is deliberate and it is the one number here that is not the
 * recording's: spool's latency is the watching person's own wall clock and has no
 * reason to divide by 2.4. It does mean the replay overstates it — 2.55s is 2.1% of
 * the real 121-second turn and 6.8% of the 37.7-second replay — and overstating is
 * the honest direction, because the person in front of the real thing waits the real
 * 2.55 seconds.
 */
export function stillOn(
	script: Script,
	turn: Turn,
	cueAt: ReadonlyMap<string, number>,
	elapsed: number,
	frame: string,
	lag: number = STILL_LAG,
): number {
	let shown = 0;
	let through = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		let landed = 0;
		for (const child of row.children) if (turn.at(child.cue)) landed += 1;
		through += landed;
		const last = row.children.at(-1);
		if (last === undefined || landed < row.children.length) continue;
		if (elapsed - (cueAt.get(last.cue) ?? 0) >= lag) shown = through;
	}
	return shown;
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
/** what the outline leaves open on the far wall, so it is never a closed ring */
const OPEN = 18;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

export type Side = "left" | "right";

/**
 * Which wall.
 *
 * `agent-hand--plate` found that the parent flattered itself by docking on a 114px
 * side. `home` sits in the middle column here, where both gutters are 44px: three
 * 152px frames at 114, 310 and 506 in a 772px viewport. So there is room for the
 * head and the grip and none for a word, and this direction has to work without the
 * chip — which is the honest test of whether the page can carry the verb.
 */
export function dockOf(index: number, count: number): Side {
	const here = COLS[index] ?? 0;
	const before = COLS[index - 1];
	const after = COLS[index + 1];
	const left = index === 0 || before === undefined ? here : here - (before + FW);
	const right = index === count - 1 || after === undefined ? VIEW_W - (here + FW) : after - (here + FW);
	return left >= right ? "left" : "right";
}

/**
 * The frame's outline, in two halves that both start where the grip is and stop
 * short of meeting.
 *
 * A `shot` is the one call whose subject is the whole frame, so it is the one state
 * where the object lets go of a wall: the grip's ends run up and down from the head,
 * around the corners, and stop `OPEN` short of the far wall's midpoint. It is the
 * same ink spread over a path four times longer than the wall, struck at 1.5px, with
 * a gap in it so that no reading of it is a selection.
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
			`M ${x0} ${mid} V ${y0 + r} A ${r} ${r} 0 0 ${up} ${x0 + dir * r} ${y0} H ${x1 - dir * r} A ${r} ${r} 0 0 ${up} ${x1} ${y0 + r} V ${mid - OPEN}`,
			`M ${x0} ${mid} V ${y1 - r} A ${r} ${r} 0 0 ${1 - up} ${x0 + dir * r} ${y1} H ${x1 - dir * r} A ${r} ${r} 0 0 ${1 - up} ${x1} ${y1 - r} V ${mid + OPEN}`,
		],
		len: 2 * (mid - y0 - r) - OPEN + Math.PI * r + (Math.abs(x1 - x0) - 2 * r),
	};
}

/**
 * The layer, over the field.
 *
 * The whole answer to travel is the `key`. A presence keyed on the frame it is at
 * cannot move between two frames: it lets go here and takes hold there, and the two
 * halves run at once because that is what the wire says. Nothing crosses the canvas,
 * because there is no crossing to draw.
 */
export function HandLayer({ hand, base }: { hand: Hand | null; base: readonly string[] }) {
	const index = hand === null ? -1 : base.indexOf(hand.frame);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || index === -1 ? null : <Held key={hand.frame} hand={hand} index={index} count={base.length} />}
			</AnimatePresence>
		</div>
	);
}

function Held({ hand, index, count }: { hand: Hand; index: number; count: number }) {
	const still = useReducedMotion() === true;
	const box = { x: COLS[index] ?? 0, y: ROW_1, w: FW, h: FH };
	const side = dockOf(index, count);
	const dir = side === "left" ? -1 : 1;
	const wall = side === "left" ? box.x : box.x + box.w;
	const line = wall + dir * OUT;
	const mid = box.y + box.h / 2;
	const trace = halves(box, side);

	const length = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;
	const move = { duration: still ? 0 : 0.22, ease: ARRIVE };

	return (
		<>
			<svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" fill="none" aria-hidden="true">
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
			{/* the head: the participant itself, and the one thing that never changes,
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
