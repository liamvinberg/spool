import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { type EnteredChip, type Pointed, type Strip, stripOf } from "../lib/agent-selection";
import { liveThread } from "../lib/agent-threads";
import { cn } from "../lib/utils";
import type { Connector, Plan, PlayEntry, Question, RowState, ShotRef, TurnPhase } from "../lib/turn-play";
import { ChevronIcon, CloseIcon } from "./spool-icons";
import { type Arrival, Caret, Said, closedText } from "./spool-say";
import { ThreadStrip } from "./spool-thread-strip";

/**
 * The agent rail, reduced to what a turn actually is.
 *
 * Three things render and nothing else: the human's words, the agent's words,
 * and a one-line row per tool call. A row is a mark, a verb and a subject, and
 * the verb and subject are spool's nouns rather than the filesystem's — `shot
 * home`, not `Bash(spool shot home 2>&1 | tail -20)`. The real path, the input
 * and the result live behind a disclosure that is shut by default and that nobody
 * has to open; a row with nothing worth opening is not a disclosure at all.
 *
 * Thinking gets one quiet line. `thinking_delta` carries an empty string and a
 * token estimate, so there is nothing to read and nothing to draw — a duration
 * is the honest whole of it.
 *
 * State is motion, not colour. A row is running while a colourless ring turns
 * and done once a check has drawn itself through it. The accent is reserved for
 * the selection, which is the one thing on screen the human owns.
 *
 * The vocabulary itself lives in lib/turn-play, because the projection off a real
 * capture and this rail have to agree on it.
 */

/* ---------- motion ----------
 * One easing for everything that arrives, one for everything that retires, and
 * a spin slow enough to read as work rather than as an alarm. */

const ARRIVE = [0.22, 0.61, 0.36, 1] as const;

/** clear of the header's 48px fade, so an anchored first line is not dimmed by it */
const TOP_INSET = 10;

/**
 * How much of an arriving message is still treated as live, in drawn characters.
 *
 * About a second at the measured 171 characters a second, which is longer than any
 * arrival animation, so a character is always finished before it stops being live.
 */
const LIVE_TAIL = 150;
/**
 * The arrival that ships (#149).
 *
 * `blur` was provisional here and lost on the compositor: Chromium refuses to composite an
 * animated pixel-moving filter by name, so it would run on the main thread that #149's pace
 * already re-renders sixty times a second. `edge` and `soften` lost because they compute
 * opacity from a distance that *stops changing* whenever the stream stalls, which the pace
 * measures at 12% to 23% of frames — a word frozen at 8% opacity reads as a bug, where a
 * fade completes regardless. The reasoning is written up on `Arrival` in `spool-say.tsx` and
 * all four stay drawn on `agent-say-arrive`.
 */
const ARRIVAL: Arrival = "fade";
const RETIRE = [0.4, 0, 1, 1] as const;
const SPIN = { duration: 1.15, repeat: Number.POSITIVE_INFINITY, ease: "linear" as const };

const MARK_W = 14;
const INDENT = MARK_W + 10;

/* ---------- the mark ----------
 * The most repeated moment in the interface is a row going from running to
 * done, so it is one gesture rather than two pictures: the ring keeps turning
 * as it shrinks away, and the check strokes through the space it is leaving.
 * The overlap is what makes it read as the same object settling.
 *
 * A plan's tasks need a third state the work rows never do: written down and not
 * started. That is the same ring with the arc taken off it and nothing turning,
 * so a checklist at rest has no motion in it at all.
 *
 * A row can also settle on no (#142). It is the same gesture — the ring retires
 * and a stroke draws through the space it leaves — with two strokes instead of
 * one, in the same grey as the check. Nothing is coloured, because the accent
 * belongs to the selection and a refused call is not an alarm; the developer
 * usually caused it. */

export function StateMark({ state, className }: { state: RowState; className?: string | undefined }) {
	const still = useReducedMotion() === true;
	const failed = state === "failed";
	const cut = state === "stopped";
	const done = state === "done" || failed || cut;
	const running = state === "running";
	return (
		<span className={cn("relative flex h-3.5 w-3.5 shrink-0", className)}>
			<motion.span
				className="absolute inset-0"
				initial={false}
				animate={{ opacity: done ? 0 : 1, scale: done ? 0.62 : 1 }}
				transition={still ? { duration: 0 } : { duration: 0.22, ease: RETIRE }}
			>
				<motion.svg
					viewBox="0 0 14 14"
					className={cn("h-full w-full", running ? "text-text/60" : "text-text/35")}
					fill="none"
					aria-hidden="true"
					animate={still || !running ? undefined : { rotate: 360 }}
					transition={still || !running ? undefined : SPIN}
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					{running ? (
						<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					) : null}
				</motion.svg>
			</motion.span>
			<motion.svg
				viewBox="0 0 14 14"
				className="absolute inset-0 h-full w-full text-muted"
				fill="none"
				aria-hidden="true"
				initial={false}
				animate={{ scale: done ? 1 : 0.86 }}
				transition={still ? { duration: 0 } : { duration: 0.34, delay: 0.06, ease: ARRIVE }}
			>
				{/* one stroke, and it is the only mark here that is neither a yes nor a no.
				    A check is two strokes meeting, a cross is two crossing, and a call the
				    developer stopped is a single flat one through the space the ring leaves:
				    it did not succeed, it did not fail, it was cut. Drawn short of the full
				    width so it reads as a stub rather than a minus sign. */}
				{(cut
					? ["M4.4 7h5.2"]
					: failed
						? ["M4.2 4.2l5.6 5.6", "M9.8 4.2l-5.6 5.6"]
						: ["m3.4 7.2 2.4 2.4 4.8-5.2"]
				).map((path, stroke) => (
					<motion.path
						key={path}
						d={path}
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						initial={false}
						animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
						transition={
							still
								? { duration: 0 }
								: {
										pathLength: { duration: 0.28, delay: 0.07 + stroke * 0.06, ease: ARRIVE },
										opacity: { duration: 0.1, delay: 0.07 + stroke * 0.06 },
									}
						}
					/>
				))}
			</motion.svg>
		</span>
	);
}


/**
 * The way out of a turn that is already running (#165).
 *
 * `hold` (#145) and this are not the same act and do not share a payload. A parked
 * turn has already stopped by itself and its exit is #162's dismiss — a bare
 * `{behavior:"deny"}` back down the question's own channel. A turn in flight is
 * stopped by an `interrupt` **control request** over the stdin `--input-format
 * stream-json` already opened, which 2.1.220 answers with `{still_queued:[…]}`:
 * the uuids of queued messages that outlive the abort. Spool's composer refuses to
 * send while a turn is running, so that list is always empty here — the request's
 * own `cancel_queued` flag, whose documentation names this exact case ("a
 * Stop-means-stop-everything client (a remote UI's Stop button) sets this true"),
 * has nothing to cancel until Spool decides queueing is a thing it does.
 *
 * The key is esc, and it costs nothing to spend. `canvas.tsx:2553` is a ladder of
 * eight meanings rather than a binding, and #139 owns one rung of it — but
 * `canvas.tsx:2347` is `if (isTyping(event.target)) return`, so the canvas ignores
 * every key while focus is in a textarea, and the composer is one. Enter sends and
 * leaves focus there, so in the ordinary flow esc is already being thrown away at
 * the exact moment a turn is running. Click out to the canvas and the ladder is the
 * canvas's again, which is why the press has to exist too: it is the only path that
 * works from wherever the eyes are, which in this product is the frame repainting.
 *
 * The binary agrees with both halves — `press Esc to stop` when it owns the
 * terminal, `press Ctrl+C to stop` when it does not.
 */
export type StopWhere = "none" | "footer" | "field" | "edge";

function StopButton({ where, onStop }: { where: Exclude<StopWhere, "none">; onStop: () => void }) {
	if (where === "field") {
		return (
			<button
				type="button"
				onClick={onStop}
				aria-label="stop"
				className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-raised bg-raised transition-colors duration-150 hover:border-muted/45"
			>
				<span className="h-2.5 w-2.5 rounded-[1px] bg-text" />
			</button>
		);
	}
	return (
		<button
			type="button"
			onClick={onStop}
			className={cn(
				"flex w-fit items-center gap-2 rounded-sm border border-border-raised bg-raised px-2 transition-colors duration-150 hover:border-muted/45",
				where === "edge" ? "h-6" : "h-[18px]",
			)}
		>
			<span className="h-2 w-2 shrink-0 rounded-[1px] bg-text" />
			<span className="font-mono text-2xs text-text leading-3">stop</span>
			<span className="font-mono text-2xs text-muted/60 leading-3">⎋</span>
		</button>
	);
}

/* ---------- the rail ---------- */

/** the composer's inner width at a 420 rail: less the panel padding and the box's own */
export const COMPOSER_W = 420 - 28 - 24;

/**
 * The rail's scrollbar, which is the Pages rail's scrollbar.
 *
 * Copied verbatim out of `src/ui/ui.css` rather than invented — same class name,
 * same 2px, same transparent track, same thread accent on the thumb — so this is a
 * frame matching what shipped rather than a second opinion about it, and porting it
 * is deleting this block. The `@supports` guard comes along for the reason it exists
 * upstream: Chrome honours `scrollbar-width` over `::-webkit-scrollbar` when both are
 * set, which would quietly widen a 2px bar back to a chip-wide one.
 *
 * It is a `<style>` element rather than arbitrary variants because that guard has no
 * utility form, and the rail already hides two scrollbars with `[&::-webkit-scrollbar]:hidden`
 * where hiding was the whole answer. Here it is not: the log is long enough to need
 * the position.
 */
function RailScrollbar() {
	return (
		<style>{`
.pages-scrollbar::-webkit-scrollbar { width: 2px; }
.pages-scrollbar::-webkit-scrollbar-track { background: transparent; }
.pages-scrollbar::-webkit-scrollbar-thumb { background: var(--color-thread); border-radius: 999px; }
@supports not selector(::-webkit-scrollbar) {
	.pages-scrollbar { scrollbar-color: var(--color-thread) transparent; scrollbar-width: thin; }
}
`}</style>
	);
}

