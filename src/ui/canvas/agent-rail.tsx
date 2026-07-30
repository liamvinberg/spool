import { useEffect, useRef, useState } from "react";
import { cn } from "../cn";
import { AgentIcon } from "../icons";
import { closedText } from "./agent-markers";
import { Caret, Said } from "./agent-said";
import { Shot } from "./agent-shot";
import type { TurnPhase } from "./agent-stream";
import { type AgentEntry, type AgentPlan, type AgentRow, duration, type RowState, shownBy } from "./agent-transcript";
import { ChevronIcon, PanelCaret } from "./sidebar";

/**
 * The agent rail (#144, #192, #193, #194): the right rail, whole, drawn as one
 * conversation.
 *
 * There is no tab row. The agent owns this column — `elements` died with the
 * inspector and `connections` left for the ambient walk layer — so the rail is the
 * transcript and the composer and nothing between them. What that buys is the width:
 * at 420 a tab row is a whole line of a narrow column spent saying which of two
 * things you are looking at, and there is only one thing to look at.
 *
 * Five things render and nothing else: the plan, the human's words, the agent's
 * words, one quiet beat for the time the model spends composing, and one line per
 * tool call. Threads, chips and the model readout are later tickets, and this reads
 * correctly without them.
 *
 * One line is the rule, and the test for the exception is whether the thing outlives
 * the call that made it. A row is a mark, a verb and a subject, with everything else
 * behind a disclosure closed by default that nobody has to open — so a nine-minute
 * turn is still something to skim, and the detail is one click down rather than in
 * the way. The plan is the one thing that earns a place off the line, because it goes
 * on changing for the rest of the turn; a screenshot does not, so it is a real
 * thumbnail behind a disclosure.
 *
 * The name is the place and the rest of the row is still the call. Clicking a frame's
 * name takes the canvas there; the verb, the count and the disclosure open the
 * detail. The click had to be split because the disclosure already owned it.
 *
 * State is motion, not colour. A row is running while a colourless ring turns and
 * settled once a stroke has drawn itself through the space it leaves. The accent
 * stays with the selection, which is the one thing on screen the human owns.
 */

/**
 * The rail's default, inside the drag range it has always had.
 *
 * `inspector.tsx` shipped 300 in the same 200–480 range; #144 moved the default to
 * 420 because the transcript is a column of prose rather than a list of names.
 * Nothing below may assume it: the range is the constraint every later footer and
 * strip decision is measured against.
 */
const RAIL_WIDTH = 420;

const STRIP_WIDTH = 44;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const SNAP_BELOW = 144;
const COLLAPSED_BELOW = 72;

/** clear of the top fade, so an anchored first line is not dimmed by it */
const TOP_INSET = 10;

/** the mark's own width and the gap beside it, so a disclosure lines up under the verb */
const INDENT = 14 + 10;

/**
 * How much of an arriving message is still treated as live, in drawn characters.
 *
 * About a second at the measured 171 characters a second, which is longer than the
 * arrival animation, so a word always finishes before it stops being live.
 */
const LIVE_TAIL = 150;

const MIN_H = 60;
const MAX_H = 160;

/**
 * What a row can do about the frame it names (#143, #194).
 *
 * Absence is handed in rather than inferred, because two states look identical from
 * inside the rail and read as opposites: a frame the turn is one beat from writing,
 * and a frame the project had and lost. Only the second is struck, so only the canvas
 * can tell them apart — it is the thing that watched the folder.
 */
export interface FrameJump {
	/** the frames the project has right now; a name outside this is not a place to go */
	readonly have: ReadonlySet<string>;
	/** the frames it had and no longer has, which read as gone and do nothing */
	readonly gone: ReadonlySet<string>;
	/** the cursor is on a row naming this frame, or has left; answered out on the canvas */
	readonly onPoint: (frame: string | null) => void;
	readonly onJump: (frame: string) => void;
}

