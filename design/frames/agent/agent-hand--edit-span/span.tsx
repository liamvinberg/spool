import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import type { Script, ToolRow } from "../../../shared/lib/claude-turn";
import type { Turn } from "../../../shared/lib/turn-play";
import { type BlockId, type Box, LANDS, UNSTAMPED } from "./kaffe-page";
import { type FrameSlot, SCALE, SLOTS } from "./span-field";

/**
 * The edit channel, and the two objects it shares a wall with.
 *
 * **A write is a pair of rules crossing the frame at the top and bottom of what
 * changed.** Nothing sits in the gutter counting; nothing decays for six seconds. The
 * mark lands on the thing it is about, and the reader's eye goes to a height rather
 * than to an edge and then back again.
 *
 * ## The four decisions, and the numbers behind them
 *
 * **It brackets from outside, so it covers no pixel of the block it names.** A rule at
 * a block's own centre strikes the text; a rule on the block's edge lands in the line
 * box's leading, which at 34% is under a pixel of clearance. Both rules therefore sit
 * *outside* the box, in the seam between two blocks. The smallest seam on either page
 * is 8 authored pixels, which is 4.4 drawn, against a 2px rule. **The occlusion of
 * content is zero, in every state, on both frames** — what a span covers is the gap the
 * layout already left empty. `--inside` could not say that: its worst sustained mark was
 * a 4% wash over the whole design and its worst momentary was the accent at 16% over
 * 24% of the height.
 *
 * **What bracketing costs is that a seam belongs to two blocks.** The rule above the
 * lede is also the rule below the headline, and on the phone the two are 6.6 drawn
 * pixels apart. A lone rule is therefore ambiguous by construction and only the pair
 * resolves it — which is fine while both are up, since they arrive and leave together,
 * and is the reason a span is never one line. It does mean the object cannot be read
 * from a fragment, and an edge lane could be.
 *
 * **The whole mark is 1.40% of the phone's pixels and 1.31% of the desktop's**, two
 * rules 2px tall running the frame's width, and it is 0.63% and 0.59% once the ink is
 * priced in. The worst moment in the turn is 9,331ms, where the lede's span and the
 * button's span are both up for **287ms** — writes 2 and 3, 573ms apart, the tightest
 * gap in the capture. Two spans and never three: the shortest two consecutive gaps sum
 * to **1,166ms** and a span lives 860. So the worst moment is **2.80% of the phone's
 * pixels struck, 1.26% in full ink**, and that is the number to judge, not the 1.40%.
 *
 * **It runs the frame's width and 6 pixels past each wall, and it stops there.**
 * Continuing across the canvas was the tempting version and it is wrong on this very
 * canvas: write 1 lands in the headline, which is at authored y 38 on the phone and
 * y 92 on the desktop. A canvas-wide rule struck at the phone's height crosses the
 * desktop frame at authored y 38 — **inside its top bar**, a block that did not change,
 * in the one case where the neighbour did change and a correct mark existed 33 pixels
 * lower. A rule long enough to tie two frames together is long enough to be wrong about
 * the second one.
 *
 * The 6px overshoot stays, and it earns its keep: it is the only thing that says the
 * rule belongs to the canvas rather than to the page. A hairline that stops exactly at
 * the wall is a divider the designer might have drawn. One that visibly leaves the
 * frame cannot be. It feathers to nothing at its tip, which is not decoration — see
 * below.
 *
 * **The rule is bright over the block and faint everywhere else.** One line, two ink
 * levels: 0.45 across the block's own x-range and 0.12 across the rest. That is the
 * whole answer to the desktop, and the section below is why it was needed.
 *
 * ## What the desktop does to a horizontal span
 *
 * A phone page is one column, so a height names a block and nothing else. Measured
 * across the thirteen writes: **a rule at a write's height crosses a block that did not
 * change 0 times out of 13 on the phone and 7 times out of 11 on the desktop** — eleven
 * because two of the thirteen cannot say where they landed at all. Six of those seven
 * cross the hero photograph, which occupies the same 220 authored pixels of height as
 * the headline, the lede and the button put together, in the next column over.
 *
 * So the honest answer to *does a horizontal span survive a desktop layout* is **no,
 * not on its own.** The repair had to keep the object a span. Two candidates:
 *
 *   - **Add verticals.** Two more rules at the block's left and right edges, the change
 *     at their crossing. It works, and it costs what the direction was built to save: a
 *     vertical runs the frame's full height, so it crosses every band on the page and
 *     the mark stops being a thing you read at a glance and becomes a coordinate you
 *     construct. It also more than doubles the occlusion, 1.40% to 4.39% on the phone,
 *     and every added pixel lands on content rather than on a seam.
 *   - **Modulate the one rule.** The line stays continuous wall to wall and changes ink
 *     where the block is. Nothing is added, nothing new crosses anything, and the mark
 *     is still one glance.
 *
 * The second one ships. What it buys is measurable: the bright segment is **83% of the
 * rule's length on the phone and 58% on the desktop**, and on the phone that modulation
 * is close to invisible, which is correct — on a phone there is nothing to say about x.
 * The button is the exception that proves it works at all: 92 of 240 authored, so even
 * on the phone the bright part is 38% of the line.
 *
 * **What it does not buy back.** On the desktop the faint segment is still drawn across
 * the hero, and a person who reads the line rather than the bright part of the line
 * reads it as pointing at both. The direction's own pitch was that an edge lane makes
 * you look at the edge and then work out what it points at; on a desktop this mark makes
 * you look at the line and then work out which part of it is the claim. **The reading
 * step is not removed on a wide page, it is moved.** That is the finding and it is not a
 * favourable one.
 *
 * ## The two writes that cannot say where they landed
 *
 * Writes 7 and 8 add the menu by editing hoisted constants, so the stamp resolves them
 * to the frame's own root. A span whose block is the frame is **two rules on the frame's
 * top and bottom edges, bright end to end**, which is the same object drawn from the
 * same box and needs no special case. It is legible as the coarse claim it is because it
 * is the only span whose bright segment is the whole line.
 *
 * **This is where a span beats a lane, and by more than expected.** `--ghost-lane`
 * measured its two unstamped writes at **41.1% of everything the lane drew**, because a
 * lane over-claiming has to *grow* — a located mark is 30 pixels of wall and the root
 * claim is all 329. A span over-claiming only brightens: the same two rules, the same
 * two pixels of height, one ink level up. Priced the same way, they are **17.6% of this
 * frame's ink on the phone and 22.2% on the desktop**. The over-claim is real and it is
 * roughly half as expensive, structurally rather than by tuning.
 *
 * And they cover nothing: the frame's own top and bottom edges are outside the design,
 * so the least certain mark in the vocabulary is also the one that hides the least.
 *
 * ## Two tones, because one ink cannot cross both grounds
 *
 * The canvas is `#161616` and the page is `#FEFEFE`, and this mark crosses the wall
 * between them in a single stroke. `--accrue`'s lane and `--presence`'s grip never had
 * this problem: they are outside the frame, so `bg-text` at `#F0EFED` is the whole
 * answer. Inside, that ink is the paper.
 *
 * **`--inside` solved it by spending the accent, and the accent is not available** — it
 * is the human's selection and this family does not paint with it. So the rule is two
 * 1px lines of opposite tone stacked, white and black at the same alpha: the white
 * carries the stroke over the canvas and the black carries it over the page, and each is
 * invisible where the other is doing the work. The mark is 2 physical pixels tall and
 * one of them always reads.
 *
 * Two things fell out of drawing it. The ink tone is put on the side facing the block,
 * so the visible line is flush with the block's own edge rather than a pixel off it.
 * And the two tones swap over at the wall, which would step the line by one pixel
 * exactly where it leaves the frame — **so the overshoot feathers to zero at its tip**,
 * and a feather cannot step. The feather was drawn for a compositing reason and reads as
 * restraint, which is luck rather than design.
 *
 * ## Six writes in five seconds
 *
 * Run one lands six writes between 7,153ms and 11,988ms, 573 to 1,605ms apart. Six
 * spans in that window read as jitter if they accumulate and as a pulse if they do not,
 * and the whole difference is one number.
 *
 * **860ms**, and both ends of it are the capture's. The floor is 180: `frame-shell.tsx`
 * fades a rebooted frame's cover out over exactly that, so a mark shorter than the seam
 * is a flash of nothing. The ceiling is **1,166ms**, the smallest sum of two consecutive
 * gaps in the whole turn — a third span alive means the reader is holding three heights
 * at once and the run stops having a shape. 860 clears it by 306ms. Over the thirteen
 * writes there are four overlaps and the longest is 287ms; **two spans are alive at
 * once, never three, and for 3.3% of the turn.**
 *
 * What that costs is the run. `--accrue`'s marks stood for six seconds so a run left a
 * shape on the wall you could read after it finished, and this leaves nothing: a span is
 * a pointer, not a ledger. The rail counts (`edit home ×6`) and `--accrue` owns
 * accrual. Spending the same channel on both was the thing `--ghost-loud` found three
 * of, nine pixels apart.
 *
 * A single mark that *moves* to each new block was drawn first and cut. Six moves in
 * 4,835ms is a mean of 806ms a move, and a rule sliding the length of a page over body
 * copy is exactly the jitter the shorter life was chosen to avoid. A struck-and-gone
 * rule travels nowhere.
 *
 * ## The wall, and what removing the lane gave back
 *
 * The thread and the plate are `--ghost-loud`'s, minus its count. Taking the lane off
 * this wall un-contests the stand-off it was forcing: the plate is 16 wide and wants 2px
 * of air, so the centre stands at **10** against the compile's 15 and `--accrue`'s 12.
 *
 * That is not enough on its own — the corners are struck from the same number and the
 * frame's name sets in a 12px line box ending 5px above the frame, so any stand-off at
 * or above 6 runs the top rail through it. **So the corners are decoupled and struck at
 * 4**, which clears the name by a pixel. `--ghost-loud` named this escape and priced it
 * as losing the reading that the shot ink is the grip's own leaving the wall; that
 * reading was already spent there, because four corners cannot leave a 16px plate
 * without drawing a rectangle with two gaps in it. So it costs nothing here and it fixes
 * the one collision the compile said had no solution.
 *
 * The count goes for `--ghost-loud`'s own reason: `--plate` bought exactly one thing,
 * that the plate never resizes, and `edit ×6` takes it from 38 to 51 with no upper
 * bound. The word stays, the number is the rail's.
 */

