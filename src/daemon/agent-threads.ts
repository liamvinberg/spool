import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { type AgentOwnership, isThreadEngine, LEGACY_ENGINE, type ThreadEngine } from "./agent-engine";
import type { AgentEnded, AgentRecovery } from "./agent-events";

/**
 * The threads of one project, on disk, where a daemon restart cannot reach them
 * (#120, #136, #200).
 *
 * Each thread keeps immutable engine ownership and an engine-owned session reference,
 * separately from the picture the rail draws. Legacy threads keep their Claude session id.
 *
 * Why disk rather than daemon memory: `spool upgrade` stops and restarts the daemon
 * on purpose, and launchd restarts it on crash and on login. A daemon restart is
 * routine, so memory alone would delete the visible thread every time spool updated
 * itself.
 *
 * The picture uses the rail's transcript vocabulary. The rail checkpoints it while
 * watching; the daemon uses that same pure fold to save the ending when nobody is
 * watching. The envelope keeps the draft and queue independently of that final fold.
 *
 * One file per thread, atomically written. A file per thread rather than a list is
 * what keeps a bad byte cheap: an unreadable thread costs that thread and the strip
 * still holds the rest, where one list would cost the project.
 */

/** the drawn picture, opaque here on purpose: the rail owns the vocabulary */
export type ThreadPicture = readonly unknown[];

/**
 * One thread as it survives, which is an envelope and a picture.
 *
 * `ask` is the name, and there is nothing else it could be: the binary's generated
 * title is an interactive-TUI feature that print mode never emits, and spool naming a
 * conversation with a side call to a cheap model is silent spend on somebody's own
 * subscription for a label.
 */
export interface StoredThread extends AgentOwnership {
	/** the uuid spool minted for the rail thread */
	readonly id: string;
	/** what the human asked, in the human's words */
	readonly ask: string;
	/** the rail's own life for it when it was last written */
	readonly life: StoredLife;
	/** unix ms of the last thing that happened in it, which is the strip's order */
	readonly at: number;
	/** the drawn transcript, exactly as the rail drew it */
	readonly entries: ThreadPicture;
	/**
	 * How many of those entries are not drawn from the turn in flight (#211).
	 *
	 * The boundary between the conversation and the turn on top of it, which only the rail
	 * knows: it holds the earlier turns as drawn entries and folds the live one out of its
	 * events every tick. A client coming back to a turn this daemon is still holding keeps
	 * this much of the picture and refolds the rest off the replayed log — where taking the
	 * whole picture would draw the live turn twice, once off disk and once off the wire.
	 *
	 * Everything, for a thread with nothing running: a stored picture with no turn under it
	 * is all conversation, which is also what a file written before #211 reads as.
	 */
	readonly kept: number;
	/** the plan the turn wrote, which is drawn state and so is stored state */
	readonly plan: unknown;
	/**
	 * What spool is holding until this turn ends, in the order it will fire (#170, #211).
	 *
	 * Stored for the reason the picture is: it lives in a browser, and a browser is the one
	 * place a thing can be lost by a keystroke. A refresh used to drop every queued message
	 * silently — the words were spool's to hold and spool held them in memory only.
	 *
	 * Opaque here, like the entries and for the same reason: what a queued message *is* is
	 * the rail's vocabulary, and a second opinion about its shape down here would be a
	 * second copy to keep in step.
	 */
	readonly queued: ThreadPicture;
	/**
	 * What the composer was holding and nobody had sent (#234).
	 *
	 * Stored for the reason the queue is: it lives in a browser. A stop hands every word it
	 * cancels back into the box, which made the box the place a whole turn's worth of typing
	 * could be sitting when the tab was refreshed — and it was memory only, so it went.
	 *
	 * Words rather than a drawing, so this one is a string: what is unsent has no vocabulary
	 * to keep in step, and a reference riding with it is bytes the disk has no business
	 * holding for something nobody has sent.
	 */
	readonly draft: string;
	readonly pending?: ThreadPicture;
	readonly recovery?: AgentRecovery | null;
	/** The last turn's outcome, so returning to a failed turn does not fire its queue. */
	readonly ending?: AgentEnded["ending"] | null;
	/** a restart caught this thread mid-turn: it stopped, and it is never resumed */
	readonly stopped: boolean;
	/** closing a tab tidies it out of the strip and deletes nothing */
	readonly closed: boolean;
}

