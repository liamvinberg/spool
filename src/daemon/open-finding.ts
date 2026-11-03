import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { branchAt, remoteHead } from "../git-clone";
import { checkoutOf, repoOf } from "../git-remote";
import { realDir } from "../paths";
import { teamProjects } from "../registry";
import { resolveProjectRoot } from "../resolve";
import { parseProjectLink, readProjectLink } from "../team-project";

/**
 * What Open… was handed, read once: a folder, a `.spool` file or a link, whether it came from the open panel, a drop
 * or a paste. The finding names the one action that fits, and the UI takes it: open a project at once, or ask first
 * in a sheet when spool would make something (design in a folder, import a file, clone a repo, get a team's project).
 */
export type Finding =
	/** a project on this Mac, the folder itself or the one a path sits inside */
	| { kind: "project"; root: string; name: string }
	/** a folder with no designs yet, at the top of its checkout when it is in one */
	| { kind: "folder"; path: string; name: string; branch: string | null; code: boolean; items: number }
	/** a `.spool` file, imported into the projects location, `into`, under the name its archive gives */
	| { kind: "file"; path: string; name: string; bytes: number; into: string }
	/** a git link that answers, cloned into the projects location */
	| { kind: "repo"; url: string; name: string; repo: string; branch: string | null; into: string }
	/** a team's project not on this Mac yet; `checkout` is a checkout here that holds its spool.json without design/ */
	| { kind: "team"; team: string; project: string; url: string; checkout: string | null }
	| { kind: "nothing"; says: string };

/** How this account stands in a team project spool.page was asked about. */
export type TeamStanding = "editor" | "viewer" | "missing" | "signed-out" | "unreachable";

export interface FindingDeps {
	spoolDir: string;
	home: string;
	/** Where imports and clones land, an absolute path. */
	location: string;
	/** The spool.page this machine signs in to. */
	origin: string;
	team: (team: string, project: string) => Promise<TeamStanding>;
	/** Whether a git link answers, and its default branch; git by default. */
	remote?: (url: string) => Promise<{ branch: string | null } | undefined>;
}

const HOSTS_BY_PATH = new Set(["github.com", "gitlab.com", "bitbucket.org", "codeberg.org"]);

