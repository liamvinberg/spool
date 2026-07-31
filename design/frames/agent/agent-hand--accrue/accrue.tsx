import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { REGION, type RegionId } from "./kaffe-home-accrue";

/**
 * The presence, and the margin it leaves.
 *
 * `agent-hand--presence` is the base and its two parts are unchanged. The **head**
 * is the participant, a small square welded to the frame's wall that arrives when
 * the agent starts on this frame, never changes while it is there, and goes when it
 * moves on. The **grip** is what it has hold of: the wall's whole height while the
 * agent is taking the frame in, a short segment while it is changing it, nothing at
 * all for the beat it is photographing it. Length is the kind of hold and survives
 * the gaps; ink is whether a call is open right now.
 *
 * What is added is the **margin**: a lane against the frame's own edge where each
 * write leaves a mark at the height of the block it changed, and the mark decays
 * over six seconds. So the grip says what the agent has hold of and the margin says
 * where it has been, and the two never collide because they are two lanes six pixels
 * apart and one of them is a single bar centred on the head.
 *
 * The margin is not over the design. It is beside it, in the way an editor's ruler
 * is beside its text: it is allowed to say *where* because the y it carries is the
 * frame's own y, and it costs the design nothing because it never enters it.
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

/** one write, still on the wall */
export interface Trace {
	/** the block, and which write put it there — a second write to one block restarts the mark rather than stacking on it */
	readonly key: string;
	readonly region: RegionId;
}

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** writes landed so far in a run, so the chip counts the way the row counts */
	readonly count: number;
	/** the `shot` call is open: the grip is off the wall and around the frame */
	readonly picturing: boolean;
	/** every block a landed write named, newest last */
	readonly traces: readonly Trace[];
}

/**
 * Which verbs change the frame.
 *
 * Three postures absorb five verbs: `session` + `run` on `claude-edits` projects
 * `write`, `shot`, `look`, `logs` and `edit`, twenty-one rows, every one of them
 * naming `home`, and `read`, which this window happens not to contain, lands in the
 * one it already belongs to with nothing new drawn.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is and what it has left behind, read off the same rows the rail
 * is reading.
 *
 * When no call is open the hand falls back to the last row that had one: the agent
 * is between calls and has not gone anywhere, so the object keeps its posture and
 * drops its word. The margin does not care whether a call is open at all — a mark
 * is a write that landed, and it goes on decaying through the dead air, which is
 * the stretch it is most legible in because nothing new is landing on top of it.
 */
export function handOf(script: Script, turn: Turn, lands: readonly RegionId[]): Hand | null {
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
 * The writes that have landed, one mark per block.
 *
 * The capture's run children are the calls the row collapsed, so this is the same
 * arithmetic `railEntries` does to print `×6` — one number, two surfaces. Two things
 * are deliberately not marked. The `write home` the turn opens with is
 * `frames/home/frame.json`: geometry moves the rectangle and leaves the design
 * alone, so the margin has nothing true to say about it. And a block written twice
 * carries one mark that restarts, never two marks stacked: the wall says *here,
 * again, just now*, and how many times is what the rail's own count is for.
 */
function tracesOn(script: Script, turn: Turn, frame: string, lands: readonly RegionId[]): readonly Trace[] {
	const latest = new Map<RegionId, number>();
	let index = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) {
			const region = lands[index];
			index += 1;
			if (region === undefined || !turn.at(child.cue)) continue;
			latest.set(region, index);
		}
	}
	return [...latest].map(([region, nth]) => ({ key: `${region}:${nth}`, region }));
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
/** what a frame is authored at, so a block's box becomes a height on the wall */
const NAT_W = 240;
const S = FW / NAT_W;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the object ---------- */

/**
 * How far outside the wall the presence sits.
 *
 * `agent-hand--presence` stands at 6 and this stands at 12, because the margin needs
 * the six pixels nearest the frame and the two lanes must not be read as one object.
 * It is a real cost and it is paid twice. The head is twice as far from the thing it
 * is holding, and the `shot` outline is struck from the same number, so its top edge
 * moves from y 40 to y 34 and **runs through the frame's own name**, which the
 * parent's at 6 sits just clear of. What it buys back is the parent's other named
 * defect: an outline 6px off a frame reads as a selection ring, and at 12 it no
 * longer sits where selection chrome sits. That is the trade, drawn rather than
 * argued — one defect for another, and the round can pick.
 */
const OUT = 12;
const GRIP_W = 3;
const PART = 76;
const HEAD = 7;
const CHIP_H = 18;
const CHIP_GAP = 6;
/** one write, drawn on the grip: the segment flicks longer and settles */
const TICK_RISE = 22;
const TICK_MS = 150;

/* the margin's own lane, against the frame's edge and inside the presence */
const MARK_IN = 2;
const MARK_W = 3;
const MARK_THIN = 1;

