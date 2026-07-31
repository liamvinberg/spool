import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";

/**
 * The presence, and the ladder it falls down.
 *
 * `agent-hand--presence` welded a head to a frame's wall and ran a grip along it.
 * That object only exists while the frame is a rectangle you can see, and #136 made
 * off-screen the normal case: every row in this capture names `home`, which is one
 * page over from wherever you usually are. So the object here is drawn on **the
 * smallest thing on screen that contains the frame**, and the whole design is what
 * survives the drop.
 *
 * Four rungs, and they are containment rather than distance:
 *
 *   frame   the frame itself, when it is on this page and wholly in view
 *   row     the frame's row in the Pages rail, when the page is open under you but
 *           the frame has been panned out of the viewport
 *   page    the page's row, when the frame is on a page you are not looking at
 *   strip   the rail collapsed to its 44px strip, where there are no rows left
 *
 * Below that there is no rung. Switch projects and nothing on screen contains the
 * frame, so nothing is drawn — which is right, because the presence is a canvas
 * object and there is no canvas showing.
 *
 * Two channels survive the whole ladder and one does not. **Ink** is whether a call
 * is open, and it is the same two strengths everywhere. **Length** is the kind of
 * hold, and it survives as an ordinal but not as a fraction: 76 of a frame's 329px
 * wall is 23%, and 23% of a 28px row is 6.4px, which is smaller than the 7px head.
 * So the row's lengths are absolute — a long bar, a short bar, none — and what is
 * lost is that the grip used to be readable as *how much of this thing*.
 *
 * The **axis** rotates with the subject, which is the one thing that makes this one
 * object rather than two. A frame's only free edge is a side wall, 329px of it, so
 * the grip is vertical. A row's only free edge is the row, so the grip is
 * horizontal. Head welded, grip along the edge, both ends growing from the head:
 * the grammar is untouched and only the geometry the subject offers has changed.
 */

/* ---------- what the hand is doing ---------- */

/** the subject's whole edge, or a segment of it */
export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** writes landed so far in a run, so the chip counts the way the row counts */
	readonly count: number;
	/** the `shot` call is open: the grip is off the edge and around the subject */
	readonly picturing: boolean;
}

/**
 * Which verbs change the frame. Unchanged from the parent: three postures absorb
 * `write`, `shot`, `look`, `logs` and `edit`, and `read` — which this window
 * happens not to contain — lands in the one it already belongs to.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is, read off the same rows the rail is reading. Verbatim from
 * `agent-hand--presence`, because what the agent is doing is not the thing this
 * variation is arguing about — where it gets drawn is.
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

/* ---------- how far down it has fallen ---------- */

export type Rung = "frame" | "row" | "page" | "strip";

/**
 * The one rule: the smallest thing on screen that contains the frame.
 *
 * It is deliberately not a search for the prettiest place. Containment is what makes
 * the fall mean something — a presence on the `site` row says the agent is somewhere
 * inside `site`, which is true and is the most that can be said from where you are
 * standing. `agent-play--jump-name` decided this for hover and `PageRow.lit` exists
 * for it; the agent's own work obeys the same rule for the same reason.
 */
export function rungOf(world: {
	/** the frame's box is wholly inside the viewport, so its wall can be drawn on */
	readonly inView: boolean;
	/** the canvas is showing the page the frame lives on */
	readonly onPage: boolean;
	/** that page's row is expanded, so the frame has a row of its own */
	readonly open: boolean;
	/** the Pages rail is not collapsed to its strip */
	readonly railOpen: boolean;
}): Rung {
	if (world.onPage && world.inView) return "frame";
	if (!world.railOpen) return "strip";
	if (world.onPage && world.open) return "row";
	return "page";
}

/**
 * What the chip says, which is whatever the place it is standing in does not say.
 *
 * A frame on the canvas wears its name above it and a frame's row is its name, so
 * both get the verb alone. A page's row names the page and not the frame, so the
 * chip has to carry the frame back — otherwise the fall would lose the one thing it
 * exists to keep, which is *which frame*.
 */
export function chipOf(hand: Hand, named: boolean): string | null {
	if (hand.verb === null) return null;
	const verb = hand.count > 1 ? `${hand.verb} ×${hand.count}` : hand.verb;
	return named ? verb : `${hand.frame} ${verb}`;
}

