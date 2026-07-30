import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	CHIP,
	type DrawnStep,
	LEDE,
	SAID,
	type ThinkTurn,
	WIRE_NOTE,
	tokenCount,
	useThinkTurn,
} from "../lib/think-turn";
import { duration } from "../lib/turn-play";
import { cn } from "../lib/utils";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { ChevronIcon, CloseIcon, PlusIcon } from "./spool-icons";
import { StateMark } from "./spool-play-rail";
import { SpoolShell } from "./spool-shell";
import { ThinkField } from "./spool-think-field";

/**
 * The shipped rail, redrawn around one question: what a run of machine work is
 * allowed to do to the transcript, and whether a thinking beat has anything behind
 * it.
 *
 * It is a redraw rather than a prop on `PlayRail` because `PlayRail` is live work in
 * three other tickets and none of this belongs in it until one of these wins. Every
 * measurement it copies is copied on purpose and by number: a row is 26px, a run's
 * rows sit 6px apart and a turn boundary is 14px, the mark is `StateMark` itself
 * imported rather than a second opinion about it, the transcript is `px-3.5 pt-6
 * pb-4` under a 48px top fade, and the composer is the same 60px field in the same
 * box with #184's footer over it. So a height printed off one of these frames is the
 * height the shipped rail would have.
 *
 * What is deliberately missing: the plan shelf, the estate strip, the queue, the
 * question, markdown. None of them is in the screenshot and every one of them would
 * change the transcript's height, which is the number under argument.
 */

/* ---------- the numbers everything here is measured against ---------- */

/** one row of machine work, and the gap between two of them in a run */
export const ROW_H = 26;
export const ROW_GAP = 6;
/** so a run of n rows is this tall, exactly, at every rail width */
export const runHeight = (rows: number) => (rows < 1 ? 0 : ROW_H * rows + ROW_GAP * (rows - 1));

/**
 * The cap, and where the number comes from.
 *
 * Six rows is 186px and seven is 218px, so a viewport of 202 holds six whole rows
 * and 16px of a seventh. The half row is the point rather than an accident: a
 * scroller whose viewport is an exact multiple of its own rhythm looks like a list
 * that ends, and this one does not end. #176 capped the queue at 164 for the same
 * job, and this is that number rounded up to the run's own pitch.
 */
export const RUN_CAP = 202;

/** how many finished rows a fold keeps behind the live edge before it starts folding */
export const FOLD_WINDOW = 3;

const MARK_W = 14;
const INDENT = MARK_W + 10;
const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/* ---------- the two questions ---------- */

/**
 * What a thinking beat is.
 *
 *   beat   one line, `thinking 18s`, which is what ships. It knows a clock and
 *          nothing else, and the token count the wire sends is thrown away one
 *          layer below this.
 *   open   the same line with a disclosure on it, holding every field the wire
 *          has ever carried about a thought. There are three.
 *   gone   a thought is not a step, so it is not a row: it is the live edge while
 *          it runs and it leaves nothing behind when it settles.
 */
export type ThinkMode = "beat" | "open" | "gone";

/**
 * What a run of consecutive machine rows is allowed to take.
 *
 *   all    whatever it wants, which is what ships and what the complaint is about.
 *   cap    a fixed viewport that scrolls inside itself, live edge pinned.
 *   fold   a fixed window of the newest rows; everything older folds into a count
 *          as it goes, so the height never changes at all.
 *   count  one line from the first row, carrying the count and the step it is on,
 *          which is what a delegated task's row already does.
 */
export type RunMode = "all" | "cap" | "fold" | "count";

/** what a frame prints under itself, all of it read off the DOM rather than computed */
export interface Measured {
	/** the transcript's own viewport */
	readonly transcript: number;
	/** what the run would take with nothing capping it, measured off an uncapped copy */
	readonly natural: number;
	/** what it takes as drawn */
	readonly drawn: number;
	/** machine rows in the run right now */
	readonly rows: number;
	/** how many of them a reader can see without scrolling or opening anything */
	readonly shown: number;
}

