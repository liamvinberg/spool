import { createContext, memo, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Attachment } from "../../attachment";
import type { AgentReply } from "../../daemon/agent-control";
import type { AgentEngineId } from "../../daemon/agent-engine";
import type { SelectionEntry } from "../api";
import { cn } from "../cn";
import { AskCard, type AskEntry, FoldedAsk, useAsk, waitingAsk } from "./agent-ask-view";
import { composerWidth, stripOf } from "./agent-chips";
import type { Pointing } from "./agent-composer";
import { Composer } from "./agent-composer";
import { Spinner } from "./agent-marks";
import type { AgentModelDeck } from "./agent-model";
import { FADE_OUT_MS, useLeaving } from "./agent-motion";
import { frameHolding } from "./agent-nouns";
import type { PermissionDeck } from "./agent-permissions";
import type { InstallDeck, LoginDeck } from "./agent-preflight";
import { type AgentQueued, handedBack, handedBackReferences } from "./agent-queue";
import { SeedParagraphs, SeedSurface } from "./agent-seed";
import { Shot } from "./agent-shot";
import type { AgentTurn } from "./agent-stream";
import { ThreadDrop, type Threads, ThreadTitle } from "./agent-thread-list";
import {
	type AgentEntry,
	type AgentPlan,
	type AgentRow,
	type AgentTile,
	duration,
	type RowState,
} from "./agent-transcript";
import { TurnFoot } from "./agent-turn-foot";
import { DeadComposer, InstallWall, LoginStrip, RecoveryView } from "./agent-wall";
import { ChevronIcon } from "./sidebar";
import { useStillness } from "./stillness";

/**
 * The agent pane (#144, #192, #193, #194, #359): one thread, drawn whole.
 *
 * There is no tab row. The agent owns this pane — `elements` died with the
 * inspector and `connections` left for the ambient walk layer — so the pane is the
 * transcript and the composer and nothing between them. What that buys is the width:
 * at 420 a tab row is a whole line of a narrow side spent saying which of two
 * things you are looking at, and there is only one thing to look at.
 *
 * Four things render and nothing else: the plan, the human's words, the agent's
 * words, and one line per tool call. The wait before the first token and the model's
 * own thinking render nothing. Threads, chips and the model readout are later
 * tickets, and this reads correctly without them.
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

/** the mark's own width and the gap beside it, so a disclosure lines up under the verb */
const INDENT = 14 + 10;

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
	/** each frame's still, where the canvas has one, for a turn's grid (#365) */
	readonly stills?: ReadonlyMap<string, string>;
	/** Put back a frame a turn deleted (#365); absent where nothing can */
	readonly onPutBack?: (tile: AgentTile) => Promise<boolean>;
	/** the frames it had and no longer has, which read as gone and do nothing */
	readonly gone: ReadonlySet<string>;
	/** the cursor is on a row naming this frame, or has left; answered out on the canvas */
	readonly onPoint: (frame: string | null) => void;
	readonly onJump: (frame: string) => void;
}

/**
 * The canvas handing the person to the agent (#255): the composer takes focus,
 * and where a gesture was refused, the words that describe it are put in the
 * draft under the refusal's own key, so a second handoff about the same thing
 * does not repeat them.
 */
export interface AgentRequest {
	id: string;
	thread: string;
	prepared?: { intent: string; text: string; selection: readonly SelectionEntry[] };
}

/**
 * What the composer is holding for one thread: unsent words and a reference.
 *
 * Per thread, because words nobody has sent belong to the conversation they were written
 * for. Switching a thread to check on something must not throw a half-typed sentence away,
 * and must not carry it into somebody else's transcript either.
 */
interface Holding {
	readonly draft: string;
	readonly attached: readonly Attachment[];
	readonly prepared?: Readonly<
		Record<
			string,
			NonNullable<AgentRequest["prepared"]> & {
				readonly inserted: string;
				readonly span?: { readonly start: number; readonly end: number };
			}
		>
	>;
}

/** Only untouched inserted spans may be retired; equal user words are not ownership. */
function changedDraft(was: Holding, draft: string): Holding {
	if (draft === was.draft) return was;
	if (!draft.trim()) return { ...was, draft, prepared: {} };
	let start = 0;
	while (start < was.draft.length && start < draft.length && was.draft[start] === draft[start]) start++;
	let end = was.draft.length;
	let nextEnd = draft.length;
	while (end > start && nextEnd > start && was.draft[end - 1] === draft[nextEnd - 1]) {
		end--;
		nextEnd--;
	}
	const delta = nextEnd - end;
	const prepared: Record<string, NonNullable<Holding["prepared"]>[string]> = {};
	for (const [id, entry] of Object.entries(was.prepared ?? {})) {
		const { span, ...kept } = entry;
		prepared[id] = !span
			? entry
			: end <= span.start
				? { ...kept, span: { start: span.start + delta, end: span.end + delta } }
				: start >= span.end
					? entry
					: kept;
	}
	return { ...was, draft, prepared };
}

/** the mode menu's door, for an approval in the log that offers to change the mode (#364) */
const PermissionAction = createContext<(() => void) | undefined>(undefined);

