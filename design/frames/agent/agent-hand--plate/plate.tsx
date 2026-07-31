import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * The plate: the presence and the word are the same object.
 *
 * The parent direction drew a head, a grip and a chip. The head said *somebody is
 * here*, the grip's length said *what kind of hold*, the grip's ink said *a call
 * is open*, and the chip beside it said *which call* — four channels across two
 * objects, and its own author's sharpest complaint was that the second object is a
 * receipt the rail already prints. This keeps the grip and folds the other three
 * into one thing: **the head opens into a plate to hold a word, and closes when
 * there is no word to hold.** So being open *is* the ink channel, and the word is
 * inside the presence rather than next to it. Nothing on this canvas is a label.
 *
 * The plate reads up the wall rather than out from it, and that is arithmetic
 * rather than style. A word set across the wall needs 64px of clear field, and the
 * gutter between two neighbouring frames at this zoom is 44. A word set along the
 * wall needs 16 of width and 36 of the frame's own 329px height, so it never
 * competes for the gutter at all and never has to be taken away.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the word in the plate, in the machine's own lowercase, or null when the plate is shut */
	readonly verb: string | null;
	/** writes landed so far in a run, so each one can flick the bar as it lands */
	readonly writes: number;
	/** the `shot` call is open: the bar leaves the wall and runs around the frame */
	readonly picturing: boolean;
}

/**
 * Which verbs change the frame, and which only take it in.
 *
 * Inherited unchanged, because it is the property the parent won on: three
 * postures absorb every verb that can ever name a frame. This capture plays five
 * of them — `write`, `shot`, `look`, `logs`, `edit` — and `read`, which it happens
 * not to contain, lands in the posture it already belongs to with nothing new
 * drawn.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * How long a word keeps the plate after its call has landed, in ms.
 *
 * `agent-hand--label` picked 600 against this capture and it survives being
 * re-measured from the moment each call names its frame, which is the only clock
 * this object can run on. On that clock the twelve calls run 68ms to 5.3s, five are
 * under 320ms, and the shortest silence between two of them is 819ms — so the floor
 * has 219ms of headroom and is never cut short here. In some other turn it will be,
 * and then it yields without argument: a word about a call that is over while a
 * different call is running is the one failure this cannot survive.
 *
 * 600 plus the 200ms shut is 800, so every gap in this turn does reach shut. The
 * tightest touches it for 19ms; ten of the eleven hold it for over a quarter second.
 */
export const FLOOR = 600;

/**
 * Where the agent is and what it has hold of, read off the same rows the rail is
 * reading.
 *
 * **A row is skipped until its subject has landed.** A tool block opens with an
 * empty input and the file name arrives in the argument deltas after it, so for a
 * beat the rail can honestly print `edit` with nothing after it and the canvas
 * cannot print anything at all: out here the subject is the address, and a verb
 * with no address has no wall to be welded to.
 *
 * **The turn ending clears everything, floor or no floor.** A settled rail beside a
 * frame still saying `look` is two panes contradicting each other, and the rail is
 * the one telling the truth.
 */
export function handOf(script: Script, turn: Turn, elapsed: number): Hand | null {
	if (turn.phase !== "playing") return null;
	const at = new Map(script.cues.map((cue) => [cue.name, cue.at]));
	let on: ToolRow | null = null;
	let word: string | null = null;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame === null) continue;
		if (!turn.at(row.cue)) continue;
		// the address has not arrived yet, so neither has the row, as far as out here
		// is concerned
		if (row.subjectCue !== null && !turn.at(row.subjectCue)) continue;
		on = row;
		if (row.doneCue === null || !turn.at(row.doneCue)) {
			word = row.verb;
			continue;
		}
		// the floor, spent after the call rather than during it: the one moment the
		// plate is not instantaneously true, bounded at 600ms
		const ended = at.get(row.doneCue) ?? null;
		word = ended !== null && elapsed < ended + FLOOR ? row.verb : null;
	}
	if (on === null || on.frame === null) return null;
	const open = on.doneCue === null || !turn.at(on.doneCue);
	return {
		frame: on.frame,
		hold: HOLD[on.verb] ?? "whole",
		verb: word,
		writes: on.runs ? on.children.filter((child) => turn.at(child.cue)).length : 0,
		picturing: open && on.verb === "shot",
	};
}

/* ---------- the field's geometry, copied ----------
 * `spool-play-field.tsx` has no slot for another layer and shared/ is not this
 * frame's to change, so the object is a sibling of the field drawn in the same
 * coordinates. That holds exactly as long as the camera is still, which is why this
 * frame never centres on anything. */

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const FW = 152;
const FH = 329;
/** the frame's own corner, so the trace can be struck concentric with it */
const RADIUS = 12;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the object ---------- */