export function AgentRail({
	entries,
	plan,
	phase,
	elapsed,
	last,
	jump,
	onSend,
}: {
	entries: readonly AgentEntry[];
	/** the plan, off the log and onto the shelf; absent until the turn writes one */
	plan: AgentPlan | null;
	phase: TurnPhase;
	elapsed: number;
	last: number;
	jump: FrameJump;
	onSend: (text: string) => void;
}) {
	const [width, setWidth] = useState(RAIL_WIDTH);
	const [dragging, setDragging] = useState(false);
	const drag = useRef<{ pointerId: number; startWidth: number; startX: number; latestWidth: number } | null>(null);
	const collapsed = width <= COLLAPSED_BELOW;

	function finishDrag(target: HTMLElement, pointerId: number) {
		const current = drag.current;
		if (current === null || current.pointerId !== pointerId) return;
		target.releasePointerCapture(pointerId);
		drag.current = null;
		setDragging(false);
		setWidth(current.latestWidth < SNAP_BELOW ? STRIP_WIDTH : Math.max(MIN_WIDTH, current.latestWidth));
	}

	return (
		<aside
			aria-label="Agent"
			data-agent-rail=""
			style={{ width }}
			className={cn(
				"relative z-20 h-full shrink-0 overflow-hidden border-border border-l bg-bg",
				dragging
					? ""
					: "transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
			)}
			onPointerDown={(event) => event.stopPropagation()}
			onPointerMove={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onContextMenu={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
		>
			{collapsed ? (
				<div className="flex h-full w-11 flex-col items-center">
					<button
						type="button"
						aria-label="Expand agent"
						onClick={() => setWidth(RAIL_WIDTH)}
						className="flex h-11 w-11 items-center justify-center text-muted/70 hover:text-text"
					>
						<AgentIcon />
					</button>
				</div>
			) : (
				<div className="flex h-full min-w-[200px] flex-col">
					{plan === null ? null : <PlanStrip plan={plan} />}
					<Transcript entries={entries} elapsed={elapsed} last={last} jump={jump}>
						{/* the caret rides the transcript's own top fade rather than a row of its
						    own: #144's whole finding is that a line of a 420px column is too
						    expensive to spend on chrome, and it is #136's threads strip that will
						    carry this glyph once there is more than one thread to carry */}
						<button
							type="button"
							aria-label="Collapse agent"
							onClick={() => setWidth(STRIP_WIDTH)}
							className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-sm text-muted/40 transition-colors hover:text-text"
						>
							<PanelCaret dir="right" className="h-3.5 w-2.5" />
						</button>
					</Transcript>
					<Composer phase={phase} onSend={onSend} />
				</div>
			)}

			<button
				type="button"
				aria-label="Resize agent"
				onKeyDown={(event) => {
					// a focused grip answers its arrows itself; stop them short of the hotkey
					// dispatch, or the same press would nudge the selection
					if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
					event.stopPropagation();
					if (event.key === "ArrowLeft") setWidth(RAIL_WIDTH);
					if (event.key === "ArrowRight") setWidth(STRIP_WIDTH);
				}}
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					drag.current = {
						pointerId: event.pointerId,
						startWidth: width,
						startX: event.clientX,
						latestWidth: width,
					};
					setDragging(true);
				}}
				onPointerMove={(event) => {
					const current = drag.current;
					if (current === null || current.pointerId !== event.pointerId) return;
					const next = Math.min(
						MAX_WIDTH,
						Math.max(STRIP_WIDTH, current.startWidth + current.startX - event.clientX),
					);
					current.latestWidth = next;
					setWidth(next);
				}}
				onPointerUp={(event) => finishDrag(event.currentTarget, event.pointerId)}
				onPointerCancel={(event) => finishDrag(event.currentTarget, event.pointerId)}
				className="group -left-1.5 absolute top-0 z-30 h-full w-3 cursor-col-resize touch-none outline-none"
			>
				<span className="absolute top-0 right-[5px] bottom-0 w-px bg-transparent group-hover:bg-thread group-focus-visible:bg-thread" />
			</button>
		</aside>
	);
}

/* ---------- the plan, out of the log ----------
 * A transcript is a log and a log scrolls. Everything else in one is finished the
 * moment it is drawn, so scrolling costs nothing; the plan is the exception, because
 * it goes on changing for the rest of the turn. Measured on the capture, it is written
 * in nine seconds and its first task does not land for another eight minutes and
 * sixteen rows, by which point a transcript has carried it off the top and the tick
 * lands where nobody is looking.
 *
 * So it comes out of the log and sits above it, and it obeys the one-line rule while
 * it does: a count, and the agent's own present-participle phrasing for whatever is
 * running. Both phrasings are the agent's — `TaskCreate` ships the written form and
 * the participle together, precisely so that a surface never invents a friendlier
 * one. The list is a click away and is not the resting state, because seven tasks
 * permanently open is a hundred and fifty pixels of rail answering a question nobody
 * asked twice.
 *
 * The cost is on screen and it is honest: thirty-four pixels of rail for as long as
 * there is a plan. It is absent until one is written, which most turns never do. */

