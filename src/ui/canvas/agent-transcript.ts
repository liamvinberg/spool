import type { Attachment } from "../../attachment";
import type { AgentEvent } from "../../daemon/agent-events";
import {
	type CallInput,
	type CallName,
	drawsOwnRow,
	nameCall,
	type RowForeign,
	taskMoved,
	taskWritten,
} from "./agent-nouns";
import { drawnBy, type Landed } from "./agent-pace";

/**
 * The transcript, projected from the event union the daemon streams (#191, #192,
 * #193).
 *
 * The rail renders these and nothing else: the human's words, the agent's words,
 * one quiet beat for the time the model spends composing, one line per tool call,
 * the plan, and spool's own word for a turn that did not end cleanly. Chips and
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
 * delegated them: a sub-agent is one row that expands into its own transcript
 * (#194), so a fan-out is three lines until somebody wants more.
 */

/**
 * How a row or a beat is going.
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

/** whether the beat is still going, finished, or was cut off with the turn */
export type BeatState = Extract<RowState, "running" | "done" | "stopped">;

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
	/** the picture this call handed back, which is the payload of its line (#117) */
	readonly shot: AgentShot | null;
	readonly foreign: RowForeign | null;
	/** the delegating call this row came from, or null on the human's own thread */
	readonly parent: string | null;
	/**
	 * The rows a delegate this call launched has drawn: its own transcript (#194).
	 *
	 * A sub-agent is one row that expands, so a fan-out is one line per delegate until
	 * somebody wants more — and what is in there is rows rather than a summary, because
	 * for a delegate the place is the canvas and a row is how you get to one (#143).
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
	 * The model composing, which is the only thing on screen for the wait before the
	 * first token — measured at over a second, so it is the difference between the
	 * rail reading as intent and reading as a hang.
	 *
	 * `verb` is null until the wire names it. A request going up is a fact spool has;
	 * that the model is *thinking* is not, until a thinking block opens and says so.
	 * The mark turns either way, and `since`/`until` are ms from the send, so the
	 * duration is drawn off the same clock the prose is paced by rather than stamped
	 * into the entry.
	 *
	 * The wire's token estimate is not carried. A thought's delta sends an empty
	 * string and a count, so a count is drawable — but a duration is the one this rail
	 * draws, and a field nothing renders is a field with no rule behind it.
	 */
	| {
			readonly key: string;
			readonly kind: "beat";
			readonly state: BeatState;
			readonly verb: string | null;
			readonly since: number;
			readonly until: number | null;
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
	 * Spool's own word, drawn as a rule across the log.
	 *
	 * A boundary rather than a reply: everything above it happened and nothing below
	 * it did. A clean turn gets none — the log is receipts, and "it worked" is not
	 * one.
	 */
	| { readonly key: string; readonly kind: "note"; readonly text: string };

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
	/** when the last event landed, so the clock can stop once the edge has caught up */
	readonly last: number;
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

/**
 * A duration as the wire measured it. Tenths while a beat is short enough to read
 * as tenths, whole seconds once it is not, minutes once a wait has become the kind
 * you go and do something else during — which, in the captures, it does.
 */
export function duration(ms: number): string {
	if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
	const whole = Math.round(ms / 1000);
	if (whole < 60) return `${whole}s`;
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

interface Beat {
	key: string;
	state: BeatState;
	verb: string | null;
	since: number;
	until: number | null;
}

interface Prose {
	key: string;
	full: string;
	landed: Landed[];
	settled: boolean;
}

interface Row {
	key: string;
	state: RowState;
	verb: string;
	subject: string | null;
	frame: string | null;
	count: number;
	detail: string | null;
	shot: AgentShot | null;
	foreign: RowForeign | null;
	parent: string | null;
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
 * is having, and its beats belong to a clock nobody is watching — but the frames it
 * writes land on the canvas, and a row is how you get to one (#143). Anything the
 * union gains later is a word until somebody says otherwise, which is the safe way
 * round.
 */
const DELEGATED: ReadonlySet<AgentEvent["kind"]> = new Set(["call", "call-input", "called", "result"]);

/**
 * The events that mean the request came back and the model stopped composing.
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
 * What went out with the words, as the composer captured it at Enter (#116, #119).
 *
 * Held rather than derived, because the strip may have moved since: a turn is a
 * record of the moment it was sent, and the selection is a live thing.
 */
export interface AgentSent {
	readonly context?: string | null;
	readonly attached?: Attachment | null;
}

export function transcriptOf(prompt: string, seen: readonly Stamped[], sent: AgentSent = {}): Transcript {
	const beats: Beat[] = [];
	const prose = new Map<string, Prose>();
	const rows = new Map<string, Row>();
	/** the order entries were opened in, which is the order the log reads */
	const order: { kind: "beat" | "prose" | "row"; key: string }[] = [];
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
	let waiting: Beat | null = null;
	let thinking: Beat | null = null;
	let over = false;
	let ended = false;
	let last = 0;

	/**
	 * The log drew something on this thread, which is what ends a run (#135).
	 *
	 * Time cannot be the rule: gaps inside a run reach 15.2s while the shortest gap
	 * between two runs is 17.5s, so any threshold would be fitted to one capture. What
	 * actually sits in every gap between two runs is the agent going and looking at
	 * what it just changed, and looking draws a row.
	 *
	 * Only what stays drawn counts. The wait for the next request opens a beat and then
	 * takes it back, because it was the absence of an answer rather than a thing that
	 * happened — so a run it ended would be a run broken by nothing the reader can see,
	 * and two identical rows would end up next to each other with no reason between
	 * them. Writes either side of a silent request are the same run, which is what the
	 * rule says when nothing is drawn between them.
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

	const open = (key: string, at: number, verb: string | null): Beat => {
		const beat: Beat = { key, state: "running", verb, since: at, until: null };
		beats.push(beat);
		order.push({ kind: "beat", key });
		return beat;
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
	 */
	const finish = () => {
		for (const thread of [...runs.keys()]) endRun(thread);
		for (const block of blocks.values()) {
			if (block.row === null && !block.joined) nameRow(block, block.fragments, false, null);
		}
		for (const row of rows.values()) if (row.state === "running") row.state = "stopped";
	};

	/** the model stopped composing, so whatever beat was open closes on this ending */
	const settleThinking = (at: number, state: BeatState = "done") => {
		if (thinking === null) return;
		thinking.state = state;
		thinking.until = at;
		thinking = null;
	};

	/**
	 * The request came back, whatever it came back as.
	 *
	 * Called from every event that can be the first thing an answer produces rather
	 * than from `speaking` alone, because `speaking` is one runtime's signal and the
	 * union is meant to survive a thinner one. It does two things: the wait leaves no
	 * receipt — it was the absence of an answer rather than a thing that happened —
	 * and the blocks that follow belong to a new message, which is what keeps two
	 * messages that both open at block 0 out of one entry.
	 *
	 * It does not touch the thinking beat. The request coming back is not the model
	 * stopping composing: a thought is the answer's own first block, and closing it
	 * here would settle it on its own second delta.
	 */
	const answered = () => {
		if (waiting === null) return;
		const gone = waiting.key;
		beats.splice(beats.indexOf(waiting), 1);
		const drop = order.findIndex((entry) => entry.kind === "beat" && entry.key === gone);
		if (drop >= 0) order.splice(drop, 1);
		waiting = null;
		message += 1;
		opened = [];
		confirmed = 0;
	};

	for (const { at, event } of seen) {
		last = at;
		const thread = event.parent ?? "";
		// the work of every thread reaches the log; the words of only one do
		if (event.parent !== null && !DELEGATED.has(event.kind)) continue;
		if (event.parent === null && ANSWERS.has(event.kind)) {
			answered();
			settleThinking(at);
		}
		switch (event.kind) {
			case "call": {
				// the block opens with a name and an empty input, and the subject types
				// itself in behind it
				const block = blockOf(thread, `${thread}:${event.block}`, event.id, event.tool);
				// the plan's row opens on the first of its creates, before any of them has
				// said what its task is, so the count types itself in the way a path does
				if (event.tool === "TaskCreate") openPlan(block);
				else nameRow(block, undefined, false, null);
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
				const foreign =
					event.foreign === undefined
						? null
						: { server: event.foreign.server ?? null, tool: event.foreign.tool ?? null, raw: event.tool };
				nameRow(block, event.input, true, foreign);
				break;
			}
			case "result": {
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
				 * fan-out against twelve rows, so it is what a delegation says about itself between
				 * the rows it draws.
				 *
				 * It sits where every other row's payload sits, and it goes the moment the task
				 * lands: by then the frames it wrote are out on the canvas and its own rows are
				 * under it, so a line in the wire's words has nothing left to add.
				 */
				if (event.kind === "task-step" && event.description !== null) row.detail = event.description;
				if (event.kind === "task-done") {
					row.detail = null;
					if (event.status === "completed") row.state = "done";
				}
				break;
			}
			case "ready":
				// the project the agent is standing in, which is what makes a path relative
				if (event.cwd !== null) root = event.cwd;
				break;
			case "waiting":
				// the request is out and nothing has come back. One beat, unnamed, turning.
				waiting ??= open(`wait:${message}`, at, null);
				break;
			case "speaking":
				answered();
				break;
			case "thinking": {
				answered();
				const key = `think:${message}:${event.block}`;
				if (thinking?.key !== key) {
					settleThinking(at);
					thinking = open(key, at, "thinking");
					// a thought stays in the log, so it is one of the things that ends a run
					endRun("");
				}
				break;
			}
			case "say": {
				answered();
				settleThinking(at);
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
				answered();
				settleThinking(at);
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
				settleThinking(at, event.ending === "stopped" ? "stopped" : "done");
				if (waiting !== null) {
					waiting.state = event.ending === "stopped" ? "stopped" : "done";
					waiting.until = at;
					waiting = null;
				}
				if (event.ending === "stopped") notes.push({ key: "end", kind: "note", text: "stopped" });
				// the wire's own word for a failure, because spool is not the authority on
				// why somebody else's process gave up
				if (event.ending === "failed") notes.push({ key: "end", kind: "note", text: event.reason ?? "failed" });
				break;
			}
			case "closed": {
				over = true;
				finish();
				settleThinking(at);
				if (waiting !== null) {
					waiting.state = "done";
					waiting.until = at;
					waiting = null;
				}
				// an exit after a result is silent; a process that went away without one is
				// the one thing the rail must never swallow, because it is why nothing came
				// back. The runner's own message is quoted verbatim — a missing binary
				// reaches here as `spawn claude ENOENT` and spool does not improve on it.
				if (event.message !== undefined) notes.push({ key: "closed", kind: "note", text: event.message });
				else if (!ended) {
					notes.push({
						key: "closed",
						kind: "note",
						text: event.code === null ? "the agent exited on a signal" : `the agent exited ${event.code}`,
					});
				}
				break;
			}
			default:
				// limit, compacting, compacted and anything nobody modelled: not this
				// ticket's to draw, and never fatal
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

	const entries: AgentEntry[] = [
		{ key: "user", kind: "user", text: prompt, context: sent.context ?? null, attached: sent.attached ?? null },
	];
	for (const slot of order) {
		if (slot.kind === "beat") {
			const beat = beats.find((candidate) => candidate.key === slot.key);
			if (beat !== undefined) entries.push({ ...beat, kind: "beat" });
			continue;
		}
		if (slot.kind === "row") {
			const row = rowOf(slot.key);
			if (row !== null) entries.push(row);
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
	return { entries: [...entries, ...notes], plan: planned, over, last };
}
