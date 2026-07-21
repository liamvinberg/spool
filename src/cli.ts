#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { SpoolError } from "./errors";
import { initProject } from "./init";
import { openProject } from "./open";

const usage = `spool, the live prototyping canvas

usage
  spool init [path]   scaffold design/ in a product root and register it
  spool open [path]   resolve the project by walk-up from path and register it

flags
  -v, --version       print the version
  -h, --help          show this help
`;

const rootConfigPointer = `add this line to the repo's root CLAUDE.md or AGENTS.md so future sessions find the canvas:

  design/ is a spool canvas (see design/AGENTS.md; run \`spool skill\` to learn it)
`;

function version(): string {
	const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
	return pkg.version;
}

function run(argv: string[]): number {
	const [command, ...rest] = argv;
	const spoolDir = join(homedir(), ".spool");

	switch (command) {
		case undefined:
		case "help":
		case "-h":
		case "--help": {
			process.stdout.write(usage);
			return 0;
		}
		case "-v":
		case "--version": {
			process.stdout.write(`${version()}\n`);
			return 0;
		}
		case "init": {
			const { root } = initProject(rest[0] ?? process.cwd(), spoolDir);
			process.stdout.write(`initialized spool project at ${root}\n\n${rootConfigPointer}`);
			return 0;
		}
		case "open": {
			const { root } = openProject(rest[0] ?? process.cwd(), spoolDir);
			process.stdout.write(`registered ${basename(root)} (${root})\n`);
			return 0;
		}
		default: {
			process.stderr.write(`spool: unknown command "${command}"\n\n${usage}`);
			return 1;
		}
	}
}

try {
	process.exitCode = run(process.argv.slice(2));
} catch (error) {
	if (error instanceof SpoolError) {
		process.stderr.write(`spool: ${error.message}\n`);
		process.exitCode = 1;
	} else {
		throw error;
	}
}
