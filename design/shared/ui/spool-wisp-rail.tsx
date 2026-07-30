import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { type Slot, useSlot } from "../lib/alive-slot";
import { useShift } from "../lib/edge-shift";
import { EDGE_ASK, EDGE_CHIP, EDGE_SCRIPT, TTFT_MEASURED, edgeLog } from "../lib/edge-wait-turn";
import { CHIP_INK } from "../lib/ribbon-ink";
import { type Wire, type Work, WORK_ORDER, dwellLine, useDwell, wireNow } from "../lib/ribbon-state";
import { type PlayEntry, useTicker, useTurn } from "../lib/turn-play";
import { cn } from "../lib/utils";
import { useChurn } from "../lib/wait-churn";
import { PINCH_FIT, WISP_W, useDrawn } from "../lib/wisp-taper";
import { ChevronIcon } from "./spool-icons";
import { StateMark } from "./spool-play-rail";
import { Caret, Said } from "./spool-say";
import { SHAPES, WispMark, type WispTake } from "./spool-wisp-marks";

/**
 * Round five, and the redirect is narrow: keep spool, lose the logo, lose the bulk.
 *
 *   "they all just feel a bit big with the icon, it doesnt have to be the exact logo, just using
 *    it as inspiration in some kind of way, like 'spool'."
 *
 * **The target sits between two rejections, and both of them bind.** Round three's `--fold`
 * abstracted the ribbon into three hairlines and was rejected for not being spool's identity;
 * round four drew the real `SPOOL_MARK_PATH`, nine strands, byte-identical on rejoin, and was
 * rejected for size. So neither "a generic wave" nor "the mark itself" is available, and what is
 * left is the *specific* thing about the mark that survives shrinking.
 *
 * **That thing is measured, not chosen.** The nine spans run 395, 416, 321, 224, 180, 165, 269,
 * 392, 446 — a cascade tapering to a waist and opening again, drifting sideways as it descends.
 * Nine strands are not the signature; the taper and the waist are, and both are numbers.
 * `wisp-taper.ts` samples them down and every mark on this row is built from that sample, so the
 * proportion is the identity's even where the drawing is two strokes.
 *
 * **The box is the headline and the panel prints it first.** Round four's slot was 40px carrying
 * a 30px mark, because nine strands need 30 to separate. This row is back to round three's 36px
 * slot, and the marks are 16px on their long axis — the number the frame measures rather than
 * declares, since a declared box is exactly the kind of claim round four's own footer measurement
 * caught being wrong.
 *
 * **Everything that moves keeps moving while a request is out.** The four waits in this script are
 * 7,572ms of a 13,407ms turn, so a take that draws `sent` still is a still rail for 56% of the
 * turn — which is the complaint that started this whole map. `sent` and `working` are told apart
 * by which shape is moving, and the reduced-motion swatches are where that claim gets checked.
 *
 * **The accent is spent once**, on `parked`, in all seven. Red in this rail means something
 * changed and needs you; a mark red at rest spends that meaning on the mark's own identity, and
 * then nothing is left to say it. Each take prints its accent area against the composer chip's
 * own 2×12 bar nine pixels below, computed off the geometry rather than rastered — the marks are
 * rectangles and trapezoids, so the area is exact rather than sampled.
 */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;
/** clear of the header's 48px fade, so an anchored first line is not dimmed by it */
const TOP_INSET = 10;
/** the composer's own resting height */
const FIELD_H = 60;
/** how long the rail sits still between turns, so both states are legible */
const REST_MS = 2400;
/** the first send fires on boot: a still of this frame should catch the rail at work */
const OPEN_MS = 50;
/** the composer's own padding: 391px of box inside the shipped 420 rail (#184) */
const CHROME = 29;
/**
 * The slot's own height, and it is round three's 36 rather than round four's 40.
 *
 * Nine strands needed 30px of mark to separate and 40px of slot to sit in. Nothing here is nine
 * of anything, so the 4px round four took goes back to the transcript, on every thread, forever.
 */
const SLOT_H = 36;

/** the turn parks here and the frame releases it, because a capture has nobody to answer it */
const HOLD = "open:read-press";
const PARK_MS = 1700;

