#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { ensureDaemon, resolveServeConfig, statusDaemon, stopDaemon } from "./daemon/lifecycle";
import { serveDaemon } from "./daemon/server";
import { SpoolError } from "./errors";
import { initProject } from "./init";
import { openProject } from "./open";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const spoolDir = join(homedir(), ".spool");
// package root anchors dist/ui for both the built cli (dist/cli.js) and a checkout (src/cli.ts)
const uiDir = fileURLToPath(new URL("../dist/ui", import.meta.url));

const rootConfigPointer = `add this line to the repo's root CLAUDE.md or AGENTS.md so future sessions find the canvas:

  design/ is a spool canvas (see design/AGENTS.md; run \`spool skill\` to learn it)
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

program
	.command("serve")
	.description("start the daemon if it is not already running")
	.option("--foreground", "run the daemon in this process (development, launchd)")
	.action(async (options: { foreground?: boolean }) => {
		if (options.foreground === true) {
			const config = resolveServeConfig(spoolDir, process.env);
			const daemon = await serveDaemon({
				spoolDir,
				version: pkg.version,
				host: config.host,
				port: config.port,
				uiDir,
			});
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
	.command("status")
	.description("report whether the daemon is running")
	.action(async () => {
		const status = await statusDaemon(spoolDir);
		if (!status.running) {
			process.stdout.write("spool daemon not running\n");
			process.exitCode = 1;
			return;
		}
		const skew =
			status.version === pkg.version ? "" : ` — cli is v${pkg.version}, \`spool stop\` then any command updates it`;
		process.stdout.write(`spool daemon running at ${status.url} (pid ${status.pid}, v${status.version})${skew}\n`);
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
