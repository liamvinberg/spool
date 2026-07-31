import {
	AnimatePresence,
	animate,
	motion,
	type MotionValue,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from "motion/react";
import { useEffect } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { WISP_W } from "../../../shared/lib/wisp-taper";
import { REEL_BOX } from "../../../shared/ui/spool-wisp-marks";
import { type BlockId, type Box, layout } from "./home-reel";

/**
 * The presence, rebuilt out of `reel` — spool's own rail mark, docked to a frame.
 *
 * `agent-hand--spool` took one idea out of the thread vocabulary, tension, and proved
 * it beats ink. This takes the next step the vocabulary was always going to be asked
 * for: `shared/ui/spool-wisp-marks.tsx` holds seven fully worked marks with measured
 * boxes and argued durations, `spool-ribbon-mark.tsx` holds three more and
 * `spool-spun-rail.tsx` six, and **not one of the sixteen had ever been drawn outside a
 * 420px rail.** So the question is not which is prettiest. It is which of them is still
 * a mark once it is docked to a rectangle that zooms, in a 44px gutter, beside a
 * neighbour, under the frame's own name, with a walk graph running through it.
 *
 * One survives. This file is that one, and the header records the other fifteen because
 * the inventory is worth as much as the drawing.
 *
 * ## Why `reel`, in one sentence
 *
 * **It is the only mark on either row with a part that does not move.** A 1.5px core is
 * present at every state and every strength; the three threads leaving it are the work.
 * Everything else in the vocabulary is motion end to end, and a mark that is entirely
 * motion cannot dock — it can only run, which is a rail's job and never a canvas's.
 *
 * ## What each of the other six wisp takes did when it came outdoors
 *
 * **`waist`** — five 1.4px strokes at 1.4px gaps whose only channel is where the pinch
 * is. The pinch *is* the loop: sliding the waist along the cascade needs continuous
 * motion or it is one static shape saying nothing. This family bans idle animation
 * (a canvas of five frames with a spinner on one is a canvas with an alarm on it), so
 * the channel is gone before the smudge at 39% zoom is even an argument.
 *
 * **`cross`** — two tapered strokes scissoring. Fatal and specific: an X pinned to the
 * edge of a rectangle is the universal remove control, and this canvas already spends
 * ✕ on chips and on a frame's own delete. Nothing in the rail sits next to a close
 * button; every frame out here is one. Its four states are also four rates and angles,
 * which need the loop.
 *
 * **`drift`** — the cascade shears and the lean is the state. Its frozen silhouette is
 * genuinely the strongest fallback on the row, and it still loses, on a collision the
 * rail could not have. A lean is a claim about *direction*, and the only other thing in
 * this gutter is the walk graph, whose arrowheads cross it pointing the same way. Two
 * direction claims nine pixels apart, one of them a link and one of them not.
 *
 * **`hank`** — two strokes and thread moving between them. It is 6px tall. Docked to a
 * 329px wall it does not read as being *about* the frame, it reads as debris in the
 * gutter: the rail's marks are sized against a 26px transcript row and the canvas's
 * subject is fifty times taller than that. Its conservation also answers a question
 * about a whole thread — how far along the conversation is — and one frame inside one
 * turn has no two bundles.
 *
 * **`slit`** — three slots with light passing behind. The only take in the vocabulary
 * that cannot exist without motion at all: freeze it and its own frame says `sent` and
 * `working` collapse to a narrow bright patch and a wide one. The no-idle rule deletes
 * it outright, with nothing left over.
 *
 * **`nib`** — one tapered wedge whose reach is the state. It survives the move, and
 * that is the problem: it is `agent-hand--spool`'s thread with the wall run taken off,
 * so it has no way to say the *kind* of hold, which is the one channel this family has
 * kept through six frames. Drawing it would be drawing a subtraction.
 *
 * ## And the other nine, which fail in two clean groups
 *
 * **`spool-ribbon-mark.tsx` — `StrandStack`, `MaskedMark`, `SpunMark`** all draw the
 * real nine-strand logo, and they fail on a rule that is not about drawing. In the rail
 * the mark sits in spool's chrome beside spool's transcript. Out here the rectangle
 * belongs to kaffe, and spool's own logo docked to it is spool signing somebody else's
 * work. The measurement seconds it: `MARK_H` is 30 because 30 is where the nine strands
 * separate, and the whole assembly already claims 23 of the gutter's 44.
 *
 * **`spool-spun-rail.tsx` — `wind`, `slack`, `hair`, `pass`, `wound`, `tell`** are all
 * edge takes, and their founding economy is that *the line is already on screen*: each
 * replaces the composer's own `border-t` and gives up zero pixels. Outdoors there is no
 * line already on screen. The nearest thing is the frame's own 12px-radius border, and
 * drawing on that is the selection ring `agent-hand--ghost` killed. `wound` is the
 * instructive one: *the composer is the spool and the thread winds around it* ports
 * perfectly as a sentence — the frame is the spool — and lands on a closed rectangle
 * outside a frame, which is `Slot`'s ring at `inset: -1`. The metaphor arrives and the
 * drawing cannot.
 *
 * **`slack` is the near miss and it is already here.** A line that bows under what it
 * is carrying, depth as backlog, a fallback identical to the take. It does not survive
 * as a *candidate* because `agent-hand--spool` ported it eight frames ago without
 * naming it: a slack thread lying off the wall in a low serpentine is `slack`'s bow,
 * drawn as the absence of tension. The vocabulary had already crossed once.
 *
 * ## What the port actually costs, measured
 *
 * **The aspect ratio does not survive and the numbers do.** `REEL_BOX` is 16 by 11 —
 * near enough square. The dock is 15 wide by 329 tall. So the mark cannot simply be
 * placed: the core stretches to the wall's own hold length and the three threads stay a
 * group at the mark's own proportions, sitting where `agent-hand--presence` put its 7px
 * head. The reaches are the rail's own three spans as fractions of `WISP_W`
 * (0.8625, 0.5875, 0.7375, long-short-long), so the taper is in the lengths exactly as
 * the take intends.
 *
 * **The stroke is not scaled, and that is a re-proportioning rather than a resize.**
 * 1.5px is a reading-distance weight in a rail; at canvas distance this family has
 * settled on 2. The core is 2 and a thread is 1.8, so the mark is drawn at the rail's
 * *proportions* and this canvas's *weights*. Ink: the 7px head was 49px² of solid
 * block; the reel is 31px² of stroke in an 11 by 7 box. **Less ink, more shape.**
 *
 * **The gutter is wider than the rail's column and poorer.** The rail gives a mark an
 * exclusive 16px; the gutter is 44 and holds the lane, the plate, the corners and the
 * walk graph. Capping the budget at 7px of reach is what keeps the whole assembly at
 * the compile's own 23 of 44 rather than widening it, because 7 plus the core's half
 * width is exactly the plate's own half width.
 *
 * ## The one channel that came out worse, said plainly
 *
 * A write flicks the group flush to the budget and back, so the cascade goes square for
 * a quarter second and returns. The throw is **0.96, 2.89 and 1.84 pixels** — the taper
 * makes the event loudest on the short thread and nearly silent on the long one. That
 * is the borrowed proportion working against the channel it is carrying, and it is the
 * only place in this frame where the identity costs something rather than paying.
 *
 * ## What the compile has been standing on since `--presence`, and never measured
 *
 * The presence anchors at the frame's vertical centre, `mid` = 210.5. The outgoing walk
 * edge leaves at `x + w + 3`, `ROW_1 + 158` and curves to the next frame's arrowhead;
 * solved against the stand-off line at x 477 it crosses at **y 210.1**. The presence's
 * anchor and an accent-coloured connection between two frames are **0.4 pixels apart**,
 * and they have been in every frame of this family — `--presence`'s 7px head straddled
 * it, `--spool`'s core straddled it, the compile's shut plate straddles it. Nothing here
 * fixes it: moving the anchor breaks the comparison the whole family rests on. Drawing
 * the reel there is what made it visible, because three threads reaching into the
 * gutter are wide enough to be crossed rather than merely touched.
 *
 * ## What is inherited without change
 *
 * The lane, the corners, the ladder and the stand-off are the compile's, down to the
 * constant. `OUT` is still 15 and the corners still strike the frame's own name at
 * y 29 to 41, because that number is forced by the plate's width and not by the
 * presence — a different presence cannot buy it back.
 *
 * ## What is changed, and why it is not a channel dropped
 *
 * **The plate has no shut state here.** In the compile, shut, it *is* `--presence`'s
 * head — and the compile's own verdict was that the grip and the thread were one organ
 * drawn twice. The core is the participant now, so a second 9px node three pixels above
 * it saying the same thing is that redundancy again with a new face. The plate is absent
 * between calls and unrolls out of the core when one opens, which also makes the object
 * one thing rather than two: **the plate is the core, unwound.**
 */

/* ---------- what the hand is doing ---------- */

/** the wall's whole height, or a segment of it */
export type Hold = "whole" | "part";

/** one write, still on the wall */
export interface Trace {
	/** the block, and which write put it there — a second write to one block restarts the mark rather than stacking */
	readonly key: string;
	readonly block: BlockId;
	/** the block's box at the revision the write made, which is the revision the canvas is now showing */
	readonly box: Box;
}

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** writes landed so far in a run, so the plate counts the way the row counts */
	readonly count: number;
	/** the `shot` call is open: the ink leaves the wall and goes to the corners */
	readonly picturing: boolean;
	/** every block a landed write named, newest last */
	readonly traces: readonly Trace[];
}

