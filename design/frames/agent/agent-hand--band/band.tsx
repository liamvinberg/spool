import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import type { Span } from "./kaffe-home-band";

/**
 * The presence, with the grip given a place on the wall.
 *
 * `agent-hand--presence` drew a head welded to the wall and a grip whose length said
 * what kind of hold it was: the whole wall while the agent takes the frame in, a
 * short segment while it changes it. The segment was 76 pixels of a 329 pixel wall
 * sitting at the middle, and the middle was never argued — it is where a bar goes
 * when nobody has asked where it goes.
 *
 * So this file asks. A grip shorter than the wall is already somewhere on it, and
 * once it is somewhere it may as well be somewhere true: **the grip sits on the
 * third of the frame the write landed in**. One object says the agent is holding
 * this frame and says which part of it just moved, and the canvas has one thing
 * happening on it rather than two.
 *
 * Three channels, and they are kept apart the same way the parent kept two apart.
 * **Length is the extent of the hold** and it survives the gaps, because pausing is
 * not letting go. **Ink is whether a call is open right now.** **Position is where
 * the hold is**, which exists only when the hold is smaller than the frame, because
 * a hold on the whole thing has no inside.
 */

/* ---------- the claim, and its size ---------- */

/**
 * Thirds, and the mark is as tall as its own error.
 *
 * A band says *around here*, and the only way to stop a reader taking *around here*
 * for *exactly here* is to draw something that could not possibly mean exactly here.
 * So the wall is divided into three and the grip is one of them: 109.7 pixels of a
 * 329 pixel wall, in one of three slots, with the slots exactly tiling the wall. The
 * grip's own length is the size of the region it is claiming, so being thirty pixels
 * out is not an error the drawing can commit — thirty pixels is inside the band.
 *
 * Three because it is the coarsest division that can say the only thing a person
 * needs in order to point their eye: top, middle, bottom. Two says nothing about the
 * middle. Six is a claim this can never back up.
 *
 * It also happens to be the resolution the product could survive. The real y-range
 * would come from measuring the element the edit's line numbers land on, and every
 * way that measurement degrades makes the answer *bigger* — an edit inside a shared
 * component resolves to the nearest stamped ancestor, an edit that shifts lines
 * resolves to the wrong element or to nothing. A mark that already claims a third
 * absorbs a hundred pixels of that. A rectangle does not.
 *
 * What it cannot absorb is a batch. A frame drawn under `cover.ts`'s
 * `LIVE_MIN_CSS_PX` is a still refreshed by an errand, and an errand carries a whole
 * run of writes: all three runs in this capture touch all three thirds, so at that
 * cadence every band is the whole wall. This channel belongs to the live regime, and
 * `frame.tsx` says where that starts.
 */
export type Zone = 0 | 1 | 2;

const ZONES = 3;

/** which third the measured block's middle falls in */
export function zoneOf(span: Span): Zone {
	const middle = (span.from + span.to) / 2;
	const index = Math.floor(middle * ZONES);
	return (index < 0 ? 0 : index > ZONES - 1 ? ZONES - 1 : index) as Zone;
}

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or one third of it */
export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** the `shot` call is open: the grip is off the wall and hooked over the frame */
	readonly picturing: boolean;
}

/**
 * Which verbs have a place inside the frame, which is a shorter list than the parent's.
 *
 * `agent-hand--presence` gave `write` and `edit` the short grip, on the reading that
 * length separates changing a frame from taking one in. This direction cannot keep
 * that, and finding out why was the useful part: the capture's one `write home` is
 * `frames/home/frame.json`, which is geometry. It changes the frame and changes
 * nothing on the page, so a grip that shortened for it would be pointing at a third
 * of a design that did not move.
 *
 * So length stops being a taxonomy of verbs and becomes a plain statement of extent:
 * the grip covers what the agent has hold of. A `look` has hold of the whole frame.
 * A `shot` has hold of the whole frame. A write to the sidecar has hold of the whole
 * rectangle, because the rectangle is the thing that moved. Only an `edit` has hold
 * of a part, and `read`, which this window happens not to contain, lands on the
 * whole with nothing new drawn.
 */
