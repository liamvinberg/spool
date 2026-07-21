import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { SpoolError } from "./errors";

/**
 * Resolve and realpath an existing directory. Realpathing gives a project one
 * identity no matter how the path was spelled (macOS /tmp, symlinked checkouts).
 */
export function realDir(dir: string): string {
	try {
		return realpathSync(resolve(dir));
	} catch {
		throw new SpoolError(`no such directory: ${dir}`);
	}
}
