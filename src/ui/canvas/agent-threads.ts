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
 * The name is what the thread wrote, derived on read and stored nowhere (`nameOf` below
 * carries the argument). Nothing is borrowed and nothing is generated: the binary's own
 * title never reaches print mode — it is absent from both parent captures and from a
 * fresh three-turn print-mode session, in its output and in its own transcript file —
 * and spool naming a conversation with a side call to a cheap model was rejected as
 * silent spend on somebody's own subscription for a label.
 */

/**
 * Five lives, and every one of them draws a mark.
 *
 *   streaming   working, in the thread you are looking at. The same turning ring
 *               `running` draws, because the cell is the one place in a column that
 *               says whether a thread is moving, and the thread you are watching is
 *               the one you are most likely to be waiting on. Which one is open is the
 *               accent's to say, and it says it whether the thread is moving or not.
 *   running     working somewhere you are not looking. A turning ring, colourless,
 *               because state in this rail is motion and the one accent belongs to the
 *               selection.
 *   waiting     stopped, and only a person can move it. The disc held inside that
 *               ring, and the loudest of them on purpose: it is the only one that is
 *               actually stuck.
 *   unread      it finished while you were away and nobody has read it. A solid dot at
 *               text strength, the way a mailbox says it, and still not the accent.
 *   read        an old thread, and out here it has no name beside it, so the mark is
 *               the whole of the thread. A hollow dot: present, and spent.
 */
export type Life = "streaming" | "running" | "waiting" | "unread" | "read";

/**
 * What the column draws of one thread: a mark in it, and the rest behind a hover (#205).
 *
 * `name` is derived rather than stored, and it is not the `ask` the record on disk keeps:
 * an ask is the first thing a person said and stays true whatever the thread went on to
 * write, while the name is recomputed from the entries every time they are read.
 *
 * `at` and `last` are the flyout's. They are fields rather than a second read of the
 * entries because the fold that derives the name has both in its hand already.
 */
export interface Thread {
	readonly id: string;
	/** what it wrote, or the ask where it has written nothing yet */
	readonly name: string;
	readonly life: Life;
	/** unix ms of the last thing that happened in it, which the flyout says as an age */
	readonly at: number;
	/** the last line it drew, in the rail's own nouns, or empty where it has drawn none */
	readonly last: string;
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
 * and no look reaches it. A column that spent the disc on waiting would go silent about a
 * thread that will never finish, which is the one case the column exists for.
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

/**
 * What a thread with nothing in it is called.
 *
 * It is the machine saying there is nothing to say yet rather than a name anybody chose,
 * which is why the nameplate draws it dimmed: exported so the one surface that has to tell
 * a name from its absence tests the same string both fallbacks produce.
 */
export const UNSAID = "new thread";

/** the human's own first sentence, which is what a thread falls back to being called */
export function askOf(entries: readonly AgentEntry[], fallback = UNSAID): string {
	const said = entries.find((entry) => entry.kind === "user");
	return said?.kind === "user" && said.text.trim() !== "" ? said.text : fallback;
}

/** two names and then a count: past this a nameplate is a list, and a list is the deck's job */
const SHOWN = 2;

/**
 * The verbs that mean the agent changed the file rather than looked at it.
 *
 * Both of them, and the second is the one that matters: `agent-nouns.ts` sends `Write` to
 * `write` and `Edit`, `MultiEdit` and `NotebookEdit` all to `edit`, so a thread working on
 * frames that already exist — which is most of them — produces no `write` at all. A rule
 * that read only `write` would name almost every real thread after its ask and look like it
 * was working.
 *
 * It reads the verb because that is all a row carries: `agent-nouns.ts` computes a `writes`
 * flag and `AgentRow` does not keep it, so the string is the only fact that survives to
 * here. Promoting that flag onto the row would put this in one place instead of two.
 */
const CHANGED = new Set(["write", "edit"]);

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
export function nameOf(entries: readonly AgentEntry[], fallback = UNSAID): string {
	const written: string[] = [];
	const walk = (rows: readonly AgentRow[]) => {
		for (const row of rows) {
			// a delegate's writes are the thread's writes: the frames are out on the canvas
			// either way, and which process authored one is not what the name is about
			walk(row.delegated);
			if (!CHANGED.has(row.verb) || row.frame === null) continue;
			if (!written.includes(row.frame)) written.push(row.frame);
		}
	};
	walk(entries.filter((entry): entry is AgentRow => entry.kind === "row"));
	if (written.length === 0) return askOf(entries, fallback);
	const shown = written.slice(0, SHOWN).join(", ");
	return written.length > SHOWN ? `${shown} +${written.length - SHOWN}` : shown;
}

/**
 * The last line the thread drew, in the rail's own nouns (#205).
 *
 * Rows only, and the last of them: it is what the thread is *doing*, which the name cannot
 * say because the name is the frames it has touched and carries no verb. A message is not a
 * line — prose is paragraphs and the flyout has one line to spend — and a delegate's rows
 * are not either, because the transcript keeps them inside the row that launched them.
 *
 * Empty where a thread has drawn no row at all, which the flyout words itself.
 */
export function lastOf(entries: readonly AgentEntry[]): string {
	const rows = entries.filter((entry): entry is AgentRow => entry.kind === "row");
	const last = rows.at(-1);
	if (last === undefined) return "";
	return last.subject === null ? last.verb : `${last.verb} ${last.subject}`;
}

/**
 * What a picture the daemon says a restart caught mid-turn looks like once it is cut
 * (#120).
 *
 * A restart marks a thread stopped and never resumes it, because a reboot is not a hand:
 * an agent has write access to the repo, and re-running one minutes later because a
 * background process came back up is spool taking an action nobody asked for at that
 * moment. So the picture is settled here rather than restarted — every row that was
 * still running stops, every question nobody can answer any more reads as one nobody
 * answered, and the log ends on spool's own word for a turn that did not finish.
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
				? { ...entry, state: "stopped" as const, step: null, delegated: cutRows(entry.delegated) }
				: { ...entry, delegated: cutRows(entry.delegated) };
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
	return rows.map((row) => (row.state === "running" ? { ...row, state: "stopped" as const, step: null } : row));
}
