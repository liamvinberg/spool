import { execFile } from "node:child_process";
import { basename, dirname } from "node:path";
import { promisify } from "node:util";
import { teamProjectName } from "./team-project-name";

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
	/** The main checkout's folder when this work tree is a linked worktree of it (git's common dir), else undefined. */
	main?: string;
}

const run = promisify(execFile);

/**
 * The environment git runs in when spool asks it something: the daemon's own git environment taken off, so it asks
 * about the folder or remote named, and never a prompt, for a password or a host key nobody is there to answer.
 */
export const quietGit = (): NodeJS.ProcessEnv => ({
	...process.env,
	GIT_DIR: undefined,
	GIT_WORK_TREE: undefined,
	GIT_TERMINAL_PROMPT: "0",
	GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
});

/** The checkout a folder is in. Asks git, with the daemon's own git environment taken off so it asks about this folder. */
export async function checkoutOf(dir: string): Promise<Checkout | undefined> {
	const git = async (args: string[]) => {
		try {
			return (
				await run("git", args, { cwd: dir, env: quietGit(), timeout: 10_000, windowsHide: true })
			).stdout.trim();
		} catch {
			return undefined;
		}
	};
	const top = await git(["rev-parse", "--show-toplevel"]);
	if (top === undefined || top === "") return undefined;
	const repo = repoOf(await git(["remote", "get-url", "origin"]));
	const [own, common] =
		(await git(["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"]))?.split("\n") ?? [];
	// a linked worktree keeps its own git dir under the main checkout's: the common dir is the main one's `.git`
	const main =
		own === undefined || common === undefined || own === common
			? undefined
			: basename(common) === ".git"
				? dirname(common)
				: common;
	return { top, repo, ...(main === undefined ? {} : { main }) };
}

/**
 * Where a team project's name came from: `--name`, the repo's `origin`, the main checkout's folder (a worktree of a
 * repo with no `origin`), or the folder it was started in.
 */
export type ProjectNameSource = "flag" | "repo" | "checkout" | "folder";

/** The name a team project takes, and where it came from. */
export interface ProjectName {
	name: string;
	from: ProjectNameSource;
}

/**
 * The name a team project started or moved in at `root` takes (spool#295). `--name` first; then, at the top of a
 * checkout, the repo's own name from `origin`, or with no `origin` the main checkout's folder, so that a worktree's
 * folder, named after its task, never names the project; anywhere else, outside git or in a subfolder of a checkout,
 * the folder's name. A name from the repo is cleaned as spool.page cleans one (`my_app` is `my-app`), and kept as it
 * is when nothing is left of it, for spool.page to refuse; a folder's and `--name` go as typed.
 */
export function teamProjectNameAt(root: string, checkout: Checkout | undefined, flag?: string): ProjectName {
	if (flag !== undefined) return { name: flag.trim(), from: "flag" };
	const cleaned = (name: string) => teamProjectName(name) ?? name;
	if (checkout !== undefined && checkout.top === root) {
		const repo = checkout.repo?.split("/").at(-1);
		if (repo !== undefined) return { name: cleaned(repo), from: "repo" };
		if (checkout.main !== undefined) return { name: cleaned(basename(checkout.main)), from: "checkout" };
	}
	return { name: basename(root), from: "folder" };
}
