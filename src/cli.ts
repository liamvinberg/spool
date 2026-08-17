#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { installAutostart, removeAutostart } from "./autostart";
import { checkDesign } from "./check";
import {
	daemonUrl,
	ensureDaemon,
	poll,
	readDaemonState,
	resolveServeConfig,
	resolveSpoolDir,
	selfCliPath,
	spoolDaemonAt,
	statusDaemon,
	stopDaemon,
} from "./daemon/lifecycle";
import { type RunningDaemon, serveDaemon } from "./daemon/server";
import { isNewer, readUpdateCache } from "./daemon/update-check";
import { startRegisteredUiWatcher, type UiBuildWatcher } from "./dev-ui-hook";
import { doorAddressFor } from "./door";
import { PortBusyError, SpoolError } from "./errors";
import { initProject } from "./init";
import { openProject } from "./open";
import { isSafeName } from "./page-path";
import { removeProject } from "./remove";
import { resolveProjectRoot } from "./resolve";
import { skillText } from "./skill";
import { describeSkew, runUpgrade, selfUpgradeable, skewBehind } from "./upgrade";
import { mintPlayerUrl, mintRawUrl, readFlows, readSelection, resolveRegisteredProject } from "./verbs";
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
	.description("scaffold design/, register the project, and open its tab")
	.argument("[path]", "product root", ".")
	.action((path: string) => {
		const { root } = initProject(path, spoolDir);
		process.stdout.write(`initialized spool project at ${root}\n\n${rootConfigPointer}`);
	});

program
	.command("open")
	.description("resolve the project by walk-up, register it, and open its tab")
	.argument("[path]", "where the walk-up starts", ".")
	.action(async (path: string) => {
		const { root } = openProject(path, spoolDir);
		process.stdout.write(`registered ${basename(root)} (${root})\n`);
		// daemon-less by design (#12); when one runs, the tab is already opening — say where
		const status = await statusDaemon(spoolDir);
		if (status.running) {
			process.stdout.write(`canvas: ${status.url}/p/${encodeURIComponent(basename(root))}\n`);
			// The raw URL is the truth and the thing agents use, so it stays first.
			// The second line is the one a person can remember tomorrow.
			const door = doorAddressFor(status.url);
			if (door !== undefined) process.stdout.write(`        ${door} opens spool from any browser\n`);
		}
	});

/**
 * The bare verb (#154): take me to my canvas.
 *
 * `open` above stays registration-only and daemon-less by design (#12) — it is a
 * step a script composes. A bare `spool` is a person asking to see the thing, so
 * it is the one entry that ensures a daemon and always prints where the canvas
 * is. It never scaffolds: no project here means the same pointer at `spool init`.
 */
async function openCanvas(): Promise<void> {
	const { root } = openProject(process.cwd(), spoolDir);
	const { url } = await ensureDaemon(spoolDir);
	process.stdout.write(`canvas: ${url}/p/${encodeURIComponent(basename(root))}\n`);
}

program
	.command("remove")
	.description("forget one exact registered project root without deleting it")
	.argument("[path]", "registered project root", ".")
	.action((path: string) => {
		const result = removeProject(path, spoolDir);
		process.stdout.write(result.removed ? `removed ${result.root}\n` : `${result.root} was not registered\n`);
	});

program
	.command("check")
	.description("check every HTML frame offline without starting spool")
	.argument("[path]", "where the walk-up starts", ".")
	.action((path: string) => {
		const root = resolveProjectRoot(path);
		if (root === undefined) {
			throw new SpoolError(
				`not inside a spool project — no design/canvas.json here or above; \`spool init\` starts one`,
			);
		}
		const diagnostics = checkDesign(root);
		for (const diagnostic of diagnostics) {
			process.stderr.write(
				`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} TS${diagnostic.code}: ${diagnostic.message}\n`,
			);
		}
		if (diagnostics.length > 0) process.exitCode = 1;
	});

// --- agent verbs (#25): read-only, cwd-resolved, daemon auto-started ---------

const narrate = (line: string) => process.stderr.write(`spool: ${line}\n`);

/** Anything but an explicit yes is a no — the destructive half needs the word. */
const confirmOnTty = async (question: string): Promise<boolean> => {
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	try {
		return /^y(es)?$/i.test((await rl.question(`spool: ${question} [y/N] `)).trim());
	} finally {
		rl.close();
	}
};

interface VerifyOptions {
	viewport?: { width: number; height: number };
	at?: number;
	scenario?: string;
}

