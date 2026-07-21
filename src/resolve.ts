import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SpoolError } from "./errors";

/**
 * Git-style walk-up: the nearest ancestor (self first) containing
 * design/canvas.json is the product root. Paths come back realpathed so a
 * project has one identity no matter how the start path was spelled.
 */
export function resolveProjectRoot(startDir: string): string | undefined {
	let dir: string;
	try {
		dir = realpathSync(resolve(startDir));
	} catch {
		throw new SpoolError(`no such directory: ${startDir}`);
	}
	let prev = "";
	while (dir !== prev) {
		if (existsSync(join(dir, "design", "canvas.json"))) return dir;
		prev = dir;
		dir = dirname(dir);
	}
	return undefined;
}
