import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Write-then-rename, the one shape every spool store uses: a reader never
 * sees a half-written registry, session, state file, or thumbnail.
 */
export function writeAtomic(file: string, data: string | Buffer): void {
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.${randomUUID()}.tmp`;
	try {
		// wx never follows a pre-planted symlink. The random name also keeps
		// concurrent writers from sharing a staging file.
		writeFileSync(tmp, data, { flag: "wx" });
		renameSync(tmp, file);
	} finally {
		rmSync(tmp, { force: true });
	}
}
