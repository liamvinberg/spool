import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import type { Script, ToolRow } from "shared/lib/explore/agent/claude-turn";
import type { Turn } from "shared/lib/spool/turn-play";
import { type FrameSlot, SCALE, SLOTS } from "./field";
import { type BlockId, type Box, LANDS, UNSTAMPED } from "./kaffe-page";

/**
 * The agent's hand on a frame: what it is holding, and what it has just changed.
 *
 * Four objects and no words anywhere. The vocabulary is what the twenty-eight
 * explorations above this frame converged on, and every number in it was argued
 * somewhere in that family rather than picked here:
 *
 *   node      the participant, welded to the wall, unchanging               `--presence`
 *   thread    length is the kind of hold, tension is whether a call is open `--spool`
 *   lane      one mark per landed write, at the height of what it changed   `--accrue`
 *   plate     the changed block itself, tinted and drained                  this frame
 *   corners   the `shot` posture, four arcs that never close                `--ghost`
 *
 * ## The plate is the mark, and it lands on the thing rather than beside it
 *
 * Every direction before `--edit-span` marked a write at the frame's edge, which makes
 * you look at the edge and then work out what it points at. A span fixed that with two
 * rules bracketing the block, and then found the fault a desktop page puts in any
 * horizontal mark: **a rule at a write's height crosses a block that did not change 0
 * times out of 13 on a phone and 7 times out of 11 on a desktop.** A height is an address
 * in one column and a guess on a grid.
 *
 * A plate has no such failure mode, because it is the block's own box rather than a
 * projection of one edge of it. What it costs is what the span deliberately saved: **the
 * mark is over the design instead of in the seam beside it.** That is the trade this
 * frame makes and it is the first thing to argue about. `--inside` was rejected for
 * spending the interior at 4% sustained over the whole design; this spends it too,
 * briefly and locally — the largest block on the phone is the hero at 33% of the frame,
 * at 0.15 ink, for 860ms.
 *
 * ## The motion language, which is one rule
 *
 * **Nothing here fades in. Everything is drawn on from where it means something.** The
 * thread winds off the node and back onto it, so taking hold and letting go are the same
 * gesture in two directions. The corners stroke on from their own arms. The plate opens
 * from the block's own centre. A fade has no origin, and every one of these objects has a
 * place it comes from.
 *
 * One envelope, `--edit-span`'s, and both ends of it are the capture's rather than taste:
 * **860ms**, 140 opening, 320 held, 400 leaving. The floor is 180, because
 * `frame-shell.tsx` fades a rebooted frame's cover out over exactly that and a mark
 * shorter than the seam is a flash of nothing. The ceiling is **1,166ms**, the smallest
 * sum of two consecutive write gaps in this capture, which is what keeps a third mark off
 * the frame. Across the thirteen writes there are four overlaps and the longest is 287ms:
 * two plates alive at once, never three, for 3.3% of the turn.
 *
 * ## The lane and the plate say the same thing, and that is the open question
 *
 * `--edit-span` removed the lane on exactly this ground: the rail already prints
 * `edit home ×6`, so a wall that also counts is a third copy of one fact. `--accrue`'s
 * answer is that they differ in *tense* — a plate is a pointer and lives 860ms, a lane is
 * a ledger and lives 6 seconds, so a finished run leaves a shape on the wall you can read
 * after the last write. Both are kept here because the sheet that chose this compile had
 * both, and because the argument is worth having against something drawn rather than
 * described.
 *
 * ## What this frame fakes, stated
 *
 * **The block a write landed in.** `LANDS` is the family's staging and the boxes come
 * from `phoneLayout` and `wideLayout` rather than from a stamp resolved in a live
 * document. Writes 7 and 8 are the exception and are drawn as the stamp would actually
 * resolve them, which is at the frame's own root — a plate over the whole page, the same
 * object from a coarser box, needing no special case.
 *
 * **The phone's located heights.** `src/cover.ts:8` puts `LIVE_MIN_CSS_PX` at 400, so at
 * 132 drawn pixels the phone has no document and nothing in it can be located at all. The
 * desktop frame draws at 487 and genuinely can be.
 */