function parseViewport(value: string): { width: number; height: number } {
	const match = /^(\d+)x(\d+)$/.exec(value);
	const width = match === null ? Number.NaN : Number(match[1]);
	const height = match === null ? Number.NaN : Number(match[2]);
	if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
		throw new SpoolError(`--viewport must be <width>x<height> with positive integers, got "${value}"`);
	}
	return { width, height };
}

function parseMilliseconds(value: string): number {
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
		throw new SpoolError(`--at must be whole milliseconds, got "${value}"`);
	}
	return Number(value);
}

function parseScenario(value: string): string {
	if (!isSafeName(value)) {
		throw new SpoolError(`--scenario must be a scenario name without a leading dot or slash, got "${value}"`);
	}
	return value;
}

/** Every verb's preamble: the project this cwd is inside, and a live daemon. */
async function verbContext(): Promise<{ root: string; name: string; daemonUrl: string; controlToken: string }> {
	const { root, name } = resolveRegisteredProject(spoolDir, process.cwd());
	const { url, controlToken } = await ensureDaemon(spoolDir);
	return { root, name, daemonUrl: url, controlToken };
}

program
	.command("selection")
	.description("print the live selection block — what the human points at")
	.action(async () => {
		const { name, daemonUrl, controlToken } = await verbContext();
		const block = await readSelection(daemonUrl, name, controlToken);
		// nothing pointed at is nothing printed: an empty block would be a shape
		// claiming the moment had one
		if (block !== "") process.stdout.write(`${block}\n`);
	});

program
	.command("flows")
	.description("print the link graph: read from source, verified by sessions")
	.action(async () => {
		const { name, daemonUrl, controlToken } = await verbContext();
		process.stdout.write(`${await readFlows(daemonUrl, name, controlToken)}\n`);
	});

program
	.command("shot")
	.description("save an HTML headless screenshot or a terminal source-current persisted-grid SVG")
	.argument("<frame>", "frame folder name")
	.option("--viewport <width>x<height>", "exact CSS viewport", parseViewport)
	.option("--at <milliseconds>", "post-commit wait", parseMilliseconds)
	.option("--scenario <name>", "named scenario seed", parseScenario)
	.action(async (frame: string, options: VerifyOptions) => {
		const { root, name, daemonUrl, controlToken } = await verbContext();
		const outcome = await shotFrame({ daemonUrl, controlToken, root, name, frame, narrate, ...options });
		if (outcome.kind === "missing") throw new SpoolError(outcome.message);
		if (outcome.kind === "broken") {
			// the compile or boot error verbatim — nothing of spool's in the way
			process.stderr.write(`${outcome.message}\n`);
			process.exitCode = 1;
			return;
		}
		process.stdout.write(`${outcome.files.join("\n")}\n`);
		if (outcome.bootErrors.length > 0) {
			process.stderr.write(`${outcome.bootErrors.join("\n")}\n`);
			process.exitCode = 1;
		}
	});

program
	.command("logs")
	.description("print the frame's boot console output (cached until source changes)")
	.argument("<frame>", "frame folder name")
	.option("--scenario <name>", "named scenario seed", parseScenario)
	.action(async (frame: string, options: Pick<VerifyOptions, "scenario">) => {
		const { root, name, daemonUrl, controlToken } = await verbContext();
		const outcome = await logsFrame({ daemonUrl, controlToken, root, name, frame, narrate, ...options });
		if (outcome.kind === "missing") throw new SpoolError(outcome.message);
		if (outcome.kind === "broken") {
			process.stderr.write(`${outcome.message}\n`);
			process.exitCode = 1;
			return;
		}
		if (outcome.replayed) narrate("replaying cached logs — cache matches current compiled source");
		if (outcome.entries.length === 0) {
			narrate("the boot logged nothing");
		} else {
			process.stdout.write(`${outcome.entries.map((entry) => `[${entry.type}] ${entry.text}`).join("\n")}\n`);
		}
		// The frame's last self-capture failure (#173), if one is on record — a
		// dark placeholder is otherwise silent about why it never got a picture.
		if (outcome.captureError !== undefined) {
			process.stdout.write(`cover capture failed: ${outcome.captureError.error} (${outcome.captureError.at})\n`);
		}
	});

