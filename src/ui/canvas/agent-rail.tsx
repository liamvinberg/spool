import { createContext, memo, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ATTACHMENT_MEDIA, type Attachment, isSendableAttachment } from "../../attachment";
import type { AgentReply } from "../../daemon/agent-control";
import type { AgentEngineId } from "../../daemon/agent-engine";
import type { AgentLimit } from "../../daemon/agent-events";
import type { SelectionEntry } from "../api";
import { cn } from "../cn";
import { CloseIcon, PlusIcon } from "../icons";
import { type Chip as ChipWords, composerWidth, contextOf, type Strip, stripOf, WHOLE_SELECTION } from "./agent-chips";
import { Chevron, Float } from "./agent-float";
import { AgentMenu, engineName } from "./agent-menu";
import type { AgentModelDeck } from "./agent-model";
import { FADE_OUT_MS, useHeld, useLeaving } from "./agent-motion";
import { frameHolding } from "./agent-nouns";
import { MODE_NAMES, type PermissionDeck, PermissionMenu } from "./agent-permissions";
import type { InstallDeck, LoginDeck } from "./agent-preflight";
import { type AgentHandback, type AgentQueued, handedBack, handedBackReferences } from "./agent-queue";
import { Caret } from "./agent-said";
import { SeedParagraphs, SeedSurface } from "./agent-seed";
import { Lightbox, Shot } from "./agent-shot";
import type { TurnPhase } from "./agent-stream";
import { type Life, type Thread, UNSAID } from "./agent-threads";
import {
	type AgentEntry,
	type AgentPlan,
	type AgentRow,
	type AgentSent,
	duration,
	type RowState,
} from "./agent-transcript";
import { ageOf } from "./frame-find";
import { PaneActions, PaneTitle } from "./pane-window";
import { ChevronIcon } from "./sidebar";
import { useStillness } from "./stillness";

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

/**
 * What the hands are pointing at, and what the strip may do about it (#116, #139).
 *
 * The entries are the daemon's own enriched list rather than the canvas's raw
 * selection, because the strip is the promise of what the prompt will carry: what
 * is drawn here and what goes out are one list read twice.
 */
export interface Pointing {
	readonly entries: readonly SelectionEntry[];
	/**
	 * The list is the frame the hands stepped into rather than one they picked.
	 *
	 * It draws as an ordinary chip at full strength with the dismiss control taken
	 * off: entering is the most specific act the canvas has, and out there the only
	 * way to stop pointing at the frame you are inside is a mode change.
	 */
	readonly inside: boolean;
	/** the entry the pointer is over, in the rail or out on the canvas */
	readonly lit: string | null;
	readonly onLight: (id: string | null) => void;
	/** null drops the whole selection, which is the count chip's own ✕ */
	readonly onDrop: (id: string | null) => void;
}

/**
 * The conversations this project has, and what the column may do about them (#136, #205).
 *
 * One bundle rather than six props for the reason `Pointing` and `FrameJump` are: they
 * arrive together, they change together, and the deck upstream already holds them as one
 * object. The column and the nameplate both take the whole of it, because which thread is
 * open is a fact about the deck rather than a string either of them could be handed.
 */