/**
 * The lives that reach disk.
 *
 * `streaming` never does — it means *the thread in the rail right now*, which is a
 * fact about a browser rather than about the thread — so a thread that was streaming
 * is stored as `running`, which is what it was doing.
 */
export type StoredLife = "running" | "waiting" | "unread" | "read";

const STORED: readonly StoredLife[] = ["running", "waiting", "unread", "read"];

/** the two lives that mean a process was up when the picture was written */
const WORKING: ReadonlySet<StoredLife> = new Set<StoredLife>(["running", "waiting"]);

/**
 * A thread on its way out, with the two facts only the daemon can answer.
 *
 * `continuable` is the file-existence check #120 asked for. The binary deletes its own
 * session files after `cleanupPeriodDays`, thirty by default, so spool's picture
 * outlives the thing that makes it continuable — and a picture of a thread you cannot
 * continue is still worth reading. It just must not offer a button that fails.
 */
export interface ServedThread extends StoredThread {
	readonly continuable: boolean;
	/**
	 * This daemon is still holding a turn for it, so there is a stream to pick up (#211).
	 *
	 * Not the same fact as `stopped`, and the two are opposites on purpose: a thread whose
	 * picture says a process was up is either one this daemon can still show you — attach,
	 * replay, carry on — or one whose process went with something that was not a hand. Which
	 * of the two it is is the only thing the rail needs to decide between reconnecting and
	 * drawing a cut.
	 */
	readonly live: boolean;
}

/**
 * Where one project's threads live.
 *
 * Keyed by a hash of the canonical root rather than by its path: the registry keys by
 * root inside JSON, where a path is a value, and this needs a directory name. A root can
 * hold anything a filesystem allows, so slugging it would be a second encoding to get
 * right and a collision to answer for.
 */
export function threadsDir(spoolDir: string, root: string): string {
	return join(spoolDir, "threads", createHash("sha256").update(root).digest("hex").slice(0, 16));
}

/** the id is a uuid, and nothing else is ever read off disk or accepted from a client */
export function isThreadId(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

/** what a client may say about a thread, which is the envelope minus spool's own flags */
export type ThreadPut = Omit<StoredThread, "id" | "stopped" | "closed" | "engine" | "session"> & {
	readonly engine?: ThreadEngine;
	/**
	 * Where the entries carry on from, for a put that sends only the end of its picture
	 * (task 168). Absent, the entries are the whole picture.
	 */
	readonly after?: ThreadAfter;
};

/**
 * The part of the stored picture a put keeps: its first `count` entries, the last of which
 * is keyed `key`.
 *
 * A long conversation is mostly turns that are over, and a picture keeps every screenshot
 * a turn took. Written whole, a 60 MB chat cost the rail two seconds of a frozen window on
 * every save, which is every two seconds while a turn runs. So the rail sends what moved
 * since the daemon last took its picture, and says where that starts.
 *
 * The key is the check that the daemon's picture is still the one the rail last wrote: a
 * turn that ended with nobody watching, or another tab, writes its own, and the rail's
 * count would then be of somebody else's entries. A count that falls past the stored
 * picture or a key that differs is refused, and the rail writes the whole picture instead.
 */
export interface ThreadAfter {
	readonly count: number;
	readonly key: string;
}

/**
 * The envelope, wherever it came from.
 *
 * One reader for both doors, because the file on disk and the body a client sends are the
 * same object seen twice: a thread read back is a thread that was written. The entries are
 * the one field nothing here inspects, and deliberately so — they are the rail's vocabulary
 * and validating their shape would be this module holding an opinion about a drawing it
 * does not own. What is checked is that they are a list, which is the envelope's own claim.
 */
function parseEnvelope(value: unknown): ThreadPut | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	if (typeof record.ask !== "string" || record.ask === "") return undefined;
	if (!STORED.includes(record.life as StoredLife)) return undefined;
	if (!Array.isArray(record.entries)) return undefined;
	if (record.at !== undefined && (typeof record.at !== "number" || !Number.isFinite(record.at))) return undefined;
	// a picture with no boundary in it is a picture with nothing running under it, which is
	// what every file written before #211 is and what a finished thread means either way
	const kept =
		typeof record.kept === "number" && Number.isInteger(record.kept) && record.kept >= 0
			? Math.min(record.kept, record.entries.length)
			: record.entries.length;
	return {
		ask: record.ask,
		life: record.life as StoredLife,
		at: typeof record.at === "number" ? record.at : Date.now(),
		entries: record.entries,
		kept,
		plan: record.plan ?? null,
		queued: Array.isArray(record.queued) ? record.queued : [],
		// a file written before #234 held nothing unsent, which is the same fact as an empty box
		draft: typeof record.draft === "string" ? record.draft : "",
		...(Array.isArray(record.pending) ? { pending: record.pending } : {}),
		...(record.recovery === undefined ? {} : { recovery: parseRecovery(record.recovery) }),
		...(record.ending === "done" ||
		record.ending === "failed" ||
		record.ending === "stopped" ||
		record.ending === null
			? { ending: record.ending }
			: {}),
	};
}

