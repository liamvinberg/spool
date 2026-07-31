import "../agent-wind.css";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { type EdgeWait, edgeLog } from "../lib/edge-wait-turn";
import { useShift } from "../lib/edge-shift";
import {
	EDGE_ASK,
	EDGE_CHIP,
	MS_A_TOKEN,
	PULSE_LONGEST,
	PULSE_SCRIPT,
	THINKING_MEASURED,
	WORST_THOUGHT,
} from "../lib/pulse-turn";
import { type PlayEntry, duration, useTicker, useTurn } from "../lib/turn-play";
import { cn } from "../lib/utils";
import { ChevronIcon } from "./spool-icons";
import { StateMark } from "./spool-play-rail";
import { Caret, Said } from "./spool-say";

/**
 * Round four. The receipt now runs through the thinking, so the question moved.
 *
 * Rounds two and three asked whether a wait should be drawn and where. Round three
 * settled it — the shipped rail has a hairline winding across the composer border for the
 * whole of a turn, and a receipt in the log saying how long a request was out — and that
 * pairing shipped as #212. This round exists because the receipt was anchored to the wrong
 * end of the silence and the fix (#231) changes what every take on round three was drawn
 * against.
 *
 * **The bug, stated once.** The receipt settled on the first token off the wire. A message
 * that begins by thinking reaches its first token immediately, so the line read `thinking
 * 0.0s` and the model then reasoned underneath a log that had stopped moving. Measured:
 * the largest thinking block in the seven captures is 9,500 estimated tokens, and at the
 * 16.7ms a token the four sequential captures report, that is **two minutes thirty-nine
 * seconds** in which the receipt said `0.0s` and every mark in the rail was at rest.
 *
 * **What the fix already does, before any of these takes.** The receipt stops on the first
 * thing the log draws — words or a call — so the line now counts through the thought and
 * `thinking 31.2s` is a number a reader can watch climb. That is the floor here, and
 * `held` is it drawn with nothing added.
 *
 * **What this round asks.** The stroke is deliberately flat: `agent-rail.tsx` states it as
 * the design — "a request out, thinking, saying and doing all draw the same
 * laying-and-taking-up" — and its reasoning is that the answer to *do I need to do
 * anything* is no in all four. That reasoning holds for four seconds. The case it does not
 * cover is two and a half minutes, where the honest peripheral question stops being *do I
 * need to act* and becomes *is this thing alive*. So: should the stroke stay flat, or
 * should the length of the wait be readable in it, and at what cost.
 *
 * Every take here is the shipped stroke plus or instead of one property. None of them adds
 * an object: nothing enters, nothing leaves, and the churn meter says so on every frame,
 * because that is round two's bar and it is not being reopened.
 */

/**
 *   held    the floor: the fix and nothing else. Stroke flat, receipt counting.
 *   warm    the stroke takes on colour as the wait runs long, from the hairline it is now
 *           to the thread colour at the worst measured thought.
 *   slow    the stroke's cycle lengthens with the wait, so a long think travels slowly.
 *   weight  the stroke thickens, 1px to 2px, and nothing else about it changes.
 *   pair    a second head enters the track behind the first once the wait passes 30s, so
 *           *still going* is a count rather than a shade.
 *   quiet   the receipt comes out of the log and the stroke carries the whole of it: the
 *           word and the number ride the border, and the transcript holds only work.
 *   strength what shipped. The stroke's own colour at 75% as it always was, ramping to full
 *           at thirty seconds. The travel is untouched, which is the constraint the row was
 *           decided under.
 */
export type PulseTake = "held" | "warm" | "slow" | "weight" | "pair" | "quiet" | "strength";

/** the takes that read the wait's length back out of the stroke */
const GRADED = new Set<PulseTake>(["warm", "slow", "weight", "pair", "strength"]);

