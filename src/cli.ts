#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Command } from "commander";
import { SpoolError } from "./errors";
import { initProject } from "./init";
import { openProject } from "./open";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const spoolDir = join(homedir(), ".spool");

const rootConfigPointer = `add this line to the repo's root CLAUDE.md or AGENTS.md so future sessions find the canvas:

  design/ is a spool canvas (see design/AGENTS.md; run \`spool skill\` to learn it)
`;

const program = new Command("spool")
	.description("the live prototyping canvas")
	.version(pkg.version, "-v, --version");

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
	.action((path: string) => {
		const { root } = openProject(path, spoolDir);
		process.stdout.write(`registered ${basename(root)} (${root})\n`);
	});

try {
	program.parse();
} catch (error) {
	if (error instanceof SpoolError) {
		process.stderr.write(`spool: ${error.message}\n`);
		process.exitCode = 1;
	} else {
		throw error;
	}
}