interface Spec {
	/** how long one loop takes, against a wait's measured 878–4,043ms */
	readonly cycle: string;
	/** what the borrow actually is, in one line, since that is this round's whole question */
	readonly borrows: string;
	/** transform and opacity only, or something worse, said plainly */
	readonly composited: string;
	/** which of the six states get their own drawing, and what the rest are folded into */
	readonly states: string;
	/** what freezing it leaves, which is the standard `--count` set */
	readonly frozen: string;
	/** whether any drawing here already means something else in this rail (#161's trap) */
	readonly collides: string;
	/** the states this take draws differently, which is what the fallback row swatches */
	readonly shows: readonly Work[];
	/** constraints from the brief this take fails, by number, or empty */
	readonly fails: readonly string[];
}

const FOUR: readonly Work[] = ["idle", "sent", "tooling", "parked"];

const SPECS: Record<WispTake, Spec> = {
	waist: {
		cycle: "1500ms working · 1400ms sent",
		borrows: "the taper as a function. a gaussian pinch of 0.62 fits the five sampled spans to 0.06",
		composited: "yes. scaleX on five spans, nothing else",
		states: "four. saying and tooling and thinking are one, on the dwell",
		frozen: "four shapes: the cascade, cut at the middle, the waist low, solid",
		collides: "no. a pinched stack of five is nothing else in this rail",
		shows: FOUR,
		fails: [],
	},
	reel: {
		cycle: "1450ms · three threads 180ms apart",
		borrows: "the taper as three lengths, long short long, off the sampled spans",
		composited: "yes. scaleX on three threads, opacity on the core",
		states: "four. the core is constant and the threads carry the state",
		frozen: "four shapes: the bare core, three drawn in, three at three lengths, three full",
		collides: "no. nothing else here has a stationary anchor in it",
		shows: FOUR,
		fails: [],
	},
	cross: {
		cycle: "1500ms · rotate and y together, no revolution",
		borrows: "the taper as the tips, and the crossing as the waist",
		composited: "yes. rotate and translateY on two spans",
		states: "four. the crossing is the state and there is no fifth arrangement",
		frozen: "four shapes: parallel, offset, a shallow cross, a hard one",
		collides: "yes, and it is fatal. the hard X is StateMark's own failed glyph",
		shows: FOUR,
		fails: [
			"3 · parked draws a cross in the accent, which is what a failed row already is",
			"3 · working frozen is a chevron, which the model row already uses",
		],
	},
	drift: {
		cycle: "1400ms · one shear through upright",
		borrows: "the cascade's sideways drift, plus the four sampled spans as widths",
		composited: "yes. translateX on four spans, scaleX set once per state",
		states: "four, and two of them are mirror images rather than amounts",
		frozen: "four shapes: upright dim, leaning left, leaning right, upright solid",
		collides: "no. --spin's direction was a lean inside a shape; here the lean is the shape",
		shows: FOUR,
		fails: [],
	},
	hank: {
		cycle: "1600ms · one crossing and back",
		borrows: "the word rather than the shape. to spool is to wind off one thing onto another",
		composited: "yes. scaleX on two spans, opposite origins",
		states: "four, from two elements, and all four are silhouettes",
		frozen: "four shapes: balanced, top-heavy, bottom-heavy, both full",
		collides: "no. two bars trading length is nothing else here",
		shows: FOUR,
		fails: [],
	},
	slit: {
		cycle: "1400ms · one pass of the band",
		borrows: "the taper as the mask's own slots, so the pass dwells wide and skims the waist",
		composited: "yes. translateX of a gradient painted once behind a static mask",
		states: "four while it moves, and it should be judged as two",
		frozen: "two. sent and working are a thin bright patch and a wide one, in one place",
		collides: "no, but the fallback is an amount rather than a shape",
		shows: FOUR,
		fails: ["3 · frozen, sent and working differ only in band width"],
	},
	nib: {
		cycle: "1500ms · one pay-out and back",
		borrows: "the taper alone, and nothing else at all",
		composited: "yes. scaleX on one span. one element, zero writes",
		states: "four lengths, which is an amount and not four pictures",
		frozen: "two, generously. idle at 0.5 and working at 0.72 are one picture at two strengths",
		collides: "no, and there is nearly nothing there to collide",
		shows: FOUR,
		fails: ["3 · the four states collapse to lengths of one stroke", "the borrow is a wedge"],
	},
};