export function AgentRail({
	active = true,
	agentReady = true,
	legacy = false,
	width,
	permissions,
	turn,
	jump,
	pointing,
	threads,
	install,
	login,
	request,
	model,
	preferred,
}: {
	/** the pane's settled width (`pane-window.tsx`), which the composer measures its chip strip against */
	width: number;
	permissions?: PermissionDeck | undefined;
	/**
	 * The open thread's turn, whole (#117, #170, #234): its log, its plan and phase, the
	 * queue and the box's draft, the usage window and context, and the doors that send,
	 * queue, stop and answer. It arrives as one object from `useAgentStream` and is read
	 * here as one, rather than copied over prop by prop.
	 */
	turn: AgentTurn;
	jump: FrameJump;
	pointing: Pointing;
	/** every conversation this project has, newest first (#136, #200) */
	threads: Threads;
	/** whether there is an agent on this machine at all, and the look that says so (#201) */
	install: InstallDeck;
	/** the agent would not start because nobody is signed in, and the way out (#201) */
	login: LoginDeck;
	request?: AgentRequest | undefined;
	active?: boolean;
	/** the machine's agent choice has loaded: until then no engine, model or mode is drawn (#361) */
	agentReady?: boolean;
	/** the open thread was the removed bundled engine's, which nothing continues (#363) */
	legacy?: boolean;
	/** which machine is answering, and the list the binary offered instead (#118, #199) */
	model: AgentModelDeck;
	/** the machine's usual agent: what a chat's row and the model trigger leave unsaid (#364) */
	preferred?: AgentEngineId | null | undefined;
}) {
	const {
		entries,
		plan,
		phase,
		elapsed,
		queued,
		handback,
		draft,
		onDraft,
		attached,
		onAttach,
		running,
		limit,
		context,
		send: onSend,
		queue: onQueue,
		unqueue: onUnqueue,
		stop: onStop,
		answer: onAnswer,
	} = turn;
	/** how many sends this rail has watched go out, which is the log's cue to follow again */
	const [spoke, setSpoke] = useState(0);
	const [footerMenu, setFooterMenu] = useState<"models" | "permissions" | null>(null);
	/** the clock read when the thread list was dropped over the log, or null while it is shut */
	const [listing, setListing] = useState<number | null>(null);
	/**
	 * What the composer is holding, lifted out of it because two things write here
	 * (#170).
	 *
	 * A take-back drops one message into the field it is sitting on, and a stop hands
	 * back everything the queue held — and a stop can arrive from the canvas, where the
	 * hands are watching a frame repaint and the box is nowhere near the press. So the
	 * draft is the rail's and the field is controlled.
	 *
	 * It is held per thread, because words nobody has sent belong to the conversation they
	 * were written for: switching threads to check on something must not throw away a
	 * half-typed sentence, and must not carry it into somebody else's transcript either.
	 */
	const open = threads.open;
	const initialThread = useRef(open);
	if (!initialThread.current && open) initialThread.current = open;
	const [held, setHeld] = useState<Readonly<Record<string, Holding>>>({});
	const heldRef = useRef(held);
	heldRef.current = held;
	/**
	 * What this thread was last left holding, for a rail that has just been opened (#234).
	 *
	 * The words are stored with the thread, so a tab that went away comes back to the
	 * sentence it was in the middle of. It is a starting point and not a second source of
	 * truth: the moment anything is typed here the composer's own copy is what the field
	 * draws, and the thread is told about every change to it.
	 */
	const seed: Holding = { draft, attached };
	const latestSeed = useRef(seed);
	latestSeed.current = seed;
	const holding = held[open] ?? seed;
	const write = (patch: (was: Holding) => Holding) => {
		const target = open || initialThread.current;
		const next = patch(heldRef.current[target] ?? (open ? seed : latestSeed.current));
		heldRef.current = { ...heldRef.current, [target]: next };
		setHeld(heldRef.current);
		return next;
	};
	/** the field's words, into the composer and into the thread that outlives it */
	const writeDraft = (text: string) => {
		write((was) => changedDraft(was, text));
		onDraft(text, open);
	};
	/** the handovers already merged per thread, since the same words can come back twice */
	const merged = useRef(new Map<string, number>());
	// biome-ignore lint/correctness/useExhaustiveDependencies: the merge is the handover's, and it must run once per handover rather than again on every keystroke the seed and the writer change with
	useEffect(() => {
		if (handback.count === (merged.current.get(open) ?? 0)) return;
		merged.current.set(open, handback.count);
		const was = held[open] ?? seed;
		const landed = handedBack(
			handback.messages.map((one) => one.text),
			was.draft,
		);
		setHeld((all) => ({
			...all,
			[open]: { ...changedDraft(was, landed), attached: handedBackReferences(handback.messages, was.attached) },
		}));
		// the words landed in the box rather than being typed into it, and the box is written
		// down either way: a stop hands a whole queue back, which is the most there has ever
		// been in there to lose (#234)
		onDraft(landed);
		onAttach(handedBackReferences(handback.messages, was.attached), open);
	}, [handback, open]);
	const requested = useRef<string | undefined>(undefined);
	// biome-ignore lint/correctness/useExhaustiveDependencies: one explicit handoff, not a replay when the draft changes
	useEffect(() => {
		if (!request || requested.current === request.id || request.thread !== open) return;
		requested.current = request.id;
		const was = held[open] ?? seed;
		let next = was;
		if (!request.prepared) {
			// a plain handoff clears what an earlier refusal put in the draft, so the
			// words left are the person's own
			const removing = Object.entries(was.prepared ?? {}).sort(
				([, a], [, b]) => (b.span?.start ?? -1) - (a.span?.start ?? -1),
			);
			for (const [id] of removing) {
				const entry = next.prepared?.[id];
				if (!entry) continue;
				const prepared = { ...next.prepared };
				delete prepared[id];
				next = { ...next, prepared };
				if (entry.span && next.draft.slice(entry.span.start, entry.span.end) === entry.inserted)
					next = changedDraft(next, next.draft.slice(0, entry.span.start) + next.draft.slice(entry.span.end));
			}
		} else if (!was.prepared?.[request.prepared.intent]) {
			const inserted = `${was.draft ? "\n\n" : ""}${request.prepared.text}`;
			next = {
				...was,
				draft: was.draft + inserted,
				prepared: {
					...was.prepared,
					[request.prepared.intent]: {
						...request.prepared,
						inserted,
						span: { start: was.draft.length, end: was.draft.length + inserted.length },
					},
				},
			};
		}
		setHeld((all) => ({ ...all, [open]: next }));
		onDraft(next.draft, open);
	}, [request, open]);
	/**
	 * The question the composer would answer, read off the log rather than handed in.
	 *
	 * A question only, never an approval. Prose is an answer to a question — it becomes
	 * the response the tool tests first — and there is no sentence that answers "may I
	 * run this": typing one at an approval would let the call through carrying the words
	 * as a spare argument, which is the opposite of what somebody writing "wait, don't"
	 * means. An approval is answered by pressing one of its three, and by nothing else.
	 */
	const asking = entries.find((entry) => entry.kind === "ask" && entry.state === "open" && entry.question);
	/**
	 * How long the request now out has been silent, which is the one thing the stroke
	 * reads (#231).
	 *
	 * Off the receipt rather than off a clock of the composer's own, because the receipt
	 * is already the authority on when a request went out and when it stopped being
	 * silent. A settled one is not silence any more and contributes nothing.
	 */
	const outstanding = entries.find(
		(entry): entry is Extract<AgentEntry, { kind: "wait" }> =>
			entry.kind === "wait" && entry.state === "running" && entry.ms === null,
	);
	const waited = outstanding === undefined ? 0 : Math.max(0, elapsed - outstanding.at);
	return (
		<PermissionAction value={permissions === undefined ? undefined : () => setFooterMenu("permissions")}>
			<div
				data-agent-rail=""
				data-agent-rail-engine={model.engine}
				className="flex h-full min-w-[200px] flex-col overflow-hidden bg-bg"
			>
				{install.none ? (
					/*
					 * There is nothing to spawn, and spool knew it before anybody typed (#201).
					 *
					 * The wall takes the transcript's place and the composer stays, dead. The rest of
					 * the shelf goes with the transcript: a plan belongs to a turn, and a thread is a
					 * conversation you cannot continue on a machine with no agent on it.
					 */
					<div className="flex h-full min-w-[200px] flex-col">
						<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
							<InstallWall install={install} />
						</div>
						<DeadComposer />
					</div>
				) : (
					/*
					 * The pane is one panel, and its title is where the other threads are reached
					 * (#205). The panel is everything one thread is; the list the title drops is
					 * every thread there is, and a press on it changes only the panel.
					 */
					<div className="flex h-full min-w-[200px] flex-col">
						{/* the title leads the shelf, because it says which thread everything under it
					    belongs to, and it is where the others are reached from */}
						<ThreadTitle
							threads={threads}
							listing={listing}
							onList={(at) => {
								setFooterMenu(null);
								setListing(at);
							}}
						/>
						{/* the list drops over the shelf and the log together, so it hangs off the title
					    whatever the shelf is carrying */}
						<div className="relative flex min-h-0 flex-1 flex-col">
							{/* the standing half of being signed out, on the shelf the plan would take —
						    and they never want it at once, because a plan belongs to a turn that is
						    running and this exists precisely because none can (#201) */}
							{model.engine === undefined && login.out ? <LoginStrip login={login} /> : null}
							{plan === null ? null : <PlanStrip plan={plan} />}
							<Transcript
								entries={entries}
								afterLog={
									legacy ? (
										<p data-agent-legacy="" className="text-muted type-detail">
											This chat ran on spool’s built-in agent, which is gone. It can’t be continued; what you
											send starts a new chat.
										</p>
									) : model.engine === undefined ||
										!(install.missing || login.out || login.recovery) ? null : (
										<RecoveryView
											onNew={threads.onNew}
											install={install}
											login={login}
											model={model}
											onModels={() => setFooterMenu("models")}
										/>
									)
								}
								queued={queued}
								onUnqueue={onUnqueue}
								live={phase === "playing"}
								spoke={spoke}
								elapsed={elapsed}
								jump={jump}
								onAnswer={onAnswer}
							/>
							<ThreadDrop
								threads={threads}
								preferred={preferred}
								now={listing}
								onDone={() => setListing(null)}
							/>
						</div>
						{/* the strip is measured against the composer's own inner width: the same three
					    chips fit at 420 and are a count at the 200 floor, because the rule is one line
					    rather than one width */}
						<Composer
							thread={open}
							// a legacy chat is read-only: nothing answers it, so there is no one to pick (#363)
							ready={agentReady && !legacy}
							permissions={permissions}
							menu={footerMenu}
							onMenu={setFooterMenu}
							phase={phase}
							waited={waited}
							finished={threads.finished}
							answering={asking?.kind === "ask" ? asking.request : null}
							request={active && request?.thread === open ? request.id : undefined}
							strip={stripOf(
								Object.values(holding.prepared ?? {}).length
									? Object.values(holding.prepared ?? {}).flatMap((entry) => entry.selection)
									: pointing.entries,
								composerWidth(width),
								pointing.inside,
							)}
							pointing={
								Object.values(holding.prepared ?? {}).length
									? {
											...pointing,
											entries: Object.values(holding.prepared ?? {}).flatMap((entry) => entry.selection),
											onDrop: () => write((was) => ({ ...was, prepared: {} })),
										}
									: pointing
							}
							draft={holding.draft}
							onDraft={writeDraft}
							attached={holding.attached}
							onAttach={async (update) => {
								const target = open || initialThread.current;
								const was = heldRef.current[target] ?? (open ? seed : latestSeed.current);
								const next = update(was.attached);
								const adding = next.some((image) => !was.attached.includes(image));
								// A visible new thumbnail is already stored. Removing one is immediate;
								// its text recovery record prevents an old image returning after refresh.
								// The thread holds the image before its store lands, so the composer
								// keeps drawing its own copy rather than the thread's until then.
								if (adding) write(() => was);
								if (adding) await onAttach(next, target);
								write((current) => ({ ...current, attached: next }));
								if (!adding) await onAttach(next, target);
							}}
							model={model}
							limit={limit}
							context={context}
							onSwitch={async (engine, fresh) => {
								if (fresh) threads.onNew();
								return (await model.onEngine?.(engine)) === true;
							}}
							login={login}
							preferred={preferred}
							onNewThread={() => {
								threads.onNew();
								setListing(null);
							}}
							onSend={(text, sent) => {
								if (!agentReady || install.missing || login.recovery) return false;
								const took = onSend(text, sent);
								// the log follows the live edge again because something was said, so a press
								// that said nothing must not move it
								if (took) setSpoke((count) => count + 1);
								return took;
							}}
							running={running}
							onQueue={(text, sent) => {
								const took = onQueue(text, sent);
								// the words wait at the end of the log, so the log follows to show them
								if (took) setSpoke((count) => count + 1);
								return took;
							}}
							onStop={onStop}
							onAnswer={onAnswer}
						/>
					</div>
				)}
			</div>
		</PermissionAction>
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
				<span className="shrink-0 text-muted type-value">plan</span>
				<span className="shrink-0 text-muted tabular-nums type-value">
					{plan.done}/{plan.total}
				</span>
				{/* nothing is running between a task landing and the agent saying which is next,
				    and the strip says nothing rather than holding the last thing it said */}
				{plan.running === null ? null : (
					<span className="min-w-0 flex-1 truncate text-text type-value">{plan.running}</span>
				)}
				<ChevronIcon open={open} className="ml-auto h-2.5 w-2.5 shrink-0 text-muted/35" />
			</button>
			{open ? (
				<Arrive gap={0}>
					<div className="relative flex shrink-0 flex-col pb-2 pl-[18px]">
						{/* the rule stands where the list hangs from, a little in from the strip's own
						    left edge, so the tasks read as belonging to the line above them */}
						<span className="absolute top-1 bottom-3 left-[18px] w-px bg-border-raised" />
						{plan.tasks.map((task) => (
							<span key={task.key} className="flex h-[22px] items-center gap-2 pl-2.5">
								<StateMark state={task.state} className="h-3 w-3" />
								<span className="truncate text-muted type-detail">{task.name}</span>
							</span>
						))}
					</div>
				</Arrive>
			) : null}
		</div>
	);
}

