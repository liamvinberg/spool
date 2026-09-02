import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

// The daemon, as seen from outside it.
//
// A port of what src/daemon/lifecycle.ts does from the CLI's side, and it has to
// stay a port: the app and the CLI share one state directory and one daemon, and
// two programs that disagree about which daemon is running would both start one.
// So the rules are copied rather than reinvented.
//
//   - `~/.spool` unless SPOOL_DIR says otherwise. daemon.json inside it records
//     the pid, host and port of what runs.
//   - The state file alone proves nothing and a pid can be reused, so liveness
//     is health over HTTP: /api/health has to answer, say it is spool, and name
//     the same pid the file does.
//   - First supervisor wins. A daemon that is already up is adopted whoever
//     started it; the bundled one starts only when nothing answers.
//
// The control token in daemon.json is a credential, and it is read for exactly
// one thing: play opens a window sized from the frame's authored geometry, and
// the only place that geometry lives is /api/p/:project/frames, which is behind
// the token (#275). It is never logged and never leaves this process except as
// that request's header. Its presence is also still checked, because a state
// file without one was not written by a daemon that finished starting.
//
// One thing the CLI does that this does not: sweep. `statusDaemon` deletes a
// daemon.json whose daemon no longer answers, and getting that right is delicate
// — a health probe gives up after a second, so a busy daemon can read as dead,
// and deleting a live daemon's token strands it, because only that daemon ever
// knew it. This app never needs to delete the file, so it does not, and the
// whole class of mistake is out of reach.

export interface DaemonState {
	pid: number;
	host: string;
	port: number;
	version: string;
	startedAt: string;
	/** The credential every /api/ request carries. Never logged. */
	controlToken: string;
}

export interface DaemonHealth {
	version: string;
	pid: number;
	startedAt: string;
}

export type DaemonStatus =
	| { running: true; url: string; pid: number; version: string; controlToken: string }
	| { running: false };

/**
 * `~/.spool` unless SPOOL_DIR says otherwise, which is how a checkout rides its
 * own daemon beside the daily one. A leading `~` is expanded because this is
 * read out of an app bundle's environment as often as out of a shell's, and a
 * relative path resolves against the process's directory the way the CLI's does.
 */
export function stateDirectory(env: NodeJS.ProcessEnv = process.env): string {
	const override = env.SPOOL_DIR;
	if (override === undefined || override === "") return join(homedir(), ".spool");
	if (override === "~") return homedir();
	if (override.startsWith("~/")) return join(homedir(), override.slice(2));
	return isAbsolute(override) ? override : resolve(override);
}

/**
 * Where Electron keeps this app's own state: window bounds, caches, and the
 * single-instance lock.
 *
 * Electron names that directory after the app, so every copy of Spool on a
 * machine points at the same one. Right for the daily app and wrong for a lane,
 * because the lock is in there: a checkout's window asks for the lock the
 * installed app is already holding, is refused as a second launch of it, and
 * raises that app's canvas instead of opening its own.
 *
 * A lane is already spelled out in SPOOL_DIR, so its app state goes inside the
 * directory that is the lane, which is also what makes deleting that directory
 * delete all of it. Unset SPOOL_DIR keeps the path every release has used, so the
 * daily app keeps the window bounds and update cache it has.
 */
export function userDataDirectory(fallback: string, env: NodeJS.ProcessEnv = process.env): string {
	const override = env.SPOOL_DIR;
	if (override === undefined || override === "") return fallback;
	return join(stateDirectory(env), "app");
}

