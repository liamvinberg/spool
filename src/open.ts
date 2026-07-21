import { SpoolError } from "./errors";
import { registerProject } from "./registry";
import { resolveProjectRoot } from "./resolve";

/** Resolve the product root by walk-up from startDir and register it. */
export function openProject(startDir: string, spoolDir: string): { root: string } {
	const root = resolveProjectRoot(startDir);
	if (root === undefined) {
		throw new SpoolError(`no spool project found from ${startDir}, run \`spool init\` in your product root`);
	}
	registerProject(spoolDir, root);
	return { root };
}
