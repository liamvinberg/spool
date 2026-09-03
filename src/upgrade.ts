import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { installAutostart, launchAgentPath } from "./autostart";
import {
	type DaemonStatus,
	ensureDaemon,
	fetchHealth,
	poll,
	selfCliPath,
	statusDaemon,
	stopDaemon,
} from "./daemon/lifecycle";
import { fetchLatestVersion, isNewer } from "./daemon/update-check";
import { RefusedError, SpoolError } from "./errors";

/**
 * The update loop's one orchestrator (#30): always a CLI process, never the
 * daemon — a daemon cannot orchestrate its own replacement (it must die
 * mid-dance, and ensureDaemon refuses to spawn beside a healthy elder). The
 * terminal runs runUpgrade in-process; the canvas toast's POST /api/upgrade
 * spawns the same command detached via requestUpgrade and stands back.
 *
 * Nothing is installed or stopped until the registry says there is something
 * to install (#137). A restart is not free — it drops every canvas and kills
 * every process under the daemon — so it is spent only on a real upgrade,
 * and the terminal is asked first.
 *
 * The dance is goal-state and launchd-aware: install with the manager that
 * owns the running install (read off the CLI's real path — the wrong one
 * forks two spools onto PATH), stop whoever answers health (clean SIGTERM:
 * crash-only KeepAlive never races, no daemon can squat the port under a
 * launchd successor), then re-bake and re-bootstrap the autostart plist when
 * one exists (heals pnpm's version-stamped realpaths and a moved Node,
 * keeps the daemon supervised) or spawn detached when not. With no daemon
 * running and no plist, installing is the whole job.
 */

// posix literals: spool is macOS-first and launchd is already the one
// platform-specific piece — path matching follows suit
const PACKAGE_SUFFIX = "/node_modules/spool.page/dist/cli.js";
const NPM_COMMAND = "npm install -g spool.page@latest";
const PNPM_COMMAND = "pnpm add -g spool.page@latest";

export type InstallPlan =
	| { ok: true; manager: "npm" | "pnpm"; bin: string; args: string[]; packageDir: string }
	| { ok: false; message: string };

interface PlanIo {
	env?: Record<string, string | undefined>;
	execPath?: string;
	/** a real, followable file — bin candidates only */
	isFile?: (path: string) => boolean;
}

const isFileDefault = (path: string): boolean => {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
};

/**
 * What owns the running install, read off the CLI's resolved real path —
 * never whatever npm happens to sit on PATH. Yields absolute manager
 * binaries because the toast door runs on launchd's bare PATH.
 */
export function planUpgrade(realCliPath: string, io: PlanIo = {}): InstallPlan {
	const env = io.env ?? process.env;
	const execPath = io.execPath ?? process.execPath;
	const isFile = io.isFile ?? isFileDefault;

	if (!realCliPath.endsWith(PACKAGE_SUFFIX)) {
		return {
			ok: false,
			message: `the running spool is the development checkout (${realCliPath}) — run: git pull`,
		};
	}
	const packageDir = realCliPath.slice(0, -"/dist/cli.js".length);

	// pnpm keeps version-stamped dirs under .pnpm; the stable door is
	// <global>/node_modules/spool.page, a symlink pnpm repoints every install
	const pnpmIndex = realCliPath.indexOf("/.pnpm/");
	if (pnpmIndex !== -1) {
		const stableDir = join(realCliPath.slice(0, pnpmIndex), "node_modules", "spool.page");
		const bin = pnpmBinary(stableDir, env, isFile);
		if (bin === undefined) {
			return { ok: false, message: `cannot find the pnpm that owns ${realCliPath} — run: ${PNPM_COMMAND}` };
		}
		return { ok: true, manager: "pnpm", bin, args: ["add", "-g", "spool.page@latest"], packageDir: stableDir };
	}

	if (packageDir.endsWith("/lib/node_modules/spool.page")) {
		// npm-global, nvm included — nvm is just a per-node-version prefix, and
		// npm ships beside the node binary, the one absolute path always true
		const bin = join(dirname(execPath), "npm");
		if (!isFile(bin)) {
			return { ok: false, message: `cannot find npm beside ${execPath} — run: ${NPM_COMMAND}` };
		}
		return { ok: true, manager: "npm", bin, args: ["install", "-g", "spool.page@latest"], packageDir };
	}

	return {
		ok: false,
		message: `no supported package manager owns ${realCliPath} — upgrade it with the tool that installed it (npm installs: ${NPM_COMMAND})`,
	};
}

