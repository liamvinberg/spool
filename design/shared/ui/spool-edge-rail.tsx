import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useShift } from "../lib/edge-shift";
import { EDGE_ASK, EDGE_CHIP, EDGE_SCRIPT, type EdgeWait, edgeLog } from "../lib/edge-wait-turn";
import { type PlayEntry, duration, useTicker, useTurn } from "../lib/turn-play";
import { cn } from "../lib/utils";
import { Caret, Said } from "./spool-say";
import { StateMark } from "./spool-play-rail";

/**
 * The rail, cut down to the two things this question is about: the log and the box
 * under it. Everything else the shipped rail carries — threads, plan shelf, model
 * menu, queue — is left out, because none of it is between the human's words and the
 * live edge and every pixel of it would be noise in a comparison of five.
 *
 * The row anatomy, the marks, the gaps, the arrival and the scroll-follow are lifted
 * from `spool-play-rail.tsx` unchanged so the five frames read as the shipped rail and
 * differ from each other in exactly one thing. The turn is the page's own player.
 *
 * **Width.** 420 is the shipped default — `agent-rail.tsx:68`, `RAIL_WIDTH = 420`,
 * inside the drag range it has always had (`MIN_WIDTH` 200, `MAX_WIDTH` 480, snapping
 * to a 44px strip below 144). The frames are drawn at 420 and nothing here depends on
 * it: a beat is one line at every width in that range, and the footer spans the box it
 * is pinned to. What changes with width is where the human's message wraps, which
 * moves the whole log up or down together and is not a shift.
 *
 * **The box height is the small window on purpose.** The transcript is about 340px
 * here, so the log outgrows it partway through the turn and the follow-the-end
 * behaviour actually engages. At the 700px a maximised window gives it, this turn fits
 * whole and the splice still drops it — the bug does not need scrolling to happen, it
 * needs `mt-auto`.
 */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;
/** clear of the header's 48px fade, so an anchored first line is not dimmed by it */
const TOP_INSET = 10;
/** the composer's own resting height */
const FIELD_H = 60;

/**
 * Where the beat between a request going out and an answer coming back is drawn.
 *
 *   log      an entry of its own, unnamed and turning, removed the moment the answer
 *            starts. What ships. `agent-transcript.ts:894` calls the removal
 *            `answered()` and states its reason: "the wait leaves no receipt".
 *   settle   the same entry, named, and it never leaves. It goes from `waiting` to
 *            `waited 1.4s` in place.
 *   footer   out of the log's flow entirely, pinned to the transcript's bottom edge
 *            over a fade, with the log carrying a constant inset so it covers nothing.
 *   ahead    no indicator. The entry the request is *for* is created when the request
 *            goes out, empty, with its own mark turning, and fills in when the answer
 *            lands.
 *   none     nothing at all.
 */
export type WaitWhere = "log" | "settle" | "footer" | "ahead" | "none";

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

/**
 * A row: a mark, a verb, a subject. Fixed at 26px whatever is in it, which is the
 * fact `ahead` rests on — a row with nothing in it yet is exactly as tall as the row
 * it becomes.
 */