/* ---------- the transcript ---------- */

interface Item {
	readonly key: string;
	/** a row-shaped thing, which sits tighter against another one */
	readonly tight: boolean;
	readonly node: ReactNode;
}

function gapBefore(previous: Item | undefined, item: Item): number {
	if (previous === undefined) return 0;
	return previous.tight && item.tight ? 6 : 14;
}

function Arrive({ gap, children }: { gap: number; children: ReactNode }) {
	const still = useReducedMotion() === true;
	return (
		<motion.div
			className="shrink-0 overflow-hidden"
			initial={still ? false : { height: 0, opacity: 0 }}
			animate={{ height: "auto", opacity: 1 }}
			transition={
				still
					? { duration: 0 }
					: { height: { duration: 0.28, ease: ARRIVE }, opacity: { duration: 0.2, ease: "linear" } }
			}
		>
			<motion.div
				style={{ paddingTop: gap }}
				initial={still ? false : { y: 6 }}
				animate={{ y: 0 }}
				transition={still ? { duration: 0 } : { duration: 0.34, ease: ARRIVE }}
			>
				{children}
			</motion.div>
		</motion.div>
	);
}

/** the human's words, and the strip's own line under them (#196) */
function Asked({ text, context }: { text: string; context: string }) {
	return (
		<div className="relative flex flex-col gap-1.5 pl-3.5">
			<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
			<p className="whitespace-pre-wrap text-base text-text leading-base">{text}</p>
			<span className="truncate font-mono text-2xs text-muted/55 leading-3">{context}</span>
		</div>
	);
}

function Row({ entry }: { entry: Extract<PlayEntry, { kind: "line" }> }) {
	const still = useReducedMotion() === true;
	return (
		<div className="-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5">
			<StateMark state={entry.state} />
			{entry.verb === "" ? null : (
				<span
					className={cn("shrink-0 font-mono text-sm leading-4", entry.quiet === true ? "text-muted/70" : "text-muted")}
				>
					{entry.verb}
				</span>
			)}
			{entry.subject === undefined ? null : (
				<motion.span
					className={cn(
						"min-w-0 truncate font-mono text-sm leading-4",
						entry.quiet === true ? "text-muted/60 tabular-nums" : "text-text/85",
					)}
					initial={still ? false : { opacity: 0, x: -3 }}
					animate={{ opacity: 1, x: 0 }}
					transition={still ? { duration: 0 } : { duration: 0.3, ease: ARRIVE }}
				>
					{entry.subject}
				</motion.span>
			)}
		</div>
	);
}

/** the agent's words, at #149's arrival and #163's settle */
function Say({ entry }: { entry: Extract<PlayEntry, { kind: "prose" }> }) {
	const streaming = entry.shown.length < entry.full.length;
	return (
		<div className="text-base text-text/90 leading-base">
			<Said text={entry.shown} live={150} arrival="fade" caret={streaming ? <Caret /> : undefined} />
		</div>
	);
}

function Transcript({
	entries,
	take,
	wire,
	still,
	view,
	hold,
}: {
	entries: readonly PlayEntry[];
	take: WispTake;
	wire: Wire;
	still: boolean;
	view: RefObject<HTMLDivElement | null>;
	hold: RefObject<HTMLSpanElement | null>;
}) {
	const [follow, setFollow] = useState(true);

	const items: Item[] = [];
	for (const entry of entries) {
		if (entry.kind === "user")
			items.push({ key: entry.key, tight: false, node: <Asked text={entry.text} context={entry.context ?? ""} /> });
		else if (entry.kind === "prose") items.push({ key: entry.key, tight: false, node: <Say entry={entry} /> });
		else if (entry.kind === "line") items.push({ key: entry.key, tight: true, node: <Row entry={entry} /> });
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: the item list is what moves the end
	useEffect(() => {
		const box = view.current;
		if (box === null || !follow) return;
		const end = box.scrollHeight - box.clientHeight;
		const last = box.firstElementChild?.lastElementChild;
		if (!(last instanceof HTMLElement)) {
			box.scrollTop = end;
			return;
		}
		const top = box.scrollTop + (last.getBoundingClientRect().top - box.getBoundingClientRect().top) - TOP_INSET;
		box.scrollTop = Math.max(0, Math.min(top, end));
	}, [entries, follow]);

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<div
				ref={view}
				onScroll={(event) => {
					const box = event.currentTarget;
					setFollow(box.scrollHeight - box.scrollTop - box.clientHeight < 24);
				}}
				className="pages-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-6 pb-10"
			>
				<div className="mt-auto shrink-0">
					{items.map((item, index) => (
						<div key={item.key} data-edge-key={item.key}>
							<Arrive gap={gapBefore(items[index - 1], item)}>{item.node}</Arrive>
						</div>
					))}
				</div>
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
			<span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-bg" />
			<div
				data-wait-part="wisp"
				className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center px-3.5"
				style={{ height: SLOT_H }}
			>
				<span ref={hold} className="flex w-fit items-center">
					<WispMark take={take} wire={wire} still={still} />
				</span>
			</div>
		</div>
	);
}