/**
 * Which verbs change the frame, and which only take it in.
 *
 * Three postures absorb five verbs, inherited from every frame in this family without
 * argument. This capture plays `write`, `shot`, `look`, `logs` and `edit`; `read`, which
 * it happens not to contain, lands in the posture it already belongs to with nothing new
 * drawn.
 */
const HOLD: Record<string, Hold> = { write: "part", edit: "part" };

/**
 * Where the agent is and what it has left behind, read off the same rows the rail reads.
 *
 * When no call is open the hand falls back to the last row that had one: the agent is
 * between calls and has not gone anywhere, so the object keeps its posture and lets its
 * thread back in. That state is **21.6 of this turn's 37.7 seconds** — eleven gaps, the
 * shortest 819ms and the longest 4.1s — and it is the whole reason `reel` is the take
 * that ported. The rail's rarest picture, `sent`, is the core with nothing off it; out
 * here it is what the canvas looks like most of the time.
 */
export function handOf(script: Script, turn: Turn, lands: readonly BlockId[]): Hand | null {
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
 * The writes that have landed, one mark per block, each carrying the box the block had
 * at the moment its write made it.
 *
 * **Compiled with the write clock, one of `--accrue`'s costs disappears.** There, and in
 * `agent-hand--ghost-loud`, a mark laid down at write 2 was level with a page the canvas
 * would not draw until write 6, because the rectangle was a photograph. Here the frame
 * redraws on every write, so the box a mark is level with and the box on screen are the
 * same box. The lane stopped being a claim about a page nobody could see.
 *
 * Two things are deliberately not marked. `write home` at 117ms is `frames/home/frame.json`,
 * so geometry moved the rectangle and left the design alone. And a block written twice
 * carries one mark that restarts rather than two stacked: the wall says *here, again,
 * just now*, and how many times is the plate's and the rail's.
 */
function tracesOn(script: Script, turn: Turn, frame: string, lands: readonly BlockId[]): readonly Trace[] {
	const latest = new Map<BlockId, number>();
	let index = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) {
			const block = lands[index];
			index += 1;
			if (block === undefined || !turn.at(child.cue)) continue;
			latest.set(block, index);
		}
	}
	return [...latest].map(([block, nth]) => ({ key: `${block}:${nth}`, block, box: layout(nth)[block] }));
}

