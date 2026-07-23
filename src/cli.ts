#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { installAutostart, removeAutostart } from "./autostart";
import {
	daemonUrl,
	ensureDaemon,
	poll,
	resolveServeConfig,
	resolveSpoolDir,
	selfCliPath,
	spoolDaemonAt,
	statusDaemon,
	stopDaemon,
	writeDaemonState,
} from "./daemon/lifecycle";
import { type RunningDaemon, serveDaemon } from "./daemon/server";
import { isNewer, readUpdateCache } from "./daemon/update-check";
import { PortBusyError, SpoolError } from "./errors";
import { initProject } from "./init";
import { openProject } from "./open";
import { skillText } from "./skill";
import { runUpgrade } from "./upgrade";
import { mintPlayerUrl, readFlows, readSelection, resolveRegisteredProject } from "./verbs";
import { logsFrame, shotFrame } from "./verify";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const spoolDir = resolveSpoolDir(process.env);
const development = (process.env.SPOOL_DIR ?? "") !== "";
// package root anchors dist/ui for both the built cli (dist/cli.js) and a checkout (src/cli.ts)
const uiDir = fileURLToPath(new URL("../dist/ui", import.meta.url));

const rootConfigPointer = `add this line to the repo's root CLAUDE.md or AGENTS.md so every future session finds the canvas:

  design/ is a spool canvas: run \`spool skill\` before working there — it is the complete contract
`;

const program = new Command("spool").description("the live prototyping canvas").version(pkg.version, "-v, --version");

program
	.command("init")
	.description("scaffold design/ in a product root and register it")
	.argument("[path]", "product root", ".")
	.action((path: string) => {
		const { root } = initProject(path, spoolDir);
		process.stdout.write(`initialized spool project at ${root}\n\n${rootConfigPointer}`);
	});

program
	.command("open")
	.description("resolve the project by walk-up and register it")
	.argument("[path]", "where the walk-up starts", ".")
	.action(async (path: string) => {
		const { root } = openProject(path, spoolDir);
		process.stdout.write(`registered ${basename(root)} (${root})\n`);
		// daemon-less by design (#12); when one runs, the tab is already opening — say where
		const status = await statusDaemon(spoolDir);
		if (status.running) {
			process.stdout.write(`canvas: ${status.url}/p/${encodeURIComponent(basename(root))}\n`);
		}
	});

// --- agent verbs (#25): read-only, cwd-resolved, daemon auto-started ---------

const narrate = (line: string) => process.stderr.write(`spool: ${line}\n`);

/** Every verb's preamble: the project this cwd is inside, and a live daemon. */
async function verbContext(): Promise<{ root: string; name: string; daemonUrl: string }> {
	const { root, name } = resolveRegisteredProject(spoolDir, process.cwd());
	const { url } = await ensureDaemon(spoolDir);
	return { root, name, daemonUrl: url };
}

program
	.command("selection")
	.description("print the live selection payload — what the human points at")
	.action(async () => {
		const { name, daemonUrl } = await verbContext();
		process.stdout.write(`${await readSelection(daemonUrl, name)}\n`);
	});

program
	.command("flows")
	.description("print the link graph: read from source, verified by sessions")
	.action(async () => {
		const { name, daemonUrl } = await verbContext();
		process.stdout.write(`${await readFlows(daemonUrl, name)}\n`);
	});

program
	.command("shot")
	.description("boot a frame headless, save a screenshot, print its path")
	.argument("<frame>", "frame folder name")
	.action(async (frame: string) => {
		const { root, name, daemonUrl } = await verbContext();
		const outcome = await shotFrame({ daemonUrl, root, name, frame, narrate });
		if (outcome.kind === "missing") throw new SpoolError(outcome.message);
		if (outcome.kind === "broken") {
			// the compile or boot error verbatim — nothing of spool's in the way
			process.stderr.write(`${outcome.message}\n`);
			process.exitCode = 1;
			return;
		}
		process.stdout.write(`${outcome.file}\n`);
		if (outcome.bootErrors.length > 0) {
			process.stderr.write(`${outcome.bootErrors.join("\n")}\n`);
			process.exitCode = 1;
		}
	});

program
	.command("logs")
	.description("print the frame's boot console output (cached until source changes)")
	.argument("<frame>", "frame folder name")
	.action(async (frame: string) => {
		const { root, name, daemonUrl } = await verbContext();
		const outcome = await logsFrame({ daemonUrl, root, name, frame, narrate });
		if (outcome.kind === "missing") throw new SpoolError(outcome.message);
		if (outcome.kind === "broken") {
			process.stderr.write(`${outcome.message}\n`);
			process.exitCode = 1;
			return;
		}
		if (outcome.replayed) narrate("replaying the last boot's logs — source unchanged");
		if (outcome.entries.length === 0) {
			narrate("the boot logged nothing");
			return;
		}
		process.stdout.write(`${outcome.entries.map((entry) => `[${entry.type}] ${entry.text}`).join("\n")}\n`);
	});

program
	.command("url")
	.description("mint a player-session URL to drive in a browser")
	.argument("<frame>", "frame folder name")
	.action(async (frame: string) => {
		const { name, daemonUrl } = await verbContext();
		process.stdout.write(`${await mintPlayerUrl(daemonUrl, name, frame)}\n`);
	});

program
	.command("skill")
	.description("print the spool skill — how agents author for this canvas")
	.argument("[topic]", "one topic instead of the overview")
	.action((topic?: string) => {
		process.stdout.write(`${skillText(topic)}\n`);
	});