/**
 * The five lengths every take is drawn at, side by side, so nothing has to be waited for.
 *
 * The first version of this row had none of this and it was the row's own worst fault: the
 * takes were only legible if you sat in front of a frame for half a minute, and `pair`
 * needed thirty seconds before it did anything at all. A proposal you cannot see is not a
 * proposal. So every frame draws its own take at five real durations at once, live, and the
 * live rail above is then a second opinion rather than the only one.
 *
 * The five are the measured distribution rather than a spread: 0s is the resting rail, 1.9s
 * is the median time to first token, 15s and 29s are ordinary and long thinking blocks
 * (900 and 1,750 tokens), and 159s is the worst one in the captures at 9,500.
 */
const LADDER = [0, 1970, 15_000, 29_000, WORST_THOUGHT] as const;

/** the shipped cycle, off `ui.css` */
const WIND_MS = 1600;
/** the slowest `slow` will ever run, so the stroke can never look stopped */
const SLOWEST_MS = 4200;
/** where `pair` decides one head is not saying enough */
const PAIR_AT = 30_000;
/** clear of the header's 48px fade */
const TOP_INSET = 10;
const FIELD_H = 60;
const REST_MS = 2600;
const OPEN_MS = 50;

/**
 * How far into a long wait this is, 0 to 1, against the worst thought ever measured.
 *
 * The denominator is `WORST_THOUGHT` — 9,500 tokens at 16.7ms each — and not the longest
 * wait this script plays. That is deliberate and it is the honest choice: a scale fitted
 * to the demo would show every take at full strength within one frame of a real turn and
 * prove nothing. Against the real worst case, the 29-second thought this page plays reaches
 * about a fifth, which is what a fifth actually looks like.
 */
function graded(ms: number): number {
	return Math.max(0, Math.min(1, ms / WORST_THOUGHT));
}

function gapBefore(previous: Item | undefined, item: Item): number {
	if (previous === undefined) return 0;
	return previous.tight && item.tight ? 6 : 14;
}

interface Item {
	readonly key: string;
	readonly tight: boolean;
	readonly node: ReactNode;
}

function Arrive({ gap, children }: { gap: number; children: ReactNode }) {
	return <div style={{ marginTop: gap }}>{children}</div>;
}

function Asked({ text, context }: { text: string; context: string }) {
	return (
		<div className="border-thread/55 border-l-2 pl-2.5">
			<p className="text-base text-text/90 leading-base">{text}</p>
			<p className="mt-1 font-mono text-muted/45 text-xs leading-4">{context}</p>
		</div>
	);
}

function Row({ entry }: { entry: Extract<PlayEntry, { kind: "line" }> }) {
	return (
		<div className="-mx-1.5 flex h-[26px] w-fit items-center gap-2.5 rounded-sm px-1.5">
			<StateMark state={entry.state} />
			<span className="shrink-0 font-mono text-sm text-text/80 leading-4">{entry.verb}</span>
			{entry.subject === undefined ? null : (
				<span className="min-w-0 truncate font-mono text-muted/60 text-sm leading-4">{entry.subject}</span>
			)}
		</div>
	);
}

function Say({ entry }: { entry: Extract<PlayEntry, { kind: "prose" }> }) {
	const done = entry.shown.length >= entry.full.length;
	return (
		<p className="text-base text-text/90 leading-base">
			<Said text={entry.shown} arrival="fade" />
			{done ? null : <Caret />}
		</p>
	);
}

/**
 * The receipt, which every take here draws except `quiet`.
 *
 * It is `agent-rail.tsx`'s `Wait` verbatim in shape — a mark, the word, a duration — and
 * verbatim in what it refuses to say. The wire carries no thinking text at all, so the
 * number is a duration and never a thought, and the only thing that changed between round
 * three and this row is which instant stops it.
 */
function Receipt({ ms, live }: { ms: number; live: boolean }) {
	return (
		<div
			data-pulse-part="receipt"
			className="-mx-1.5 flex h-[26px] w-fit items-center gap-2.5 rounded-sm px-1.5"
		>
			<StateMark state={live ? "running" : "done"} />
			<span className="shrink-0 font-mono text-muted/70 text-sm leading-4">thinking</span>
			<span className="shrink-0 font-mono text-muted/60 text-sm tabular-nums leading-4">{duration(ms)}</span>
		</div>
	);
}