/** the bar's centre line, outside the wall — the parent's stand-off, unchanged */
const OUT = 6;
const BAR_W = 3;
const PART = 76;
/** the plate shut: the parent's head, built the way the plate is built */
const REST = 9;
/**
 * The plate open.
 *
 * 38 tall because the longest word that can ever reach a frame is five characters
 * and `write` measures 30.9px, leaving 3.5px at each end; 16 wide because a 12px
 * line box wants 2px of air on each side. Neither number is chosen per call:
 * **the plate never resizes.** The set of verbs that can carry a frame is closed at
 * `label()` in `claude-turn.ts` — `write`, `edit`, `read`, `look`, and
 * `shot`/`logs`/`url` off `TAKES_FRAME` — every other verb projects `frame: null`
 * and never reaches a wall, so seven words is the whole vocabulary and `write` is
 * the long one.
 *
 * The 30.9 is measured in this frame's own boot rather than inherited. Fragment
 * Mono advances **6.18px at 10px and 7.42px at 12px**, where both `--presence` and
 * `--label` state 7.06 at 12px and compute their chip and label widths off it. It
 * changed nothing they concluded and it is 5% out.
 */
const PLATE_W = 16;
const PLATE_H = 38;
/** one write, drawn: the bar flicks longer and settles */
const TICK_RISE = 22;
const TICK_MS = 150;
/** the plate opening or shutting; the word cuts, the shape moves */
const SHUT_MS = 0.2;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * What the object claims of the gutter it docks in.
 *
 * The plate reaches `OUT + PLATE_W / 2` out from the wall, which is 14, and 20
 * leaves it 6px of air against whatever is next door. The parent's chip wanted 64
 * and the gutter here is 44, which is why it had to be droppable; this does not,
 * which is why it is not.
 */
const NEED = 20;

export type Side = "left" | "right";

/**
 * Which wall.
 *
 * The left one, unless the frame on the left is close enough to be crowded, in
 * which case the right. `agent-walk-ambient`'s rule that the side is a property of
 * the frame's situation survives, but at a threshold three times lower than the
 * parent's, so in this arrangement it never fires: three 152px frames at 114, 310
 * and 506 in a 772px viewport leave 114 of open field at each end and 44 between
 * neighbours, and 44 is more than twice what the object asks for. A frame with a
 * neighbour inside 20px on both sides keeps the left wall and overlaps, because at
 * that point there is nothing left to shed and the frames are the crowded thing.
 */
export function sideOf(index: number, count: number): Side {
	const here = COLS[index] ?? 0;
	const before = COLS[index - 1];
	const after = COLS[index + 1];
	const left = index === 0 || before === undefined ? here : here - (before + FW);
	const right = index === count - 1 || after === undefined ? VIEW_W - (here + FW) : after - (here + FW);
	return left >= NEED || right < NEED ? "left" : "right";
}

/**
 * The frame's outline, in two halves that leave the plate's own top and bottom.
 *
 * A `shot` is the one call whose subject is the whole frame, so it is the one state
 * where the object stops holding a wall: the bar's two ends leave the plate, run up
 * and down, around the corners, and meet again on the far wall. It is the same ink
 * spread over a path four times longer than the wall, which is why it is struck at
 * 1.5px and not at 3 — a 3px box around a frame is a border, and this is not one.
 *
 * The two halves are different lengths, because the plate is not centred on the
 * wall, so each carries its own dash.
 */
function halves(
	box: { x: number; y: number; w: number; h: number },
	side: Side,
	top: number,
	bottom: number,
): readonly { readonly d: string; readonly len: number }[] {
	const dir = side === "left" ? 1 : -1;
	const r = RADIUS + OUT;
	const x0 = side === "left" ? box.x - OUT : box.x + box.w + OUT;
	const x1 = side === "left" ? box.x + box.w + OUT : box.x - OUT;
	const y0 = box.y - OUT;
	const y1 = box.y + box.h + OUT;
	const mid = (y0 + y1) / 2;
	const up = dir === 1 ? 1 : 0;
	const across = Math.PI * r + (Math.abs(x1 - x0) - 2 * r);
	return [
		{
			d: `M ${x0} ${top} V ${y0 + r} A ${r} ${r} 0 0 ${up} ${x0 + dir * r} ${y0} H ${x1 - dir * r} A ${r} ${r} 0 0 ${up} ${x1} ${y0 + r} V ${mid}`,
			len: top - y0 - r + (mid - y0 - r) + across,
		},
		{
			d: `M ${x0} ${bottom} V ${y1 - r} A ${r} ${r} 0 0 ${1 - up} ${x0 + dir * r} ${y1} H ${x1 - dir * r} A ${r} ${r} 0 0 ${1 - up} ${x1} ${y1 - r} V ${mid}`,
			len: y1 - r - bottom + (y1 - r - mid) + across,
		},
	];
}

/**
 * The layer, over the field.
 *
 * The whole answer to travel is the `key`. An object keyed on the frame it is at
 * cannot move between two frames: it lets go here and takes hold there, and the two
 * halves run at once because that is what the wire says — one call ends and the next
 * begins. Nothing crosses the canvas, because there is no crossing to draw.
 *
 * A frame that is not on this page has no wall, so nothing is drawn here at all and
 * the Pages rail carries it instead. That is `agent-play--jump-name`'s own rule:
 * the answer is drawn wherever it can be drawn.
 */
