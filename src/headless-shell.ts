import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";

/**
 * Spool's own Chrome (#12): the chromium headless-shell build pinned by
 * playwright-core, fetched into playwright's shared machine cache the first
 * time it is needed. The fetch rides playwright's own installer, so the reuse
 * runs both ways: a build any tool already fetched launches here without a
 * download, and spool's fetch serves every other playwright on the machine.
 * Never a near-miss local Chrome.
 *
 * The daemon's photo booth is its one driver (`daemon/booth.ts`): every frame
 * cover and every `spool shot` is a page in it.
 */

/**
 * The flags the shell launches with, per platform.
 *
 * On a Mac the shell draws on the GPU through ANGLE's Metal backend. Its
 * default is SwiftShader, which draws a `backdrop-filter` backdrop mirrored and
 * under-draws WebGL fields, so a cover of a sheet over a blurred canvas, or of
 * a shader, was not the frame a person sees. With these three the same binary
 * agrees with a real window, and is a little faster. Elsewhere Chrome's own
 * defaults stand: nothing has measured a Linux or Windows GPU path better.
 */
export function headlessShellArgs(platform: NodeJS.Platform = process.platform): string[] {
	return platform === "darwin" ? ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] : [];
}

/** The pinned build is not in the machine's cache yet. */
export class MissingHeadlessShellError extends Error {
	constructor() {
		super("the pinned Chromium headless-shell is not installed");
		this.name = "MissingHeadlessShellError";
	}
}

export async function launchHeadlessShell(): Promise<Browser> {
	try {
		return await chromium.launch({ channel: "chromium-headless-shell", headless: true, args: headlessShellArgs() });
	} catch (error) {
		// playwright's stable phrasing for a build that is not in the cache
		if (error instanceof Error && error.message.includes("Executable doesn't exist")) {
			throw new MissingHeadlessShellError();
		}
		throw error;
	}
}

/**
 * playwright-core's own `install chromium-headless-shell`, as a child that
 * never holds the caller's event loop: the daemon runs this, and a download of
 * ninety megabytes is not something every request it serves should wait out.
 * The installer's own progress goes to stderr, which is the daemon's log.
 *
 * It runs on the same node as the caller with the same flags. In the Mac app
 * that node is Electron's binary, and `process.execArgv` carries the `-r` shim
 * that makes it behave as node for any command-line program it runs, the
 * installer included (`desktop/shim/electron-argv.js`). The version pin is
 * playwright-core's browsers.json; the destination is the shared cache,
 * honoring PLAYWRIGHT_BROWSERS_PATH. Playwright's installer locks that cache,
 * so two installs at once wait for each other rather than tearing a build.
 */
export function fetchHeadlessShell(): Promise<void> {
	const packageJson = createRequire(import.meta.url).resolve("playwright-core/package.json");
	const cli = join(dirname(packageJson), "cli.js");
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, [...process.execArgv, cli, "install", "chromium-headless-shell"], {
			stdio: ["ignore", 2, 2],
		});
		child.once("error", fail);
		child.once("exit", (code) => {
			if (code === 0) done();
			else fail(new Error(`fetching the headless-shell failed (exit ${code ?? "signal"})`));
		});
	});
}