/* ---------- the box under it ---------- */

/**
 * The composer footer at #184's resolved shape: the model and the stop and nothing else.
 *
 * Nothing this row proposes goes in here, and it is measured anyway — the row drawn twice with an
 * invisible `w-max` copy asked how wide it wants to be. The chip above it is why: its 2px
 * `bg-thread/55` bar is the selection's accent nine pixels below the slot, and it is the thing an
 * always-red mark would be competing with. Every accent number this row prints is against it.
 */
function Composer({
	running,
	onStop,
	onWanted,
}: {
	running: boolean;
	onStop: () => void;
	onWanted: (px: number) => void;
}) {
	const ghost = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const natural = ghost.current;
		if (natural === null) return;
		const read = () => onWanted(Math.round(natural.getBoundingClientRect().width));
		void document.fonts.ready.then(read);
		const watch = new ResizeObserver(read);
		watch.observe(natural);
		return () => watch.disconnect();
	}, [onWanted]);

	const row = (
		<>
			<span className="flex min-w-0 items-center gap-1 font-mono text-2xs text-muted/60 leading-3">
				<span className="min-w-0 truncate">Opus (1M context) · high</span>
				<ChevronIcon open={false} className="h-2 w-2 shrink-0" />
			</span>
			{running ? (
				<button
					type="button"
					onClick={onStop}
					className="ml-auto flex h-[18px] w-fit shrink-0 items-center gap-2 rounded-sm border border-border-raised bg-raised px-2 transition-colors duration-150 hover:border-muted/45"
				>
					<span className="h-2 w-2 shrink-0 rounded-[1px] bg-text" />
					<span className="font-mono text-2xs text-text leading-3">stop</span>
					<span className="font-mono text-2xs text-muted/60 leading-3">⎋</span>
				</button>
			) : null}
		</>
	);

	return (
		<div className="relative flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			<div className="flex min-h-0 flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5">
				<span className="flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border border-border-raised bg-raised pr-2.5 pl-2">
					<span className="h-3 w-[2px] shrink-0 rounded-full bg-thread/55" />
					<span className="min-w-0 truncate font-mono text-xs text-text/85 leading-4">{EDGE_CHIP}</span>
				</span>
				<textarea
					rows={3}
					readOnly
					spellCheck={false}
					placeholder="say what to change"
					aria-label="say what to change"
					className="w-full resize-none bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
					style={{ height: FIELD_H }}
				/>
			</div>
			<div className="relative">
				<div className="flex h-[18px] items-center gap-2.5 overflow-hidden">{row}</div>
				<div
					ref={ghost}
					aria-hidden="true"
					className="pointer-events-none invisible absolute top-0 left-0 flex h-[18px] w-max items-center gap-2.5"
				>
					{row}
				</div>
			</div>
		</div>
	);
}

/* ---------- the panel ---------- */

function Meter({ label, value, hot }: { label: string; value: string; hot: boolean }) {
	return (
		<span className="flex shrink-0 items-baseline gap-1.5">
			<span className="text-muted/45">{label}</span>
			<span className={cn("tabular-nums", hot ? "text-thread" : "text-text")}>{value}</span>
		</span>
	);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-baseline gap-2 font-mono text-2xs leading-4">
			<span className="w-[72px] shrink-0 text-muted/45">{label}</span>
			<span className="min-w-0 flex-1 text-muted/70">{children}</span>
		</div>
	);
}

