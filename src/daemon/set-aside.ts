import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { writeAtomic } from "../atomic-write";
import { resolveDesignPath } from "./design-path";

/**
 * Set-aside marks: what this machine knows about its own saves that lost a collision in a team project.
 *
 * When a save reaches the team after a teammate's to the same file, the team keeps it in its history and never
 * applies it, and this machine's disk takes the team's version. The save itself is kept here too, in
 * `design/.spool`, which never travels, so the canvas can mark each frame that renders the file and offer to
 * compare it, put it back, or hand it to the agent. A delete of this machine's that a teammate's edit undid is
 * marked the same way: an edit beats a delete, and the deleter is told.
 *
 * One mark per path: a later collision on the same file replaces the earlier one. A mark goes when it is acted on,
 * dismissed, or when this machine's own next save of the file reaches the team, since that save is the answer.
 * How long the team keeps set-aside saves in its history is the history's to decide, not this file's.
 */
export interface SetAsideMark {
	id: string;
	/** The file, relative to design/. */
	path: string;
	/** `set-aside`: this machine's save lost to a teammate's. `restored`: its delete lost to a teammate's edit. */
	kind: "set-aside" | "restored";
	/** This machine's side was a delete, so there are no bytes of its own to show or put back. */
	deleted: boolean;
	/** The team version that stands. */
	version: number;
	/** Whose save stands, and from which machine. */
	by: { accountId: string; device: string } | null;
	at: number;
	/**
	 * Marks that arrived together share a batch: everything a reconnect's catch-up set aside is one. A batch of
	 * more than a handful is shown as one summary instead of a mark on every frame.
	 */
	batch: string;
}

/** The marks, and how many arrived in each batch, which stays what it was as they are acted on. */
interface Marks {
	marks: SetAsideMark[];
	batches: Record<string, number>;
}

function marksDir(designDir: string): string {
	return resolveDesignPath(designDir, join(designDir, ".spool", "set-aside"));
}

function marksFile(designDir: string): string {
	return join(marksDir(designDir), "marks.json");
}

function readAll(designDir: string): Marks {
	try {
		const { marks, batches } = JSON.parse(readFileSync(marksFile(designDir), "utf8")) as Partial<Marks>;
		return {
			marks: Array.isArray(marks) ? marks : [],
			batches: typeof batches === "object" && batches !== null ? batches : {},
		};
	} catch {
		return { marks: [], batches: {} };
	}
}

export function readMarks(designDir: string): SetAsideMark[] {
	return readAll(designDir).marks;
}

/** How many marks arrived in a batch, those already acted on included. */
export function batchSize(designDir: string, batch: string): number {
	return readAll(designDir).batches[batch] ?? 0;
}

function writeMarks(designDir: string, marks: readonly SetAsideMark[], batches: Record<string, number>): void {
	// a batch is remembered while any of its marks is
	const kept = Object.fromEntries(
		Object.entries(batches).filter(([batch]) => marks.some((mark) => mark.batch === batch)),
	);
	writeAtomic(marksFile(designDir), `${JSON.stringify({ marks, batches: kept }, null, "\t")}\n`);
}

/** Where a mark keeps this machine's side of the file, named as the file is, so an agent reads it as one. */
export function markFile(designDir: string, mark: Pick<SetAsideMark, "id" | "path">): string {
	return join(marksDir(designDir), mark.id, basename(mark.path));
}

/** Mark a file, with this machine's bytes of it, or none for a delete; any earlier mark on it goes. */
export function recordMark(
	designDir: string,
	mark: Omit<SetAsideMark, "id" | "at" | "deleted">,
	bytes: Uint8Array | undefined,
): SetAsideMark {
	const recorded: SetAsideMark = { ...mark, id: randomUUID(), at: Date.now(), deleted: bytes === undefined };
	if (bytes !== undefined) writeAtomic(markFile(designDir, recorded), Buffer.from(bytes));
	const { marks, batches } = readAll(designDir);
	const kept = marks.filter((held) => {
		if (held.path !== mark.path) return true;
		dropBytes(designDir, held);
		return false;
	});
	writeMarks(designDir, [...kept, recorded], { ...batches, [mark.batch]: (batches[mark.batch] ?? 0) + 1 });
	return recorded;
}

/** This machine's side of a marked file, or nothing for a delete. */
export function markBytes(designDir: string, mark: SetAsideMark): Buffer | undefined {
	if (mark.deleted) return undefined;
	try {
		return readFileSync(markFile(designDir, mark));
	} catch {
		return undefined;
	}
}

/** Take marks away, by id or by path; says whether any went. */
export function forgetMarks(designDir: string, which: { id: string } | { path: string }): boolean {
	const { marks, batches } = readAll(designDir);
	const going = marks.filter((mark) => ("id" in which ? mark.id === which.id : mark.path === which.path));
	if (going.length === 0) return false;
	for (const mark of going) dropBytes(designDir, mark);
	writeMarks(
		designDir,
		marks.filter((mark) => !going.includes(mark)),
		batches,
	);
	return true;
}

function dropBytes(designDir: string, mark: SetAsideMark): void {
	rmSync(join(marksDir(designDir), mark.id), { recursive: true, force: true });
}
