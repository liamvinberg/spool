import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentReply } from "../../daemon/agent-control";
import type { AgentLimit } from "../../daemon/agent-events";
import type { ServedThread } from "../../daemon/agent-threads";
import {
	type AgentAttached,
	type AgentReading,
	answerAgentTurn,
	attachAgentTurn,
	closeAgentThread,
	fetchAgentLogin,
	fetchAgentThreads,
	interruptAgentTurn,
	putAgentThread,
	streamAgentTurn,
} from "../api";
import type { AgentWrite } from "./agent-nouns";
import { type LoginDeck, STILL_OUT, signedInAs } from "./agent-preflight";
import { type AgentHandback, type AgentQueued, drawableQueue } from "./agent-queue";
import {
	askOf,
	bounced,
	cutPicture,
	type Life,
	lastOf,
	lifeOf,
	nameOf,
	storedLife,
	type Thread,
} from "./agent-threads";
import {
	type AgentEntry,
	type AgentPlan,
	type AgentSent,
	type AgentWords,
	drawableEntries,
	fullyShown,
	type Stamped,
	transcriptOf,
	unpaced,
} from "./agent-transcript";

/**
 * Every conversation a project has, and the one turn the rail is watching (#192, #200).
 *
 * A thread owns three things and nothing else: the events as they land, the clock they
 * are read against, and the request itself. Everything the rail draws is derived — the
 * transcript is projected fresh from the events on every tick, so there is one source of
 * truth and no second copy to keep in step.
 *
 * The clock is the pace's clock. #149's smoother is a closed-form function of elapsed
 * milliseconds rather than an accumulator, so a tick is a read rather than a step: a
 * dropped frame costs nothing and the edge lands where it would have.
 *
 * **A project holds many of them and they keep running when you look away**, which is
 * why a thread is a plain object here rather than a hook. Hooks cannot be N of anything,
 * and the alternative — one hook keyed on whichever thread is open — abandons the stream
 * of every thread you switch off, which is the one thing this ticket exists to stop. So
 * the deck holds a map of them, one interval ticks all of them, and React is told to
 * redraw by a counter.
 */

/**
 * How often the log is read, at the pace's own resolution.
 *
 * The edge moves at 83 characters a second at its floor, so ten reads a second is
 * about eight characters a tick — a word. Faster buys sub-word steps nobody can
 * see; slower turns a stream into a slideshow.
 */
const TICK_MS = 100;

/**
 * How often a thread in flight writes its picture down.
 *
 * The picture changes on every tick and the disk does not need to. What a restart may
 * cost is bounded by this and nothing else, so it is short enough that a thread caught
 * mid-turn comes back showing what it was doing, and long enough that a nine-minute turn
 * is a few hundred writes rather than five thousand. Every boundary that matters — the
 * send, the settle, a look — writes immediately regardless.
 */
const SAVE_MS = 2000;

/**
 * How far in the past a picked-up turn's clock is started (#211).
 *
 * Everything replayed is stamped at zero, so this is what makes all of it due at once: a
 * turn arriving whole is drawn whole rather than typed out from the beginning, which is
 * the rule a picture off disk has always been under. Anything the pace could still be
 * owed is bounded by the turn's own length, so a day is not a number to tune — it is far
 * past every schedule a turn can write, and what arrives after the replay paces normally
 * from wherever the clock then stands.
 */
const REPLAYED_MS = 86_400_000;

/**
 * What the turn is doing, and the one member that is about the person (#145).
 *
 * `asking` is not a slower `playing`. A turn parked on a request is spending nothing
 * and moving nowhere, and it is the only state in this rail that ends when somebody
 * acts rather than when something arrives — which is why Enter changes meaning in it
 * and why the clock stops. It is deliberately not called `waiting`: the union already
 * has a `waiting`, and that one is the model composing.
 */
export type TurnPhase = "idle" | "playing" | "asking" | "settled";