/* ---------- the transcript ----------
 * It follows the live end while the reader is already there, and stops the moment
 * they scroll to read something: a log that yanks itself back down mid-sentence is
 * worse than one that does not follow at all.
 *
 * Leaving is an act and so is coming back. Any input that could carry the reader away
 * from the end — a wheel, a finger, the scrolling keys, a scrollbar drag — ends the
 * following before the scroll it causes ever lands. It resumes only where resuming
 * moves nothing: the chip over the log's foot, the reader's own words going out, or
 * the reader arriving back at the end themselves. */

/** the keys that scroll a focused log, and which way they carry the reader */
const SCROLL_KEYS: Record<string, -1 | 1 | undefined> = {
	ArrowUp: -1,
	PageUp: -1,
	Home: -1,
	ArrowDown: 1,
	PageDown: 1,
	End: 1,
	" ": 1,
};

/**
 * Where the log scrolls to while it is following the live end: the end, always.
 *
 * It once anchored the first line of a message taller than the box instead, so a long
 * verdict was not driven out of view as it streamed. That read as the log falling out
 * of live, with nothing to say it had: the newest words filled in below the fold while
 * the scrollbar sat still and no chip offered a way down. A reader who has not scrolled
 * is at the live end, and the live end is the newest word.
 */
export function followTo(box: { readonly scrollHeight: number; readonly clientHeight: number }): number {
	return Math.max(0, box.scrollHeight - box.clientHeight);
}