export function PlateLayer({ hand, base }: { hand: Hand | null; base: readonly string[] }) {
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
	const side = sideOf(index, count);
	const dir = side === "left" ? -1 : 1;
	const line = (side === "left" ? box.x : box.x + box.w) + dir * OUT;
	const mid = box.y + box.h / 2;
	const open = hand.verb !== null;
	/*
	 * The plate grows up out of its node rather than around it, and the reason is a
	 * collision nobody had hit before: `spool-play-field.tsx` lands an incoming walk
	 * arrowhead on the frame's wall at `ROW_1 + 186`, which is 21.5px below the
	 * frame's own centre. The parent's 18px chip cleared that by 8px and a 38px plate
	 * centred on the same point does not — the arrow tip pokes into its bottom corner.
	 * Anchoring the plate's foot at the node keeps the participant welded exactly
	 * where it always was, clears the arrow by 12.5px, and makes opening a single
	 * direction of travel instead of a spread.
	 */
	const foot = mid + REST / 2;
	const trace = halves(box, side, foot - PLATE_H, foot);

	// one write, drawn where the writing is: the bar flicks longer and settles.
	// Nothing here loops — every movement on this canvas is a call starting, a call
	// landing, or one of the six writes inside a run. It is also the only place the
	// canvas counts, now that the plate does not
	const [bump, setBump] = useState(false);
	useEffect(() => {
		if (hand.writes === 0) return;
		setBump(true);
		const timer = window.setTimeout(() => setBump(false), TICK_MS);
		return () => window.clearTimeout(timer);
	}, [hand.writes]);

	// the last word stays rendered while the plate shuts on it, so the shut is one
	// object closing rather than a word vanishing and a box following it
	const said = useRef("");
	if (hand.verb !== null) said.current = hand.verb;

	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;
	const bar = held === 0 || still || !bump ? held : held + TICK_RISE;
	const w = open ? PLATE_W : REST;
	const h = open ? PLATE_H : REST;
	const move = { duration: still ? 0 : 0.22, ease: ARRIVE };

	return (
		<>
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
				fill="none"
				aria-hidden="true"
			>
				{trace.map((half) => (
					<motion.path
						key={half.d}
						d={half.d}
						stroke="var(--color-text)"
						strokeOpacity={0.6}
						strokeWidth={1.5}
						strokeLinecap="round"
						strokeDasharray={half.len}
						initial={{ strokeDashoffset: half.len }}
						animate={{ strokeDashoffset: hand.picturing ? 0 : half.len }}
						exit={{ strokeDashoffset: half.len }}
						transition={{ duration: still ? 0 : hand.picturing ? 0.3 : 0.24, ease: ARRIVE }}
					/>
				))}
			</svg>
			{/* the bar: length is what the agent has hold of, and it survives the gaps,
			    because pausing is not letting go. It carries no second meaning now —
			    whether a call is open is the plate's job, and one channel per object is
			    the whole trade this variation makes */}
			<motion.span
				className="absolute rounded-full bg-text"
				style={{ left: line - BAR_W / 2, width: BAR_W }}
				initial={{ height: 0, top: mid, opacity: 0 }}
				animate={{ height: bar, top: mid - bar / 2, opacity: 0.5 }}
				exit={{ height: 0, top: mid, opacity: 0 }}
				transition={move}
			/>
			{/* the plate: the participant, and the word it is holding. Shut it is the
			    parent's head and it means the agent is here with nothing open; open it
			    is the same box grown along the bar with one word standing in it */}
			<motion.span
				className="absolute overflow-hidden rounded-[2px] border border-muted bg-canvas"
				initial={{ width: REST, height: REST, left: line - REST / 2, top: foot - REST, opacity: 0 }}
				animate={{ width: w, height: h, left: line - w / 2, top: foot - h, opacity: 1 }}
				exit={{ width: REST, height: REST, left: line - REST / 2, top: foot - REST, opacity: 0 }}
				transition={{ duration: still ? 0 : SHUT_MS, ease: ARRIVE }}
			>
				{/*
				 * The word runs bottom to top, which is what lets it live in a 16px column.
				 * It cuts when one verb replaces another, because at 10px a crossfade is two
				 * words on top of each other and neither is readable; it fades only with the
				 * plate's own opening and shutting, where the shape is doing the reading and
				 * the letters are along for the ride.
				 */}
				<motion.span
					className="absolute whitespace-nowrap font-mono text-2xs text-text leading-3"
					style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(-90deg)" }}
					initial={{ opacity: 0 }}
					animate={{ opacity: open ? 1 : 0 }}
					transition={{ duration: still ? 0 : 0.1, ease: "linear" }}
				>
					{said.current}
				</motion.span>
			</motion.span>
		</>
	);
}
