import { fileURLToPath } from "node:url";

/** One of spool's own scripts, and what node needs to run it. */
export interface SpoolEntry {
	/** The script, absolute. */
	path: string;
	/** The node flags it runs under: tsx for a TypeScript source, none for a build. */
	execArgv: string[];
}

/**
 * A script spool starts in a process of its own: the CLI, the bundled host,
 * the command owner. From a checkout it is
 * the TypeScript source, run through tsx; from the package it is the build
 * tsup writes for it (tsup.config.ts). Both are named relative to this file, so
 * from src/daemon/ in a checkout and from dist/ once built, where every entry
 * sits side by side.
 */
export function spoolEntry(source: string, built: string): SpoolEntry {
	const fromSource = import.meta.url.endsWith(".ts");
	return {
		path: fileURLToPath(new URL(fromSource ? source : built, import.meta.url)),
		execArgv: fromSource ? ["--import", import.meta.resolve("tsx")] : [],
	};
}