function Transcript({
	afterLog,
	entries,
	queued,
	onUnqueue,
	live,
	spoke,
	elapsed,
	jump,
	onAnswer,
}: {
	afterLog?: ReactNode;
	entries: readonly AgentEntry[];
	/** what waits for this turn to end, drawn at the end of the log (#364) */
	queued: readonly AgentQueued[];
	onUnqueue: (id: string) => void;
	/** whether the turn is still writing, which is the word the chip picks for what is below */
	live: boolean;
	/**
	 * How many times the person has sent words while this rail stood. A count rather
	 * than anything read off the entries, because a turn's first user entry is keyed
	 * `user` every turn — the list cannot say "these words are new" across a turn
	 * boundary, and the send itself already can.
	 */
	spoke: number;
	elapsed: number;
	jump: FrameJump;
	onAnswer: (request: string, reply: AgentReply) => void;
}) {
	const view = useRef<HTMLDivElement>(null);
	const permissions = useContext(PermissionAction);
	const laidOut = useMemo(() => turnLayout(entries), [entries]);
	const [follow, setFollow] = useState(true);
	/**
	 * Whether the reader is somewhere the way-back chip has something to name, which is
	 * the one condition it draws on. It is state rather than a read off the box because
	 * the box moves without scrolling: a streaming entry grows under a still scrollbar,
	 * and the chip has to appear the moment the live end walks away from a reader who
	 * never touched anything.
	 */
	const [away, setAway] = useState(false);
	/**
	 * The last scroll this box performed on itself, held as the value rather than a
	 * spent-by-one-event flag. The flag was wrong twice over. Scroll events coalesce,
	 * so a wheel landing in the same frame as the log's own write arrived as one event
	 * the flag swallowed, reader and all — which is how the log kept fighting a person
	 * who had plainly scrolled. And Chrome's scroll anchoring moves the box on its own
	 * schedule, which a spent flag then misread as the reader leaving. Holding the
	 * number lets every event answer the question that matters: is the box where the
	 * log put it? Anything else is the browser or the reader, and only a gesture says which.
	 */
	const wrote = useRef<number | null>(null);
	/** the last send this log answered, so speaking re-enters follow exactly once */
	const heard = useRef(spoke);
	/** `follow`, readable from the size watcher without re-observing on every flip */
	const following = useRef(true);
	/** where the last touch was, because a touch names no direction until it moves */
	const touched = useRef<number | null>(null);

	/** where following would put the box right now */
	const aim = (box: HTMLElement) => followTo(box);
	/** the log scrolling itself, held in `wrote` so the event it causes reads as its own */
	const carry = (box: HTMLElement, to: number) => {
		if (Math.abs(box.scrollTop - to) < 1) return;
		wrote.current = to;
		box.scrollTop = to;
	};
	/**
	 * Whether a pointer is holding the box: pressed on it and not yet let go. A scrollbar
	 * drag is the one way to scroll a log that fires no wheel, touch or key, and it is the
	 * only scroll the log reads as the reader's without one of those. Cleared on the
	 * window rather than the box, because a drag lets go wherever the pointer is.
	 */
	const pressed = useRef(false);
	const pin = (box: HTMLElement) => carry(box, aim(box));
	/** whether the chip has anything to name: there is log below the reader */
	const adrift = (box: HTMLElement) => box.scrollTop < aim(box) - 1;
	/** the reader took the wheel: following ends now, before the scroll it causes lands */
	const leave = () => {
		setFollow(false);
		setAway(true);
	};

	/*
	 * The list and the clock, because both of them move the end: a new entry lengthens the
	 * log and a paced one grows where it stands. The clock used to be implied — the fold
	 * handed down a fresh list on every tick whether or not anything had happened in it —
	 * and now that an unchanged transcript is the same list, the growing has to be said.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: the entry list and the clock are what move the end
	useEffect(() => {
		following.current = follow;
		const box = view.current;
		if (box === null) return;
		const sent = spoke !== heard.current;
		heard.current = spoke;
		// the person speaking is the one act that re-enters follow on their behalf:
		// their words land at the live end, and they put them there
		if (follow || sent) {
			if (!follow) setFollow(true);
			if (sent && away) setAway(false);
			pin(box);
			return;
		}
		setAway(adrift(box));
	}, [entries, elapsed, follow, spoke, queued.length]);

	/*
	 * The pin above re-runs when the list changes; height changes on more than the
	 * list. A fence settles, an answered question folds its options, a message settles
	 * — the body resizes with nothing new in it, and until the next render either
	 * the pin or the chip is stale. Watching the body itself closes that gap: following
	 * re-pins, and a reader who is away learns the live end moved. Rows and paragraphs open
	 * over hundreds of milliseconds, so while one does this fires every frame and every pin
	 * is one write whose event the next frame reads as the log's own. (happy-dom lays
	 * nothing out, so tests fire the watcher by hand after setting the geometry.)
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: the watcher reads refs and the box, nothing rendered
	useEffect(() => {
		const box = view.current;
		const body = box?.firstElementChild;
		if (box === null || body === null || body === undefined) return;
		const watcher = new ResizeObserver(() => {
			if (following.current) pin(box);
			else setAway(adrift(box));
		});
		watcher.observe(body);
		const release = () => {
			pressed.current = false;
		};
		window.addEventListener("pointerup", release);
		window.addEventListener("pointercancel", release);
		window.addEventListener("blur", release);
		return () => {
			watcher.disconnect();
			window.removeEventListener("pointerup", release);
			window.removeEventListener("pointercancel", release);
			window.removeEventListener("blur", release);
		};
	}, []);

	return (
		<SeedSurface viewport={view}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the handlers only watch the reader leave; the log stays a scroll region, and its one control is the chip below */}
			<div
				ref={view}
				data-agent-log=""
				onScroll={(event) => {
					const box = event.currentTarget;
					const own = wrote.current;
					wrote.current = null;
					if (own !== null && Math.abs(box.scrollTop - own) < 1) return;
					// following, and the box moved by neither the log nor a hand on it: a picture
					// landing, a row folding, a focus pulled into view, the browser re-aiming under
					// growth (#149). None of it is the reader, so none of it ends following — the
					// log re-aims and the reader stays live. Following ends on a gesture only: a
					// wheel, a finger, a key, or a scrollbar under a held pointer.
					if (follow && !pressed.current) {
						pin(box);
						return;
					}
					const off = adrift(box);
					// a scrollbar drag that moved the box off the end: the reader
					if (follow && off) leave();
					// the reader arriving back at the end re-arms follow, and re-entering
					// there moves nothing
					else if (!follow && !off) setFollow(true);
					// last, so it overrides the optimistic `away` that leaving sets before it
					// can see where the scroll landed
					setAway(off);
				}}
				onPointerDown={() => {
					pressed.current = true;
				}}
				onWheel={(event) => {
					if (follow && event.deltaY < 0 && event.currentTarget.scrollTop > 0) leave();
				}}
				onTouchStart={(event) => {
					touched.current = event.touches[0]?.clientY ?? null;
				}}
				onTouchMove={(event) => {
					const from = touched.current;
					const at = event.touches[0]?.clientY;
					if (at === undefined) return;
					touched.current = at;
					if (!follow || from === null || at === from) return;
					// a finger pulling down drags earlier words back into view: scrolling up
					if (at > from && event.currentTarget.scrollTop > 0) leave();
				}}
				onKeyDown={(event) => {
					if (!follow || event.target !== event.currentTarget) return;
					const way = SCROLL_KEYS[event.key === " " && event.shiftKey ? "PageUp" : event.key];
					if (way === -1 && event.currentTarget.scrollTop > 0) leave();
				}}
				// scroll anchoring off: Chrome would otherwise re-aim the box on its own every
				// frame a row or a paragraph opens under it, and the two would fight over one
				// number the pin already owns
				className="pages-scrollbar flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3.5 pt-6 pb-4 [overflow-anchor:none]"
			>
				{/* `mt-auto` rather than `justify-end`: a flex container that end-justifies its
				    overflow puts the top of it out of reach of the scrollbar */}
				<div className="mt-auto shrink-0">
					{laidOut.map(({ entry, steps, asks }, index) => (
						<Arrive key={entry.key} gap={gapBefore(laidOut[index - 1]?.entry, entry)}>
							{entry.kind === "turn" ? (
								<TurnFoot
									foot={entry}
									elapsed={elapsed}
									reach={jump}
									asks={asks}
									onAnswer={onAnswer}
									permissions={permissions}
									steps={steps.map((step, at) => (
										<Arrive key={step.key} gap={gapBefore(steps[at - 1], step)}>
											<Entry entry={step} elapsed={elapsed} jump={jump} onAnswer={onAnswer} />
										</Arrive>
									))}
								/>
							) : (
								<Entry entry={entry} elapsed={elapsed} jump={jump} onAnswer={onAnswer} />
							)}
						</Arrive>
					))}
					{afterLog ? <div className="mt-5">{afterLog}</div> : null}
					<div className={cn(queued.length > 0 && "mt-5")}>
						<QueueTail queued={queued} onUnqueue={onUnqueue} />
					</div>
				</div>
			</div>
			<span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-bg to-transparent" />
			{/* the way back, drawn only while there is log below the reader. It names what
			    is below — live while the turn is writing, latest once it settles — and
			    pressing it returns to the end and follows from there. */}
			{follow || !away ? null : (
				<button
					type="button"
					data-agent-live=""
					onClick={() => {
						const box = view.current;
						if (box === null) return;
						setAway(false);
						setFollow(true);
						carry(box, aim(box));
					}}
					className="absolute bottom-3 left-1/2 flex h-6 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 text-muted transition-colors duration-150 hover:bg-surface hover:text-text type-detail"
				>
					<span aria-hidden="true">↓</span>
					{live ? "live" : "latest"}
				</button>
			)}
		</SeedSurface>
	);
}

