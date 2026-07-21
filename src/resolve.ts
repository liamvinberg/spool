import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { realDir } from "./paths";

/**
 * Git-style walk-up: the nearest ancestor (self first) containing
 * design/canvas.json is the product root.
 */
export function resolveProjectRoot(startDir: string): string | undefined {
	let dir = realDir(startDir);
	let prev = "";
	while (dir !== prev) {
		if (existsSync(join(dir, "design", "canvas.json"))) return dir;
		prev = dir;
		dir = dirname(dir);
	}
	return undefined;
}