/** one thread's file, which carries spool's own two flags on top of the envelope */
function parseThread(value: unknown): StoredThread | undefined {
	const envelope = parseEnvelope(value);
	if (envelope === undefined) return undefined;
	const record = value as Record<string, unknown>;
	if (!isThreadId(record.id)) return undefined;
	if (typeof record.stopped !== "boolean" || typeof record.closed !== "boolean") return undefined;
	const engine = record.engine === undefined ? "claude" : record.engine;
	if (!isThreadEngine(engine)) return undefined;
	const session = record.session === undefined && record.engine === undefined ? { id: record.id } : record.session;
	if (typeof session !== "object" || session === null || !("id" in session) || !isThreadId(session.id))
		return undefined;
	return {
		id: record.id,
		...envelope,
		engine,
		session: { id: session.id },
		stopped: record.stopped,
		closed: record.closed,
	};
}

/**
 * Strict on the way in, because a client is writing it (#12's own rule for state).
 *
 * `stopped` and `closed` are not takeable from a client at all: the first is what a restart
 * does to a thread and the second is its own door.
 */
export function parseThreadPut(value: unknown): ThreadPut | undefined {
	const envelope = parseEnvelope(value);
	if (envelope === undefined) return undefined;
	const record = value as Record<string, unknown>;
	if ("session" in record || (record.engine !== undefined && !isThreadEngine(record.engine))) return undefined;
	const engine = record.engine === undefined ? {} : { engine: record.engine as ThreadEngine };
	if (record.after === undefined) return { ...envelope, ...engine };
	const after = parseAfter(record.after);
	if (after === undefined) return undefined;
	// the boundary counts the whole picture, so it is checked against the whole picture once
	// the stored part is put back in front of these entries, not against these entries alone
	const kept =
		typeof record.kept === "number" && Number.isInteger(record.kept) && record.kept >= 0 ? record.kept : null;
	return { ...envelope, ...engine, kept: kept ?? after.count + envelope.entries.length, after };
}

function parseAfter(value: unknown): ThreadAfter | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { count, key } = value as { count?: unknown; key?: unknown };
	if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || typeof key !== "string") return undefined;
	return { count, key };
}

/**
 * One thread's picture, written whole (#120).
 *
 * A put replaces the drawing and keeps nothing of the old one, because the drawing is the
 * whole of the thread: there is no lossy tier and nothing to merge.
 *
 * It clears `stopped` and keeps `closed`, which is the difference between the two flags. A
 * thread being written to is a thread somebody is talking to again, so whatever a restart
 * said about it has been answered by the next turn. A tab that was put away stays put away:
 * nothing a client draws is a request to bring it back.
 */