const PLACED = new Set(["edit"]);

/**
 * Where the agent is, read off the same rows the rail is reading.
 *
 * When no call is open the hand falls back to the last row that had one. That is the
 * dead air, and there is a lot of it: measured from each row's `subjectCue` to its
 * result, twelve calls on `home` hold the wire for 15.9 of 37.4 seconds and leave
 * 21.6 quiet — 58%, across eleven gaps, the shortest 819ms and the longest 4.1s. The
 * object keeps its posture through all of it and drops its ink, so the band stays
 * where the last write landed and stops claiming to be busy.
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
		hold: PLACED.has(on.verb) ? "part" : "whole",
		verb: open === null ? null : open.verb,
		picturing: open !== null && open.verb === "shot",
	};
}

/** how many design writes have landed, which is the frame's revision and the flick's clock */
export function revOf(script: Script, turn: Turn, frame: string): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return count;
}

/**
 * The frame's revision at the newest picture on disk, which is the only picture
 * there is.
 *
 * A `look` is a Read of `.spool/verify/home.png`, and all four of them in this
 * capture read the same path — so the rail cannot tell one look's payload from
 * another's, and neither can the filesystem. What a thumbnail can honestly show is
 * the bytes that are there now, which is the frame as the last `shot` caught it: six
 * revisions behind the canvas at the widest, at the look 17.3 seconds in. The parent
 * drew the finished frame in every picture, which is the one thing a picture of a
 * live frame must not do.
 */
export function revAtShot(script: Script, turn: Turn, frame: string): number {
	let shot = 0;
	let landed = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame) continue;
		if (row.verb === "edit") {
			for (const child of row.children) if (turn.at(child.cue)) landed += 1;
		} else if (row.verb === "shot" && row.doneCue !== null && turn.at(row.doneCue)) {
			shot = landed;
		}
	}
	return shot;
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
/** the frame's own corner, so the hooks can turn concentric with it */
const RADIUS = 12;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/** one third of the wall, which is the grip's length and the size of its claim */
const ZONE_H = FH / ZONES;

/* ---------- the object ---------- */

/** how far outside the wall it sits: the grip, the reach and the hooks share the line */
const OUT = 6;
const GRIP_W = 3;
/** a write landing: the bar thickens for a beat and settles */
const GRIP_BUMP = 5;
const REACH_W = 1;
const HEAD = 7;
const BUMP_MS = 140;
/** how far a hook runs along the top and bottom edge once it has turned the corner */
const ARM = 14;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

export type Side = "left" | "right";

/**
 * Which wall, and why the neighbours are not the whole of it.
 *
 * `agent-hand--presence` decided the side by room: three 152px frames at 114, 310 and
 * 506 in a 772px viewport leave 114 of open field at each end and 44 between
 * neighbours, so the outer frames dock outward and a frame with neighbours on both
 * sides keeps the head and the grip and loses its chip. `home` is in the middle here,
 * which is the honest case, so there is no chip anywhere in this frame: 44 is under
 * the 64 a word needs, and the parent flattered itself by docking on a 114px side.
 *
 * The tie is 44 against 44, and the parent's arithmetic breaks it leftward. That is
 * the wrong way here, and the reason is not the neighbours: **the walls of a middle
 * frame are already occupied by the flow graph.** `spool-play-field.tsx` lands the
 * incoming walk's arrowhead at `ROW_1 + 186`, a filled triangle nine pixels tall
 * finishing one pixel short of the left wall, and starts the outgoing edge at
 * `ROW_1 + 158` on the right wall as a 1.5px hairline heading away. Both walls are
 * taken. The tie goes to the wall whose occupant a 3px bar can cross without
 * swallowing it, so the object docks right: the hairline crosses the grip over four
 * pixels of its length and passes 2.8 pixels above the head, which is a near miss
 * rather than a clearance and is the one number in this frame nobody chose. A
 * presence that docks on walls has to read the graph as well as the neighbours, and
 * that is a rule this family did not have.
 */