/** the six states with the live one lit, so the loop can be read while it runs */
function Trace({ state }: { state: Work }) {
	return (
		<div className="flex flex-wrap items-baseline gap-x-2 font-mono text-2xs leading-4">
			{WORK_ORDER.map((work) => (
				<span key={work} className={cn(work === state ? "text-text" : "text-muted/30")}>
					{work}
				</span>
			))}
		</div>
	);
}

/** the wire a swatch stands in for, built rather than captured: a still is not a moment */
function asWire(state: Work): Wire {
	return {
		state,
		load: state === "idle" ? 0 : state === "sent" ? 1 : 2,
		out: state === "sent",
		on: state !== "idle",
	};
}

/**
 * What `prefers-reduced-motion` draws, one swatch per state the take distinguishes.
 *
 * This is the standard `--count` set in round four and the reason it won: freeze a rate-based take
 * and every state collapses to one picture at two strengths, which is the trap #161 found from the
 * other side. So the swatches are drawn rather than described, and a take whose four states become
 * two says so here rather than in a sentence.
 *
 * Not a switcher: nothing about the rail above changes, no take is drawn twice, and these are
 * readings of one property the way the meters are readings of one number.
 */
function Fallback({ take }: { take: WispTake }) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-start gap-2">
				{SPECS[take].shows.map((state) => (
					<div key={state} className="flex flex-col items-center gap-1">
						<span className="flex h-10 w-11 items-center justify-center rounded-sm border border-border bg-bg">
							<WispMark take={take} wire={asWire(state)} still />
						</span>
						<span className="font-mono text-2xs text-muted/45 leading-3">{state}</span>
					</div>
				))}
			</div>
			<p className="font-mono text-2xs text-muted/60 leading-4">{SPECS[take].frozen}</p>
		</div>
	);
}

