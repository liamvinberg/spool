import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useShift } from "../lib/edge-shift";
import {
	QUIET_ASK,
	QUIET_CHIP,
	QUIET_SCRIPT,
	type QuietItem,
	type QuietState,
	SHOT_CUE,
	type Split,
	THOUGHT_SIZE,
	quietLog,
	quietShare,
	splitLine,
} from "../lib/quiet-turn";
import { duration, useTicker, useTurn } from "../lib/turn-play";
import { cn } from "../lib/utils";
import { useChurn } from "../lib/wait-churn";
import { StateMark } from "./spool-play-rail";
import { Caret, Said } from "./spool-say";

/**
 * The rail cut down to the one question: what the log keeps when neither of its two
 * beats about the model is a row any more.
 *
 * Everything the shipped rail carries that is not between the human's words and the
 * live edge is left out — threads, plan shelf, model menu, queue — for the reason
 * `spool-edge-rail.tsx` gives: in a comparison of five, every extra pixel is noise. The
 * row anatomy, the marks, the gaps, the arrival and the follow-the-end are lifted from
 * `spool-play-rail.tsx` unchanged, and `StateMark` is imported rather than reimplemented,
 * so a height printed off one of these frames is a height the shipped rail would have.
 *
 * **Width is 420**, the shipped default at `agent-rail.tsx:68` inside the drag range it
 * has always had (200 to 480). Nothing on this row moves with it: a row is 26px at every
 * width in that range because a subject truncates rather than wrapping, so a run in
 * pixels is a run in rows at 200 exactly as at 480.
 */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/* ---------- the numbers everything is measured against ---------- */

/** one row of machine work, and the gap between two of them inside a run */
const ROW_H = 26;
const ROW_GAP = 6;
/** the gap between two things that are not both rows */
const TURN_GAP = 14;
/** clear of the header fade, so an anchored first line is not dimmed by it */
const TOP_INSET = 10;
/** the composer's own resting height */
const FIELD_H = 60;

/**
 * The cap, copied by value from `spool-think-rail.tsx` rather than imported, because
 * importing it would drag that file's whole canvas chrome into these frames.
 *
 * Six rows is 186px and seven is 218px, so 202 holds six whole rows and 16px of a
 * seventh — the half row is the point, because a viewport that is an exact multiple of
 * its own rhythm reads as a list that ended.
 */
const RUN_CAP = 202;

/**
 * Which of five things the log is.
 *
 *   now       what ships. The wait is an unnamed turning entry that `answered()`
 *             splices out at `agent-transcript.ts:894`, and a thought is a permanent
 *             row printing a clock. Nothing sits above the composer, because today
 *             nothing does.
 *   gone      neither beat is a row. One fixed line above the composer carries the
 *             state, and that is all it carries.
 *   clock     the same, and the fixed line also carries the turn's running cost, so
 *             the accounting exists while the turn runs and stops existing after it.
 *   receipt   the same as `gone`, plus one settled line landing in the log at the
 *             turn's boundary: one receipt per turn rather than one beat per block.
 *   capped    the same as `gone`, with the remaining run of tool rows in a viewport
 *             of its own, to re-measure whether `agent-think--run-cap` is still
 *             needed once the thinking rows are not in it.
 */
export type QuietTake = "now" | "gone" | "clock" | "receipt" | "capped";

/* ---------- the log ---------- */

interface Drawn {
	readonly key: string;
	/** a row-shaped thing, which sits 6px from another one instead of 14 */
	readonly tight: boolean;
	readonly quiet: boolean;
	readonly node: ReactNode;
	/**
	 * The same thing again, for the invisible copy the readout measures.
	 *
	 * It exists because the first pass of these frames double-counted itself: the ghost
	 * renders the run a second time to find out what it wanted, and a second copy of
	 * today's wait beat carries a second `data-wait-part`, so `wait-churn.ts` reported
	 * two indicators entering for one beat. The measured copy is byte-identical except
	 * that it claims to be nothing.
	 */
	readonly measure: ReactNode;
}

/** the human's words, and the strip's own line under them (#196) */
function Asked({ text, chip }: { text: string; chip: string }) {
	return (
		<div className="relative flex flex-col gap-1.5 pl-3.5">
			<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
			<p className="whitespace-pre-wrap text-base text-text leading-base">{text}</p>
			<span className="truncate font-mono text-2xs text-muted/55 leading-3">{chip}</span>
		</div>
	);
}