/* ---------- one frame ---------- */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: [] },
	{
		name: "site",
		frames: ["site-punch-sheet", "site-punch-sheet--door-twice", "site-punch-sheet--patch"],
		active: true,
		open: true,
	},
	{ name: "directing", frames: [] },
];

/**
 * Every frame on this row is this, with two words changed.
 *
 * The scaffold is shared so the only thing that can differ between two of these
 * frames is the pair of modes and the sentence under it — same capture, same rail
 * width, same chrome, same clock. A difference you can see is then a difference
 * somebody chose.
 *
 * 420 is the width, and it is no longer only this page's convention: `inspector.tsx`
 * is gone and `agent-rail.tsx:68` now ships `RAIL_WIDTH = 420` in the drag range it
 * always had, `MIN_WIDTH` 200 to `MAX_WIDTH` 480, snapping to a 44px strip below 144
 * and collapsing below 72. #184's argument was written against the old 300 default
 * and its numbers still hold, because the range did not move.
 *
 * None of the questions on this row move with it either: a row is 26px and a run's
 * pitch is 32px at every width, because a subject truncates rather than wrapping. So
 * a cap in pixels is a cap in rows at 200 and at 480 alike, and what narrowing costs
 * is the end of a long subject rather than the height of anything.
 */
export function ThinkFrame({
	think,
	run,
	note,
	cap,
}: {
	think: ThinkMode;
	run: RunMode;
	note: string;
	cap?: number | undefined;
}) {
	const turn = useThinkTurn();
	const [measured, setMeasured] = useState<Measured | null>(null);
	const report = useCallback((next: Measured) => setMeasured(next), []);
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="min-h-0 flex-1">
				<SpoolShell activeTab="punch" tabs={["punch", "spool"]} zoom="39%">
					<CanvasChrome
						pages={PAGES}
						selected="site-punch-sheet--door-twice"
						tool="select"
						railWidth={420}
						railLabel="Agent"
						rail={<ThinkRail turn={turn} think={think} run={run} cap={cap} report={report} />}
					>
						<ThinkField />
					</CanvasChrome>
				</SpoolShell>
			</div>
			<ThinkReadout measured={measured} note={note} />
		</div>
	);
}

/* ---------- the rail ---------- */

export function ThinkRail({
	turn,
	think,
	run,
	cap = RUN_CAP,
	report,
}: {
	turn: ThinkTurn;
	think: ThinkMode;
	run: RunMode;
	cap?: number | undefined;
	report?: ((measured: Measured) => void) | undefined;
}) {
	return (
		<>
			<RailScrollbar />
			<ThreadRow ask={SAID} running={turn.running} />
			<Transcript turn={turn} think={think} run={run} cap={cap} report={report} />
			<Composer running={turn.running} onReplay={turn.replay} />
		</>
	);
}

/**
 * The threads strip with the one thread this frame is holding.
 *
 * Drawn here rather than imported so the frame carries no deck and no ✕: what it is
 * for in these frames is the 34px it takes off the transcript, which is a number the
 * cap has to live under.
 */
function ThreadRow({ ask, running }: { ask: string; running: boolean }) {
	const still = useReducedMotion() === true;
	return (
		<div className="flex h-[34px] shrink-0 items-stretch border-border border-b">
			<button
				type="button"
				aria-label="New thread"
				className="flex w-9 shrink-0 items-center justify-center border-border border-r text-muted/45 transition-colors duration-150 hover:text-text"
			>
				<PlusIcon className="h-2.5 w-2.5" />
			</button>
			<div className="relative flex min-w-0 flex-1 items-center gap-2 px-3">
				<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
					<motion.svg
						viewBox="0 0 14 14"
						className="h-3.5 w-3.5 text-text/55"
						fill="none"
						aria-hidden="true"
						animate={still || !running ? undefined : { rotate: 360 }}
						transition={
							still || !running
								? undefined
								: { duration: 1.15, repeat: Number.POSITIVE_INFINITY, ease: "linear" }
						}
					>
						<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
						{running ? (
							<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
						) : null}
					</motion.svg>
				</span>
				<span className="min-w-0 truncate text-text text-xs leading-4">{ask}</span>
				<span className="pointer-events-none absolute right-0 bottom-0 left-3 h-[2px] rounded-full bg-thread/70" />
			</div>
		</div>
	);
}

