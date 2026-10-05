import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * The repo a checkout's code lives in, read from its git `origin`. Spool Cloud records it on a team project as
 * information for the team ("Get it" looks for a checkout of it, the team page shows it), never as a permission.
 *
 * It is kept as host and path only, lower-cased, so the ssh and https remotes of one repo are the same repo, and a
 * credential written into a remote URL never leaves this machine:
 *
 *     git@github.com:Devosurf/app.git           → github.com/devosurf/app
 *     ssh://git@github.com:22/devosurf/app      → github.com/devosurf/app
 *     https://token@github.com/devosurf/app.git → github.com/devosurf/app
 *
 * spool.page keeps the same rule (`src/worker/sync/repos.ts` in spool-cloud); both change together. A remote that
 * is a path on this machine names no shared repo, and reads as none.
 */
export function repoOf(remote: unknown): string | undefined {
	if (typeof remote !== "string") return undefined;
	const value = remote.trim();
	let host: string;
	let path: string;
	const scheme = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/]*@)?([^/:]+)(?::\d*)?(\/.*)?$/iu.exec(value);
	const scp = /^(?:[^@/:]+@)?([^/:]+):(?!\/\/)(.+)$/u.exec(value);
	const bare = /^([^/:@]+)(\/[^:@]+)$/u.exec(value);
	if (scheme) {
		if (!["https", "http", "ssh", "git", "git+ssh", "ssh+git"].includes(scheme[1]?.toLowerCase() ?? ""))
			return undefined;
		host = scheme[2] ?? "";
		path = scheme[3] ?? "";
	} else if (scp && (scp[1] ?? "").includes(".")) {
		host = scp[1] ?? "";
		path = scp[2] ?? "";
	} else if (bare && (bare[1] ?? "").includes(".")) {
		// already host and path, as a recorded repo is written
		host = bare[1] ?? "";
		path = bare[2] ?? "";
	} else return undefined;
	const segments = path
		.replace(/\/+$/u, "")
		.replace(/\.git$/iu, "")
		.split("/")
		.filter((segment) => segment !== "");
	if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/iu.test(host) || segments.length === 0) return undefined;
	if (segments.some((segment) => segment === "." || segment === ".." || !/^[\w.~-]+$/u.test(segment)))
		return undefined;
	const repo = `${host}/${segments.join("/")}`.toLowerCase();
	return repo.length <= 300 ? repo : undefined;
}

/** The command a member runs to clone a team project's repo themselves: Spool never clones. */
export function cloneCommand(repo: string): string {
	return `git clone https://${repo}.git`;
}

/** Where a folder's checkout is and which repo its `origin` names, or nothing outside a git work tree. */
export interface Checkout {
	/** The work tree's top folder. */
	top: string;
	/** `host/path`, or undefined when `origin` is missing or a path on this machine. */
	repo: string | undefined;
}

const run = promisify(execFile);

/** The checkout a folder is in. Asks git, with the daemon's own git environment taken off so it asks about this folder. */
export async function checkoutOf(dir: string): Promise<Checkout | undefined> {
	const git = async (args: string[]) => {
		try {
			const env = { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_TERMINAL_PROMPT: "0" };
			return (await run("git", args, { cwd: dir, env, timeout: 10_000, windowsHide: true })).stdout.trim();
		} catch {
			return undefined;
		}
	};
	const top = await git(["rev-parse", "--show-toplevel"]);
	if (top === undefined || top === "") return undefined;
	return { top, repo: repoOf(await git(["remote", "get-url", "origin"])) };
}
