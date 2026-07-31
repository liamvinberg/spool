import type { Attachment } from "../../attachment";
import type { AgentEvent, AgentLimit } from "../../daemon/agent-events";
import type { SelectionEntry } from "../../daemon/selection";
import { ASK_TOOL, type AskQuestion, questionsOf } from "./agent-ask";
import { limitNote } from "./agent-limit";
import {
	type CallInput,
	type CallName,
	drawsOwnRow,
	nameCall,
	type RowForeign,
	readProse,
	taskMoved,
	taskWritten,
} from "./agent-nouns";
import { drawnBy, type Landed } from "./agent-pace";
import { LOGIN_REMEDY, NO_KEY, signedOut } from "./agent-preflight";

/**
 * The transcript, projected from the event union the daemon streams (#191, #192,
 * #193).
 *
 * The rail renders these and nothing else: the human's words, the agent's words,
 * one line per tool call, the receipt a request out leaves behind, the plan, and
 * spool's own word for a turn that did not end cleanly. Chips and
 * threads are later tickets and this projection does not pretend to them — an event
 * it does not draw is dropped rather than guessed at, because `stream-json`
 * publishes no stability guarantee and a rename must cost a blank row rather than a
 * turn.
 *
 * It is a fold over every event seen so far rather than an incremental reducer, so
 * the transcript is a pure function of the wire and of the clock. That is what lets
 * the drawn edge of an arriving message be computed rather than accumulated: the
 * same events and the same millisecond give the same screen however the frames
 * happened to run.
 *
 * A sub-agent's words are skipped and its work is not. Its own turns reach the
 * parent stream tagged with their parent call, and a delegate's prose belongs to
 * the delegate — but the frames it writes are out on the canvas, which is why its
 * rows reach the transcript at all (#143). They reach it inside the row that
 * delegated them, where the thread's own reading of what it wrote can walk them:
 * a fan-out is three lines and what each of them is doing now, because a delegate
 * draws as its own live step and never as a page of its calls (#194).
 */

/**
 * How a row is going.
 *
 * Three of them settle it, and a stop is none of the other two: a call the developer
 * stopped did not succeed and did not fail, so it takes neither of their marks.
 * `StateMark` in `agent-rail.tsx` is where they are drawn and argued.
 *
 * `pending` is written down and not started, which the work rows never are: a call is
 * running from the moment its block opens, because the model writing its arguments is
 * the call happening. It is here for the plan's own tasks (#194), which are the one
 * list in this rail that exists before anything runs.
 */
export type RowState = "pending" | "running" | "done" | "failed" | "stopped";

/**
 * How a request that is out is going (#212).
 *
 * Three of the five, and the two it leaves out are the two a wait cannot reach. Nothing
 * about a request out is `pending`, because a request exists from the moment it goes —
 * there is no writing-it-down beat the way the plan's tasks have one. And it cannot
 * fail: what comes back is an answer or the turn is over, and a turn that ends under a
 * request out was cut rather than errored, which is the distinction `stopped` already
 * carries for a call the wire never answered.
 */
export type WaitState = Extract<RowState, "running" | "done" | "stopped">;

/**
 * How long something took, in the log's own words.
 *
 * Tenths under ten seconds, because the range this is read in is the wait before a
 * first token and every one of those is under four: 878ms to 4,043ms across the 50
 * measured, median 1,970, so a whole second would round most of them to the same two
 * numbers. Whole seconds above ten, where a tenth is noise, and minutes above sixty,
 * where the count stops being a number anybody reads as a duration.
 */
