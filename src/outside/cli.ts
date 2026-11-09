import { daemonUrl, readDaemonState } from "../daemon/lifecycle";
import { CONTROL_HEADER } from "../daemon/security";
import { SpoolError } from "../errors";
import { resolveRegisteredProject } from "../verbs";
import { HARNESSES, type Harness, harnessOf, isHarness } from "./harness";
import { connect, connection, disconnect, harnessFiles, hookLines } from "./install";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * A `spool` verb run by an agent in a terminal says so to a running daemon (task 531): it
 * is how the canvas learns a person uses Claude Code, Codex or pi, so it can offer to
 * connect it. Never starts a daemon, never waits long, never fails the verb.
 */
export async function noticeOutside(spoolDir: string, env: Env, cwd: string): Promise<void> {
	const harness = harnessOf(env);
	if (harness === null) return;
	try {
		const daemon = readDaemonState(spoolDir);
		if (daemon === undefined) return;
		const { name } = resolveRegisteredProject(spoolDir, cwd);
		await fetch(`${daemonUrl(daemon.host, daemon.port)}/api/p/${encodeURIComponent(name)}/outside/notice`, {
			method: "POST",
			headers: { [CONTROL_HEADER]: daemon.controlToken, "content-type": "application/json" },
			body: JSON.stringify({ harness }),
			signal: AbortSignal.timeout(400),
		});
	} catch {}
}

/** The harnesses a `spool hooks` verb names: the one given, or every one. */
export function harnessesNamed(value: string | undefined): readonly Harness[] {
	if (value === undefined || value === "all") return HARNESSES;
	if (!isHarness(value)) throw new SpoolError(`spool hooks takes ${HARNESSES.join(", ")} or all, got "${value}"`);
	return [value];
}

/** Where a running daemon listens, which the hooks post to; this instance's own port when none runs. */
export function hookUrl(spoolDir: string, fallbackPort: number): string {
	const daemon = readDaemonState(spoolDir);
	return daemon === undefined ? daemonUrl("127.0.0.1", fallbackPort) : daemonUrl(daemon.host, daemon.port);
}

/** Tell a running daemon a harness was connected or taken out, so its canvases redraw. */
export async function tellHooksChanged(spoolDir: string, harness: Harness): Promise<void> {
	const daemon = readDaemonState(spoolDir);
	if (daemon === undefined) return;
	try {
		await fetch(`${daemonUrl(daemon.host, daemon.port)}/api/outside/${harness}/changed`, {
			method: "POST",
			headers: { [CONTROL_HEADER]: daemon.controlToken },
			signal: AbortSignal.timeout(1_000),
		});
	} catch {}
}

export function installLines(harness: Harness, spoolDir: string, url: string): string[] {
	const { said } = connect(harness, spoolDir, url);
	const { events } = hookLines(harness, spoolDir);
	return harness === "pi"
		? [`connected pi: wrote ${said}, which tells spool ${events.length} events and nothing to pi`]
		: [
				`connected ${harness}: ${events.length} hooks in ${said}, each run in the background, printing nothing`,
				...(harness === "codex" ? ["codex runs new hooks once you trust them: type /hooks in codex"] : []),
			];
}

export function removeLines(harness: Harness, spoolDir: string): string[] {
	const was = connection(harness, spoolDir);
	const { said } = disconnect(harness, spoolDir);
	return [was === "connected" ? `took spool's hooks out of ${said}` : `${harness} was not connected`];
}

export function statusLines(spoolDir: string): string[] {
	return HARNESSES.map((harness) => {
		const { said } = harnessFiles(harness, spoolDir);
		return `${harness.padEnd(7)}${connection(harness, spoolDir) === "connected" ? "connected" : "not connected"}  ${said}`;
	});
}