program
	.command("serve")
	.description("start the daemon if it is not already running")
	.option("--foreground", "run the daemon in this process (development, launchd)")
	.action(async (options: { foreground?: boolean }) => {
		if (options.foreground === true) {
			const config = resolveServeConfig(spoolDir, process.env);
			let daemon: RunningDaemon;
			try {
				daemon = await serveDaemon({
					spoolDir,
					version: pkg.version,
					host: config.host,
					port: config.port,
					uiDir,
					development,
					updateCheck: config.updateCheck,
				});
			} catch (error) {
				if (error instanceof PortBusyError) {
					const sibling = await spoolDaemonAt(config.host, config.port);
					if (sibling !== undefined) {
						// launchd must not read an occupied port as a crash: record
						// who answers and exit clean — KeepAlive revives real deaths
						writeDaemonState(spoolDir, {
							pid: sibling.pid,
							host: config.host,
							port: config.port,
							version: sibling.version,
							startedAt: sibling.startedAt,
						});
						process.stdout.write(
							`another spool daemon already serves ${daemonUrl(config.host, config.port)} — standing down\n`,
						);
						return;
					}
				}
				throw error;
			}
			process.stdout.write(`spool daemon listening at ${daemon.url} (pid ${process.pid})\n`);
			const shutdown = () => {
				void daemon.close().then(() => process.exit(0));
			};
			process.on("SIGTERM", shutdown);
			process.on("SIGINT", shutdown);
			return;
		}
		const result = await ensureDaemon(spoolDir);
		process.stdout.write(
			result.started
				? `spool daemon started at ${result.url} (pid ${result.pid})\n`
				: `spool daemon already running at ${result.url} (pid ${result.pid})\n`,
		);
	});

program
	.command("autostart")
	.description("start the daemon at login (macOS launchd); off removes it")
	.argument("[state]", "on or off", "on")
	.action(async (state: string) => {
		if (state !== "on" && state !== "off") throw new SpoolError(`autostart takes "on" or "off", got "${state}"`);
		if (process.platform !== "darwin") throw new SpoolError("autostart is launchd-backed — macOS only for now");
		const uid = process.getuid?.();
		if (uid === undefined) throw new SpoolError("cannot determine the current uid");
		const home = homedir();

		if (state === "off") {
			const result = removeAutostart({ home, uid });
			process.stdout.write(
				result.removed
					? "autostart removed — nothing revives the daemon now; any spool command still starts one\n"
					: "autostart was not installed\n",
			);
			return;
		}

		const split = ["SPOOL_DIR", "SPOOL_PORT"].filter((name) => (process.env[name] ?? "") !== "");
		if (split.length > 0) {
			// the dogfood split must never reach launchd: login serves the daily daemon
			throw new SpoolError(`autostart serves the daily daemon — unset ${split.join(" and ")} first`);
		}

		// an unsupervised daemon yields first, so launchd's own binds cleanly
		await stopDaemon(spoolDir);
		installAutostart({
			home,
			uid,
			spoolDir,
			spec: {
				execPath: process.execPath,
				execArgv: process.execArgv,
				cliPath: selfCliPath(),
				logFile: join(spoolDir, "daemon.log"),
			},
		});
		const status = await poll(10_000, async () => {
			const probed = await statusDaemon(spoolDir);
			return probed.running ? probed : undefined;
		});
		if (status !== undefined) {
			process.stdout.write(`spool starts at login — daemon running at ${status.url} (pid ${status.pid})\n`);
			return;
		}
		throw new SpoolError(`launchd took the job but no daemon came up — see ${join(spoolDir, "daemon.log")}`);
	});

program
	.command("upgrade")
	.description("install the latest release and restart the daemon on it")
	.action(async () => {
		const outcome = await runUpgrade(spoolDir, pkg.version, { narrate });
		if (outcome.kind === "refused" || outcome.kind === "failed") throw new SpoolError(outcome.message);
		process.stdout.write(
			outcome.to === outcome.from
				? `already the latest (v${outcome.to})\n`
				: `spool v${outcome.from} → v${outcome.to}\n`,
		);
		if (outcome.daemon.running) {
			process.stdout.write(
				outcome.daemon.restarted
					? `daemon restarted at ${outcome.daemon.url} (v${outcome.to})\n`
					: `daemon already serves v${outcome.to} at ${outcome.daemon.url}\n`,
			);
		} else {
			process.stdout.write("daemon not running — any spool command starts it on the new version\n");
		}
	});

program
	.command("status")
	.description("report whether the daemon is running")
	.action(async () => {
		const status = await statusDaemon(spoolDir);
		// the daemon's cached daily check (#30) — status itself never phones home
		const cache = readUpdateCache(spoolDir);
		const available =
			cache !== undefined && isNewer(cache.latest, pkg.version)
				? ` — v${cache.latest} available, run \`spool upgrade\``
				: "";
		if (!status.running) {
			process.stdout.write(`spool daemon not running${available}\n`);
			process.exitCode = 1;
			return;
		}
		const skew =
			status.version === pkg.version ? "" : ` — cli is v${pkg.version}, \`spool upgrade\` brings them in step`;
		process.stdout.write(
			`spool daemon running at ${status.url} (pid ${status.pid}, v${status.version})${skew}${available}\n`,
		);
	});

program
	.command("stop")
	.description("stop the daemon")
	.action(async () => {
		const result = await stopDaemon(spoolDir);
		process.stdout.write(
			result.stopped ? `stopped spool daemon (pid ${result.pid})\n` : "spool daemon was not running\n",
		);
	});

try {
	await program.parseAsync();
} catch (error) {
	if (error instanceof SpoolError) {
		process.stderr.write(`spool: ${error.message}\n`);
		process.exitCode = 1;
	} else {
		throw error;
	}
}