export interface AgentTurn {
	readonly entries: readonly AgentEntry[];
	/**
	 * The plan the turn wrote, which is not in the entries and is the point of it: it
	 * goes on changing for the rest of the turn, so it sits on the shelf above the log
	 * rather than scrolling off the top of one (#117, #194).
	 */
	readonly plan: AgentPlan | null;
	readonly phase: TurnPhase;
	/**
	 * Milliseconds since the send, and infinite once there is nothing left to pace —
	 * which is also what reduced motion asks for from the first frame, since a jump
	 * cut is the honest downgrade of an arrival rather than a slower one.
	 */
	readonly elapsed: number;
	/**
	 * Send what was typed, and with it whatever the composer was holding (#116, #119).
	 *
	 * `sent` is captured by the caller rather than read later because the selection is a
	 * live thing and a turn is a record: the chips that were up are the bytes that went
	 * out, and the line under the words says so for as long as the log lasts.
	 */
	readonly send: (text: string, sent?: AgentSent) => void;
	/**
	 * What the person said to a request the turn is parked on (#121, #145).
	 *
	 * It goes up its own door rather than down the stream that asked, and nothing is
	 * drawn from it here: the daemon says the request was answered on the same stream
	 * everything else arrives on, so the log stays one fold over one sequence.
	 */
	readonly answer: (request: string, reply: AgentReply) => void;
	/** what spool is holding until this turn ends, in the order it will fire (#170) */
	readonly queued: readonly AgentQueued[];
	/**
	 * Take a message spool cannot send yet (#170).
	 *
	 * Enter while a turn is running accepts the words rather than dropping them, and
	 * nothing goes down the wire mid-turn. `sent` is captured here for the same reason
	 * a send captures it and with far more at stake: this message fires when the turn
	 * ends, which may be nine minutes and a different selection later, so the chips
	 * that were up at Enter are the bytes that go out with it.
	 */
	readonly queue: (text: string, sent?: AgentSent) => void;
	/** take one back by hand, which hands its words to whoever is holding the box */
	readonly unqueue: (id: string) => void;
	/**
	 * Stop the turn, and the queue with it (#165, #170).
	 *
	 * An interrupt request rather than a kill: the process survives it, and the log
	 * ends by saying `stopped` off the wire's own word for it. The queue goes because a
	 * stop is one act with one outcome — every word still waiting comes back to the box
	 * rather than firing into a turn nobody asked for.
	 */
	readonly stop: () => void;
	/** whatever left the queue un-fired, for whoever is holding the box (#170) */
	readonly handback: AgentHandback;
	/**
	 * The usage window, which is the one thing here that outlives a turn (#122).
	 *
	 * It came back on the message before this one and it will still be true tomorrow, so a
	 * new turn does not clear it and neither does switching thread: it is one allowance
	 * every thread is spending. Null until the binary warns, which is most of a session,
	 * and that is what keeps the readout from ever becoming chrome.
	 */
	readonly limit: AgentLimit | null;
	/**
	 * Every write this turn has landed, in the order they landed (#214).
	 *
	 * The turn in flight and nothing else: a thread read back off disk has a log and no
	 * writes, because a mark on a frame is a thing happening rather than a thing that
	 * happened, and drawing an hour-old edit on today's document would be a lie about
	 * what is on screen.
	 */
	readonly writes: readonly AgentWrite[];
}

/**
 * The threads of one project, and the one the rail has open (#136, #200).
 *
 * `turn` is the open thread's, so everything the rail already drew keeps its shape: the
 * transcript, the composer and the queue are one thread's and always were. What is new
 * is the column beside them and the fact that the others are still running.
 */
export interface AgentDeck {
	readonly threads: readonly Thread[];
	readonly open: string;
	readonly turn: AgentTurn;
	/**
	 * The open thread has a picture and no session left to continue it (#120).
	 *
	 * The binary deletes its own session files after thirty days, so spool's picture
	 * outlives the thing that makes the conversation continuable. Such a thread reads as
	 * finished: the transcript is intact, nothing offers a resume, and the next thing
	 * said starts a new thread rather than failing a resume.
	 */
	readonly finished: boolean;
	/** the agent would not start because nobody is signed in, and the way out of it (#201) */
	readonly login: LoginDeck;
	/** a press on a cell, which reads the thread and moves nothing else */
	readonly onOpen: (id: string) => void;
	/** the ✕ in the flyout: it leaves the column, and neither the session nor the picture goes */
	readonly onClose: (id: string) => void;
	/** the plus that leads the column */
	readonly onNew: () => void;
}

const stillness = () =>
	typeof window !== "undefined" && typeof window.matchMedia === "function"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;

/**
 * One thread's whole runtime.
 *
 * Every field here was a ref or a piece of state in the one-thread hook this replaces.
 * They are fields now because a project has as many of these as somebody starts, and
 * because two things read them that a render cannot: the fire, which happens when a
 * stream closes, and the stop, which has to empty a queue and hand its words back in one
 * act.
 */
