import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { selfCliPath } from "./lifecycle";

/**
 * `spool` on the agent's PATH, and the one that is this daemon (#375).
 *
 * The framing and the skill tell the agent to run `spool …`, and nothing promised a
 * `spool` resolves: a daemon run from a checkout has none on PATH, and an installed one
 * can be a different version from the daemon the agent was spawned by. So the daemon
 * writes a launcher into its own state that runs the CLI it is running itself, under the
 * same node and loader flags, and puts that directory first on the agent's PATH. The
 * environment rides along unchanged, so `SPOOL_DIR`, `SPOOL_PORT` and Electron's
 * run-as-node flag reach the CLI the way they reached the daemon, and the CLI talks to
 * the daemon that spawned the agent. The name stays `spool`, so the sandbox's
 * `excludedCommands` entry still matches it.
 */

/** How this process runs its own CLI: the binary, its flags (tsx from a checkout), the entry. */
export interface SelfInvocation {
	readonly execPath: string;
	readonly execArgv: readonly string[];
	readonly cli: string;
}

/** The running daemon's own CLI. */
export function selfInvocation(): SelfInvocation {
	return { execPath: process.execPath, execArgv: process.execArgv, cli: selfCliPath() };
}

const quoted = (word: string): string => `'${word.replaceAll("'", "'\\''")}'`;

/** The launcher's text: exec this daemon's node on its CLI with whatever the agent typed. */
export function spoolShim({ execPath, execArgv, cli }: SelfInvocation): string {
	const words = [execPath, ...execArgv, cli].map(quoted).join(" ");
	return `#!/bin/sh\n# spool's own CLI for the agents this daemon spawns, written by the daemon\nexec ${words} "$@"\n`;
}

/** Where the launcher lives in spool's state. */
export function shimDir(spoolDir: string): string {
	return join(spoolDir, "bin");
}

/** `env` with `dir` first on its PATH, each directory once. */
export function withPathFirst(
	env: Readonly<Record<string, string | undefined>>,
	dir: string,
): Record<string, string | undefined> {
	const rest = (env.PATH ?? "").split(delimiter).filter((entry) => entry !== "" && entry !== dir);
	return { ...env, PATH: [dir, ...rest].join(delimiter) };
}

function writeShim(file: string, text: string): void {
	try {
		if (readFileSync(file, "utf8") === text) return;
	} catch {
		// not there yet
	}
	mkdirSync(join(file, ".."), { recursive: true });
	const tmp = `${file}.${randomUUID()}.tmp`;
	try {
		writeFileSync(tmp, text, { flag: "wx", mode: 0o755 });
		renameSync(tmp, file);
	} finally {
		rmSync(tmp, { force: true });
	}
}

/**
 * The environment an agent is spawned with: the daemon's own, with this daemon's `spool`
 * first on PATH.
 *
 * A launcher that cannot be written leaves the environment as it was, which is every
 * spawn before this one. Windows has no `#!` to run it with, so it is left alone there.
 */
export function agentEnv(
	spoolDir: string,
	env: Readonly<Record<string, string | undefined>> = process.env,
	self: () => SelfInvocation = selfInvocation,
): Record<string, string | undefined> {
	if (process.platform === "win32") return { ...env };
	const dir = shimDir(spoolDir);
	try {
		writeShim(join(dir, "spool"), spoolShim(self()));
	} catch {
		return { ...env };
	}
	return withPathFirst(env, dir);
}