export async function findOpenable(given: string, deps: FindingDeps): Promise<Finding> {
	const text = given.trim().replace(/^(["'])(.*)\1$/u, "$2");
	if (text === "") return { kind: "nothing", says: "Paste a folder's path, a .spool file or a link to a project." };
	const path = asPath(text, deps.home);
	if (path !== undefined) return findAtPath(path, deps);
	const team = teamLink(text, deps.origin);
	if (team !== undefined) return findTeam(team.team, team.project, deps);
	const git = gitLink(text);
	if (git !== undefined) return findRepo(git, deps);
	if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(text)) return { kind: "nothing", says: "Nothing answers at this link." };
	return { kind: "nothing", says: "spool opens a folder, a .spool file or a link to a project." };
}

/** A path as it was pasted or dropped: absolute, from `~`, or a file:// URL. */
function asPath(text: string, home: string): string | undefined {
	if (text.startsWith("file://")) {
		try {
			return resolve(fileURLToPath(text));
		} catch {
			return undefined;
		}
	}
	if (text === "~") return home;
	if (text.startsWith("~/")) return join(home, text.slice(2));
	return isAbsolute(text) ? resolve(text) : undefined;
}

function teamLink(text: string, origin: string): { team: string; project: string } | undefined {
	let url: URL;
	try {
		url = new URL(/^https?:\/\//iu.test(text) ? text : `https://${text}`);
	} catch {
		return undefined;
	}
	if (url.host !== new URL(origin).host) return undefined;
	const [team, project] = url.pathname.split("/").filter((part) => part !== "");
	const link = parseProjectLink(`https://${url.host}/${team ?? ""}/${project ?? ""}`);
	return link === undefined ? undefined : { team: link.team, project: link.project };
}

/** A link git can clone: ssh and scp forms, an https link ending in .git, or a repo page on a known host. */
function gitLink(text: string): string | undefined {
	if (/^(?:ssh|git|git\+ssh):\/\//iu.test(text) || /^[\w.-]+@[\w.-]+:(?!\/\/)/u.test(text)) return text;
	let url: URL;
	try {
		url = new URL(/^https?:\/\//iu.test(text) ? text : `https://${text}`);
	} catch {
		return undefined;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
	const parts = url.pathname.split("/").filter((part) => part !== "");
	if (HOSTS_BY_PATH.has(url.host.toLowerCase()) && parts.length >= 2)
		return `https://${url.host}/${parts[0]}/${(parts[1] ?? "").replace(/\.git$/iu, "")}`;
	if (/^https?:\/\//iu.test(text) && url.pathname.toLowerCase().endsWith(".git"))
		return `${url.origin}${url.pathname}`;
	return undefined;
}

async function findAtPath(path: string, deps: FindingDeps): Promise<Finding> {
	let isDir: boolean;
	let bytes: number;
	try {
		const stat = statSync(path);
		isDir = stat.isDirectory();
		bytes = stat.size;
	} catch {
		return {
			kind: "nothing",
			says: path.toLowerCase().endsWith(".spool")
				? "There is no file at this path."
				: "There is no folder at this path.",
		};
	}
	if (!isDir && path.toLowerCase().endsWith(".spool")) {
		return { kind: "file", path, name: basename(path), bytes, into: deps.location };
	}
	const dir = realDir(isDir ? path : dirname(path));
	const root = resolveProjectRoot(dir);
	if (root !== undefined) {
		if (existsSync(join(root, "design", "canvas.json"))) return { kind: "project", root, name: basename(root) };
		const link = readProjectLink(root);
		return { kind: "team", team: link.team, project: link.project, url: link.url, checkout: root };
	}
	if (!isDir) return { kind: "nothing", says: "spool opens a folder or a .spool file." };
	// home, or the disk itself, is never a project's folder, nor is a checkout of either (dotfiles kept in git, say):
	// a folder inside one is designed in where it is
	const home = realDir(deps.home);
	const whole = (folder: string) => folder === home || dirname(folder) === folder;
	const found = await checkoutOf(dir);
	const checkout = found === undefined || whole(realDir(found.top)) ? undefined : found;
	const top = checkout === undefined ? dir : realDir(checkout.top);
	if (whole(top)) return { kind: "nothing", says: "Choose a project's folder, not the whole of this Mac's home." };
	if (existsSync(join(top, "design")))
		return {
			kind: "nothing",
			says: "This folder has a design folder that isn't spool's. Move it aside, then try again.",
		};
	return {
		kind: "folder",
		path: top,
		name: basename(top),
		code: checkout !== undefined,
		branch: checkout === undefined ? null : await branchAt(top),
		items: readdirSync(top).filter((name) => !name.startsWith(".")).length,
	};
}

async function findTeam(team: string, project: string, deps: FindingDeps): Promise<Finding> {
	const url = `${new URL(deps.origin).origin}/${team}/${project}`;
	const copy = teamProjects(deps.spoolDir)
		.find(({ link }) => link.url === url)
		?.copies.find((root) => existsSync(join(root, "design", "canvas.json")));
	if (copy !== undefined) return { kind: "project", root: copy, name: basename(copy) };
	const standing = await deps.team(team, project);
	if (standing === "editor") return { kind: "team", team, project, url, checkout: null };
	return {
		kind: "nothing",
		says:
			standing === "signed-out"
				? "Sign in to spool.page to get this project."
				: standing === "unreachable"
					? "spool.page could not be reached. Try again."
					: standing === "viewer"
						? "You can only view this project. Open the link in a browser to look."
						: "Nothing answers at this link.",
	};
}

async function findRepo(url: string, deps: FindingDeps): Promise<Finding> {
	const repo = repoOf(url);
	const name =
		(repo ?? url)
			.split("/")
			.at(-1)
			?.replace(/\.git$/iu, "") ?? "";
	if (repo === undefined || name === "") return { kind: "nothing", says: "Nothing answers at this link." };
	// cloned before: what is there now is the answer
	const location = deps.location;
	for (let n = 1; n <= 100; n++) {
		const into = join(location, n === 1 ? name : `${name}-${n}`);
		if (!existsSync(into)) {
			const head = await (deps.remote ?? remoteHead)(url);
			if (head === undefined) return { kind: "nothing", says: "Nothing answers at this link." };
			return { kind: "repo", url, name, repo, branch: head.branch, into };
		}
		const there = await checkoutOf(into);
		if (there?.repo === repo && realDir(there.top) === realDir(into)) return findAtPath(into, deps);
	}
	return { kind: "nothing", says: `${location} already holds a hundred folders called ${name}.` };
}
