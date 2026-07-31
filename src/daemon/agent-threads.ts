import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";

/**
 * The threads of one project, on disk, where a daemon restart cannot reach them
 * (#120, #136, #200).
 *
 * Spool keeps a picture of the rail and the picture is the whole of it. The session
 * id is the thread, the picture is only a picture, and the id wins whenever they
 * disagree — which is why a thread's id is a uuid spool minted before the first
 * process existed, handed to the binary as its session id and used to resume it
 * afterwards.
 *
 * Why disk rather than daemon memory: `spool upgrade` stops and restarts the daemon
 * on purpose, and launchd restarts it on crash and on login. A daemon restart is
 * routine, so memory alone would delete the visible thread every time spool updated
 * itself.
 *
 * What is stored is what the rail draws, and this module does not know what that is.
 * The fold from the event union to entries lives in the rail, so the rail is what
 * writes them; the envelope below is spool's own bookkeeping and the entries ride
 * through as the JSON they already are. A second fold down here would be a second
 * copy of the vocabulary to keep in sync, which is the one thing #120 bought by
 * storing the drawing rather than the stream.
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
export interface StoredThread {
	/** the uuid spool minted, which is also the agent's session id */
	readonly id: string;
	/** what the human asked, in the human's words */
	readonly ask: string;
	/** the rail's own life for it when it was last written */
	readonly life: StoredLife;
	/** unix ms of the last thing that happened in it, which is the strip's order */
	readonly at: number;
	/** the drawn transcript, exactly as the rail drew it */
	readonly entries: ThreadPicture;
	/** the plan the turn wrote, which is drawn state and so is stored state */
	readonly plan: unknown;
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
}

/**
 * Where one project's threads live.
 *
 * Keyed by a hash of the canonical root rather than by its path: the registry keys by
 * root inside JSON, where a path is a value, and this needs a directory name. A root can
 * hold anything a filesystem allows, so slugging it would be a second encoding to get
 * right and a collision to answer for.
 */
function threadsDir(spoolDir: string, root: string): string {
	return join(spoolDir, "threads", createHash("sha256").update(root).digest("hex").slice(0, 16));
}

/** the id is a uuid, and nothing else is ever read off disk or accepted from a client */
export function isThreadId(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

/** what a client may say about a thread, which is the envelope minus spool's own flags */
export type ThreadPut = Omit<StoredThread, "id" | "stopped" | "closed">;

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
	return {
		ask: record.ask,
		life: record.life as StoredLife,
		at: typeof record.at === "number" ? record.at : Date.now(),
		entries: record.entries,
		plan: record.plan ?? null,
	};
}

/** one thread's file, which carries spool's own two flags on top of the envelope */
function parseThread(value: unknown): StoredThread | undefined {
	const envelope = parseEnvelope(value);
	if (envelope === undefined) return undefined;
	const record = value as Record<string, unknown>;
	if (!isThreadId(record.id)) return undefined;
	if (typeof record.stopped !== "boolean" || typeof record.closed !== "boolean") return undefined;
	return { id: record.id, ...envelope, stopped: record.stopped, closed: record.closed };
}

/**
 * Strict on the way in, because a client is writing it (#12's own rule for state).
 *
 * `stopped` and `closed` are not takeable from a client at all: the first is what a restart
 * does to a thread and the second is its own door.
 */