/** Machine-written ephemera: corrupt or unreadable state reads as absent. */
export function readState(directory: string): DaemonState | undefined {
	let raw: string;
	try {
		raw = readFileSync(join(directory, "daemon.json"), "utf8");
	} catch {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const state = parsed as Record<string, unknown>;
	if (
		typeof state.pid !== "number" ||
		typeof state.host !== "string" ||
		typeof state.port !== "number" ||
		typeof state.version !== "string" ||
		typeof state.startedAt !== "string" ||
		typeof state.controlToken !== "string" ||
		state.controlToken.length === 0
	) {
		return undefined;
	}
	return {
		pid: state.pid,
		host: state.host,
		port: state.port,
		version: state.version,
		startedAt: state.startedAt,
		controlToken: state.controlToken,
	};
}

/** A bind-everything host is not a dialable address. */
export function connectHost(host: string): string {
	if (host === "0.0.0.0") return "127.0.0.1";
	if (host === "::" || host === "::0") return "::1";
	return host;
}

export function daemonUrl(host: string, port: number): string {
	const dialable = connectHost(host);
	return dialable.includes(":") ? `http://[${dialable}]:${port}` : `http://${dialable}:${port}`;
}

/**
 * The header every /api/ request carries, mirrored from src/daemon/security.ts
 * for the same reason the liveness rules are: one protocol, written twice
 * because these two programs do not share a module.
 */
const CONTROL_HEADER = "x-spool-control";

/**
 * What a frame was authored at, which is the size a window playing it opens at
 * (#275). The projection is the only place those two numbers live, and it is
 * behind the control token.
 *
 * A named frame the projection does not have, a daemon that refuses, a daemon
 * too old to answer: all of them mean the same thing here, which is that this
 * app does not know, and the caller falls back to a size rather than failing to
 * open a window. The frame is picked the way the play door picks it, minus the
 * rung this side cannot see: the named frame, else the first.
 */
export async function frameGeometry(
	url: string,
	controlToken: string,
	project: string,
	frame: string | undefined,
	timeoutMs = 2000,
): Promise<{ w: number; h: number } | undefined> {
	let body: unknown;
	try {
		const response = await fetch(`${url}/api/p/${encodeURIComponent(project)}/frames`, {
			headers: { [CONTROL_HEADER]: controlToken },
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!response.ok) return undefined;
		body = await response.json();
	} catch {
		return undefined;
	}
	if (typeof body !== "object" || body === null) return undefined;
	const listed = (body as { frames?: unknown }).frames;
	if (!Array.isArray(listed)) return undefined;
	const frames = listed.filter(isGeometry);
	const chosen = frame === undefined ? frames[0] : frames.find((entry) => entry.name === frame);
	return chosen === undefined ? undefined : { w: chosen.w, h: chosen.h };
}

function isGeometry(value: unknown): value is { name: string; w: number; h: number } {
	if (typeof value !== "object" || value === null) return false;
	const frame = value as Record<string, unknown>;
	return (
		typeof frame.name === "string" &&
		typeof frame.w === "number" &&
		Number.isInteger(frame.w) &&
		frame.w > 0 &&
		typeof frame.h === "number" &&
		Number.isInteger(frame.h) &&
		frame.h > 0
	);
}

/** What the daemon at this URL says it is, asked without a control token. */
export async function health(url: string, timeoutMs = 1000): Promise<DaemonHealth | undefined> {
	let body: unknown;
	try {
		const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
		if (!response.ok) return undefined;
		body = await response.json();
	} catch {
		return undefined;
	}
	if (typeof body !== "object" || body === null) return undefined;
	const parsed = body as Record<string, unknown>;
	if (parsed.name !== "spool") return undefined;
	if (typeof parsed.version !== "string" || typeof parsed.pid !== "number" || typeof parsed.startedAt !== "string") {
		return undefined;
	}
	return { version: parsed.version, pid: parsed.pid, startedAt: parsed.startedAt };
}

/** The daemon recorded in state, but only if it answers health as itself. */
export async function status(directory: string): Promise<DaemonStatus> {
	const state = readState(directory);
	if (state === undefined) return { running: false };
	const url = daemonUrl(state.host, state.port);
	const live = await health(url);
	if (live === undefined || live.pid !== state.pid) return { running: false };
	return { running: true, url, pid: state.pid, version: live.version, controlToken: state.controlToken };
}

export interface StartOptions {
	/** The program that runs the bundled cli. Electron's own binary, as node. */
	execPath: string;
	/** Node options in front of the script; see shim/electron-argv.js. */
	nodeArgs?: readonly string[];
	/** The bundled `spool.page` entry, `dist/cli.js`. */
	cli: string;
	directory: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
}

export class DaemonStartError extends Error {}

/**
 * Start the bundled daemon and wait until it reports healthy. The caller has
 * already found nothing running: this never adopts, because a caller that wants
 * adoption calls `status` first and knows whether it owns what it got.
 *
 * ELECTRON_RUN_AS_NODE is what makes this safe. The child is Electron's own
 * executable behaving as plain Node, so esbuild and @tailwindcss/oxide load into
 * a Node process rather than into the one drawing the window: no native-module
 * ABI risk in the renderer, and a daemon that crashes cannot take the window
 * with it. It is detached, so a signal sent to the app's process group is not
 * also sent to the daemon.
 */
export async function start(options: StartOptions): Promise<DaemonStatus> {
	const { execPath, cli, directory } = options;
	mkdirSync(directory, { recursive: true });
	const log = createWriteStream(join(directory, "daemon.log"), { flags: "a" });
	await new Promise<void>((done, fail) => {
		log.once("open", () => done());
		log.once("error", fail);
	});

	const child = spawn(execPath, [...(options.nodeArgs ?? []), cli, "serve", "--foreground"], {
		detached: true,
		stdio: ["ignore", log, log],
		// Home rather than wherever the app happened to be launched from. `serve`
		// resolves nothing from the working directory, and a daemon holding a
		// directory open is a directory that cannot be ejected.
		cwd: homedir(),
		// SPOOL_DIR and SPOOL_PORT ride along when they are set, so a lane's app
		// serves that lane. Everything else the daemon needs it reads from
		// config.json, the same as when the CLI starts it.
		env: { ...(options.env ?? process.env), ELECTRON_RUN_AS_NODE: "1" },
	});
	child.unref();
	log.close();

	const live = await poll(options.timeoutMs ?? 30_000, async () => {
		const current = await status(directory);
		return current.running ? current : undefined;
	});
	if (live !== undefined) return live;
	// Whatever it printed is in daemon.log, which is the only place worth
	// pointing at: this app has no console.
	try {
		process.kill(child.pid ?? 0, "SIGTERM");
	} catch {
		// already gone, which is the same outcome
	}
	throw new DaemonStartError(`the spool daemon did not come up, see ${join(directory, "daemon.log")}`);
}

/**
 * Stop a daemon by pid, politely. SIGTERM is what the CLI sends and what the
 * daemon's own shutdown listens for; nothing here escalates to SIGKILL, because
 * a daemon mid-write is worse than a daemon still running.
 */
export async function stop(pid: number, timeoutMs = 5000): Promise<boolean> {
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		return true;
	}
	return (await poll(timeoutMs, async () => (alive(pid) ? undefined : true), 50)) === true;
}

export function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

/** Probe every stepMs until the probe yields a value or the deadline passes. */
export async function poll<T>(
	timeoutMs: number,
	probe: () => Promise<T | undefined>,
	stepMs = 100,
): Promise<T | undefined> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = await probe();
		if (value !== undefined) return value;
		await new Promise((done) => setTimeout(done, stepMs));
	}
	return undefined;
}