function pnpmBinary(
	stableDir: string,
	env: Record<string, string | undefined>,
	isFile: (path: string) => boolean,
): string | undefined {
	const home = env.PNPM_HOME;
	if (home !== undefined && home !== "" && isFile(join(home, "pnpm"))) return join(home, "pnpm");
	// no PNPM_HOME under launchd: the executable lives a few levels above the
	// global dir (~/Library/pnpm/global/5 → ~/Library/pnpm/pnpm)
	let dir = stableDir;
	for (let i = 0; i < 6; i++) {
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
		const candidate = join(dir, "pnpm");
		if (isFile(candidate)) return candidate;
	}
	return undefined;
}

export interface UpgradeIo {
	cliPath?: string;
	execPath?: string;
	execArgv?: string[];
	env?: Record<string, string | undefined>;
	home?: string;
	uid?: number | undefined;
	resolveReal?: (path: string) => string;
	isFile?: (path: string) => boolean;
	plistExists?: (plist: string) => boolean;
	/** the manager run, stdio inherited — the human sees npm talk; null = spawn failed */
	runInstall?: (bin: string, args: string[]) => number | null;
	readInstalledVersion?: (packageDir: string) => string | undefined;
	/** what the registry is offering; undefined = offline, and offline never blocks */
	fetchLatest?: () => Promise<string | undefined>;
	/** asked only when a daemon or a launch agent is about to be taken down; undefined = never ask */
	confirm?: (question: string) => Promise<boolean>;
	status?: () => Promise<DaemonStatus>;
	stop?: () => Promise<unknown>;
	ensure?: (command: string[]) => Promise<{ url: string }>;
	reinstallAutostart?: (cliPath: string) => void;
	pollMs?: number;
	narrate?: (line: string) => void;
}

export type UpgradeOutcome =
	| { kind: "refused"; message: string }
	| { kind: "failed"; message: string }
	/** the registry offers nothing worth taking; nothing was installed or stopped */
	| { kind: "current"; latest: string; cli: string; daemon: string | undefined }
	/** the human said no at the confirmation; nothing was installed or stopped */
	| { kind: "declined" }
	| {
			kind: "done";
			from: string;
			to: string;
			daemon: { running: true; url: string; restarted: boolean } | { running: false };
	  };

const runInstallDefault = (bin: string, args: string[]): number | null =>
	spawnSync(bin, args, { stdio: "inherit" }).status;

const readPackageVersion = (packageDir: string): string | undefined => {
	try {
		const parsed = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as { version?: unknown };
		return typeof parsed.version === "string" ? parsed.version : undefined;
	} catch {
		return undefined;
	}
};