/**
 * How wide a frame must draw before the canvas mounts its document — `src/cover.ts:8`,
 * enforced at `lifecycle.ts:245` as `frame.w * camera.k < LIVE_MIN_CSS_PX`.
 *
 * This is the boundary of the located margin, and it is the whole regime question.
 * Below it a frame is a stored still: `coverPlan` returns `cover: true` for any state
 * that is not `live`, and `frame-shell.tsx:154` says it plainly — "a held document
 * stays mounted for Select and the rail, but its still remains on screen below the
 * readable threshold". There is no document in there to ask where a block is, so the
 * y a mark stands at cannot be obtained at all.
 */
const LIVE_MIN_CSS_PX = 400;

/**
 * Whether a mark can honestly claim a height at this drawn size.
 *
 * Above the threshold the frame is a live document and `data-spool-source` resolves a
 * write's line to a box. Below it there is nothing to ask, and the correct degrade is
 * not a fainter margin or a guessed one — it is no margin, which is exactly
 * `agent-hand--presence`. The two frames are not competitors: they are the two halves
 * of one zoom range.
 */
export function marginLives(drawn: number): boolean {
	return drawn >= LIVE_MIN_CSS_PX;
}

/**
 * The one fiction in this frame, named at the line that introduces it.
 *
 * `spool-play-field.tsx` draws every frame at 152px and the arrangement is fixed, so
 * this canvas is at 39% and `marginLives(152)` is false. The margin is drawn anyway,
 * because a frame that correctly draws nothing cannot be judged. Everything else here
 * is true at canvas zoom: the marks are drawn by the canvas outside the iframe, they
 * never touch the design, and their timing is the capture's own. Only their heights
 * need a document, and only above 400 drawn pixels is there one.
 */
const DIAGRAM = true;

/**
 * How long a write stays on the wall, in seconds, and the beat it holds at full
 * before it starts going.
 *
 * Six is measured rather than chosen. A run coheres only if a mark outlives the run
 * that made it, and the longest run of writes here spans 4.84s (7.15s to 11.99s, six
 * calls). Two runs stay separate only if a mark dies before the next run starts, and
 * the shortest gap between runs is 6.14s (24.20s to 30.34s). So the whole legal
 * window is [4.84, 6.14] and it is 1.3 seconds wide.
 */
const LIFE = 6;
const RISE = 0.08;
const HELD = 0.7;
const PEAK = 0.9;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * What a chip needs to be worth docking: `edit ×6` is 54px at 10px mono with its
 * padding, plus the six it stands off the head. Nothing in this arrangement clears
 * it — `home` is the middle column and both its gutters are 44 — so this frame is
 * drawn without a word anywhere on it, on purpose. The margin has to carry it alone.
 */
const NEED = 64;

export type Side = "left" | "right";

/**
 * Which wall, and whether there is room for words.
 *
 * The tie is broken to the right rather than the left, which is one character of
 * difference from the parent and has a reason. A walk arrow's head lands on a
 * frame's **left** wall — `spool-play-field.tsx` draws it at `x - 9` — so on a frame
 * with equal gutters, breaking left puts the hand and the margin underneath an
 * accent-coloured triangle. Breaking right leaves them on the wall the outgoing edge
 * only grazes. The residual is real and stated: the outgoing edge leaves at the
 * frame's vertical middle and crosses three pixels of the margin lane on its way.
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
 * the head, around the corners, and meet again on the far wall. Same ink over a path
 * four times longer than the wall, which is why it is struck at 1.5px.
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
 * halves run at once because that is what the wire says. The margin is keyed with it,
 * which is the decision that a trace does not outlive the hand that made it.
 */
export function AccrueLayer({ hand, base }: { hand: Hand | null; base: readonly string[] }) {
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
			{/* the margin: the writes, where they landed, going out on their own clocks.
			    It needs a live document to know a height, so below 400 drawn pixels it
			    draws nothing and the object is the parent's exactly */}
			{marginLives(FW) || DIAGRAM
				? hand.traces.map((mark) => (
						<Mark key={mark.key} mark={mark} box={box} wall={wall} side={dock.side} still={still} />
					))
				: null}
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

/**
 * One write, on the wall, going out.
 *
 * It mounts when its cue fires, so the clock is the capture's own and no ticker is
 * in the path — which matters, because `useTicker` moves at 100ms and a six-second
 * fade driven off it would step ten times a second.
 *
 * Three things move together and they are one channel with three bodies. **Ink**
 * carries the age, **width** carries it again so a stale mark reads as residue
 * rather than as a live mark somebody drew faintly, and the mark thins toward the
 * frame rather than away from it, so what recedes is the part furthest from the
 * thing it is about. The decay is linear after a 0.7s hold at full: an ease would
 * either bunch the old marks together at the bottom of the range or drop them off a
 * cliff, and the one thing the margin has to keep legible is the *order* of a run.
 */
function Mark({
	mark,
	box,
	wall,
	side,
	still,
}: {
	mark: Trace;
	box: { x: number; y: number; w: number; h: number };
	wall: number;
	side: Side;
	still: boolean;
}) {
	const region = REGION[mark.region];
	// the frame's own y, at the scale the canvas is drawing it — the mark is level
	// with the block whatever the zoom, because it is the same number times the same
	// scale the frame is under
	const top = box.y + region.y * S;
	const height = Math.max(4, region.h * S);
	const inner = side === "left" ? wall - MARK_IN : wall + MARK_IN;
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