export interface Threads {
	readonly list: readonly Thread[];
	readonly open: string;
	/**
	 * The open thread has a picture and no session left to continue it (#120).
	 *
	 * It reads as finished: nothing offers a resume that would fail, and the composer says
	 * what the next thing said will actually do, which is start a new thread.
	 */
	readonly finished: boolean;
	/** a press on a cell, which reads the thread and moves nothing else */
	readonly onOpen: (id: string) => void;
	/** the ✕ in the flyout: it leaves the column, and neither the session nor the picture goes */
	readonly onClose: (id: string) => void;
	/** the plus that leads the column */
	readonly onNew: (engine?: AgentEngineId) => void;
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

const PermissionAction = createContext<(() => void) | undefined>(undefined);

export function AgentRail({
	active = true,
	agentReady = true,
	legacy = false,
	width,
	permissions,
	entries,
	plan,
	phase,
	elapsed,
	jump,
	pointing,
	threads,
	install,
	login,
	queued,
	handback,
	request,
	draft,
	onDraft,
	attached,
	onAttach,
	running,
	model,
	limit,
	context = null,
	preferred,
	onSend,
	onQueue,
	onUnqueue,
	onStop,
	onAnswer,
}: {
	/** the pane's settled width (`pane-window.tsx`), which the composer measures its chip strip against */
	width: number;
	permissions?: PermissionDeck | undefined;
	entries: readonly AgentEntry[];
	/** the plan, off the log and onto the shelf; absent until the turn writes one */
	plan: AgentPlan | null;
	phase: TurnPhase;
	elapsed: number;
	jump: FrameJump;
	pointing: Pointing;
	/** every conversation this project has, newest first (#136, #200) */
	threads: Threads;
	/** whether there is an agent on this machine at all, and the look that says so (#201) */
	install: InstallDeck;
	/** the agent would not start because nobody is signed in, and the way out (#201) */
	login: LoginDeck;
	/** what spool is holding until this turn ends, in the order it will fire (#170) */
	queued: readonly AgentQueued[];
	/** whatever left the queue un-fired, for the box below to take back (#170) */
	handback: AgentHandback;
	request?: AgentRequest | undefined;
	active?: boolean;
	/** the machine's agent choice has loaded: until then no engine, model or mode is drawn (#361) */
	agentReady?: boolean;
	/** the open thread was the removed bundled engine's, which nothing continues (#363) */
	legacy?: boolean;
	/** what this thread was left holding and nobody sent, off its own picture (#234) */
	draft: string;
	attached: readonly Attachment[];
	onAttach: (images: readonly Attachment[], thread?: string) => Promise<void>;
	/** the box saying what it holds now, which is how a draft outlives the tab (#234) */
	onDraft: (text: string, thread?: string) => void;
	/**
	 * Whether a turn is in flight right now, asked rather than rendered (#234).
	 *
	 * Enter means one of three things and the turn is what decides between two of them, so
	 * the press asks the turn at the instant of the press: the window between a stream
	 * closing and the rail drawing that is exactly where a message was taken for a turn
	 * that had already ended.
	 */
	running: () => boolean;
	/** which machine is answering, and the list the binary offered instead (#118, #199) */
	model: AgentModelDeck;
	/** the usage window, absent until the binary warns, which is most of a session (#122) */
	limit: AgentLimit | null;
	/** how full the open thread's window was after its last request, as a share (#364) */
	context?: number | null;
	/** the machine's usual agent: what a chat's row and the model trigger leave unsaid (#364) */
	preferred?: AgentEngineId | null | undefined;
	/** it says whether the words were taken, and the box only empties on a yes (#234) */
	onSend: (text: string, sent: AgentSent) => boolean;
	/** Enter against a running turn: the words are taken and held rather than sent */
	onQueue: (text: string, sent: AgentSent) => boolean;
	onUnqueue: (id: string) => void;
	/** the Stop button in the footer */
	onStop: () => void;
	/** what the person said to a waiting request, on its own way back up (#145) */
	onAnswer: (request: string, reply: AgentReply) => void;
}) {
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
	const [modelRequest, requestModel] = useState(0);
	const waited = outstanding === undefined ? 0 : Math.max(0, elapsed - outstanding.at);
	return (
		<RecoveryActions value={{ login, modelRequest, preferred }}>
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
							<PaneTitle>
								<span className="px-1.5 font-semibold text-text type-control">Agent</span>
							</PaneTitle>
							<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
								<InstallWall install={install} />
							</div>
							<DeadComposer />
						</div>
					) : (
						/*
						 * The rail is one panel, and the plate over it is where the other conversations
						 * live (#205). The panel is everything one conversation is; the list the plate
						 * drops is every conversation there is, and a press on it changes only the panel.
						 */
						<div className="flex h-full min-w-[200px] flex-col">
							{/* the plate leads the shelf, because it says which thread everything under it
					    belongs to, and it is where the others are reached from */}
							<ThreadPlate
								threads={threads}
								listing={listing}
								onList={(at) => {
									setFooterMenu(null);
									setListing(at);
								}}
							/>
							{/* the list drops over the shelf and the log together, so it hangs off the plate
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
												This chat ran on spool’s built-in agent, which is gone. It can’t be continued; what
												you send starts a new chat.
											</p>
										) : model.engine === undefined ||
											!(install.missing || login.out || login.recovery) ? null : (
											<RecoveryView
												onNew={threads.onNew}
												install={install}
												login={login}
												model={model}
												onModels={() => {
													setFooterMenu("models");
													requestModel((value) => value + 1);
												}}
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
								ready={agentReady}
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
								onSwitch={(engine, fresh) => {
									if (fresh) threads.onNew();
									model.onEngine?.(engine);
								}}
								onNewChat={() => {
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
		</RecoveryActions>
	);
}

/* ---------- the threads, on the plate over the log (#136, #161, #200, #205, #364) ----------
 * One panel, and every other conversation reached from its title. The header holds the
 * chat's title, which opens the switcher, and the + that starts a new chat, and nothing
 * else: what is moving in another chat is the dock glyph's one small dot, and who answers
 * is the composer's. The list drops from the title over the log, one step up on a
 * hairline and a soft shadow, and leaves the way it came.
 *
 * No collapse caret: the rail icon that lit the pane is the thing that shuts it.
 *
 * Nothing is coloured and nothing re-sorts. State in this rail is motion, and the order is
 * recency fixed once, so a row never moves out from under a cursor already reaching for it.
 */

/**
 * The header: which chat this is, as the switcher's trigger, and the +.
 *
 * `listing` is the clock read when the list was opened, or null while it is shut: the
 * moment the list opened is the moment the ages in it are about.
 */
function ThreadPlate({
	threads,
	listing,
	onList,
}: {
	threads: Threads;
	listing: number | null;
	onList: (at: number | null) => void;
}) {
	const { list, open, onNew } = threads;
	const name = list.find((thread) => thread.id === open)?.name ?? UNSAID;
	const listed = listing !== null;
	const plate = useRef<HTMLButtonElement>(null);
	return (
		<>
			{/* the header the pane already has: the title in place of the pane's name, and the + */}
			<PaneTitle>
				<button
					ref={plate}
					type="button"
					data-agent-plate-ask=""
					aria-haspopup="dialog"
					aria-expanded={listed}
					title="Switch chat"
					onClick={() => onList(listed ? null : Date.now())}
					className="flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-text transition-colors duration-150 hover:bg-surface aria-expanded:bg-surface"
				>
					<span className="min-w-0 truncate font-semibold type-control">
						{name === UNSAID ? "New chat" : name}
					</span>
					<Chevron open={listed} className="text-muted" />
				</button>
			</PaneTitle>
			<PaneActions>
				<button
					type="button"
					aria-label="New chat"
					onClick={() => {
						onList(null);
						onNew();
						plate.current?.closest("[data-pane]")?.querySelector("textarea")?.focus({ preventScroll: true });
					}}
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
				>
					<PlusIcon />
				</button>
			</PaneActions>
		</>
	);
}

/**
 * The list, dropped from the title over the log for as long as it is asked for.
 *
 * One row per chat: its title, the agent it runs on only where that is not the usual one,
 * and its age, quiet, with a turning ring or a dot before the age while it runs or waits
 * unread. The open row holds the lightest wash. A close appears on hover.
 *
 * It goes the way a menu goes: a press on a row, on the title, or anywhere else, and
 * escape, taken on the way down before the composer or the canvas can read it as theirs.
 */
function ThreadDrop({
	threads,
	preferred,
	now,
	onDone,
}: {
	threads: Threads;
	preferred: AgentEngineId | null | undefined;
	now: number | null;
	onDone: () => void;
}) {
	const { list, open, onOpen, onClose } = threads;
	const shown = now !== null;
	const at = useHeld(now) ?? Date.now();
	useEffect(() => {
		if (!shown) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			onDone();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [shown, onDone]);
	return (
		<>
			{shown ? (
				<button
					type="button"
					aria-label="close the threads"
					className="fixed inset-0 z-10 cursor-default"
					onClick={onDone}
				/>
			) : null}
			<Float open={shown} from="down" className="absolute inset-x-2 -top-1 z-20 max-h-[60%] overflow-y-auto p-1">
				<div role="dialog" aria-label="Chats" data-agent-threads="" className="flex flex-col">
					{list.map((thread) => (
						<ThreadRow
							key={thread.id}
							thread={thread}
							on={thread.id === open}
							named={thread.engine !== undefined && preferred != null && thread.engine !== preferred}
							now={at}
							onPick={() => {
								onOpen(thread.id);
								onDone();
							}}
							onClose={() => onClose(thread.id)}
						/>
					))}
				</div>
			</Float>
		</>
	);
}

function ThreadRow({
	thread,
	on,
	named,
	now,
	onPick,
	onClose,
}: {
	thread: Thread;
	on: boolean;
	/** it runs on another agent than the usual one, so the row says which */
	named: boolean;
	now: number;
	onPick: () => void;
	onClose: () => void;
}) {
	const marked = thread.life !== "read";
	return (
		<div className="group agent-thread-row relative flex">
			<button
				type="button"
				data-agent-thread={thread.name}
				data-agent-thread-life={thread.life}
				aria-current={on ? "true" : undefined}
				onClick={onPick}
				className={cn(
					"relative flex h-9 min-w-0 flex-1 items-center gap-3 rounded-sm pr-2 pl-2.5 text-left transition-colors duration-150",
					on ? "bg-raised" : "hover:bg-raised/60",
				)}
			>
				<span className="agent-thread-ask min-w-0 flex-1 truncate text-text type-control">
					{thread.name === UNSAID ? "New chat" : thread.name}
					{named ? (
						<span data-agent-thread-engine={thread.engine} className="pl-2 text-muted type-label">
							{engineName(thread.engine)}
						</span>
					) : null}
				</span>
				<span className="flex shrink-0 items-center gap-1.5 transition-opacity duration-[180ms] group-focus-within:opacity-0 group-hover:opacity-0">
					{marked ? <ThreadMark life={thread.life} /> : null}
					<span className="text-muted type-label tabular-nums">{ageOf(thread.at, now)}</span>
				</span>
			</button>
			{/* a close is a tidy rather than a delete: neither the agent's own session nor
			    spool's stored picture goes with the row */}
			<span className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 transition-opacity duration-[180ms] group-focus-within:opacity-100 group-hover:opacity-100">
				<button
					type="button"
					data-agent-thread-close={thread.name}
					aria-label={`close ${thread.name}`}
					onClick={onClose}
					className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:text-text"
				>
					<CloseIcon />
				</button>
			</span>
		</div>
	);
}

/**
 * What a thread is doing, in the smallest thing that can say it (#161).
 *
 * The box is always 14px whatever is inside it, so every row in the list draws its mark
 * in the same place and the plate's marks stand in one line.
 *
 * Four drawings of five lives. Streaming and running turn the same ring, colourless,
 * because state in this rail is motion and the one accent belongs to the selection.
 * Waiting is `unread`'s disc held inside `running`'s ring — the turn that stopped, with
 * the thing that stopped it sitting in it — and it is the loudest of the three on
 * purpose, because it is the only one of them that is actually stuck. Unread is a solid
 * dot at text strength, the way a mailbox says it. Read is a hollow one, at the strength
 * a disabled thing gets rather than nothing at all, so a row for an old thread still
 * reads as pressable.
 *
 * Two candidates for waiting died on facts rather than taste. Freezing the spinner is
 * pixel-identical to what `prefers-reduced-motion` already renders for a working thread,
 * so it would be working's drawing with a second meaning for every reduced-motion reader.
 * Borrowing the disc alone breaks on the clearing rule: a disc clears when you open the
 * thread and a question does not, so a mark that spent it here would go quiet about a
 * thread that will never finish.
 */
function ThreadMark({ life, className }: { life: Life; className?: string }) {
	// the thread you are watching turns the same ring as the ones you are not: the two
	// lives are one drawing, and they are separate lives only because `streaming` is a
	// fact about this browser and never reaches disk
	const turning = life === "streaming" || life === "running";
	return (
		<span data-agent-mark={life} className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
			{turning ? (
				<svg
					viewBox="0 0 14 14"
					className="h-3.5 w-3.5 animate-agent-spin text-text/60"
					fill="none"
					aria-hidden="true"
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				</svg>
			) : life === "waiting" ? (
				// the same ring working turns, at rest and dimmed so the disc reads as the thing
				// in it rather than as a second object beside it
				<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 text-text/85" fill="none" aria-hidden="true">
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
					<circle cx="7" cy="7" r="2.2" fill="currentColor" />
				</svg>
			) : life === "unread" ? (
				<span className="h-[5px] w-[5px] rounded-full bg-text/85" />
			) : life === "read" ? (
				<span className="h-[5px] w-[5px] rounded-full border border-muted/45" />
			) : null}
		</span>
	);
}

/* ---------- the agent that is not there (#127, #201) ----------
 * Two surfaces, and they are different shapes because the two states are known in
 * different ways. A missing binary is a fact about this machine, true before anyone
 * types, so it takes the transcript's place. A bad login is a fact inside another
 * product, so it is a standing strip over a log that still works.
 *
 * Neither is coloured. There is one accent in this product and it means a chip in the
 * composer and a box out on the canvas are the same object; spending it on a state that
 * is not even a failure — you have not installed something yet — would break the only
 * thing it says. Both step forward in brightness, which is the whole of the emphasis the
 * rest of the rail uses. */

/**
 * One install line per agent spool runs (#363), in the fallback's own order. Codex is listed
 * before spool runs it, because the wall is about what you can install, and the line is the
 * vendor's own npm package either way.
 */
export const INSTALL_LINES = [
	{ id: "claude", name: "Claude Code", line: "npm i -g @anthropic-ai/claude-code" },
	{ id: "codex", name: "Codex", line: "npm i -g @openai/codex" },
	{ id: "pi", name: "pi", line: "npm i -g @earendil-works/pi-coding-agent" },
] as const;

/** a line to paste, with the one control that puts it on the clipboard */
function InstallLine({ name, line }: { name: string; line: string }) {
	const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
	return (
		<div data-agent-install={name} className="flex flex-col gap-1">
			<span className="text-muted type-caption">{name}</span>
			<div className="flex items-center gap-2 rounded-sm border border-border/70 bg-surface/40 py-1 pr-1 pl-2">
				<code className="min-w-0 flex-1 select-all truncate font-mono text-2xs text-text leading-4">{line}</code>
				<button
					type="button"
					aria-label={`Copy the ${name} install line`}
					onClick={() => {
						void navigator.clipboard.writeText(line).then(
							() => setCopied("copied"),
							() => setCopied("failed"),
						);
					}}
					className="flex h-6 shrink-0 items-center rounded-sm px-1.5 text-muted transition-colors duration-150 hover:bg-surface hover:text-text type-detail"
				>
					{copied === "copied" ? "copied" : "copy"}
				</button>
			</div>
			{copied === "failed" ? (
				<span role="alert" className="text-muted type-caption">
					Could not copy. Select the line and copy it.
				</span>
			) : null}
		</div>
	);
}

/**
 * Ask again: one control, in the rail's own weight, for both of these states.
 *
 * Mono, small, and no border until you are on it. The rail has exactly one filled control
 * anywhere — the composer — and neither of these states is the place to introduce a second.
 * It says what it is doing rather than what it is for while a check is out, because that
 * is the only thing on screen saying the press landed.
 */
function Quiet({ busy, onClick }: { busy: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			data-agent-check=""
			onClick={onClick}
			className="-mr-1.5 flex h-6 shrink-0 items-center gap-2 rounded-sm px-1.5 text-text transition-colors duration-150 hover:bg-surface hover:text-text type-detail"
		>
			{busy ? (
				<svg
					viewBox="0 0 14 14"
					className="h-3 w-3 shrink-0 animate-agent-spin text-muted/60"
					fill="none"
					aria-hidden="true"
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				</svg>
			) : null}
			{busy ? "looking" : "check again"}
		</button>
	);
}

/**
 * Nothing to spawn, from any agent spool runs (#201, #363).
 *
 * The composer stays, and it is dead. Removing it would leave the rail as a sentence with
 * no evidence of what the rail is for; leaving it live would collect a prompt for nobody.
 *
 * Spool ships no agent of its own, so the wall is the way to one: a line per agent to paste
 * into a terminal, and a check. The check also happens on its own when the window comes back
 * into focus, which is when the person has most likely just run one of the lines.
 */
function InstallWall({ install }: { install: InstallDeck }) {
	return (
		<div data-agent-wall="" className="flex min-h-0 flex-1 flex-col justify-center px-3.5">
			<div className="animate-agent-entry flex flex-col gap-3">
				<p className="text-text type-body">No agent is installed</p>
				<p className="text-muted type-body">
					Spool works with the agent you already use. Install one in a terminal, then check again.
				</p>
				<div className="flex flex-col gap-2.5 pt-1">
					{INSTALL_LINES.map((agent) => (
						<InstallLine key={agent.id} name={agent.name} line={agent.line} />
					))}
				</div>
				<div className="flex items-center justify-between pt-1">
					{/* the check is allowed to fail forever, and a press that leaves no mark reads
					    as a broken button — so it leaves one line, in the composer's own mono */}
					{install.foundNothing ? (
						<span data-agent-looked="" className="animate-agent-entry text-muted type-detail">
							still nothing on your PATH
						</span>
					) : (
						<span />
					)}
					<Quiet busy={install.checking} onClick={install.look} />
				</div>
			</div>
		</div>
	);
}

/** the composer at rest and switched off, so the rail still shows what it is for */
function DeadComposer() {
	return (
		<div data-agent-dead="" className="flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
			<div className="flex flex-col rounded-md border border-border/70 bg-surface/40 px-3 py-2.5">
				<span className="text-muted type-body" style={{ height: MIN_H }}>
					say what to change
				</span>
			</div>
			<div className="flex h-[18px] items-center" />
		</div>
	);
}

/**
 * Signed out, as a standing fact.
 *
 * A strip rather than a wall because the log below it is not empty and must not be: what
 * the human typed is down there in their own voice, and so is the moment the send
 * bounced. The strip is the part that outlives that moment — the same test #117 used to
 * lift the plan out of the transcript and leave the screenshot in it.
 *
 * It sits at the plan strip's height and in the plan strip's place, because the rail has
 * one shelf and those two never want it at once: a plan belongs to a turn that is running,
 * and this exists precisely because none can.
 *
 * Two things on it and no third. The promise about keys is in the log under the remedy,
 * where somebody deciding what to do reads it once, rather than held on screen for as long
 * as the state lasts.
 */
function LoginStrip({ login }: { login: LoginDeck }) {
	return (
		<div data-agent-login="" className="flex h-[34px] shrink-0 items-center border-border border-b px-3.5">
			<span className="min-w-0 flex-1 truncate text-muted type-value">signed out</span>
			<Quiet busy={login.checking} onClick={login.check} />
		</div>
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
					{entries.map((entry, index) => (
						<Arrive key={entry.key} gap={gapBefore(entries[index - 1], entry)}>
							<Entry entry={entry} elapsed={elapsed} jump={jump} onAnswer={onAnswer} />
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
							<span data-agent-detail="" className="block truncate text-muted type-detail">
								{entry.detail}
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

function Ask({
	entry,
	onAnswer,
}: {
	entry: Extract<AgentEntry, { kind: "ask" }>;
	onAnswer: (request: string, reply: AgentReply) => void;
}) {
	const request = entry.request;
	const permissions = useContext(PermissionAction);
	const open = entry.state === "open" && request !== null;
	const answer = (reply: AgentReply) => {
		if (request !== null) onAnswer(request, reply);
	};
	// held against the request rather than reset by it: the block outlives no ask, but
	// a key reused by a second thread's ask would otherwise arrive part-answered
	const [given, setGiven] = useState<{ request: string | null; picks: Record<string, string> }>({
		request,
		picks: {},
	});
	const picks = given.request === request ? given.picks : {};
	const live = entry.questions.findIndex((one) => picks[one.question] === undefined);
	const pick = (question: string, label: string) => {
		const next = { ...picks, [question]: label };
		if (entry.questions.every((one) => next[one.question] !== undefined)) answer({ kind: "picked", picks: next });
		else setGiven({ request, picks: next });
	};
	return (
		<div data-agent-ask={entry.state} className="flex flex-col gap-3">
			{open && entry.access?.unavailable ? (
				<p className="text-base text-text leading-base">
					spool can’t restrict commands to design/ on this computer.
				</p>
			) : null}
			{/* the sentences, drawn where the agent's sentences are drawn. A question still
			    arriving shows a caret, because it is typing itself in the way every tool
			    call's subject does */}
			{entry.question ? (
				entry.questions.map((question, index) => {
					const chosen = picks[question.question];
					// nothing below the one being asked: a question nobody has reached is a
					// decision nobody is making, and drawing it is the block asking twice
					if (open && chosen === undefined && index !== live) return null;
					return (
						<div key={question.question} className="flex flex-col gap-1.5">
							<p className="text-text type-body">{question.question}</p>
							{/* a settled pick keeps its sentence and lands in the person's own shape,
							    which is where the whole answer lands once the last one is in */}
							{open && chosen !== undefined ? <Answered words={chosen} /> : null}
							{open && chosen === undefined ? (
								<div className="flex flex-col gap-1.5">
									{question.options.map((option) => (
										<button
											key={option.label}
											type="button"
											data-agent-option={option.label}
											onClick={() => pick(question.question, option.label)}
											className="flex flex-col gap-1 rounded-md border border-border-raised bg-surface px-3 py-2.5 text-left transition-colors duration-150 hover:border-muted/45"
										>
											<span className="text-text type-body">{option.label}</span>
											{option.description === "" ? null : (
												<span className="text-muted type-caption">{option.description}</span>
											)}
										</button>
									))}
								</div>
							) : null}
						</div>
					);
				})
			) : entry.asked === null || (entry.access !== undefined && !open) ? null : (
				// nothing where the agent wrote nothing: the row above already named the call,
				// and a block that repeated it would be the rail saying one thing twice
				<p className="text-text type-body">
					{entry.asked}
					{entry.state === "arriving" ? <Caret /> : null}
				</p>
			)}
			{open && entry.access?.command ? (
				<code className="break-words font-mono text-xs text-muted leading-4">{entry.access.command}</code>
			) : null}
			{entry.state === "answered" ? <Answered words={entry.words} /> : null}
			{entry.state === "dropped" ? <AskOutcome state="failed" text="nobody answered" /> : null}
			{entry.state === "allowed" ? <AskOutcome state="done" text="allowed once" /> : null}
			{entry.state === "always" ? (
				<AskOutcome
					state="done"
					text={
						entry.access === undefined
							? "allowed for this thread"
							: entry.access.kind === "command"
								? entry.access.scope === "commands"
									? "commands allowed for this thread"
									: `commands in ${entry.access.scope} allowed for this thread`
								: `edits in ${entry.access.scope} allowed for this thread`
					}
				/>
			) : null}
			{/* a deny and a dismiss are one wire and two acts: for an approval the person
			    answered no, and for a question they refused to answer at all */}
			{entry.state === "denied" ? (
				<AskOutcome state="stopped" text={entry.question ? "dismissed" : "denied"} />
			) : null}
			{open && entry.question ? (
				// not a fourth option and it must not look like one, so the options keep their
				// bordered rows and this is one quiet mono word underneath, in the register
				// the composer uses for its own hints. It stays wordless so it means one thing
				<button
					type="button"
					data-agent-dismiss=""
					onClick={() => answer({ kind: "deny" })}
					className="w-fit text-muted transition-colors duration-150 hover:text-muted type-detail"
				>
					dismiss
				</button>
			) : null}
			{open && !entry.question ? (
				<div className="flex flex-wrap gap-1.5">
					<AskAction compact label="allow once" onPick={() => answer({ kind: "allow" })} />
					{/* absent rather than dead where the request suggested no rule: spool never
					    composes one of its own to fill the gap. Where it is offered it lasts the
					    thread and is written to no file, because the complaint is repetition */}
					{entry.always ? (
						<AskAction compact label="for this thread" onPick={() => answer({ kind: "always" })} />
					) : null}
					<AskAction compact label="deny" onPick={() => answer({ kind: "deny" })} />
				</div>
			) : null}
			{open && !entry.question && permissions !== undefined ? (
				<button
					type="button"
					onClick={permissions}
					className="w-fit py-1 font-mono text-2xs text-muted leading-4 transition-colors hover:text-text"
				>
					change permissions…
				</button>
			) : null}
		</div>
	);
}

/** one of spool's own answers to an approval, in the same row an option gets */
function AskAction({ label, onPick, compact = false }: { label: string; onPick: () => void; compact?: boolean }) {
	return (
		<button
			type="button"
			data-agent-option={label}
			onClick={onPick}
			className={cn(
				"rounded-md border border-border-raised bg-surface px-3 py-2 text-left transition-colors duration-150 hover:border-muted/45",
				!compact && "w-full",
			)}
		>
			<span className="text-text type-value">{label}</span>
		</button>
	);
}

/**
 * The answer, in the shape the rail already draws the person's words in.
 *
 * Not a row, because the verb slot has nowhere to put it: `ask` is spent on every call
 * that left the building, and `ask Notion` one line above `asked Shot fix` is two words
 * the eye cannot separate at this size. The person's own accent rail is the answer that
 * needed no new word at all.
 */
function Answered({ words }: { words: string | null }) {
	return (
		<div className="relative flex flex-col gap-1.5 pl-3.5">
			<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
			<p className="whitespace-pre-wrap text-text type-body">{words}</p>
		</div>
	);
}

/** what became of a request nobody is waiting on any more, in one quiet line */
function AskOutcome({ state, text }: { state: RowState; text: string }) {
	return (
		<div className="flex items-center gap-2.5">
			<StateMark state={state} />
			<span className="text-muted type-detail">{text}</span>
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
 * One bounded box the whole message is typed into, with what rides along stacked
 * above the field it rides with. Enter sends what is in it verbatim, whatever that
 * is; shift-Enter is a newline.
 *
 * Enter has three meanings and the turn's own state resolves them (#170): answering
 * answers, busy queues, otherwise sends. Busy used to refuse — two agents writing one
 * repo is still not a thing to offer — but refusing threw away written words, so the
 * press is taken and held instead and the queue above the field is where it waits.
 * The hint below says which of the three is live, so a press is never a mystery. */

/**
 * The stroke on the composer's top border, which is the whole of what says the agent is
 * alive.
 *
 * A thread is laid out of the left edge, carries at its full length, and is taken up into
 * the right edge as the head waits there for the tail. Spool means winding thread and this
 * product calls its conversations threads, so a stroke on the boundary is closer to what
 * the thing is than a spinner would be — and it says it without spending the logo or a
 * single pixel of the transcript, because it rides the hairline that was already there.
 *
 * **No word, and that is the point.** The stroke is the entire indicator. Idle draws the
 * border unchanged, and a request out, thinking, saying and doing all draw the same
 * laying-and-taking-up. A reader watching the edge of their own eye learns nothing from the
 * difference between a request being out and a `read` being open, because the answer to *do
 * I need to do anything* is no in both.
 *
 * **What it does now say is how long, and only that (#231).** The travel is untouched and
 * the strength ramps: 75% of the text colour at rest, full at thirty seconds of one
 * unbroken silence. That reasoning above holds for the four-second wait it was written
 * against and does not cover a two-and-a-half-minute one, where the peripheral question
 * stops being *do I need to act* and becomes *is this thing alive at all*. Strength answers
 * it in the direction that helps — the line gets more present the longer it has been — and
 * costs neither the accent nor a pixel of travel. `WindStroke` argues the property choice.
 *
 * **The one state that is a call to act gets a shape instead.** Parked on a request, the
 * stroke stops where it was and an 18px break opens in the line. Stopping is
 * `animation-play-state: paused`, which is literally "where it was" and needs no clock of
 * spool's; a break is static, which is correct for a thing that has stopped, and nothing
 * else in this rail is a discontinuous line.
 *
 * The animation is `ui.css`'s, keyframes on one element's `translateX` and `scaleX`. Its
 * cost is stated rather than hidden: 420px of peripheral travel every 1.6s at 0.26px/ms,
 * the largest moving thing in the rail. What it buys is that the transcript gives up
 * nothing at all.
 */
/**
 * Where the strength ramp tops out, in milliseconds of one silence.
 *
 * 30 seconds, off the thinking blocks in the captures rather than off taste: 22 of the 27
 * are 1,050 estimated tokens or fewer, which is under 18 seconds at the 16.7ms a token the
 * four sequential captures measure. So an ordinary turn lives in the bottom of the ramp
 * and never reaches the top, and the five long ones — up to 9,500 tokens, two minutes
 * thirty-nine — arrive there and stay.
 */
const WIND_FULL_AT = 30_000;
/** what the stroke has always been, and the floor the ramp starts from */
const WIND_FLOOR = 0.75;

/**
 * How present the stroke is, for a silence this long.
 *
 * Exported because it is the whole of the behaviour and the only part of it worth
 * asserting: mounted, the ramp can only be read at whatever instant a test happens to
 * catch, and the thirty seconds it is defined over cannot be waited for. So the
 * arithmetic is tested as arithmetic and the rail is tested for being wired to it.
 */
export function windStrength(waited: number, laying: boolean): number {
	if (!laying) return WIND_FLOOR;
	return WIND_FLOOR + (1 - WIND_FLOOR) * Math.max(0, Math.min(1, waited / WIND_FULL_AT));
}

function WindStroke({ phase, waited }: { phase: TurnPhase; waited: number }) {
	// every state of a turn in flight draws the same thing, and a parked one draws it
	// stopped: the animation is the same instance either way, so pausing freezes the two
	// ends exactly where the request caught them
	const laying = phase === "playing" || phase === "asking";
	const parked = phase === "asking";
	/*
	 * The one thing the stroke now says about how long (#231).
	 *
	 * Strength and never pace, and the reason is the complaint this came from: the rail
	 * read as stopped, and slowing the only moving thing in it to say so would have been
	 * answering *is this alive* with less evidence that it is. Brightening says the same
	 * thing in the opposite direction — the longer it has been, the more present the line
	 * — and it leaves the travel exactly where it was.
	 *
	 * It is opacity on the colour the stroke already had rather than a colour of its own.
	 * This palette has one accent and `--color-thread` means the human's own thread: on
	 * the human's words, on the chip's rule, on a hot meter. Spending it here would give
	 * it a second meaning that has nothing to do with the first. Red would be worse still,
	 * because a long thought is the product working rather than a fault.
	 *
	 * A transition and not a keyframe, which is also why this is not pace. Opacity
	 * interpolates continuously and costs nothing; `animation-duration` on a running
	 * keyframe animation remaps the phase, and the head visibly jumps backwards every time
	 * the number moves.
	 */
	const strength = windStrength(waited, laying);
	return (
		<>
			<span
				aria-hidden="true"
				data-agent-wind={parked ? "parked" : laying ? "laying" : "idle"}
				style={{ opacity: strength }}
				className={cn(
					// scaled to nothing at rest, so idle is the border and nothing else: the
					// keyframes take the transform over for as long as they are running.
					// `transform` rather than Tailwind's `scale-x-0`, which compiles to the
					// `scale` property and would multiply the animation's own scale by zero
					"pointer-events-none absolute -top-px left-0 block h-px w-full origin-left bg-text [transform:scaleX(0)]",
					// 400ms, so the ramp is a drift rather than a per-tick step: the rail
					// re-renders on the pace's own clock and an untransitioned opacity would
					// change sixty times a second
					"transition-opacity duration-400 ease-linear motion-reduce:transition-none",
					laying && "animate-agent-wind",
					parked && "[animation-play-state:paused]",
				)}
			/>
			{/* the break, held rather than mounted so it can open over 200ms rather than
			    appear: it is a piece of the page laid over the hairline */}
			<span
				aria-hidden="true"
				data-agent-wind-break=""
				className={cn(
					"pointer-events-none absolute -top-px left-1/2 block h-px w-[18px] -translate-x-1/2 bg-bg transition-opacity duration-200 motion-reduce:transition-none",
					parked ? "opacity-100" : "opacity-0",
				)}
			/>
		</>
	);
}

/**
 * What the field says it is for, which is what the next press will do (#145, #200).
 *
 * Three, because Enter has three meanings here and the field is what each of them is
 * about: answering a question the turn is parked on, starting the thread again when its
 * session has aged out, and otherwise saying the next thing. A question wins over a
 * finished thread, because a parked turn is a live process and there is nothing to start.
 */
function fieldSays(answering: string | null, finished: boolean, running: boolean): string {
	if (answering !== null) return "Or say it in your own words";
	// Enter queues while a turn runs, so the field asks for what follows it (#364)
	if (running) return "Say what comes next";
	return finished ? "Say what to change · this starts a new chat" : "Say what to change";
}
function Composer({
	thread,
	ready,
	request,
	permissions,
	menu,
	onMenu,
	phase,
	waited,
	finished,
	answering,
	strip,
	pointing,
	draft,
	onDraft,
	attached,
	onAttach,
	model,
	limit,
	context,
	running,
	onSend,
	onQueue,
	onStop,
	onAnswer,
	onSwitch,
	onNewChat,
}: {
	thread: string;
	ready: boolean;
	request: string | undefined;
	permissions: PermissionDeck | undefined;
	menu: "models" | "permissions" | null;
	onMenu: (menu: "models" | "permissions" | null) => void;
	phase: TurnPhase;
	/** how long the request now out has been silent, which is all the stroke reads (#231) */
	waited: number;
	/**
	 * This thread's agent session is gone, so the next thing said starts a new one (#120).
	 *
	 * It is a hint rather than a refusal. The transcript is intact and worth reading, the
	 * words are not thrown away, and what the press will actually do is said out loud
	 * instead of a resume being offered that would fail.
	 */
	finished: boolean;
	/**
	 * The request Enter would answer, or null while Enter means what it always meant.
	 *
	 * A turn held at a question takes the press as the answer rather than as a new
	 * turn, and the tool prefers it that way: it tests a typed sentence before the
	 * picked options and tells the agent to read it carefully, because the person may
	 * ask for something else entirely. An option list was never the only way to answer.
	 */
	answering: string | null;
	strip: Strip;
	pointing: Pointing;
	/** controlled, because a take-back and a stop both write into the field (#170) */
	draft: string;
	onDraft: (text: string) => void;
	/**
	 * The reference riding with the words, which is bytes and never a path (#119).
	 *
	 * Controlled for the field's own reason: a message the queue held carries one, and
	 * taking it back has to put it where it came from rather than dropping it silently.
	 */
	attached: readonly Attachment[];
	onAttach: (update: (held: readonly Attachment[]) => readonly Attachment[]) => Promise<void>;
	model: AgentModelDeck;
	limit: AgentLimit | null;
	/** how full the window was after the last request, as a share, or null before one said */
	context: number | null;
	/** whether a turn is in flight at the instant of the press, off the turn itself (#234) */
	running: () => boolean;
	/** both of them say whether the words were taken, and the field empties on a yes (#234) */
	onSend: (text: string, sent: AgentSent) => boolean;
	onQueue: (text: string, sent: AgentSent) => boolean;
	onStop: () => void;
	onAnswer: (request: string, reply: AgentReply) => void;
	/** another agent was picked in the menu: in this chat while it is empty, or a new one */
	onSwitch: (engine: AgentEngineId, fresh: boolean) => void;
	onNewChat: () => void;
}) {
	const [ringOpen, setRingOpen] = useState(false);
	const currentThread = useRef(thread);
	currentThread.current = thread;
	const field = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (!request) return;
		let second = 0;
		const first = requestAnimationFrame(() => {
			second = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
		});
		return () => {
			cancelAnimationFrame(first);
			cancelAnimationFrame(second);
		};
	}, [request]);
	const permissionTrigger = useRef<HTMLButtonElement>(null);
	const reading = useRef(0);
	const reads = useRef(Promise.resolve());
	const attachFiles = (files: readonly File[]) => {
		reading.current += 1;
		// Serial completion preserves paste order when a larger file reads last.
		reads.current = reads.current
			.then(async () => {
				try {
					const attached = await Promise.all(files.map(readAttachment));
					await onAttach((held) => [...held, ...attached]);
				} finally {
					reading.current -= 1;
				}
			})
			.catch(() => {});
	};
	/*
	 * A stop is offered against every turn that is still a process (#165, #180, #234).
	 *
	 * Parked included. A turn held at a question is spending nothing and moving nowhere,
	 * which is why the stroke stops there — but it is a live process standing in the repo
	 * with a queue behind it, and the question's own dismiss answers the question rather
	 * than ending the turn. The Stop button ends the turn and hands the queue back.
	 */
	const cutting = phase === "playing" || phase === "asking";

	const resize = (element: HTMLTextAreaElement) => {
		element.style.height = "auto";
		element.style.height = `${Math.max(MIN_H, Math.min(element.scrollHeight, MAX_H))}px`;
	};

	// words handed back arrive from outside the field, so it has to re-fit to them the
	// way it does to typing (#170)
	// biome-ignore lint/correctness/useExhaustiveDependencies: the text is what decides the height — the box is measured through the ref
	useEffect(() => {
		const element = field.current;
		if (element !== null) resize(element);
	}, [draft]);

	const take = async (text: string) => {
		if (reading.current > 0) return false;
		// captured here rather than read later: the chips that were up are the bytes
		// that went out, and the line under the words has to say so afterwards. For a
		// message the queue holds that is the whole contract, because it fires against a
		// canvas the hands have moved on from
		const sent: AgentSent = { context: contextOf(strip), attached, selection: pointing.entries };
		/*
		 * Asked of the turn itself rather than of the last render (#234).
		 *
		 * A press lands between a stream closing and React drawing that, and in that window
		 * the rendered phase still says a turn is running while the queue has already fired:
		 * a message taken then was held for a turn that had ended, behind everything that had
		 * just gone out. The turn knows which it is at the instant of the press, and this asks
		 * it. A turn parked on a question still holds the press, because a parked turn is a
		 * live process — only a question with somewhere for words to go answers instead, and
		 * that is decided above.
		 */
		const took = running() ? onQueue(text, sent) : onSend(text, sent);
		// the field is emptied by something having taken the words and never by the press
		// alone (#234): a rail whose threads are still arriving has nowhere to put them, and
		// a box cleared over that is a sentence gone with no way back to it
		if (!took) return false;
		onDraft("");
		onAttach(() => []);
		return true;
	};

	const submit = (box: HTMLTextAreaElement | null) => {
		const text = draft.trim();
		if (text === "") return;
		// answering answers, busy queues, otherwise sends — the three meanings of
		// one press, resolved by what the turn is doing (#170)
		if (answering !== null) {
			onDraft("");
			if (box !== null) box.style.height = `${MIN_H}px`;
			onAnswer(answering, { kind: "said", text });
			return;
		}
		void take(text).then((took) => {
			if (took && box !== null) box.style.height = `${MIN_H}px`;
		});
	};
	const says = fieldSays(answering, finished, cutting);
	const file = useRef<HTMLInputElement>(null);
	const showRing = context !== null && context >= CONTEXT_SHOWN_AT;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drop target is not a control, and its keyboard path is the paste the field already takes
		<div
			className="relative flex shrink-0 flex-col gap-2 px-3.5 pb-3.5"
			onDragOver={(event) => {
				// `items` rather than `files`: while a drag is in flight the data store is in
				// protected mode and `files` is empty, so a guard that read it would never
				// accept the drag and the browser would navigate to the dropped picture
				if (!draggingAttachment(event.dataTransfer)) return;
				event.preventDefault();
				event.stopPropagation();
			}}
			onDrop={(event) => {
				const files = attachmentsIn(event.dataTransfer);
				if (files.length === 0) return;
				event.preventDefault();
				event.stopPropagation();
				attachFiles(files);
			}}
		>
			{permissions?.reason ? (
				<p role="status" className="px-1 text-muted type-caption">
					{permissions.reason}
				</p>
			) : null}
			{/* the box's own frame, which the floats over it are placed against: the box is
			    not positioned itself, so a menu rising off its foot can stand outside it */}
			<div className="relative">
				{/* the stroke runs along the box's top hairline, inside its rounded corners */}
				<span aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-px block">
					<WindStroke phase={phase} waited={waited} />
				</span>
				<div
					data-agent-composer=""
					className="flex min-h-0 flex-col gap-2 rounded-lg border border-border bg-bg px-3 pt-3 pb-2 transition-colors duration-150 focus-within:border-muted/45"
				>
					{attached.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{attached.map((image, index) => (
								<Attached
									key={referenceKey(image)}
									attached={image}
									onDrop={() => onAttach((held) => held.filter((_, at) => at !== index))}
								/>
							))}
						</div>
					)}
					<SelectionStrip strip={strip} pointing={pointing} />
					{/*
					 * What the field is for, and what the press will do with it.
					 *
					 * #200's word about a thread whose session has aged out lives here: "this starts
					 * a new chat" is a fact about the words being typed rather than about which
					 * machine is answering. While a turn runs it asks for what comes next, because
					 * Enter then queues (#364).
					 */}
					<textarea
						ref={field}
						value={draft}
						rows={2}
						spellCheck={false}
						placeholder={says}
						aria-label={says}
						onChange={(event) => {
							onDraft(event.target.value);
							resize(event.target);
						}}
						onPaste={(event) => {
							// a screenshot in the clipboard is the commonest reference there is, and
							// pasting one is how it gets here: a browser never reveals a path, so
							// there is nothing else a paste could mean
							const files = attachmentsIn(event.clipboardData);
							if (files.length === 0) return;
							event.preventDefault();
							attachFiles(files);
						}}
						onKeyDown={(event) => {
							if (event.key !== "Enter" || event.shiftKey) return;
							event.preventDefault();
							submit(event.currentTarget);
						}}
						className="w-full resize-none bg-transparent text-text outline-none placeholder:text-muted type-body"
						style={{ height: MIN_H }}
					/>
					{/* the foot: small grey controls, who answers and what it may do on the left,
					    how full the window is and the send on the right (#364) */}
					<div className="-mx-1 flex h-7 min-w-0 items-center justify-between gap-2">
						<div className="flex min-w-0 flex-1 items-center gap-0.5">
							<button
								type="button"
								aria-label="Attach an image"
								title="Attach an image"
								onClick={() => file.current?.click()}
								className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
							>
								<ClipIcon />
							</button>
							<input
								ref={file}
								type="file"
								accept={[...ATTACHMENT_MEDIA].join(",")}
								multiple
								hidden
								onChange={(event) => {
									const files = [...(event.currentTarget.files ?? [])].filter((one) =>
										isSendableAttachment(one),
									);
									event.currentTarget.value = "";
									if (files.length > 0) attachFiles(files);
								}}
							/>
							{ready ? (
								<ModelMenu
									model={model}
									limit={limit}
									open={menu === "models"}
									interrupted={menu !== null && menu !== "models"}
									onOpen={(next) => onMenu(next ? "models" : null)}
									onSwitch={onSwitch}
								/>
							) : null}
							{permissions === undefined || model.offer.modes === false ? null : (
								<>
									<button
										ref={permissionTrigger}
										type="button"
										data-permission-trigger=""
										aria-label={`Agent permissions: ${MODE_NAMES[permissions.mode]}`}
										aria-haspopup="menu"
										aria-expanded={menu === "permissions"}
										title={
											permissions.pending
												? `${MODE_NAMES[permissions.mode]}, from the next turn. Applies to every chat.`
												: `${MODE_NAMES[permissions.mode]}. Applies to every chat.`
										}
										aria-busy={permissions.saving}
										onClick={() => onMenu(menu === "permissions" ? null : "permissions")}
										onKeyDown={(event) => {
											if (event.key === "ArrowDown" || event.key === "ArrowUp") {
												event.preventDefault();
												onMenu("permissions");
											}
										}}
										className="relative z-30 flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-muted transition-colors duration-150 hover:bg-surface hover:text-text aria-expanded:bg-surface aria-expanded:text-text type-control"
									>
										{MODE_NAMES[permissions.mode]}
										<Chevron open={menu === "permissions"} />
									</button>
									{menu === "permissions" ? (
										<button
											type="button"
											tabIndex={-1}
											aria-label="close the permission menu"
											className="fixed inset-0 z-10 cursor-default"
											onClick={() => onMenu(null)}
										/>
									) : null}
									<Float
										open={menu === "permissions"}
										from="up"
										className="absolute bottom-full left-0 z-30 mb-2 w-[300px] max-w-full"
									>
										<PermissionMenu
											mode={permissions.mode}
											pending={permissions.pending}
											engine={engineName(model.engine ?? "claude")}
											trigger={permissionTrigger}
											onChange={(next) => {
												onMenu(null);
												permissions.choose(next);
											}}
											onClose={() => onMenu(null)}
										/>
									</Float>
								</>
							)}
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							{showRing && context !== null ? (
								<ContextRing used={context} open={ringOpen} onOpen={setRingOpen} onNewChat={onNewChat} />
							) : null}
							{cutting ? (
								<StopButton onStop={onStop} />
							) : (
								<button
									type="button"
									aria-label="Send"
									data-agent-send=""
									disabled={draft.trim() === ""}
									onClick={() => submit(field.current)}
									className="flex h-7 w-7 shrink-0 animate-agent-fade-in items-center justify-center rounded-full bg-text text-bg transition-opacity duration-150 hover:opacity-90 disabled:bg-raised disabled:text-muted"
								>
									<SendIcon />
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

/** past this share of the window the ring shows; under it there is nothing to act on (#364) */
export const CONTEXT_SHOWN_AT = 0.6;

/**
 * How full the context window is, as a ring with the used share filled in as a wedge, so it
 * reads as an amount and never as the turning working ring (#364). It shows only past
 * 60%, and pressed it says how full and the one thing to do about it.
 */
function ContextRing({
	used,
	open,
	onOpen,
	onNewChat,
}: {
	used: number;
	open: boolean;
	onOpen: (open: boolean) => void;
	onNewChat: () => void;
}) {
	const share = Math.min(1, Math.max(0, used));
	const said = `${Math.round(share * 100)}% of context used.`;
	const turn = share * 2 * Math.PI;
	const r = 3.5;
	const x = 7 + r * Math.sin(turn);
	const y = 7 - r * Math.cos(turn);
	const wedge =
		share >= 0.999
			? `M7 ${7 - r}A${r} ${r} 0 1 1 6.99 ${7 - r}Z`
			: `M7 7V${7 - r}A${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`;
	return (
		<span className="flex">
			<button
				type="button"
				aria-label={said}
				aria-expanded={open}
				title={said}
				data-agent-context-ring={Math.round(share * 100)}
				onClick={() => onOpen(!open)}
				className="relative z-30 flex h-7 w-7 animate-agent-fade-in items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text aria-expanded:bg-surface aria-expanded:text-text"
			>
				<svg viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden="true">
					<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.25" />
					<path d={wedge} fill="currentColor" />
				</svg>
			</button>
			{open ? (
				<button
					type="button"
					tabIndex={-1}
					aria-label="close the context note"
					className="fixed inset-0 z-10 cursor-default"
					onClick={() => onOpen(false)}
				/>
			) : null}
			<Float open={open} from="up" className="absolute right-0 bottom-full z-30 mb-2 w-[288px] max-w-full">
				<div
					role="dialog"
					aria-label="Context"
					data-agent-context-note=""
					onKeyDown={(event) => {
						if (event.key !== "Escape") return;
						event.preventDefault();
						event.stopPropagation();
						onOpen(false);
					}}
					className="flex items-center gap-4 py-3 pr-3 pl-4"
				>
					<span className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="text-text type-control tabular-nums">{said}</span>
						<span className="text-muted type-label">A new chat starts fresh.</span>
					</span>
					<button
						type="button"
						onClick={() => {
							onOpen(false);
							onNewChat();
						}}
						className="h-7 shrink-0 rounded-sm border border-border px-2.5 text-text transition-colors duration-150 hover:bg-raised type-control"
					>
						New chat
					</button>
				</div>
			</Float>
		</span>
	);
}

function ModelMenu(props: {
	model: AgentModelDeck;
	limit: AgentLimit | null;
	open: boolean;
	onOpen: (open: boolean) => void;
	interrupted: boolean;
	onSwitch: (engine: AgentEngineId, fresh: boolean) => void;
}) {
	const recovery = useContext(RecoveryActions);
	const { model, limit, open, onOpen, onSwitch } = props;
	return (
		<AgentMenu
			project={model.project ?? ""}
			model={model}
			preferred={recovery?.preferred}
			started={model.started === true}
			limit={limit}
			login={recovery?.login}
			open={open}
			onOpen={onOpen}
			onSwitch={onSwitch}
		/>
	);
}

/** a paperclip on the 16 grid: attach */
function ClipIcon() {
	return (
		<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
			<path
				d="m12.75 7.5-4.9 4.9a3 3 0 0 1-4.25-4.25l5.3-5.3a2 2 0 0 1 2.83 2.83L6.5 10.9a1 1 0 0 1-1.41-1.41l4.6-4.6"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** an arrow up: send */
function SendIcon() {
	return (
		<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
			<path
				d="M8 12.5v-9M4 7.5l4-4 4 4"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/**
 * The way out of a turn that is already running (#165): Send becomes Stop for as long as
 * the turn is a process (#364). Stopping requires this button; Escape only dismisses or
 * leaves UI surfaces.
 */
function StopButton({ onStop }: { onStop: () => void }) {
	return (
		<button
			type="button"
			aria-label="Stop"
			data-agent-stop=""
			onClick={onStop}
			className="flex h-7 w-7 shrink-0 animate-agent-fade-in items-center justify-center rounded-full bg-text transition-opacity duration-150 hover:opacity-90"
		>
			<span className="h-2 w-2 rounded-[1.5px] bg-bg" />
		</button>
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

/* ---------- the reference that rides along (#119) ----------
 * Look-only, and nothing lands. The bytes go down the same stdin the prompt does,
 * so the project gains no file, no inbox and no deleter — the agent's own
 * transcript is the durable copy, outside the repo. The cost is stated rather than
 * hidden: a browser never reveals a dropped file's path, so a logo cannot be added
 * to the project this way, and adding an asset is already a deliberate import into
 * `design/shared/assets/`.
 *
 * It arrives by paste or by drop and by nothing else. The footer holds the model and
 * the stop and nothing else (#184), and the chip line is the selection's, so a
 * button would need a slot the composer deliberately does not have — where a
 * pasted screenshot is the gesture people already have in their hands. */

/** how wide the tile is: enough to recognise a screenshot, not enough to read it */
const ATTACHED_W = 44;

/**
 * The tile has two things to do, so it has two targets.
 *
 * The picture is the press, because at this size it can be recognised and not checked,
 * and checking it is what a reference is for: it goes up over the rail in the same
 * overlay a tool call's screenshot goes up in. Taking the reference back is the ✕ in
 * the corner, the smaller target, because it is the rarer intent and the only one of
 * the two that cannot be undone.
 *
 * The ✕ is on hover, in the vocabulary the ✕ on a thread and on a chip already uses.
 * It carries a plate the chip's does not, because it sits on a picture rather than on
 * a surface, and an unbacked glyph over arbitrary pixels is not always there.
 */
const referenceKeys = new WeakMap<Attachment, string>();
function referenceKey(image: Attachment): string {
	let key = referenceKeys.get(image);
	if (!key) {
		key = crypto.randomUUID();
		referenceKeys.set(image, key);
	}
	return key;
}

function Attached({ attached, onDrop }: { attached: Attachment; onDrop: () => void }) {
	const [big, setBig] = useState(false);
	// held across renders for the reason `Shot` holds its own: the rail re-projects on
	// a clock and the string is the size of the picture, now read in two places
	const src = useMemo(() => `data:${attached.media};base64,${attached.data}`, [attached.media, attached.data]);
	return (
		<>
			<span
				data-agent-attached=""
				className="group relative flex w-fit shrink-0 overflow-hidden rounded-xs border border-border-raised bg-bg"
				style={{ width: ATTACHED_W, height: ATTACHED_W }}
			>
				{/* the picture is its own label: `image/png` is a fact about a file and this is a
				    thing you can see */}
				<button type="button" onClick={() => setBig(true)} className="flex h-full w-full cursor-zoom-in">
					<img src={src} alt="attached reference" className="h-full w-full object-cover" />
				</button>
				<button
					type="button"
					onClick={onDrop}
					aria-label="drop the attached image"
					className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-bl-xs bg-bg/0 text-muted/0 transition-colors duration-150 hover:text-text group-hover:bg-bg/70 group-hover:text-muted/70"
				>
					<CloseIcon />
				</button>
			</span>
			{/* beside the tile rather than inside it: the tile clips to 44px, and a picture held
			    over the whole rail cannot hang off something that small.
			    No caption, because a browser never reveals a dropped file's path and there is
			    nothing else to say that the picture is not already saying */}
			<Lightbox open={big} onClose={() => setBig(false)} caption={null}>
				<img src={src} alt="attached reference" className="block max-h-full max-w-full" />
			</Lightbox>
		</>
	);
}

/**
 * Whether a drag in flight is carrying something that could ride along.
 *
 * A dragging browser keeps its data store in protected mode, so `files` is empty
 * until the drop and only each item's `kind` and `type` can be read — which is
 * exactly enough, and reading `files` here would refuse every drag.
 */
function draggingAttachment(data: DataTransfer | null): boolean {
	return Array.from(data?.items ?? []).some((item) => item.kind === "file" && ATTACHMENT_MEDIA.has(item.type));
}

/**
 * The picture in a drop or a paste, if it is one spool can send.
 *
 * The composer refuses exactly what the daemon refuses (`src/attachment.ts`), so a
 * tile never draws for something the turn would be turned away for: nothing appearing
 * is a smaller cost than a prompt lost to a refusal after Enter.
 */
function attachmentsIn(data: DataTransfer | null): File[] {
	return Array.from(data?.files ?? []).filter((file) => isSendableAttachment(file));
}

/** The browser reads and encodes image bytes asynchronously. */
function readAttachment(file: File): Promise<Attachment> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result !== "string") return reject(new Error("Could not read the image"));
			resolve({ media: file.type, data: reader.result.slice(reader.result.indexOf(",") + 1) });
		};
		reader.onerror = () => reject(reader.error);
		reader.onabort = () => reject(new Error("Image read was cancelled"));
		reader.readAsDataURL(file);
	});
}

/* ---------- what the hands are pointing at ----------
 * The selection sits in the composer and goes out with the message without being
 * asked for. Its accent is the one the entry wears out on the canvas, because the
 * chip and the outline are one object — which is why hovering either lights the
 * other, and why a chip that cannot be paired with a box out there is a chip that
 * should not be drawn.
 *
 * One line, always. Either the chips fit on it or the strip is a count; the composer
 * never grows downward to make room for context, because the space below is the
 * prompt's. Opening the count is the human asking for the list, and then it is a
 * list: hoverable, individually droppable, eight rows before it scrolls inside
 * itself and no bar when it does. */

/** rows the open list shows before it starts scrolling under a fade */
const ROWS_SHOWN = 8;

function SelectionStrip({ strip, pointing }: { strip: Strip; pointing: Pointing }) {
	const [open, setOpen] = useState(false);
	if (strip.kind === "none") return null;

	// no wrap: the strip is chips because they fit on one line, and a second line
	// would be the rule breaking quietly rather than the count taking over. If the
	// estimate is off by a few pixels a chip truncates instead
	if (strip.kind === "chips") {
		return (
			<span data-agent-chips="" className="flex min-w-0 items-center gap-1.5">
				{strip.chips.map((chip) => (
					<Chip
						key={chip.id}
						words={chip}
						lit={pointing.lit === chip.id}
						onLight={pointing.onLight}
						// the entered frame is the one chip whose ✕ has nowhere to land:
						// removal mirrors the canvas, and out there the only way to stop
						// pointing at the frame you are inside is to leave it (#139)
						onDrop={strip.inside ? undefined : () => pointing.onDrop(chip.id)}
					/>
				))}
			</span>
		);
	}

	return (
		<span data-agent-chips="" className="flex min-w-0 flex-col gap-1.5">
			<span className="flex min-w-0 items-center">
				{/* the whole list rather than an entry's own id: the cursor on a count lights
				    every box the count stands for */}
				<Chip
					words={{ id: WHOLE_SELECTION, label: strip.label }}
					lit={pointing.lit !== null}
					open={open}
					onOpen={() => setOpen(!open)}
					onLight={pointing.onLight}
					// the count's own ✕ drops the whole selection, which is the one act the
					// canvas cannot do for you while you are standing inside a frame
					onDrop={() => pointing.onDrop(null)}
				/>
			</span>
			{open ? (
				/* Eight rows and then it scrolls, and it scrolls without a bar: the list is
				   for reaching one member, never for reading forty, and a native scrollbar in
				   a 420 rail is a grey slab across the only accent on screen. The fade says
				   there is more the way the transcript's does. */
				<span className="relative flex flex-col">
					<span className="flex max-h-[208px] flex-col overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{strip.chips.map((chip) => (
							<button
								key={chip.id}
								type="button"
								data-agent-chip-row={chip.label}
								onMouseEnter={() => pointing.onLight(chip.id)}
								onMouseLeave={() => pointing.onLight(null)}
								onClick={() => pointing.onDrop(chip.id)}
								className={cn(
									"group flex h-[26px] shrink-0 items-center gap-2 rounded-xs px-1 text-left",
									pointing.lit === chip.id && "bg-surface",
								)}
							>
								<span
									className={cn(
										"h-2.5 w-[2px] shrink-0 rounded-full",
										pointing.lit === chip.id ? "bg-thread" : "bg-thread/40",
									)}
								/>
								<span className="min-w-0 flex-1 truncate text-text type-value">{chip.label}</span>
								<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/0 group-hover:text-muted">
									<CloseIcon />
								</span>
							</button>
						))}
					</span>
					{strip.chips.length > ROWS_SHOWN ? (
						<span className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-surface to-transparent" />
					) : null}
				</span>
			) : null}
		</span>
	);
}

function Chip({
	words,
	lit,
	open,
	onOpen,
	onLight,
	onDrop,
}: {
	words: ChipWords;
	lit: boolean;
	open?: boolean;
	onOpen?: () => void;
	onLight: (id: string | null) => void;
	/** absent when there is nothing a ✕ could do — then the chip has no ✕ at all */
	onDrop?: (() => void) | undefined;
}) {
	const body = (
		<>
			<span className={cn("h-3 w-[2px] shrink-0 rounded-full", lit ? "bg-thread" : "bg-thread/55")} />
			<span className="min-w-0 truncate text-text type-value">{words.label}</span>
			{onOpen === undefined ? null : (
				<ChevronIcon open={open ?? false} className="h-2.5 w-2.5 shrink-0 text-muted/40" />
			)}
		</>
	);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the cursor lighting the box out on the canvas is a hover reading, and its own controls are buttons
		<span
			data-agent-chip={words.label}
			className={cn(
				"flex h-6 min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-sm border bg-raised pl-2 transition-colors duration-150",
				// the ✕'s own padding goes with it, or the chip keeps a gap it no longer uses
				onDrop === undefined ? "pr-2.5" : "pr-1",
				lit ? "border-thread/45" : "border-border-raised",
			)}
			onMouseEnter={() => onLight(words.id)}
			onMouseLeave={() => onLight(null)}
		>
			{onOpen === undefined ? (
				body
			) : (
				<button
					type="button"
					onClick={onOpen}
					aria-expanded={open ?? false}
					className="flex min-w-0 items-center gap-2 text-left"
				>
					{body}
				</button>
			)}
			{onDrop === undefined ? null : (
				<button
					type="button"
					onClick={onDrop}
					aria-label={`drop ${words.label}`}
					className="flex h-4 w-4 shrink-0 items-center justify-center rounded-xs text-muted/50 transition-colors duration-150 hover:bg-surface hover:text-text"
				>
					<CloseIcon />
				</button>
			)}
		</span>
	);
}

const RecoveryActions = createContext<{
	login: LoginDeck;
	modelRequest: number;
	/** the machine's usual agent, which the model trigger names only another of (#364) */
	preferred?: AgentEngineId | null | undefined;
} | null>(null);

function RecoveryView({
	install,
	login,
	model,
	onModels,
	onNew,
}: {
	install: InstallDeck;
	login: LoginDeck;
	model: AgentModelDeck;
	onModels: () => void;
	onNew: Threads["onNew"];
}) {
	const recovery = login.recovery;
	const engine = model.engine;
	const action = "font-mono text-2xs leading-3 text-muted hover:text-text disabled:opacity-50";
	const changed = recovery?.offer && model.offer.current.value !== recovery.offer;
	if (engine !== undefined && (install.missing || login.out || recovery?.kind === "login")) {
		const name = engineName(engine);
		const wanted = INSTALL_LINES.find((agent) => agent.id === engine);
		return (
			<div data-recovery={engine} className="flex flex-col gap-3">
				<p className="text-base text-text leading-base">
					{install.missing ? `${name} isn’t installed.` : `Sign in to ${name} to continue.`}
				</p>
				{install.missing ? (
					wanted === undefined ? null : (
						<InstallLine name={name} line={wanted.line} />
					)
				) : (
					// each agent signs in in its own terminal flow: spool holds no login of its own
					<p className="text-base text-muted leading-base">
						{engine === "codex" ? (
							<>
								Run <code className="font-mono text-xs">codex login</code> in a terminal.
							</>
						) : (
							<>
								Run <code className="font-mono text-xs">{engine}</code> in a terminal, then{" "}
								<code className="font-mono text-xs">/login</code>.
							</>
						)}
					</p>
				)}
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						data-agent-check=""
						className={action}
						disabled={install.checking || login.checking}
						onClick={install.missing ? install.look : login.check}
					>
						{install.checking || login.checking ? "checking…" : "check again"}
					</button>
					<button type="button" className={action} onClick={() => onNew()}>
						new thread
					</button>
				</div>
				{install.foundNothing ? (
					<p data-agent-looked="" className="font-mono text-2xs text-muted">
						{name} is still not installed.
					</p>
				) : null}
			</div>
		);
	}
	if (!recovery) return null;
	if (changed && recovery.scope === "model")
		return (
			<button type="button" className={action} onClick={login.retry}>
				continue with this model
			</button>
		);
	const reset =
		recovery.resetsAt === undefined
			? null
			: new Date(recovery.resetsAt * 1000).toLocaleTimeString("en-GB", {
					hour: "2-digit",
					minute: "2-digit",
					...(recovery.resetsAt * 1000 - Date.now() >= 24 * 3600 * 1000
						? ({ day: "numeric", month: "short" } as const)
						: {}),
				});
	return (
		<div data-recovery="limit" className="flex flex-col gap-3">
			<p className="text-base text-text leading-base">{recovery.account} rate limit reached.</p>
			{reset === null ? null : <p className="text-base text-muted leading-base">Try again at {reset}.</p>}
			<div className="flex items-center gap-3">
				<button type="button" className={action} onClick={login.retry}>
					retry
				</button>
				<button type="button" className={action} onClick={onModels}>
					choose model
				</button>
			</div>
		</div>
	);
}
