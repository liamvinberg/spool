import type { AgentEvent } from "../../daemon/agent-events";
import { drawnBy, type Landed } from "./agent-pace";

/**
 * The transcript, projected from the event union the daemon streams (#191, #192).
 *
 * The rail renders these and nothing else: the human's words, the agent's words,
 * one quiet beat for the time the model spends composing, and spool's own word for
 * a turn that did not end cleanly. Tool rows, chips, the plan and threads are
 * later tickets and this projection does not pretend to them — an event it does not
 * draw is dropped rather than guessed at, because `stream-json` publishes no
 * stability guarantee and a rename must cost a blank row rather than a turn.
 *
 * It is a fold over every event seen so far rather than an incremental reducer, so
 * the transcript is a pure function of the wire and of the clock. That is what lets
 * the drawn edge of an arriving message be computed rather than accumulated: the
 * same events and the same millisecond give the same screen however the frames
 * happened to run.
 *
 * A sub-agent's events are skipped whole. They reach the parent stream tagged with
 * their parent call, and what a delegate does belongs to the frame it writes rather
 * than to the log the human is reading.
 */

/** whether the beat is still going, finished, or was cut off with the turn */
export type BeatState = "running" | "done" | "stopped";

export type AgentEntry =
	/** what the human said, in the log the instant they said it */
	| { readonly key: string; readonly kind: "user"; readonly text: string }
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

export function transcriptOf(prompt: string, seen: readonly Stamped[]): Transcript {
	const beats: Beat[] = [];
	const prose = new Map<string, Prose>();
	/** the order entries were opened in, which is the order the log reads */
	const order: { kind: "beat" | "prose"; key: string }[] = [];
	const notes: AgentEntry[] = [];

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

	const open = (key: string, at: number, verb: string | null): Beat => {
		const beat: Beat = { key, state: "running", verb, since: at, until: null };
		beats.push(beat);
		order.push({ kind: "beat", key });
		return beat;
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
		// a delegate's turns reach this stream tagged with their parent call. What one
		// does is out on the canvas, not in the log the human is reading.
		if (event.parent !== null) continue;
		last = at;
		switch (event.kind) {
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
			case "call":
			case "called":
			case "result":
			case "task-started":
			case "task-step":
			case "task-done":
				// the work itself is a later ticket's row. What it settles here is the beat:
				// the model stopped composing the moment it called something.
				answered();
				settleThinking(at);
				break;
			case "ended": {
				over = true;
				ended = true;
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
				// ready, limit, call-input, compacting, compacted and anything nobody
				// modelled: not this ticket's to draw, and never fatal
				break;
		}
	}

	const entries: AgentEntry[] = [{ key: "user", kind: "user", text: prompt }];
	for (const slot of order) {
		if (slot.kind === "beat") {
			const beat = beats.find((candidate) => candidate.key === slot.key);
			if (beat !== undefined) entries.push({ ...beat, kind: "beat" });
			continue;
		}
		const block = prose.get(slot.key);
		// a text block that opened and never carried a character is not a message
		if (block !== undefined && block.full !== "") entries.push({ ...block, kind: "prose", landed: block.landed });
	}
	return { entries: [...entries, ...notes], over, last };
}
