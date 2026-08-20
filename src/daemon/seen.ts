import { type Dirent, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";

/**
 * What you have looked at, per project, in design/.spool/seen.json.
 *
 * An agent writes six frames while you are somewhere else. When you come back
 * the canvas is the canvas — same field, same names — and the six that are new
 * are indistinguishable from the eighty that are not. Looking has no memory, so
 * this is the memory: one number per frame, the revision you last saw it at.
 *
 * A frame's revision is the newest write inside its own folder. That scope is
 * the rule rather than a shortcut: editing a shared/ component would otherwise
 * mark forty frames unread at once, which is noise about one edit. What the
 * record answers is whether *this frame's* files moved since you looked.
 *
 * Two states fall out of one comparison. No entry at all is `new`; an entry
 * older than the folder's newest write is `changed`. Deleted frames keep their
 * entries — a stale line is forty bytes, and pruning would lose the record of a
 * frame a collision is briefly hiding.
 *
 * The file lives beside state.json and walked.json, which is what makes it
 * per-person without any keying: .spool/ is app-owned and gitignored, so it
 * never travels with the project. It is deliberately not in ~/.spool — a
 * project that moves takes its record with it.
 *
 * First read of a project seeds the whole record and reports nothing unseen.
 * You cannot be behind on frames that existed before spool started counting,
 * and the alternative is an upgrade that greets you with 88 unread frames.
 */

export type Unseen = "new" | "changed";

/** A frame and where its folder is, which is all the revision needs. */
export interface SeenFrame {
	readonly name: string;
	readonly dir: string;
}

interface SeenFile {
	version: 1;
	/** frame name → the revision it was last looked at, ms epoch */
	frames: Record<string, number>;
}

/** How deep inside a frame folder a write still counts as that frame moving. */
const MAX_DEPTH = 4;

/**
 * The one file inside a frame folder that a write does not count.
 *
 * frame.json is geometry, which is hands-owned: dragging a frame across the
 * canvas rewrites it, and spool itself writes one the first time a frame is
 * placed. Neither is news about the frame, and counting them would mark a frame
 * unread for the person who just moved it.
 */
const NOT_SOURCE = "frame.json";

function seenFile(root: string): string {
	const designDir = realDesignDir(root);
	return resolveDesignPath(designDir, join(designDir, ".spool", "seen.json"));
}

function readRecord(root: string): Record<string, number> | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(seenFile(root), "utf8"));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		// absent, or bytes nobody can read: both mean no record yet
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
	const frames = (parsed as { frames?: unknown }).frames;
	if (typeof frames !== "object" || frames === null || Array.isArray(frames)) return undefined;
	const record: Record<string, number> = {};
	for (const [name, at] of Object.entries(frames as Record<string, unknown>)) {
		if (typeof at === "number" && Number.isFinite(at)) record[name] = at;
	}
	return record;
}

function writeRecord(root: string, record: Record<string, number>): void {
	const sorted: Record<string, number> = {};
	for (const name of Object.keys(record).sort()) sorted[name] = record[name] ?? 0;
	const file: SeenFile = { version: 1, frames: sorted };
	writeAtomic(seenFile(root), `${JSON.stringify(file, null, "\t")}\n`);
}

/**
 * The newest write inside a frame's folder, ms epoch.
 *
 * A directory's own mtime does not move when a file inside it is rewritten in
 * place, which is exactly what an agent editing frame.tsx does, so this reads
 * the files. Everything but the geometry sidecar counts. Directory entries are
 * never symlinks and lstat never follows one, so nothing here leaves design/.
 */
export function folderTouched(dir: string): number {
	let newest = 0;
	const walk = (at: string, depth: number): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(at, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (depth === 0 && entry.name === NOT_SOURCE) continue;
			const path = join(at, entry.name);
			if (entry.isDirectory()) {
				if (depth < MAX_DEPTH) walk(path, depth + 1);
				continue;
			}
			try {
				newest = Math.max(newest, Math.round(lstatSync(path).mtimeMs));
			} catch {
				// a file that vanished mid-walk says nothing about the frame
			}
		}
	};
	walk(dir, 0);
	return newest;
}

/** The verdict on one frame, given what the record holds and what disk says. */
export function verdict(recorded: number | undefined, touched: number): Unseen | undefined {
	if (recorded === undefined) return "new";
	return touched > recorded ? "changed" : undefined;
}

/**
 * What is unseen right now, seeding the record on a project that has none.
 *
 * The seed is a write on a read, which the projection already does for a frame
 * that has no placement yet. A read-only checkout simply keeps answering
 * "nothing unseen", which is the safe half of being wrong.
 */
export function unseenNow(root: string, frames: readonly SeenFrame[]): Map<string, Unseen> {
	const record = readRecord(root);
	if (record === undefined) {
		const seeded: Record<string, number> = {};
		for (const frame of frames) seeded[frame.name] = folderTouched(frame.dir);
		try {
			writeRecord(root, seeded);
		} catch (error) {
			if (error instanceof DesignBoundaryError) throw error;
		}
		return new Map();
	}
	const marks = new Map<string, Unseen>();
	for (const frame of frames) {
		const mark = verdict(record[frame.name], folderTouched(frame.dir));
		if (mark !== undefined) marks.set(frame.name, mark);
	}
	return marks;
}

/**
 * These frames have been looked at, as of now.
 *
 * Now rather than the revision the canvas was showing: the canvas hot-reloads a
 * frame the moment its source moves, so what is on screen when a person marks it
 * seen is what is on disk. Names the project does not hold are ignored, so a
 * stale batch from a browser that missed a delete writes nothing about it.
 */
export function markSeen(root: string, frames: readonly SeenFrame[], names: readonly string[]): void {
	const wanted = new Set(names);
	const here = frames.filter((frame) => wanted.has(frame.name));
	if (here.length === 0) return;
	const record = readRecord(root) ?? {};
	for (const frame of here) record[frame.name] = folderTouched(frame.dir);
	writeRecord(root, record);
}
