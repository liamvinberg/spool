import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where the binary keeps a session, and the only thing spool reads about one.
 *
 * Existence and nothing else. The file is the binary's own transcript in a shape spool
 * deliberately does not parse — #120 read it and found `user`, `assistant`,
 * `attachment`, `queue-operation`, `mode` and `last-prompt`, which is not the
 * `stream-json` union the adapter speaks — so this is a question about whether a resume
 * can work, never a second source of history.
 *
 * `CLAUDE_CONFIG_DIR` is honoured because the spawn inherits the environment whole: an
 * agent whose config lives elsewhere keeps its sessions there too, and a check against
 * the default would call every one of its threads dead.
 */
export function sessionFile(root: string, id: string, env: Readonly<Record<string, string | undefined>>): string {
	// empty reads as unset, which is the convention the rest of spool's env reading uses
	const set = (name: string) => ((env[name] ?? "") === "" ? undefined : env[name]);
	const config = set("CLAUDE_CONFIG_DIR") ?? join(set("HOME") ?? homedir(), ".claude");
	// the binary's own slug for a working directory: every character that is not a letter
	// or a digit becomes a dash, leading separator included
	return join(config, "projects", root.replace(/[^a-zA-Z0-9]/g, "-"), `${id}.jsonl`);
}

export function sessionExists(root: string, id: string, env: Readonly<Record<string, string | undefined>>): boolean {
	return existsSync(sessionFile(root, id, env));
}