/* ---------- what the hand is doing ---------- */

export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** writes landed in the open run, which plucks the thread and is printed nowhere */
	readonly count: number;
	readonly picturing: boolean;
}

const HOLD_OF: Record<string, Hold> = { write: "part", edit: "part" };

/** where the agent is, read off the same rows the rail is reading */
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
		hold: HOLD_OF[on.verb] ?? "whole",
		verb: open === null ? null : open.verb,
		count: open === null ? 0 : on.runs ? on.children.filter((child) => turn.at(child.cue)).length : 0,
		picturing: open !== null && open.verb === "shot",
	};
}

/**
 * How many of the thirteen design writes have landed.
 *
 * A run's children are the calls it collapsed, so this is the same arithmetic
 * `railEntries` does to print `×6`. `write home` at 117ms is `frames/home/frame.json` and
 * is not one of them: geometry moves the rectangle and leaves the design alone, and every
 * channel here is correctly silent there.
 */
export function writesOn(script: Script, turn: Turn, frame: string, cap: number): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return Math.min(count, cap);
}

/** one landed write, and the box it can name */
export interface Change {
	/** the block and the write that put it there, so a second write to one block restarts rather than stacks */
	readonly key: string;
	readonly block: BlockId;
	/** the block's box at the revision the write made, or null where the stamp resolved nowhere */
	readonly box: Box | null;
}

/**
 * The changes a frame is carrying, one per block rather than one per write.
 *
 * A block written twice restarts its own mark: the claim is *this changed, just now*, and
 * how many times is the rail's. In this capture that happens three times and all three
 * are consecutive pairs — the button at writes 3 and 4, the menu at 7 and 8, the footer
 * at 9 and 10.
 *
 * The box comes from the layout at the revision the write itself made, which is not the
 * revision on screen once a later write has reflowed the page. Nearly free at this life:
 * a plate is gone in 860ms and the next reflow is at least 573 away.
 */
export function changesAt(landed: number, layout: (rev: number) => Record<BlockId, Box>): readonly Change[] {
	const latest = new Map<BlockId, number>();
	for (let write = 1; write <= landed; write += 1) {
		const block = LANDS[write - 1];
		if (block !== undefined) latest.set(block, write);
	}
	return [...latest].map(([block, write]) => ({
		key: `${block}:${write}`,
		block,
		box: UNSTAMPED.has(write) ? null : layout(write)[block],
	}));
}

/* ---------- the numbers ---------- */

/** the one envelope: 140 opening, 320 held, 400 leaving */
const LIFE = 0.86;
const OPEN = 0.14 / LIFE;
const HOLD = 0.46 / LIFE;
const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/** the plate's ink over paper. One tone, because unlike a span it never crosses the wall */
const TINT = "#17171A";
const TINT_INK = 0.15;
/** it opens from the block's own centre rather than appearing at full height */
const OPEN_FROM = 0.34;

/** the frame's own corner, so the corners can be struck concentric with it */
const RADIUS = 12;
/**
 * How far outside the wall the node's centre sits, and how far outside it the shot
 * corners are struck.
 *
 * With no word on the wall the widest claimants are the slack thread at centre ± 5 and
 * the lane's 5 nearest the frame, so the centre stands at **12**, which is `--accrue`'s
 * own number for the lane alone. The corners are decoupled at **4** because they are
 * struck around the whole box and the frame's name sets in a 12px line box ending 5
 * pixels above it — the collision `--ghost-loud` measured and could not solve while the
 * two numbers were one number.
 */
const OUT = 12;
const OUT_SHOT = 4;
const THREAD = 2;
const PART = 76;
/** the node: the participant, and the one thing here that never changes */
const NODE = 9;