/* ---------- staying at the live end ---------- */

/**
 * Keep a scroller pinned to its own bottom while its content grows.
 *
 * It watches the content rather than the row count, and that is not a detail. Every
 * row here arrives inside a height animation, so a pin that fires when the list
 * changes runs against a box that has not grown yet, sets `scrollTop` to a value
 * that is already stale, and never fires again — which is exactly what the first
 * pass of these frames did: the cap held six rows and showed the six *oldest*, with
 * the live edge cut off the bottom, which is the one row the cap exists to keep.
 */
function usePin(
	box: React.RefObject<HTMLDivElement | null>,
	content: React.RefObject<HTMLDivElement | null>,
	follow: boolean,
) {
	useLayoutEffect(() => {
		const view = box.current;
		const inner = content.current;
		if (view === null || inner === null) return;
		const pin = () => {
			if (!follow) return;
			view.scrollTop = view.scrollHeight - view.clientHeight;
		};
		pin();
		const observer = new ResizeObserver(pin);
		observer.observe(inner);
		observer.observe(view);
		return () => observer.disconnect();
	}, [box, content, follow]);
}

/* ---------- the transcript ---------- */

function Transcript({
	turn,
	think,
	run,
	cap,
	report,
}: {
	turn: ThinkTurn;
	think: ThinkMode;
	run: RunMode;
	cap: number;
	report: ((measured: Measured) => void) | undefined;
}) {
	const view = useRef<HTMLDivElement>(null);
	const log = useRef<HTMLDivElement>(null);
	const block = useRef<HTMLDivElement>(null);
	const ghost = useRef<HTMLDivElement>(null);
	const [follow, setFollow] = useState(true);
	const [ready, setReady] = useState(false);

	// nothing may be measured before the mono face lands: every width and every line
	// box is the fallback's until it does, which is how `agent-footer-fit` reported
	// rows as fitting while they were visibly clipped
	useEffect(() => {
		let live = true;
		void document.fonts.ready.then(() => {
			if (live) setReady(true);
		});
		return () => {
			live = false;
		};
	}, []);

	// the steps drawn as rows, which is not the same list in every mode: `gone` drops
	// a thought that has finished, because it has nothing to leave behind
	const rows = think === "gone" ? turn.steps.filter((step) => step.kind !== "think" || step.state === "running") : turn.steps;

	usePin(view, log, follow);

	/*
	 * The measurement, and why it is an observer rather than an effect on the row
	 * count.
	 *
	 * Every row arrives inside a height animation, so an effect that fires when the
	 * list changes measures a run that is still opening: the first pass of this frame
	 * reported a seven-row run as 31px, which is one row halfway through arriving.
	 * A `ResizeObserver` on all three boxes reports the number the layout settled on
	 * instead, and the uncapped copy is drawn without the animation at all so it has
	 * nothing to settle from.
	 */
	const count = useRef(0);
	count.current = rows.length;
	useEffect(() => {
		if (!ready || report === undefined) return;
		const box = view.current;
		const drawn = block.current;
		const natural = ghost.current;
		if (box === null || drawn === null || natural === null) return;
		let last = "";
		const take = () => {
			const shownPx = Math.min(drawn.offsetHeight, natural.offsetHeight);
			const next: Measured = {
				transcript: Math.round(box.clientHeight),
				natural: Math.round(natural.offsetHeight),
				drawn: Math.round(drawn.offsetHeight),
				rows: count.current,
				// whole rows and the top of one more: what the pixels allow rather than what
				// the mode intends
				shown: shownPx < ROW_H ? 0 : Math.floor((shownPx - ROW_H) / (ROW_H + ROW_GAP)) + 1,
			};
			const key = `${next.transcript}/${next.natural}/${next.drawn}/${next.rows}/${next.shown}`;
			if (key === last) return;
			last = key;
			report(next);
		};
		take();
		const observer = new ResizeObserver(take);
		observer.observe(box);
		observer.observe(drawn);
		observer.observe(natural);
		return () => observer.disconnect();
	}, [ready, report]);

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<div
				ref={view}
				onScroll={(event) => {
					const box = event.currentTarget;
					setFollow(box.scrollHeight - box.scrollTop - box.clientHeight < 24);
				}}
				className="think-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-6 pb-4"
			>
				<div ref={log} className="mt-auto shrink-0">
					<Said text={SAID} context={CHIP} />
					<div className="pt-3.5">
						<p className="whitespace-pre-wrap text-base text-text leading-base">{LEDE}</p>
					</div>
					<div className="relative pt-3.5">
						<div ref={block}>
							<Run rows={rows} mode={run} think={think} cap={cap} />
						</div>
						{/* the same run with nothing capping it, invisible and out of flow, so a
						    frame can print what the cap is actually holding back rather than a
						    number somebody worked out on paper */}
						<div
							ref={ghost}
							aria-hidden="true"
							className="pointer-events-none absolute inset-x-0 top-3.5 -z-10 opacity-0"
						>
							<Plain rows={rows} think={think} still />
						</div>
					</div>
				</div>
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
		</div>
	);
}