/* ---------- the mark ---------- */

/** how far past each wall the rule runs before it feathers out */
const OVER = 6;
/** two 1px lines of opposite tone: one of them always reads */
const RULE_H = 2;
const BRIGHT = 0.45;
const FAINT = 0.12;

/**
 * How long a span lives, in seconds, and the shape of it.
 *
 * 140 drawing out from the change, 180 held, 540 leaving. The total is bounded below by
 * spool's own 180ms reboot seam and above by 1,166ms, the smallest sum of two
 * consecutive write gaps in this capture, which is what keeps a third span off the
 * frame.
 */
const LIFE = 0.86;
const DRAW = 0.14 / LIFE;
const HOLD = 0.32 / LIFE;

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/** one landed write, and the box it can name */
export interface Span {
	/** the block and the write that put it there, so a second write to one block restarts rather than stacks */
	readonly key: string;
	readonly block: BlockId;
	/** the block's box at the revision the write made, or null where the stamp resolved nowhere */
	readonly box: Box | null;
}

/**
 * How many of the thirteen design writes have landed.
 *
 * The run's children are the calls it collapsed, so this is the same arithmetic
 * `railEntries` does to print `×6`. `write home` at 117ms is `frames/home/frame.json` and
 * is not one of them: geometry moves the rectangle and leaves the design alone, and this
 * is the second channel in the family that is correctly silent there.
 */