/**
 * The stroke, in the six shapes this row proposes.
 *
 * One element in every take, and one element in `pair` too — the second head is a second
 * span that exists for the whole life of the rail and is transparent until it is wanted,
 * because an object that fades in is still an object that entered as far as the eye is
 * concerned, and this row is not spending round two's bar.
 *
 * The keyframes are `agent-wind.css`, which is `ui.css` byte for byte. What each take
 * varies is one declaration on top of them: `warm` the colour, `slow` the duration,
 * `weight` the height, `pair` a second copy at a phase offset. Nothing rewrites the track,
 * so a difference between two of these frames is a difference in one property.
 */
function WindStroke({ take, running, ms }: { take: PulseTake; running: boolean; ms: number }) {
	const grade = GRADED.has(take) ? graded(ms) : 0;
	const wind = "pointer-events-none absolute -top-px left-0 block w-full origin-left [transform:scaleX(0)]";

	if (take === "quiet") {
		/* the whole readout rides the border, so the stroke is the word's own rule and the
		   log below it holds nothing but work */
		return (
			<span
				aria-hidden="true"
				data-pulse-part="stroke"
				className={cn(wind, "h-px bg-text/75", running && "agent-wind")}
			/>
		);
	}

	const height = take === "weight" ? 1 + grade : 1;
	const colour =
		take === "warm"
			? { backgroundColor: `color-mix(in oklab, var(--color-thread) ${Math.round(grade * 100)}%, var(--color-text))` }
			: {};
	const cycle = take === "slow" ? { animationDuration: `${Math.round(WIND_MS + grade * (SLOWEST_MS - WIND_MS))}ms` } : {};
	/* `strength` is graded against thirty seconds rather than against the worst thought,
	   which is the one thing that changed on its way to shipping: scaled to 159s the ramp
	   spends 80% of its range on the five thoughts in the captures that are longer than
	   half a minute, and is flat across every wait anybody actually sits through */
	const alpha =
		take === "strength" ? { opacity: 0.75 + 0.25 * Math.max(0, Math.min(1, ms / 30_000)) } : {};

	return (
		<>
			<span
				aria-hidden="true"
				data-pulse-part="stroke"
				className={cn(wind, take === "warm" ? "opacity-75" : "bg-text/75", running && "agent-wind")}
				style={{ height, ...colour, ...cycle, ...alpha }}
			/>
			{take === "pair" ? (
				/* present from boot and invisible until 30s, so it changes state rather than
				   arriving. Half a cycle behind, which is the one offset at which the two heads
				   are never on top of each other and never both at an end of the track. */
				<span
					aria-hidden="true"
					data-pulse-part="stroke-second"
					className={cn(wind, "h-px bg-text/75 transition-opacity duration-500", running && "agent-wind")}
					style={{ opacity: ms > PAIR_AT ? 0.55 : 0, animationDelay: `-${WIND_MS / 2}ms` }}
				/>
			) : null}
		</>
	);
}

/**
 * `quiet`: the receipt comes out of the log and lands on the border.
 *
 * The take that answers the request literally — take the word out of the transcript and
 * put it in the loader. What it buys is a transcript of nothing but work: four receipts
 * come out of this turn and twelve come out of a full `claude-edits` session, and that is
 * twelve rows of a log that is otherwise a record of what was done.
 *
 * What it costs is the whole of #212, and the cost should be read before this is picked. A
 * readout on the live edge only ever says *now*. Look away for thirty seconds and there is
 * no record that the thirty seconds happened, and a transcript read back tomorrow says two
 * writes with a gap between them and nothing about why.
 */