/** the human's words, and the one thing the hands were on when they said them */
function Said({ text, context }: { text: string; context: string }) {
	return (
		<div className="relative flex flex-col gap-1.5 pl-3.5">
			<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
			<p className="whitespace-pre-wrap text-base text-text leading-base">{text}</p>
			<span className="truncate font-mono text-2xs text-muted/55 leading-3">{context}</span>
		</div>
	);
}

/* ---------- the run ---------- */

function Run({ rows, mode, think, cap }: { rows: readonly DrawnStep[]; mode: RunMode; think: ThinkMode; cap: number }) {
	if (mode === "all") return <Plain rows={rows} think={think} />;
	if (mode === "cap") return <Capped rows={rows} think={think} cap={cap} />;
	if (mode === "fold") return <Folded rows={rows} think={think} cap={cap} />;
	return <Counted rows={rows} think={think} cap={cap} />;
}

/**
 * What ships: every row, forever, in the order it happened.
 *
 * `still` is the copy that is only ever measured. It skips the arrival animation
 * entirely, because a run drawn mid-arrival is not a run's height, and it skips the
 * open disclosure a live thought carries, because what is being measured is the run
 * rather than whatever the reader happens to have open in it.
 */
function Plain({ rows, think, still = false }: { rows: readonly DrawnStep[]; think: ThinkMode; still?: boolean }) {
	if (still) {
		return (
			<div className="flex flex-col">
				{rows.map((step, index) => (
					<div key={step.key} style={{ paddingTop: index === 0 ? 0 : ROW_GAP }}>
						<Step step={step} think={think === "open" ? "beat" : think} />
					</div>
				))}
			</div>
		);
	}
	return (
		<div className="flex flex-col">
			{/* rows leave here as well as arrive, which nothing in the shipped rail does:
			    a thought that settles under `gone` and a row that passes out of `fold`'s
			    window are both removals, and a row that vanishes between two frames reads
			    as a glitch rather than as a decision. The same collapse runs backwards. */}
			<AnimatePresence initial={false}>
				{rows.map((step, index) => (
					<Arrive key={step.key} gap={index === 0 ? 0 : ROW_GAP}>
						<Step step={step} think={think} />
					</Arrive>
				))}
			</AnimatePresence>
		</div>
	);
}

