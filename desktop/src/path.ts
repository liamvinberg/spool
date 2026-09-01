import { spawnSync } from "node:child_process";
import { delimiter } from "node:path";

// The PATH a terminal has and a launched app does not.
//
// macOS hands a GUI-launched app the PATH out of launchd — /usr/local/bin and the
// four system directories, and nothing any shell profile ever set. Everything a
// person installs for themselves lands somewhere else: ~/.local/bin, ~/.bun/bin, a
// pnpm home, homebrew on Apple silicon. So the daemon inside this app looks at a
// machine with claude on it, truthfully reports that there is none, and would have
// failed the same way spawning it. `spool serve` from a terminal never had the
// problem, which is why it reads as an app bug rather than a daemon one, and why
// the fix is here rather than in the daemon: the daemon inherits one PATH and both
// its `which` and its spawn read that same one, and they must not start disagreeing.
//
// So: ask once, before the daemon starts, and hand the answer in as its
// environment. It is asked of the login shell rather than assembled from a list of
// likely directories, because a guessed list is this app holding an opinion about
// where somebody installs things, and it is wrong for exactly the person whose
// setup nobody thought of.
//
// Nothing here is allowed to matter. A shell that hangs, refuses, or answers with
// nothing leaves the environment exactly as it was found, which is what every
// release before this one started the daemon with.

/** Asking a shell for its PATH; a seam, so a test says what a machine answered. */
export type Ask = (shell: string) => string | undefined;

/** Wrapped, because a profile that prints a banner is a profile, not a failure. */
const MARK = "__spool_path__";

/**
 * What is run inside the shell.
 *
 * Braced: the marker is a legal variable-name character, so a bare `$PATH` beside
 * it reads as one long name that nothing ever set, and the answer comes back
 * empty on every machine.
 */
const PROBE = `printf '%s' "${MARK}\${PATH}${MARK}"`;

/**
 * Whose shell to ask.
 *
 * SHELL is what the person chose and launchd does pass it through, so it is the
 * answer whenever it looks like a path. The fallback is the platform default
 * rather than `/bin/sh`, because a POSIX shell reads none of the files that set a
 * PATH on a Mac and would answer with the impoverished one it was handed.
 */
export function shellOf(env: NodeJS.ProcessEnv): string {
	const shell = env.SHELL;
	if (shell?.startsWith("/") === true) return shell;
	return process.platform === "darwin" ? "/bin/zsh" : "/bin/sh";
}

/**
 * Run the shell the way a terminal runs it and read back one line.
 *
 * `-ilc`: login for the profile, interactive for the rc file. Both, because which
 * of the two sets PATH is a matter of taste and half of every setup picks the one
 * this app would otherwise miss. There is no terminal on the other end, so stdin
 * is closed and stderr is dropped — a prompt with nobody to answer it would hang
 * until the timeout, and a profile's chatter is not this app's to relay.
 */
export const askLoginShell: Ask = (shell) => {
	let probe: ReturnType<typeof spawnSync>;
	try {
		probe = spawnSync(shell, ["-ilc", PROBE], {
			encoding: "utf8",
			timeout: 5_000,
			stdio: ["ignore", "pipe", "ignore"],
			// a shell that decides to update itself is a shell that does not answer
			env: { ...process.env, DISABLE_AUTO_UPDATE: "true", TERM: "dumb" },
		});
	} catch {
		return undefined;
	}
	if (probe.error !== undefined || typeof probe.stdout !== "string") return undefined;
	const opened = probe.stdout.indexOf(MARK);
	if (opened === -1) return undefined;
	const closed = probe.stdout.indexOf(MARK, opened + MARK.length);
	if (closed === -1) return undefined;
	const answered = probe.stdout.slice(opened + MARK.length, closed);
	return answered === "" ? undefined : answered;
};

/**
 * The shell's PATH in front of the one this process has, each directory once.
 *
 * In front because that is the order a terminal resolves in, and this whole module
 * exists to make the app agree with a terminal. Behind rather than instead,
 * because the app's own PATH is where the system tools are and dropping it to
 * trust a profile would be a bigger bet than the one being made.
 *
 * Undefined unless the shell named a directory this process did not already have.
 * A shell with nothing to add is the ordinary case on a machine where everything
 * lives in /usr/bin, and reordering a working PATH on the strength of an answer
 * that changed nothing is a risk taken for no benefit at all.
 */
export function merged(current: string | undefined, discovered: string | undefined): string | undefined {
	if (discovered === undefined) return undefined;
	const held = new Set((current ?? "").split(delimiter).filter((directory) => directory !== ""));
	const seen = new Set<string>();
	const path: string[] = [];
	let added = false;
	for (const source of [discovered, current ?? ""]) {
		for (const directory of source.split(delimiter)) {
			// an empty entry means the working directory to a shell, and a daemon
			// started from a home directory has no business resolving against one
			if (directory === "" || seen.has(directory)) continue;
			seen.add(directory);
			path.push(directory);
			if (!held.has(directory)) added = true;
		}
	}
	return added ? path.join(delimiter) : undefined;
}

/**
 * The PATH to start the daemon with, or undefined to start it with the one there.
 *
 * Windows is left alone: a GUI-launched program there inherits the user's own PATH
 * from the registry, so there is nothing missing to go and find, and no login
 * shell to find it with.
 */
export function userPath(env: NodeJS.ProcessEnv = process.env, ask: Ask = askLoginShell): string | undefined {
	if (process.platform === "win32") return undefined;
	return merged(env.PATH, ask(shellOf(env)));
}