export function writesOn(script: Script, turn: Turn, frame: string, cap: number): number {
	let count = 0;
	for (const row of script.rows) {
		if (row.kind !== "tool" || row.frame !== frame || row.verb !== "edit") continue;
		for (const child of row.children) if (turn.at(child.cue)) count += 1;
	}
	return Math.min(count, cap);
}

/**
 * The spans a frame is carrying, one per block rather than one per write.
 *
 * A block written twice restarts its own mark: the claim is *this changed, just now*,
 * and how many times is the rail's. In this capture that happens three times, and all
 * three are consecutive pairs — the button at writes 3 and 4, the menu at 7 and 8, the
 * footer at 9 and 10.
 *
 * The box comes from the layout at the revision the write itself made, which is not the
 * revision on screen once a later write has reflowed the page. On this canvas that
 * distinction is nearly free — a span is gone in 860ms and the next reflow is at least
 * 573 away — and it is the same rule `--ghost-loud`'s lane needed for a much longer life.
 */
export function spansAt(landed: number, layout: (rev: number) => Record<BlockId, Box>): readonly Span[] {
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

/**
 * One rule: bright over the block, faint over the rest of the frame, feathered to
 * nothing 6 pixels outside each wall.
 *
 * The gradient is the whole mechanism. Two hard stops carry the claim and two soft ones
 * carry the ends, so the object is a single element with a single background and no
 * geometry anywhere except the two percentages the block hands it.
 */
function tone(rgb: string, from: number, to: number, span: number): string {
	const at = (px: number) => ((px / span) * 100).toFixed(2);
	const wall = OVER;
	return [
		`linear-gradient(90deg`,
		`rgba(${rgb},0) 0%`,
		`rgba(${rgb},${FAINT}) ${at(wall)}%`,
		`rgba(${rgb},${FAINT}) ${at(from)}%`,
		`rgba(${rgb},${BRIGHT}) ${at(from)}%`,
		`rgba(${rgb},${BRIGHT}) ${at(to)}%`,
		`rgba(${rgb},${FAINT}) ${at(to)}%`,
		`rgba(${rgb},${FAINT}) ${at(span - wall)}%`,
		`rgba(${rgb},0) 100%)`,
	].join(", ");
}

function Rule({ top, span, from, to, inkAbove }: { top: number; span: number; from: number; to: number; inkAbove: boolean }) {
	// the ink tone goes on the side facing the block, so the line a person sees over the
	// page is flush with the block's own edge rather than a pixel off it
	const rows = inkAbove ? ["0,0,0", "255,255,255"] : ["255,255,255", "0,0,0"];
	return (
		<span className="absolute block" style={{ top, height: RULE_H, left: 0, width: span }}>
			{rows.map((rgb, index) => (
				<span
					key={rgb}
					className="absolute block"
					style={{ top: index, left: 0, right: 0, height: 1, backgroundImage: tone(rgb, from, to, span) }}
				/>
			))}
		</span>
	);
}

/**
 * A write, spanning the frame it landed in.
 *
 * Both rules are one element so they draw and leave together, and the element scales out
 * from the centre of its own bright segment — so the mark unrolls from the change rather
 * than from a wall, and on a desktop that origin is the only motion cue that says which
 * part of the line is the claim.
 */
function SpanMark({ slot, span, still }: { slot: FrameSlot; span: Span; still: boolean }) {
	const box = span.box ?? { x: 0, y: 0, w: slot.nat.w, h: slot.nat.h };
	const width = slot.w + OVER * 2;
	const from = OVER + box.x * SCALE;
	const to = OVER + (box.x + box.w) * SCALE;
	// outside the box on both sides, so the pair brackets the block and covers none of it
	const above = slot.y + box.y * SCALE - RULE_H;
	const below = slot.y + (box.y + box.h) * SCALE;
	return (
		<motion.span
			className="absolute block"
			style={{ left: slot.x - OVER, top: 0, width, transformOrigin: `${(((from + to) / 2) / width) * 100}% 50%` }}
			initial={{ opacity: 0, scaleX: 0 }}
			animate={{ opacity: [0, 1, 1, 0], scaleX: [0, 1, 1, 1] }}
			transition={
				still
					? { duration: 0 }
					: { duration: LIFE, times: [0, DRAW, HOLD, 1], ease: ["easeOut", "linear", "easeIn"] }
			}
			aria-hidden="true"
		>
			<Rule top={above} span={width} from={from} to={to} inkAbove={false} />
			<Rule top={below} span={width} from={from} to={to} inkAbove={true} />
		</motion.span>
	);
}

/* ---------- the wall: `--ghost-loud`'s thread, plate and corners, minus its lane ---------- */

export type Hold = "whole" | "part";

export interface Hand {
	readonly frame: string;
	readonly hold: Hold;
	/** the call open on this frame right now, in the machine's own word, or null between calls */
	readonly verb: string | null;
	/** writes landed in the open run, which plucks the thread and is not printed anywhere here */
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

/** the frame's own corner, so the corners can be struck concentric with it */
const RADIUS = 12;
/**
 * How far outside the wall the presence's centre sits, and how far outside it the shot
 * corners are struck.
 *
 * The lane is gone, so the plate is the only occupant with a real claim: 16 wide, 2px of
 * air off the wall, centre at 10. The corners are decoupled at 4 because they are struck
 * around the whole box and the frame's name sets in a 12px line box ending 5 pixels above
 * it — the collision `--ghost-loud` measured and could not solve while the two numbers
 * were one number.
 */
const OUT = 10;
const OUT_SHOT = 4;
const THREAD = 2;
const PART = 76;
const REST = 9;
const PLATE_W = 16;
/** `write` is the longest verb `label()` can produce, 30.9px at 10px Fragment Mono, plus 3.5 of air each end */
const PLATE_H = 38;
const SHUT_MS = 0.2;

const SLACK = 4;
const WAVE = 46;
const PLUCK = 1.6;
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

/** the wall run, sampled: one line through the head, displaced by a sine with a node at the head */
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

/**
 * The whole agent layer: the spans inside the frames, the presence on one wall.
 *
 * **They are not drawn on the same frames, and that is this construction's own finding.**
 * The wire names one frame, so the presence stands beside `home` and nowhere else. The
 * write lands in a component two frames read, so both frames change and both get a span.
 * The presence is a fact about the transcript; the span is a fact about the pixels. A
 * canvas holding a page at two breakpoints has a frame redrawing with nothing beside it
 * saying why, and no frame in this family had ever put that on screen.
 */
export function SpanLayer({ hand, spans }: { hand: Hand | null; spans: ReadonlyMap<string, readonly Span[]> }) {
	const still = useReducedMotion() === true;
	const at = SLOTS.find((slot) => slot.name === hand?.frame) ?? null;
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			{/* under stillness the turn is a jump cut, so thirteen writes land in one commit
			    and every span would be struck at once — the whole page ruled, at the one
			    moment nobody wrote anything. Disabled outright rather than degraded, the
			    same call `--ghost` makes about its own layer */}
			{still
				? null
				: SLOTS.map((slot) =>
						(spans.get(slot.name) ?? []).map((span) => (
							<SpanMark key={`${slot.name}:${span.key}`} slot={slot} span={span} still={still} />
						)),
					)}
			<AnimatePresence>
				{hand === null || at === null ? null : <Held key={at.name} hand={hand} slot={at} still={still} />}
			</AnimatePresence>
		</div>
	);
}

function Held({ hand, slot, still }: { hand: Hand; slot: FrameSlot; still: boolean }) {
	const box = { x: slot.x, y: slot.y, w: slot.w, h: slot.h };
	const out = slot.dock === "left" ? -1 : 1;
	const wallX = slot.dock === "left" ? box.x : box.x + box.w;
	const line = wallX + out * OUT;
	const mid = box.y + box.h / 2;
	const trace = corners(box);
	const live = hand.verb !== null;
	const held = hand.picturing ? 0 : hand.hold === "whole" ? box.h : PART;
	const foot = mid + REST / 2;

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
				{/* the `shot` posture: four corners, never closing, because a closed rectangle
				    outside a frame is the selection ring `Slot` draws at `inset: -1` */}
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
			<motion.span
				className="absolute overflow-hidden rounded-[2px] border border-muted bg-canvas"
				initial={{ width: REST, height: REST, left: line - REST / 2, top: foot - REST, opacity: 0 }}
				animate={{
					width: live ? PLATE_W : REST,
					height: live ? PLATE_H : REST,
					left: line - (live ? PLATE_W : REST) / 2,
					top: foot - (live ? PLATE_H : REST),
					opacity: 1,
				}}
				exit={{ width: REST, height: REST, left: line - REST / 2, top: foot - REST, opacity: 0 }}
				transition={{ duration: still ? 0 : SHUT_MS, ease: ARRIVE }}
			>
				<motion.span
					className="absolute whitespace-nowrap font-mono text-2xs text-text leading-3"
					style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(-90deg)" }}
					initial={{ opacity: 0 }}
					animate={{ opacity: live ? 1 : 0 }}
					transition={{ duration: still ? 0 : 0.1, ease: "linear" }}
				>
					{hand.verb ?? ""}
				</motion.span>
			</motion.span>
		</>
	);
}