/* the lane's own claim, against the frame's edge and inside everything else */
const MARK_IN = 2;
const MARK_W = 3;
const MARK_THIN = 1;
/**
 * How long a mark stands on the wall. `--accrue` measured the window at 1.3s wide: a mark
 * must outlive the run that made it, and the longest run here spans 4.84s; and two runs
 * must stay apart, and the shortest gap between runs is 6.14s.
 */
const LANE_LIFE = 6;
const LANE_IN = 0.08;
const LANE_HELD = 0.7;
const LANE_PEAK = 0.9;

const SLACK = 4;
const WAVE = 46;
const PLUCK = 1.6;
/** tension arrives on the instant and slack comes back slowly, which is what a thread does */
const TAUT_MS = 0.09;
const SLACK_MS = 0.32;
const INK = 0.78;
const ARM = 11;

function corners(box: { x: number; y: number; w: number; h: number }): { d: readonly string[]; len: number } {
	const r = RADIUS + OUT_SHOT;
	const x0 = box.x - OUT_SHOT;
	const x1 = box.x + box.w + OUT_SHOT;
	const y0 = box.y - OUT_SHOT;
	const y1 = box.y + box.h + OUT_SHOT;
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

/** the wall run, sampled: one line through the node, displaced by a sine with a node at the node */
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

/* ---------- the layer ---------- */

/**
 * The whole agent layer: the plates inside the frames, the presence on one wall.
 *
 * **They are not drawn on the same frames, and that is this construction's own finding.**
 * The wire names one frame, so the presence stands beside `home` and nowhere else. The
 * write lands in a component two frames read, so both frames change and both get a plate.
 * The presence is a fact about the transcript; the plate is a fact about the pixels. A
 * canvas holding one page at two breakpoints therefore has a frame redrawing with nothing
 * beside it saying why.
 */
export function HandLayer({ hand, changes }: { hand: Hand | null; changes: ReadonlyMap<string, readonly Change[]> }) {
	const still = useReducedMotion() === true;
	const at = SLOTS.find((slot) => slot.name === hand?.frame) ?? null;
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			{/* under stillness the turn is a jump cut, so thirteen writes land in one commit and
			    every plate would be struck at once — the whole page tinted, at the one moment
			    nobody wrote anything. Disabled outright rather than degraded */}
			{still
				? null
				: SLOTS.map((slot) =>
						(changes.get(slot.name) ?? []).map((change) => (
							<Plate key={`${slot.name}:${change.key}`} slot={slot} change={change} />
						)),
					)}
			<AnimatePresence>
				{hand === null || at === null ? null : (
					<Held key={at.name} hand={hand} slot={at} changes={changes.get(at.name) ?? []} still={still} />
				)}
			</AnimatePresence>
		</div>
	);
}

/**
 * One write, on the block it changed.
 *
 * It opens from the block's own centre rather than appearing at full height, so the mark
 * has an origin and the origin is the change. Where the stamp resolved nowhere the box is
 * the frame's own and the plate is the whole page, which is legible as the coarse claim
 * it is.
 */
function Plate({ slot, change }: { slot: FrameSlot; change: Change }) {
	const box = change.box ?? { x: 0, y: 0, w: slot.nat.w, h: slot.nat.h };
	return (
		<motion.span
			className="absolute block rounded-[3px]"
			style={{
				left: slot.x + box.x * SCALE,
				top: slot.y + box.y * SCALE,
				width: box.w * SCALE,
				height: box.h * SCALE,
				background: TINT,
			}}
			initial={{ opacity: 0, scaleY: OPEN_FROM }}
			animate={{ opacity: [0, TINT_INK, TINT_INK, 0], scaleY: [OPEN_FROM, 1, 1, 1] }}
			transition={{ duration: LIFE, times: [0, OPEN, HOLD, 1], ease: ["easeOut", "linear", "easeIn"] }}
			aria-hidden="true"
		/>
	);
}