/**
 * Consecutive rows read as one run, so they sit tighter than a turn boundary.
 *
 * A request out is row-shaped and packs the same way (#212): it is one line of the same
 * height in the same grammar, and spacing it like a turn boundary would say a break
 * happened where the agent only stopped to think.
 */
const TIGHT: ReadonlySet<AgentEntry["kind"]> = new Set(["row", "wait"]);

/**
 * The log as a turn draws it (#365): the person's words, then what the agent said and asked,
 * then the turn's foot, with the turn's rows and waits behind its status line rather than
 * in the log. A turn a picture kept from before there was a foot has none, so its rows stay
 * where they always were.
 */
export function turnLayout(
	entries: readonly AgentEntry[],
): { entry: AgentEntry; steps: AgentEntry[]; asks: AskEntry[] }[] {
	const out: { entry: AgentEntry; steps: AgentEntry[]; asks: AskEntry[] }[] = [];
	let start = 0;
	for (let at = 0; at <= entries.length; at += 1) {
		const entry = entries[at];
		if (entry !== undefined && entry.kind !== "user") continue;
		// one turn: from its first words to the next turn's, or the end of the log
		const turn = entries.slice(start, at);
		const foot = turn.findIndex((one) => one.kind === "turn");
		if (foot === -1) for (const one of turn) out.push({ entry: one, steps: [], asks: [] });
		else {
			const steps = turn.filter((one) => one.kind === "row" || one.kind === "wait");
			// an ask still waiting opens out of the turn's line or its grid, not out of the log (#366)
			const asks = turn.filter((one): one is AskEntry => one.kind === "ask" && waitingAsk(one));
			for (const one of turn) {
				if (one.kind === "row" || one.kind === "wait") continue;
				if (one.kind === "ask" && waitingAsk(one)) continue;
				out.push({ entry: one, steps: one.kind === "turn" ? steps : [], asks: one.kind === "turn" ? asks : [] });
			}
		}
		start = at;
	}
	return out;
}

function gapBefore(previous: AgentEntry | undefined, entry: AgentEntry): number {
	if (previous === undefined) return 0;
	if (TIGHT.has(previous.kind) && TIGHT.has(entry.kind)) return 6;
	return 14;
}

