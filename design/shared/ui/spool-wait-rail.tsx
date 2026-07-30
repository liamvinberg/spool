import { motion, useAnimationFrame, useMotionValue, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useShift } from "../lib/edge-shift";
import { EDGE_ASK, EDGE_CHIP, EDGE_SCRIPT, TTFT_MEASURED, type EdgeWait, edgeLog } from "../lib/edge-wait-turn";
import { type PlayEntry, duration, useTicker, useTurn } from "../lib/turn-play";
import { useChurn } from "../lib/wait-churn";
import { cn } from "../lib/utils";
import { Caret, Said } from "./spool-say";
import { ChevronIcon } from "./spool-icons";
import { StateMark } from "./spool-play-rail";
import { SpoolMark } from "./spool-mark";

/**
 * Round two of the wait indicator, and the question is a different one.
 *
 * Round one drew the beat in five places and four of them measured a flat zero
 * downward movement. It settled nothing, because the objection was never the pixels:
 *
 *   "i like the none i think most, that you dont see anything. or if we have like some
 *    loader always loading if you would like to explore. its just that with others it
 *    moves up and down and i dont know, maybe like spool logo animating or something?"
 *
 * The thing being complained about is an object that **comes and goes**. It is created
 * when a request leaves and destroyed when the answer lands, twelve times in an
 * ordinary `claude-edits` turn, and a zero on the shift meter does not make it stop
 * blinking. So zero shift is the floor here rather than the argument, and the deciding
 * number is `wait-churn.ts`: how many objects enter and leave the live edge across a
 * whole turn.
 *
 * That leaves exactly two shapes that can win. Delete the indicator, which is `none`.
 * Or make it **always present and only ever changing state**, so nothing enters and
 * nothing leaves. Every take here is one or the other, and none of them puts anything
 * in the log — the transcript is receipts, and a wait is not one.
 *
 * The turn, the copy and the waits are round one's, unchanged, from
 * `edge-wait-turn.ts`: four real times to first token off `claude-edits.json`, 7,572ms
 * of a 13,407ms turn, so 56% of what plays here is spent with a request out.
 *
 * **These frames rest, run and rest again, on a loop.** Round one's sent itself once
 * and stopped, which was fine when the object under test only existed mid-turn. It is
 * useless here: an always-present indicator is half a design until you have seen what
 * it does when nothing is happening, which is most of the time a rail is open.
 */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;
const SPIN = { duration: 1.15, repeat: Number.POSITIVE_INFINITY, ease: "linear" as const };
/** clear of the header's 48px fade, so an anchored first line is not dimmed by it */
const TOP_INSET = 10;
/** the composer's own resting height */
const FIELD_H = 60;
/** how long the rail sits still between turns, so both states are legible */
const REST_MS = 2600;
/**
 * The first send fires on boot rather than after a wait.
 *
 * The rail rests *after* a turn here, not before one, and that is the resting state
 * worth drawing anyway: `no turns yet` is one frame of a thread's life and `13s turn ·
 * 56% waiting` is the rest of it. It also means a still of the boot catches the rail at
 * work instead of catching an empty box.
 */
const OPEN_MS = 50;
/** the composer's own padding: 391px of box inside the shipped 420 rail (#184) */
const CHROME = 29;

/**
 * Where an always-present indicator lives, and what it says.
 *
 *   now   what ships, under the new meter. An unnamed turning row in the log, spliced
 *         out by `answered()` the moment the answer starts. It is here because a
 *         measurement with no baseline decides nothing, and this is the only take that
 *         can put a number on the thing being complained about.
 *   none  nothing anywhere. Round one's winner, carried over so it is compared
 *         rather than remembered.
 *   mark  the spool ribbon, leading the composer footer. It turns while a request is
 *         out and rests otherwise, and it says nothing at all.
 *   line  one mono word pinned to the transcript's bottom edge, always there,
 *         reading `idle`, `working` or `waiting 1.4s`. A word rather than a mark.
 *   fact  the composer footer's readout slot, which carries a fact when nothing is
 *         out and the live count when something is.
 */
export type WaitTake = "now" | "none" | "mark" | "line" | "fact" | "shimmer";

