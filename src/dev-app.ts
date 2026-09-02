import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { daemonUrl, fetchHealth, poll, readDaemonState } from "./daemon/lifecycle";

/**
 * `pnpm dev app` is `serve --foreground` with the checkout's Mac app opened on
 * it: one terminal, one Ctrl+C, and the window can only ever come up after the
 * daemon it adopts is answering. The two used to be two commands in two
 * terminals with the same environment typed into both, and the app started
 * first showed a holding page with no hint that ordering was the problem.
 *
 * The app rides as a child rather than the daemon riding inside Electron, so
 * this process stays the one thing `serve --foreground` already is: the owner
 * of the daemon and of the checkout's UI watcher, which arms on that verb and
 * nowhere else.
 */
export function opensCheckoutApp(args: readonly string[]): boolean {
	return args[0] === "app";
}

/** The verb the production CLI runs for `app`; anything after the verb rides along. */
export function appArgs(args: readonly string[]): string[] {
	return ["serve", "--foreground", ...args.slice(1)];
}

/**
 * Electron lives in desktop/'s own lockfile, never the root's, so the root
 * install does not bring it and this verb cannot assume it. The check is the
 * binary itself: an install that stopped halfway is the same as none.
 */
export function electronInstalled(desktopDir: string): boolean {
	return existsSync(join(desktopDir, "node_modules", ".bin", "electron"));
}

export interface OpenAppOptions {
	desktopDir: string;
	spoolDir: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
}

/**
 * Open the checkout's app on the daemon recorded in spoolDir, once it answers
 * health as itself. The caller has already run `serve --foreground`, so what is
 * recorded is either this process or the sibling it stood down for; either way
 * the app adopts it, because an unpackaged app has no bundled spool to start.
 *
 * The child is the electron launcher, which relays SIGINT and SIGTERM to the
 * window, so Ctrl+C in this terminal closes both halves. Quitting the app ends
 * the child, and the caller decides what that means for the daemon.
 */
export async function openCheckoutApp(options: OpenAppOptions): Promise<ChildProcess> {
	const { desktopDir, spoolDir } = options;
	const env = options.env ?? process.env;
	const live = await poll(options.timeoutMs ?? 10_000, async () => {
		const state = readDaemonState(spoolDir);
		if (state === undefined) return undefined;
		const health = await fetchHealth(daemonUrl(state.host, state.port));
		return health?.pid === state.pid ? state : undefined;
	});
	if (live === undefined)
		throw new Error(`no spool daemon answered from ${spoolDir}, so there is nothing to open the app on`);

	// `pnpm start` is `pnpm build && electron .`; the build is run here so the
	// window is a child of this process rather than of a shell of pnpm's, and a
	// signal reaches it directly.
	const built = spawnSync("pnpm", ["build"], { cwd: desktopDir, stdio: "inherit", env });
	if (built.status !== 0) throw new Error("the Mac app did not build, see above");

	return spawn(join(desktopDir, "node_modules", ".bin", "electron"), ["."], {
		cwd: desktopDir,
		stdio: "inherit",
		env,
	});
}