/** the agent's words, at #149's arrival and #163's settle */
function Say({ shown, full }: { shown: string; full: string }) {
	if (shown === "")
		return (
			<div className="flex h-5 items-center">
				<StateMark state="running" />
			</div>
		);
	return (
		<div className="text-base text-text/90 leading-base">
			<Said text={shown} live={150} arrival="fade" caret={shown.length < full.length ? <Caret /> : undefined} />
		</div>
	);
}

/**
 * One line of machine work. 26px whatever is in it, which is what makes a run's height
 * a count of rows rather than a measurement.
 *
 * A thought comes through here too and it is deliberately not a special shape: it has
 * the same mark, the same pitch and the same left edge as a `read`, which is exactly
 * the complaint. A row that looks like a receipt for something and is a receipt for
 * nothing is worse than no row.
 */
function Row({
	state,
	verb,
	subject,
	count,
	quiet,
}: {
	state: "running" | "done";
	verb: string;
	subject: string | null;
	count: number | null;
	quiet: boolean;
}) {
	const still = useReducedMotion() === true;
	return (
		<div className="-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5">
			<StateMark state={state} />
			<span className={cn("shrink-0 font-mono text-sm leading-4", quiet ? "text-muted/70" : "text-muted")}>{verb}</span>
			{subject === null ? null : (
				<motion.span
					className={cn(
						"min-w-0 truncate font-mono text-sm leading-4",
						quiet ? "text-muted/60 tabular-nums" : "text-text/85",
					)}
					initial={still ? false : { opacity: 0, x: -3 }}
					animate={{ opacity: 1, x: 0 }}
					transition={still ? { duration: 0 } : { duration: 0.3, ease: ARRIVE }}
				>
					{subject}
				</motion.span>
			)}
			{count === null ? null : (
				<span className="shrink-0 font-mono text-sm text-text/85 tabular-nums leading-4">×{count}</span>
			)}
		</div>
	);
}

/**
 * Today's wait: a mark turning with nothing beside it.
 *
 * It carries both attributes on purpose. `wait-churn.ts` counts a node holding both as
 * an indicator and never as a row, so today's beat cannot hide inside the log's own
 * churn; `edge-shift.ts` needs the row attribute to watch it move.
 */
function Wait({ marked }: { marked: boolean }) {
	return (
		<div
			{...(marked ? { "data-wait-part": "beat" } : {})}
			className="-mx-1.5 flex h-[26px] w-fit items-center gap-2.5 rounded-sm px-1.5"
		>
			<StateMark state="running" />
		</div>
	);
}

/**
 * The receipt: one settled line per turn, where the two beats used to be seven.
 *
 * It is drawn as a rule rather than as a row, because it is not a call that ran and
 * must not be mistaken for one — no mark, no verb, and a hairline across the log the
 * way #199's wind-down note draws. The numbers are capture time, which is the only
 * time a receipt can honestly be in.
 */