/**
 * A word that is alive because the light moves across it, which is what the two desktop
 * apps actually ship and what `agent-wait--shimmer` proposes.
 *
 * The mechanism is theirs. Claude's `shimmertext` sweeps a gradient over `bg-clip-text`
 * from `background-position: 100% 0` to `0 0`, reaching the end at 65% of the duration
 * and holding there for the rest; Codex's does the same in `steps(48, end)` on a cadence
 * rather than continuously. Both keep the text mounted the whole time and change only
 * whether the sweep is running, so the word never enters and never leaves.
 *
 * **The honest cost, and #149 already paid attention to this.** `background-position` is
 * a paint property, so this animation runs on the main thread rather than the compositor
 * — the same class of thing that disqualified `blur` on `agent-say-arrive`. The
 * difference is scale: that was a per-word filter over a 3,372-character message
 * re-rendering sixty times a second, and this is one seven-letter word. Chromium repaints
 * one text run. Under `prefers-reduced-motion` it does not run at all, which is also what
 * Codex does.
 */
export function ShimmerWord({
	text,
	live,
	cycle = 2250,
	className,
}: {
	text: string;
	live: boolean;
	cycle?: number;
	className?: string | undefined;
}) {
	const still = useReducedMotion() === true;
	if (!live || still)
		return <span className={cn("inline-block text-muted/45", className)}>{text}</span>;
	return (
		<motion.span
			className={cn(
				"inline-block bg-[length:260%_100%] bg-clip-text bg-gradient-to-r from-muted/40 via-text to-muted/40 text-transparent",
				className,
			)}
			initial={{ backgroundPosition: "100% 0%" }}
			animate={{ backgroundPosition: ["100% 0%", "0% 0%", "0% 0%"] }}
			transition={{ duration: cycle / 1000, times: [0, 0.65, 1], repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
		>
			{text}
		</motion.span>
	);
}

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

/**
 * The word at the transcript's edge, which is `line`'s whole take.
 *
 * It is outside the scrolling column and pinned to its bottom, so no amount of log can
 * push it and it can push no log. It is mounted before the first keystroke and it is
 * still mounted after the last row: what changes is the word in it, never whether it is
 * there. The 24px inset the column carries is a constant for the same reason round
 * one's footer take gave one — it is there on an empty thread, so it can never move
 * anything.
 *
 * `waiting` is the only state that carries a number, and the number is the only thing on
 * this line that moves. It is `tabular-nums`, so a digit changing changes no width.
 */
function EdgeLine({
	live,
	ms,
	running,
	sweep,
}: {
	live: boolean;
	ms: number;
	running: boolean;
	/** the aliveness is light moving over the word rather than a digit changing */
	sweep: boolean;
}) {
	const word = live ? "waiting" : running ? "working" : "idle";
	return (
		<div
			data-wait-part="line"
			className="pointer-events-none absolute inset-x-0 bottom-0 flex h-9 items-center gap-2 px-3.5"
		>
			{sweep ? (
				<ShimmerWord text={word} live={live || running} className="shrink-0 font-mono text-sm leading-4" />
			) : (
				<>
					<motion.span
						key={word}
						className={cn("shrink-0 font-mono text-sm leading-4", live ? "text-muted" : "text-muted/45")}
						initial={{ opacity: 0.35 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.18, ease: "linear" }}
					>
						{word}
					</motion.span>
					<span className="shrink-0 font-mono text-sm text-text/80 tabular-nums leading-4">
						{live ? duration(ms) : ""}
					</span>
				</>
			)}
		</div>
	);
}

/**
 * Today's beat, drawn only by `now`: a mark with no verb beside it, in the log, gone
 * the moment the answer starts. `agent-transcript.ts:1124` calls it "one beat, unnamed,
 * turning" and `:894` takes it back out, stating why: "the wait leaves no receipt: it
 * was the absence of an answer rather than a thing that happened."
 *
 * It carries both attributes. `data-edge-key` so the shift meter watches it move like
 * any other row, `data-wait-part` so the churn meter counts it as the indicator it is
 * and not as one of the log's own receipts.
 */
function Beat({ id }: { id: string }) {
	return (
		<div
			data-wait-part="beat"
			className="-mx-1.5 flex h-[26px] w-fit items-center gap-2.5 rounded-sm px-1.5"
			data-beat={id}
		>
			<StateMark state="running" />
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
	take: WaitTake;
	live: boolean;
	waitMs: number;
	running: boolean;
	view: RefObject<HTMLDivElement | null>;
}) {
	const [follow, setFollow] = useState(true);

	const items: Item[] = [];
	const beats = take === "now" ? waits.filter((one) => one.live) : [];
	for (const entry of entries) {
		for (const beat of beats)
			if (beat.before === entry.key) items.push({ key: beat.key, tight: true, node: <Beat id={beat.key} /> });
		if (entry.kind === "user") items.push({ key: entry.key, tight: false, node: <Asked text={entry.text} context={entry.context ?? ""} /> });
		else if (entry.kind === "prose") items.push({ key: entry.key, tight: false, node: <Say entry={entry} /> });
		else if (entry.kind === "line") items.push({ key: entry.key, tight: true, node: <Row entry={entry} /> });
	}
	// a request whose answer has not arrived yet has nothing to sit in front of
	const held = new Set(items.map((item) => item.key));
	for (const beat of beats)
		if (!held.has(beat.key)) items.push({ key: beat.key, tight: true, node: <Beat id={beat.key} /> });

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
					take === "line" || take === "shimmer" ? "pb-10" : "pb-4",
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
			{take === "line" || take === "shimmer" ? (
				<>
					<span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-bg" />
					<EdgeLine live={live} ms={waitMs} running={running} sweep={take === "shimmer"} />
				</>
			) : null}
		</div>
	);
}

/* ---------- the box under it ---------- */

/**
 * What the fact slot says, in every state a turn has.
 *
 * The rest state is the reason this take exists. An object that appears is objected to;
 * an object that is always there and always saying something true may not be. So the
 * slot is never blank and never a placeholder: before the first turn it says it has
 * nothing to report, during a turn it counts, and afterwards it keeps the two numbers
 * that turn out to be the whole ticket.
 */
function factLine(sent: number, total: number, live: boolean, waitMs: number, waited: number, turnMs: number): string {
	if (sent === 0 && turnMs === 0) return "no turns yet";
	if (live) return `waiting ${duration(waitMs)} · ${sent} of ${total}`;
	if (turnMs === 0) return `${duration(waited)} waiting so far`;
	const share = Math.round((waited / Math.max(1, turnMs)) * 100);
	return `${duration(turnMs)} turn · ${share}% waiting`;
}

/**
 * The widest sentence the slot can ever hold, which is what it reserves.
 *
 * Derived rather than typed, on #186's own rule: a panel that opens upward reserves its
 * tallest sentence, and a readout between two things that can move reserves its widest.
 * The four shapes are asked for their own strings against this script's real numbers and
 * the longest wins, so nothing here can go stale when the copy changes.
 */
const FACT_WIDEST = [
	factLine(0, 0, false, 0, 0, 0),
	factLine(4, EDGE_SCRIPT.waits.length, true, 2682, 0, 0),
	factLine(4, EDGE_SCRIPT.waits.length, false, 0, EDGE_SCRIPT.waited, 0),
	factLine(4, EDGE_SCRIPT.waits.length, false, 0, EDGE_SCRIPT.waited, EDGE_SCRIPT.total),
].reduce((longest, one) => (one.length > longest.length ? one : longest), "");

/**
 * The composer footer, at #184's resolved shape: the model and the stop and nothing
 * else, the name truncating and never shortening, the stop `shrink-0`. Two takes move
 * into it, so it measures itself the way `agent-footer-fit` does — the row is drawn
 * twice and the invisible `w-max` copy is asked how wide it would like to be, because a
 * flex row with a truncating child absorbs its own overflow and reports fitting while
 * it is visibly cutting text off.
 */
function Composer({
	take,
	running,
	live,
	fact,
	onStop,
	onWanted,
}: {
	take: WaitTake;
	running: boolean;
	live: boolean;
	fact: string;
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

	/* the ghost copy carries no marker: it is a measuring instrument rather than a second
	   indicator, and counting its elements would double every number this row reports */
	const row = (ghost: boolean) => (
		<>
			{take === "mark" ? <FooterMark live={live} ghost={ghost} /> : null}
			{/* the chevron is #184's: the model is a menu trigger, and the 160 that ticket
			    measured includes it. Without it the row measured here would be 12px light
			    and would not be comparable to the number it is being argued against. */}
			<span className="flex min-w-0 items-center gap-1 font-mono text-2xs text-muted/60 leading-3">
				<span className="min-w-0 truncate">Opus (1M context) · high</span>
				<ChevronIcon open={false} className="h-2 w-2 shrink-0" />
			</span>
			{take === "fact" ? (
				<span
					{...(ghost ? {} : { "data-wait-part": "fact" })}
					className="relative shrink-0 font-mono text-2xs text-muted/60 leading-3 tabular-nums"
				>
					<span aria-hidden="true" className="invisible">
						{FACT_WIDEST}
					</span>
					<span className={cn("absolute top-0 left-0 whitespace-pre", live && "text-text/80")}>{fact}</span>
				</span>
			) : null}
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
			<div className="relative">
				<div className="flex h-[18px] items-center gap-2.5 overflow-hidden">{row(false)}</div>
				<div
					ref={ghost}
					aria-hidden="true"
					className="pointer-events-none invisible absolute top-0 left-0 flex h-[18px] w-max items-center gap-2.5"
				>
					{row(true)}
				</div>
			</div>
		</div>
	);
}

/** degrees a millisecond, at the 1.15s revolution every other spinner in the rail turns at */
const RATE = 360 / (SPIN.duration * 1000);
/** the floor it coasts home at, so the last revolution takes about four seconds */
const COAST = RATE * 0.26;

/**
 * The ribbon in the footer, which is `mark`'s whole take.
 *
 * It is one element for the life of the rail. Turning is a transform on it, and a
 * transform is the one change that cannot move a neighbour: the box is the same 14px
 * whether it is spinning or still, so nothing in this row can be pushed by it. What
 * separates the two states is speed and one step of colour, because a mark cannot say a
 * word.
 *
 * **It is driven by hand rather than by a repeating keyframe, for two reasons that are
 * the same reason.** A `repeat: Infinity` rotation animating back to `rotate: 0` unwinds
 * — the logo visibly runs backwards when the answer lands — and a class toggled off
 * snaps it upright in one frame. Both are the entrance-and-exit problem again, in a
 * property instead of in the DOM. So the angle is a motion value and the *rate* is what
 * eases: it spins up over about a quarter second, and when the request lands it slows to
 * a coast and keeps going until it is upright again, then stops. It never reverses and
 * it never parks crooked, which a mark with a shape has to care about and a ring does
 * not.
 *
 * It is the brand, so it is the brand's own red while there is a request out and the
 * footer's grey when there is not. A logo sitting at full strength in the corner of a
 * tool you keep open all day is a sticker; a logo at full strength only while the thing
 * is thinking is a status.
 */
function FooterMark({ live, ghost = false }: { live: boolean; ghost?: boolean }) {
	const still = useReducedMotion() === true;
	const angle = useMotionValue(0);
	const rate = useRef(0);
	const homing = useRef(false);

	useAnimationFrame((_time: number, delta: number) => {
		if (still) return;
		// a backgrounded tab hands back one enormous delta; clamping it keeps the
		// wind-down from teleporting through the upright it is aiming for
		const step = Math.min(delta, 50);
		if (live) {
			homing.current = false;
			rate.current += (RATE - rate.current) * Math.min(1, step / 240);
		} else if (rate.current > 0) {
			homing.current = true;
			rate.current = Math.max(COAST, rate.current - (RATE / 380) * step);
		}
		if (rate.current <= 0) return;
		const next = angle.get() + rate.current * step;
		if (homing.current && next >= 360) {
			angle.set(0);
			rate.current = 0;
			homing.current = false;
			return;
		}
		angle.set(next % 360);
	});

	return (
		<span
			{...(ghost ? {} : { "data-wait-part": "mark" })}
			className={cn(
				"flex h-3.5 w-3.5 shrink-0 items-center justify-center transition-colors duration-500",
				live ? "text-thread" : "text-muted/35",
			)}
		>
			<motion.span className="flex h-full w-full" style={{ rotate: angle }}>
				<SpoolMark className="h-full w-full" />
			</motion.span>
		</span>
	);
}

/* ---------- the frame ---------- */

/** the round-one numbers, on every frame, because they are what this is being decided against */
function Carried() {
	return (
		<p className="font-mono text-2xs text-muted/35 leading-4">
			carried: 12 waits a turn · 56% of it waiting · ttft {TTFT_MEASURED.min}/{TTFT_MEASURED.median}/
			{TTFT_MEASURED.max}ms · now moved 38.3px
		</p>
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

export function WaitFrame({
	take,
	title,
	claim,
	notes,
}: {
	take: WaitTake;
	/** what this take is, in one mono line */
	title: string;
	/** what it claims, which the two meters beside it either back or do not */
	claim: string;
	notes: readonly string[];
}) {
	const turn = useTurn(EDGE_SCRIPT.cues);
	const elapsed = useTicker(turn.run, EDGE_SCRIPT.total);
	/** the scrolling column, which is what movement is measured against */
	const view = useRef<HTMLDivElement>(null);
	/* the whole rail, which is what churn is counted over: three of the four takes put
	   their indicator outside the scroll box on purpose, and an instrument that could
	   only see inside it would report every one of them as absent */
	const rail = useRef<HTMLDivElement>(null);
	const [wanted, setWanted] = useState<number | null>(null);
	const { entries, waits } = edgeLog(EDGE_SCRIPT, turn, elapsed);
	const running = turn.phase === "playing";
	const shift = useShift(view, turn.run, running);
	const churn = useChurn(rail, turn.run, running);

	const wait = waits.find((one) => one.live);
	const live = wait !== undefined;
	const waited = waits.reduce((sum, one: EdgeWait) => sum + (one.live ? one.ms : one.ttft), 0);
	const fact = factLine(
		waits.length,
		EDGE_SCRIPT.waits.length,
		live,
		wait?.ms ?? 0,
		waited,
		turn.phase === "settled" ? EDGE_SCRIPT.total : 0,
	);

	/* rest, run, rest, again. The resting state is half of every take here, so a frame
	   that only ever plays is only ever showing half of what it proposes. */
	useEffect(() => {
		if (turn.phase === "playing") return;
		const idle = turn.phase === "idle";
		const timer = window.setTimeout(() => {
			if (idle) turn.send(EDGE_ASK);
			else turn.replay();
		}, idle ? OPEN_MS : REST_MS);
		return () => window.clearTimeout(timer);
	}, [turn.phase, turn.send, turn.replay]);

	const share = churn.ofMs === 0 ? 0 : Math.round((churn.onMs / churn.ofMs) * 100);
	const box = 420 - CHROME;

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div ref={rail} className="flex min-h-0 flex-1 flex-col">
				<Transcript
					entries={entries}
					waits={waits}
					take={take}
					live={live}
					waitMs={wait?.ms ?? 0}
					running={running}
					view={view}
				/>
				<Composer
					take={take}
					running={running}
					live={live}
					fact={fact}
					onStop={turn.cut}
					onWanted={setWanted}
				/>
			</div>
			<div className="flex h-[276px] shrink-0 flex-col gap-2 border-border border-t bg-surface/40 px-3.5 py-3">
				<div className="flex items-baseline gap-2">
					<span className="shrink-0 font-mono text-2xs text-text leading-3">{title}</span>
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted/45 leading-3">
						{turn.phase === "playing" ? "running" : "resting"}
					</span>
				</div>
				<p className="font-mono text-2xs text-muted/60 leading-4">{claim}</p>
				<div className="flex h-4 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="enters" value={String(churn.enters)} hot={churn.enters > 0} />
					<Meter label="leaves" value={String(churn.leaves)} hot={churn.leaves > 0} />
					<Meter label="on screen" value={`${share}%`} hot={false} />
				</div>
				<div className="flex h-4 items-baseline gap-3 overflow-hidden font-mono text-2xs leading-4">
					<Meter label="moved down" value={`${shift.worst}px`} hot={shift.worst > 0} />
					<span className="shrink-0 text-muted/45">
						<span className="text-text tabular-nums">{shift.moves}</span> of {shift.frames} frames
					</span>
					<span className="shrink-0 text-muted/45">
						rows <span className="text-text tabular-nums">{churn.rowsIn}</span> in ·{" "}
						<span className="text-text tabular-nums">{churn.rowsOut}</span> out
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
					{wanted !== null && wanted > box ? <span className="shrink-0 text-thread">over</span> : null}
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