interface Live {
	readonly id: string;
	/** everything this thread's earlier turns drew, which is the conversation so far */
	before: readonly AgentEntry[];
	/** the plan the last turn that wrote one left, since a plan is drawn state (#120) */
	heldPlan: AgentPlan | null;
	/**
	 * What happened between turns, which is the log below the last one (#201).
	 *
	 * A check that came back is a moment, and moments go in the log — so a press on
	 * `check again` leaves its one line here rather than on the shelf, where the standing
	 * fact lives. It joins `before` at the next send, behind the turn it followed.
	 */
	after: readonly AgentEntry[];
	/** notes ever left between turns, which is the number that keys them apart */
	noted: number;
	/**
	 * This run's prompt is already in the log above, so the turn draws no second copy.
	 *
	 * True only for the run a held prompt started (#201). They wrote a sentence, pressed
	 * Enter, and the machine said not yet; it went into the log in their voice at that
	 * moment and stayed there. The check sends those same words, and one thing said once
	 * is drawn once.
	 */
	carried: boolean;
	/** the picture as it came off disk, drawn until this thread runs again */
	restored: boolean;
	/** the agent's own session is still there, so the conversation can be continued */
	continuable: boolean;
	/** it landed somewhere nobody was looking, and nobody has looked since */
	unread: boolean;
	/** unix ms of the last thing that happened in it, which is the column's order */
	at: number;
	events: Stamped[];
	started: number;
	abandon: (() => void) | null;
	said: readonly AgentWords[];
	/** climbs per send, which is what re-arms the clock */
	run: number;
	/** the stream is open, written by the stream rather than by a render */
	streaming: boolean;
	ms: number;
	/** the stream is closed and the edge has caught up with it: nothing left to read */
	drained: boolean;
	/**
	 * The time the turn spent waiting on the person, which is time the log never had.
	 *
	 * A question stops the clock. Everything the transcript reads is measured from the
	 * send — a beat's length, the rate a message is paced at — and none of it should
	 * count the seconds somebody spent deciding: the agent is not thinking during them
	 * and nothing is arriving.
	 */
	parked: { total: number; since: number | null };
	/**
	 * The requests nobody has answered yet, and the call each is about.
	 *
	 * The clock runs again the moment the last of them is gone, and that is not the same
	 * as somebody answering: measured, the agent takes the cautious option itself and its
	 * result lands 84ms later. A clock that only ever restarted on an answer would freeze
	 * for the rest of a turn nobody answered, which is the turn every capture records.
	 */
	waitingOn: Map<string, string | null>;
	holding: readonly AgentQueued[];
	handback: AgentHandback;
	/** what the daemon's stop names this turn by, since a stop has no request to quote */
	named: string;
	/** turns started, which is the number a turn's name is made unique by */
	starts: number;
	/** messages ever held, which is the number a take-back aims at exactly one of */
	holds: number;
	/** when its picture was last written down, so a stream throttles its own writes */
	saved: number;
}

function born(id: string, over: Partial<Live> = {}): Live {
	return {
		id,
		before: [],
		after: [],
		noted: 0,
		carried: false,
		heldPlan: null,
		restored: false,
		continuable: false,
		unread: false,
		at: Date.now(),
		events: [],
		started: 0,
		abandon: null,
		said: [],
		run: 0,
		streaming: false,
		ms: 0,
		drained: false,
		parked: { total: 0, since: null },
		waitingOn: new Map(),
		holding: [],
		handback: { count: 0, messages: [] },
		named: "",
		starts: 0,
		holds: 0,
		saved: 0,
		...over,
	};
}

/**
 * A thread as it came off disk, which is the same view as a live one (#120).
 *
 * Nothing is capped and nothing is elided, because the disclosure was never file
 * contents: what was drawn is what was stored, so a restored thread is the entries it
 * had. The one thing that is not identical is what a restart did to it — a thread caught
 * mid-turn is cut where the lights went out, which is derived here because the events
 * that would say it are gone.
 */
function restored(stored: ServedThread): Live {
	// nothing off disk is being paced: the clock its schedule was written against ended
	// with the daemon that held it
	const entries = unpaced(drawableEntries(stored.entries));
	/*
	 * A turn this daemon is still holding is not a cut and not a drawing: it is a stream to
	 * pick back up (#211). What is kept of the picture is everything above the boundary the
	 * rail wrote with it — the conversation, and the words that started the turn — and the
	 * turn itself is refolded from the log rather than taken off disk, so it is never drawn
	 * twice.
	 */
	const before = stored.live ? entries.slice(0, stored.kept) : stored.stopped ? cutPicture(entries) : entries;
	return born(stored.id, {
		before,
		heldPlan: (stored.plan ?? null) as AgentPlan | null,
		restored: true,
		continuable: stored.continuable,
		unread: stored.life === "unread",
		at: stored.at,
		// the words spool was holding when the page went away, which are spool's to hold
		// across one too (#170, #211)
		holding: drawableQueue(stored.queued),
	});
}

/**
 * What this turn draws, which is not always what it sent (#201).
 *
 * A run started by a held prompt draws no words of its own: the sentence is already in the
 * log in the human's voice, from the instant they pressed Enter, and one thing said once
 * is drawn once. It still goes down the wire — the check runs the prompt they wrote, not a
 * retyped proof that they meant it.
 */
function shownOf(thread: Live) {
	return transcriptOf(thread.carried ? [] : thread.said, thread.events);
}

/**
 * What this thread has drawn: every turn before this one, this one so far, and whatever
 * happened after it.
 */
function entriesOf(thread: Live, seen: { entries: readonly AgentEntry[] }): readonly AgentEntry[] {
	const drawn =
		thread.run === 0
			? thread.before
			: thread.before.length === 0
				? seen.entries
				: [...thread.before, ...seen.entries];
	return thread.after.length === 0 ? drawn : [...drawn, ...thread.after];
}

