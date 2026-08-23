import { type SpawnOptions, spawn } from "node:child_process";

/**
 * The person's browser — the one they read their canvas in, not the headless
 * one `headless-shell.ts` drives.
 *
 * Every comparable tool opens a browser when a human starts it, and a bare
 * `spool` is a person asking to see the thing (#239). The whole of it is one
 * detached hand-off to the platform's own opener, so spool never has to know
 * what a default browser is.
 */

/** Just enough of a spawned child to launch and let go; tests hand in their own. */
interface Launched {
	on(event: "error", listener: (error: Error) => void): unknown;
	unref(): unknown;
}

type Launcher = (command: string, args: readonly string[], options: SpawnOptions) => Launched;

/** How each platform is asked to open a URL with whatever the person browses in. */
function launchCommand(url: string, platform: NodeJS.Platform): [string, ...string[]] {
	if (platform === "darwin") return ["open", url];
	// `start` is a cmd builtin, and its first quoted operand is the new window's
	// title — the empty one keeps a quoted url from being read as one.
	if (platform === "win32") return ["cmd", "/c", "start", "", url];
	return ["xdg-open", url];
}

export interface OpenInBrowserOptions {
	platform?: NodeJS.Platform;
	/** The spawn under test; production uses node's. */
	launcher?: Launcher;
}

/**
 * Hand the URL to the platform's opener and stand back.
 *
 * Detached with every stream ignored: the browser outlives this process, and
 * nothing the opener prints lands in the middle of the CLI's own output. A
 * machine with no opener installed fails silently, because the URL is already
 * printed above and a person who can read it is not helped by being told that
 * `xdg-open` is missing.
 */
export function openInBrowser(url: string, options: OpenInBrowserOptions = {}): void {
	const [command, ...args] = launchCommand(url, options.platform ?? process.platform);
	const child = (options.launcher ?? spawn)(command, args, { detached: true, stdio: "ignore" });
	child.on("error", () => {});
	child.unref();
}

/**
 * Whether a bare `spool` should put the canvas in front of somebody.
 *
 * Only a real terminal counts. An agent or a script running `spool` gets the
 * URL printed and nothing else: storybook shipped auto-open unconditionally and
 * is walking it back because agents pop browsers on people, so spool starts
 * with the guard. `--no-open` is how a human at a terminal opts out.
 */
export function shouldOpenBrowser(options: { noOpen: boolean; stdin: { isTTY?: boolean } }): boolean {
	return !options.noOpen && options.stdin.isTTY === true;
}