/* ---------- the field's geometry, copied ----------
 * `spool-play-field.tsx` has no slot for another layer and shared/ is not this frame's
 * to change, so everything here is a sibling of the field drawn in the same coordinates.
 * That holds exactly as long as the camera is still, which is why this frame never
 * centres on anything. */

const COLS = [114, 310, 506] as const;
const ROW_1 = 46;
const FW = 152;
const FH = 329;
/** the frame's own corner, so the corners can be struck concentric with it */
const RADIUS = 12;
/* the frame's name sits 22px above it in a 22px row, so its 12px line box runs y 29 to
 * 41 — the number the corners have to clear and cannot */
/** what a frame is authored at, so a block's box becomes a height on the wall */
const NAT_W = 240;
const S = FW / NAT_W;
/** the canvas viewport: 1440 less the 248 Pages rail and the 420 agent rail */
const VIEW_W = 772;

/* ---------- the stand-off, inherited ---------- */

/**
 * How far outside the wall the presence's core sits.
 *
 * Unchanged from the compile at **15**, and the arithmetic is unchanged with it: the
 * plate is 16 wide so it claims the centre ± 8, the lane claims the 5 pixels nearest the
 * frame, and two pixels of air between them is the least that keeps them from reading as
 * one object. The reel is cheaper than the head it replaces and it cannot buy this back,
 * because the number is the plate's rather than the presence's. So the corners are still
 * struck at y 31 and still run through the frame's own name.
 */