function EdgeReadout({ live, ms, running }: { live: boolean; ms: number; running: boolean }) {
	return (
		<div
			data-pulse-part="edge"
			className="pointer-events-none absolute inset-x-0 bottom-0 flex h-9 items-center gap-2.5 px-3.5"
		>
			<span className={cn("font-mono text-sm leading-4", live ? "text-text/80" : "text-muted/45")}>
				{live ? "thinking" : running ? "working" : "idle"}
			</span>
			{live ? (
				<span className="font-mono text-muted/60 text-sm tabular-nums leading-4">{duration(ms)}</span>
			) : null}
		</div>
	);
}

function Transcript({
	entries,
	waits,
	take,
	live,
	waitMs,
	running,
	view,
}: {
	entries: readonly PlayEntry[];
	waits: readonly EdgeWait[];
	take: PulseTake;
	live: boolean;
	waitMs: number;
	running: boolean;
	view: RefObject<HTMLDivElement | null>;
}) {
	const [follow, setFollow] = useState(true);

	const items: Item[] = [];
	/* every take but `quiet` keeps every receipt, live and settled alike: a receipt that is
	   removed once the answer lands is the beat `b4aef45` deleted wearing a verb */
	const receipts = take === "quiet" ? [] : waits;
	for (const entry of entries) {
		for (const wait of receipts)
			if (wait.before === entry.key)
				items.push({
					key: wait.key,
					tight: true,
					node: <Receipt ms={wait.live ? wait.ms : wait.ttft} live={wait.live} />,
				});
		if (entry.kind === "user")
			items.push({ key: entry.key, tight: false, node: <Asked text={entry.text} context={entry.context ?? ""} /> });
		else if (entry.kind === "prose") items.push({ key: entry.key, tight: false, node: <Say entry={entry} /> });
		else if (entry.kind === "line") items.push({ key: entry.key, tight: true, node: <Row entry={entry} /> });
	}
	// a request whose answer has not arrived has nothing to sit in front of yet
	const held = new Set(items.map((item) => item.key));
	for (const wait of receipts)
		if (!held.has(wait.key))
			items.push({
				key: wait.key,
				tight: true,
				node: <Receipt ms={wait.live ? wait.ms : wait.ttft} live={wait.live} />,
			});

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
					take === "quiet" ? "pb-10" : "pb-4",
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
			{take === "quiet" ? (
				<>
					<span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-bg" />
					<EdgeReadout live={live} ms={waitMs} running={running} />
				</>
			) : null}
		</div>
	);
}

function Composer({
	take,
	running,
	waitMs,
	onStop,
}: {
	take: PulseTake;
	running: boolean;
	waitMs: number;
	onStop: () => void;
}) {
	return (
		<div className="relative flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			<WindStroke take={take} running={running} ms={waitMs} />
			<div className="flex min-h-0 flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5">
				<span className="flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border border-border-raised bg-raised pr-2.5 pl-2">
					<span className="h-3 w-[2px] shrink-0 rounded-full bg-thread/55" />
					<span className="min-w-0 truncate font-mono text-text/85 text-xs leading-4">{EDGE_CHIP}</span>
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
			<div className="flex h-[18px] items-center gap-2.5 overflow-hidden">
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
			</div>
		</div>
	);
}

/**
 * The take at five lengths of wait at once, so it can be judged in a glance rather than in
 * half a minute.
 *
 * Each rung is the real thing: the same keyframes, the same track, the take's own property
 * applied at that duration, running. `slow` is why they are live rather than static stills
 * — a pace cannot be drawn in a still image, and a row that showed four of its six takes
 * honestly and one of them as a caption would be deciding the question by omission.
 *
 * They are 76px rather than the rail's 391 so that five fit, and that is a real distortion
 * worth naming: a stroke's whole cost is peripheral travel, and travel at a fifth of the
 * distance reads calmer than the thing being proposed. The rail above is where that is
 * judged; this is where the *difference between the rungs* is judged.
 */
function Ladder({ take }: { take: PulseTake }) {
	return (
		<div className="flex shrink-0 items-end gap-2">
			{LADDER.map((ms) => (
				<div key={ms} className="flex min-w-0 flex-1 flex-col gap-1.5">
					<div className="relative h-1.5 w-full">
						<WindStroke take={take} running ms={ms} />
					</div>
					<span className="font-mono text-2xs text-muted/40 leading-3 tabular-nums">{duration(ms)}</span>
				</div>
			))}
		</div>
	);
}

