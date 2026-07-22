import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { SpoolError } from "../errors";

/**
 * Daemon lifecycle around ~/.spool: config resolves what `serve` binds,
 * daemon.json records what actually runs (pid, real host and port), health
 * over HTTP is the only liveness truth — a state file alone proves nothing,
 * and a pid can be reused. Any verb reaches a live daemon via ensureDaemon,
 * tmux-style: reuse when healthy, spawn detached when not.
 */

export interface ServeConfig {
	host: string;
	port: number;
}

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 7766; // SPOO on a phone keypad

/**
 * ~/.spool unless SPOOL_DIR says otherwise — the state half of the dogfood
 * split: a checkout daemon rides its own registry, daemon.json and log
 * beside the released daily one (SPOOL_PORT gives it its own port).
 */
export function resolveSpoolDir(env: Record<string, string | undefined>): string {
	if (env.SPOOL_DIR !== undefined && env.SPOOL_DIR !== "") return resolve(env.SPOOL_DIR);
	return join(homedir(), ".spool");
}

/**
 * localhost:7766 unless the owner explicitly says otherwise: config.json
 * {host, port} in ~/.spool, SPOOL_HOST/SPOOL_PORT on top for the
 * develop-from-checkout-on-its-own-port case.
 */
export function resolveServeConfig(spoolDir: string, env: Record<string, string | undefined>): ServeConfig {
	const file = join(spoolDir, "config.json");
	let host = DEFAULT_HOST;
	let port = DEFAULT_PORT;

	let raw: string | undefined;
	try {
		raw = readFileSync(file, "utf8");
	} catch {
		raw = undefined;
	}
	if (raw !== undefined) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new SpoolError(`corrupt config at ${file}, fix or remove it`);
		}
		if (typeof parsed !== "object" || parsed === null) {
			throw new SpoolError(`corrupt config at ${file}, fix or remove it`);
		}
		const config = parsed as Record<string, unknown>;
		if (config.host !== undefined) {
			if (typeof config.host !== "string" || config.host === "") {
				throw new SpoolError(`config at ${file}: "host" must be a non-empty string`);
			}
			host = config.host;
		}
		if (config.port !== undefined) {
			if (
				typeof config.port !== "number" ||
				!Number.isInteger(config.port) ||
				config.port < 0 ||
				config.port > 65535
			) {
				throw new SpoolError(`config at ${file}: "port" must be a port number (0-65535)`);
			}
			port = config.port;
		}
	}

	if (env.SPOOL_HOST !== undefined && env.SPOOL_HOST !== "") host = env.SPOOL_HOST;
	if (env.SPOOL_PORT !== undefined && env.SPOOL_PORT !== "") {
		const parsed = Number(env.SPOOL_PORT);
		if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
			throw new SpoolError(`SPOOL_PORT must be a port number, got "${env.SPOOL_PORT}"`);
		}
		port = parsed;
	}

	return { host, port };
}

export interface DaemonState {
	pid: number;
	host: string;
	port: number;
	version: string;
	startedAt: string;
}

const STATE_FILE = "daemon.json";

/** Machine-written ephemera: corrupt or unreadable state reads as absent. */
export function readDaemonState(spoolDir: string): DaemonState | undefined {
	let raw: string;
	try {
		raw = readFileSync(join(spoolDir, STATE_FILE), "utf8");
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
		typeof state.startedAt !== "string"
	) {
		return undefined;
	}
	return { pid: state.pid, host: state.host, port: state.port, version: state.version, startedAt: state.startedAt };
}

export function writeDaemonState(spoolDir: string, state: DaemonState): void {
	mkdirSync(spoolDir, { recursive: true });
	const file = join(spoolDir, STATE_FILE);
	const tmp = `${file}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(state, null, "\t")}\n`);
	renameSync(tmp, file);
}

/** Remove daemon.json, but never a successor's: only when the pid matches. */
export function clearDaemonState(spoolDir: string, pid: number): void {
	if (readDaemonState(spoolDir)?.pid !== pid) return;
	rmSync(join(spoolDir, STATE_FILE), { force: true });
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

export interface DaemonHealth {
	name: string;
	version: string;
	pid: number;
	startedAt: string;
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
		await sleep(stepMs);
	}
	return undefined;
}

