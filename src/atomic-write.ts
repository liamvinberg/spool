import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Write-then-rename, the one shape every spool store uses: a reader never
 * sees a half-written registry, session, state file, or thumbnail.
 */
export function writeAtomic(file: string, data: string | Buffer): void {
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, data);
	renameSync(tmp, file);
}