export async function runUpgrade(
	spoolDir: string,
	currentVersion: string,
	io: UpgradeIo = {},
): Promise<UpgradeOutcome> {
	const narrate = io.narrate ?? (() => {});
	const execPath = io.execPath ?? process.execPath;
	const home = io.home ?? homedir();
	const resolveReal = io.resolveReal ?? realpathSync;

	let real: string;
	try {
		real = resolveReal(io.cliPath ?? selfCliPath());
	} catch {
		return { kind: "refused", message: `cannot resolve the running cli — reinstall with: ${NPM_COMMAND}` };
	}
	const plan = planUpgrade(real, {
		...(io.env === undefined ? {} : { env: io.env }),
		execPath,
		...(io.isFile === undefined ? {} : { isFile: io.isFile }),
	});
	if (!plan.ok) return { kind: "refused", message: plan.message };

	const status = io.status ?? (() => statusDaemon(spoolDir));
	const stop = io.stop ?? (() => stopDaemon(spoolDir));
	const before = await status();
	const daemonVersion = before.running ? before.version : undefined;
	const hasPlist = (io.plistExists ?? existsSync)(launchAgentPath(home));

	// Ask the registry before touching anything. The target has to beat both
	// halves of the install: beating only the CLI lets a publish lag reinstall
	// an older release over a daemon that is already ahead of it, and the
	// restart then carries every canvas down onto the older build. Offline
	// answers undefined, and an upgrade a human asked for outright is not
	// refused by a registry that will not talk.
	//
	// The one skew with nothing to install: the cli is already what the
	// registry offers and the daemon is behind it — the Mac app started the
	// daemon from its older bundle, or the package was reinstalled by hand under
	// a daemon nobody restarted. `status` has already promised that this verb
	// brings them in step, so it does: no install, the daemon restarted onto the
	// cli that is running.
	const latest = await (io.fetchLatest ?? fetchLatestVersion)();
	const daemonBehindCli = daemonVersion !== undefined && isNewer(currentVersion, daemonVersion);
	let restartOnly = false;
	if (latest !== undefined) {
		const beatsCli = isNewer(latest, currentVersion);
		const beatsDaemon = daemonVersion === undefined || isNewer(latest, daemonVersion);
		if (!beatsCli && daemonBehindCli) restartOnly = true;
		else if (!beatsCli || !beatsDaemon) {
			return { kind: "current", latest, cli: currentVersion, daemon: daemonVersion };
		}
	}

	// A restart takes every process under the daemon with it, so the terminal
	// says so before it happens. The toast door spawns detached with no tty
	// and passes no confirm: the canvas asks in its own way before it POSTs.
	if (io.confirm !== undefined && (before.running || hasPlist)) {
		const target = restartOnly ? `v${currentVersion}` : latest === undefined ? "the latest release" : `v${latest}`;
		const cost = before.running
			? `stops the daemon (v${before.version}) and everything running under it`
			: "re-bakes the launch agent";
		const verb = restartOnly ? "restart the daemon onto" : "upgrade to";
		if (!(await io.confirm(`${verb} ${target} — this ${cost}. continue?`))) return { kind: "declined" };
	}

	let to = currentVersion;
	let newCli = real;
	if (restartOnly) {
		narrate(`the cli is already v${currentVersion} — restarting the daemon onto it, nothing to install`);
	} else {
		narrate(`${plan.manager} owns this install — running: ${[plan.bin, ...plan.args].join(" ")}`);
		const exit = (io.runInstall ?? runInstallDefault)(plan.bin, plan.args);
		if (exit !== 0) {
			return {
				kind: "failed",
				message: `${plan.manager} exited with ${exit ?? "a spawn failure"} — nothing was restarted`,
			};
		}

		const installed = (io.readInstalledVersion ?? readPackageVersion)(plan.packageDir);
		if (installed === undefined) {
			return { kind: "failed", message: `installed, but cannot read ${join(plan.packageDir, "package.json")}` };
		}
		to = installed;
		newCli = join(plan.packageDir, "dist", "cli.js");
	}

	if (hasPlist) {
		// autostart promises a running daemon: re-bake keeps it supervised and
		// heals the baked realpaths, RunAtLoad starts the successor
		narrate("autostart is on — re-baking the launch agent onto the new install");
		await stop();
		const reinstall =
			io.reinstallAutostart ??
			((cliPath: string) => {
				const uid = io.uid ?? process.getuid?.();
				if (uid === undefined) throw new SpoolError("cannot determine the current uid");
				installAutostart({
					home,
					uid,
					spoolDir,
					spec: {
						execPath,
						execArgv: io.execArgv ?? process.execArgv,
						cliPath,
						logFile: join(spoolDir, "daemon.log"),
					},
				});
			});
		try {
			reinstall(newCli);
		} catch (error) {
			if (error instanceof SpoolError) return { kind: "failed", message: error.message };
			throw error;
		}
		const running = await poll(io.pollMs ?? 10_000, async () => {
			const probed = await status();
			return probed.running && probed.version === to ? probed : undefined;
		});
		if (running === undefined) {
			return {
				kind: "failed",
				message: `launchd took the job but no v${to} daemon came up — see ${join(spoolDir, "daemon.log")}`,
			};
		}
		return { kind: "done", from: currentVersion, to, daemon: { running: true, url: running.url, restarted: true } };
	}

	if (before.running) {
		narrate(`restarting the daemon (v${before.version} → v${to})`);
		await stop();
		const ensure = io.ensure ?? ((command: string[]) => ensureDaemon(spoolDir, { command }));
		try {
			// the successor is spawned by explicit path: the old realpath may be
			// pruned the moment the manager finishes (pnpm), argv[1] lies here
			const result = await ensure([execPath, ...(io.execArgv ?? process.execArgv), newCli, "serve", "--foreground"]);
			return { kind: "done", from: currentVersion, to, daemon: { running: true, url: result.url, restarted: true } };
		} catch (error) {
			if (error instanceof SpoolError) return { kind: "failed", message: error.message };
			throw error;
		}
	}

	// no daemon, no plist: never start what the owner did not have running
	return { kind: "done", from: currentVersion, to, daemon: { running: false } };
}