/**
 * What a row does in the frame it mounts: it opens (#149).
 *
 * A row used to take its height in the frame it mounted and the log snapped up by that
 * much; now a one-row grid opens its track from nothing to the row's own height over
 * 260ms while the row rises 6px into it, so the log above glides up because the thing
 * pushing it is growing rather than appearing. The gap before an entry rides inside the
 * clipped cell, so the gap opens with the row rather than landing ahead of it. Every
 * disclosure that grows a row — a picture landing under `look`, a plan opening — is the
 * same growth and takes the same wrapper.
 *
 * The cell clips for good rather than for the length of the animation, so the row's
 * hover, which reaches 6px past the content on either side, is given that much room to
 * reach into. Nothing here is measured and nothing re-renders per frame: the words are
 * laid out at their final size from the first frame and only the clip moves.
 */
function Arrive({ gap, children }: { gap: number; children: ReactNode }) {
	return (
		<div data-agent-arrive="" className="grid animate-agent-open">
			<div className="-mx-1.5 min-h-0 overflow-hidden px-1.5">
				<div className="animate-agent-entry" style={{ paddingTop: gap }}>
					{children}
				</div>
			</div>
		</div>
	);
}

interface EntryDrawn {
	entry: AgentEntry;
	elapsed: number;
	jump: FrameJump;
	onAnswer: (request: string, reply: AgentReply) => void;
}

/**
 * Whether this entry would draw itself the same way twice, which is what lets it sit out
 * a render.
 *
 * The clock is handed to every entry and read by two of them, so comparing it as an
 * ordinary prop would re-render the whole log on every step of the pace — which is the
 * cost this exists to remove. What each of the two reads is a function of the clock
 * rather than the clock itself, so the question is asked in the terms they draw in: how
 * much of a message is on screen, and what the digit under a request still out says. Both
 * settle, and once they have, the entry is finished with time.
 *
 * Exported because it is the whole rule and a rule this quiet has to be readable
 * on its own.
 */
export function sameEntry(before: EntryDrawn, after: EntryDrawn): boolean {
	if (before.entry !== after.entry || before.jump !== after.jump || before.onAnswer !== after.onAnswer) return false;
	if (before.elapsed === after.elapsed) return true;
	const entry = after.entry;
	// a receipt with a total on it is a record rather than a clock, and one that is not
	// running has nothing left to count
	if (entry.kind === "wait" && entry.ms === null && entry.state === "running") {
		return duration(before.elapsed - entry.at) === duration(after.elapsed - entry.at);
	}
	return true;
}

const Entry = memo(function Entry({ entry, elapsed, jump, onAnswer }: EntryDrawn) {
	if (entry.kind === "user") {
		/*
		 * The words, and under them what was sent with them (#116).
		 *
		 * The line is exactly what the chip strip said at rest when Enter was pressed —
		 * no more, because the strip is the promise that was made, and no less, because
		 * a turn nobody can audit is a turn nobody can trust. A picture is the one thing
		 * that line cannot audit, so its receipt is the picture itself, at the same
		 * thumbnail a tool call's own shot gets.
		 */
		return (
			<div className="relative flex flex-col gap-1.5 pl-3.5">
				<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
				<p className="whitespace-pre-wrap text-text type-body">{entry.text}</p>
				{/* the same 120px thumbnail a call's own picture gets, because it is the same
				    act of looking: a picture in the log, at a size that says what it is */}
				{entry.attached.map((image, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a sent message's references never reorder
					<Shot key={index} shot={image} of={null} quiet={true} />
				))}
				{entry.context === null ? null : (
					<span data-agent-context="" className="truncate text-muted type-detail">
						{entry.context}
					</span>
				)}
			</div>
		);
	}
	if (entry.kind === "note") {
		// a boundary reaches across the rail because what it says applies to everything
		// under it: above it happened, below it did not
		if (entry.rule !== false) {
			return (
				<div className="flex items-center gap-2.5 py-0.5">
					<span className="h-px flex-1 bg-border" />
					{/* min-w-0, because a label that refuses to shrink pushes the row past the
					    rail and the log must never scroll sideways */}
					<span className="min-w-0 truncate text-muted type-detail">{entry.text}</span>
					<span className="h-px flex-1 bg-border" />
				</div>
			);
		}
		// and a note that is only itself sits where it fell, in the quiet mono the
		// composer's own hints use: the remedy in the weight that says it is the thing to
		// do, and under it the sentence you need once (#201)
		return (
			<div data-agent-aside="" className="flex flex-col gap-0.5">
				{entry.said === undefined ? null : <p className="text-text type-detail">{entry.said}</p>}
				<p className="whitespace-pre-wrap text-muted type-detail">{entry.text}</p>
			</div>
		);
	}
	if (entry.kind === "row") return <Row entry={entry} jump={jump} />;
	if (entry.kind === "wait") return <Wait entry={entry} elapsed={elapsed} />;
	if (entry.kind === "ask") return <Ask entry={entry} onAnswer={onAnswer} />;
	// a foot draws through the log's own layout, which hands it its steps
	if (entry.kind === "turn") return null;
	return <Prose entry={entry} />;
}, sameEntry);

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

function Row({ entry, jump }: { entry: AgentRow; jump: FrameJump }) {
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
	const holds = entry.detail !== null || shot !== null;
	const open = holds && (clicked ?? shot !== null);

	/*
	 * The name is a place, a place that is not there yet, or a place that was. Only the
	 * last of the three is struck: a frame this turn is one beat from writing is absent
	 * in exactly the same way, and it is one beat from existing, so it reads as an
	 * ordinary word and does nothing.
	 */
	const frame = entry.frame === null ? null : frameHolding(entry.frame, jump.have, jump.gone);
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
	// a row can leave while the cursor is on its name — a turn restored from disk redraws
	// the log it was in — and a ring nothing is pointing at would stay lit
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
					"min-w-0 truncate type-value",
					// struck through and dimmed, in the words the canvas already uses for a name
					// nothing answers to
					gone ? "text-muted line-through" : "text-text",
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
				<span className="shrink-0 text-muted type-value">{entry.verb}</span>
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
					<span className={cn("shrink-0 tabular-nums type-detail", gone ? "text-muted" : "text-text")}>
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
			<div data-agent-row={said} className="flex flex-col">
				<div className={row}>{line}</div>
				<Step text={entry.step} />
			</div>
		);
	return (
		<div data-agent-row={said} className="flex flex-col">
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
			<Step text={entry.step} />
			{open ? (
				// a disclosure landing is the same growth as a row landing, so it opens the same
				// way and the log above it moves for the same reason
				<Arrive gap={0}>
					<div className="flex flex-col pt-0.5 pb-1" style={{ paddingLeft: INDENT }}>
						{/* the picture takes the payload's place rather than sitting under a line of
						    file metadata: `image/png` is a fact about a file and the row above already
						    said `look`. The caption is dropped where the line already carries it, since
						    every shot in the captures is of the frame its own row names. */}
						{shot === null ? null : (
							<Shot shot={shot} of={entry.frame ?? entry.detail} quiet={entry.frame === entry.subject} />
						)}
						{entry.slices?.map((slice) => (
							<Shot key={slice.id} shot={slice} of={entry.frame ?? entry.detail} quiet />
						))}
						{shot === null && entry.detail !== null ? (
							// a group of reads keeps one path or command a line (#365)
							<span data-agent-detail="" className="block text-muted type-detail">
								{entry.detail.split("\n").map((line, at) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: the same path read twice is two lines
									<span key={at} className="block truncate">
										{line}
									</span>
								))}
							</span>
						) : null}
					</div>
				</Arrive>
			) : null}
		</div>
	);
}