function Receipt({ split }: { split: Split }) {
	return (
		<div className="flex items-center gap-2.5">
			<span className="h-px flex-1 bg-border" />
			<span className="shrink-0 font-mono text-2xs text-muted/55 tabular-nums leading-3">
				{splitLine(split)}
			</span>
		</div>
	);
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

/* ---------- turning the read into what a take draws ---------- */

function drawnOf(items: readonly QuietItem[], take: QuietTake): Drawn[] {
	const out: Drawn[] = [];
	for (const item of items) {
		if (item.kind === "wait" && take !== "now") continue;
		if (item.kind === "thought" && take !== "now") continue;
		if (item.kind === "receipt" && take !== "receipt") continue;
		if (item.kind === "asked") {
			const node = <Asked text={item.text} chip={item.chip} />;
			out.push({ key: item.key, tight: false, quiet: false, node, measure: node });
		} else if (item.kind === "said") {
			/*
			 * The agent's message is never row-shaped, even while it is one mark.
			 *
			 * `spool-edge-rail.tsx` calls an empty message tight, because a mark on its own
			 * is the size of a row, and there it is harmless. Here it is not: a run is a real
			 * object that gets measured and capped, so an entry that starts tight and stops
			 * being tight the moment its first word lands *leaves the run* — and the run
			 * gains 14px of gap where it had 6. Measured before this was fixed: `--gone`
			 * reported 14px of downward movement on the take whose whole claim is zero, on
			 * one frame in the middle of the turn, and it was the regrouping rather than
			 * anything anybody designed.
			 */
			const node = <Say shown={item.shown} full={item.full} />;
			out.push({ key: item.key, tight: false, quiet: false, node, measure: node });
		} else if (item.kind === "wait") {
			out.push({ key: item.key, tight: true, quiet: true, node: <Wait marked />, measure: <Wait marked={false} /> });
		} else if (item.kind === "receipt") {
			const node = <Receipt split={item.split} />;
			out.push({ key: item.key, tight: false, quiet: true, node, measure: node });
		} else {
			const thought = item.kind === "thought";
			const node = (
				<Row
					state={item.state}
					verb={item.verb}
					// a thought's subject is its own clock, because a clock is the only thing the
					// wire ever gives it: 346 thinking blocks in the corpus and not one carries a
					// character of text
					subject={thought ? duration(item.ms ?? 0) : item.subject}
					count={item.count}
					quiet={thought}
				/>
			);
			out.push({ key: item.key, tight: true, quiet: thought, node, measure: node });
		}
	}
	return out;
}

/** consecutive row-shaped things are one run, which is the object a cap caps */
function runsOf(drawn: readonly Drawn[]): Drawn[][] {
	const out: Drawn[][] = [];
	for (const item of drawn) {
		const last = out[out.length - 1];
		if (last !== undefined && last[0]?.tight === true && item.tight) last.push(item);
		else out.push([item]);
	}
	return out;
}

/* ---------- the transcript ---------- */

/** what a frame prints under itself, all of it read off the DOM */
export interface Numbers {
	/** the run's height as drawn, at the screenshot's own moment */
	readonly shotPx: number;
	/** how many rows were in it then */
	readonly shotRows: number;
	/** how many of those said nothing a person acts on */
	readonly shotQuiet: number;
	/** the run's height right now, and what it would want with nothing capping it */
	readonly nowPx: number;
	readonly wantPx: number;
	readonly nowRows: number;
	readonly nowQuiet: number;
}

const NO_NUMBERS: Numbers = { shotPx: 0, shotRows: 0, shotQuiet: 0, nowPx: 0, wantPx: 0, nowRows: 0, nowQuiet: 0 };

function Transcript({
	drawn,
	take,
	view,
	runBox,
	ghost,
}: {
	drawn: readonly Drawn[];
	take: QuietTake;
	view: RefObject<HTMLDivElement | null>;
	runBox: RefObject<HTMLDivElement | null>;
	ghost: RefObject<HTMLDivElement | null>;
}) {
	const [follow, setFollow] = useState(true);
	const runs = runsOf(drawn);
	/** the run the cap caps and the readout measures: the last one, which is the live one */
	const lastRun = runs.reduce((found, group, index) => (group[0]?.tight === true ? index : found), -1);

	/*
	 * Following the live end, and two things about it that were wrong in the first pass.
	 *
	 * **It watches the log's own size, not only the item list.** Every entry arrives
	 * inside a height animation, so a pin that fires when the list changes runs against a
	 * box that has not grown yet, writes a `scrollTop` that is already stale, and never
	 * fires again. Measured before the fix: `--receipt`'s settled line landed half cut off
	 * at the bottom edge of the transcript, which is the one row that take exists to draw.
	 *
	 * **The top-anchor has a condition, and it is load-bearing.** #148's rule is that the
	 * transcript anchors the *top* of a live entry rather than the bottom of the log
	 * "whenever that entry is taller than the box" — and the guard is what makes it a rule
	 * rather than a policy. Anchoring unconditionally puts an entry shorter than the
	 * viewport 10px below the top and leaves the rest of the box empty: measured at 90px
	 * of blank under `--capped`'s 202px run, with the composer's own line stranded under
	 * it. So a short live entry pins the bottom the way every chat surface does, and only
	 * one that cannot fit takes the top.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: the item list is what moves the end
	useEffect(() => {
		const box = view.current;
		if (box === null) return;
		const inner = box.firstElementChild;
		const pin = () => {
			if (!follow) return;
			const end = box.scrollHeight - box.clientHeight;
			const last = inner?.lastElementChild;
			if (!(last instanceof HTMLElement) || last.offsetHeight < box.clientHeight) {
				box.scrollTop = end;
				return;
			}
			const top = box.scrollTop + (last.getBoundingClientRect().top - box.getBoundingClientRect().top) - TOP_INSET;
			box.scrollTop = Math.max(0, Math.min(top, end));
		};
		pin();
		if (!(inner instanceof HTMLElement)) return;
		const watch = new ResizeObserver(pin);
		watch.observe(inner);
		watch.observe(box);
		return () => watch.disconnect();
	}, [drawn, follow]);

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<div
				ref={view}
				onScroll={(event) => {
					const box = event.currentTarget;
					setFollow(box.scrollHeight - box.scrollTop - box.clientHeight < 24);
				}}
				className="quiet-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-6 pb-4"
			>
				<div className="mt-auto shrink-0">
					{runs.map((group, index) => {
						const first = group[0];
						if (first === undefined) return null;
						const gap = index === 0 ? 0 : TURN_GAP;
						if (!first.tight)
							return (
								<div key={first.key} data-edge-key={first.key}>
									<Arrive gap={gap}>{first.node}</Arrive>
								</div>
							);
						const isLast = index === lastRun;
						const body = (
							<div className="flex flex-col">
								{group.map((item, at) => (
									<div key={item.key} data-edge-key={item.key}>
										<Arrive gap={at === 0 ? 0 : ROW_GAP}>{item.node}</Arrive>
									</div>
								))}
							</div>
						);
						return (
							<div key={first.key} style={{ paddingTop: gap }} className="relative">
								{isLast && take === "capped" ? (
									<Capped rows={group.length} box={runBox}>
										{body}
									</Capped>
								) : (
									<div ref={isLast ? runBox : undefined}>{body}</div>
								)}
								{/*
								 * The same rows with nothing capping them and no arrival to settle from,
								 * invisible and out of flow, so a frame prints what the cap is holding
								 * back rather than a number somebody worked out on paper.
								 *
								 * The `h-0 overflow-hidden` wrapper is not decoration. An absolutely
								 * positioned box still contributes its overflow to the nearest scroll
								 * container, so a 282px ghost pinned to the top of a 216px capped run
								 * added 66px to the transcript's `scrollHeight` — measured as 90px of
								 * blank under the run with the log pinned to its own end, on the one
								 * take where the run is shorter than what it wants. Clipping it costs
								 * the measurement nothing: `offsetHeight` is layout and reads through
								 * a clip.
								 */}
								{isLast ? (
									<div
										aria-hidden="true"
										className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-0 overflow-hidden opacity-0"
									>
										<div ref={ghost} className="flex flex-col">
											{group.map((item, at) => (
												<div key={item.key} style={{ paddingTop: at === 0 ? 0 : ROW_GAP }}>
													{item.measure}
												</div>
											))}
										</div>
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
		</div>
	);
}

/**
 * The run in a viewport of its own, pinned to its live end.
 *
 * Nothing is hidden and nothing is summarised. The cost is a second scroll region
 * inside a scrolling log — a wheel over the run moves the run and a wheel two pixels
 * above it moves the transcript, with nothing on screen saying which — and it is the
 * whole argument against this take.
 */
function Capped({ rows, box, children }: { rows: number; box: RefObject<HTMLDivElement | null>; children: ReactNode }) {
	const inner = useRef<HTMLDivElement>(null);
	const [follow, setFollow] = useState(true);
	// the row count is not what moves the end: every row arrives inside a height
	// animation, so a pin that fires when the list changes pins to a box that has not
	// grown yet and then never fires again. The content's own size is the signal.
	useEffect(() => {
		const view = box.current;
		const content = inner.current;
		if (view === null || content === null) return;
		const pin = () => {
			if (!follow) return;
			view.scrollTop = view.scrollHeight - view.clientHeight;
		};
		pin();
		const watch = new ResizeObserver(pin);
		watch.observe(content);
		watch.observe(view);
		return () => watch.disconnect();
	}, [box, follow]);
	const over = ROW_H * rows + ROW_GAP * Math.max(0, rows - 1) > RUN_CAP;
	return (
		<div className="relative">
			<div
				ref={box}
				onScroll={(event) => {
					const view = event.currentTarget;
					setFollow(view.scrollHeight - view.scrollTop - view.clientHeight < 20);
				}}
				className="quiet-scrollbar overflow-y-auto"
				style={{ maxHeight: RUN_CAP }}
			>
				<div ref={inner}>{children}</div>
			</div>
			{over ? (
				<span className="pointer-events-none absolute inset-x-0 top-0 h-7 bg-gradient-to-b from-bg to-transparent" />
			) : null}
		</div>
	);
}

/* ---------- the fixed line ---------- */

/**
 * The plainest possible placeholder for the always-present line, and it is a
 * placeholder on purpose.
 *
 * **Its look and its motion belong to `agent-alive--`**, which is being drawn in
 * parallel. Nothing here is a proposal about how it should read: no glyph, no spinner,
 * no shimmer, no fade, one weight of mono at one opacity, a fixed 22px whether a turn
 * is running or not. Everything these frames claim survives whatever that row picks,
 * because what they claim is about the *log* — that two kinds of row can leave it
 * because something above the composer is already saying the same thing better.
 *
 * The one thing that is not a placeholder is that it never unmounts. That is the point
 * of putting it here rather than in the log, and it is what `wait-churn.ts` measures:
 * zero enters, zero leaves, on screen the whole turn. `agent-wait--line` argued the
 * same slot and its 24px inset survived the same objection — a constant is not a
 * reserve, because it is there on an empty thread and a full one and so it can never
 * move anything.
 */
/** the running cost, drawn beside the state word in the one take that carries it */
function CostLine({ spent }: { spent: Split }) {
	return (
		<>
			<span className="shrink-0 text-muted/25">·</span>
			<span className="min-w-0 truncate text-muted/45 tabular-nums">{splitLine(spent)}</span>
		</>
	);
}

/* ---------- the box under it ---------- */

function Composer({ running, onStop }: { running: boolean; onStop: () => void }) {
	return (
		<div className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			<div className="flex min-h-0 flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5">
				<span className="flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border border-border-raised bg-raised pr-2.5 pl-2">
					<span className="h-3 w-[2px] shrink-0 rounded-full bg-thread/55" />
					<span className="min-w-0 truncate font-mono text-text/85 text-xs leading-4">{QUIET_CHIP}</span>
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
			<div className="flex h-[18px] items-center gap-2.5">
				<span className="min-w-0 truncate font-mono text-2xs text-muted/60 leading-3">Opus (1M context) · high</span>
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
			</div>
		</div>
	);
}

/**
 * The rail's scrollbar, copied out of `src/ui/ui.css` the way `spool-play-rail.tsx`
 * copies it, `@supports` guard included: Chrome honours `scrollbar-width` over
 * `::-webkit-scrollbar` when both are set, which would widen a 2px bar back to a
 * chip-wide one.
 */
function RailScrollbar() {
	return (
		<style>{`
			.quiet-scrollbar::-webkit-scrollbar { width: 2px; height: 2px; }
			.quiet-scrollbar::-webkit-scrollbar-track { background: transparent; }
			.quiet-scrollbar::-webkit-scrollbar-thumb { background: rgb(245 57 26 / 0.35); border-radius: 1px; }
			.quiet-scrollbar::-webkit-scrollbar-thumb:hover { background: rgb(245 57 26 / 0.6); }
			@supports not selector(::-webkit-scrollbar) {
				.quiet-scrollbar { scrollbar-width: thin; scrollbar-color: rgb(245 57 26 / 0.35) transparent; }
			}
		`}</style>
	);
}

/* ---------- the frame ---------- */

/**
 * One take: the rail at 420, and the measurement under it.
 *
 * Every number in the strip is read off the DOM after `document.fonts.ready`, because
 * this page's history is a run of hand-computed heights that were each wrong — #180's
 * footer budget, #184's row widths, #163's word count. The one thing that is not
 * measured is the time split, which is arithmetic over the capture's own numbers and
 * says so.
 */
export function QuietFrame({
	take,
	title,
	claim,
	/** the take's answer to "after the turn, can you see where the time went" */
	after,
	notes,
}: {
	take: QuietTake;
	title: string;
	claim: string;
	after: string;
	notes: readonly string[];
}) {
	const turn = useTurn(QUIET_SCRIPT.cues);
	const elapsed = useTicker(turn.run, QUIET_SCRIPT.total);
	const body = useRef<HTMLDivElement>(null);
	const view = useRef<HTMLDivElement>(null);
	const runBox = useRef<HTMLDivElement>(null);
	const ghost = useRef<HTMLDivElement>(null);
	const [numbers, setNumbers] = useState<Numbers>(NO_NUMBERS);
	const [ready, setReady] = useState(false);

	const read = quietLog(QUIET_SCRIPT, turn, elapsed);
	const drawn = drawnOf(read.items, take);
	const shift = useShift(view, turn.run, turn.phase === "playing");
	const churn = useChurn(body, turn.run, turn.phase === "playing");
	const atShot = turn.at(SHOT_CUE);

	// it sends itself, so the frame is a turn already running rather than an empty rail
	useEffect(() => {
		turn.send(QUIET_ASK);
	}, [turn.send]);

	// nothing may be measured before the mono face lands: every width and every line box
	// is the fallback's until it does, which is how `agent-footer-fit` reported rows as
	// fitting while they were visibly clipped
	useEffect(() => {
		let live = true;
		void document.fonts.ready.then(() => {
			if (live) setReady(true);
		});
		return () => {
			live = false;
		};
	}, []);

	useEffect(() => {
		setNumbers(NO_NUMBERS);
	}, [turn.run]);

	/*
	 * The live measurement, and why it is an observer rather than an effect on the row
	 * count: every row arrives inside a height animation, so an effect firing when the
	 * list changes measures a run that is still opening. `spool-think-rail.tsx` reported
	 * a seven-row run as 31px that way — one row halfway through arriving.
	 */
	const rows = useRef({ count: 0, quiet: 0 });
	rows.current = {
		count: drawn.filter((item) => item.tight).length,
		quiet: drawn.filter((item) => item.tight && item.quiet).length,
	};
	useEffect(() => {
		if (!ready) return;
		const box = runBox.current;
		const want = ghost.current;
		if (box === null || want === null) return;
		const take2 = () =>
			setNumbers((prev) => ({
				...prev,
				nowPx: Math.round(box.offsetHeight),
				wantPx: Math.round(want.offsetHeight),
				nowRows: rows.current.count,
				nowQuiet: rows.current.quiet,
			}));
		take2();
		const watch = new ResizeObserver(take2);
		watch.observe(box);
		watch.observe(want);
		return () => watch.disconnect();
	}, [ready, drawn.length]);

	/*
	 * The screenshot's own moment, latched.
	 *
	 * `SHOT_CUE` is the instant the long thought opened, which is the picture the
	 * question came in with. It is the same instant in all five takes because the cue
	 * fires whether or not the take draws the row it belongs to — which is the only
	 * reason the five heights are comparable at all. The 420ms wait is the arrival
	 * animation finishing: 280ms of height and 340ms of travel.
	 */
	useEffect(() => {
		if (!ready || !atShot) return;
		const id = window.setTimeout(() => {
			const box = runBox.current;
			if (box === null) return;
			setNumbers((prev) =>
				prev.shotRows > 0
					? prev
					: {
							...prev,
							shotPx: Math.round(box.offsetHeight),
							shotRows: rows.current.count,
							shotQuiet: rows.current.quiet,
						},
			);
		}, 420);
		return () => window.clearTimeout(id);
	}, [ready, atShot, turn.run]);

	const line = take !== "now";
	const onPct = churn.ofMs === 0 ? 0 : Math.round((churn.onMs / churn.ofMs) * 100);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<RailScrollbar />
			<div ref={body} className="flex min-h-0 flex-1 flex-col">
				<Transcript drawn={drawn} take={take} view={view} runBox={runBox} ghost={ghost} />
				{line ? (
					<div
						data-wait-part="line"
						className="flex h-[22px] shrink-0 items-center gap-2 px-3.5 font-mono text-2xs leading-3"
					>
						<span
							className={cn(
								"shrink-0 tabular-nums",
								read.state.kind === "idle" ? "text-muted/35" : "text-muted/70",
							)}
						>
							{stateWords(read.state, take === "clock")}
						</span>
						{take === "clock" && read.state.kind !== "idle" && read.state.kind !== "settled" ? (
							<CostLine spent={read.spent} />
						) : null}
					</div>
				) : null}
			</div>
			<Composer running={turn.phase === "playing"} onStop={turn.cut} />
			{/* 252px, and every line in it is measured to fit rather than clamped: the first
			    pass gave it 214 and the notes never rendered at all, which is exactly the
			    failure mode this whole readout exists to catch somewhere else. Title 16,
			    claim 16, six meters 96, two lines of prose 32, three notes 48, 24 of padding
			    and four 4px gaps: 248 wanted, 252 given. */}
			<div className="flex h-[252px] shrink-0 flex-col gap-1 border-border border-t bg-surface/40 px-3.5 py-3">
				<div className="flex items-baseline gap-2">
					<span className="min-w-0 truncate font-mono text-2xs text-text leading-4">{title}</span>
					<button
						type="button"
						onClick={turn.replay}
						className="ml-auto shrink-0 font-mono text-2xs text-muted/70 leading-4 transition-colors hover:text-text"
					>
						replay
					</button>
				</div>
				<p className="truncate font-mono text-2xs text-muted/60 leading-4">{claim}</p>
				<div className="flex flex-col">
					<Meter
						label="screenshot"
						value={
							numbers.shotRows === 0
								? "not there yet"
								: `${numbers.shotPx}px · ${rowWord(numbers.shotRows)} · ${numbers.shotQuiet} quiet`
						}
						loud={numbers.shotQuiet > 0}
					/>
					<Meter
						label="run now"
						value={`${numbers.nowPx} of ${numbers.wantPx}px · ${rowWord(numbers.nowRows)} · ${numbers.nowQuiet} quiet`}
						loud={numbers.wantPx > numbers.nowPx}
					/>
					<Meter
						label="live edge"
						value={`${churn.enters} in · ${churn.leaves} out · on ${onPct}%`}
						loud={churn.leaves > 0}
					/>
					<Meter
						label="moved down"
						value={`${shift.worst}px · ${shift.moves} of ${shift.frames} frames`}
						loud={shift.worst > 0}
					/>
					<Meter label="the time" value={splitLine(read.spent)} loud={false} />
					<Meter
						label="quiet share"
						value={`${quietShare(read.spent)}% of ${(read.spent.total / 1000).toFixed(1)}s, capture time`}
						loud={false}
					/>
				</div>
				<p className="line-clamp-2 text-2xs text-muted/70 leading-4">{after}</p>
				<div className="flex flex-col">
					{notes.map((note) => (
						<p key={note} className="truncate font-mono text-2xs text-muted/40 leading-4">
							{note}
						</p>
					))}
					<p className="truncate font-mono text-2xs text-muted/40 leading-4">
						{`corpus: ${THOUGHT_SIZE.blocks} thoughts, ${THOUGHT_SIZE.empty} empty, ${THOUGHT_SIZE.twoOrFewer} under 3 deltas.`}
					</p>
				</div>
			</div>
		</div>
	);
}

