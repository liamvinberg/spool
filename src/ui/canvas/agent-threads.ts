import type { StoredLife } from "../../daemon/agent-threads";
import { signedOut } from "./agent-preflight";
import type { TurnPhase } from "./agent-stream";
import type { AgentEntry, AgentRow } from "./agent-transcript";

/**
 * More than one conversation in a project, and most of them somewhere you are not
 * looking (#120, #136, #161, #200).
 *
 * A thread is a conversation in a project and nothing else. It is not bound to a page:
 * an agent asked to clean something up, or to move frames between pages, writes across
 * many pages or none, so there is no page field here to bind it with — which is also
 * why switching a thread does not move the canvas. There is nowhere to move to.
 *
 * The name is the ask, because there is nothing to borrow. The binary does generate a
 * title, it is stable across a session, and it never reaches print mode: it is absent
 * from both parent captures and a fresh three-turn print-mode session produced none at
 * all, in its output or in its own transcript file. Spool naming a conversation with a
 * side call to a cheap model was rejected as silent spend on somebody's own
 * subscription for a label.
 */

/**
 * Five lives, and three of them draw a mark.
 *
 *   streaming   the thread in the rail right now. The transcript already says it, so
 *               the mark is only there to keep the row aligned with its neighbours.
 *   running     working somewhere you are not looking. A turning ring, colourless,
 *               because state in this rail is motion and the one accent belongs to the
 *               selection.
 *   waiting     stopped, and only a person can move it. The disc held inside that
 *               ring, and the loudest of the three on purpose: it is the only one of
 *               them that is actually stuck.
 *   unread      it finished while you were away and nobody has read it. A solid dot at
 *               text strength, the way a mailbox says it, and still not the accent.
 *   read        nothing. An old thread is a name and a time.
 */
export type Life = "streaming" | "running" | "waiting" | "unread" | "read";

/** what the strip draws of one thread, which is a mark and the human's own sentence */
export interface Thread {
	readonly id: string;
	readonly ask: string;
	readonly life: Life;
}

/**
 * The turn bounced off a login, which is one of the three things a person has to clear.
 *
 * Read off the log rather than handed in, because the log is where the refusal lands: the
 * binary writes it on the way out and the transcript draws it verbatim. The words are the
 * binary's own (see `agent-preflight.ts`), because spool does not read the agent's private
 * credential files to find this out — it asks by doing the thing it was going to do
 * anyway, and this is the answer coming back.
 *
 * It is asked of one turn's entries rather than of a whole conversation, and that is
 * load-bearing now that #201 built the way out: a bounce is true until it stops being
 * true, and the turn that ran after somebody signed in is what says it stopped. Asked of
 * the conversation, the archived refusal would keep the mark stuck and the strip up
 * forever, on a thread that is working.
 */
export function bounced(entries: readonly AgentEntry[]): boolean {
	return entries.some((entry) => entry.kind === "note" && signedOut(entry.text));
}

/**
 * What one thread's mark is, off what its turn is doing and whether anybody has looked.
 *
 * `waiting` outranks the two motions, because a turn parked on a request never leaves
 * `asking` and is spending nothing: the phase alone drew a turning ring for a thread
 * that had stopped, which is the defect #161 was opened by. Its three causes share the
 * one mark — a parked question, a waiting approval, and a signed-out bounce — because
 * all three end when a person acts and nothing else moves them.
 *
 * A usage wind-down is not one of them. The agent is told to finish and does, so a
 * thread in its grace period is still working and still draws working.
 *
 * `unread` and `waiting` are told apart by what clears them, and that is the whole
 * reason they are two drawings rather than one. A look clears `unread`, wherever the look
 * happened; nothing about looking answers a question, so `waiting` is decided above it
 * and no look reaches it. A strip that spent the disc on waiting would go silent about a
 * thread that will never finish, which is the one case the strip exists for.
 */
export function lifeOf({
	phase,
	open,
	unread,
	stuck,
}: {
	readonly phase: TurnPhase;
	/** this is the thread the rail is drawing */
	readonly open: boolean;
	/** it landed somewhere nobody was looking, and nobody has looked since */
	readonly unread: boolean;
	/** it is waiting on a person: a parked request, or a login that is not there */
	readonly stuck: boolean;
}): Life {
	if (stuck) return "waiting";
	if (phase === "playing" || phase === "asking") return open ? "streaming" : "running";
	return unread ? "unread" : "read";
}

/**
 * The life that reaches disk, since `streaming` is a fact about a browser.
 *
 * It means *the thread in the rail right now*, which the next person to open the
 * project does not inherit. What the thread was doing is running.
 */
export function storedLife(life: Life): StoredLife {
	return life === "streaming" ? "running" : life;
}