/**
 * The run in a viewport of its own.
 *
 * Nothing is hidden and nothing is summarised: every row is still there, in order,
 * and the only thing that changed is that the run stopped being allowed to push the
 * sentence above it off the screen. The live edge is pinned to the bottom of the
 * box, which is where it already was in the transcript, so the thing you are
 * watching does not move when the cap starts biting.
 *
 * The cost is a second scroll region inside a scrolling log, and it is a real one:
 * a wheel over the run moves the run and not the transcript, and there is no way to
 * tell which one the pointer is over except by trying it.
 */
function Capped({ rows, think, cap }: { rows: readonly DrawnStep[]; think: ThinkMode; cap: number }) {
	const box = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const [follow, setFollow] = useState(true);
	// the row count is not what moves the end: every row arrives inside a height
	// animation, so a pin that fires when the list changes pins to a box that has not
	// grown yet and then never fires again. The content's own size is the signal.
	usePin(box, content, follow);
	const over = runHeight(rows.length) > cap;
	return (
		<div className="relative">
			<div
				ref={box}
				onScroll={(event) => {
					const view = event.currentTarget;
					setFollow(view.scrollHeight - view.scrollTop - view.clientHeight < 20);
				}}
				className="think-scrollbar overflow-y-auto"
				style={{ maxHeight: cap }}
			>
				<div ref={content}>
					<Plain rows={rows} think={think} />
				</div>
			</div>
			{/* the top of the box is where the run is being cut, so that is where it says so */}
			{over ? (
				<span className="pointer-events-none absolute inset-x-0 top-0 h-7 bg-gradient-to-b from-bg to-transparent" />
			) : null}
		</div>
	);
}

/**
 * The window, and everything behind it folded into a count.
 *
 * The height never changes: three finished rows, the live edge, and one line saying
 * how much is behind them. A run of seven and a run of seventy are the same object
 * on screen, which is the only one of these answers that is actually indifferent to
 * how long the agent works.
 *
 * The cost is that work scrolls past before it can be read. What the fold protects
 * is the shape of the turn; what it spends is the ability to watch.
 */
function Folded({ rows, think, cap }: { rows: readonly DrawnStep[]; think: ThinkMode; cap: number }) {
	const [open, setOpen] = useState(false);
	const live = rows.filter((step) => step.state === "running").length;
	const keep = Math.max(1, FOLD_WINDOW + live);
	const hidden = Math.max(0, rows.length - keep);
	if (hidden === 0) return <Plain rows={rows} think={think} />;
	return (
		<div className="flex flex-col">
			<Disclosure open={open} onPress={() => setOpen(!open)} label={`${hidden} earlier steps`} />
			{open ? (
				<div className="pt-1.5">
					<Capped rows={rows.slice(0, hidden)} think={think} cap={cap} />
				</div>
			) : null}
			<div className="pt-1.5">
				<Plain rows={rows.slice(hidden)} think={think} />
			</div>
		</div>
	);
}

/**
 * The whole run as one line, which is the shape the rail already has for work it
 * does not draw: a delegated task is one row carrying a live step that replaces
 * rather than appends, and drops the step the moment the task lands (#180).
 *
 * So this is not a new object. It is that object applied to the agent's own work
 * instead of only to somebody else's, and the argument for it is the same argument:
 * between two sentences, what a reader is owed is that something is happening and
 * roughly how much, not a receipt per call while the call is still warm.
 *
 * The cost is the biggest here. A log you cannot skim afterwards is not a log, so
 * the count has to open, and once opened it is the capped scroller again — which
 * means this take contains `cap` and is only ever a question about what the run
 * looks like shut.
 */
