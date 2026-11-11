import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readDesignFile, writeDesignFile } from "./disk";

/**
 * A deck change written as one transaction (spool#265): its `deck.json`, its sidecars and its notes land
 * together or not at all. The words of a note are never only in memory: before the first write, a record of every
 * file's bytes before and after goes into `design/.spool/deck-changes/`, which stays on this machine; a write that
 * fails puts back what was written from memory and rethrows; and the record goes only once the whole change has landed,
 * or been put back. A record found later is a change the daemon died inside, and is put back by `recoverDeckChanges`.
 */

/** One file of a change: its path under `design/`, and its bytes before and after it, `null` being no file. */
export interface Step {
	readonly path: string;
	readonly before: string | null;
	readonly after: string | null;
}

interface Record {
	readonly page: string;
	readonly steps: readonly Step[];
	/** the daemon writing it, and when that process started: another daemon on the same design/ leaves it alone */
	readonly pid?: number;
	readonly started?: number;
}

/** When this process started, in milliseconds, which with its pid names it apart from a later one given the same pid. */
const STARTED = Math.round(Date.now() - process.uptime() * 1000);

const RECORDS = join(".spool", "deck-changes");

/** A change's steps written in order, whole or not at all. What did not change is not written. */
export function commitSteps(designDir: string, page: string, steps: readonly Step[]): void {
	const writes = steps.filter((step) => step.before !== step.after);
	if (writes.length === 0) return;
	const dir = join(designDir, RECORDS);
	mkdirSync(dir, { recursive: true });
	const record = join(dir, `${randomUUID()}.json`);
	const body: Record = { page, steps: writes, pid: process.pid, started: STARTED };
	// staged under a name recovery passes over, so a record it reads is always whole
	const staged = `${record}.tmp`;
	writeFileSync(staged, JSON.stringify(body), { flag: "wx" });
	renameSync(staged, record);
	const done: Step[] = [];
	try {
		for (const step of writes) {
			done.push(step);
			writeDesignFile(designDir, step.path, step.after);
		}
	} catch (error) {
		// what landed goes back from memory, last first; the record stays when even that cannot be done
		let back = true;
		for (const step of done.reverse()) {
			try {
				// the write that failed most likely never landed, and its folder may refuse a write back too
				if (readDesignFile(designDir, step.path) !== step.before) putBack(designDir, step);
			} catch {
				back = false;
			}
		}
		if (back) rmSync(record, { force: true });
		throw error;
	}
	rmSync(record, { force: true });
}

/**
 * Every change the daemon died inside, put back as it was before it, whole or not at all: only while every one of its
 * files still holds the bytes of before or after the change, or is gone, so a hand's write since is never overwritten
 * and a change is never left half put back. One a hand has written over since stays as it is, its record kept as the
 * copy of the words it held, and its page is answered.
 */
export function recoverDeckChanges(designDir: string, log?: (line: string) => void): string[] {
	const dir = join(designDir, RECORDS);
	let names: string[];
	try {
		names = readdirSync(dir).filter((name) => name.endsWith(".json"));
	} catch {
		return [];
	}
	const kept: string[] = [];
	for (const name of names) {
		const file = join(dir, name);
		let record: Record;
		try {
			record = JSON.parse(readFileSync(file, "utf8")) as Record;
			if (!Array.isArray(record.steps)) throw new Error("no steps");
		} catch {
			// a record is renamed into place whole, so one that does not read is no change's: it holds nothing to put back
			rmSync(file, { force: true });
			continue;
		}
		// another daemon following this design/ may be inside its change right now: its record is its own to finish
		if (alive(record)) continue;
		// all or nothing: put back where a hand wrote one of its files since, and the rest would no longer match it
		let whole = true;
		const back: Step[] = [];
		try {
			for (const step of record.steps) {
				const now = readDesignFile(designDir, step.path);
				if (now === step.before) continue;
				if (now === step.after || now === null) back.push(step);
				else whole = false;
			}
			if (whole) for (const step of back.reverse()) putBack(designDir, step);
		} catch {
			whole = false;
		}
		if (whole) {
			rmSync(file, { force: true });
			log?.(`put back a deck change to "${record.page}" that stopped half way`);
		} else {
			kept.push(record.page);
			log?.(
				`a deck change to "${record.page}" stopped half way and its files changed since: ${join(RECORDS, name)}`,
			);
		}
	}
	return kept;
}

/**
 * Whether the daemon that wrote a record may still be inside its change, as some other process. A record of this pid
 * is this process's, never in flight while recovery runs since everything here is synchronous, or an earlier process's
 * given the same pid (its `started` differs), long gone. A live process that merely reuses a dead daemon's pid only
 * holds recovery back until it ends, the safe way round; a record naming no process is gone with its writer.
 */
function alive(record: Record): boolean {
	const { pid } = record;
	if (typeof pid !== "number" || pid === process.pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// a process that exists but is not ours to signal is still running
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

/** A file put back as it was, never into a folder that has gone since. */
function putBack(designDir: string, step: Step): void {
	try {
		writeDesignFile(designDir, step.path, step.before);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT" && !folderStands(designDir, step.path)) return;
		throw error;
	}
}

function folderStands(designDir: string, path: string): boolean {
	try {
		readdirSync(join(designDir, dirname(path)));
		return true;
	} catch {
		return false;
	}
}