/**
 * Whether this install can take an upgrade at all — the gate on offering one.
 * Only a package manager's install has a door: a checkout upgrades by `git
 * pull`, and any other unmanaged layout by hand, so `planUpgrade` refuses
 * both. A daemon that offered one anyway would toast a button that can only
 * fail, which is what the dogfood checkout did until this gate existed. False
 * also silences the daily registry ask: nothing worth phoning home about.
 */
export function selfUpgradeable(
	io: Pick<UpgradeIo, "cliPath" | "resolveReal" | "env" | "execPath" | "isFile"> = {},
): boolean {
	try {
		return planUpgrade((io.resolveReal ?? realpathSync)(io.cliPath ?? selfCliPath()), io).ok;
	} catch {
		return false;
	}
}

/**
 * The one sentence a version skew gets, wherever it surfaces (#155): `status`
 * reporting a running daemon, and any verb the daemon refused. Matching
 * versions say nothing. The way out differs by install — a managed one
 * reinstalls, a checkout restarts onto the code already on disk.
 */
export function describeSkew(daemonVersion: string, cliVersion: string): string {
	if (daemonVersion === cliVersion) return "";
	const fix = selfUpgradeable() ? "`spool upgrade` brings them in step" : "restart it to catch it up";
	return ` — cli is v${cliVersion}, ${fix}`;
}

/**
 * The skew behind a refusal, if that is what it was. A skewed cli is turned
 * away exactly like a bad token, so the verb that broke asks health — which
 * takes no token — which version answered, and says what `status` would have
 * said. A genuine auth failure against a matching daemon adds nothing (#155).
 */
export async function skewBehind(error: unknown, cliVersion: string): Promise<string> {
	if (!(error instanceof RefusedError)) return "";
	const health = await fetchHealth(error.daemonUrl);
	return health === undefined ? "" : describeSkew(health.version, cliVersion);
}

/**
 * The toast door: refuse what the CLI would refuse (so the canvas hears the
 * reason immediately), otherwise spawn `spool upgrade` detached, logging
 * with the daemon. The SSE drop and the version flip tell the rest.
 */
export function requestUpgrade(spoolDir: string): { ok: true } | { ok: false; error: string } {
	let real: string;
	try {
		real = realpathSync(selfCliPath());
	} catch {
		return { ok: false, error: `cannot resolve the running cli — reinstall with: ${NPM_COMMAND}` };
	}
	const plan = planUpgrade(real);
	if (!plan.ok) return { ok: false, error: plan.message };

	mkdirSync(spoolDir, { recursive: true });
	const log = openSync(join(spoolDir, "daemon.log"), "a");
	const child = spawn(process.execPath, [...process.execArgv, real, "upgrade"], {
		detached: true,
		stdio: ["ignore", log, log],
	});
	child.unref();
	closeSync(log);
	return { ok: true };
}