function Counted({ rows, think, cap }: { rows: readonly DrawnStep[]; think: ThinkMode; cap: number }) {
	const [open, setOpen] = useState(false);
	const live = rows.find((step) => step.state === "running");
	const label = rows.length === 1 ? "1 step" : `${rows.length} steps`;
	return (
		<div className="flex flex-col">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5 text-left hover:bg-surface"
			>
				<StateMark state={live === undefined ? "done" : "running"} />
				<span className="flex min-w-0 items-baseline gap-1.5">
					<span className="shrink-0 font-mono text-muted text-sm tabular-nums leading-4">{label}</span>
					{live === undefined ? null : (
						<>
							<span className="shrink-0 font-mono text-muted/30 text-sm leading-4">·</span>
							<span className="min-w-0 truncate font-mono text-muted/55 text-sm leading-4">{stepText(live)}</span>
						</>
					)}
				</span>
				<ChevronIcon open={open} className="ml-0.5 h-2.5 w-2.5 shrink-0 text-muted/35" />
			</button>
			{open ? (
				<div className="pt-1.5">
					<Capped rows={rows} think={think} cap={cap} />
				</div>
			) : null}
		</div>
	);
}

/** the live step in the words its own row would use, which is the whole of a snapshot */
function stepText(step: DrawnStep): string {
	if (step.kind === "think") return `thinking ${duration(step.ms ?? 0)}`;
	return step.subject === null ? step.verb : `${step.verb} ${step.subject}`;
}

/** the fold's own line: no mark, because nothing here is a call that ran */
function Disclosure({ open, onPress, label }: { open: boolean; onPress: () => void; label: string }) {
	return (
		<button
			type="button"
			onClick={onPress}
			className="-mx-1.5 flex h-[26px] w-fit items-center gap-2 rounded-sm px-1.5 text-left hover:bg-surface"
			style={{ marginLeft: INDENT - 6 }}
		>
			<ChevronIcon open={open} className="h-2.5 w-2.5 shrink-0 text-muted/35" />
			<span className="font-mono text-2xs text-muted/60 tabular-nums leading-3">{label}</span>
		</button>
	);
}

/* ---------- one step ---------- */

function Step({ step, think }: { step: DrawnStep; think: ThinkMode }) {
	if (step.kind === "think") return <Beat step={step} mode={think} />;
	return (
		<div className="-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5 hover:bg-surface">
			<StateMark state={step.state} />
			<span className="flex min-w-0 items-baseline gap-1.5">
				<span className="shrink-0 font-mono text-muted text-sm leading-4">{step.verb}</span>
				{step.subject === null ? null : (
					<span className="min-w-0 truncate font-mono text-sm text-text/85 leading-4">{step.subject}</span>
				)}
				{step.count === null ? null : (
					<span className="shrink-0 font-mono text-sm text-text/85 tabular-nums leading-4">×{step.count}</span>
				)}
			</span>
		</div>
	);
}

/**
 * The thinking beat, three ways.
 *
 * `beat` is the shipped line and it is here as the diff. `open` hangs a disclosure
 * off it holding every field the wire has ever carried about a thought, which is
 * three: how long, how many estimated tokens, and the two divided. `gone` never
 * reaches here settled, because the run drops it a level up.
 */