/* ---------- what a delegate is doing now ----------
 * A sub-agent is one row and one line under it (#194): the step it is on, replaced as it
 * moves. Not its calls — a delegate that reads eleven files is eleven rows of somebody
 * else's homework, and five of them at once is the turn you launched buried under the
 * work you delegated precisely so you would not have to watch it. What the delegate
 * produced is on the canvas, which is where a delegate's work has always been (#143).
 *
 * So the line is a status and it is drawn as one: always there while the task is running,
 * behind no disclosure, in the quiet mono every other payload uses — and gone the moment
 * the task lands, leaving one settled line.
 *
 * It changes under the reader every few seconds, which is the whole reason for the two
 * animations. The words crossfade, because a hard cut on a line nobody is looking at
 * directly reads as a flicker in the corner of the eye. The box itself opens and closes
 * on `grid-template-rows`, so the rows below it are moved rather than jumped: a fan-out
 * has five of these landing and going at their own pace, and five jumps in a log
 * somebody is reading is the log fighting them. */

function Step({ text }: { text: string | null }) {
	/** the words on screen, which are the ones handed in until they are not */
	const [shown, setShown] = useState(text);
	/** and the ones on their way out, held so the change is a crossfade and not a cut */
	const [leaving, setLeaving] = useState<string | null>(null);
	// adjusted in render rather than in an effect, because an effect paints the new words
	// once with the old ones already gone, which is the flicker this exists to avoid
	if (shown !== text) {
		setLeaving(shown);
		setShown(text);
	}

	/*
	 * The step is over, and the line has to keep saying it while it closes: a track sized
	 * off a box with nothing in it collapses in one frame, so what fades out is the last
	 * words in the flow rather than an empty box with a ghost floating over it.
	 */
	const ending = shown === null;
	const held = shown ?? leaving;
	if (held === null) return null;
	// the padding is on the words rather than on the box they sit in, because the ones
	// leaving are laid over the ones arriving and two boxes only line up if they are made
	// the same way
	const words = "block truncate pt-0.5 pb-1 text-muted type-detail";
	return (
		<div
			className="grid animate-agent-step transition-[grid-template-rows] duration-[170ms] ease-out motion-reduce:transition-none"
			style={{ gridTemplateRows: ending ? "0fr" : "1fr" }}
		>
			<div className="relative min-h-0 overflow-hidden" style={{ paddingLeft: INDENT }}>
				<span
					// keyed on the words, so a step that changes mounts a new one to fade in and a
					// step that is ending keeps the one it had and fades that
					key={held}
					// the hook is on words that are still true: a step that has ended is on screen
					// only for as long as it takes to go, and nothing should be able to read it
					data-agent-step={ending ? undefined : ""}
					onAnimationEnd={ending ? () => setLeaving(null) : undefined}
					className={cn(words, ending ? "animate-agent-leave" : "animate-agent-word")}
				>
					{held}
				</span>
				{/* the words being replaced, over the top of the ones replacing them */}
				{ending || leaving === null ? null : (
					<span
						key={`left:${leaving}`}
						aria-hidden="true"
						onAnimationEnd={() => setLeaving(null)}
						className={cn(words, "animate-agent-leave absolute inset-x-0 top-0")}
						style={{ paddingLeft: INDENT }}
					>
						{leaving}
					</span>
				)}
			</div>
		</div>
	);
}

/* ---------- a request out, one line ----------
 * The receipt for the silence before the log has anything to show (#212, #231), in the
 * row's own grammar because the log already has one for a thing that took time: a mark,
 * a verb and a number. It is drawn a shade quieter than a tool row throughout —
 * `thinking` is something the machine did rather than something it did to the project,
 * and a transcript in which every third line is this at full strength reads as busier
 * than the turn was.
 *
 * The number is a duration and never a thought. The wire carries no thinking text at
 * all, so there is nothing else it could honestly be, and the projection's own comment
 * on the entry is where that is argued. What it does now cover is the thinking itself:
 * the projection settles it on the first drawn thing rather than the first token, so a
 * reasoning turn reads `thinking 31.2s` where it used to read `thinking 0.0s` and then
 * hold still for the other 31 seconds.
 *
 * It counts while the request is out and stops where the answer starts. The count is
 * free: this rail already re-renders on the pace's own tick, so nothing is scheduled
 * for it and a settled receipt costs one render and then nothing.
 *
 * Under reduced motion the clock is handed in as infinite — that is how an arriving
 * message is drawn whole — so a live receipt has no number to show and draws the mark
 * and the word alone until it settles. That is the right way round rather than a
 * shortfall: a digit changing sixty times a second is motion, and the reader who asked
 * for none gets the duration once, when it is final. */

function Wait({ entry, elapsed }: { entry: Extract<AgentEntry, { kind: "wait" }>; elapsed: number }) {
	// only a request that is genuinely still out counts, and only its own turn's clock can
	// count it: a receipt restored with no total on it reads as the request it was and
	// says no number, rather than climbing from a zero belonging to some other turn
	const took = entry.ms !== null ? duration(entry.ms) : entry.state === "running" ? duration(elapsed - entry.at) : "";
	return (
		<div data-agent-wait={entry.state} className="-mx-1.5 flex h-[26px] w-fit items-center gap-2.5 rounded-sm px-1.5">
			<StateMark state={entry.state} />
			<span className="shrink-0 text-muted type-value">thinking</span>
			{took === "" ? null : (
				// `tabular-nums` so a tenth ticking over changes no width, which is what keeps
				// the one moving thing in the log from moving anything else
				<span className="shrink-0 text-muted tabular-nums type-value">{took}</span>
			)}
		</div>
	);
}