/**
 * Where a picture goes, when every other row is one line.
 *
 * `well` holds the picture's place and draws nothing in it, which is all a
 * capture with its payloads elided can honestly supply on its own. The other
 * three are the three answers: behind the disclosure, in the row itself, or
 * nowhere at all because the frame it is a picture of is on the canvas already.
 */
export type ShotMode = "well" | "open" | "inline" | "line";

/**
 * How a row that names a frame reaches it (#143).
 *
 * The click on such a row is already spent: #135 gave every one of them a
 * disclosure holding the path, so the row is a button before this question is
 * asked. That is what makes the three answers three rather than one.
 *
 *   name   the name is the target and the rest of the row still opens. Two hit
 *          areas, split where the row's own grammar already splits.
 *   row    the whole row goes there and the chevron alone keeps the disclosure.
 *   quiet  nothing clicks. Hovering says which frame out there is this row's, and
 *          the frame being live on the canvas is the rest of the answer.
 */
export type JumpMode = "name" | "row" | "quiet";

/**
 * What a row says when the tool was not spool's (#142).
 *
 * All three print the binary's own strings — none of them parses a wire name and
 * none invents a noun. What they disagree about is which name belongs in the
 * subject, which is the one slot the eye scans.
 *
 *   ask    the server, with the capital the binary sent: `ask Notion`. The tool's
 *          own name goes behind the chevron with the wire name.
 *   tool   the tool's own name, so the row says what was called rather than only
 *          where: `notion Notion-Search`, `eidra artifacts artifact_help`.
 *   raw    the wire name verbatim, on the grounds that anything else is a
 *          presentation of somebody else's API.
 */
export type McpMode = "ask" | "tool" | "raw";

/**
 * Where a question with options goes, when every other row is one line (#145).
 *
 * The three differ in one thing: whether the option's own `description` is
 * readable while you choose. It is 150 to 250 characters in the captured ask and
 * it is where the cost of each choice is written — `Side effect: the daemon
 * restarts under any canvas you currently have open` is the whole reason to pick
 * a different one. A treatment that cannot show it is asking you to choose blind.
 *
 *   log       a block in the transcript, options as rows with their descriptions
 *             under them, and the composer still live beside it. Wide only while
 *             it is unanswered: answering collapses it to a line whose subject is
 *             the choice, and the question goes behind the chevron like any other
 *             payload.
 *   composer  the question is prose in the log and the options are chips above the
 *             composer, one description at a time on hover. The log keeps its
 *             one-line rule perfectly and you compare three options serially.
 *   shelf     the question takes #117's shelf, the way the plan does.
 */
export type AskMode = "log" | "composer" | "shelf";

/**
 * How much room the agent's own prose may take (#148).
 *
 * The log has a rule for everything except the thing it draws most of: a call is
 * one line, six writes are one row, a plan leaves for a strip, a picture is 120px.
 * Prose takes whatever it needs.
 *
 * Measured before drawing, across four real sessions. **Thirty-five assistant
 * messages reach the transcript** — the other twenty-four are a sub-agent's and
 * `claude-turn.ts:938` already keeps them out. Median 87 characters. Twenty-seven
 * of the thirty-five are under 200. Then 686, 1169, 1267, 1293, and one at
 * **3,372**. So a clamp is not academic and it is not the common case either: it
 * fires on five rows in thirty-five, and four of those five are the message you
 * actually opened the rail to read.
 *
 *   raw    what the rail does today: the markdown source, unclamped. `**bold**`
 *          keeps its asterisks and a fence draws three literal backticks. It is
 *          here as the diff, not as a candidate.
 *   read   rendered and unclamped, to ask whether structure alone is the answer.
 *          Every long message in the corpus is a document — five to thirteen
 *          paragraphs, bold, inline code, one with a fenced block and a quote —
 *          so rendering is the difference between a slab and something skimmable.
 *   lede   rendered, first paragraph shown, the rest behind the same disclosure a
 *          payload uses. Drawn because the agent already writes a lede: all five
 *          messages over 600 characters open with a one-sentence verdict.
 *   lines  rendered, clamped to a fixed number of rendered lines with a fade and
 *          an inline `show all`. The obvious answer, drawn so it can lose on
 *          purpose rather than by never being tried.
 */
export type SayMode = "raw" | "read" | "lede" | "lines";

/**
 * Where a message typed into a running turn stands before it has happened (#170).
 *
 * The composer has stopped refusing. Enter while a turn is in flight queues the
 * message instead of dropping it, a second Enter queues a second, and **Spool holds
 * the list rather than the binary** — which is the half of the wire #165 read from
 * the other end: an `interrupt` control request comes back `{still_queued:[…]}`, the
 * uuids of queued messages that outlive the abort, and it has been empty on every
 * capture in this repo because Spool had nothing to put in it.
 *
 * A queued message is the only thing this rail draws that **has not happened yet**,
 * so it cannot wear the transcript's receipt. It is the developer's own words in the
 * developer's own 2px accent rail, dimmed until it fires, `queued` under it, and a ✕
 * to take it back. That anatomy is fixed. What the two placements disagree about is
 * only where the row stands while it waits.
 *
 *   tail   at the end of the log, under the live edge, in fire order — which is the
 *          exact spot the receipt lands, so firing is an undim in place and nothing
 *          moves. The cost is that the log now holds one thing that is not a receipt.
 *   band   a fixed strip between the log and the composer. It does not scroll with
 *          the transcript, so what is waiting stays on screen while you read back,
 *          and the transcript above stays receipts-only. The cost is the teleport:
 *          a row that fires leaves the band and reappears in the log.
 */
export type QueueWhere = "none" | "tail" | "band";

/**
 * One message waiting on the running turn.
 *
 * The id is the frame's own and not the capture's, because nothing about a queue is
 * in a capture — Spool took the message, so Spool is the only thing that can name
 * it. Two identical messages are a real thing to type twice, and the ✕ has to reach
 * exactly one of them.
 */
export interface Queued {
	readonly id: string;
	readonly text: string;
}

/** what a frame-naming row can currently do about the frame it names */
type Reach = "here" | "coming" | "gone";

/** the whole of the jump, so it reaches a row as one thing rather than five props */
interface JumpKit {
	readonly mode: JumpMode;
	readonly reach: (frame: string) => Reach;
	readonly pointed: string | null;
	readonly onPoint: (frame: string | null) => void;
	readonly onJump: (frame: string) => void;
}