function PlanStrip({ plan }: { plan: AgentPlan }) {
	const [open, setOpen] = useState(false);
	return (
		<div data-agent-plan="" className="flex shrink-0 flex-col border-border border-b">
			<button
				type="button"
				aria-label="plan"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="flex h-[34px] w-full shrink-0 items-center gap-2.5 px-3.5 text-left transition-colors duration-150 hover:bg-surface"
			>
				<span className="shrink-0 font-mono text-muted text-sm leading-4">plan</span>
				<span className="shrink-0 font-mono text-muted/60 text-sm tabular-nums leading-4">
					{plan.done}/{plan.total}
				</span>
				{/* nothing is running between a task landing and the agent saying which is next,
				    and the strip says nothing rather than holding the last thing it said */}
				{plan.running === null ? null : (
					<span className="min-w-0 flex-1 truncate font-mono text-sm text-text/85 leading-4">{plan.running}</span>
				)}
				<ChevronIcon open={open} className="ml-auto h-2.5 w-2.5 shrink-0 text-muted/35" />
			</button>
			{open ? (
				<div className="relative flex shrink-0 flex-col pb-2 pl-[18px]">
					{/* the rule stands where the list hangs from, a little in from the strip's own
					    left edge, so the tasks read as belonging to the line above them */}
					<span className="absolute top-1 bottom-3 left-[18px] w-px bg-border-raised" />
					{plan.tasks.map((task) => (
						<span key={task.key} className="flex h-[22px] items-center gap-2 pl-2.5">
							<StateMark state={task.state} className="h-3 w-3" />
							<span className="truncate font-mono text-2xs text-muted leading-3">{task.name}</span>
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

/* ---------- the transcript ----------
 * It follows the live end while the reader is already there, and stops the moment
 * they scroll up to read something: a log that yanks itself back down mid-sentence
 * is worse than one that does not follow at all.
 *
 * What it anchors is the *top* of the live entry rather than the bottom of the log.
 * A 3,372-character message is over a thousand pixels against a transcript of about
 * five hundred, and following its end drives its first line — where the verdict is —
 * out of view before it has been read, at 171 characters a second for twenty seconds.
 * One clamp does both cases: the scroll that puts the entry's first line at the top
 * falls below the maximum scroll exactly when the entry is taller than the box, so a
 * short entry keeps ordinary follow-the-end and a tall one pins its own first line
 * and fills downward. */

function Transcript({
	entries,
	elapsed,
	last,
	jump,
	children,
}: {
	entries: readonly AgentEntry[];
	elapsed: number;
	last: number;
	jump: FrameJump;
	children: React.ReactNode;
}) {
	const view = useRef<HTMLDivElement>(null);
	const [follow, setFollow] = useState(true);
	/**
	 * The scroll this box just performed on itself.
	 *
	 * Without it, following ends the moment it starts working: anchoring a tall entry's
	 * first line leaves the box well short of its own end, the assignment fires
	 * `onScroll`, and the distance test below reads that as the reader having scrolled
	 * up. One entry would be pinned and then nothing else for the rest of the turn.
	 * Only an assignment that really moves the box is flagged, so the flag is always
	 * spent by the event it caused.
	 */
	const ours = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the entry list is what moves the end
	useEffect(() => {
		const box = view.current;
		if (box === null || !follow) return;
		const end = box.scrollHeight - box.clientHeight;
		const tail = box.firstElementChild?.lastElementChild;
		const top =
			tail instanceof HTMLElement
				? box.scrollTop + (tail.getBoundingClientRect().top - box.getBoundingClientRect().top) - TOP_INSET
				: end;
		const target = Math.max(0, Math.min(top, end));
		if (box.scrollTop === target) return;
		ours.current = true;
		box.scrollTop = target;
	}, [entries, follow]);

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<div
				ref={view}
				onScroll={(event) => {
					if (ours.current) {
						ours.current = false;
						return;
					}
					const box = event.currentTarget;
					setFollow(box.scrollHeight - box.scrollTop - box.clientHeight < 24);
				}}
				className="pages-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-6 pb-4"
			>
				{/* `mt-auto` rather than `justify-end`: a flex container that end-justifies its
				    overflow puts the top of it out of reach of the scrollbar */}
				<div className="mt-auto shrink-0">
					{entries.map((entry, index) => (
						<div
							key={entry.key}
							className="animate-agent-entry shrink-0"
							style={{ paddingTop: gapBefore(entries[index - 1], entry) }}
						>
							<Entry entry={entry} elapsed={elapsed} last={last} jump={jump} />
						</div>
					))}
				</div>
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
			{children}
		</div>
	);
}

/** consecutive machine work reads as one run, so it sits tighter than a turn boundary */
function gapBefore(previous: AgentEntry | undefined, entry: AgentEntry): number {
	if (previous === undefined) return 0;
	const machine = (candidate: AgentEntry) => candidate.kind === "beat" || candidate.kind === "row";
	if (machine(previous) && machine(entry)) return 6;
	return 14;
}

function Entry({ entry, elapsed, last, jump }: { entry: AgentEntry; elapsed: number; last: number; jump: FrameJump }) {
	if (entry.kind === "user") {
		return (
			<div className="relative flex flex-col gap-1.5 pl-3.5">
				<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
				<p className="whitespace-pre-wrap text-base text-text leading-base">{entry.text}</p>
			</div>
		);
	}
	if (entry.kind === "note") {
		// a boundary reaches across the rail because what it says applies to everything
		// under it: above it happened, below it did not
		return (
			<div className="flex items-center gap-2.5 py-0.5">
				<span className="h-px flex-1 bg-border" />
				<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{entry.text}</span>
				<span className="h-px flex-1 bg-border" />
			</div>
		);
	}
	if (entry.kind === "row") return <Row entry={entry} jump={jump} />;
	if (entry.kind === "beat") {
		/*
		 * A beat's duration is the wire's, read off the same clock the prose is paced by.
		 * A beat nobody closed — a stream that died mid-turn — stops at the last event
		 * rather than climbing forever, and an infinite clock is the settled case where
		 * `until` is always set.
		 */
		const now = Number.isFinite(elapsed) ? elapsed : last;
		const ran = Math.max(0, (entry.until ?? Math.max(entry.since, now)) - entry.since);
		return (
			<div className="-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 px-1.5">
				<StateMark state={entry.state} />
				<span className="flex min-w-0 items-baseline gap-1.5">
					{entry.verb === null ? null : (
						<span className="font-mono text-muted/70 text-sm leading-4">{entry.verb}</span>
					)}
					<span className="min-w-0 truncate font-mono text-muted/60 text-sm tabular-nums leading-4">
						{duration(ran)}
					</span>
				</span>
			</div>
		);
	}
	return <Prose entry={entry} elapsed={elapsed} />;
}

/* ---------- one tool call, one line ----------
 * A mark, a verb and a subject, and the payload the projection kept separate stays
 * off the line until somebody asks for it. A nine-minute turn is nineteen of these
 * and still readable, which is the whole reason the rule is one line; what the words
 * are and where they come from is `agent-nouns.ts`.
 *
 * The name is the place and the rest of the row is still the call (#143). The verb and
 * the count are about the call — six edits happened, here is the file they happened
 * to — and the name is about the frame, which outlives the call. Two objects, two
 * targets, split where the row's own grammar already splits. Giving the whole row to
 * the frame lost on consistency, because the click was already spent on the disclosure
 * and two identical-looking rows would then do different things.
 *
 * The count is its own box beside the subject rather than part of it, because linking
 * the count would say the count is part of the place.
 *
 * The accent is per row and never per name. Pointing is per frame, and a transcript
 * that names one frame twelve times would light all twelve rows at once off a shared
 * `pointed` — so what marks the name is this row's own cursor, and what the pointing
 * produces is a ring out on the canvas or a lit page in the Pages rail. */

function Row({ entry, jump, nested = false }: { entry: AgentRow; jump: FrameJump; nested?: boolean }) {
	/**
	 * Whether the disclosure has been pressed, and which way.
	 *
	 * Undefined is nobody having touched it, which is not the same as closed: a row
	 * holding a picture opens itself, because the picture is the one payload worth
	 * showing unasked. A press still wins after that, either way.
	 */
	const [clicked, setClicked] = useState<boolean | undefined>(undefined);
	/**
	 * The cursor is on this row.
	 *
	 * Held here rather than left to `:hover` because the mark belongs to the name and
	 * the hit area is the name, so the row has to know the cursor is inside it — and
	 * held per row rather than keyed on the frame, which is the whole rule above.
	 */
	const [over, setOver] = useState(false);
	const shot = entry.shot;
	const holds = entry.detail !== null || shot !== null || entry.delegated.length > 0;
	const open = holds && (clicked ?? shot !== null);

	/*
	 * The name is a place, a place that is not there yet, or a place that was. Only the
	 * last of the three is struck: a frame this turn is one beat from writing is absent
	 * in exactly the same way, and it is one beat from existing, so it reads as an
	 * ordinary word and does nothing.
	 */
	const frame = entry.frame;
	const goes = frame !== null && jump.have.has(frame);
	const gone = frame !== null && jump.gone.has(frame);
	/** what this row is pointing at, so an unmount with the cursor on it can take it back */
	const pointing = useRef<string | null>(null);
	const unpoint = useRef(jump.onPoint);
	unpoint.current = jump.onPoint;
	const point = (on: boolean) => {
		setOver(on);
		if (!goes || frame === null) return;
		pointing.current = on ? frame : null;
		jump.onPoint(on ? frame : null);
	};
	// a row can leave while the cursor is on its name — a disclosure shutting takes a
	// delegate's rows with it — and a ring nothing is pointing at would stay lit
	useEffect(
		() => () => {
			if (pointing.current !== null) unpoint.current(null);
		},
		[],
	);

	const name =
		entry.subject === null ? null : (
			<span
				className={cn(
					"min-w-0 truncate font-mono text-sm leading-4",
					// struck through and dimmed, in the words the canvas already uses for a name
					// nothing answers to
					gone ? "text-muted/45 line-through" : "text-text/85",
					// the only mark the name carries, and only while the cursor is on its row: a
					// dotted rule is the lightest thing that says this word is a place
					goes && over && "underline decoration-dotted decoration-thread/60 underline-offset-[3px]",
				)}
			>
				{entry.subject}
			</span>
		);
	const line = (
		<>
			<StateMark state={entry.state} />
			<span className="flex min-w-0 items-baseline gap-1.5">
				<span className="shrink-0 font-mono text-muted text-sm leading-4">{entry.verb}</span>
				{goes ? (
					// biome-ignore lint/a11y/useSemanticElements: this row is the disclosure's button, and a button cannot contain an anchor
					<span
						role="link"
						tabIndex={0}
						data-agent-jump={frame}
						onClick={(event) => {
							event.stopPropagation();
							if (frame !== null) jump.onJump(frame);
						}}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.stopPropagation();
							event.preventDefault();
							if (frame !== null) jump.onJump(frame);
						}}
						onMouseEnter={() => point(true)}
						onMouseLeave={() => point(false)}
						className="flex min-w-0 cursor-pointer"
					>
						{name}
					</span>
				) : (
					name
				)}
				{entry.count > 1 ? (
					<span
						className={cn(
							"shrink-0 font-mono text-sm tabular-nums leading-4",
							gone ? "text-muted/45" : "text-text/85",
						)}
					>
						×{entry.count}
					</span>
				) : null}
			</span>
		</>
	);
	// the spoken form of the same line, because the words are separate boxes to lay out
	// and one run of text to read
	const said = [entry.verb, entry.subject, entry.count > 1 ? `×${entry.count}` : null].filter(Boolean).join(" ");
	const row = "-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5 text-left";
	if (!holds)
		return (
			<div data-agent-row={said} data-agent-nested={nested ? "" : undefined} className={row}>
				{line}
			</div>
		);
	return (
		<div data-agent-row={said} data-agent-nested={nested ? "" : undefined} className="flex flex-col">
			<button
				type="button"
				aria-label={said}
				aria-expanded={open}
				onClick={() => setClicked(!open)}
				className={cn(row, "hover:bg-surface")}
			>
				{line}
				<ChevronIcon open={open} className="ml-0.5 h-2.5 w-2.5 shrink-0 text-muted/35" />
			</button>
			{open ? (
				<div className="flex flex-col pt-0.5 pb-1" style={{ paddingLeft: INDENT }}>
					{/* the picture takes the payload's place rather than sitting under a line of
					    file metadata: `image/png` is a fact about a file and the row above already
					    said `look`. The caption is dropped where the line already carries it, since
					    every shot in the captures is of the frame its own row names. */}
					{shot === null ? null : (
						<Shot shot={shot} of={entry.frame ?? entry.detail} quiet={entry.frame === entry.subject} />
					)}
					{shot === null && entry.detail !== null ? (
						<span data-agent-detail="" className="block truncate font-mono text-2xs text-muted/55 leading-4">
							{entry.detail}
						</span>
					) : null}
					{/*
					 * A sub-agent is one row that expands into its own transcript (#194). What is in
					 * here is rows rather than a summary, because for a delegate the place is the
					 * canvas: its frames land out there and a row is how you get to one, so they
					 * navigate on the same rule as everything else.
					 */}
					{entry.delegated.length > 0 ? (
						<div className="relative flex flex-col">
							<span className="absolute top-1 bottom-1 left-0 w-px bg-border-raised" />
							{entry.delegated.map((theirs) => (
								<div key={theirs.key} className="animate-agent-entry pl-2.5">
									<Row entry={theirs} jump={jump} nested={true} />
								</div>
							))}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

/**
 * One block of the agent's prose, however much of it has arrived.
 *
 * The block holds the height of everything that has *landed* rather than the height
 * of what is drawn, which is the pace's lag — up to 0.8s of text the wire has sent
 * and the edge has not reached. That much is reserved so the last lines do not walk
 * in one at a time under the reader. It is not the finished message's height and
 * cannot be: the wire has not sent the rest yet.
 *
 * Rendered, that reserve cannot be a hidden copy of the same string — a half-typed
 * `**bold` is not the geometry of a finished `**bold**` — so it is the landed text
 * drawn invisibly with the arriving one drawn over it.
 */
function Prose({ entry, elapsed }: { entry: Extract<AgentEntry, { kind: "prose" }>; elapsed: number }) {
	const upto = shownBy(entry, elapsed);
	const streaming = upto < entry.full.length;
	if (!streaming) return <Said text={entry.full} />;
	/*
	 * `closedText` closes a marker the message has not finished writing, which is the
	 * thing that made streaming markdown jitter: `**The shot failed` renders as two
	 * literal asterisks in body weight, and when the closing `**` lands 200ms later the
	 * asterisks vanish, the run goes bold, and the paragraph re-wraps under the line
	 * being read. An unterminated fence is worse — it swallows the rest of the message
	 * into a `<pre>`. Closed instead, what is drawn is always a prefix of what will be.
	 */
	const shown = closedText(entry.full.slice(0, upto));
	return (
		<div className="relative">
			<div className="invisible" aria-hidden="true">
				<Said text={entry.full} />
			</div>
			{/* the arriving copy, and the only place in the rail that holds a partial
			    message: it is addressable so a test can ask how much has landed */}
			<div data-agent-prose="" className="absolute inset-0">
				<Said text={shown} live={Math.min(LIVE_TAIL, shown.length)} caret={<Caret />} />
			</div>
		</div>
	);
}

/* ---------- the mark ----------
 * The most repeated moment in the rail is a row going from running to done, so it is
 * one gesture rather than two pictures: the ring shrinks away while the stroke draws
 * itself through the space it is leaving. The overlap is what makes it read as the
 * same object settling.
 *
 * Three endings, because a stop is neither of the other two. Done is two strokes
 * meeting, failed is two crossing, and a call the developer stopped is a single flat
 * one — it did not succeed, it did not fail, it was cut — drawn short of the full
 * width so it reads as a stub rather than a minus sign. Nothing is coloured: the
 * accent belongs to the selection, and a refusal is not an alarm, because nine times
 * out of ten the developer caused it.
 *
 * `pending` is the same ring with the arc taken off it and nothing turning, so a list
 * at rest has no motion in it at all. No work row is ever pending — a call is running
 * from the moment its block opens — and it is drawn here because the plan's own tasks
 * are written down long before they start (#194). */

const CHECK = "m3.4 7.2 2.4 2.4 4.8-5.2";

/**
 * The strokes each ending draws, as a fixed pair so the mark is one element that
 * changes rather than two that swap.
 *
 * The stroke has to be mounted before it draws — a dash offset only animates on an
 * element that was already there — so a row that is still running holds the check's
 * geometry at zero length, and whichever ending arrives replaces the path in place
 * and lets it draw.
 */
const STROKES: Record<RowState, readonly [string, string | null]> = {
	pending: [CHECK, null],
	running: [CHECK, null],
	done: [CHECK, null],
	failed: ["M4.2 4.2l5.6 5.6", "M9.8 4.2l-5.6 5.6"],
	stopped: ["M4.4 7h5.2", null],
};

function StateMark({ state, className }: { state: RowState; className?: string }) {
	const turning = state === "running";
	const ringed = turning || state === "pending";
	const settled = !ringed;
	const [first, second] = STROKES[state];
	const strokes: { key: string; d: string; drawn: boolean; delay: number }[] = [
		{ key: "one", d: first, drawn: settled, delay: 75 },
		{ key: "two", d: second ?? first, drawn: settled && second !== null, delay: 135 },
	];
	return (
		<span className={cn("relative flex h-3.5 w-3.5 shrink-0", className)}>
			<span
				className={cn(
					"absolute inset-0 transition-[opacity,transform] duration-200 ease-in motion-reduce:transition-none",
					ringed ? "opacity-100" : "scale-[0.62] opacity-0",
				)}
			>
				<svg
					viewBox="0 0 14 14"
					className={cn(
						turning ? "text-text/60" : "text-text/35",
						"h-full w-full",
						turning && "animate-agent-spin",
					)}
					fill="none"
					aria-hidden="true"
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					{turning ? (
						<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					) : null}
				</svg>
			</span>
			<svg viewBox="0 0 14 14" className="absolute inset-0 h-full w-full text-muted" fill="none" aria-hidden="true">
				{strokes.map((stroke) => (
					// `pathLength` normalises the stroke to 1 unit, so the dash offset draws it
					// without anything having to measure the geometry first
					<path
						key={stroke.key}
						d={stroke.d}
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						pathLength={1}
						className="transition-[stroke-dashoffset,opacity] duration-300 ease-out motion-reduce:transition-none"
						style={{
							strokeDasharray: 1,
							strokeDashoffset: stroke.drawn ? 0 : 1,
							opacity: stroke.drawn ? 1 : 0,
							// the second stroke of a cross follows the first rather than racing it
							transitionDelay: `${stroke.delay}ms`,
						}}
					/>
				))}
			</svg>
		</span>
	);
}

/* ---------- the composer ----------
 * One bounded box the whole message is typed into. Enter sends what is in it
 * verbatim, whatever that is; shift-Enter is a newline. A turn already in flight
 * refuses the press rather than taking it, because every send spawns an agent and
 * two of them writing one repo is not a thing to offer — the hint below says so, so
 * a press that does nothing is never a mystery. */

function Composer({ phase, onSend }: { phase: TurnPhase; onSend: (text: string) => void }) {
	const [held, setHeld] = useState("");
	const busy = phase === "playing";

	const resize = (element: HTMLTextAreaElement) => {
		element.style.height = "auto";
		element.style.height = `${Math.max(MIN_H, Math.min(element.scrollHeight, MAX_H))}px`;
	};

	return (
		<div className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			<div className="flex min-h-0 flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5 transition-colors duration-150 focus-within:border-muted/45">
				<textarea
					value={held}
					rows={3}
					spellCheck={false}
					placeholder="say what to change"
					aria-label="say what to change"
					onChange={(event) => {
						setHeld(event.target.value);
						resize(event.target);
					}}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || event.shiftKey) return;
						event.preventDefault();
						const text = held.trim();
						if (text === "" || busy) return;
						setHeld("");
						event.currentTarget.style.height = `${MIN_H}px`;
						onSend(text);
					}}
					className="w-full resize-none bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
					style={{ height: MIN_H }}
				/>
			</div>
			{/* an 18px line, and the one thing on it gives way rather than wrapping: the rail
			    resizes 200–480 and the hint is the only occupant until #184's model readout
			    lands beside it */}
			<div className="flex h-[18px] items-center">
				<span className="min-w-0 truncate font-mono text-2xs text-muted/45 leading-3">
					{busy ? "a turn is running" : "enter to send"}
				</span>
			</div>
		</div>
	);
}