const OUT = 15;
/** the family's own weight, and the core carries it */
const CORE = 2;
const PART = 76;
const PLATE_W = 16;

/* ---------- the reel, at canvas proportions ---------- */

/**
 * The three reaches, as the rail's own spans over the rail's own width.
 *
 * `REEL_RUNS` is 13.8, 9.4, 11.8 in a 16px box and is not exported, so it is written out
 * here as fractions with its source named. Long, short, long: the cascade in three, which
 * is the whole of what the mark borrows from the identity.
 */
const SHARE = [13.8 / WISP_W, 9.4 / WISP_W, 11.8 / WISP_W] as const;

/**
 * The reach budget, and it is what keeps the assembly the compile's width.
 *
 * 7 plus the core's own half width is 8, which is exactly the plate's half width — so
 * the longest thread stops on the plate's own outer line and the object claims
 * `OUT + PLATE_W / 2` = **23 of the gutter's 44**, the same as the compile. A budget one
 * pixel wider and the presence, rather than the plate, becomes the widest thing on this
 * wall, and every number in the stand-off moves.
 */
const REACH = 7;
/** a thread's weight: below the core, above the rail's 1.5, which is a reading-distance number */
const THREAD_H = 1.8;
/** the rail's own stroke-to-pitch ratio, 1.5 to 3.55, carried onto a 1.8 stroke */
const PITCH = 4.3;
const GROUP_H = 2 * PITCH + THREAD_H;

/**
 * How far in the threads go when nothing is open.
 *
 * Not zero. `reel`'s `sent` is *the core, and nothing off it*, and the rail draws it as
 * a quiver at the root rather than as an absence, because a mark that vanishes has left
 * rather than waited. At 0.16 of a share the three stubs are under a pixel each: enough
 * that the core reads as a core with three nodes on it, not enough to be a shape.
 */
const IN = 0.16;

/**
 * The envelope, and it is the whole answer to a 186ms call.
 *
 * `agent-hand--spool`'s numbers, carried onto reach instead of amplitude. Thread pays out
 * on the instant and comes back slowly, which is what thread does. Five of the twelve
 * calls in this window run under 320ms, so a symmetric channel toggles twelve times in
 * 37.7 seconds and blinks. At 90 on and 320 off a burst of short calls never draws in,
 * and only a real gap reads as one.
 */
const OUT_MS = 0.09;
const IN_MS = 0.32;
/** one write: the cascade goes square and returns */
const FLUSH_MS = 0.24;

const INK = 0.78;

/* ---------- the plate, the lane, the corners ---------- */

/**
 * The plate open, at the compile's own measurement and its own unsolved problem.
 *
 * `--plate` fixed the box at 38 on a closed vocabulary: `label()` in `claude-turn.ts`
 * holds seven verbs, `write` is the longest at 30.9px in 10px Fragment Mono, and 30.9
 * plus 3.5 of air each end is 38. **The plate never resizes** was the whole of what it
 * bought over a chip. With the count, `edit ×6` is seven glyphs at 43.3px and wants 51 —
 * and 51 is not a bound either, since `edit ×13` wants 56. Inherited unresolved, because
 * this frame is varying the presence and not the receipt.
 */
const MONO_2XS = 6.18;
const PLATE_PAD = 3.5;
const PLATE_H = Math.ceil("edit ×6".length * MONO_2XS + 2 * PLATE_PAD);
const PLATE_MS = 0.2;
/** the air between the plate's foot and the reel's top edge */
const PLATE_GAP = 3;

/* the lane's own claim, against the frame's edge and inside everything else */
const MARK_IN = 2;
const MARK_W = 3;
const MARK_THIN = 1;

/** how far past the arc each corner arm runs */
const ARM = 11;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * How long a write stays on the wall, and the beat it holds at full before it goes.
 *
 * Re-derived against the write clock rather than inherited: a mark has to outlive the run
 * that made it, and the longest run spans **4.835s** (7153 to 11988); two runs have to
 * stay apart, and the shortest gap between runs is **6.138s** (24203 to 30341). Six sits
 * inside [4.835, 6.138] with room at both ends, which is where `--accrue` put it and
 * where the write clock independently puts it again.
 */