/**
 * What the fixed line says, which is the two clocks the log used to carry.
 *
 * Four words and nothing else: `idle`, `waiting`, `thinking`, `working`. A settled turn
 * is `idle` in every take but `clock`, because nothing is running and saying `done` would
 * be a fifth word claiming a result the composer's own state already carries. `clock` is
 * the one take that keeps the split there instead, which is exactly what it is for.
 */
function stateWords(state: QuietState, cost: boolean): string {
	if (state.kind === "idle") return "idle";
	if (state.kind === "waiting") return `waiting ${duration(state.ms)}`;
	if (state.kind === "thinking") return `thinking ${duration(state.ms)}`;
	if (state.kind === "working") return "working";
	return cost ? splitLine(state.split) : "idle";
}

/** one row is a row, which the first pass of this readout printed as `1 rows` */
function rowWord(count: number): string {
	return count === 1 ? "1 row" : `${count} rows`;
}

function Meter({ label, value, loud }: { label: string; value: string; loud: boolean }) {
	return (
		<div className="flex h-4 items-baseline gap-2 overflow-hidden font-mono text-2xs leading-4">
			{/* 66px holds the longest label whole at 10px Fragment Mono, which leaves the
			    value 318 of the box's 392 — enough for the whole split, measured */}
			<span className="w-[66px] shrink-0 text-muted/40">{label}</span>
			<span className={cn("min-w-0 truncate tabular-nums", loud ? "text-thread" : "text-text/80")}>{value}</span>
		</div>
	);
}