export function dockOf(index: number, count: number): Side {
	const here = COLS[index] ?? 0;
	const before = COLS[index - 1];
	const after = COLS[index + 1];
	const left = index === 0 || before === undefined ? here : here - (before + FW);
	const right = index === count - 1 || after === undefined ? VIEW_W - (here + FW) : after - (here + FW);
	return left > right ? "left" : "right";
}

/**
 * The two hooks a `shot` draws, each starting where the grip starts.
 *
 * A `shot` is the one call whose subject is the whole frame, so the hold runs the
 * whole wall and then keeps going: both ends turn the corner and run 14 pixels along
 * the top and the bottom edge. `--presence` ran them all the way around and back,
 * which is a box, and a box six pixels off a frame reads as a selection at every
 * width it was tried at. This one cannot: it never closes, and past the corner it
 * runs a tenth of the 152px edge it is touching. It is struck at the grip's own 3px
 * because it is the grip rather than an outline of anything. Drawn at 24 it was a
 * bracket around the frame, which is the same mistake one radius further out.
 */
function hooks(box: { x: number; y: number; w: number; h: number }, side: Side): { d: readonly string[]; len: number } {
	// the arms run back over the frame, so they turn away from the wall the grip is on
	const dir = side === "left" ? 1 : -1;
	const r = RADIUS + OUT;
	const x0 = side === "left" ? box.x - OUT : box.x + box.w + OUT;
	const y0 = box.y - OUT;
	const y1 = box.y + box.h + OUT;
	const mid = (y0 + y1) / 2;
	const up = dir === 1 ? 1 : 0;
	return {
		d: [
			`M ${x0} ${mid} V ${y0 + r} A ${r} ${r} 0 0 ${up} ${x0 + dir * r} ${y0} H ${x0 + dir * (r + ARM)}`,
			`M ${x0} ${mid} V ${y1 - r} A ${r} ${r} 0 0 ${1 - up} ${x0 + dir * r} ${y1} H ${x0 + dir * (r + ARM)}`,
		],
		len: mid - y0 - r + (Math.PI * r) / 2 + ARM,
	};
}

/**
 * The layer, over the field.
 *
 * The whole answer to travel is still the `key`, and this direction needs it twice.
 * A presence keyed on the frame it is at cannot move between two frames: it lets go
 * here and takes hold there, both at once, because that is what the wire says. The
 * grip is keyed on what it has hold of for exactly the same reason — a write landing
 * in the footer is not the previous write sliding down the wall, it is another write,
 * somewhere else. So nothing here slides, at either scale.
 */
export function BandLayer({
	hand,
	rev,
	zone,
	base,
}: {
	hand: Hand | null;
	/** climbs on every design write, which is what the grip's flick is counting */
	rev: number;
	/** the third the last write was measured into, or null before the first one lands */
	zone: Zone | null;
	base: readonly string[];
}) {
	const index = hand === null ? -1 : base.indexOf(hand.frame);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || index === -1 ? null : (
					<Held key={hand.frame} hand={hand} rev={rev} zone={zone} index={index} count={base.length} />
				)}
			</AnimatePresence>
		</div>
	);
}