const LIFE = 6;
const RISE = 0.08;
const HELD = 0.7;
const PEAK = 0.9;

/**
 * How wide a frame must draw before the canvas mounts its document — `src/cover.ts:8`,
 * enforced at `lifecycle.ts:245` as `frame.w * camera.k < LIVE_MIN_CSS_PX`.
 *
 * The lane's heights are the one thing here needing a live document: below this there is
 * no DOM to resolve a write's line against, so a mark's y cannot be obtained and the
 * correct degrade is no lane. Every other channel is drawn by the canvas outside the
 * iframe and is true at any zoom.
 */
const LIVE_MIN_CSS_PX = 400;

export function laneLives(drawn: number): boolean {
	return drawn >= LIVE_MIN_CSS_PX;
}

/**
 * The one fiction in this frame, named at the line that introduces it.
 *
 * `spool-play-field.tsx` draws every frame at 152px, so `laneLives(152)` is false and the
 * honest lane here is no lane. `--accrue` overrode that on purpose because a frame that
 * correctly draws nothing cannot be judged, and the compile inherited it. Inherited again,
 * with the same reason: everything about the lane is true at canvas zoom except the
 * heights, and the heights need a document.
 */
const DIAGRAM = true;

/**
 * What the whole assembly claims of the gutter it docks in: `OUT + PLATE_W / 2` = 23 of
 * 44, plus six of air, which is what a wall needs before it can hold a word.
 */
const NEED = 29;

export type Side = "left" | "right";

/**
 * Which wall.
 *
 * The tie breaks right, which is `--accrue`'s one-character fix. A walk arrow's head lands
 * on a frame's **left** wall — `spool-play-field.tsx` draws it at `x - 9`, `ROW_1 + 186` —
 * so on a frame with equal gutters, breaking left would park the lane, the core and a 16px
 * plate underneath an accent triangle. Breaking right leaves them on the wall the outgoing
 * edge only crosses, and that crossing is measured in this file's header.
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
 * the other.
 *
 * `--ghost` established that a closed rectangle outside a frame is a selection ring —
 * spool's own `Slot` draws that exact shape at `inset: -1` — and held for the 670 to 750ms
 * a `spool shot` takes it will be read as one. So it is four corners, and a corner is not
 * a ring at any weight because it is not closed.
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
 * The core, as a path so it can wind on and off rather than fade.
 *
 * Dead straight, always, which is the change `reel` makes to `--spool`. There the one line
 * carried both channels: length was the hold and a serpentine amplitude was the tension.
 * Here **tension moves off the core and onto what is paid off it** — which is what a bobbin
 * actually is, and what buys the mark its stationary part. The core says only *the agent is
 * here, holding this much of the wall*, and it never changes shape.
 */
function core(length: number, line: number, mid: number): string {
	if (length < 1) return "";
	const half = length / 2;
	return `M ${line} ${(mid - half).toFixed(2)} L ${line} ${(mid + half).toFixed(2)}`;
}

/**
 * The rung the object is drawn on, which is `--roster`'s ladder.
 *
 * The object lands on the smallest thing on screen containing the frame: the frame itself,
 * else its row in the Pages rail, else its page's row, else the collapsed strip, else
 * nothing. **On this canvas the first rung always holds**, so it costs zero pixels and zero
 * information — and it is still the only channel that survives the camera moving, because
 * panning `home` out of view kills every other one in the same frame.
 */
export type Rung = "frame" | "row" | "page" | "strip";

export function rungOf(frame: string, drawn: readonly string[]): Rung | null {
	if (drawn.includes(frame)) return "frame";
	return null;
}

/**
 * The layer, over the field.
 *
 * The whole answer to travel is still the `key`. A presence keyed on the frame it is at
 * cannot move between two frames: it lets go here and takes hold there, both at once,
 * because that is what the wire says. A reel makes the temptation worse than a thread did —
 * thread paying off a core is exactly the object somebody would want to run to the next
 * frame — and it is refused for the family's reason, which is that a path between two
 * frames is only drawable when the camera happens to hold both.
 */