export function PlayRail({
	entries,
	phase,
	nav,
	header,
	plan = null,
	connectors,
	shot = "well",
	shotView,
	mcp = "ask",
	ask = "log",
	say = "raw",
	model,
	selection = [],
	entered,
	lit,
	onLight,
	onDrop,
	jump,
	have,
	gone,
	pointed = null,
	onPoint,
	onJump,
	run,
	stop = "none",
	onStop,
	onDeny,
	queue = "none",
	queued = [],
	onQueue,
	onUnqueue,
	onSend,
	onReplay,
	onAnswer,
}: {
	entries: readonly PlayEntry[];
	phase: TurnPhase;
	/**
	 * The one row above the transcript (#144).
	 *
	 * There is no tab row any more: the agent owns this rail whole, `elements` died
	 * with the inspector and `connections` is [#146](https://github.com/liamvinberg/spool/issues/146)'s
	 * to place. So absent draws #136's threads strip carrying the one thread this
	 * frame is playing, which is what a project with a single conversation looks
	 * like; a frame with a real deck passes its own. `"outside"` draws nothing at
	 * all, for a proposal whose chrome is not inside the panel.
	 */
	nav?: ReactNode | "outside" | undefined;
	/**
	 * Whatever sits between the tabs and the transcript and is not the plan: a
	 * proposal's own chrome, above the log and below the tab it belongs to.
	 */
	header?: ReactNode | undefined;
	/** the plan, lifted out of the transcript into a header of its own */
	plan?: Plan | null;
	/** the whole MCP estate, standing on the same shelf; absent draws no estate at all */
	connectors?: readonly Connector[] | undefined;
	shot?: ShotMode;
	/** the picture itself, drawn and sized by whoever knows what the frame looks like */
	shotView?: ((shot: ShotRef) => ReactNode) | undefined;
	/** how a row names a tool that is not spool's; rows that are spool's are untouched */
	mcp?: McpMode;
	/** where a question the agent stopped to ask is drawn, and answered (#145) */
	ask?: AskMode;
	/** how much room the agent's own prose may take, and whether it is rendered at all (#148) */
	say?: SayMode;
	/** whatever says which model is answering, sitting where the send hint sits */
	model?: ReactNode;
	/** what the hands are pointing at, riding in the composer — always a list */
	selection?: readonly Pointed[];
	/** set when that list is the frame the hands are inside rather than one they picked (#139) */
	entered?: EnteredChip | undefined;
	/** the entry the pointer is over, in the rail or out on the canvas */
	lit?: string | null | undefined;
	onLight?: ((id: string | null) => void) | undefined;
	onDrop?: ((id: string | null) => void) | undefined;
	/** absent leaves every row exactly as it was before the question was asked */
	jump?: JumpMode | undefined;
	/** the frames the project has right now; a name outside this list is not a place to go */
	have?: readonly string[] | undefined;
	/**
	 * The frames the project had and no longer has, which the rail cannot work out
	 * for itself and must not guess. Absent from `have` covers two states that look
	 * identical from in here and read as opposites: a frame the turn is still writing
	 * is one beat from existing, and a frame a stored transcript outlived (#120) is
	 * never coming back. Only the first is worth waiting for, so only the second is
	 * struck.
	 */
	gone?: readonly string[] | undefined;
	/** the frame a row is naming under the cursor, paired with the ring out on the canvas */
	pointed?: string | null | undefined;
	onPoint?: ((frame: string | null) => void) | undefined;
	onJump?: ((frame: string) => void) | undefined;
	run: number;
	/** where the way out of a running turn is drawn; `none` leaves the turn with no exit (#165) */
	stop?: StopWhere | undefined;
	onStop?: (() => void) | undefined;
	/**
	 * #162's third exit off a parked question, and the *only* other way out of a turn
	 * Spool has. It is not #165's stop and does not share its wire: a stop is an
	 * `interrupt` control request against a turn that is streaming, this is a bare
	 * `{behavior:"deny"}` back down the question's own `can_use_tool` channel. They
	 * can never both be offered, which is the whole answer to whether they could be
	 * confused — `cutting` below is `phase === "playing" && !waiting`.
	 */
	onDeny?: (() => void) | undefined;
	/** where the messages waiting on a running turn stand; `none` is the rail as it was before #170 */
	queue?: QueueWhere | undefined;
	/** those messages, in fire order, none of which has happened */
	queued?: readonly Queued[] | undefined;
	/** absent leaves Enter swallowed while a turn runs, which is what the composer did until #170 */
	onQueue?: ((text: string) => void) | undefined;
	/** taking one back before it fires; absent draws no ✕ at all */
	onUnqueue?: ((id: string) => void) | undefined;
	onSend: (text: string) => void;
	onReplay: () => void;
	/** lets a turn held at a question carry on, once one has been given (#145) */
	onAnswer?: (() => void) | undefined;
}) {
	const field = useRef<HTMLTextAreaElement>(null);
	const reach = (event: { target: EventTarget | null }) => {
		const target = event.target;
		if (target instanceof HTMLElement && target.closest("button, textarea") !== null) return;
		field.current?.focus();
	};
	// the answer is interface state and not turn state: the capture's own developer
	// never answered, so replaying it must not remember that anyone did
	const [picked, setPicked] = useState<string | null>(null);
	useEffect(() => setPicked(null), [run]);
	const asked = entries.find((entry): entry is Extract<PlayEntry, { kind: "ask" }> => entry.kind === "ask");
	const waiting = asked !== undefined && asked.live && picked === null;
	// pressing an option and typing an answer are the same act, because the tool takes
	// both: `answers` keyed by the question, or `response` as free text — and the binary
	// tests `response` first. So the composer stays live for exactly as long as the
	// options do, and either one releases the turn.
	const answer = (text: string) => {
		setPicked(text);
		onAnswer?.();
	};
	// a stop is only ever offered against a turn in flight: a settled one has nothing
	// to interrupt, and a parked one is #162's dismiss rather than an `interrupt`
	const cutting = stop !== "none" && phase === "playing" && !waiting && onStop !== undefined;
	const halt = onStop ?? (() => {});
	// a deny destroys the question rather than answering it, so nothing is recorded as
	// picked: the row resolves on the turn ending, the same way #165's rows do
	const deny = () => onDeny?.();
	// the queue is off unless a frame says where it goes, so every frame that predates
	// #170 keeps a composer that refuses while a turn runs and a log with nothing in it
	// that has not happened
	const pending = queue === "none" ? [] : queued;
	const kit: JumpKit | null =
		jump === undefined
			? null
			: {
					mode: jump,
					reach: (frame) =>
						have?.includes(frame) === true ? "here" : gone?.includes(frame) === true ? "gone" : "coming",
					pointed: pointed ?? null,
					onPoint: onPoint ?? (() => {}),
					onJump: onJump ?? (() => {}),
				};
	return (
		<>
			<RailScrollbar />
			{nav === undefined ? (
				<OneThread entries={entries} phase={phase} waiting={waiting} />
			) : nav === "outside" ? null : (
				nav
			)}
			{header}
			{plan === null ? null : <PlanStrip plan={plan} />}
			{ask !== "shelf" || !waiting ? null : <AskShelf ask={asked.ask} onPick={answer} />}
			{connectors === undefined ? null : <EstateStrip connectors={connectors} />}
			<Transcript
				entries={entries}
				run={run}
				shot={shot}
				shotView={shotView}
				mcp={mcp}
				ask={ask}
				say={say}
				picked={picked}
				onPick={answer}
				onDeny={ask === "log" && waiting && onDeny !== undefined ? deny : undefined}
				jump={kit}
				onReach={reach}
				queued={queue === "tail" ? pending : []}
				onUnqueue={onUnqueue}
				tail={cutting && stop === "edge" ? <StopButton where="edge" onStop={halt} /> : undefined}
			/>
			{queue === "band" && pending.length > 0 ? <QueueBand queued={pending} onUnqueue={onUnqueue} /> : null}
			<Composer
				field={field}
				strip={stripOf(selection, COMPOSER_W, entered)}
				chips={ask === "composer" && waiting ? asked.ask : null}
				onPick={answer}
				answering={waiting}
				model={model}
				lit={lit ?? null}
				onLight={onLight}
				onDrop={onDrop}
				phase={phase}
				stop={cutting && stop !== "edge" ? stop : "none"}
				onStop={halt}
				onQueue={queue === "none" ? undefined : onQueue}
				onSend={onSend}
				onReplay={onReplay}
				onReach={reach}
			/>
		</>
	);
}

/**
 * The threads strip with one thread in it: what this rail looks like before anybody
 * has started a second conversation.
 *
 * Derived rather than passed, because #144 took the tab row out from over sixteen
 * frames at once and every one of them plays exactly one turn. The thread's only name
 * is what the human asked (#136), which is the first thing in the log, and its life is
 * whether the turn is still running. `liveThread` is the same projection the deck uses,
 * so a frame with one thread and a frame with four agree about what a thread is.
 *
 * `waiting` is handed in rather than read off the phase, because a turn parked on a
 * question never leaves `playing` — `useTurn` schedules nothing past the hold — so the
 * phase alone drew a turning ring for a thread that had stopped and was costing
 * nothing (#161). The rail already knows, because it is drawing the options.
 */
function OneThread({
	entries,
	phase,
	waiting,
}: {
	entries: readonly PlayEntry[];
	phase: TurnPhase;
	waiting: boolean;
}) {
	const asked = entries.find((entry) => entry.kind === "user");
	const thread = liveThread(asked?.kind === "user" ? asked.text : "", entries, phase === "playing", waiting);
	return <ThreadStrip threads={[thread]} open={thread.id} onOpen={() => {}} />;
}

/* ---------- the transcript ----------
 * Bottom-anchored, so a turn grows up off the top the way a scrolled log does
 * and the live end never moves. Every entry arrives inside a box that opens to
 * its own height, which means the rows above it glide rather than jump: the
 * shift is real layout, not an animation chasing one.
 *
 * It also scrolls, which until #145 it did not. Every turn on this page was short
 * enough to fit, so a log that grew off the top and stayed there read as correct;
 * `claude-mcp.json` has a single 1,232-character assistant message in it and the
 * omission became obvious the moment a frame played one. `mt-auto` rather than
 * `justify-end`, because a flex container that end-justifies its overflow puts the
 * top of it out of reach of the scrollbar. */

function Transcript({
	entries,
	run,
	shot,
	shotView,
	mcp,
	ask,
	say,
	picked,
	onPick,
	onDeny,
	jump,
	onReach,
	queued,
	onUnqueue,
	tail,
}: {
	entries: readonly PlayEntry[];
	run: number;
	shot: ShotMode;
	shotView: ((shot: ShotRef) => ReactNode) | undefined;
	mcp: McpMode;
	ask: AskMode;
	say: SayMode;
	picked: string | null;
	onPick: (label: string) => void;
	onDeny: (() => void) | undefined;
	jump: JumpKit | null;
	onReach: (event: { target: EventTarget | null }) => void;
	/** the queue standing in the log, which is empty in every placement but `tail` (#170) */
	queued: readonly Queued[];
	onUnqueue: ((id: string) => void) | undefined;
	/** whatever hangs off the last entry, which so far is only #165's stop */
	tail?: ReactNode | undefined;
}) {
	const view = useRef<HTMLDivElement>(null);
	// stay pinned to the live end while the reader is already there, and stop pinning
	// the moment they scroll up to read something: a log that yanks itself back down
	// mid-sentence is worse than one that does not follow at all
	const [follow, setFollow] = useState(true);
	/*
	 * Following the end is right for a log and wrong for one entry taller than the
	 * box (#148).
	 *
	 * Everything the rail drew before this fitted, so the bottom was the only place
	 * worth being. A 3,372-character message is 1,234px against a transcript of about
	 * 500, and following its end drives its first line — where the verdict is — up out
	 * of view before it has been read, at 171 characters a second for twenty seconds.
	 * Reading it then means scrolling backwards through your own log.
	 *
	 * So the anchor is the *top* of the live entry rather than the bottom of the log,
	 * and one clamp does both cases. The scroll that would put the entry's first line
	 * at the top is at most `scrollHeight - entryHeight`, so it falls below the maximum
	 * scroll exactly when the entry is taller than the box: a short entry keeps
	 * ordinary follow-the-end, and a tall one pins its own first line up top and fills
	 * downward. Once it has outgrown the box the maximum wins again and the live edge
	 * is followed, which is the only point at which there is nothing else to do.
	 *
	 * `TOP_INSET` keeps that first line out from under the header's own fade, which is
	 * 48px of gradient and would otherwise dim the one line this exists to protect.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: the entry list is what moves the end
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
	useEffect(() => setFollow(true), [run]);
	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" onMouseDown={onReach}>
			<div
				key={run}
				ref={view}
				onScroll={(event) => {
					const box = event.currentTarget;
					setFollow(box.scrollHeight - box.scrollTop - box.clientHeight < 24);
				}}
				className="pages-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-6 pb-4"
			>
				<div className="mt-auto shrink-0">
					{entries.map((entry, index) => (
						<Arrive key={entry.key} gap={gapBefore(entries[index - 1], entry)}>
							<Entry
								entry={entry}
								shot={shot}
								shotView={shotView}
								mcp={mcp}
								ask={ask}
								say={say}
								picked={picked}
								onPick={onPick}
								onDeny={onDeny}
								jump={jump}
							/>
						</Arrive>
					))}
					{/* the queue stands under the live edge and inside the same column, so each
					    row is already in the place its receipt will take: the first one clears
					    the live edge by the 14px `gapBefore` gives a turn boundary, which is
					    what the row it becomes will sit on (#170) */}
					{queued.length === 0 ? null : (
						<div className="pt-3.5">
							<QueueList queued={queued} onUnqueue={onUnqueue} gap={14} />
						</div>
					)}
					{tail === undefined ? null : <div className="pt-3.5">{tail}</div>}
				</div>
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
		</div>
	);
}

