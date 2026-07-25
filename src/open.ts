import { registerAndOpenProject } from "./daemon/session";
import { SpoolError } from "./errors";
import { resolveProjectRoot } from "./resolve";

/** Resolve the product root by walk-up, register it, and open its tab. */
export function openProject(startDir: string, spoolDir: string): { root: string } {
	const root = resolveProjectRoot(startDir);
	if (root === undefined) {
		throw new SpoolError(`no spool project found from ${startDir}, run \`spool init\` in your product root`);
	}
	registerAndOpenProject(spoolDir, root);
	return { root };
}