export function putThread(spoolDir: string, root: string, id: string, { after, ...put }: ThreadPut): boolean | "moved" {
	if (!isThreadId(id)) return false;
	const had = readThread(spoolDir, root, id);
	if (had !== undefined && put.engine !== undefined && put.engine !== had.engine) return false;
	// the bundled engine's threads are only ever ones it left behind, never new ones
	if (had === undefined && put.engine === LEGACY_ENGINE) return false;
	let entries = put.entries;
	if (after !== undefined) {
		const last = had?.entries[after.count - 1];
		const key = typeof last === "object" && last !== null ? (last as { key?: unknown }).key : undefined;
		if (had === undefined || key !== after.key) return "moved";
		entries = [...had.entries.slice(0, after.count), ...put.entries];
	}
	writeThread(spoolDir, root, {
		id,
		...put,
		entries,
		kept: Math.min(put.kept, entries.length),
		engine: had?.engine ?? put.engine ?? "claude",
		session: had?.session ?? { id },
		// a thread the hands are sending into is a thread that is running again, so a new
		// turn is what clears the mark a restart left on it
		stopped: false,
		closed: had?.closed ?? false,
	});
	return true;
}

function threadFile(spoolDir: string, root: string, id: string): string {
	return join(threadsDir(spoolDir, root), `${id}.json`);
}

/**
 * The threads this daemon last read or wrote, by file, for as long as the file is still the
 * one they came from (task 168).
 *
 * A rail writes its picture every two seconds while a turn runs, and a write that carries
 * on from the stored part has to read that part first. A conversation that kept its
 * screenshots runs to tens of megabytes, and reading one back and writing it out again
 * held the daemon for half a second a time — the daemon that is streaming the turn. So
 * the last few are held parsed, and each entry's text is kept beside the entry it was
 * made from, so writing the picture again costs what changed and the disk.
 *
 * The file's size and change time are the check that nothing else wrote it since: a stale
 * hold is read again rather than trusted. Only a few are held, because each can be large.
 */
const recent = new Map<string, { readonly mtimeMs: number; readonly size: number; readonly thread: StoredThread }>();
const RECENT = 4;

function remember(file: string, thread: StoredThread): void {
	const { mtimeMs, size } = statSync(file);
	recent.delete(file);
	recent.set(file, { mtimeMs, size, thread });
	for (const old of recent.keys()) {
		if (recent.size <= RECENT) break;
		recent.delete(old);
	}
}

function held(file: string): StoredThread | undefined {
	const hold = recent.get(file);
	if (hold === undefined) return undefined;
	const { mtimeMs, size } = statSync(file);
	if (mtimeMs === hold.mtimeMs && size === hold.size) return hold.thread;
	recent.delete(file);
	return undefined;
}

/** each entry as the file spells it, made once per entry rather than once per write */
const spelled = new WeakMap<object, string>();

function spell(entry: unknown): string {
	if (typeof entry !== "object" || entry === null) return JSON.stringify(entry) ?? "null";
	const known = spelled.get(entry);
	if (known !== undefined) return known;
	// two tabs in, where the entries list sits in the file; a JSON string holds no raw line break
	const text = (JSON.stringify(entry, null, "\t") ?? "null").replaceAll("\n", "\n\t\t");
	spelled.set(entry, text);
	return text;
}

/** the file's text, the same as `JSON.stringify(thread, null, "\t")` spells it */
function threadText(thread: StoredThread): string {
	const mark = `spool-entries-${randomUUID()}`;
	const text = JSON.stringify(
		thread,
		(key, value: unknown) => (key === "entries" && value === thread.entries ? mark : value),
		"\t",
	);
	const list = thread.entries.length === 0 ? "[]" : `[\n\t\t${thread.entries.map(spell).join(",\n\t\t")}\n\t]`;
	return `${text.replace(`"${mark}"`, () => list)}\n`;
}