export function ReelLayer({ hand, base }: { hand: Hand | null; base: readonly string[] }) {
	const index = hand === null ? -1 : base.indexOf(hand.frame);
	const rung = hand === null ? null : rungOf(hand.frame, base);
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			<AnimatePresence>
				{hand === null || index === -1 || rung !== "frame" ? null : (
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
	const out = dock.side === "left" ? -1 : 1;
	const wallX = dock.side === "left" ? box.x : box.x + box.w;
	const line = wallX + out * OUT;
	const mid = box.y + box.h / 2;
	const trace = corners(box);
	const live = hand.verb !== null;
	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;

	// the plate grows up out of the reel's top edge, so the two never overlap and the
	// object stays one column. It has no shut state here: shut, it was `--presence`'s
	// head, and the core is the participant now
	const foot = mid - GROUP_H / 2 - PLATE_GAP;

	// three numbers and one line. Length is the hold and moves at the pace a posture
	// changes; `paid` is the pull and moves at the pace a call opens; `flush` is the event
	const length = useMotionValue(held);
	const paid = useMotionValue(live ? 1 : 0);
	const flush = useMotionValue(0);
	const path = useTransform(length, (value: number) => core(value, line, mid));

	useEffect(() => {
		const run = animate(length, held, { duration: still ? 0 : 0.22, ease: ARRIVE });
		return () => run.stop();
	}, [held, length, still]);

	useEffect(() => {
		const run = animate(paid, live ? 1 : 0, {
			duration: still ? 0 : live ? OUT_MS : IN_MS,
			ease: live ? "easeOut" : "easeInOut",
		});
		return () => run.stop();
	}, [live, paid, still]);

	// a write pays every thread out to the budget and takes it back, so the taper flattens
	// for a quarter second and returns. It is the reel's own pay-out driven by the wire
	// instead of by a timer, which is the whole of how a looping rail mark becomes a canvas
	// mark: the loop was never the mechanism, it was the stand-in for an event
	useEffect(() => {
		if (hand.count === 0 || !live || still) return;
		const run = animate(flush, [1, 0], { duration: FLUSH_MS, ease: "easeOut" });
		return () => run.stop();
	}, [hand.count, live, flush, still]);

	const word = hand.verb === null ? "" : hand.count > 1 ? `${hand.verb} ×${hand.count}` : hand.verb;

	return (
		<>
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
				fill="none"
				aria-hidden="true"
			>
				{/* the core. It arrives and leaves by winding off and back onto its own middle
				    rather than by fading, so taking hold and letting go are the same gesture in
				    two directions */}
				<motion.path
					d={path}
					stroke="var(--color-text)"
					strokeOpacity={INK}
					strokeWidth={CORE}
					strokeLinecap="round"
					initial={{ pathLength: 0, pathOffset: 0.5 }}
					animate={{ pathLength: 1, pathOffset: 0 }}
					exit={{ pathLength: 0, pathOffset: 0.5 }}
					transition={{ duration: still ? 0 : 0.24, ease: ARRIVE }}
				/>
				{/* the `shot` posture: four corners, struck from the same stand-off the plate is
				    centred on, which is what puts the top rail through the frame's name */}
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
			{/* the three threads, paying off the core */}
			{SHARE.map((share, at) => (
				<Payout
					// biome-ignore lint/suspicious/noArrayIndexKey: a thread's place in the cascade is its identity
					key={at}
					share={share}
					top={mid - GROUP_H / 2 + at * PITCH}
					line={line}
					out={out}
					paid={paid}
					flush={flush}
					gone={hand.picturing}
					still={still}
				/>
			))}
			{/* the lane: the writes, where they landed, going out on their own clocks. It needs a
			    live document to know a height, so below 400 drawn pixels the honest drawing is
			    nothing at all and this is the frame overriding that on purpose */}
			{laneLives(FW) || DIAGRAM
				? hand.traces.map((mark) => (
						<Mark key={mark.key} mark={mark} box={box} wall={wallX} side={dock.side} still={still} />
					))
				: null}
			{/* the plate: the word the open call is, with its count. It unrolls out of the core
			    and rolls back in, so there is never a second node on this wall saying what the
			    core already says */}
			<AnimatePresence>
				{live ? (
					<motion.span
						key="plate"
						className="absolute overflow-hidden rounded-[2px] border border-muted bg-canvas"
						initial={{ width: CORE, height: 0, left: line - CORE / 2, top: foot, opacity: 0 }}
						animate={{ width: PLATE_W, height: PLATE_H, left: line - PLATE_W / 2, top: foot - PLATE_H, opacity: 1 }}
						exit={{ width: CORE, height: 0, left: line - CORE / 2, top: foot, opacity: 0 }}
						transition={{ duration: still ? 0 : PLATE_MS, ease: ARRIVE }}
					>
						{/* the word runs bottom to top, which is what lets it live in a 16px column. It
						    cuts when one verb replaces another, because at 10px a crossfade is two words
						    on top of each other and neither is readable */}
						<motion.span
							className="absolute whitespace-nowrap font-mono text-2xs text-text leading-3"
							style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(-90deg)" }}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: still ? 0 : 0.1, ease: "linear" }}
						>
							{word}
						</motion.span>
					</motion.span>
				) : null}
			</AnimatePresence>
		</>
	);
}

/**
 * One thread, paying off the core.
 *
 * The element is the full budget wide and never resizes: `scaleX` about the core's own
 * edge is the reach, which is one composited transform and the same mechanism
 * `spool-wisp-marks.tsx` uses. Two motion values feed it — how far out the state says it
 * should be, and how flush the last write pulled it — so a write landing mid-call rides
 * over the state rather than fighting it.
 *
 * The taper is the *destination* rather than the drawing: the three sit at 6.04, 4.11 and
 * 5.16 pixels of the 7px budget, long-short-long, which is the mark's own cascade.
 */
function Payout({
	share,
	top,
	line,
	out,
	paid,
	flush,
	gone,
	still,
}: {
	share: number;
	top: number;
	line: number;
	out: number;
	paid: MotionValue<number>;
	flush: MotionValue<number>;
	gone: boolean;
	still: boolean;
}) {
	const scaleX = useTransform([paid, flush], (latest: number[]) => {
		const at = latest[0] ?? 0;
		const square = latest[1] ?? 0;
		// the cascade's own share, opened to the full budget by a write, then damped by how
		// far out the state has the group
		return (share + (1 - share) * square) * (IN + (1 - IN) * at);
	});
	return (
		<motion.span
			className="absolute block rounded-[1px] bg-text"
			style={{
				top,
				left: out === 1 ? line + CORE / 2 : line - CORE / 2 - REACH,
				width: REACH,
				height: THREAD_H,
				transformOrigin: out === 1 ? "left center" : "right center",
				scaleX,
			}}
			initial={{ opacity: 0 }}
			animate={{ opacity: gone ? 0 : INK }}
			exit={{ opacity: 0 }}
			transition={{ duration: still ? 0 : 0.2, ease: ARRIVE }}
		/>
	);
}

/**
 * One write, on the wall, going out.
 *
 * It mounts when its cue fires, so the clock is the capture's own and no ticker is in the
 * path — which matters, because `useTicker` moves at 100ms and a six-second fade driven off
 * it would step ten times a second.
 *
 * Ink carries the age, width carries it again so a stale mark reads as residue rather than
 * as a live mark somebody drew faintly, and the mark thins toward the frame, so what recedes
 * is the part furthest from the thing it is about. The decay is linear after a 0.7s hold at
 * full, because the one thing the lane has to keep legible is the order of a run.
 *
 * **Ink on this wall means two things now rather than three.** Age here, and reach on the
 * threads eight pixels out. The plate stopped carrying open-or-shut as ink the moment it lost
 * its shut state, which is one meaning off a channel the compile had loaded three deep.
 */
function Mark({
	mark,
	box,
	wall: wallX,
	side,
	still,
}: {
	mark: Trace;
	box: { x: number; y: number; w: number; h: number };
	wall: number;
	side: Side;
	still: boolean;
}) {
	const top = box.y + mark.box.y * S;
	const height = Math.max(4, mark.box.h * S);
	const inner = side === "left" ? wallX - MARK_IN : wallX + MARK_IN;
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

/**
 * What the rail mark was, and what the dock is, printed rather than claimed.
 *
 * `REEL_BOX` is the one number `spool-wisp-marks.tsx` exports about this take, and the
 * distortion it names is the whole finding: a mark authored 16 by 11 is being asked to live
 * in 15 by 329.
 */
export const RAIL_BOX = REEL_BOX;
export const DOCK_BOX = { w: OUT, h: FH } as const;