/**
 * How much of the stored picture is not drawn from the live turn's events (#211).
 *
 * The boundary a client picking this turn back up has to cut at. Everything above it came
 * off earlier turns, out of the log between them, or out of what the human said to start
 * this one — and none of that is in the event log, so none of it can be refolded. What
 * sits below it is exactly `transcriptOf`'s fold, which a replay rebuilds whole.
 *
 * The words the turn was started with are above the line rather than below it because the
 * daemon's log does not carry them: the prompt went down stdin and the row was drawn from
 * what the composer captured. A turn started by a held prompt drew none of its own (#201),
 * which is what `carried` says and why the count is the transcript's rather than a
 * constant.
 *
 * Everything, for a thread with no turn running: nothing will be replayed over it, and a
 * picture that claimed a boundary it had no turn for would cut itself short.
 */
function keptOf(thread: Live, shown: { entries: readonly AgentEntry[] }): number {
	if (!thread.streaming) return thread.before.length + shown.entries.length + thread.after.length;
	return thread.before.length + (thread.carried ? 0 : thread.said.length);
}

/**
 * The plan this thread is drawing, which belongs to the turn that wrote it.
 *
 * A thread that is running again draws that turn's; one that only came off disk draws the
 * one it came back with, because a plan is drawn state and so is stored state.
 */
function planOf(thread: Live, shown: { plan: AgentPlan | null }): AgentPlan | null {
	return thread.run === 0 ? thread.heldPlan : shown.plan;
}

/**
 * One finished turn, keyed so it can sit in a log beside the next one.
 *
 * A row's key is the call it is about and a call id is unique in a session, but a beat,
 * a note and the human's own words are numbered inside their turn — so a turn puts its
 * own name in front of every key rather than trusting the wire for uniqueness across a
 * conversation.
 *
 * The token is the turn's own name and not a counter, because a counter restarts with
 * the daemon: a restored conversation already holds turns keyed by the counters of a
 * session that has ended, and its next turn would be numbered over the top of them.
 */
function archive(entries: readonly AgentEntry[], token: string): AgentEntry[] {
	// and it loses its schedule with its clock: the next turn's starts again at zero, and a
	// message read against that one draws as no characters at all
	return unpaced(entries).map((entry) => ({ ...entry, key: `${token}:${entry.key}` }));
}