program
	.command("url")
	.description("mint a player-session URL to drive in a browser")
	.argument("<frame>", "frame folder name")
	.option("--raw", "mint the bare frame document URL: one frame, no session")
	.action(async (frame: string, options: { raw?: boolean }) => {
		const { root, name, daemonUrl, controlToken } = await verbContext();
		process.stdout.write(
			`${
				options.raw === true
					? await mintRawUrl(daemonUrl, name, frame, root)
					: await mintPlayerUrl(daemonUrl, name, frame, controlToken)
			}\n`,
		);
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
			// a detached spawn's stderr is daemon.log, which is where anyone chasing a
			// host that stopped working already ends up
			for (const notice of config.notices) narrate(notice);
			let uiWatcher: UiBuildWatcher | undefined;
			let daemon: RunningDaemon;
			try {
				uiWatcher = await startRegisteredUiWatcher();
				daemon = await serveDaemon({
					spoolDir,
					version: pkg.version,
					host: config.host,
					port: config.port,
					uiDir,
					development,
					// #30: an install no package manager owns cannot take an upgrade,
					// so it is never offered one — the checkout included
					updateCheck: config.updateCheck && selfUpgradeable(),
					experiments: config.experiments,
				});
			} catch (error) {
				if (error instanceof PortBusyError) {
					const sibling = await spoolDaemonAt(config.host, config.port);
					const recorded = readDaemonState(spoolDir);
					if (sibling !== undefined && recorded?.pid === sibling.pid) {
						process.stdout.write(
							`another spool daemon already serves ${daemonUrl(config.host, config.port)} — standing down\n`,
						);
						await uiWatcher?.close();
						return;
					}
					if (sibling !== undefined) {
						await uiWatcher?.close();
						throw new SpoolError(
							`another spool daemon already serves ${daemonUrl(config.host, config.port)}, but its control credential is unavailable — stop it or restore ${join(spoolDir, "daemon.json")}`,
						);
					}
				}
				await uiWatcher?.close();
				throw error;
			}
			process.stdout.write(`spool daemon listening at ${daemon.url} (pid ${process.pid})\n`);
			const door = doorAddressFor(daemon.url);
			if (door !== undefined) process.stdout.write(`${door} opens it from any browser\n`);
			let stopping = false;
			const shutdown = () => {
				if (stopping) return;
				stopping = true;
				void (async () => {
					try {
						await uiWatcher?.close();
					} finally {
						await daemon.close();
						process.exit(0);
					}
				})();
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
	.option("--yes", "skip the confirmation before the daemon is restarted")
	.action(async (options: { yes?: boolean }) => {
		// A prompt nobody can answer is a hang: ask only a real terminal. An
		// agent's shell and the toast door's detached spawn both fall through.
		const asks = options.yes !== true && process.stdin.isTTY === true;
		const outcome = await runUpgrade(spoolDir, pkg.version, { narrate, ...(asks ? { confirm: confirmOnTty } : {}) });
		if (outcome.kind === "refused" || outcome.kind === "failed") throw new SpoolError(outcome.message);
		if (outcome.kind === "declined") {
			process.stdout.write("left alone — nothing was installed and the daemon was not touched\n");
			return;
		}
		if (outcome.kind === "current") {
			process.stdout.write(
				outcome.daemon !== undefined && isNewer(outcome.daemon, outcome.latest)
					? `npm's latest is v${outcome.latest} but the daemon already runs v${outcome.daemon} — not downgrading it\n`
					: `already the latest (v${outcome.latest})\n`,
			);
			return;
		}
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
		const upgradeable = selfUpgradeable();
		// the daemon's cached daily check (#30) — status itself never phones home,
		// and stays quiet where no daemon writes that cache any more
		const cache = upgradeable ? readUpdateCache(spoolDir) : undefined;
		const available =
			cache !== undefined && isNewer(cache.latest, pkg.version)
				? ` — v${cache.latest} available, run \`spool upgrade\``
				: "";
		if (!status.running) {
			process.stdout.write(`spool daemon not running${available}\n`);
			process.exitCode = 1;
			return;
		}
		const skew = describeSkew(status.version, pkg.version);
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
	// The default is routed here rather than as a commander action handler,
	// because one on the root swallows every operand it does not recognize —
	// `spool frobnicate` has to stay an unknown command, not a canvas.
	const args = process.argv.slice(2);
	if (args.length === 0) await openCanvas();
	else await program.parseAsync();
} catch (error) {
	if (error instanceof SpoolError) {
		// a version skew refuses exactly like a bad token; name it here rather
		// than leave the failing verb saying only `unauthenticated` (#155)
		process.stderr.write(`spool: ${error.message}${await skewBehind(error, pkg.version)}\n`);
		process.exitCode = 1;
	} else {
		throw error;
	}
}