function Beat({ step, mode }: { step: DrawnStep; mode: ThinkMode }) {
	// the live thought opens itself, on #117's rule for a screenshot: the turn may
	// open a disclosure when what is behind it is the thing you are waiting on
	const [clicked, setClicked] = useState<boolean | undefined>(undefined);
	const open = mode === "open" && (clicked ?? step.state === "running");
	const clock = duration(step.ms ?? 0);
	const line = (
		<>
			<StateMark state={step.state} />
			<span className="flex min-w-0 items-baseline gap-1.5">
				<span className="shrink-0 font-mono text-muted/70 text-sm leading-4">{step.verb}</span>
				<span className="min-w-0 truncate font-mono text-muted/60 text-sm tabular-nums leading-4">{clock}</span>
			</span>
			{mode === "open" ? <ChevronIcon open={open} className="ml-0.5 h-2.5 w-2.5 shrink-0 text-muted/35" /> : null}
		</>
	);
	const row = "-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5 text-left";
	return (
		<div className="flex flex-col">
			{mode === "open" ? (
				<button type="button" onClick={() => setClicked(!open)} className={cn(row, "hover:bg-surface")}>
					{line}
				</button>
			) : (
				<div className={cn(row, "hover:bg-surface")}>{line}</div>
			)}
			<AnimatePresence initial={false}>
				{open ? (
					<motion.div
						className="overflow-hidden"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ height: { duration: 0.24, ease: ARRIVE }, opacity: { duration: 0.16 } }}
					>
						<Inside step={step} />
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

/**
 * Everything a thought has, laid out.
 *
 * It has a fixed number of lines because the wire gives it a fixed number of
 * fields, so the cap the request asked for is not a policy here, it is a
 * measurement: this panel has exactly one height and the frame prints it.
 *
 * The signature is not drawn. It is real, it is the only other field a settled
 * thinking block carries, and it is a base64 receipt for the model's own
 * bookkeeping. Printing it would be honest and useless in the same gesture.
 */
function Inside({ step }: { step: DrawnStep }) {
	const tokens = step.tokens ?? 0;
	const seconds = (step.ms ?? 0) / 1000;
	const rate = seconds > 0 ? Math.round(tokens / seconds) : 0;
	return (
		<div className="pt-1.5" style={{ paddingLeft: INDENT }}>
			<div className="flex flex-col gap-1 rounded-sm border border-border bg-surface/40 px-2.5 py-2">
				{/* the clock is not repeated here: the row you pressed is still on screen
				    holding it, and a disclosure whose first line is the line above it is a
				    disclosure with two lines in it */}
				<Field label="tokens" value={`${tokenCount(tokens)} estimated`} />
				<Field label="rate" value={rate === 0 ? "nothing yet" : `${rate} a second`} />
				<span className="pt-0.5 font-mono text-2xs text-muted/40 leading-3">no text on the wire</span>
			</div>
		</div>
	);
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline gap-2.5">
			<span className="w-14 shrink-0 font-mono text-2xs text-muted/45 leading-4">{label}</span>
			<span className="min-w-0 truncate font-mono text-text/75 text-xs tabular-nums leading-4">{value}</span>
		</div>
	);
}

/* ---------- arrival ---------- */

function Arrive({ gap, children }: { gap: number; children: ReactNode }) {
	const still = useReducedMotion() === true;
	return (
		<motion.div
			className="shrink-0 overflow-hidden"
			initial={still ? false : { height: 0, opacity: 0 }}
			animate={{ height: "auto", opacity: 1 }}
			exit={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
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

/* ---------- the composer ---------- */

/**
 * The composer as #184 left it: the chip strip, the field, and one 18px line
 * carrying the model on the left and the stop on the right while a turn runs.
 *
 * It is here for its height. 173px of the rail is this, at rest and holding one
 * chip, and the transcript is what is left after it and the threads row — so every
 * cap on this page is a cap under a number this box decides.
 */
function Composer({ running, onReplay }: { running: boolean; onReplay: () => void }) {
	const field = useRef<HTMLTextAreaElement>(null);
	const [text, setText] = useState("");
	return (
		<div className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			<div className="flex min-h-0 flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5 transition-colors duration-150 focus-within:border-muted/45">
				<div className="flex h-6 items-center">
					<span className="flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border border-border-raised bg-raised pr-1 pl-2">
						<span className="h-3 w-[2px] shrink-0 rounded-full bg-thread/55" />
						<span className="min-w-0 truncate font-mono text-text/85 text-xs leading-4">{CHIP}</span>
						<button
							type="button"
							aria-label={`drop ${CHIP}`}
							className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/50 transition-colors duration-150 hover:bg-surface hover:text-text"
						>
							<CloseIcon className="h-2 w-2" />
						</button>
					</span>
				</div>
				<textarea
					ref={field}
					value={text}
					rows={3}
					spellCheck={false}
					placeholder="say what to change"
					aria-label="say what to change"
					onChange={(event) => setText(event.target.value)}
					className="w-full resize-none bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
					style={{ height: 60 }}
				/>
			</div>
			<div className="relative flex h-[18px] items-center justify-between gap-2">
				<span className="flex min-w-0 items-center gap-1 font-mono text-2xs text-muted/45 leading-3">
					<span className="min-w-0 truncate">Opus (1M context) · high</span>
					<ChevronIcon open={false} className="h-2 w-2 shrink-0" />
				</span>
				{running ? (
					<span className="flex h-[18px] w-fit shrink-0 items-center gap-2 rounded-sm border border-border-raised bg-raised px-2">
						<span className="h-2 w-2 shrink-0 rounded-[1px] bg-text" />
						<span className="font-mono text-2xs text-text leading-3">stop</span>
						<span className="font-mono text-2xs text-muted/60 leading-3">⎋</span>
					</span>
				) : (
					<button
						type="button"
						onClick={onReplay}
						className="font-mono text-2xs text-muted/45 leading-3 transition-colors duration-150 hover:text-muted"
					>
						replay
					</button>
				)}
			</div>
		</div>
	);
}

/**
 * The rail's scrollbar, copied out of `src/ui/ui.css` the way `spool-play-rail.tsx`
 * copies it, including the `@supports` guard: Chrome honours `scrollbar-width` over
 * `::-webkit-scrollbar` when both are set, which would widen a 2px bar back to a
 * chip-wide one. The class is renamed only so this file owns its own rule.
 */
function RailScrollbar() {
	return (
		<style>{`
			.think-scrollbar::-webkit-scrollbar { width: 2px; height: 2px; }
			.think-scrollbar::-webkit-scrollbar-track { background: transparent; }
			.think-scrollbar::-webkit-scrollbar-thumb { background: rgb(245 57 26 / 0.35); border-radius: 1px; }
			.think-scrollbar::-webkit-scrollbar-thumb:hover { background: rgb(245 57 26 / 0.6); }
			@supports not selector(::-webkit-scrollbar) {
				.think-scrollbar { scrollbar-width: thin; scrollbar-color: rgb(245 57 26 / 0.35) transparent; }
			}
		`}</style>
	);
}

/* ---------- what a frame prints under itself ---------- */

/**
 * The measurement strip, below the app and outside it.
 *
 * Every number in it is read off the DOM after `document.fonts.ready`, because this
 * page's history is a run of hand-computed heights that were wrong: #180's footer
 * budget, #184's row widths and #163's word count were each argued from arithmetic
 * before anything was measured, and each of them was measuring the wrong object.
 */
export function ThinkReadout({ measured, note }: { measured: Measured | null; note: string }) {
	return (
		// a fixed height, because the transcript above it is the thing being measured
		// and a strip that grows with the length of its own sentence would make two
		// frames on this row disagree about how tall a rail is
		<div className="flex h-[76px] shrink-0 flex-col justify-center gap-1.5 border-border border-t bg-surface/40 px-5">
			<div className="flex items-center gap-3 font-mono text-2xs text-muted/45 leading-3">
				<span className="shrink-0">measured</span>
				{measured === null ? (
					<span>waiting on the font</span>
				) : (
					<span className="min-w-0 truncate tabular-nums">
						{`transcript ${measured.transcript}px · run wants ${measured.natural}px over ${measured.rows} rows · drawn ${measured.drawn}px · ${measured.shown} ${measured.shown === 1 ? "row" : "rows"} on screen`}
					</span>
				)}
			</div>
			<p className="line-clamp-2 text-2xs text-muted/60 leading-4">
				{note} {WIRE_NOTE}
			</p>
		</div>
	);
}