function Row({ entry }: { entry: Extract<PlayEntry, { kind: "line" }> }) {
	const still = useReducedMotion() === true;
	return (
		<div className="-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5">
			<StateMark state={entry.state} />
			{entry.verb === "" ? null : (
				<span
					className={cn(
						"shrink-0 font-mono text-sm leading-4",
						entry.quiet === true ? "text-muted/70" : "text-muted",
					)}
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

/**
 * The agent's words, at #149's arrival and #163's settle.
 *
 * The empty case is `ahead`'s and it is the whole of that take for a message: one line
 * of `leading-base` with the mark in it, which is the height the first line of text
 * takes, so the first word lands where the mark was and nothing under it moves.
 */
function Say({ entry }: { entry: Extract<PlayEntry, { kind: "prose" }> }) {
	const streaming = entry.shown.length < entry.full.length;
	if (entry.shown === "")
		return (
			<div className="flex h-5 items-center">
				<StateMark state="running" />
			</div>
		);
	return (
		<div className="text-base text-text/90 leading-base">
			<Said text={entry.shown} live={150} arrival="fade" caret={streaming ? <Caret /> : undefined} />
		</div>
	);
}

/** the beat itself, wherever it is being drawn */
function Beat({ wait, named }: { wait: EdgeWait; named: boolean }) {
	return (
		<div className="-mx-1.5 flex h-[26px] w-fit items-center gap-2.5 rounded-sm px-1.5">
			<StateMark state={wait.live ? "running" : "done"} />
			{named ? (
				<>
					<span className="shrink-0 font-mono text-sm text-muted leading-4">
						{wait.live ? "waiting" : "waited"}
					</span>
					<span className="shrink-0 font-mono text-sm text-text/85 tabular-nums leading-4">
						{duration(wait.ms)}
					</span>
				</>
			) : null}
		</div>
	);
}

function Transcript({
	entries,
	waits,
	where,
	view,
}: {
	entries: readonly PlayEntry[];
	waits: readonly EdgeWait[];
	where: WaitWhere;
	view: RefObject<HTMLDivElement | null>;
}) {
	const [follow, setFollow] = useState(true);

	const items: Item[] = [];
	const drawn = where === "settle" ? waits : where === "log" ? waits.filter((wait) => wait.live) : [];
	const push = (key: string, tight: boolean, node: ReactNode) => items.push({ key, tight, node });
	for (const entry of entries) {
		for (const wait of drawn)
			if (wait.before === entry.key) push(wait.key, true, <Beat wait={wait} named={where === "settle"} />);
		if (entry.kind === "user") push(entry.key, false, <Asked text={entry.text} context={entry.context ?? ""} />);
		else if (entry.kind === "prose") push(entry.key, entry.shown === "", <Say entry={entry} />);
		else if (entry.kind === "line") push(entry.key, true, <Row entry={entry} />);
	}
	// a request whose answer has not arrived has nothing to sit in front of yet
	const held = new Set(items.map((item) => item.key));
	for (const wait of drawn)
		if (!held.has(wait.key)) push(wait.key, true, <Beat wait={wait} named={where === "settle"} />);

	/* the anchor is the top of the live entry rather than the bottom of the log, which
	 * is #148's rule and the one thing about following that is already settled */
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
	}, [entries, waits, follow]);

	const live = waits.find((wait) => wait.live);
	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<div
				ref={view}
				onScroll={(event) => {
					const box = event.currentTarget;
					setFollow(box.scrollHeight - box.scrollTop - box.clientHeight < 24);
				}}
				className={cn(
					"pages-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-6",
					/* the footer's inset, and it is a constant rather than a reserve: it is there
					   whether or not anything is waiting, so it can never move anything. #145's
					   reserve was a message's own height, appearing while it streamed and going
					   when it settled — this is 24px of bottom margin the log always has */
					where === "footer" ? "pb-10" : "pb-4",
				)}
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
			{where === "footer" ? (
				<>
					<span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-bg" />
					<div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-9 items-center px-3.5">
						<motion.div
							className="flex items-center gap-2.5"
							initial={false}
							animate={{ opacity: live === undefined ? 0 : 1 }}
							transition={{ duration: 0.16, ease: "linear" }}
						>
							<StateMark state="running" />
							<span className="shrink-0 font-mono text-sm text-muted leading-4">waiting</span>
							<span className="shrink-0 font-mono text-sm text-text/85 tabular-nums leading-4">
								{duration(live?.ms ?? 0)}
							</span>
						</motion.div>
					</div>
				</>
			) : null}
		</div>
	);
}

/* ---------- the box under it ---------- */

function Composer({ running, onStop }: { running: boolean; onStop: () => void }) {
	return (
		<div className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
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

/* ---------- the frame ---------- */

/**
 * One take: the rail at its shipped 420, and the measurement under it.
 *
 * The meter is outside the product, in the register the canvas keeps for things the
 * machine would print. It is here rather than in a report because the claim it makes
 * is about this running turn and nothing else can check it.
 */
export function EdgeFrame({
	where,
	title,
	claim,
	notes,
}: {
	where: WaitWhere;
	/** what this take is, in one mono line */
	title: string;
	/** what it claims about movement, which the meter beside it either backs or does not */
	claim: string;
	/** what it does about everything else in the log that can shrink or be removed */
	notes: readonly string[];
}) {
	const turn = useTurn(EDGE_SCRIPT.cues);
	const elapsed = useTicker(turn.run, EDGE_SCRIPT.total);
	const view = useRef<HTMLDivElement>(null);
	const { entries, waits } = edgeLog(EDGE_SCRIPT, turn, elapsed, where === "ahead");
	const shift = useShift(view, turn.run, turn.phase === "playing");
	const spliced = where === "log" ? waits.filter((wait) => !wait.live).length : 0;

	// it sends itself, so the frame is a turn already running rather than an empty rail
	useEffect(() => {
		turn.send(EDGE_ASK);
	}, [turn.send]);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex min-h-0 flex-1 flex-col">
				<Transcript entries={entries} waits={waits} where={where} view={view} />
				<Composer running={turn.phase === "playing"} onStop={turn.cut} />
			</div>
			<div className="flex h-[168px] shrink-0 flex-col gap-2 border-border border-t bg-surface/40 px-3.5 py-3">
				<div className="flex items-baseline gap-2">
					<span className="shrink-0 font-mono text-2xs text-text leading-3">{title}</span>
					<button
						type="button"
						onClick={turn.replay}
						className="ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-2xs text-muted/70 leading-3 transition-colors hover:text-text"
					>
						replay
					</button>
				</div>
				<p className="font-mono text-2xs text-muted/60 leading-4">{claim}</p>
				<div className="flex h-4 items-baseline gap-2 overflow-hidden font-mono text-2xs leading-4">
					<span className="shrink-0 text-muted/45">moved down</span>
					<span className={cn("shrink-0 tabular-nums", shift.worst > 0 ? "text-thread" : "text-text")}>
						{shift.worst}px
					</span>
					<span className="shrink-0 text-muted/45">·</span>
					<span className="shrink-0 text-muted/45">
						<span className="text-text tabular-nums">{shift.moves}</span> of {shift.frames} frames
					</span>
					{spliced === 0 ? null : (
						<>
							<span className="shrink-0 text-muted/45">·</span>
							<span className="min-w-0 truncate text-muted/45">spliced {spliced}</span>
						</>
					)}
				</div>
				<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
					{notes.map((note) => (
						<p key={note} className="font-mono text-2xs text-muted/45 leading-4">
							{note}
						</p>
					))}
				</div>
			</div>
		</div>
	);
}