async function fetchHealth(url: string): Promise<DaemonHealth | undefined> {
	let body: unknown;
	try {
		const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
		if (!res.ok) return undefined;
		body = await res.json();
	} catch {
		return undefined;
	}
	if (typeof body !== "object" || body === null) return undefined;
	const health = body as Record<string, unknown>;
	if (health.name !== "spool") return undefined;
	if (typeof health.version !== "string" || typeof health.pid !== "number" || typeof health.startedAt !== "string") {
		return undefined;
	}
	return { name: "spool", version: health.version, pid: health.pid, startedAt: health.startedAt };
}

/** The daemon answering health at host:port — whoever started it — or nothing. */
export async function spoolDaemonAt(host: string, port: number): Promise<DaemonHealth | undefined> {
	return fetchHealth(daemonUrl(host, port));
}

/** The daemon recorded in state, but only if it answers health as itself. */
async function liveDaemon(spoolDir: string): Promise<{ state: DaemonState; url: string } | undefined> {
	const state = readDaemonState(spoolDir);
	if (state === undefined) return undefined;
	const url = daemonUrl(state.host, state.port);
	const health = await fetchHealth(url);
	if (health === undefined || health.pid !== state.pid) return undefined;
	return { state, url };
}

export type DaemonStatus = { running: true; url: string; pid: number; version: string } | { running: false };

/** Drop a daemon.json whose recorded daemon is no longer the one answering. */
function sweepStaleState(spoolDir: string): void {
	const stale = readDaemonState(spoolDir);
	if (stale !== undefined) clearDaemonState(spoolDir, stale.pid);
}

export async function statusDaemon(spoolDir: string): Promise<DaemonStatus> {
	const live = await liveDaemon(spoolDir);
	if (live === undefined) {
		sweepStaleState(spoolDir);
		return { running: false };
	}
	return { running: true, url: live.url, pid: live.state.pid, version: live.state.version };
}

export interface EnsureOptions {
	/** The command that runs `spool serve --foreground`; tests inject their own. */
	command?: string[];
	env?: Record<string, string>;
	timeoutMs?: number;
}

export interface EnsureResult {
	url: string;
	pid: number;
	started: boolean;
}

/**
 * Tmux-style auto-start: reuse the healthy daemon or spawn one detached,
 * logging to ~/.spool/daemon.log, and wait until it reports healthy.
 */
export async function ensureDaemon(spoolDir: string, options: EnsureOptions = {}): Promise<EnsureResult> {
	const existing = await liveDaemon(spoolDir);
	if (existing !== undefined) {
		return { url: existing.url, pid: existing.state.pid, started: false };
	}

	const command = options.command ?? defaultServeCommand();
	const [bin, ...args] = command;
	if (bin === undefined) throw new SpoolError("cannot determine the spool serve command");

	mkdirSync(spoolDir, { recursive: true });
	const logFile = join(spoolDir, "daemon.log");
	const log = openSync(logFile, "a");
	const child = spawn(bin, args, {
		detached: true,
		stdio: ["ignore", log, log],
		env: { ...process.env, ...options.env },
	});
	child.unref();
	closeSync(log);

	const live = await poll(options.timeoutMs ?? 10_000, () => liveDaemon(spoolDir));
	if (live !== undefined) return { url: live.url, pid: live.state.pid, started: true };
	throw new SpoolError(`spool daemon did not come up — see ${logFile}`);
}

/** The running cli entry, package-manager bin symlinks resolved away. */
export function selfCliPath(): string {
	const cli = process.argv[1];
	if (cli === undefined) throw new SpoolError("cannot determine the spool cli path");
	return realpathSync(cli);
}

function defaultServeCommand(): string[] {
	// execArgv carries loader flags, so a dev checkout (tsx) spawns like the built cli
	return [process.execPath, ...process.execArgv, selfCliPath(), "serve", "--foreground"];
}

export type StopResult = { stopped: true; pid: number } | { stopped: false };

/** Stop is goal-state: a daemon that is not running is already stopped. */
export async function stopDaemon(spoolDir: string): Promise<StopResult> {
	const live = await liveDaemon(spoolDir);
	if (live === undefined) {
		sweepStaleState(spoolDir);
		return { stopped: false };
	}

	const { pid } = live.state;
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		clearDaemonState(spoolDir, pid);
		return { stopped: false };
	}

	const gone = await poll(5000, async () => (isAlive(pid) ? undefined : true), 50);
	if (gone === true) {
		clearDaemonState(spoolDir, pid);
		return { stopped: true, pid };
	}
	throw new SpoolError(`spool daemon (pid ${pid}) did not exit — kill it manually`);
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