export function WispFrame({
	take,
	title,
	claim,
	notes,
}: {
	take: WispTake;
	/** what this take is, in one mono line */
	title: string;
	/** what it claims, which the meters beside it either back or do not */
	claim: string;
	notes: readonly string[];
}) {
	const spec = SPECS[take];
	const shape = SHAPES[take];
	const still = useReducedMotion() === true;
	const turn = useTurn(EDGE_SCRIPT.cues, HOLD);
	const elapsed = useTicker(turn.run, EDGE_SCRIPT.total, turn.waiting);
	/** the scrolling column, which is what movement is measured against */
	const view = useRef<HTMLDivElement>(null);
	/** the whole rail, which is what churn is counted over */
	const rail = useRef<HTMLDivElement>(null);
	/** whatever the take actually draws, which is what the slot and the box meters watch */
	const hold = useRef<HTMLSpanElement>(null);
	const [wanted, setWanted] = useState<number | null>(null);
	const { entries, waits } = edgeLog(EDGE_SCRIPT, turn, elapsed);
	const running = turn.phase === "playing";
	const shift = useShift(view, turn.run, running);
	const churn = useChurn(rail, turn.run, running);
	const slot: Slot = useSlot(hold, turn.run, running);
	const drawn = useDrawn(hold);
	const wire = wireNow(entries, waits, turn.waiting);
	const dwell = useDwell(wire.state, turn.run);

	/* the park is the one state a capture cannot hold, so the frame releases it itself */
	useEffect(() => {
		if (!turn.waiting) return;
		const timer = window.setTimeout(turn.resume, PARK_MS);
		return () => window.clearTimeout(timer);
	}, [turn.waiting, turn.resume]);

	/* rest, run, rest, again. The resting state is half of every take here. */
	useEffect(() => {
		if (turn.phase === "playing") return;
		const idle = turn.phase === "idle";
		const timer = window.setTimeout(
			() => {
				if (idle) turn.send(EDGE_ASK);
				else turn.replay();
			},
			idle ? OPEN_MS : REST_MS,
		);
		return () => window.clearTimeout(timer);
	}, [turn.phase, turn.send, turn.replay]);

	const share = churn.ofMs === 0 ? 0 : Math.round((churn.onMs / churn.ofMs) * 100);
	const box = 420 - CHROME;

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div ref={rail} className="flex min-h-0 flex-1 flex-col">
				<Transcript entries={entries} take={take} wire={wire} still={still} view={view} hold={hold} />
				<Composer running={running} onStop={turn.cut} onWanted={setWanted} />
			</div>
			<div className="flex h-[700px] shrink-0 flex-col gap-2 border-border border-t bg-surface/40 px-3.5 py-3">
				<div className="flex items-baseline gap-2">
					<span className="shrink-0 font-mono text-2xs text-text leading-3">{title}</span>
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-3">
						{running ? "running" : "resting"}
					</span>
				</div>
				<div className="flex items-baseline gap-2 border-border/60 border-y py-1.5">
					<span className="shrink-0 font-mono text-2xs text-muted/45 leading-4">box</span>
					<span className="shrink-0 font-mono text-sm text-text leading-4 tabular-nums">
						{drawn.w === 0 ? "…" : `${drawn.w} × ${drawn.h}`}
						<span className="text-muted/45">px</span>
					</span>
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-4">
						round four: 30 × 24 in a 40 slot
					</span>
				</div>
				<p className="font-mono text-2xs text-muted/60 leading-4">{claim}</p>
				<Trace state={wire.state} />
				<p className="h-4 overflow-hidden font-mono text-2xs text-muted/55 leading-4">{dwellLine(dwell)}</p>
				<div className="flex h-4 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="enters" value={String(churn.enters)} hot={churn.enters > 0} />
					<Meter label="leaves" value={String(churn.leaves)} hot={churn.leaves > 0} />
					<Meter label="on screen" value={`${share}%`} hot={false} />
					<Meter label="moved down" value={`${shift.worst}px`} hot={shift.worst > 0} />
				</div>
				<div className="flex h-4 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="writes" value={String(slot.writes)} hot={slot.writes > 40} />
					<Meter label="widest step" value={`${slot.jump}px`} hot={slot.jumps > 4} />
					<Meter label="nodes" value={String(shape.nodes)} hot={shape.nodes > 6} />
					<span className="shrink-0 text-muted/45">
						steps <span className={cn("tabular-nums", slot.jumps > 4 ? "text-thread" : "text-text")}>{slot.jumps}</span>
					</span>
				</div>
				<div className="flex h-4 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<span className="shrink-0 text-muted/45">
						footer wants{" "}
						<span className={cn("tabular-nums", wanted !== null && wanted > box ? "text-thread" : "text-text")}>
							{wanted === null ? "…" : wanted}
						</span>{" "}
						of {box}
					</span>
					<span className="shrink-0 text-muted/45">
						transcript gives up <span className="text-text tabular-nums">{SLOT_H}px</span>
					</span>
				</div>
				<div className="flex flex-col gap-1 border-border/60 border-t pt-2">
					<Fact label="borrows">{spec.borrows}</Fact>
					<Fact label="cycle">{spec.cycle}</Fact>
					<Fact label="compositor">{spec.composited}</Fact>
					<Fact label="states">{spec.states}</Fact>
					<Fact label="accent">
						parked only · {shape.accent}px² against the chip's {CHIP_INK}px², {(shape.accent / CHIP_INK).toFixed(1)}×
					</Fact>
					<Fact label="taper">
						{WISP_W}px on the long axis · spans sampled from the mark · pinch fits to {PINCH_FIT.toFixed(2)}
					</Fact>
					{spec.fails.length === 0 ? null : (
						<Fact label="fails">
							<span className="text-thread">{spec.fails.join(" · ")}</span>
						</Fact>
					)}
				</div>
				<div className="border-border/60 border-t pt-2">
					<Fallback take={take} />
				</div>
				<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
					{notes.map((note) => (
						<p key={note} className="font-mono text-2xs text-muted/45 leading-4">
							{note}
						</p>
					))}
					<p className="font-mono text-2xs text-muted/35 leading-4">
						carried: ttft {TTFT_MEASURED.min}/{TTFT_MEASURED.median}/{TTFT_MEASURED.max}ms over{" "}
						{TTFT_MEASURED.count} · 56% of this turn is a request out · thinking carries no text at all
					</p>
				</div>
			</div>
		</div>
	);
}