/* ---------- shared ink ---------- */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;
/** the two strengths: a call is open, or the agent is between calls and has not let go */
const LIVE = 0.85;
const HELD = 0.34;
const HEAD = 7;
const GRIP = 3;
/** one write, drawn: the segment flicks longer and settles */
const TICK_MS = 150;

/**
 * One write landing, as a flick rather than a loop. Nothing on this canvas has an
 * idle animation: every movement is a call opening, a call landing, or one of the
 * six writes inside a run.
 */
function useBump(count: number): boolean {
	const [bump, setBump] = useState(false);
	useEffect(() => {
		if (count === 0) return;
		setBump(true);
		const timer = window.setTimeout(() => setBump(false), TICK_MS);
		return () => window.clearTimeout(timer);
	}, [count]);
	return bump;
}

/**
 * A box's outline in two halves that both leave from the same point, so the trace
 * opens out of the object rather than arriving as a second one.
 *
 * `start` is where the head is: the middle of a frame's wall, and the trailing edge
 * of a row. `axis` is which way the halves run — down a frame's wall, along a row.
 */
function halves(
	box: { x: number; y: number; w: number; h: number },
	axis: "y" | "x",
	side: 1 | -1,
	radius: number,
): { d: readonly string[]; len: number } {
	const r = radius;
	if (axis === "y") {
		const x0 = side === -1 ? box.x : box.x + box.w;
		const x1 = side === -1 ? box.x + box.w : box.x;
		const dir = side === -1 ? 1 : -1;
		const y0 = box.y;
		const y1 = box.y + box.h;
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
	const y0 = box.y;
	const y1 = box.y + box.h;
	const x0 = box.x;
	const x1 = box.x + box.w;
	const mid = (y0 + y1) / 2;
	return {
		d: [
			`M ${x1} ${mid} V ${y0 + r} A ${r} ${r} 0 0 0 ${x1 - r} ${y0} H ${x0 + r} A ${r} ${r} 0 0 0 ${x0} ${y0 + r} V ${mid}`,
			`M ${x1} ${mid} V ${y1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${y1} H ${x0 + r} A ${r} ${r} 0 0 1 ${x0} ${y1 - r} V ${mid}`,
		],
		len: 2 * (mid - y0 - r) + Math.PI * r + (x1 - x0 - 2 * r),
	};
}

function Trace({
	paths,
	len,
	on,
	still,
	weight = 1.5,
	ink = 0.75,
}: {
	paths: readonly string[];
	len: number;
	on: boolean;
	still: boolean;
	/** a row's perimeter is a fifth of a frame's, so the same ink at the same width is five times as loud */
	weight?: number | undefined;
	ink?: number | undefined;
}) {
	return (
		<>
			{paths.map((d) => (
				<motion.path
					key={d}
					d={d}
					stroke="var(--color-text)"
					strokeOpacity={ink}
					strokeWidth={weight}
					strokeLinecap="round"
					strokeDasharray={len}
					initial={{ strokeDashoffset: len }}
					animate={{ strokeDashoffset: on ? 0 : len }}
					exit={{ strokeDashoffset: len }}
					transition={{ duration: still ? 0 : on ? 0.3 : 0.24, ease: ARRIVE }}
				/>
			))}
		</>
	);
}

/* ---------- rung one: the frame itself ----------
 * `spool-play-field.tsx` has no slot for another layer and shared/ is not this
 * frame's to change, so the presence is a sibling of the field drawn in the same
 * coordinates. Both live inside the same panned wrapper, so the object stays welded
 * to the frame while the canvas is dragged — which is what makes the fall to the
 * rail a fall rather than a jump. */

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const FW = 152;
const FH = 329;
const RADIUS = 12;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;
/** and 900 less the 44px shell bar */
const VIEW_H = 856;
/** the frame's own name, sitting above it */
const LABEL_LIFT = 22;

/** how far outside the wall the object sits */
const OUT = 6;
const PART = 76;
const CHIP_H = 18;
const CHIP_GAP = 6;
const TICK_RISE = 22;
/** `edit ×6` is 54px of 10px mono with its padding, plus the six it stands off the head */
const NEED = 64;

export type Side = "left" | "right";

/** which wall, and whether there is room for words — unchanged from the parent */
export function dockOf(index: number, count: number): { side: Side; words: boolean } {
	const here = COLS[index] ?? 0;
	const before = COLS[index - 1];
	const after = COLS[index + 1];
	const left = index === 0 || before === undefined ? here : here - (before + FW);
	const right = index === count - 1 || after === undefined ? VIEW_W - (here + FW) : after - (here + FW);
	return { side: left >= right ? "left" : "right", words: Math.max(left, right) >= NEED };
}

/**
 * Whether the frame is drawable at all, which is the test that starts the fall.
 *
 * The whole box plus its name, with room to spare, because a presence hanging off
 * the edge of the viewport is a posture you cannot read. The moment the frame stops
 * being fully drawable the object lets go here and takes hold in the rail, and the
 * two halves run at once — a fall is not travel any more than a move between frames
 * is.
 */
export function boxInView(index: number, pan: { x: number; y: number }): boolean {
	const margin = 16;
	const x = (COLS[index] ?? 0) + pan.x;
	const y = ROW_1 + pan.y;
	return (
		x >= margin && x + FW <= VIEW_W - margin && y - LABEL_LIFT >= margin && y + FH <= VIEW_H - margin
	);
}

export function HandLayer({ hand, base, on }: { hand: Hand | null; base: readonly string[]; on: boolean }) {
	const index = hand === null ? -1 : base.indexOf(hand.frame);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || index === -1 || !on ? null : (
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
	const trace = halves(
		{ x: box.x - OUT, y: box.y - OUT, w: box.w + OUT * 2, h: box.h + OUT * 2 },
		"y",
		dock.side === "left" ? -1 : 1,
		RADIUS + OUT,
	);
	const live = hand.verb !== null;
	const bump = useBump(hand.count);

	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;
	const length = held === 0 || still || !bump ? held : held + TICK_RISE;
	const move = { duration: still ? 0 : 0.22, ease: ARRIVE };
	const word = chipOf(hand, true);

	return (
		<>
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
				fill="none"
				aria-hidden="true"
			>
				<Trace paths={trace.d} len={trace.len} on={hand.picturing} still={still} />
			</svg>
			{/* the grip: length is what the agent has hold of, ink is whether it is
			    doing anything to it */}
			<motion.span
				className="absolute rounded-full bg-text"
				style={{ left: line - GRIP / 2, width: GRIP }}
				initial={{ height: 0, top: mid, opacity: 0 }}
				animate={{ height: length, top: mid - length / 2, opacity: live ? LIVE : HELD }}
				exit={{ height: 0, top: mid, opacity: 0 }}
				transition={move}
			/>
			{/* the head: the participant itself, and the one thing that never changes */}
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
						{word === null ? null : (
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

/* ---------- rungs two and three: a row in the Pages rail ----------
 * The same object, turned. A row has no walls to weld to, so the edge is the row
 * itself and the head sits at its trailing end — the end that faces the canvas,
 * which is the direction the frame is actually in. The grip grows leftward out of
 * it along the row.
 *
 * The lengths are absolute rather than proportional, because the fraction does not
 * survive: 23% of a 28px row is smaller than the head. What is kept is the order —
 * a long bar, a short bar, none — and the ink, which is untouched. */

/**
 * The row's own free span, in the gutter the walk tick and the thread mark already
 * use. The grip grows out of the head in both directions exactly as it does on a
 * frame's wall, which is not a stylistic echo: a bar with its head at one end is a
 * slider, and a bar with its head in the middle is a hold.
 */
const ROW_WHOLE = 52;
const ROW_PART = 20;
const ROW_TICK = 8;
/**
 * Two pixels rather than the canvas's three, which is the one measurement that is
 * not a straight carry. A 3px bar under a 7px head, lying flat, is a slider; a hair
 * under the same head is a mark on a rule, which is what the rail's tree connectors
 * already are. The head keeps its size, because the head is the participant.
 */
const ROW_GRIP = 2;
/** the Pages rail is a fixed 248 in this frame, so the trace can be laid out rather than measured */
const RAIL_W = 248;

/**
 * The presence in a row, as a flex child so it lands in the row's trailing slot
 * rather than over its words. `ThreadMark` already sits exactly here, which is the
 * rail's own answer to *something about this row that is not its name*.
 */
export function RowHold({
	hand,
	height,
	gutter,
	className,
}: {
	hand: Hand;
	height: number;
	gutter: number;
	className?: string | undefined;
}) {
	const still = useReducedMotion() === true;
	const live = hand.verb !== null;
	const bump = useBump(hand.count);
	const held = hand.picturing ? 0 : hand.hold === "whole" ? ROW_WHOLE : ROW_PART;
	const length = held === 0 || still || !bump ? held : held + ROW_TICK;
	const move = { duration: still ? 0 : 0.22, ease: ARRIVE };
	const trace = halves({ x: 1.5, y: 1.5, w: RAIL_W - 3, h: height - 3 }, "x", 1, 6);

	return (
		<motion.span
			className={`relative block shrink-0 ${className ?? ""}`}
			style={{ width: ROW_WHOLE, height: HEAD }}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: still ? 0 : 0.2, ease: ARRIVE }}
		>
			{/* the trace runs the row's perimeter, which is the one moment the rail admits
			    a row is a rectangle. It covers the whole row, so it sits in its own layer
			    rather than inside the slot */}
			<svg
				className="pointer-events-none absolute overflow-visible"
				style={{ right: -gutter, top: (HEAD - height) / 2, width: RAIL_W, height }}
				fill="none"
				aria-hidden="true"
			>
				<Trace paths={trace.d} len={trace.len} on={hand.picturing} still={still} weight={1} ink={0.55} />
			</svg>
			<motion.span
				className="absolute rounded-full bg-text"
				style={{ top: (HEAD - ROW_GRIP) / 2, height: ROW_GRIP }}
				initial={{ width: 0, left: ROW_WHOLE / 2, opacity: 0 }}
				animate={{ width: length, left: (ROW_WHOLE - length) / 2, opacity: live ? LIVE : HELD }}
				transition={move}
			/>
			<motion.span
				className="absolute rounded-[2px] bg-text"
				style={{ left: (ROW_WHOLE - HEAD) / 2, top: 0, width: HEAD, height: HEAD }}
				initial={{ opacity: 0, scale: 0.5 }}
				animate={{ opacity: 0.92, scale: 1 }}
				transition={{ duration: still ? 0 : 0.2, ease: ARRIVE }}
			/>
		</motion.span>
	);
}

/** the word beside the mark in a row, in the row's own register */
export function RowChip({ text, className }: { text: string | null; className?: string | undefined }) {
	const still = useReducedMotion() === true;
	return (
		<AnimatePresence>
			{text === null ? null : (
				<motion.span
					key="word"
					className={`mr-2 ml-3 shrink-0 whitespace-nowrap font-mono text-2xs text-text leading-3 ${className ?? ""}`}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1, transition: { duration: still ? 0 : 0.1 } }}
					exit={{ opacity: 0, transition: { duration: still ? 0 : 0.3 } }}
				>
					{text}
				</motion.span>
			)}
		</AnimatePresence>
	);
}

/* ---------- rung four: the strip ----------
 * The rail collapsed. There are no rows, so there is nothing with a shape to have
 * hold of, and the grip has nowhere to lie. What is left is the head, welded to the
 * strip's inner seam at the height the page list starts.
 *
 * This is where the ladder ends, and it ends because the object has run out of
 * channels rather than out of places. A presence that has lost its posture is
 * already only saying *somebody is in there*, and one more rung down it would be
 * saying nothing. */

export function StripHold({ hand }: { hand: Hand }) {
	const still = useReducedMotion() === true;
	const live = hand.verb !== null;
	return (
		<motion.span
			className="pointer-events-none absolute rounded-[2px] bg-text"
			style={{ right: -HEAD / 2, top: 68 - HEAD / 2, width: HEAD, height: HEAD }}
			initial={{ opacity: 0, scale: 0.5 }}
			animate={{ opacity: live ? 0.92 : 0.5, scale: 1 }}
			exit={{ opacity: 0, scale: 0.5 }}
			transition={{ duration: still ? 0 : 0.2, ease: ARRIVE }}
		/>
	);
}