export function useAgentThreads(project: string): AgentDeck {
	const [still] = useState(stillness);
	const threads = useRef(new Map<string, Live>());
	const [open, setOpen] = useState("");
	/** climbs whenever anything a render reads has moved, which is what redraws the rail */
	const [, bump] = useState(0);
	const redraw = useCallback(() => bump((count) => count + 1), []);
	/** what the column has open, for the stream callbacks that outlive the render */
	const openRef = useRef(open);
	openRef.current = open;
	/**
	 * The usage window, which belongs to the account rather than to a thread (#122).
	 *
	 * One window, however many threads are running: it is the same allowance they are all
	 * spending, so whichever stream says something about it says it for all of them. It
	 * sits out here rather than on a thread for the same reason it is not in a transcript —
	 * a transcript is rebuilt per turn and this outlives every one of them, because a limit
	 * resets on a clock nobody here is holding.
	 */
	const [limit, setLimit] = useState<AgentLimit | null>(null);

	/*
	 * A thread has an id before it has a process, because the id *is* the session id
	 * (#120). Spool mints a uuid, hands it to the binary as its session on the first
	 * turn, and resumes it on every turn after — so the picture and the conversation are
	 * addressed by the same string and the id wins whenever they disagree.
	 */
	const start = useCallback((): Live => {
		const id = crypto.randomUUID();
		const thread = born(id);
		threads.current.set(id, thread);
		return thread;
	}, []);

	/**
	 * The picture, written where a daemon restart cannot reach it (#120).
	 *
	 * It folds the thread itself rather than taking a drawing: every caller wanted the same
	 * three derivations of the same fold, and passing them in meant four places agreeing
	 * about how a thread's life, entries and plan are read.
	 */
	const save = useCallback(
		(thread: Live) => {
			const shown = shownOf(thread);
			const entries = entriesOf(thread, shown);
			// a thread nobody has said anything to is not a conversation yet, and an empty
			// picture on disk would be a tab restored with nothing in it
			if (entries.length === 0) return;
			thread.saved = Date.now();
			void putAgentThread(project, thread.id, {
				ask: askOf(entries),
				life: storedLife(lifeFor(thread, openRef.current, shown)),
				at: thread.at,
				// nothing on disk is being paced: what a reader will see is drawn whole, so the
				// schedule goes rather than sitting there meaning nothing
				entries: unpaced(entries),
				// where the turn in flight begins, so a reader that can pick that turn up keeps
				// the conversation and refolds the rest off the log rather than drawing it twice
				// (#211). Everything, once nothing is running: `keptOf` is the whole rule
				kept: keptOf(thread, shown),
				plan: planOf(thread, shown),
				queued: thread.holding,
			});
		},
		[project],
	);

	/**
	 * The look that reads a thread, wherever the looking happened (#136).
	 *
	 * A press on a cell, and the opening a restore performs on the newest thread it
	 * found: both are somebody looking at it, so both clear the dot. Neither touches the
	 * waiting mark, because nothing about looking answers a question.
	 */
	const read = useCallback(
		(thread: Live) => {
			if (!thread.unread) return;
			thread.unread = false;
			save(thread);
		},
		[save],
	);

	/**
	 * One turn read into a thread, whether this rail started it or found it (#191, #211).
	 *
	 * Both ways in are the same turn seen from different distances, so they are one
	 * function: a send says something and reads the answer from the first event, and an
	 * attach says nothing and reads a turn already in progress from wherever it can. What
	 * differs between them is three lines at the top and which door is opened at the bottom.
	 */
	const run = useCallback(
		(thread: Live, opening: { saying: readonly AgentWords[]; carried: boolean } | { attach: true }) => {
			const attaching = "attach" in opening;
			if (!attaching && opening.saying.length === 0) return;
			thread.abandon?.();
			// the conversation keeps what it has already drawn: a turn replaces the events it
			// is folded from, never the turns before it
			if (thread.run > 0) {
				thread.before = [...thread.before, ...archive(shownOf(thread).entries, thread.named)];
			}
			// and whatever happened between the two of them lands behind the turn it followed
			if (thread.after.length > 0) {
				thread.before = [...thread.before, ...thread.after];
				thread.after = [];
			}
			/*
			 * A turn being picked up draws no words of its own, for #201's reason and a second
			 * one: the human's sentence is already in the picture this thread came back with —
			 * it is the last thing above the boundary the daemon replays from — and the log the
			 * replay rebuilds starts after it.
			 */
			thread.carried = attaching || opening.carried;
			thread.events = [];
			thread.started = Date.now();
			thread.parked = { total: 0, since: null };
			thread.waitingOn = new Map();
			thread.said = attaching ? [] : opening.saying;
			thread.streaming = true;
			thread.run += 1;
			thread.ms = 0;
			thread.drained = false;
			thread.restored = false;
			if (!attaching) {
				thread.starts += 1;
				thread.unread = false;
				thread.at = Date.now();
				// a name of its own, because a stop has no request to quote: it names the turn the
				// hands are looking at rather than whatever this project is running. A turn being
				// picked up already has one, and the daemon says it on the way in
				thread.named = `${Date.now()}-${thread.starts}`;
			}
			/**
			 * How many of the events still to arrive already happened (#211).
			 *
			 * A replay is not an arrival. Everything before this rail attached is stamped at zero
			 * against a clock started long enough ago that all of it is due, which draws it whole
			 * — the same rule a picture off disk is under, and for the same reason: neither of
			 * them is happening now. What arrives after the replay is paced as it always was.
			 */
			let replaying = 0;
			const clock = () =>
				Date.now() -
				thread.started -
				thread.parked.total -
				(thread.parked.since === null ? 0 : Date.now() - thread.parked.since);
			const push = (event: Stamped["event"]) => {
				// the standing window, lifted out of the turn: it was true before this one
				// started and it will still be true after it ends (#122)
				if (event.kind === "limit") setLimit(event.limit);
				// the clock stops on the request and starts again on whatever released it: an
				// answer, the call's own result where nobody answered, or the turn ending under
				// it. The same three the transcript settles a waiting block on
				if (event.kind === "asking") thread.waitingOn.set(event.request, event.call);
				if (event.kind === "answered") thread.waitingOn.delete(event.request);
				if (event.kind === "result") {
					for (const [request, call] of thread.waitingOn) if (call === event.id) thread.waitingOn.delete(request);
				}
				if (event.kind === "ended" || event.kind === "closed") thread.waitingOn.clear();
				if (thread.waitingOn.size > 0) thread.parked.since ??= Date.now();
				else if (thread.parked.since !== null) {
					thread.parked = { total: thread.parked.total + (Date.now() - thread.parked.since), since: null };
				}
				thread.events.push({ at: replaying > 0 ? 0 : clock(), event });
				if (replaying > 0) replaying -= 1;
			};
			/** what the daemon says as the read opens, which is the turn introducing itself */
			const attached = (info: AgentAttached) => {
				if (info.turn !== undefined) thread.named = info.turn;
				replaying = Math.max(0, info.logged - info.from);
				if (replaying > 0) thread.started = Date.now() - REPLAYED_MS;
			};
			const reading: AgentReading = {
				attached,
				event: push,
				/*
				 * The stream is the turn's whole life, so its end has to leave the log saying
				 * why. The daemon ends every turn with a `closed` event; a stream that stops
				 * without one stopped on this side, and the union already has the member for a
				 * process that is gone.
				 */
				end: (error) => {
					if (error !== undefined) push({ kind: "closed", code: null, message: error, parent: null });
					else if (thread.events.at(-1)?.event.kind !== "closed") {
						push({ kind: "closed", code: null, message: "the turn stream ended", parent: null });
					}
					thread.streaming = false;
					thread.at = Date.now();
					// it landed while nobody was looking at it, and a look is the only thing that
					// clears that (#161) — so the flag is set here and read nowhere else
					if (thread.id !== openRef.current) thread.unread = true;
					// the conversation continues under the same id from here, whatever the disk
					// still says about the session that started it
					thread.continuable = true;
					save(thread);
					/*
					 * The queue fires the moment the turn is no longer running (#170).
					 *
					 * Every message at once, in order, as one turn: the binary reads all of them as
					 * the one thing it was asked, so this is a send rather than a run of sends. A
					 * stop never reaches here, because a stop empties the list before the stream can
					 * close — which is the invariant, not a race that happens to fall the right way.
					 */
					const firing = thread.holding;
					if (firing.length > 0) {
						thread.holding = [];
						run(thread, { saying: firing, carried: false });
					}
					redraw();
				},
			};
			thread.abandon = attaching
				? attachAgentTurn(project, thread.id, 0, reading)
				: streamAgentTurn(
						project,
						{
							thread: thread.id,
							turn: thread.named,
							saying: opening.saying.map((words) => ({
								prompt: words.text,
								selection: words.selection,
								attached: words.attached ?? undefined,
							})),
						},
						reading,
					);
			redraw();
		},
		[project, save, redraw],
	);

	const send = useCallback(
		(thread: Live, saying: readonly AgentWords[], carried = false) => run(thread, { saying, carried }),
		[run],
	);

	/*
	 * The threads this project already has, read once on the way in (#120).
	 *
	 * Resuming restores the agent's memory for free and emits zero history, so the rail
	 * is spool's problem or nobody's: what comes back here is the drawing spool wrote,
	 * and it is the whole of what a restored thread is. A project with none opens on one
	 * fresh thread, which is what the rail has always shown.
	 */
	useEffect(() => {
		let gone = false;
		void fetchAgentThreads(project).then((stored) => {
			if (gone) return;
			for (const one of stored) {
				if (threads.current.has(one.id)) continue;
				const thread = restored(one);
				threads.current.set(one.id, thread);
				/*
				 * A turn still running here is picked up rather than drawn (#211).
				 *
				 * This is the whole of what a refresh costs now: the daemon held the turn, the log
				 * is replayed into a fold that rebuilds what was on screen, and the rest arrives
				 * as it always would have. It happens for every live thread and not only the one
				 * the column opens on, because they were all still working while the page was
				 * away — which is the same promise #192 made about looking at another thread.
				 */
				if (one.live) run(thread, { attach: true });
			}
			// the row opens on something either way, so this only ever runs before it has:
			// a project with nothing stored gets one fresh thread, which is what the rail
			// has always shown
			if (openRef.current !== "") return;
			// newest first, which is the column's own order: the one you were most likely
			// reading is the one it opens on, and opening it is what reads it
			const newest = [...threads.current.values()].sort((one, two) => two.at - one.at)[0];
			if (newest === undefined) {
				setOpen(start().id);
				return;
			}
			read(newest);
			setOpen(newest.id);
			redraw();
		});
		return () => {
			gone = true;
		};
	}, [project, start, read, redraw, run]);

	/*
	 * One clock for every thread, and the one thing that stops each of them.
	 *
	 * It runs under reduced motion too, which is not a contradiction: the tick is what
	 * puts arriving events on screen, and the pace is what `elapsed` decides. Stopping
	 * the tick would leave a still-preferring reader looking at their own sentence and
	 * nothing else until the process exited, then the whole turn at once.
	 *
	 * It outlives a stream on purpose: the pace is up to 0.8s behind the wire, so the
	 * last words of a message arrive after the process has gone. A thread stops ticking
	 * when its edge has reached the end of every message, which is the only moment at
	 * which there is nothing left to draw.
	 */
	useEffect(() => {
		const timer = setInterval(() => {
			let moved = false;
			for (const thread of threads.current.values()) {
				if (thread.run === 0 || thread.drained) continue;
				moved = true;
				const now =
					Date.now() -
					thread.started -
					thread.parked.total -
					(thread.parked.since === null ? 0 : Date.now() - thread.parked.since);
				thread.ms = now;
				if (thread.streaming) {
					// a turn in flight writes itself down on a throttle, so what a restart costs is
					// bounded by SAVE_MS rather than by the length of the turn
					if (Date.now() - thread.saved >= SAVE_MS) {
						save(thread);
					}
					continue;
				}
				const { entries } = shownOf(thread);
				if (
					entries.some(
						(entry) => entry.kind === "prose" && !fullyShown(entry, still ? Number.POSITIVE_INFINITY : now),
					)
				)
					continue;
				thread.drained = true;
			}
			if (moved) redraw();
		}, TICK_MS);
		return () => clearInterval(timer);
	}, [still, save, redraw]);

	/*
	 * Every read belongs to the canvas that opened it: navigating away drops all of them,
	 * and takes no turn with it (#211).
	 *
	 * Which is the point. A refresh, a lid, a tab closed by accident — the daemon holds
	 * what was running, and the next page attaches to it and carries on. The one exit that
	 * still stops a turn is a hand: the stop button, or closing the thread it belongs to.
	 */
	useEffect(() => {
		const held = threads.current;
		return () => {
			for (const thread of held.values()) thread.abandon?.();
		};
	}, []);

	const here = threads.current.get(open) ?? born(open);
	const seen = shownOf(here);
	const phase = phaseOf(here, seen);
	const entries = entriesOf(here, seen);
	/*
	 * The column, in recency order, fixed once (#136, #205).
	 *
	 * Newest at the top and it stays there, so the one you are reading is the one you can
	 * always see. A column that re-sorted as its threads worked would move a cell out from
	 * under a cursor already reaching for it, which is why the order reads `at` — the last
	 * time something happened in the thread — and never a life.
	 *
	 * Each thread is folded once here and read three times: for its name, for its mark and
	 * for the line the flyout shows. The fold is the only way to know any of them — what a
	 * thread wrote, what its turn is doing and what it did last all live in the events.
	 */
	const column: readonly Thread[] = [...threads.current.values()]
		.sort((one, two) => two.at - one.at)
		.map((thread) => {
			const shown = thread.id === open ? seen : shownOf(thread);
			const drawn = thread.id === open ? entries : entriesOf(thread, shown);
			return {
				id: thread.id,
				name: nameOf(drawn),
				life: lifeFor(thread, open, shown),
				at: thread.at,
				last: lastOf(drawn),
			};
		});

	const hold = useCallback(
		(thread: Live, waiting: readonly AgentQueued[]) => {
			thread.holding = waiting;
			redraw();
		},
		[redraw],
	);

	/** the one exit both the stop and a take-back go through, so they cannot diverge */
	const handBack = useCallback(
		(thread: Live, going: readonly AgentQueued[]) => {
			if (going.length === 0) return;
			thread.handback = { count: thread.handback.count + 1, messages: going };
			redraw();
		},
		[redraw],
	);

	/**
	 * What the hands said, into whichever thread is in front of them.
	 *
	 * A thread whose session has aged out takes the words into a new one instead. Its
	 * picture is intact and worth reading, and the agent it was talking to is gone — so
	 * carrying on in it would be a conversation with something that does not remember
	 * having had it.
	 */
	const say = useCallback(
		(text: string, sent: AgentSent = {}) => {
			const thread = threads.current.get(openRef.current);
			if (thread === undefined) return;
			if (thread.restored && !thread.continuable) {
				const fresh = start();
				setOpen(fresh.id);
				send(fresh, [{ text, ...sent }]);
				return;
			}
			send(thread, [{ text, ...sent }]);
		},
		[send, start],
	);

	const onOpen = useCallback(
		(id: string) => {
			const thread = threads.current.get(id);
			if (thread === undefined) return;
			read(thread);
			setOpen(id);
		},
		[read],
	);

	const onClose = useCallback(
		(id: string) => {
			const thread = threads.current.get(id);
			if (thread === undefined) return;
			/*
			 * Closing a thread is a tidy rather than a delete (#136).
			 *
			 * It leaves the column, and neither the agent's own session nor spool's stored
			 * picture goes with it. What does stop is the turn, because a tab nobody can
			 * reach must not go on holding a process the hands cannot see.
			 *
			 * Both halves are said out loud now that a turn outlives the read of it (#211):
			 * letting go of the stream used to take the process with it, and letting go is now
			 * only letting go. So the turn is stopped the way the stop button stops one — a
			 * request the binary survives and ends itself on — and then the read is dropped.
			 */
			if (thread.streaming) void interruptAgentTurn(project, thread.named);
			thread.abandon?.();
			threads.current.delete(id);
			void closeAgentThread(project, id);
			if (openRef.current === id) {
				const newest = [...threads.current.values()].sort((one, two) => two.at - one.at)[0];
				setOpen((newest ?? start()).id);
			}
			redraw();
		},
		[project, start, redraw],
	);

	const onNew = useCallback(() => setOpen(start().id), [start]);

	/**
	 * One line in the log for a moment that happened between two turns (#201).
	 *
	 * `rule` is what tells the two apart, on the transcript's own test. A login spool has
	 * started using is a boundary across the log — above it nothing could run, below it
	 * everything can — and a check that came back with the answer it had is only itself, so
	 * it sits where it fell. The second one does not stack: the third press of a button
	 * that keeps saying the same thing must leave one line saying it, not three.
	 */
	const note = useCallback(
		(thread: Live, text: string, rule = true) => {
			const last = thread.after.at(-1);
			if (!rule && last?.kind === "note" && last.text === text) return;
			thread.noted += 1;
			thread.after = [...thread.after, { key: `login-${thread.noted}`, kind: "note", text, rule }];
			thread.at = Date.now();
			save(thread);
			redraw();
		},
		[save, redraw],
	);

	/**
	 * Which thread a check is out for, rather than whether one is.
	 *
	 * One at a time, because a login is a fact about the machine and asking it twice at
	 * once would be asking the same question twice — but the strip that says `looking` is
	 * the strip that was pressed, so switching thread mid-check does not put another
	 * thread's strip in a state nobody asked it for.
	 */
	const [checkingOn, setCheckingOn] = useState<string | null>(null);
	/**
	 * Ask again, and run what was already said (#201).
	 *
	 * The press asks the binary whose login it is — one local process, no session and no
	 * token — because that is the only honest instrument: the alternative is reading the
	 * agent's own credential files, which is spool parsing a private format it does not own.
	 *
	 * On a yes it names the account, once, at the moment spool starts using it, and then
	 * sends the prompt that bounced. Nobody retypes a sentence to prove they meant it, and
	 * the turn draws no second copy of it because the first one is still up there in their
	 * own voice. On a no it says so and leaves one quiet line, because a press that leaves
	 * no mark reads as a broken button.
	 */
	const check = useCallback(() => {
		if (checkingOn !== null) return;
		// the thread the press was made on, held across the ask: a check answered after
		// somebody switched away must not leave its line, or its re-send, in another
		// conversation's log
		const thread = threads.current.get(openRef.current);
		if (thread === undefined) return;
		setCheckingOn(thread.id);
		void fetchAgentLogin(project).then((login) => {
			setCheckingOn(null);
			if (login?.signedIn !== true) {
				note(thread, STILL_OUT, false);
				return;
			}
			note(thread, signedInAs(login.account));
			// the held prompt is the words the bounce was about, which the thread still has
			if (thread.said.length > 0) send(thread, thread.said, true);
		});
	}, [project, checkingOn, note, send]);

	return {
		threads: column,
		open,
		finished: here.restored && !here.continuable,
		// the standing fact, off the turn that ran: it goes the instant a turn does not
		// bounce, and comes back on the refusal of one that does
		login: { out: bounced(seen.entries), checking: checkingOn === open, check },
		onOpen,
		onClose,
		onNew,
		turn: {
			entries,
			writes: seen.writes,
			plan: planOf(here, seen),
			phase,
			elapsed: still || here.drained ? Number.POSITIVE_INFINITY : here.ms,
			send: say,
			answer: useCallback(
				(request: string, reply: AgentReply) => {
					// nothing is drawn from the reply here: the daemon pushes an `answered` down
					// the stream when it reaches the process, so one fold still draws the log
					void answerAgentTurn(project, request, reply);
				},
				[project],
			),
			queued: here.holding,
			queue: useCallback(
				(text: string, sent: AgentSent = {}) => {
					const thread = threads.current.get(openRef.current);
					if (thread === undefined) return;
					thread.holds += 1;
					hold(thread, [...thread.holding, { id: `held-${thread.holds}`, text, ...sent }]);
				},
				[hold],
			),
			unqueue: useCallback(
				(id: string) => {
					const thread = threads.current.get(openRef.current);
					if (thread === undefined) return;
					const going = thread.holding.filter((one) => one.id === id);
					if (going.length === 0) return;
					hold(
						thread,
						thread.holding.filter((one) => one.id !== id),
					);
					handBack(thread, going);
				},
				[hold, handBack],
			),
			stop: useCallback(() => {
				const thread = threads.current.get(openRef.current);
				if (thread === undefined) return;
				// the queue goes first and unconditionally: whether or not there is still a
				// process to ask, a stop is one act and the words it cancels come back
				const going = thread.holding;
				hold(thread, []);
				handBack(thread, going);
				void interruptAgentTurn(project, thread.named);
			}, [project, hold, handBack]),
			handback: here.handback,
			limit,
		},
	};
}

