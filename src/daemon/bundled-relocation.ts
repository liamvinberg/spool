import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writePrivate } from "./bundled-store";

const uuid = z.string().uuid();
const change = z.object({ id: uuid, kind: z.enum(["sessions", "recovery"]), before: z.string(), after: z.string() });
const prepared = z.object({ root: z.string(), target: z.string(), sessions: z.array(uuid), changes: z.array(change) });
export type BundledRelocation = z.infer<typeof prepared>;

export function relocationPath(directory: string, token: string): string {
	return join(directory, "renames", `${uuid.parse(token)}.json`);
}
export function readRelocation(directory: string, token: string): BundledRelocation {
	return prepared.parse(JSON.parse(readFileSync(relocationPath(directory, token), "utf8")));
}

/** The host validates ownership and stages exact bytes while its sessions are reserved. */
export function prepareRelocation(
	directory: string,
	root: string,
	target: string,
	sessions: readonly string[],
): string {
	const changes: BundledRelocation["changes"] = [];
	for (const id of sessions) {
		uuid.parse(id);
		for (const kind of ["sessions", "recovery"] as const) {
			const path = join(directory, kind, `${id}.${kind === "sessions" ? "jsonl" : "json"}`);
			if (!existsSync(path)) continue;
			const before = readFileSync(path, "utf8");
			let after: string;
			if (kind === "sessions") {
				const end = before.indexOf("\n");
				const header = JSON.parse(end === -1 ? before : before.slice(0, end));
				if (header.type !== "session" || header.id !== id || header.cwd !== root)
					throw new Error("Saved bundled session is invalid");
				after = JSON.stringify({ ...header, cwd: target }) + (end === -1 ? "" : before.slice(end));
			} else {
				const pending = JSON.parse(before);
				if (pending.root !== root) throw new Error("Pending request belongs to another project");
				after = JSON.stringify({ ...pending, root: target });
			}
			changes.push({ id, kind, before, after });
		}
	}
	const token = randomUUID();
	writePrivate(relocationPath(directory, token), JSON.stringify({ root, target, sessions, changes }));
	return token;
}

/** Called inside the folder/registry transaction; every write joins its same rollback stack. */
export function applyRelocation(
	directory: string,
	token: string,
	root: string,
	target: string,
	sessions: readonly string[],
	restore: (() => void)[],
): void {
	const plan = readRelocation(directory, token);
	if (
		plan.root !== root ||
		plan.target !== target ||
		JSON.stringify([...plan.sessions].sort()) !== JSON.stringify([...sessions].sort())
	)
		throw new Error("Prepared bundled rename does not match this project");
	for (const change of plan.changes) {
		if (!sessions.includes(change.id)) throw new Error("Session belongs to another project");
		const path = join(directory, change.kind, `${change.id}.${change.kind === "sessions" ? "jsonl" : "json"}`);
		if (readFileSync(path, "utf8") !== change.before) throw new Error("Bundled conversation changed during rename");
		writePrivate(path, change.after);
		restore.push(() => writePrivate(path, change.before));
	}
}
