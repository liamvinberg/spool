import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ignored, tracked } from "./daemon/history";

/** What a repo's agents read to find the canvas (task 136): added once, beside `spool.json`, and never removed. */
export const AGENTS_LINE = "design/ is a spool canvas: run `spool skill` before working there.";

/**
 * Whenever spool puts `spool.json` in a repo, the checkout's root says where the canvas is: the line goes into its
 * `AGENTS.md`, else its `CLAUDE.md`, else a new `AGENTS.md`, after a blank line at the end. A file that already has
 * the line, or one git ignores and doesn't track, is left as it is. The file written, absolute, or nothing.
 */
export async function addAgentsLine(top: string): Promise<string | undefined> {
	const file = ["AGENTS.md", "CLAUDE.md"].map((name) => join(top, name)).find((path) => existsSync(path));
	const target = file ?? join(top, "AGENTS.md");
	const held = file === undefined ? "" : readFileSync(file, "utf8");
	if (held.split(/\r?\n/u).includes(AGENTS_LINE)) return undefined;
	if (!(await tracked(top, target)) && (await ignored(top, target))) return undefined;
	const lead = held === "" ? "" : held.endsWith("\n") ? "\n" : "\n\n";
	writeFileSync(target, `${held}${lead}${AGENTS_LINE}\n`);
	return target;
}