export function readThread(spoolDir: string, root: string, id: string): StoredThread | undefined {
	if (!isThreadId(id)) return undefined;
	try {
		const file = threadFile(spoolDir, root, id);
		const hold = held(file);
		if (hold !== undefined) return hold;
		const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
		const thread = parseThread(raw);
		if (thread !== undefined && typeof raw === "object" && raw !== null && !("engine" in raw)) {
			try {
				writeThread(spoolDir, root, thread);
			} catch {
				/* Keep a readable legacy record available when migration cannot be saved. */
			}
		}
		if (thread !== undefined && recent.get(file)?.thread !== thread) remember(file, thread);
		return thread;
	} catch {
		// a thread nobody can read is one thread, and the strip still holds the rest
		return undefined;
	}
}

export function writeThread(spoolDir: string, root: string, thread: StoredThread): void {
	const file = threadFile(spoolDir, root, thread.id);
	writeAtomic(file, threadText(thread));
	remember(file, thread);
}

/**
 * Every thread this project has, oldest first.
 *
 * Closed ones are left out and left on disk. Closing a tab tidies it out of the strip
 * and deletes neither the agent's session nor spool's picture, on #120's grounds: spool
 * does not throw away a readable record because a tab was put away.
 */
export function readThreads(spoolDir: string, root: string, includeClosed = false): StoredThread[] {
	let names: string[];
	try {
		names = readdirSync(threadsDir(spoolDir, root));
	} catch {
		return [];
	}
	const threads: StoredThread[] = [];
	for (const name of names) {
		if (!name.endsWith(".json")) continue;
		const thread = readThread(spoolDir, root, name.slice(0, -".json".length));
		if (thread !== undefined && (includeClosed || !thread.closed)) threads.push(thread);
	}
	return threads.sort((one, two) => one.at - two.at);
}

/**
 * Restore the rail picture against the turns this daemon still holds. The caller asks
 * each owning engine for continuability separately; a failed engine cannot hide history.
 */
export function serveThreads(
	spoolDir: string,
	root: string,
	{ live }: { live: ReadonlySet<string> },
): Omit<ServedThread, "continuable">[] {
	return readThreads(spoolDir, root).map((thread) => {
		/*
		 * A restart marks a thread stopped and never resumes it, because a reboot is not a
		 * hand. An agent has write access to the repo, and re-running one minutes later
		 * because a background process came back up is spool taking an action nobody asked
		 * for at that moment.
		 *
		 * What identifies one is the store against this daemon's own held turns: a thread
		 * whose picture says a process was up, with nothing held under that id here, lost its
		 * process to something that was not a hand. It costs nearly nothing to pick up — the
		 * agent's memory is intact and one word resumes it.
		 *
		 * It says far less than it used to, and that is #211 landing rather than a change of
		 * rule: a turn now outlives the request that streamed it, so a refresh no longer cuts
		 * one, and what is left here means what it always claimed to — the daemon went away.
		 */
		const held = live.has(thread.id);
		const cut = WORKING.has(thread.life) && !held && !thread.recovery;
		const stopped = thread.stopped || cut;
		return {
			...thread,
			stopped,
			// a thread that was working when the lights went out has changed since anybody
			// looked at it, and the change is that it stopped
			life: cut ? "unread" : thread.life,
			live: held,
		};
	});
}

/** the thread's own door: it leaves the strip, and every byte of it stays where it is */
export function closeThread(spoolDir: string, root: string, id: string): boolean {
	const thread = readThread(spoolDir, root, id);
	if (thread === undefined) return false;
	writeThread(spoolDir, root, { ...thread, closed: true });
	return true;
}

function parseRecovery(value: unknown): AgentRecovery | null {
	if (typeof value !== "object" || value === null) return null;
	const data = value as Record<string, unknown>;
	if (
		(data.kind !== "login" && data.kind !== "limit") ||
		typeof data.account !== "string" ||
		(data.scope !== "account" && data.scope !== "model" && data.scope !== "unknown")
	)
		return null;
	return {
		kind: data.kind,
		account: data.account,
		scope: data.scope,
		...(typeof data.token === "string" ? { token: data.token } : {}),
		...(typeof data.offer === "string" ? { offer: data.offer } : {}),
		...(typeof data.resetsAt === "number" && Number.isFinite(data.resetsAt) ? { resetsAt: data.resetsAt } : {}),
	};
}