function Meter({ label, value, hot }: { label: string; value: string; hot: boolean }) {
	return (
		<span className="flex shrink-0 items-baseline gap-1.5">
			<span className="text-muted/45">{label}</span>
			<span className={cn("tabular-nums", hot ? "text-thread" : "text-text")}>{value}</span>
		</span>
	);
}

/** the measurements every take is being decided against, on every frame */
function Carried() {
	return (
		<p className="font-mono text-2xs text-muted/35 leading-4">
			carried: {THINKING_MEASURED.length} thoughts measured · worst {THINKING_MEASURED[0]} tokens ={" "}
			{duration(WORST_THOUGHT)} · {MS_A_TOKEN}ms a token · this turn's longest {duration(PULSE_LONGEST)}
		</p>
	);
}

export function PulseFrame({
	take,
	title,
	claim,
	notes,
}: {
	take: PulseTake;
	/** what this take is, in one mono line */
	title: string;
	/** what it claims, which the meters beside it either back or do not */
	claim: string;
	notes: readonly string[];
}) {
	const turn = useTurn(PULSE_SCRIPT.cues);
	const elapsed = useTicker(turn.run, PULSE_SCRIPT.total);
	const view = useRef<HTMLDivElement>(null);
	const { entries, waits } = edgeLog(PULSE_SCRIPT, turn, elapsed);
	const running = turn.phase === "playing";
	const shift = useShift(view, turn.run, running);

	const wait = waits.find((one) => one.live);
	const live = wait !== undefined;
	const waitMs = wait?.ms ?? 0;

	/* rest, run, rest, again: an always-present indicator is half a design until you have
	   seen what it does when nothing is happening, which is most of a rail's life */
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

	/* what the take is reading out of the wait right now, as a percentage of the worst
	   thought ever measured. Printed rather than described, because every graded take is
	   only as good as what this number does over a real turn. */
	const grade = GRADED.has(take) ? Math.round(graded(waitMs) * 100) : 0;
	const rowsDrawn = take === "quiet" ? 0 : waits.length;

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div className="flex min-h-0 flex-1 flex-col">
				<Transcript
					entries={entries}
					waits={waits}
					take={take}
					live={live}
					waitMs={waitMs}
					running={running}
					view={view}
				/>
				<Composer take={take} running={running} waitMs={waitMs} onStop={turn.cut} />
			</div>
			<div className="flex h-[376px] shrink-0 flex-col gap-2 border-border border-t bg-surface/40 px-3.5 py-3">
				<div className="flex items-baseline gap-2">
					<span className="shrink-0 font-mono text-2xs text-text leading-3">{title}</span>
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-3">
						{turn.phase === "playing" ? "running" : "resting"}
					</span>
				</div>
				<p className="font-mono text-2xs text-muted/60 leading-4">{claim}</p>
				<Ladder take={take} />
				<div className="flex h-4 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="waiting" value={live ? duration(waitMs) : "—"} hot={live} />
					<Meter label="of worst" value={GRADED.has(take) ? `${grade}%` : "flat"} hot={grade > 50} />
					<Meter label="receipts" value={String(rowsDrawn)} hot={false} />
				</div>
				<div className="flex h-4 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="moved down" value={`${shift.worst}px`} hot={shift.worst > 0} />
					<span className="shrink-0 text-muted/45">
						<span className="text-text tabular-nums">{shift.moves}</span> of {shift.frames} frames
					</span>
					<span className="shrink-0 text-muted/45">
						readable after <span className="text-text">{take === "quiet" ? "no" : "yes"}</span>
					</span>
				</div>
				<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
					{notes.map((note) => (
						<p key={note} className="font-mono text-2xs text-muted/45 leading-4">
							{note}
						</p>
					))}
					<Carried />
				</div>
			</div>
		</div>
	);
}