/* ---------- the turn waiting on you ----------
 * The first state in this rail that waits on the person rather than being watched by
 * them, and the only geometry that exists while nobody has answered.
 *
 * The question itself was never the variable. It is a sentence the agent wrote, so it
 * goes where the agent's sentences go; the answer is a sentence the person chose, so
 * it lands in the shape the rail already gives the person's words. Agent, then human,
 * which is what a thread is — so an answered question adds nothing permanent to the
 * rail's vocabulary and the option list is gone the moment somebody has answered.
 *
 * The options are a block in the log and not chips beside the composer, and what
 * settled that was the descriptions: 150 to 250 characters of what each choice costs,
 * comparable side by side and unreadable in a chip. The composer stays live beside
 * them, because prose is a first-class answer the tool tests before the picked ones
 * and rewards with the stronger instruction to follow what the person actually said.
 *
 * A call carries one to four questions and they are asked one at a time, the way the
 * binary's own prompt asks them. A pick settles its question into the shape the rail
 * gives the person's words and reveals the next; the last pick sends the whole set,
 * because a call with two questions is two decisions and answering with one of them
 * would tell the agent the other was declined by somebody who never saw it.
 *
 * An approval is the same block with different words in it. It leads with the agent's
 * own written description of what it is about to do — the row above already says what
 * the call is — and its three answers are spool's own, in the mono register spool uses
 * for its own words. All three are bordered, because for an approval every one of them
 * is an answer. A question's dismiss is not: it refuses the whole question rather than
 * answering it, so it stays one quiet wordless word underneath. */

/**
 * An ask in the log (#366): folded to one quiet line once nobody is waiting on it, and a
 * card while it waits where the turn has no line to open it out of yet. A waiting ask in a
 * turn that has one is drawn by the turn's foot instead (`turnLayout`).
 */
function Ask({
	entry,
	onAnswer,
}: {
	entry: Extract<AgentEntry, { kind: "ask" }>;
	onAnswer: (request: string, reply: AgentReply) => void;
}) {
	const permissions = useContext(PermissionAction);
	const ask = useAsk(entry, onAnswer);
	if (waitingAsk(entry)) return <AskCard entry={entry} ask={ask} permissions={permissions} />;
	return (
		<div data-agent-ask={entry.state} data-agent-ask-look="folded">
			<FoldedAsk entry={entry} words={entry.said ? <Answered words={entry.words} /> : undefined} />
		</div>
	);
}

/**
 * The answer, in the shape the rail already draws the person's words in.
 *
 * A sentence the person typed rather than a pick: the person's own accent rail is the
 * answer that needed no new word at all.
 */
function Answered({ words }: { words: string | null }) {
	return (
		<div className="relative flex flex-col gap-1.5 pl-3.5">
			<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
			<p className="whitespace-pre-wrap text-text type-body">{words}</p>
		</div>
	);
}

/**
 * One block of the agent's prose, a paragraph at a time (#149).
 *
 * What is drawn is what the wire has delivered whole: `full` is every character that has
 * arrived, and a paragraph of it reaches the screen once the text after it has begun, or
 * once the block has settled — the assistant message confirmed it, or the turn ended and
 * nothing more is coming. Nothing here reads the clock: the paragraphs release themselves
 * on their own timer, and the open is CSS, so the log re-renders when the wire moves and
 * not per frame.
 */
function Prose({ entry }: { entry: Extract<AgentEntry, { kind: "prose" }> }) {
	const still = useStillness();
	return <SeedParagraphs text={entry.full} finished={entry.settled} still={still} />;
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
				<Spinner turning={turning} className={cn(turning ? "text-text/60" : "text-text/35", "h-full w-full")} />
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

/* ---------- the queue, at the end of the log (#170, #364) ----------
 * A message sent while the turn runs waits at the end of the log, shaped as the ask it
 * will become and faint, on a dashed hairline, because it has not gone out yet. Firing is
 * the send it already is: the dashed message becomes the ask in the same place. Take back
 * puts it back in the box, into the draft that is there — the take-back invariant: words
 * that leave the queue un-fired land in the composer and nowhere else.
 *
 * Each message comes and goes on a fade; a queue that fires together leaves together. */

function QueueTail({ queued, onUnqueue }: { queued: readonly AgentQueued[]; onUnqueue: (id: string) => void }) {
	const held = useRef(new Map<string, AgentQueued>());
	const [, redraw] = useState(0);
	const live = new Set(queued.map((one) => one.id));
	for (const one of queued) held.current.set(one.id, one);
	const drawn = [...held.current.values()];
	return (
		<div data-agent-queue="" className={cn("flex flex-col gap-3", drawn.length === 0 && "hidden")}>
			{drawn.map((message) => (
				<QueuedAsk
					key={message.id}
					message={message}
					open={live.has(message.id)}
					onGone={() => {
						held.current.delete(message.id);
						redraw((count) => count + 1);
					}}
					onTakeBack={() => onUnqueue(message.id)}
				/>
			))}
		</div>
	);
}

function QueuedAsk({
	message,
	open,
	onGone,
	onTakeBack,
}: {
	message: AgentQueued;
	open: boolean;
	onGone: () => void;
	onTakeBack: () => void;
}) {
	const shown = useLeaving(open, FADE_OUT_MS);
	// biome-ignore lint/correctness/useExhaustiveDependencies: told once, when the exit has finished
	useEffect(() => {
		if (shown === null) onGone();
	}, [shown]);
	if (shown === null) return null;
	const leaving = shown === "leaving";
	return (
		<div
			data-agent-queued={leaving ? undefined : ""}
			inert={leaving}
			aria-hidden={leaving || undefined}
			className={cn(
				"relative flex flex-col items-start gap-0.5 pl-3.5",
				leaving ? "animate-agent-fade-out" : "animate-agent-fade-in",
			)}
		>
			{/* the ask's own anatomy, its rail dashed and its words faint: it becomes that ask
			    in the same place when it goes out, rather than jumping to it */}
			<span className="absolute top-[3px] bottom-[31px] left-0 w-0 border-border-raised border-l-2 border-dashed" />
			<p className="whitespace-pre-wrap text-muted type-body">{message.text}</p>
			<button
				type="button"
				onClick={onTakeBack}
				aria-label={`take back ${message.text}`}
				className="-ml-1.5 h-7 rounded-sm px-1.5 text-muted transition-colors duration-150 hover:bg-surface hover:text-text type-control"
			>
				Take back
			</button>
		</div>
	);
}