function Held({
	hand,
	rev,
	zone,
	index,
	count,
}: {
	hand: Hand;
	rev: number;
	zone: Zone | null;
	index: number;
	count: number;
}) {
	const still = useReducedMotion() === true;
	const box = { x: COLS[index] ?? 0, y: ROW_1, w: FW, h: FH };
	const side = dockOf(index, count);
	const dir = side === "left" ? -1 : 1;
	const wall = side === "left" ? box.x : box.x + box.w;
	const line = wall + dir * OUT;
	const mid = box.y + box.h / 2;
	const trace = hooks(box, side);
	const live = hand.verb !== null;

	// a run's first write and its row open on the same millisecond, so for one commit
	// the hold is a part with nowhere measured to be. It holds the whole wall for that
	// commit rather than guessing a third
	const part = hand.hold === "part" && zone !== null;
	const top = part && zone !== null ? box.y + zone * ZONE_H : box.y;
	const height = part ? ZONE_H : box.h;
	const key = hand.picturing ? "shot" : part && zone !== null ? `z${zone}` : "whole";

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
						strokeOpacity={0.85}
						strokeWidth={GRIP_W}
						strokeLinecap="round"
						strokeDasharray={trace.len}
						initial={{ strokeDashoffset: trace.len }}
						animate={{ strokeDashoffset: hand.picturing ? 0 : trace.len }}
						exit={{ strokeDashoffset: trace.len }}
						transition={{ duration: still ? 0 : hand.picturing ? 0.28 : 0.22, ease: ARRIVE }}
					/>
				))}
			</svg>
			{/* every change of extent is a let-go and a take-hold, both at once: the old
			    hold collapses toward its own middle while the new one opens from its own,
			    which is the law this family already applies to two frames, applied to two
			    thirds of one */}
			<AnimatePresence>
				{hand.picturing ? null : (
					<Grip
						key={key}
						line={line}
						top={top}
						height={height}
						mid={mid}
						live={live}
						rev={rev}
						flicks={part}
						still={still}
					/>
				)}
			</AnimatePresence>
			{/* the head: the participant itself, and the one thing here that never moves.
			    It is also what makes a position readable at all — a band means high or low
			    against something, and this is the something */}
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

/**
 * The grip: a bar as long as its claim, where the claim is.
 *
 * The reach is the hairline between the head and a band that has gone somewhere the
 * head is not. Without it the object is two marks a hundred pixels apart on one line
 * and has to be assembled by the reader; with it there are three weights on one line
 * — a 7px head, a 3px hold, a 1px reach — and only the middle one is ever a claim
 * about the design.
 */
function Grip({
	line,
	top,
	height,
	mid,
	live,
	rev,
	flicks,
	still,
}: {
	line: number;
	top: number;
	height: number;
	mid: number;
	live: boolean;
	rev: number;
	flicks: boolean;
	still: boolean;
}) {
	// one write, drawn: the bar thickens and settles. Width rather than length,
	// because length is a claim about how much of the frame is held and a write is
	// not a change to that. Nothing here loops — every movement on this canvas is a
	// call opening, a call landing, or a write inside a run
	const [bump, setBump] = useState(flicks);
	useEffect(() => {
		if (!flicks || rev === 0) return;
		setBump(true);
		const timer = window.setTimeout(() => setBump(false), BUMP_MS);
		return () => window.clearTimeout(timer);
	}, [rev, flicks]);

	const centre = top + height / 2;
	const above = centre < mid;
	// the head's own edge, so the reach starts where the head stops
	const gap = above ? mid - HEAD / 2 - (top + height) : top - (mid + HEAD / 2);

	return (
		<>
			{gap > 0 ? (
				<motion.span
					className="absolute bg-text"
					style={{ left: line - REACH_W / 2, width: REACH_W }}
					initial={{ height: 0, top: mid, opacity: 0 }}
					animate={{ height: gap, top: above ? mid - HEAD / 2 - gap : mid + HEAD / 2, opacity: live ? 0.4 : 0.2 }}
					exit={{ height: 0, top: mid, opacity: 0 }}
					transition={{ duration: still ? 0 : 0.17, ease: ARRIVE }}
				/>
			) : null}
			{/* flat ends rather than the parent's pill, because these ends mean something:
			    they are the third's own edges. A pill at a frame's wall is also the one
			    shape on screen that is already a scrollbar */}
			<motion.span
				className="absolute rounded-[1px] bg-text"
				style={{ left: line - GRIP_W / 2, width: GRIP_W }}
				initial={{ height: 0, top: centre, opacity: 0, scaleX: 1 }}
				animate={{
					height,
					top,
					opacity: live ? 0.85 : 0.34,
					// the flick is a transform, so a write costs no layout and the bar's own
					// length never moves to say one landed
					scaleX: bump && !still ? GRIP_BUMP / GRIP_W : 1,
				}}
				exit={{ height: 0, top: centre, opacity: 0 }}
				transition={{ duration: still ? 0 : 0.17, ease: ARRIVE, scaleX: { duration: still ? 0 : 0.11, ease: "easeOut" } }}
			/>
		</>
	);
}