function Held({
	hand,
	slot,
	changes,
	still,
}: {
	hand: Hand;
	slot: FrameSlot;
	changes: readonly Change[];
	still: boolean;
}) {
	const box = { x: slot.x, y: slot.y, w: slot.w, h: slot.h };
	const out = slot.dock === "left" ? -1 : 1;
	const wallX = slot.dock === "left" ? box.x : box.x + box.w;
	const line = wallX + out * OUT;
	const mid = box.y + box.h / 2;
	const trace = corners(box);
	const live = hand.verb !== null;
	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;

	// two numbers and one line. Length is the hold and moves at the pace a posture changes;
	// amplitude is the pull and moves at the pace a call opens
	const length = useMotionValue(held);
	const amp = useMotionValue(live ? 0 : SLACK);
	const path = useTransform([length, amp], (latest: number[]) => wall(latest[0] ?? 0, latest[1] ?? 0, line, mid, out));

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

	// a write is a pluck on a line that is already taut, never a change of length: the
	// posture channel says what kind of hold this is and an event must not spend it
	useEffect(() => {
		if (hand.count === 0 || !live || still) return;
		const run = animate(amp, [PLUCK, 0], { duration: 0.24, ease: "easeOut" });
		return () => run.stop();
	}, [hand.count, live, amp, still]);

	return (
		<>
			<svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" fill="none" aria-hidden="true">
				{/* the thread. It arrives and leaves by winding off and back onto the node rather
				    than by fading, so taking hold and letting go are the same gesture in two
				    directions */}
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
				{/* the `shot` posture: four corners struck at their own stand-off, drawn on from
				    their arms and never closing, because a closed rectangle outside a frame is
				    the selection ring `Slot` draws at `inset: -1` */}
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
			{/* the lane: the run's ledger, at the heights the writes landed at */}
			{changes.map((change) =>
				change.box === null ? null : (
					<LaneMark key={change.key} box={change.box} slot={slot} wall={wallX} dock={slot.dock} still={still} />
				),
			)}
			{/* the node: the participant itself, drawn last so nothing crosses it */}
			<motion.span
				className="absolute rounded-[2px] border border-muted bg-canvas"
				style={{ width: NODE, height: NODE, left: line - NODE / 2, top: mid - NODE / 2 }}
				initial={{ opacity: 0, scale: 0.4 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.4 }}
				transition={{ duration: still ? 0 : 0.2, ease: ARRIVE }}
			/>
		</>
	);
}

/**
 * One write, on the wall, going out.
 *
 * Ink carries the age and width carries it again, so a stale mark reads as residue rather
 * than as a live mark somebody drew faintly, and it thins toward the frame so what recedes
 * is the part furthest from the thing it is about. The decay is linear after a 0.7s hold
 * at full, because the one thing a ledger has to keep legible is the order of a run.
 */
function LaneMark({
	box,
	slot,
	wall: wallX,
	dock,
	still,
}: {
	box: Box;
	slot: FrameSlot;
	wall: number;
	dock: "left" | "right";
	still: boolean;
}) {
	const top = slot.y + box.y * SCALE;
	const height = Math.max(4, box.h * SCALE);
	const inner = dock === "left" ? wallX - MARK_IN : wallX + MARK_IN;
	const at = (width: number) => (dock === "left" ? inner - width : inner);
	return (
		<motion.span
			className="absolute rounded-[1px] bg-text"
			style={{ top, height }}
			initial={{ opacity: 0, width: MARK_W, left: at(MARK_W) }}
			animate={{
				opacity: [0, LANE_PEAK, LANE_PEAK, 0],
				width: [MARK_W, MARK_W, MARK_W, MARK_THIN],
				left: [at(MARK_W), at(MARK_W), at(MARK_W), at(MARK_THIN)],
			}}
			exit={{ opacity: 0, transition: { duration: still ? 0 : 0.24, ease: ARRIVE } }}
			transition={
				still
					? { duration: 0 }
					: {
							duration: LANE_LIFE,
							times: [0, LANE_IN / LANE_LIFE, LANE_HELD / LANE_LIFE, 1],
							ease: ["easeOut", "linear", "linear"],
						}
			}
			aria-hidden="true"
		/>
	);
}