export function parseThreadPut(value: unknown): ThreadPut | undefined {
	return parseEnvelope(value);
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
export function putThread(spoolDir: string, root: string, id: string, put: ThreadPut): void {
	const had = readThread(spoolDir, root, id);
	writeThread(spoolDir, root, {
		id,
		...put,
		// a thread the hands are sending into is a thread that is running again, so a new
		// turn is what clears the mark a restart left on it
		stopped: false,
		closed: had?.closed ?? false,
	});
}

function threadFile(spoolDir: string, root: string, id: string): string {
	return join(threadsDir(spoolDir, root), `${id}.json`);
}

export function readThread(spoolDir: string, root: string, id: string): StoredThread | undefined {
	if (!isThreadId(id)) return undefined;
	try {
		return parseThread(JSON.parse(readFileSync(threadFile(spoolDir, root, id), "utf8")));
	} catch {
		// a thread nobody can read is one thread, and the strip still holds the rest
		return undefined;
	}
}

export function writeThread(spoolDir: string, root: string, thread: StoredThread): void {
	writeAtomic(threadFile(spoolDir, root, thread.id), `${JSON.stringify(thread, null, "\t")}\n`);
}

/**
 * Every thread this project has, oldest first.
 *
 * Closed ones are left out and left on disk. Closing a tab tidies it out of the strip
 * and deletes neither the agent's session nor spool's picture, on #120's grounds: spool
 * does not throw away a readable record because a tab was put away.
 */
export function readThreads(spoolDir: string, root: string): StoredThread[] {
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
		if (thread !== undefined && !thread.closed) threads.push(thread);
	}
	return threads.sort((one, two) => one.at - two.at);
}

/**
 * A thread's picture, and whether the agent's own session is still there to continue.
 *
 * The two are separate facts and the answer keeps them separate. A thread whose session
 * has aged out reads as finished: its transcript is intact, and the composer says a new
 * thread starts here rather than offering a resume that would fail.
 */
export function serveThreads(
	spoolDir: string,
	root: string,
	{ live, env = process.env }: { live: ReadonlySet<string>; env?: Readonly<Record<string, string | undefined>> },
): ServedThread[] {
	return readThreads(spoolDir, root).map((thread) => {
		/*
		 * A restart marks a thread stopped and never resumes it, because a reboot is not a
		 * hand. An agent has write access to the repo, and re-running one minutes later
		 * because a background process came back up is spool taking an action nobody asked
		 * for at that moment.
		 *
		 * What identifies one is the store against this daemon's own live turns: a thread
		 * whose picture says a process was up, with nothing running under that id here,
		 * lost its process to something that was not a hand. It costs nearly nothing to
		 * pick up — the agent's memory is intact and one word resumes it.
		 */
		const cut = WORKING.has(thread.life) && !live.has(thread.id);
		const stopped = thread.stopped || cut;
		return {
			...thread,
			stopped,
			// a thread that was working when the lights went out has changed since anybody
			// looked at it, and the change is that it stopped
			life: cut ? "unread" : thread.life,
			continuable: sessionExists(root, thread.id, env),
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

/**
 * Where the binary keeps a session, and the only thing spool reads about one.
 *
 * Existence and nothing else. The file is the binary's own transcript in a shape spool
 * deliberately does not parse — #120 read it and found `user`, `assistant`,
 * `attachment`, `queue-operation`, `mode` and `last-prompt`, which is not the
 * `stream-json` union the adapter speaks — so this is a question about whether a resume
 * can work, never a second source of history.
 *
 * `CLAUDE_CONFIG_DIR` is honoured because the spawn inherits the environment whole: an
 * agent whose config lives elsewhere keeps its sessions there too, and a check against
 * the default would call every one of its threads dead.
 */
export function sessionFile(root: string, id: string, env: Readonly<Record<string, string | undefined>>): string {
	// empty reads as unset, which is the convention the rest of spool's env reading uses
	const set = (name: string) => ((env[name] ?? "") === "" ? undefined : env[name]);
	const config = set("CLAUDE_CONFIG_DIR") ?? join(set("HOME") ?? homedir(), ".claude");
	// the binary's own slug for a working directory: every character that is not a letter
	// or a digit becomes a dash, leading separator included
	return join(config, "projects", root.replace(/[^a-zA-Z0-9]/g, "-"), `${id}.jsonl`);
}

export function sessionExists(root: string, id: string, env: Readonly<Record<string, string | undefined>>): boolean {
	return existsSync(sessionFile(root, id, env));
}
