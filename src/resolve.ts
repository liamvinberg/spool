import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { realDir } from "./paths";
import { isTeamProject } from "./team-project";

/**
 * Git-style walk-up: the nearest ancestor (self first) containing
 * design/canvas.json is the product root. A team project's `spool.json` marks
 * one too, so a checkout whose `design/` has not been fetched yet still
 * resolves to the root it belongs at; another tool's `spool.json` doesn't.
 */
export function resolveProjectRoot(startDir: string): string | undefined {
	let dir = realDir(startDir);
	let prev = "";
	while (dir !== prev) {
		if (existsSync(join(dir, "design", "canvas.json")) || isTeamProject(dir)) return dir;
		prev = dir;
		dir = dirname(dir);
	}
	return undefined;
}
