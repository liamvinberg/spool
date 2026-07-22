import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";
import { SpoolError } from "./errors";

/**
 * Spool's own Chrome (#12): the chromium headless-shell build pinned by
 * playwright-core, lazy-fetched into playwright's shared machine cache on the
 * first shot and narrated on stderr so agents can relay what is happening.
 * The fetch rides playwright's own installer — exact-build reuse in both
 * directions: a build any tool already fetched launches here without a
 * download, and spool's fetch serves every other playwright on the machine.
 * Never a near-miss local Chrome.
 */

export async function launchHeadlessShell(narrate: (line: string) => void): Promise<Browser> {
	try {
		return await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	} catch (error) {
		if (!isMissingExecutable(error)) throw error;
	}
	narrate("first shot on this machine — fetching the pinned Chromium headless-shell (one-time, ~90 MB)");
	installHeadlessShell();
	narrate("headless-shell ready — cached for every future shot");
	return chromium.launch({ channel: "chromium-headless-shell", headless: true });
}

/** Playwright's stable phrasing for a build that is not in the cache. */
function isMissingExecutable(error: unknown): boolean {
	return error instanceof Error && error.message.includes("Executable doesn't exist");
}

/**
 * playwright-core's own `install chromium-headless-shell`, blocking, with all
 * installer output (progress bars included) on our stderr — stdout stays the
 * verb's. The version pin is playwright-core's browsers.json; the destination
 * is the shared cache, honoring PLAYWRIGHT_BROWSERS_PATH.
 */
function installHeadlessShell(): void {
	const packageJson = createRequire(import.meta.url).resolve("playwright-core/package.json");
	const cli = join(dirname(packageJson), "cli.js");
	const result = spawnSync(process.execPath, [cli, "install", "chromium-headless-shell"], {
		stdio: ["ignore", 2, 2],
	});
	if (result.status !== 0) {
		throw new SpoolError("fetching the headless-shell failed — see the install output above");
	}
}