/** consecutive machine work reads as one run, so it sits tighter than a turn boundary */
function gapBefore(previous: PlayEntry | undefined, entry: PlayEntry): number {
	if (previous === undefined) return 0;
	if (previous.kind === "line" && entry.kind === "line") return 6;
	return 14;
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

function Entry({
	entry,
	shot,
	shotView,
	mcp,
	ask,
	say,
	picked,
	onPick,
	onDeny,
	jump,
}: {
	entry: PlayEntry;
	shot: ShotMode;
	shotView: ((shot: ShotRef) => ReactNode) | undefined;
	mcp: McpMode;
	ask: AskMode;
	say: SayMode;
	picked: string | null;
	onPick: (label: string) => void;
	onDeny: (() => void) | undefined;
	jump: JumpKit | null;
}) {
	if (entry.kind === "ask") return <Ask entry={entry} mode={ask} picked={picked} onPick={onPick} onDeny={onDeny} />;
	if (entry.kind === "user") {
		return (
			<div className="relative flex flex-col gap-1.5 pl-3.5">
				<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
				<p className="whitespace-pre-wrap text-base text-text leading-base">{entry.text}</p>
				{entry.context === undefined ? null : (
					<span className="truncate font-mono text-2xs text-muted/55 leading-3">{entry.context}</span>
				)}
			</div>
		);
	}
	if (entry.kind === "note") {
		// a boundary reaches across the rail because what it says applies to
		// everything under it; a reply is only itself, so it sits in the same quiet
		// mono the composer's own hints use and takes the width it needs
		if (entry.rule === true) {
			return (
				<div className="flex items-center gap-2.5 py-0.5">
					<span className="h-px flex-1 bg-border" />
					<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{entry.text}</span>
					<span className="h-px flex-1 bg-border" />
				</div>
			);
		}
		return (
			<div className="flex flex-col gap-0.5">
				{entry.said === undefined ? null : (
					<p className="font-mono text-2xs text-text/70 leading-4">{entry.said}</p>
				)}
				<p className="whitespace-pre-wrap font-mono text-2xs text-muted/55 leading-4">{entry.text}</p>
			</div>
		);
	}
	if (entry.kind === "prose") return <Prose entry={entry} mode={say} />;
	return <Line entry={entry} shot={shot} shotView={shotView} mcp={mcp} jump={jump} />;
}

/* ---------- the words you said into a running turn (#170) ----------
 * The transcript is receipts and this is not one. Everything else the rail draws is
 * past tense — a call that ran, a sentence that arrived, an answer that was given —
 * and a queued message is the developer's own words with nothing behind them yet.
 *
 * So the row is deliberately the *user* row and not a new object: the same 2px accent
 * rail, the same text size, the same mono line under it that a `context` sits on.
 * Every one of those is dimmed, and the line says `queued` rather than naming a
 * frame. The moment it fires it is not replaced by a row — it *is* the row, undimmed,
 * which is the whole reason the anatomy has to match to the pixel.
 *
 * The ✕ is on hover, in the words the selection chip's own removal already uses. A
 * queue you have to manage is a queue you have to look at, and the resting state
 * here is two lines of your own words waiting their turn. */

function QueuedRow({ message, onDrop }: { message: Queued; onDrop: (() => void) | undefined }) {
	return (
		<div className="group relative flex flex-col gap-1 pl-3.5">
			{/* the rail is the one thing here that does *not* dim: it says whose words these
			    are, and that is settled the moment they are typed. What is provisional is
			    only whether they have gone out, which the text and the marker carry */}
			<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
			<p className="whitespace-pre-wrap text-base text-text/45 leading-base">{message.text}</p>
			<span className="flex h-3.5 items-center gap-1.5">
				<span className="font-mono text-2xs text-muted/55 leading-3">queued</span>
				{onDrop === undefined ? null : (
					<button
						type="button"
						onClick={onDrop}
						aria-label={`unqueue ${message.text}`}
						// no plate behind it, unlike the composer chip's own ✕: in a dimmed row a
						// filled box is the brightest thing on the line, and the row is the thing
						// being read
						className="flex h-3.5 w-3.5 items-center justify-center text-muted/0 transition-colors duration-150 hover:text-text group-hover:text-muted/50"
					>
						<CloseIcon className="h-2 w-2" />
					</button>
				)}
			</span>
		</div>
	);
}

/**
 * The rows themselves, identical in both placements so that where they stand is the
 * only thing under test.
 *
 * They arrive on the transcript's own curve, because typing into a running turn and
 * a row landing in the log are the same beat to the eye and there is no reason for
 * two. They retire on it too, which the log's entries never do: nothing in a
 * transcript is ever taken back, and a queued message is the one thing that can be.
 * `gap` is skipped on the first row so a placement can set its own lead-in.
 */
function QueueList({
	queued,
	onUnqueue,
	gap,
}: {
	queued: readonly Queued[];
	onUnqueue: ((id: string) => void) | undefined;
	gap: number;
}) {
	const still = useReducedMotion() === true;
	return (
		<AnimatePresence initial={false}>
			{queued.map((message, index) => (
				<motion.div
					key={message.id}
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
					<div style={{ paddingTop: index === 0 ? 0 : gap }}>
						<QueuedRow
							message={message}
							onDrop={onUnqueue === undefined ? undefined : () => onUnqueue(message.id)}
						/>
					</div>
				</motion.div>
			))}
		</AnimatePresence>
	);
}

/**
 * The queue as a band, held between the log and the composer.
 *
 * It is in neither of them and it does not scroll: the transcript runs under it and
 * stays receipts-only, so what is waiting is on screen whether or not you have
 * scrolled back to read something. Its own rule at the top is what makes it a place
 * rather than a few rows that happen to sit low — the composer already carries one,
 * and two rules is what a band between two things looks like.
 *
 * It caps and scrolls inside itself on the transcript's own 2px bar, because a queue
 * has no upper bound: you can go on typing for as long as the turn goes on running,
 * and a band that grows to fit takes the room out of the log.
 */
function QueueBand({ queued, onUnqueue }: { queued: readonly Queued[]; onUnqueue: ((id: string) => void) | undefined }) {
	return (
		<div className="pages-scrollbar flex max-h-[164px] shrink-0 flex-col overflow-y-auto border-border border-t px-3.5 py-3">
			<QueueList queued={queued} onUnqueue={onUnqueue} gap={14} />
		</div>
	);
}

/** rendered lines are not source lines, so the clamp is a height and the fade is on it */
const CLAMP_PX = 12 * 20;

function Prose({ entry, mode }: { entry: Extract<PlayEntry, { kind: "prose" }>; mode: SayMode }) {
	const still = useReducedMotion() === true;
	const [open, setOpen] = useState(false);
	const streaming = entry.shown.length < entry.full.length;
	/*
	 * Whether there is anything to clamp, which has to be watched rather than
	 * measured once: every entry arrives inside a box that opens to its own height,
	 * so on the first paint a 1,234px document measures as nothing.
	 *
	 * It is the clamp's own `scrollHeight` rather than the content's height,
	 * because measuring the content makes the test destroy its own answer — clamping
	 * a 1,234px document to 240 makes the next measurement 240, which reads as
	 * nothing-to-clamp, which unclamps it back to 1,234, forever.
	 */
	const clamp = useRef<HTMLDivElement>(null);
	const [tall, setTall] = useState(false);
	useEffect(() => {
		const box = clamp.current;
		if (box === null) return;
		const watch = new ResizeObserver(() => setTall(box.scrollHeight > CLAMP_PX));
		watch.observe(box);
		return () => watch.disconnect();
	}, []);

	// The height-reserving stream (#145's rule, under test here). The finished text
	// holds the block's height from the first character so the rows above never walk
	// a line at a time. At two lines that is right. At 3,372 characters it means the
	// rail goes from empty to full in one frame and then fills in with text for the
	// next twenty seconds, which is the thing this ticket is about.
	if (mode === "raw")
		return (
			<p className="relative text-base text-text/90 leading-base">
				<span className="invisible" aria-hidden="true">
					{entry.full}
				</span>
				<span className="absolute inset-0">
					{entry.shown}
					{streaming ? <Caret /> : null}
				</span>
			</p>
		);

	// how many paragraphs are behind the lede; also the test for whether this is a
	// document at all, and it needs no layout to answer
	const blocks = entry.full.split(/\n\n+/);
	const rest = blocks.length - 1;

	/*
	 * What is actually drawn while a message arrives.
	 *
	 * `closedText` holds back a marker that has not closed yet, which is the thing
	 * that made streaming markdown jitter: `**The shot failed` renders as two literal
	 * asterisks in body weight, and when the closing `**` lands 200ms later the
	 * asterisks vanish, the run goes bold, and the paragraph re-wraps under the line
	 * you were reading. An unterminated fence is worse — it swallows the rest of the
	 * message into a `<pre>`. So an open marker waits, and the cost is a beat of
	 * lateness on the last few characters of a bold run rather than a reflow of
	 * everything already on screen.
	 *
	 * `live` is how much of that is still arriving, which is what carries #148's
	 * arrival treatment: the drawn tail, measured from the end, so the ramp crosses a
	 * paragraph boundary without restarting.
	 */
	const shown = streaming ? closedText(entry.shown) : entry.shown;
	const live = streaming ? Math.min(LIVE_TAIL, shown.length) : 0;

	// Rendered, the reserve cannot be a hidden copy of the same string — a half-typed
	// `**bold` is not the geometry of a finished `**bold**`. So the reserve is the
	// finished document drawn invisibly and the arriving one drawn over it, which is
	// the same trick one layer up.
	const held = (
		<div className="relative">
			<div className="invisible" aria-hidden="true">
				<Said text={entry.full} />
			</div>
			<div className="absolute inset-0">
				<Said text={shown} live={live} arrival={ARRIVAL} caret={streaming ? <Caret /> : null} />
			</div>
		</div>
	);

	/*
	 * The third of the ticket's three questions, and the reserve loses it — but for a
	 * smaller reason than the first pass of this claimed.
	 *
	 * #145's rule holds the finished message's height from the first character so the
	 * rows above never walk a line at a time, and at two lines it is right. The
	 * argument against it here was that at 1,234px the transcript goes from empty to
	 * two and a half screens of blank in one frame. **That was a bottom-pinning
	 * artefact, not a property of the reserve**, and the top-anchored follow above
	 * fixed it: with the entry's first line anchored, a reserved block simply fills
	 * from the top and nothing moves at all.
	 *
	 * What survives is narrower. A reserved block puts its full height into the
	 * scroll range from the first character, so for twenty seconds there are two and a
	 * half screens of scrollable nothing under a message still being written, and the
	 * scrollbar says the log is longer than anything in it. Growing has no such space.
	 * That is enough to keep the reserve off a document and not enough to pretend it
	 * was ever unwatchable.
	 *
	 * Nothing is measured to decide which applies. Whether this is a document is the
	 * same test the lede already asks — four paragraphs or more — so the answer is
	 * known from the first character rather than from a layout pass.
	 *
	 * Growing is not the same as snapping, and the wire makes that gap wide: a delta
	 * carries a median of 81 characters, which at 392px of text is more than a line
	 * and often two, every 460ms for twenty seconds. Unanimated that is a 40px step
	 * in the middle of a sentence you are reading. So the block glides to each new
	 * height on the same `ARRIVE` curve every other entry arrives on, and the tail
	 * carries `ARRIVAL`. Which arrival ships is still live on `agent-say-arrive`.
	 */
	const grown = <Said text={shown} live={live} arrival={ARRIVAL} caret={streaming ? <Caret /> : null} />;
	const body = rest >= 3 && streaming ? grown : held;

	if (mode === "read") return body;

	if (mode === "lede") {
		// The lede is not a truncation: every message in the corpus over 600
		// characters opens with a one-sentence verdict — `The frame is authored and
		// live on the canvas. The shot is blocked…`, `Neither server could be
		// reached — here's exactly what came back.`, `Fonts check out:`. Five for
		// five. So the first paragraph is the agent's own summary and the rest is
		// its working, which is #117's rule holding: the line is the receipt.
		if (rest < 3 || streaming) return body;
		return (
			<div className="flex flex-col gap-1.5">
				{open ? body : <Said text={blocks[0] ?? ""} />}
				<button
					type="button"
					onClick={() => setOpen(!open)}
					className="flex w-fit items-center gap-1.5 text-left font-mono text-2xs text-muted/60 leading-4 transition-colors duration-150 hover:text-text/70"
				>
					<ChevronIcon open={open} className="h-2.5 w-2.5 shrink-0 text-muted/35" />
					{open ? "less" : `${rest} more`}
				</button>
			</div>
		);
	}

	// A fixed clamp knows nothing about what it cuts, so it will cut mid-sentence,
	// mid-list and mid-code block. It is drawn to be looked at, not to be assumed.
	const cut = tall && !open && !streaming;
	return (
		<div className="flex flex-col gap-1.5">
			<div ref={clamp} className={cn("relative", cut && "overflow-hidden")} style={cut ? { maxHeight: CLAMP_PX } : undefined}>
				{body}
				{cut ? (
					<span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-bg" />
				) : null}
			</div>
			{tall && !streaming ? (
				<button
					type="button"
					onClick={() => setOpen(!open)}
					className="flex w-fit items-center gap-1.5 text-left font-mono text-2xs text-muted/60 leading-4 transition-colors duration-150 hover:text-text/70"
				>
					<ChevronIcon open={open} className="h-2.5 w-2.5 shrink-0 text-muted/35" />
					{open ? "less" : "show all"}
				</button>
			) : null}
		</div>
	);
}

/* ---------- one line ----------
 * mark, verb, subject. The subject can land a beat after the verb because that
 * is how it arrives on the wire: the tool block opens with a name and an empty
 * input, and its argument streams in behind. */

function Line({
	entry,
	shot,
	shotView,
	mcp,
	jump,
}: {
	entry: Extract<PlayEntry, { kind: "line" }>;
	shot: ShotMode;
	shotView: ((shot: ShotRef) => ReactNode) | undefined;
	mcp: McpMode;
	jump: JumpKit | null;
}) {
	const still = useReducedMotion() === true;
	const [clicked, setClicked] = useState<boolean | undefined>(undefined);
	// the cursor is on this row. Held here rather than left to `:hover` because
	// pointing is per frame and this transcript names one frame twelve times, so a
	// hover keyed on the frame would mark all twelve at once
	const [over, setOver] = useState(false);
	// a picture drawn in the row, or not drawn at all, leaves the disclosure holding
	// what it holds for every other row: the path. And a disclosure with only a path
	// in it is not worth opening on the turn's say-so, so the auto-open goes with it.
	const held = shot === "well" || shot === "open" ? entry.shot : undefined;
	const expandable = entry.detail !== undefined || entry.children !== undefined || held !== undefined;
	const open = expandable && (clicked ?? (held === undefined ? false : (entry.open ?? false)));
	// the picture is of a frame, and the capture's path always names it, so the row
	// can say which frame the agent looked at instead of which file it opened
	const shown0 = shot === "line" && entry.shot?.frame != null ? entry.shot.frame : entry.subject;
	/* ---------- what a foreign row is called (#142) ----------
	 * `ask` takes the projection's own pair, `ask` and the server. `tool` keeps both
	 * names by spending the verb slot on the server, which is the strongest form of
	 * "the row should say what was called and not only where". `raw` is what this rail
	 * does today with no `tool_use_meta` read at all: `label()`'s fallback lowercases
	 * the wire name into the verb and leaves the subject empty. */
	const outside = entry.foreign;
	const named = outside === undefined || mcp === "ask" ? shown0 : mcp === "tool" ? outside.tool : undefined;
	const said =
		outside === undefined || mcp === "ask"
			? entry.verb
			: mcp === "tool"
				? outside.server.toLowerCase()
				: outside.raw.toLowerCase();

	/* ---------- the frame this row names (#143) ----------
	 * A row that names no frame keeps every pixel it had. Nothing is greyed out and
	 * no affordance is added to say it has nowhere to go — which is the opposite end
	 * of the same rule `inspector.tsx:563` follows, where a connection whose target
	 * nothing answers to is disabled and struck rather than quietly inert. */
	const frame = entry.frame ?? null;
	const reach = jump === null || frame === null ? null : jump.reach(frame);
	const goes = jump !== null && frame !== null && reach === "here";
	const gone = reach === "gone";
	/**
	 * Pointing is answered out on the canvas and never in the log.
	 *
	 * Two reasons, and the second is the one that settled it. The rail's own rule is
	 * that state is motion and the accent belongs to the selection, which is the one
	 * thing on screen the human owns — so a red frame name would be spending the
	 * human's colour on the agent's work. And pointing is per frame rather than per
	 * row, so in this transcript one hover matched all twelve rows and lit the whole
	 * log at once. The row still takes `hover:bg-surface` like any other, and what
	 * the pointing produces is a ring out there or a lit page in the Pages rail.
	 */
	const mode = goes ? jump.mode : null;
	const point = (on: boolean) => {
		setOver(on);
		if (jump === null || frame === null || !goes) return;
		jump.onPoint(on ? frame : null);
	};
	const go = () => {
		if (jump !== null && frame !== null && goes) jump.onJump(frame);
	};

	// a run's count is in the subject as `home ×6`, and the two halves are two
	// different objects: the frame is a place, the count is how many times the agent
	// went at it. So a mode that makes the name a target takes the name only, and the
	// count keeps its place beside it as text
	const counted = entry.count !== undefined && frame !== null && named === `${frame} ×${entry.count}`;
	const shown = counted && frame !== null ? frame : named;
	const label =
		shown === undefined ? null : (
			<motion.span
				className={cn(
					"min-w-0 truncate font-mono text-sm leading-4",
					entry.quiet === true ? "text-muted/60 tabular-nums" : "text-text/85",
					// struck through and dimmed, in the words the connections tab already uses
					// for a name nothing answers to
					gone && "text-muted/45 line-through",
					// the only mark the name carries, and only while the cursor is on its row:
					// a dotted rule is the lightest thing that says this word is a place
					mode === "name" &&
						over &&
						"underline decoration-thread/60 decoration-dotted underline-offset-[3px]",
				)}
				initial={still ? false : { opacity: 0, x: -3 }}
				animate={{ opacity: 1, x: 0 }}
				transition={still ? { duration: 0 } : { duration: 0.3, ease: ARRIVE }}
			>
				{shown}
			</motion.span>
		);

	/** the run's count, outside whatever the name became */
	const tail = counted ? (
		<span className={cn("shrink-0 font-mono text-sm tabular-nums leading-4", gone ? "text-muted/45" : "text-text/85")}>
			×{entry.count}
		</span>
	) : null;

	const verb = (
		<span
			className={cn(
				"font-mono text-sm leading-4",
				entry.quiet === true ? "text-muted/70" : "text-muted",
				// the wire name is the one verb long enough to need the room, and it needs all
				// of it: truncating on the left would hide which server it went to
				outside !== undefined && mcp === "raw" ? "min-w-0 truncate" : "shrink-0",
			)}
		>
			{said}
		</span>
	);
	const caret = expandable ? (
		<ChevronIcon open={open} className="ml-0.5 h-2.5 w-2.5 shrink-0 text-muted/35" />
	) : null;
	const row = "-mx-1.5 flex h-[26px] w-fit max-w-[calc(100%+12px)] items-center gap-2.5 rounded-sm px-1.5 text-left";

	/**
	 * The row's own click, spent three ways.
	 *
	 * `name` keeps it on the disclosure and hangs the jump off the name, which means
	 * a target inside a target: the name is a span with a role rather than a nested
	 * button, because a button inside a button is not a thing. That nesting is the
	 * cost of this variant and it is why the other two exist.
	 *
	 * `row` gives the click to the frame and evicts the disclosure to the chevron,
	 * which becomes a target of its own.
	 *
	 * `quiet` and every row that names no frame are untouched.
	 */
	const line =
		mode === "name" ? (
			// not conditioned on `expandable`, though with real data every frame-naming
			// row is: a Read, a Write, an Edit or a Bash all carry a path or a command.
			// A row that had nothing to disclose would still be a place to go
			<button
				type="button"
				onClick={expandable ? () => setClicked(!open) : undefined}
				className={cn(row, "hover:bg-surface")}
			>
				<StateMark state={entry.state} />
				<span className="flex min-w-0 items-baseline gap-1.5">
					{verb}
					<span
						role="link"
						tabIndex={0}
						onClick={(event) => {
							event.stopPropagation();
							go();
						}}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.stopPropagation();
							event.preventDefault();
							go();
						}}
						onMouseEnter={() => point(true)}
						onMouseLeave={() => point(false)}
						className="flex min-w-0 cursor-pointer"
					>
						{label}
					</span>
					{tail}
				</span>
				{caret}
			</button>
		) : mode === "row" ? (
			<div className={cn(row, "hover:bg-surface")}>
				<button
					type="button"
					onClick={go}
					onMouseEnter={() => point(true)}
					onMouseLeave={() => point(false)}
					className="-my-1.5 flex min-w-0 items-center gap-2.5 py-1.5 text-left"
				>
					<StateMark state={entry.state} />
					<span className="flex min-w-0 items-baseline gap-1.5">
						{verb}
						{label}
						{tail}
					</span>
				</button>
				{expandable ? (
					<button
						type="button"
						aria-label={`${entry.verb} ${named ?? ""} path`}
						onClick={() => setClicked(!open)}
						className="-mr-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-xs hover:bg-raised"
					>
						<ChevronIcon open={open} className="h-2.5 w-2.5 text-muted/35" />
					</button>
				) : null}
			</div>
		) : expandable ? (
			<button
				type="button"
				onClick={() => setClicked(!open)}
				onMouseEnter={() => point(true)}
				onMouseLeave={() => point(false)}
				className={cn(row, "hover:bg-surface")}
			>
				<StateMark state={entry.state} />
				<span className="flex min-w-0 items-baseline gap-1.5">
					{verb}
					{label}
					{tail}
				</span>
				{caret}
			</button>
		) : (
			<div className={row} onMouseEnter={() => point(true)} onMouseLeave={() => point(false)}>
				<StateMark state={entry.state} />
				<span className="flex min-w-0 items-baseline gap-1.5">
					{verb}
					{label}
					{tail}
				</span>
			</div>
		);

	return (
		<div className="flex flex-col">
			{line}
			{/* the row's own picture, hanging off the line rather than behind it */}
			{entry.shot !== undefined && shot === "inline" ? (
				<Arrive gap={0}>
					<div className="pt-1 pb-1" style={{ paddingLeft: INDENT }}>
						<Frame>{shotView?.(entry.shot)}</Frame>
					</div>
				</Arrive>
			) : null}
			<AnimatePresence initial={false}>
				{open ? (
					<motion.div
						className="overflow-hidden"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={still ? { duration: 0 } : { duration: 0.24, ease: ARRIVE }}
					>
						<div className="pt-0.5 pb-1" style={{ paddingLeft: INDENT }}>
							{held !== undefined ? (
								<Picture shot={held} view={shot === "open" ? shotView : undefined} />
							) : entry.children === undefined ? (
								<span className="block truncate font-mono text-2xs text-muted/55 leading-4">
									{entry.detail}
								</span>
							) : (
								<div className="relative flex flex-col">
									<span className="absolute top-1 bottom-2 left-0 w-px bg-border-raised" />
									{/* a task appends when its TaskCreate fires, so each one arrives on its
									    own the way a row does — the list writing itself rather than a block
									    of them appearing at once */}
									{entry.children.map((child) => (
										<Arrive key={child.id} gap={0}>
											<span className="flex h-[22px] items-center gap-2 pl-2.5">
												<StateMark state={child.state} className="h-3 w-3" />
												<span className="truncate font-mono text-2xs text-muted leading-3">
													{child.name}
												</span>
											</span>
										</Arrive>
									))}
								</div>
							)}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

/**
 * The agent read a picture back.
 *
 * `spool shot cart` writes a PNG and the next thing the agent does is Read it, so
 * a tool_result comes back holding an image block instead of text. With no view
 * to draw, the disclosure holds the picture's place and says where it was: a
 * frame-shaped well at the ratio spool shoots, and the path beside it. Hand it a
 * view and the well holds the frame itself, and the media type goes — `image/png`
 * is a fact about a file, and this rail speaks frames.
 */
function Picture({ shot, view }: { shot: ShotRef; view: ((shot: ShotRef) => ReactNode) | undefined }) {
	if (view === undefined) {
		return (
			<span className="flex items-start gap-2.5 pt-0.5">
				<span className="h-[74px] w-[34px] shrink-0 rounded-xs border border-border-raised bg-surface" />
				<span className="flex min-w-0 flex-col gap-1 pt-px">
					<span className="truncate font-mono text-2xs text-muted/55 leading-4">{shot.path}</span>
					<span className="font-mono text-2xs text-muted/35 leading-4">{shot.media}</span>
				</span>
			</span>
		);
	}
	return (
		<div className="flex flex-col gap-1.5 pt-0.5">
			<Frame>{view(shot)}</Frame>
			<span className="truncate font-mono text-2xs text-muted/45 leading-4">{shot.frame ?? shot.path}</span>
		</div>
	);
}

/** the picture's own edge, so a frame in the rail is bounded the way one on the canvas is */
function Frame({ children }: { children: ReactNode }) {
	return <div className="w-fit overflow-hidden rounded-xs border border-border-raised bg-bg">{children}</div>;
}

/* ---------- the plan, out of the log ----------
 * A transcript is a log and a log scrolls. Everything else in one is finished the
 * moment it is drawn, so scrolling costs nothing; the plan is the exception,
 * because it goes on changing for the rest of the session. In the Streak capture
 * it is written at row 17 and its first task does not land until row 45, nine
 * minutes and twenty-eight rows later — by which point a transcript has carried
 * it off the top and the tick lands where nobody is looking.
 *
 * So it comes out of the log and sits above it, and it obeys the one-line rule
 * while it does: a count, and the agent's own present-participle phrasing for
 * whatever is running. The list is a click away and is not the resting state.
 */
export function PlanStrip({ plan }: { plan: Plan }) {
	const still = useReducedMotion() === true;
	const [open, setOpen] = useState(false);
	return (
		<div className="flex shrink-0 flex-col border-border border-b">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex h-[34px] w-full items-center gap-2.5 px-3.5 text-left transition-colors duration-150 hover:bg-surface"
			>
				<span className="shrink-0 font-mono text-muted text-sm leading-4">plan</span>
				<span className="shrink-0 font-mono text-muted/60 text-sm tabular-nums leading-4">
					{plan.done}/{plan.total}
				</span>
				{plan.running === null ? null : (
					<span className="min-w-0 flex-1 truncate font-mono text-sm text-text/85 leading-4">{plan.running}</span>
				)}
				<ChevronIcon open={open} className="ml-auto h-2.5 w-2.5 shrink-0 text-muted/35" />
			</button>
			<AnimatePresence initial={false}>
				{open ? (
					<motion.div
						className="overflow-hidden"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={still ? { duration: 0 } : { duration: 0.24, ease: ARRIVE }}
					>
						<div className="relative flex flex-col pb-2 pl-[18px]">
							<span className="absolute top-1 bottom-3 left-[18px] w-px bg-border-raised" />
							{plan.children.map((child) => (
								<span key={child.id} className="flex h-[22px] items-center gap-2 pl-2.5">
									<StateMark state={child.state} className="h-3 w-3" />
									<span className="truncate font-mono text-2xs text-muted leading-3">{child.name}</span>
								</span>
							))}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

/* ---------- the estate, standing ----------
 * The other answer to "what does a broken server look like" (#142): a strip of the
 * whole estate on the plan's shelf, there before the first keystroke and there
 * after the turn lands, because a connector's status is true whether or not
 * anybody reached for it.
 *
 * It obeys the one-line rule the way the plan strip does — a count, and the list a
 * click away — and it draws off `mcp_status`, which is the only place the inventory
 * is trustworthy and the only place the error strings are.
 *
 * What it costs is on screen: on the maintainer's own machine eight of fifteen
 * connectors need signing in and two have failed, none of which Spool can fix and
 * none of which is new. So the resting state of this line is a complaint about a
 * situation that is normal. */

function EstateStrip({ connectors }: { connectors: readonly Connector[] }) {
	const still = useReducedMotion() === true;
	const [open, setOpen] = useState(false);
	const live = connectors.filter((connector) => connector.status === "connected").length;
	return (
		<div className="flex shrink-0 flex-col border-border border-b">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex h-[34px] w-full items-center gap-2.5 px-3.5 text-left transition-colors duration-150 hover:bg-surface"
			>
				<span className="shrink-0 font-mono text-muted text-sm leading-4">connectors</span>
				<span className="shrink-0 font-mono text-muted/60 text-sm tabular-nums leading-4">
					{live}/{connectors.length}
				</span>
				<span className="min-w-0 flex-1 truncate font-mono text-sm text-text/85 leading-4">
					{connectors.length - live} need you in a terminal
				</span>
				<ChevronIcon open={open} className="ml-auto h-2.5 w-2.5 shrink-0 text-muted/35" />
			</button>
			<AnimatePresence initial={false}>
				{open ? (
					<motion.div
						className="overflow-hidden"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={still ? { duration: 0 } : { duration: 0.24, ease: ARRIVE }}
					>
						<div className="pages-scrollbar relative flex max-h-[210px] flex-col overflow-y-auto pb-2 pl-[18px]">
							<span className="absolute top-1 bottom-3 left-[18px] w-px bg-border-raised" />
							{connectors.map((connector) => (
								<span key={connector.name} className="flex h-[22px] items-center gap-2 pl-2.5">
									<StateMark
										state={connector.status === "connected" ? "done" : connector.status === "pending" ? "pending" : "failed"}
										className="h-3 w-3"
									/>
									<span className="min-w-0 shrink truncate font-mono text-2xs text-muted leading-3">
										{connector.name}
									</span>
									<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">{connector.status}</span>
								</span>
							))}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}

/* ---------- the question ----------
 * Drawing this settled one thing before the three variants could even be told
 * apart: **the question itself is never the variable.** It is a sentence the agent
 * wrote, and the rail has drawn the agent's sentences since the first frame, so it
 * goes where prose goes in all three. What actually moves is the option list — and
 * the answer, which is a sentence the *developer* chose and therefore lands in the
 * shape the rail already uses for the developer's words.
 *
 * So an answered question adds nothing permanent to the rail's vocabulary. It is
 * the agent talking, then the human talking, which is what a thread is. The only
 * new geometry in the interface exists while nobody has answered yet, and it is
 * gone the moment somebody has. */

function Ask({
	entry,
	mode,
	picked,
	onPick,
	onDeny,
}: {
	entry: Extract<PlayEntry, { kind: "ask" }>;
	mode: AskMode;
	picked: string | null;
	onPick: (label: string) => void;
	/** absent leaves the question with #145's two exits and no third (#162) */
	onDeny?: (() => void) | undefined;
}) {
	const streaming = entry.shown.length < entry.ask.question.length;
	return (
		<div className="flex flex-col gap-3">
			{/* the agent's own sentence, held at full height from the first character the
			    way every other streaming block is, so the options below do not walk */}
			<p className="relative text-base text-text/90 leading-base">
				<span className="invisible" aria-hidden="true">
					{entry.ask.question}
				</span>
				<span className="absolute inset-0">
					{entry.shown}
					{streaming ? <Caret /> : null}
				</span>
			</p>
			{picked !== null ? (
				<Answered label={picked} />
			) : entry.state === "stopped" ? (
				<Dismissed />
			) : entry.state === "failed" ? (
				<Dropped />
			) : mode === "log" && entry.live ? (
				<div className="flex flex-col gap-1.5">
					{entry.ask.options.map((option) => (
						<button
							key={option.label}
							type="button"
							onClick={() => onPick(option.label)}
							className="group flex flex-col gap-1 rounded-md border border-border-raised bg-surface px-3 py-2.5 text-left transition-colors duration-150 hover:border-muted/45"
						>
							<span className="text-base text-text leading-base">{option.label}</span>
							{option.description === "" ? null : (
								<span className="text-2xs text-muted/70 leading-4">{option.description}</span>
							)}
						</button>
					))}
					{/* not a fourth option, so it must not look like one. An option is an answer
					    and this is the refusal of the whole question — full-width bordered rows
					    above, one quiet mono word below them, in the register the composer uses
					    for its own hints. It carries no key, because #165 gave esc to a turn
					    that is *running* and a parked one is not that; whether it should have
					    one is #162's to reopen, not this frame's to invent. */}
					{onDeny === undefined ? null : (
						<button
							type="button"
							onClick={onDeny}
							className="w-fit pt-0.5 font-mono text-2xs text-muted/45 leading-3 transition-colors duration-150 hover:text-muted"
						>
							dismiss
						</button>
					)}
				</div>
			) : null}
		</div>
	);
}

/**
 * The answer, in the shape the rail already draws the developer's words in.
 *
 * Not a tool row, because the verb slot has nowhere to put it: `ask` is spent —
 * #142 gave it to every call that left the building, and `ask Notion` one row
 * above `asked Shot fix` is two words the eye cannot separate at 11px. The
 * developer's own accent rail is the answer that needed no new word at all.
 */
function Answered({ label }: { label: string }) {
	return (
		<div className="relative flex flex-col gap-1.5 pl-3.5">
			<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
			<p className="text-base text-text leading-base">{label}</p>
		</div>
	);
}

/**
 * Nobody answered, and it is not a stall.
 *
 * Measured: the result lands 84ms after the ask under `-p`, the agent thinks for
 * five `thinking_tokens` beats, and then says `Understood, I'll leave your install
 * alone.` — it read the silence as the cautious option and carried on. That prose
 * is the next entry in the log and it plays for free, so this row's whole job is to
 * say the question expired rather than that it failed.
 */
function Dropped() {
	return (
		<div className="flex items-center gap-2.5">
			<StateMark state="failed" />
			<span className="font-mono text-2xs text-muted/55 leading-3">nobody answered</span>
		</div>
	);
}

/**
 * #162's third exit, drawn.
 *
 * `nobody answered` and this are opposites and must not look alike: the first is the
 * empty answer, where the agent carries on and picks for you, and the second is a
 * bare `{behavior:"deny"}`, where it stops and waits. So this takes the `stopped`
 * mark rather than `failed`'s cross — the same mark #165 gives a tool an interrupt
 * caught, which is right, because the binary stamps both the same way: a deny and an
 * interrupt both land `toolDenialKind: "user-rejected"` and neither tool ever ran.
 */
function Dismissed() {
	return (
		<div className="flex items-center gap-2.5">
			<StateMark state="stopped" />
			<span className="font-mono text-2xs text-muted/55 leading-3">dismissed</span>
		</div>
	);
}

/**
 * The options on #117's shelf, which is where the plan lives.
 *
 * Drawn because the ticket asks the question and the shelf is the rail's one free
 * horizontal surface — but #117's own test rules it out before taste gets a look
 * in: a thing earns its own place only if it outlives the call that made it, and a
 * question is over the moment it is answered. It also has to win the shelf against
 * a plan, a rate limit and a login, which is three claimants for one strip.
 */
function AskShelf({ ask, onPick }: { ask: Question; onPick: (label: string) => void }) {
	return (
		<div className="flex shrink-0 flex-col gap-2 border-border border-b px-3.5 py-2.5">
			<div className="flex items-baseline justify-between gap-2">
				<span className="truncate font-mono text-2xs text-text/70 leading-3">{ask.header}</span>
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">waiting on you</span>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{ask.options.map((option) => (
					<button
						key={option.label}
						type="button"
						onClick={() => onPick(option.label)}
						className="rounded border border-border-raised bg-surface px-2 py-1 text-2xs text-text leading-4 transition-colors duration-150 hover:border-muted/45"
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}

/**
 * The options as chips over the composer, one description at a time.
 *
 * The honest cost of keeping the log's one-line rule perfect: three options whose
 * descriptions are 150 to 250 characters each become three chips of about twenty,
 * and the part that says what each one costs you is reachable only by hovering
 * them one after another. Comparing three becomes serial where the log's block
 * makes it parallel — which is the whole argument, drawn rather than asserted.
 */
function AskChips({ ask, onPick }: { ask: Question; onPick: (label: string) => void }) {
	const [over, setOver] = useState<string | null>(null);
	const shown = ask.options.find((option) => option.label === over);
	return (
		<div className="relative flex flex-col gap-1.5">
			{shown === undefined || shown.description === "" ? null : (
				<div className="absolute inset-x-0 bottom-full mb-2 rounded-md border border-border-raised bg-surface px-3 py-2">
					<p className="text-2xs text-muted/70 leading-4">{shown.description}</p>
				</div>
			)}
			<div className="flex flex-wrap gap-1.5">
				{ask.options.map((option) => (
					<button
						key={option.label}
						type="button"
						onClick={() => onPick(option.label)}
						onMouseEnter={() => setOver(option.label)}
						onMouseLeave={() => setOver(null)}
						className="rounded border border-border-raised bg-surface px-2 py-1 text-2xs text-text leading-4 transition-colors duration-150 hover:border-muted/45"
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}

/* ---------- the composer ----------
 * A field, not a slot: three rows at rest, growing to eight before it scrolls
 * inside itself, with the selection chip in the same bounded box as the prompt
 * because chip and prompt go out as one message. Enter sends what is in it
 * verbatim, whatever that is. */

const MIN_H = 60;
const MAX_H = 160;

function Composer({
	field,
	strip,
	chips,
	onPick,
	answering,
	model,
	lit,
	onLight,
	onDrop,
	phase,
	stop,
	onStop,
	onQueue,
	onSend,
	onReplay,
	onReach,
}: {
	field: RefObject<HTMLTextAreaElement | null>;
	strip: Strip;
	/** a question's options, when the proposal puts them here rather than in the log (#145) */
	chips: Question | null;
	onPick: (label: string) => void;
	/**
	 * The turn is held at a question, so Enter answers it instead of starting a new
	 * turn (#145). This is the `response` field rather than `answers`, and the binary
	 * prefers it: it tests `response` first and tells the agent to read it carefully
	 * because the person `may request clarification, changes, or that you not proceed`.
	 * An option list is not the only way to answer a question, and it never was.
	 */
	answering: boolean;
	model: ReactNode;
	lit: string | null;
	onLight: ((id: string | null) => void) | undefined;
	onDrop: ((id: string | null) => void) | undefined;
	phase: TurnPhase;
	/** `none` while there is nothing to stop, which is most of the time */
	stop: StopWhere;
	onStop: () => void;
	/**
	 * What Enter does while a turn is running (#170).
	 *
	 * Absent is the composer as it was: `busy` swallowed the press, on the reasoning
	 * written into #165 that Spool "refuses to send while a turn is running", which is
	 * why an `interrupt`'s `{still_queued:[…]}` has been empty in every capture here.
	 * Present, the press is taken and held rather than sent, and the hint below says so
	 * — because a field that accepts a message and shows nothing for it is worse than
	 * one that refuses.
	 */
	onQueue: ((text: string) => void) | undefined;
	onSend: (text: string) => void;
	onReplay: () => void;
	onReach: (event: { target: EventTarget | null }) => void;
}) {
	const [value, setValue] = useState("");
	const busy = phase === "playing" && !answering;

	const fit = (element: HTMLTextAreaElement) => {
		element.style.height = "auto";
		element.style.height = `${Math.max(MIN_H, Math.min(element.scrollHeight, MAX_H))}px`;
	};

	return (
		<div className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5" onMouseDown={onReach}>
			{chips === null ? null : <AskChips ask={chips} onPick={onPick} />}
			<div className="flex flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5 transition-colors duration-150 focus-within:border-muted/45">
				<SelectionStrip strip={strip} lit={lit} onLight={onLight} onDrop={onDrop} />
				<div className="flex items-end gap-2">
				<textarea
					ref={field}
					value={value}
					rows={3}
					spellCheck={false}
					placeholder={answering ? "or say it in your own words" : "say what to change"}
					aria-label={answering ? "or say it in your own words" : "say what to change"}
					onChange={(event) => {
						setValue(event.target.value);
						fit(event.target);
					}}
					onKeyDown={(event) => {
						// the canvas never sees this: `canvas.tsx:2347` returns on any keydown whose
						// target is a textarea, so esc in the composer has been going nowhere since
						// #139 — which is the whole reason a running turn can have it without
						// taking a rung off the ladder out there (#165)
						if (event.key === "Escape") {
							if (stop === "none") return;
							event.preventDefault();
							onStop();
							return;
						}
						if (event.key !== "Enter" || event.shiftKey) return;
						event.preventDefault();
						const text = value.trim();
						// a running turn used to swallow this press. #170 takes it and holds it
						// instead, and the field clears either way, because either way the
						// message has been taken
						if (text === "" || (busy && onQueue === undefined)) return;
						setValue("");
						event.currentTarget.style.height = `${MIN_H}px`;
						if (busy) onQueue?.(text);
						else if (answering) onPick(text);
						else onSend(text);
					}}
					className="w-full resize-none bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
					style={{ height: MIN_H }}
				/>
					{stop === "field" ? <StopButton where="field" onStop={onStop} /> : null}
				</div>
			</div>
			{/* the model takes the hint's place rather than sitting beside it: an 18px
			    line has room for one quiet thing on the left, and which model is
			    answering outranks a keyboard hint you learn once */}
			<div className="relative flex h-[18px] items-center justify-between">
				{/* the hint is the only thing saying Enter is not being thrown away, so it changes
				    word while a turn runs rather than going quiet the way it did before #170 */}
				{model ?? (
					<span className="font-mono text-2xs text-muted/45 leading-3">
						{busy ? (onQueue === undefined ? "" : "enter to queue") : "enter to send"}
					</span>
				)}
				{/* stop and replay are the same slot because they are the same question asked
				    of a turn at its two ends, and they can never both be true: one is what you
				    can do to a turn that is running, the other to one that has finished. It
				    draws heavier than `replay` on purpose — replay costs a second and this
				    stops something spending tokens and writing files. */}
				{stop === "footer" ? <StopButton where="footer" onStop={onStop} /> : null}
				{/* a stopped turn replays too: `replay` is the prototype's own affordance and
				    has no counterpart in the product, where what follows a stop is simply the
				    next thing you type — which the composer already accepts, because `busy` is
				    false the moment the turn is no longer playing */}
				{phase === "settled" || phase === "stopped" ? (
					<button
						type="button"
						onClick={onReplay}
						className="font-mono text-2xs text-muted/45 leading-3 transition-colors duration-150 hover:text-muted"
					>
						replay
					</button>
				) : null}
			</div>
		</div>
	);
}

/**
 * The selection, sitting in the composer and going out with the message without
 * being asked for. Its accent is the same one the entry wears out on the canvas,
 * because the chip and the outline are one object — which is why hovering either
 * one lights the other, and why a chip that cannot be paired with a box out there
 * is a chip that should not be drawn.
 *
 * One line, always. Either the chips fit on it or the strip is a count; the
 * composer never grows downward to make room for context, because the space
 * below is the prompt's. Opening the count is the human asking for the list, and
 * then it is a list: hoverable, individually droppable, eight rows before it
 * scrolls inside itself and no bar when it does.
 */

/** rows the open list shows before it starts scrolling under a fade */
const ROWS_SHOWN = 8;

function SelectionStrip({
	strip,
	lit,
	onLight,
	onDrop,
}: {
	strip: Strip;
	lit: string | null;
	onLight: ((id: string | null) => void) | undefined;
	onDrop: ((id: string | null) => void) | undefined;
}) {
	const still = useReducedMotion() === true;
	const [open, setOpen] = useState(false);
	if (strip.kind === "none") return null;

	// no wrap: the strip is chips because they fit on one line, and a second line
	// would be the rule breaking quietly rather than the count taking over. If the
	// estimate is off by a few pixels a chip truncates instead
	if (strip.kind === "chips") {
		// the entered frame is the one chip whose ✕ has nowhere to land: removal
		// mirrors the canvas, and out there the only way to stop pointing at the
		// frame you are inside is to leave it. Three of the four variants drop it.
		const inside = strip.entered;
		return (
			<span className="flex min-w-0 items-center gap-1.5">
				{strip.chips.map((chip) => (
					<Chip
						key={chip.id}
						label={chip.label}
						lit={lit === chip.id}
						weak={inside === "quiet"}
						onLight={() => onLight?.(chip.id)}
						onLeave={() => onLight?.(null)}
						onDrop={inside === undefined || inside === "drop" ? () => onDrop?.(chip.id) : undefined}
					/>
				))}
			</span>
		);
	}

	return (
		<span className="flex min-w-0 flex-col gap-1.5">
			<span className="flex min-w-0 items-center">
				<Chip
					label={strip.label}
					lit={lit !== null}
					open={open}
					onOpen={() => setOpen(!open)}
					onLight={() => onLight?.("*")}
					onLeave={() => onLight?.(null)}
					onDrop={() => onDrop?.(null)}
				/>
			</span>
			<AnimatePresence initial={false}>
				{open ? (
					<motion.span
						className="block overflow-hidden"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={still ? { duration: 0 } : { duration: 0.24, ease: ARRIVE }}
					>
						{/* Eight rows and then it scrolls, and it scrolls without a bar:
						    the list is for reaching one member, never for reading forty,
						    and a native scrollbar in a 420 rail is a grey slab across the
						    only accent on screen. The fade says there is more the way the
						    transcript's does. Rows keep their padding inside the box
						    rather than hanging off it on a negative margin, or the box
						    grows a second bar for content it made itself. */}
						<span className="relative flex flex-col">
							<span className="flex max-h-[208px] flex-col overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								{strip.chips.map((chip) => (
									<button
										key={chip.id}
										type="button"
										onMouseEnter={() => onLight?.(chip.id)}
										onMouseLeave={() => onLight?.(null)}
										onClick={() => onDrop?.(chip.id)}
										className={cn(
											"group flex h-[26px] shrink-0 items-center gap-2 rounded-xs px-1 text-left",
											lit === chip.id && "bg-surface",
										)}
									>
										<span
											className={cn(
												"h-2.5 w-[2px] shrink-0 rounded-full",
												lit === chip.id ? "bg-thread" : "bg-thread/40",
											)}
										/>
										<span className="min-w-0 flex-1 truncate font-mono text-text/80 text-xs leading-4">
											{chip.label}
										</span>
										<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/0 group-hover:text-muted/60">
											<CloseIcon className="h-2 w-2" />
										</span>
									</button>
								))}
							</span>
							{strip.chips.length > ROWS_SHOWN ? (
								<span className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-surface to-transparent" />
							) : null}
						</span>
					</motion.span>
				) : null}
			</AnimatePresence>
		</span>
	);
}

function Chip({
	label,
	lit,
	weak = false,
	open,
	onOpen,
	onLight,
	onLeave,
	onDrop,
}: {
	label: string;
	lit: boolean;
	/** a chip nobody picked, drawn as the weaker claim it might be (#139) */
	weak?: boolean;
	open?: boolean;
	onOpen?: (() => void) | undefined;
	onLight: () => void;
	onLeave: () => void;
	/** absent when there is nothing a ✕ could do — then the chip has no ✕ at all */
	onDrop?: (() => void) | undefined;
}) {
	const body = (
		<>
			<span
				className={cn(
					"h-3 w-[2px] shrink-0 rounded-full",
					weak ? (lit ? "bg-thread/50" : "bg-thread/25") : lit ? "bg-thread" : "bg-thread/55",
				)}
			/>
			<span
				className={cn("min-w-0 truncate font-mono text-xs leading-4", weak ? "text-muted" : "text-text/85")}
			>
				{label}
			</span>
			{onOpen === undefined ? null : (
				<ChevronIcon open={open ?? false} className="h-2.5 w-2.5 shrink-0 text-muted/40" />
			)}
		</>
	);
	return (
		<span
			className={cn(
				"flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border pl-2 transition-colors duration-150",
				weak ? "bg-surface" : "bg-raised",
				// the ✕'s own padding goes with it, or the chip keeps a gap it no longer uses
				onDrop === undefined ? "pr-2.5" : "pr-1",
				lit ? "border-thread/45" : "border-border-raised",
			)}
			onMouseEnter={onLight}
			onMouseLeave={onLeave}
		>
			{onOpen === undefined ? (
				body
			) : (
				<button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-2 text-left">
					{body}
				</button>
			)}
			{onDrop === undefined ? null : (
				<button
					type="button"
					onClick={onDrop}
					aria-label={`drop ${label}`}
					className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/50 transition-colors duration-150 hover:bg-surface hover:text-text"
				>
					<CloseIcon className="h-2 w-2" />
				</button>
			)}
		</span>
	);
}