/** the human's own first sentence, which is what a thread falls back to being called */
export function askOf(entries: readonly AgentEntry[], fallback = "new thread"): string {
	const said = entries.find((entry) => entry.kind === "user");
	return said?.kind === "user" && said.text.trim() !== "" ? said.text : fallback;
}

/** two names and then a count: past this a nameplate is a list, and a list is the deck's job */
const SHOWN = 2;

/**
 * What a thread is called, which is what it wrote (#200).
 *
 * The ask was the name because there was nothing to borrow, and the note above still
 * holds on both alternatives it rejected: the binary's own generated title never reaches
 * print mode, and naming a conversation with a side call to a cheap model is silent spend
 * on somebody's subscription for a label. The third option was the one nobody had looked
 * at, because the answer is already in the log. **A thread that has written frames has a
 * name made of facts about the repo** — no call, no invention, and nothing to keep in
 * sync, since it is derived on read rather than stored.
 *
 * It beats the ask on the thing the ask is worst at. An ask is a sentence and a name is
 * a label, so every name was a truncation: `so when the like shot patches or disappears
 * its li…`, cut mid-word, at whatever width the furniture left over. A frame name is
 * already short, already unique in the project, and already the thing the conversation
 * was *about* — and it is what you would say out loud to name that conversation.
 *
 * Only writes count. A turn reads far more than it writes, and the frames it read are
 * where it looked rather than what it did; a name made of them would call every thread
 * after the file it happened to open first.
 *
 * Two names and then a count, rather than a truncation: the count is a fact where a
 * cut string is a broken one, and `--worked` measured two at 208px against a 492px ask.
 * A thread that has written nothing yet is still the ask, and one that has said nothing
 * at all is still `new thread` — this is a better name where there is one, not a
 * different fallback.
 */
export function nameOf(entries: readonly AgentEntry[], fallback = "new thread"): string {
	const written: string[] = [];
	const walk = (rows: readonly AgentRow[]) => {
		for (const row of rows) {
			// a delegate's writes are the thread's writes: the frames are out on the canvas
			// either way, and which process authored one is not what the name is about
			walk(row.delegated);
			if (row.verb !== "write" || row.frame === null) continue;
			if (!written.includes(row.frame)) written.push(row.frame);
		}
	};
	walk(entries.filter((entry): entry is AgentRow => entry.kind === "row"));
	if (written.length === 0) return askOf(entries, fallback);
	const shown = written.slice(0, SHOWN).join(", ");
	return written.length > SHOWN ? `${shown} +${written.length - SHOWN}` : shown;
}

/**
 * What a picture the daemon says a restart caught mid-turn looks like once it is cut
 * (#120).
 *
 * A restart marks a thread stopped and never resumes it, because a reboot is not a hand:
 * an agent has write access to the repo, and re-running one minutes later because a
 * background process came back up is spool taking an action nobody asked for at that
 * moment. So the picture is settled here rather than restarted — every row that was
 * still running stops, every open beat closes on the last thing that happened, and the
 * log ends on spool's own word for a turn that did not finish.
 *
 * It is the same aftermath a press already derives, expressed on the finished entries
 * because that is all a restored thread has: the events are gone, and #120 stored the
 * drawing rather than the stream on purpose.
 *
 * Idempotent, and it has to be: what comes out of here is what gets written back, so a
 * second restore must not stack a second boundary on it.
 */
export function cutPicture(entries: readonly AgentEntry[]): AgentEntry[] {
	const cut = entries.map((entry) => {
		if (entry.kind === "row") {
			return entry.state === "running"
				? { ...entry, state: "stopped" as const, delegated: cutRows(entry.delegated) }
				: { ...entry, delegated: cutRows(entry.delegated) };
		}
		if (entry.kind === "beat" && entry.until === null) {
			return { ...entry, state: "stopped" as const, until: entry.since };
		}
		// a request nobody can answer any more: there is no process left for an answer to
		// reach, so it reads as the one nobody answered rather than as one still open
		if (entry.kind === "ask" && (entry.state === "open" || entry.state === "arriving")) {
			return { ...entry, state: "dropped" as const };
		}
		return entry;
	});
	const ended = cut.at(-1);
	if (ended?.kind === "note" && ended.text === STOPPED) return cut;
	return [...cut, { key: "restart", kind: "note", text: STOPPED }];
}

/** spool's own word for a turn that did not end cleanly, which the transcript owns */
const STOPPED = "stopped";

function cutRows(rows: readonly Extract<AgentEntry, { kind: "row" }>[]): Extract<AgentEntry, { kind: "row" }>[] {
	return rows.map((row) => (row.state === "running" ? { ...row, state: "stopped" as const } : row));
}