export function duration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "";
	if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
	const whole = Math.round(ms / 1000);
	if (whole < 60) return `${whole}s`;
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * How a waiting request is going (#145, #162).
 *
 * Six, and five of them are endings, because the ways out of a question are not
 * variations on one another. `arriving` is the call still writing itself, which is
 * the same first beat every tool call gets and is not yet answerable. `open` is the
 * one state that draws controls, and it is what parks the turn.
 *
 * `dismissed` and `dropped` are opposites and must never look alike: the first is a
 * bare deny, where the agent is told to stop and wait, and the second is the empty
 * answer, where the agent read the silence and picked for itself. Measured, it thinks
 * for five beats and carries on with the cautious option.
 */
export type AskState = "arriving" | "open" | "allowed" | "always" | "denied" | "answered" | "dropped";

/**
 * A picture a call handed back, inline (#117).
 *
 * A screenshot comes back as a base64 image block of roughly 150 KB, which has two
 * consequences and they pull in opposite directions: the rail can draw the picture
 * with no second fetch, and it must never let those bytes reach a log line. So they
 * live here, one field down from the row, behind the disclosure — and the row's own
 * `frame` and `detail` are what say which frame it is a picture of.
 *
 * A screenshot does not earn a place off the line the way the plan does: it is fixed
 * at the one moment it was taken, so nothing about it goes on changing after the call
 * that produced it.
 */
export interface AgentShot {
	readonly media: string;
	readonly data: string;
}

/**
 * One tool call, one line (#117, #193).
 *
 * The line is the receipt and the disclosure is the payload, which is why `detail`
 * is a field of its own rather than a longer subject: the row says `read cart` and
 * the path is one click down, closed by default, and nobody has to open it.
 *
 * Three beats, and the wire sends all three. `verb` is there the moment the block
 * opens, because a tool call exists before its arguments do; `subject` is null
 * until the argument that names it has finished arriving; and `state` runs until a
 * result settles it. A row cut mid-argument therefore draws as a bare verb with no
 * subject, which needed no special case.
 *
 * `count` is how many calls this one row holds — consecutive writes to one frame
 * are one row and the count climbs live (#135). It is separate from the subject
 * because the two are different objects: the name is a place and the count is how
 * many times the agent went at it, so anything that treats the name as somewhere
 * to go has to be able to leave the count out of it.
 */
export interface AgentRow {
	readonly key: string;
	readonly kind: "row";
	readonly state: RowState;
	readonly verb: string;
	readonly subject: string | null;
	readonly frame: string | null;
	readonly count: number;
	readonly detail: string | null;
	/**
	 * What a delegate this call launched is doing right now (#194).
	 *
	 * Status rather than payload, which is why it is not `detail`: a payload is a fact
	 * about the call that keeps for as long as the row does, and this is true only while
	 * it is being said. It replaces rather than appends, and it goes the moment the task
	 * lands — a finished delegate is one line, and what it produced is out on the canvas.
	 */
	readonly step: string | null;
	/** the picture this call handed back, which is the payload of its line (#117) */
	readonly shot: AgentShot | null;
	readonly foreign: RowForeign | null;
	/** the delegating call this row came from, or null on the human's own thread */
	readonly parent: string | null;
	/**
	 * The rows a delegate this call launched has drawn (#194).
	 *
	 * They are here for what reads a thread rather than for the log, which draws the
	 * delegate's live step and never its calls: a fan-out of five sub-agents is sixty
	 * rows nobody asked for, and the frames they wrote are on the canvas either way
	 * (#143). What still needs them is the thread's own account of what it wrote — a
	 * delegate's writes are the thread's writes.
	 */
	readonly delegated: readonly AgentRow[];
}

/**
 * How one task of the plan is going.
 *
 * Narrower than a row's, and the narrowing is the point: a task is written down before
 * it starts, so `pending` is reachable here and nowhere else — and nothing about a plan
 * fails or is stopped, because a task is an intention rather than a call.
 */
export type TaskState = Extract<RowState, "pending" | "running" | "done">;

/**
 * One task of the plan, in whichever of the agent's two phrasings its state calls for.
 *
 * Named apart from the runtime's own `task-started`/`task-done`, which are a delegate's
 * task and a different object: one is something the agent wrote down, the other is
 * something it handed off.
 */
export interface AgentPlanTask {
	readonly key: string;
	readonly name: string;
	readonly state: TaskState;
}

/**
 * The plan, off the line and onto the shelf (#117, #194).
 *
 * It is the one thing a turn produces that goes on changing after the call that made
 * it: written in nine seconds, then updated over the next eight to nine minutes
 * across seventeen to twenty-eight rows, so a log both buries it and loses it. What
 * the strip draws is one line of it — a count and whatever is running — and the list
 * is one click down.
 *
 * Every word of it is the agent's own. A `TaskCreate` ships both phrasings, the
 * written `subject` and the present-participle `activeForm`, precisely so that a
 * surface never has to invent a friendlier one.
 */
export interface AgentPlan {
	readonly total: number;
	readonly done: number;
	/** the agent's own present-participle phrasing for whatever is running */
	readonly running: string | null;
	readonly tasks: readonly AgentPlanTask[];
}

export type AgentEntry =
	/**
	 * What the human said, in the log the instant they said it — and under it, what
	 * was sent with the words (#116).
	 *
	 * `context` is exactly what the chip strip said at rest, captured when Enter was
	 * pressed: no more, because the strip is the promise that was made, and no less,
	 * because a turn nobody can audit is a turn nobody can trust. `attached` is the
	 * reference that rode along, which is the one thing a line of mono cannot audit,
	 * so the receipt for it is the picture itself.
	 */
	| {
			readonly key: string;
			readonly kind: "user";
			readonly text: string;
			readonly context: string | null;
			readonly attached: Attachment | null;
	  }
	/**
	 * One block of the agent's prose.
	 *
	 * `full` is every character that has arrived and `landed` is when each delta
	 * landed, which is what the pace reads. Its last entry is therefore how much the
	 * schedule can ever deliver, which is what tells a caller the edge has caught up;
	 * an empty schedule is a message that never streamed and is drawn whole.
	 *
	 * `settled` marks the block the settled assistant message has confirmed: the
	 * deltas are a preview and this is the authority, so a stream that dropped a
	 * fragment is corrected rather than left short.
	 */
	| {
			readonly key: string;
			readonly kind: "prose";
			readonly full: string;
			readonly landed: readonly Landed[];
			readonly settled: boolean;
	  }
	| AgentRow
	/**
	 * A request out, as a receipt the log keeps (#212).
	 *
	 * It draws in the row's own grammar — a mark, a verb, and a number — because that is
	 * the grammar this log already has for a thing that took time. What it says is a
	 * duration and nothing else, and that is not a shortfall: the wire carries no thought
	 * at all. `AgentThinking` has a token count and no prose, and every thinking field in
	 * every capture is the empty string (upstream `claude-code#20127`), so a line pretending
	 * to a thought would be inventing one.
	 *
	 * It opens on the wire's own `waiting` rather than on the thinking block, which is what
	 * makes the number worth drawing: opened on the block it read `thinking 0.0s`, because
	 * only 2 of 36 thinking blocks in the captures are substantial.
	 *
	 * It closes on the first thing the log draws, and not on the first thing on the wire
	 * (#231). Both anchors agree on a plain answer, where the time to first token is the
	 * whole wait — 878ms to 4,043ms across the 50 measured, exactly the range in which a
	 * rail with no readout reads as stopped. They come apart on a reasoning one, where the
	 * message starts with a thought and so starts at once: the wire anchor put `0.0s` on
	 * the line and then went quiet for as long as the model reasoned, which is the one case
	 * the receipt exists for. What it measures now is the silence, whatever fills it.
	 *
	 * Nothing is ever spliced out. It enters with the rest of the turn and stays, so an
	 * answer landing moves nothing above it, and a transcript read back an hour later still
	 * says where the time went. That is the whole difference between this and the beat
	 * `b4aef45` deleted, which was the one entry this log ever removed.
	 *
	 * `at` is on the turn's own clock and `ms` is null only while the request is still out,
	 * which is the one condition under which a reader has to count for itself. Every way a
	 * turn can end settles it, so nothing that reaches disk is still counting.
	 */
	| {
			readonly key: string;
			readonly kind: "wait";
			readonly state: WaitState;
			/** when the request went out, in milliseconds from the turn's send */
			readonly at: number;
			/** how long until the answer began, or null while it has not */
			readonly ms: number | null;
	  }
	/**
	 * The turn waiting on the person, and what it is waiting for (#121, #145, #162).
	 *
	 * One entry for two things, because the wire is one channel: an approval leads with
	 * the agent's written description and offers spool's own three answers, and the
	 * agent's own question leads with its questions and offers the agent's. What tells
	 * them apart is `question`, off the flag the request carries, and never the presence
	 * of a drawable option list: a payload spool could not read is still a question, and
	 * allowing one with its arguments untouched is the empty answer spool never sends.
	 *
	 * Nothing permanent is added to the rail by answering one. The question is a
	 * sentence the agent wrote, so it is drawn where the agent's sentences are drawn,
	 * and the answer is a sentence the person chose, so it lands in the shape the rail
	 * already gives the person's words. The option list is the only new geometry and it
	 * exists only while nobody has answered.
	 */
	| {
			readonly key: string;
			readonly kind: "ask";
			/** the control request an answer names; null until the request itself lands */
			readonly request: string | null;
			/** the agent's own question rather than an approval to run something */
			readonly question: boolean;
			/** the agent's own sentence: its written description, or its question so far */
			readonly asked: string | null;
			/** its questions and their options, once the whole call has landed */
			readonly questions: readonly AskQuestion[];
			/** an "always" is on offer, because the request suggested a rule for one */
			readonly always: boolean;
			readonly state: AskState;
			/** the person's own words, once they have said them */
			readonly words: string | null;
	  }
	/**
	 * Spool's own word, drawn as a rule across the log.
	 *
	 * A boundary rather than a reply: everything above it happened and nothing below
	 * it did. A clean turn gets none — the log is receipts, and "it worked" is not
	 * one.
	 *
	 * `rule` is the exception, and #201 is what earned it: the remedy under a
	 * refusal is not a boundary, it is a thing to read and do, so it sits where it
	 * fell in the quiet mono the composer's own hints use. Absent is a rule, because
	 * every note before it was a boundary and a stored one carries no flag.
	 */
	| {
			readonly key: string;
			readonly kind: "note";
			readonly text: string;
			/** the line above the note's own, in the weight that says it is the thing to do */
			readonly said?: string;
			readonly rule?: boolean;
	  };

/** every kind the union has, as the one runtime list of it (see `drawableEntries`) */
const KINDS: ReadonlySet<string> = new Set(["user", "prose", "row", "wait", "ask", "note"]);

/**
 * Entries from outside this fold, as things this rail can draw (#120, #200).
 *
 * A thread comes back off disk carrying the drawing spool wrote, and spool's store keeps
 * it opaque on purpose: the vocabulary is this module's, and a second parser for it down
 * there is exactly what storing the drawing avoided. So this is the floor under a file a
 * person can open in an editor rather than a validator — an entry with a kind the renderer
 * has no branch for would fall through every one of them, and one hand-edited thread must
 * not take the canvas with it.
 */
export function drawableEntries(entries: readonly unknown[]): AgentEntry[] {
	return entries.filter((entry): entry is AgentEntry => {
		if (typeof entry !== "object" || entry === null) return false;
		const one = entry as { key?: unknown; kind?: unknown };
		return typeof one.key === "string" && typeof one.kind === "string" && KINDS.has(one.kind);
	});
}

/**
 * The same entries with nothing left to pace (#149, #200).
 *
 * A message's schedule is a fact about one clock, and a clock belongs to one turn: it is
 * milliseconds from that turn's send. So the moment an entry leaves its own turn — into
 * the turns a conversation has already had, or onto disk — the schedule means nothing, and
 * reading it against a clock that starts again at zero draws the message as no characters
 * at all. Dropping it is what `shownBy` already documents for a block that never streamed:
 * a message with no schedule is drawn whole.
 *
 * A receipt still counting is the same fact about the same clock (#212). A turn saves
 * itself on a throttle while it runs, so a request that was out when the lights went out
 * reaches disk with no total on it — and left running it would turn forever and count up
 * from a zero that is not its own. It stops here, taking the word every call the wire
 * never answered takes, and says no number rather than a wrong one: what it knows is that
 * the request went out, and how long it took is a thing nobody ever found out.
 */
export function unpaced(entries: readonly AgentEntry[]): AgentEntry[] {
	return entries.map((entry) => {
		if (entry.kind === "prose" && entry.landed.length > 0) return { ...entry, landed: [], settled: true };
		if (entry.kind === "wait" && entry.state === "running") return { ...entry, state: "stopped" as const };
		return entry;
	});
}

/** one event and the millisecond it reached the client, measured from the send */
export interface Stamped {
	readonly at: number;
	readonly event: AgentEvent;
}

export interface Transcript {
	readonly entries: readonly AgentEntry[];
	/** the plan the turn wrote, or null until it writes one — most turns never do */
	readonly plan: AgentPlan | null;
	/** the turn is over: nothing more is coming down this stream */
	readonly over: boolean;
	/**
	 * The request the turn is parked on, or null while nothing waits on anybody.
	 *
	 * The one state in this rail that waits on the person rather than being watched by
	 * them, which is why it is a field rather than something read back out of the
	 * entries: it stops the clock, and it changes what Enter in the composer means.
	 */
	readonly asking: string | null;
	/**
	 * The last usage window the binary said anything about, or null across a whole
	 * session where it said nothing — which is most of them (#122).
	 *
	 * A field rather than an entry, because it is not a thing that happened: it is true
	 * across the turn, it was true before the turn, and it will still be true tomorrow.
	 * The one thing the log draws about it is the wind-down, which is a moment.
	 */
	readonly limit: AgentLimit | null;
}

/**
 * How much of one block is on screen at `elapsed`, and the one place that rule
 * lives.
 *
 * The renderer and the clock both need it and they must not disagree: if the clock
 * thought a block could still grow when the renderer had already drawn all of it,
 * the tick would never stop. A block with no schedule never streamed and is drawn
 * whole; anything else is what the pace has spent, bounded by the text there is.
 */
export function shownBy(entry: Extract<AgentEntry, { kind: "prose" }>, elapsed: number): number {
	if (entry.landed.length === 0) return entry.full.length;
	return Math.min(entry.full.length, drawnBy(entry.landed, elapsed));
}

/** the whole message is on screen: nothing about this block is still arriving */
export function fullyShown(entry: Extract<AgentEntry, { kind: "prose" }>, elapsed: number): boolean {
	// against what the schedule can ever deliver rather than against the text, because
	// a `said` shorter than its own deltas leaves an edge the pace can never reach
	const deliverable = Math.min(entry.full.length, entry.landed[entry.landed.length - 1]?.upto ?? entry.full.length);
	return shownBy(entry, elapsed) >= deliverable;
}

interface Prose {
	key: string;
	full: string;
	landed: Landed[];
	settled: boolean;
}

/** a waiting request, from the call that opens it to whatever ends it */
interface Ask {
	readonly key: string;
	request: string | null;
	question: boolean;
	asked: string | null;
	questions: readonly AskQuestion[];
	always: boolean;
	state: AskState;
	words: string | null;
}

/** nobody has answered it and it is still there to answer, which is what parks a turn */
const unanswered = (ask: Ask) => ask.state === "open" || ask.state === "arriving";

interface Row {
	key: string;
	state: RowState;
	verb: string;
	subject: string | null;
	frame: string | null;
	count: number;
	detail: string | null;
	step: string | null;
	shot: AgentShot | null;
	foreign: RowForeign | null;
	parent: string | null;
}

/** one request out, from the moment it goes to whatever the answer turns out to start with */
interface Wait {
	readonly key: string;
	readonly at: number;
	state: WaitState;
	ms: number | null;
}

/**
 * One task of the plan, as the call that wrote it phrased it twice.
 *
 * `subject` is the written form the list reads in and `running` is the present
 * participle the strip reads in while the task is the one in flight. Both are the
 * agent's own words, which is the whole point of carrying two: the rail never has to
 * invent a friendlier phrasing for a task in progress.
 */
interface PlanTask {
	readonly key: string;
	readonly subject: string;
	readonly running: string | null;
	state: TaskState;
}

/**
 * One tool block, from the moment it opens to the moment its result lands.
 *
 * It holds the fragments because the arguments arrive as partial JSON that splits
 * mid-token, and the row because the same block is what a later fragment, the whole
 * call and the result all have to find their way back to.
 */
interface Block {
	readonly id: string | null;
	readonly tool: string;
	/** the delegate this call belongs to, or "" on the human's own thread */
	readonly thread: string;
	fragments: string;
	row: Row | null;
	/** the last name spool had for it, which is what an empty search's row is built from */
	named: CallName | null;
	/** it joined the open run, so the count is the whole of what it adds */
	joined: boolean;
	/** the whole call has landed, so a stray fragment cannot take its arguments back */
	settled: boolean;
}

/**
 * A run of writes to one frame, still open (#135).
 *
 * `settle` is what the last member's result said, held rather than applied: while
 * the run can still gain a call the row is working, so the mark settles once — when
 * the run closes — rather than striking a check between every pair of edits.
 */
interface Run {
	readonly row: Row;
	/** the frame the run is about, or the path where it is a file that is not one */
	readonly name: string;
	settle: RowState | null;
}

/**
 * What a result says about the call it answers.
 *
 * The wire cannot tell a stop from a permission denial by the error alone, because
 * both stamp the same denial kind. The field that separates them is the
 * non-execution kind — `user-rejected` is the developer, whether they pressed stop
 * or dismissed a question, and a rule refusing the call is a fault the agent ran
 * into — and its absence means the tool ran to completion, so the error is the
 * tool's own.
 */
function settledBy(result: Extract<AgentEvent, { kind: "result" }>): RowState {
	if (!result.failed) return "done";
	return result.nonExecution === "user-rejected" ? "stopped" : "failed";
}

/**
 * What a delegate's own turn contributes: its work, and never its words.
 *
 * A sub-agent's turns reach the parent stream tagged with the call that delegated
 * them. Its prose belongs to the delegate rather than to the conversation the human
 * is having — but the frames it writes land on the canvas, and a row is how you get
 * to one (#143). Anything the
 * union gains later is a word until somebody says otherwise, which is the safe way
 * round.
 */
const DELEGATED: ReadonlySet<AgentEvent["kind"]> = new Set(["call", "call-input", "called", "result"]);

/**
 * The events that mean the request came back.
 *
 * Read off every one of them rather than off `speaking` alone, because `speaking` is
 * one runtime's signal and the union has to survive a thinner one: an answer that
 * starts by calling something is still an answer.
 */
const ANSWERS: ReadonlySet<AgentEvent["kind"]> = new Set([
	"call",
	"called",
	"result",
	"task-started",
	"task-step",
	"task-done",
]);

/**
 * What went out with the words, as the composer captured it at Enter (#116, #119,
 * #170).
 *
 * Held rather than derived, because the strip may have moved since: a turn is a
 * record of the moment it was sent, and the selection is a live thing. That is a
 * nicety for a message that goes out on the press that made it and the whole of the
 * contract for one the queue held, which fires minutes later against a canvas the
 * hands have moved on from.
 */
export interface AgentSent {
	/** exactly what the chip strip said at rest, which is the line the log keeps */
	readonly context?: string | null;
	readonly attached?: Attachment | null;
	/** the entries those chips were drawn from, which are the bytes that go out */
	readonly selection?: readonly SelectionEntry[] | undefined;
}

/**
 * One thing the human said, and what rode with it.
 *
 * A turn's head is a list because a queue fires as one turn (#170): every message
 * spool held goes out together, in the order it was said in, and each of them is a
 * row of the log rather than one blob nobody typed.
 */
export interface AgentWords extends AgentSent {
	readonly text: string;
}

export function transcriptOf(said: readonly AgentWords[], seen: readonly Stamped[]): Transcript {
	const prose = new Map<string, Prose>();
	const rows = new Map<string, Row>();
	/** every waiting request by its own key, which is the call it is about */
	const asks = new Map<string, Ask>();
	/** which ask a control request and a call answer to, since the two arrive apart */
	const askOf = new Map<string, string>();
	/** every request that has gone out, by the slot it opened in */
	const waits = new Map<string, Wait>();
	/** the order entries were opened in, which is the order the log reads */
	const order: { kind: "prose" | "row" | "wait" | "ask"; key: string }[] = [];
	const notes: AgentEntry[] = [];
	/** open tool blocks by slot, since a fragment carries only its block index */
	const blocks = new Map<string, Block>();
	/** every call by its own id, which is what a whole call and a result arrive with */
	const calls = new Map<string, Block>();
	/** the run still open on each thread */
	const runs = new Map<string, Run>();
	/** which call a delegated task answers to, so the task's end settles the row */
	const taskCalls = new Map<string, string>();
	/**
	 * A delegate's rows, by the row that delegated them (#194).
	 *
	 * They are held aside rather than pushed into `order` because a sub-agent is one row
	 * that expands: its own transcript belongs inside that row, and a fan-out of three
	 * delegates is three lines in the log until somebody opens one.
	 */
	const delegated = new Map<string, string[]>();
	/**
	 * The plan of each thread that writes one, and the row standing for the calls that
	 * wrote it.
	 *
	 * Per thread for the reason a run is (#135): a fan-out interleaves, and one plan
	 * across the whole log would file a delegate's row inside that delegate while
	 * merging its tasks into the conversation's own strip. Only the thread the human is
	 * talking to reaches the shelf; a delegate's plan is its own business and stays a
	 * line in its own transcript.
	 */
	const plans = new Map<string, { row: Row; tasks: PlanTask[] }>();
	/** the project the agent is standing in, so a path behind a disclosure is relative */
	let root = "";

	/** the request being answered: block indexes reset with it, so keys carry it */
	let message = 0;
	/** the prose blocks this message opened, in order, for the settled text to land on */
	let opened: string[] = [];
	let confirmed = 0;
	/**
	 * The request that is up and has drawn nothing yet, off the wire's own `waiting`.
	 *
	 * It is the receipt being written. It was the message gate too until #231 split
	 * them, because they turned out not to be the same fact: the message boundary is
	 * the first event of any kind, and the receipt's clock runs past it.
	 */
	let outstanding: Wait | null = null;
	/**
	 * Nothing has come back from the request now out, which is what makes the next
	 * thing back a new message. True before any request has gone out at all, so a
	 * runtime that never says `waiting` advances nothing.
	 */
	let begun = true;
	/** the last stamp seen, so a turn cut under a request can say how long it had been */
	let last = 0;
	let over = false;
	let ended = false;
	/** the last usage window the binary said anything about, so a crossing can be seen */
	let limit: AgentLimit | null = null;

	/**
	 * The log drew something on this thread, which is what ends a run (#135).
	 *
	 * Time cannot be the rule: gaps inside a run reach 15.2s while the shortest gap
	 * between two runs is 17.5s, so any threshold would be fitted to one capture. What
	 * actually sits in every gap between two runs is the agent going and looking at
	 * what it just changed, and looking draws a row.
	 *
	 * Only what stays drawn counts, and the rule has not moved — what moved is the wait,
	 * which now draws its own receipt and so ends a run like anything else in the log
	 * (#212). Writes either side of a request out are two runs, and there is a line
	 * between them saying why. While the wait drew nothing they were one run, on this
	 * same rule: a run ended by nothing the reader can see is two identical rows next to
	 * each other with no reason between them.
	 *
	 * Per thread rather than across the log, because a fan-out interleaves: three
	 * delegates and the parent all draw into one transcript at once, and one rule
	 * across all of them would end every run on the next delegate's row.
	 */
	const endRun = (thread: string) => {
		const run = runs.get(thread);
		if (run === undefined) return;
		runs.delete(thread);
		if (run.settle !== null) run.row.state = run.settle;
	};

	/** the row this block gets, in the log's own order, ending whatever run it interrupts */
	const draw = (block: Block, row: Omit<Row, "key" | "parent">): Row => {
		endRun(block.thread);
		const made: Row = {
			// the call's own id, and the slot it opened in for a runtime that sends none
			key: block.id === null ? `row:${block.thread}:${block.tool}:${blocks.size}` : `row:${block.id}`,
			...row,
			parent: block.thread === "" ? null : block.thread,
		};
		block.row = made;
		rows.set(made.key, made);
		// a delegate's row goes inside the row that delegated it, unless spool never saw
		// that call — a stream joined mid-delegation has a row and nowhere to file it, and
		// the log is the honest place for a row whose parent spool cannot name
		const above = block.thread === "" ? null : (calls.get(block.thread)?.row ?? null);
		if (above === null) order.push({ kind: "row", key: made.key });
		else delegated.set(above.key, [...(delegated.get(above.key) ?? []), made.key]);
		return made;
	};

	/**
	 * This thread's plan, opened by the first of the calls that write it.
	 *
	 * Seven creates in nine seconds are one list, so the first of them opens one row and
	 * the rest only lengthen it: the subject counts the tasks in as they land, which is
	 * the same three beats every other call gets. Every create's block points at that row
	 * so that whichever result comes back settles it.
	 */
	const openPlan = (block: Block): { row: Row; tasks: PlanTask[] } => {
		const known = plans.get(block.thread);
		if (known !== undefined) {
			block.row = known.row;
			return known;
		}
		const made = {
			row: draw(block, {
				state: "running",
				verb: "plan",
				subject: null,
				frame: null,
				count: 1,
				detail: null,
				step: null,
				shot: null,
				foreign: null,
			}),
			tasks: [] as PlanTask[],
		};
		plans.set(block.thread, made);
		return made;
	};

	/** one task, in both of the phrasings the call carries, appended to the list it is in */
	const addTask = (block: Block, input: CallInput) => {
		const plan = openPlan(block);
		const written = taskWritten(input);
		if (written === null) return;
		plan.tasks.push({ key: `task:${plan.tasks.length + 1}`, ...written, state: "pending" });
		plan.row.subject = `${plan.tasks.length} task${plan.tasks.length === 1 ? "" : "s"}`;
	};

	/** a task moving inside the list, which is the list changing rather than a row */
	const moveTask = (thread: string, input: CallInput) => {
		const moved = taskMoved(input);
		const task = moved === null ? undefined : plans.get(thread)?.tasks[moved.at - 1];
		if (moved === null || task === undefined) return;
		task.state = moved.state;
	};

	/**
	 * What spool can say about one call, said as soon as it can say it.
	 *
	 * Called on every event that carries anything about a block — the block opening,
	 * each fragment of its arguments, and the whole call — so a row appears with the
	 * verb the tool's own name gives and then learns its subject, rather than being
	 * assembled once at the end. Nothing here is drawn before the wire sent it.
	 */
	const nameRow = (block: Block, input: CallInput, whole: boolean, foreign: RowForeign | null) => {
		// a call the log does not draw still holds its block, so that its arguments land
		// on it rather than on whatever the slot held last — an index is reused every
		// message, and a plan's own calls take the ones the writes before them had
		if (!drawsOwnRow(block.tool)) return;
		// the fragments are a preview and the whole call is the authority, the same way a
		// settled message outranks its own deltas
		if (block.settled && !whole) return;
		const named = nameCall({ tool: block.tool, input, root, ...(foreign === null ? {} : { foreign }), whole });
		if (named === null) return;
		block.named = named;
		if (whole) block.settled = true;
		// a run's next call adds a count and nothing else: the calls are the same verb on
		// the same frame, and the count is the entire difference between them
		if (block.joined) return;
		const run = runs.get(block.thread);
		const name = named.frame ?? named.detail ?? named.subject;
		if (block.row === null) {
			/*
			 * A write while a run is open is either that run's next call or a row of its
			 * own, and the only thing that says which is the file it names — so it waits for
			 * it. A different file has never broken a run in either capture, because the
			 * agent finishes with a frame before it picks up the next one, but the rule is
			 * the rule and this is where it would fire.
			 */
			if (named.writes && run !== undefined) {
				if (name === null) return;
				if (name === run.name) {
					block.joined = true;
					block.row = run.row;
					run.row.count += 1;
					// the run is working again, and its mark says so until the run closes
					run.settle = null;
					if (block.id !== null) calls.set(block.id, block);
					return;
				}
			}
			// a search for a deferred tool is machinery: it draws only if it comes back
			// with nothing, which is the one case that is not (#142), so its row is built
			// by the result rather than here
			if (named.finds) return;
			const row = draw(block, {
				state: "running",
				verb: named.verb,
				subject: named.subject,
				frame: named.frame,
				count: 1,
				detail: named.detail,
				step: null,
				shot: null,
				foreign,
			});
			if (named.writes && name !== null) runs.set(block.thread, { row, name, settle: null });
			return;
		}
		// the row learns: the verb sharpens where the argument settles it, and the
		// subject arrives on the fragment that carries it. A word that landed never
		// un-lands, so an argument the whole call turns out not to carry leaves what
		// arrived rather than blanking it — and the frame follows the subject, because
		// what the row printed and whether it is a place are one fact
		block.row.verb = named.verb;
		if (named.subject !== null) {
			block.row.subject = named.subject;
			block.row.frame = named.frame;
		}
		if (named.detail !== null) block.row.detail = named.detail;
		if (foreign !== null) block.row.foreign = foreign;
		// the path landed on a write that opened before it, so this is where its run starts
		if (named.writes && name !== null && runs.get(block.thread)?.row !== block.row)
			runs.set(block.thread, { row: block.row, name, settle: null });
	};

	/**
	 * The block the turn is going to stop at, opened where the call opens (#145).
	 *
	 * A question is a call like any other on the way in — a name, then its arguments
	 * typing themselves in — so it gets the same first beat, and only the request that
	 * follows makes it answerable. Opening it here rather than on that request is what
	 * puts the question in the log in the agent's own order.
	 *
	 * The key is the call, because that is what the request, the whole call and the
	 * result all name it by. Where there is no call to name it by, the request is.
	 *
	 * An approval is the other way round and `under` is why. Its request arrives after
	 * the call it is about — measured, while the *next* call's arguments are already
	 * streaming — so appending it would put the block under a row it has nothing to do
	 * with. It goes back under its own row instead, which is also what keeps it from
	 * ending a run it never interrupted.
	 */
	const openAsk = (key: string, opening: "question" | "approval", under: string | null = null): Ask => {
		const known = asks.get(key);
		if (known !== undefined) return known;
		const made: Ask = {
			key: `ask:${key}`,
			request: null,
			// a call named `AskUserQuestion` is a question before its request says so, and
			// an approval's block is only ever opened by a request that has
			question: opening === "question",
			asked: null,
			questions: [],
			always: false,
			state: "arriving",
			words: null,
		};
		asks.set(key, made);
		const row = under === null ? -1 : order.findIndex((slot) => slot.kind === "row" && slot.key === under);
		if (row >= 0) {
			order.splice(row + 1, 0, { kind: "ask", key });
			return made;
		}
		order.push({ kind: "ask", key });
		// a question is something the log draws at the end of it, so it ends whatever run
		// was open the way every other drawn thing does
		endRun("");
		return made;
	};

	/** a block the wire is opening, or one it never streamed and is handing over whole */
	const blockOf = (thread: string, slot: string, id: string | null, tool: string): Block => {
		const block: Block = { id, tool, thread, fragments: "", row: null, named: null, joined: false, settled: false };
		blocks.set(slot, block);
		if (id !== null) calls.set(id, block);
		return block;
	};

	/**
	 * The stream is over, so nothing that had not landed ever will.
	 *
	 * Every open run closes on whatever its last call said, every call the wire never
	 * answered stops — spool never claims something errored when it simply never ran —
	 * and a write that was waiting to find out whether it was a run's next call draws
	 * as the bare verb it got to, which is beat one of the three every call gets.
	 *
	 * A request still out takes the same word for the same reason, and it stops counting
	 * here: its clock is the turn's, and the turn is over. What it keeps is how long it
	 * had been out when the lights went out, which is a fact, rather than a total it
	 * never reached (#212).
	 */
	const finish = () => {
		if (outstanding !== null) {
			outstanding.ms = Math.max(0, last - outstanding.at);
			outstanding.state = "stopped";
			outstanding = null;
		}
		for (const thread of [...runs.keys()]) endRun(thread);
		for (const block of blocks.values()) {
			if (block.row === null && !block.joined) nameRow(block, block.fragments, false, null);
		}
		// a step is what a delegate is doing now, and nothing is doing anything now
		for (const row of rows.values()) {
			if (row.state !== "running") continue;
			row.state = "stopped";
			row.step = null;
		}
		// a question the turn ended under is one nobody answered, and the controls go
		// with it: there is no process left for an answer to reach
		for (const ask of asks.values()) if (unanswered(ask)) ask.state = "dropped";
	};

	/**
	 * The request came back, whatever it came back as: the message boundary, and only
	 * that.
	 *
	 * Called from every event that can be the first thing an answer produces rather
	 * than from `speaking` alone, because `speaking` is one runtime's signal and the
	 * union is meant to survive a thinner one. What it does is file the blocks that
	 * follow under a new message, which is what keeps two messages that both open at
	 * block 0 out of one entry.
	 *
	 * The gate is the rest of it. Every event after the first is an answer to a
	 * request that has already come back, and advancing the message on one of those
	 * would file a settled message against a block index its own deltas never opened.
	 */
	const arrived = () => {
		if (begun) return;
		begun = true;
		message += 1;
		opened = [];
		confirmed = 0;
	};

	/**
	 * The wait is over, because the log finally has something to show for it (#231).
	 *
	 * Later than `arrived` on purpose, and that gap is the whole of the fix. The two
	 * fired together until a reasoning turn showed what that measured: a message whose
	 * first block is a thought starts within milliseconds of the request, so the
	 * receipt settled at `thinking 0.0s` and the model went on reasoning for half a
	 * minute underneath a log that had stopped moving. The receipt was at its least
	 * useful exactly where the wait was longest.
	 *
	 * So it stops on the first thing the reader can see rather than the first thing on
	 * the wire. Thinking is not one of those and cannot be made into one: the wire
	 * carries a token count and an empty string for it (upstream `claude-code#20127`),
	 * so the only honest thing left to measure is the silence itself, from the request
	 * going out to prose or a call landing.
	 *
	 * Nothing is taken back out. The receipt settles where it already stands, which is
	 * the whole of why it is allowed to be there at all (#212).
	 */
	const settled = (at: number) => {
		if (outstanding === null) return;
		outstanding.ms = Math.max(0, at - outstanding.at);
		outstanding.state = "done";
		outstanding = null;
	};

	for (const { at, event } of seen) {
		const thread = event.parent ?? "";
		last = at;
		// the work of every thread reaches the log; the words of only one do
		if (event.parent !== null && !DELEGATED.has(event.kind)) continue;
		if (event.parent === null && ANSWERS.has(event.kind)) {
			arrived();
			// every one of them draws a row, so every one of them ends the wait
			settled(at);
		}
		switch (event.kind) {
			case "call": {
				// the block opens with a name and an empty input, and the subject types
				// itself in behind it
				const block = blockOf(thread, `${thread}:${event.block}`, event.id, event.tool);
				// the plan's row opens on the first of its creates, before any of them has
				// said what its task is, so the count types itself in the way a path does
				if (event.tool === "TaskCreate") openPlan(block);
				// the turn stopping to ask, which is not a call the log is a receipt for:
				// the question is the object the way the plan is. Only on the thread the
				// person is talking to, because a question is words
				else if (event.tool === ASK_TOOL && thread === "") {
					const key = event.id ?? `block:${event.block}`;
					openAsk(key, "question");
					if (event.id !== null) askOf.set(event.id, key);
				} else nameRow(block, undefined, false, null);
				break;
			}
			case "call-input": {
				// one uneven fragment of partial JSON: they split mid-token, so nothing
				// parses them and a value is read only once it is whole. A fragment with no
				// block of its own is a capture that opened mid-call, and there is no tool
				// name to draw a verb from.
				const block = blocks.get(`${thread}:${event.block}`);
				if (block === undefined) break;
				block.fragments += event.fragment;
				// the question types itself in, because a half-arrived sentence is the same
				// sentence with less of it. Its options do not: they are objects, and half
				// an option list is not a shorter one
				const asking = block.tool === ASK_TOOL ? asks.get(block.id ?? `block:${event.block}`) : undefined;
				if (asking !== undefined) {
					asking.asked = readProse(block.fragments, "question");
					break;
				}
				nameRow(block, block.fragments, false, null);
				break;
			}
			case "called": {
				const known = calls.get(event.id);
				const block = known ?? blockOf(thread, `${thread}:${event.id}`, event.id, event.tool);
				// the two calls that move the plan rather than the log: one lengthens the list,
				// the other moves a task inside it, and neither is a row
				if (event.tool === "TaskCreate") {
					addTask(block, event.input);
					break;
				}
				if (event.tool === "TaskUpdate") {
					moveTask(thread, event.input);
					break;
				}
				// the whole call is the authority on the options, the same way a settled
				// message outranks its own deltas
				const asking = event.tool === ASK_TOOL && thread === "" ? asks.get(event.id) : undefined;
				if (asking !== undefined) {
					asking.questions = questionsOf(event.input);
					asking.asked = asking.questions[0]?.question ?? asking.asked;
					break;
				}
				const foreign =
					event.foreign === undefined
						? null
						: { server: event.foreign.server ?? null, tool: event.foreign.tool ?? null, raw: event.tool };
				nameRow(block, event.input, true, foreign);
				break;
			}
			case "asking": {
				/*
				 * The request that makes it answerable, and the moment the turn parks.
				 *
				 * A question already has a block in the log, opened where its call opened, so
				 * this finds it and turns the options on. An approval has none — the call it is
				 * about is an ordinary row already drawn above — so the block opens here, under
				 * that row, carrying the agent's written description and nothing else.
				 */
				const key = event.call ?? event.request;
				const above = event.call === null ? null : (calls.get(event.call)?.row ?? null);
				const ask = openAsk(key, event.interaction ? "question" : "approval", above?.key ?? null);
				// the flag is the discriminator, so a question whose payload spool could not read
				// still reads as one: its exits are a sentence and a dismiss rather than an allow
				ask.question = event.interaction;
				askOf.set(event.request, key);
				if (event.call !== null) askOf.set(event.call, key);
				ask.request = event.request;
				ask.state = "open";
				ask.always = event.suggestions.length > 0;
				/*
				 * The agent's own written sentence, which is the whole of what an approval gives
				 * somebody to decide on — and nothing where it wrote none.
				 *
				 * There is no fallback to the tool's own name, on #142's finding: a display name
				 * arrives in three different conventions across three servers, which is why the
				 * row above says `ask Notion` rather than `Notion-Search`, and a block that put
				 * the rejected name back under it would undo that. And a description the row
				 * already prints is dropped for the same reason nothing else in this rail is
				 * said twice: for a shell call spool's own noun is `run <description>`.
				 */
				if (event.description !== null && event.description !== above?.subject) ask.asked = event.description;
				if (ask.questions.length === 0) ask.questions = questionsOf(event.input);
				if (ask.asked === null && ask.questions.length > 0) ask.asked = ask.questions[0]?.question ?? null;
				break;
			}
			case "answered": {
				const ask = asks.get(askOf.get(event.request) ?? "");
				if (ask === undefined) break;
				ask.state =
					event.answer === "allow"
						? "allowed"
						: event.answer === "always"
							? "always"
							: event.answer === "deny"
								? "denied"
								: "answered";
				ask.words = event.words;
				break;
			}
			case "result": {
				/*
				 * A result on a request nobody answered is the agent answering for itself, and
				 * it is not a stall: measured, the result lands 84 ms after the ask, the agent
				 * thinks for five beats and takes the cautious option. So the block says the
				 * question expired rather than that it failed, and an answered one keeps
				 * whatever the person said.
				 */
				const waited = asks.get(askOf.get(event.id) ?? "");
				if (waited !== undefined && unanswered(waited)) waited.state = "dropped";
				const block = calls.get(event.id);
				if (block === undefined) break;
				/*
				 * A search that loaded no tool is the only place a connector nobody has signed
				 * in to is visible at all: it offers no failing tool, it offers no tool. So the
				 * answer's own words are the payload and the row draws here, at the moment being
				 * empty became a fact — a search that answered is machinery and stays silent.
				 */
				if (block.named?.finds === true) {
					if ((event.tools?.length ?? 0) > 0) break;
					draw(block, {
						state: "failed",
						verb: block.named.verb,
						subject: block.named.subject,
						frame: null,
						count: 1,
						detail: event.text === "" ? null : event.text,
						step: null,
						shot: null,
						foreign: null,
					});
					break;
				}
				if (block.row === null) break;
				// a delegation's own result is the launch receipt — measured at 84ms, against a
				// task that outlives it by minutes — so the row settles on the task instead
				if (block.tool === "Agent") break;
				const state = settledBy(event);
				const run = runs.get(block.thread);
				if (run !== undefined && run.row === block.row) run.settle = state;
				else block.row.state = state;
				/*
				 * Where a rule refused the call, the content is the developer's own sentence —
				 * `Skip Drive — use Notion only.` — and it outranks the wire name or the path
				 * the row was holding, because it is why the row failed.
				 *
				 * A stopped call keeps its path instead. What the binary writes there is
				 * addressed to the model rather than to anybody, so the row would report the
				 * developer's own press back to them as an instruction to stop and wait.
				 */
				if (state === "failed" && event.text.trim() !== "") block.row.detail = event.text.trim();
				/*
				 * The picture the call handed back, which goes one field down rather than onto
				 * the line: roughly 150 KB of base64 per screenshot, and the row above it
				 * already said `look`.
				 *
				 * The first of them, because every image result in all seven captures carries
				 * exactly one — a `spool shot` writes one PNG and the agent reads that one back.
				 */
				const picture = event.images[0];
				if (picture !== undefined) block.row.shot = { media: picture.media, data: picture.data };
				break;
			}
			case "task-started":
			case "task-step":
			case "task-done": {
				// a task's end arrives carrying the runtime's own task id and nothing else, so
				// the start is what ties the two together — but a step names its call as well,
				// and a stream that opened mid-delegation never saw the start
				if (event.kind !== "task-done" && event.call !== null) taskCalls.set(event.task, event.call);
				const call = taskCalls.get(event.task);
				const row = call === undefined ? null : (calls.get(call)?.row ?? null);
				if (row === null) break;
				/*
				 * A delegate's live step, which is a snapshot rather than a log: the row holds the
				 * one it is on and it replaces rather than appends. Sixty-seven of them land in the
				 * fan-out against twelve rows, and it is the whole of what a delegation says about
				 * itself — the calls it made are the delegate's business, and a fan-out that spent
				 * a line on each of them would bury the turn that launched it.
				 *
				 * It goes the moment the task lands: by then the frames it wrote are out on the
				 * canvas, so a line in the wire's words has nothing left to add.
				 */
				if (event.kind === "task-step" && event.description !== null) row.step = event.description;
				if (event.kind === "task-done") {
					row.step = null;
					if (event.status === "completed") row.state = "done";
				}
				break;
			}
			case "ready":
				// the project the agent is standing in, which is what makes a path relative
				if (event.cwd !== null) root = event.cwd;
				break;
			case "waiting": {
				/*
				 * The request goes out, and the log opens the receipt for it now rather than
				 * when it comes back (#212).
				 *
				 * Now, because a duration nobody can watch arriving is a duration nobody trusts:
				 * the whole complaint was a rail that reads as stopped for the two to four
				 * seconds before a first token, and a line that appears only once the answer has
				 * already started would arrive exactly too late to answer it.
				 *
				 * One per request. A second `waiting` with no answer between is the same request
				 * still out, and it must not open a second line.
				 */
				if (outstanding !== null) break;
				const made: Wait = { key: `wait:${waits.size}`, at, state: "running", ms: null };
				waits.set(made.key, made);
				order.push({ kind: "wait", key: made.key });
				outstanding = made;
				begun = false;
				// it is a drawn thing in the log now, so it ends a run the way every other
				// drawn thing does — which is the rule below, on its own terms
				endRun("");
				break;
			}
			/*
			 * The first thing back, in the two shapes it comes in.
			 *
			 * Neither draws a line of its own, and the thinking block least of all: the wire
			 * carries no thinking text at all — `AgentThinking` has a token count and no prose,
			 * and measured against 2.1.220 every one of the 346 thinking fields across the
			 * captures is the empty string (upstream: claude-code#20127).
			 *
			 * So they open the message and leave the receipt running (#231). They are the
			 * request arriving, not the wait ending: `speaking` is the wire's `message_start`
			 * and lands milliseconds after the request on a message that begins by thinking,
			 * and what follows it is the part of the turn a reader has nothing to look at
			 * for. Settling here is what made the receipt say `thinking 0.0s` over a model
			 * that had another half minute of thinking to do.
			 */
			case "speaking":
			case "thinking":
				arrived();
				break;
			case "say": {
				arrived();
				settled(at);
				const key = `say:${message}:${event.block}`;
				let block = prose.get(key);
				if (block === undefined) {
					block = { key, full: "", landed: [], settled: false };
					prose.set(key, block);
					order.push({ kind: "prose", key });
					opened.push(key);
					endRun("");
				}
				block.full += event.text;
				block.landed.push({ at, upto: block.full.length });
				break;
			}
			case "said": {
				arrived();
				settled(at);
				// the settled message confirms the blocks its own deltas opened, in order.
				// A runtime that sends no partial messages opens none, so the text arrives
				// here first and is drawn whole — which is the same entry with no schedule.
				const key = opened[confirmed] ?? `said:${message}:${confirmed}`;
				confirmed += 1;
				const block = prose.get(key);
				if (block === undefined) {
					prose.set(key, { key, full: event.text, landed: [], settled: true });
					order.push({ kind: "prose", key });
					endRun("");
				} else {
					block.full = event.text;
					block.settled = true;
					// the authority is longer than the deltas delivered, so the schedule gains
					// the rest at this moment. Without it the pace has nothing left to spend
					// and the last characters would never be drawn at all.
					if ((block.landed[block.landed.length - 1]?.upto ?? 0) < event.text.length) {
						block.landed.push({ at, upto: event.text.length });
					}
				}
				break;
			}
			case "ended": {
				over = true;
				ended = true;
				finish();
				if (event.ending === "stopped") notes.push({ key: "end", kind: "note", text: "stopped" });
				// the wire's own word for a failure, because spool is not the authority on
				// why somebody else's process gave up
				if (event.ending === "failed") notes.push({ key: "end", kind: "note", text: event.reason ?? "failed" });
				break;
			}
			case "closed": {
				over = true;
				finish();
				// an exit after a result is silent; a process that went away without one is
				// the one thing the rail must never swallow, because it is why nothing came
				// back. The runner's own message is quoted verbatim — a missing binary
				// reaches here as `spawn claude ENOENT` and spool does not improve on it.
				if (event.message !== undefined) {
					notes.push({ key: "closed", kind: "note", text: event.message });
					/*
					 * The one sentence spool adds to a refusal it did not write (#201).
					 *
					 * The words above are the binary's own and stay that way. What it cannot say
					 * from here is what to do about it: its own remedy is `/login`, a slash command
					 * inside an interactive session, and spool spawns print mode. So the remedy is
					 * spool's, the promise about keys rides under it where somebody deciding what to
					 * do will read it once, and neither of them is a boundary — nothing below them
					 * is untrue, they are a thing to go and do.
					 */
					if (signedOut(event.message)) {
						notes.push({ key: "closed-fix", kind: "note", rule: false, said: LOGIN_REMEDY, text: NO_KEY });
					}
				} else if (!ended) {
					notes.push({
						key: "closed",
						kind: "note",
						text: event.code === null ? "the agent exited on a signal" : `the agent exited ${event.code}`,
					});
				}
				break;
			}
			case "limit": {
				/*
				 * The usage window, said once, when there is something to say (#122, #199).
				 *
				 * The standing fact is the readout's — it outlives every turn that saw it, so it
				 * is carried out of here rather than drawn in here. What the log gets is the
				 * wind-down and only the wind-down: the agent has just been told to finish what
				 * it is holding and start nothing new, and the line is why the delegation it
				 * announced never happens.
				 */
				const note = limitNote(limit, event.limit);
				limit = event.limit;
				if (note !== null) notes.push({ key: `limit-${notes.length}`, kind: "note", text: note });
				break;
			}
			default:
				// compacting, compacted and anything nobody modelled: not this ticket's to
				// draw, and never fatal
				break;
		}
	}

	/** one row and, under it, whatever the delegate it launched has done so far */
	const rowOf = (key: string): AgentRow | null => {
		const row = rows.get(key);
		if (row === undefined) return null;
		const theirs = (delegated.get(key) ?? []).map(rowOf).filter((kid): kid is AgentRow => kid !== null);
		return { ...row, kind: "row", delegated: theirs };
	};

	// every message that started this turn, in the order it was said in: one for a
	// press against a quiet rail, and the whole stack for a queue that fired (#170)
	const entries: AgentEntry[] = said.map((words, index) => ({
		key: index === 0 ? "user" : `user-${index}`,
		kind: "user",
		text: words.text,
		context: words.context ?? null,
		attached: words.attached ?? null,
	}));
	for (const slot of order) {
		if (slot.kind === "row") {
			const row = rowOf(slot.key);
			if (row !== null) entries.push(row);
			continue;
		}
		if (slot.kind === "wait") {
			const wait = waits.get(slot.key);
			if (wait !== undefined) entries.push({ ...wait, kind: "wait" });
			continue;
		}
		if (slot.kind === "ask") {
			const ask = asks.get(slot.key);
			// a call that opened and never said what it was asking is not a question yet,
			// but a request that arrived always draws: its controls are the block even
			// where the row above already said everything there was to say
			if (ask !== undefined && (ask.request !== null || ask.asked !== null || ask.questions.length > 0))
				entries.push({ ...ask, kind: "ask" });
			continue;
		}
		const block = prose.get(slot.key);
		// a text block that opened and never carried a character is not a message
		if (block !== undefined && block.full !== "") entries.push({ ...block, kind: "prose", landed: block.landed });
	}
	/*
	 * The plan, in the two phrasings the agent supplied and no others: the list reads in
	 * the written form, and whatever is running reads in the present participle it was
	 * given — once, here, so the strip and the list cannot disagree about what a task is
	 * called. A task nobody has started is written down and not begun, which is the one
	 * place in this rail a row is `pending`.
	 */
	const written: AgentPlanTask[] = (plans.get("")?.tasks ?? []).map((task) => ({
		key: task.key,
		name: task.state === "running" && task.running !== null ? task.running : task.subject,
		state: task.state,
	}));
	const planned: AgentPlan | null =
		written.length === 0
			? null
			: {
					total: written.length,
					done: written.filter((task) => task.state === "done").length,
					running: written.find((task) => task.state === "running")?.name ?? null,
					tasks: written,
				};
	const parked = [...asks.values()].find((ask) => ask.state === "open")?.request ?? null;
	return { entries: [...entries, ...notes], plan: planned, over, asking: parked, limit };
}