/**
 * A thread waiting on a person, which is three causes and one mark (#161).
 *
 * A parked question and a waiting approval are both the turn parked on a request, which
 * is `asking`. A signed-out bounce is the third, and it is read off the log because that
 * is where the refusal lands. A usage wind-down is none of them: the agent is told to
 * finish and does.
 *
 * Off the turn that ran rather than off the conversation (#201). A bounce is true until it
 * stops being true, and what says it stopped is the next turn coming back clean — so a
 * thread that recovered draws no mark, where reading the whole log would keep the archived
 * refusal saying *stuck* for as long as the thread lived.
 */
function stuck(phase: TurnPhase, entries: readonly AgentEntry[]): boolean {
	return phase === "asking" || bounced(entries);
}

/** what one thread's turn is doing, which is the same reading wherever it is asked for */
function phaseOf(thread: Live, shown: { asking: string | null }): TurnPhase {
	if (thread.run === 0) return "idle";
	if (shown.asking !== null) return "asking";
	return thread.streaming ? "playing" : "settled";
}

/** one thread's mark, off its own fold */
function lifeFor(thread: Live, open: string, shown: { entries: readonly AgentEntry[]; asking: string | null }): Life {
	const phase = phaseOf(thread, shown);
	return lifeOf({
		phase,
		open: thread.id === open,
		unread: thread.unread,
		stuck: stuck(phase, shown.entries),
	});
}
