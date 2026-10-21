import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { writeAtomic } from "./atomic-write";
import { scanCheckouts } from "./checkout-scan";
import { MOVE_MESSAGE } from "./daemon/history";
import { type AskSeen, classDesign, type FileKind, isAnotherProject, isIdentical } from "./daemon/team-seen";
import { syncedBefore, travellingFiles } from "./daemon/team-sync";
import { checkoutOf } from "./git-remote";
import { linksTo } from "./move-in";
import { readRegistry } from "./registry";
import { isTeamProject, PROJECT_LINK, type ProjectLink, readProjectLink } from "./team-project";

/**
 * What Get it found at a place before anything happens (spool#193), said on the place's own line in the sheet:
 *
 * - `empty`: nothing of spool's here yet; the team's design/ comes down.
 * - `synced`: this project's copy, synced here before: it carries on.
 * - `identical`: a design/ spool never synced that is the team's exactly: taken with no question.
 * - `design`: a design/ spool never synced that differs, with how many files are the same, older, changed here and
 *   only here: brought level with the team.
 * - `pre-move`: a branch from before the move: `design/` is still in git here, and the move commit isn't. Get it
 *   waits for it.
 * - `other`: another project is here, and Get it can't use the place: `why` says so.
 */
export type Survey =
	| { kind: "empty" }
	| { kind: "synced" }
	| { kind: "identical"; files: number }
	| { kind: "design"; counts: Record<FileKind, number> }
	| ({ kind: "pre-move" } & PreMove)
	| { kind: "other"; why: string };

/** The move commit a branch from before the move lacks, and what brings it in. */
export interface PreMove {
	/** The move commit, in full and short. */
	commit: string;
	short: string;
	/** Who made it, as git says. */
	author: string;
	/** The branch checked out here. */
	branch: string;
	/** The remote's default branch the move commit is on, `origin/main`. */
	base: string;
	/** The command that brings it in. */
	command: string;
}

/** One place a checkout offers: the folder, where in it the local copy goes, and what is there. */
export interface PlaceSurvey {
	/** The checkout, or the folder picked. */
	path: string;
	/** Where the local copy goes: `path`, or where in it a tracked `spool.json` for this project is. */
	root: string;
	/** `root` already holds this project's `spool.json`. */
	linked: boolean;
	survey: Survey;
	/** How many of the team's frames, or frames it had, its design/ holds. */
	common: number;
	/** When it was last used here (ms): picked for Get it, or a project in it opened. */
	usedAt: number;
}

/** A place Get it can put the project. */
export function usable(survey: Survey): boolean {
	return survey.kind !== "other";
}

/**
 * What is at a checkout or a folder picked, for one team project. Asking the team is needed only for a design/
 * spool never synced; a pre-move branch, another team project's spool.json and a synced copy are told from here.
 */
export async function surveyPlace(
	dir: string,
	link: ProjectLink,
	ask: AskSeen,
): Promise<Omit<PlaceSurvey, "usedAt" | "path">> {
	const root = (await projectRootIn(dir, link.url)) ?? dir;
	const linked = linksTo(root, link.url);
	const at = (survey: Survey, common = 0) => ({ root, linked, survey, common });
	if (!linked && isTeamProject(root)) {
		let other = "another team project";
		try {
			other = readProjectLink(root).url;
		} catch {
			// unreadable: still another project's
		}
		return at({ kind: "other", why: `Already holds another team project, ${other}` });
	}
	if (!linked && existsSync(join(root, PROJECT_LINK)))
		return at({ kind: "other", why: "Has a spool.json that isn't a team project’s" });
	if (linked && syncedBefore(root, link)) return at({ kind: "synced" });
	const moved = await awaitedMove(root, link.url);
	if (moved !== undefined) return at({ kind: "pre-move", ...moved });
	if (!existsSync(join(root, "design"))) return at({ kind: "empty" });
	let paths: string[];
	try {
		paths = travellingFiles(root);
	} catch {
		return at({ kind: "other", why: "Its design/ leaves the folder" });
	}
	if (paths.length === 0) return at({ kind: "empty" });
	const classes = await classDesign(join(root, "design"), paths, ask);
	// a spool.json naming this project says whose design/ it is, whatever frames it holds
	if (!linked && isAnotherProject(classes))
		return at({ kind: "other", why: `Already holds its own project, ${basename(root)}` }, 0);
	if (isIdentical(classes)) return at({ kind: "identical", files: paths.length }, classes.common);
	return at({ kind: "design", counts: classes.counts }, classes.common);
}

/**
 * Every checkout on this Mac Get it offers for a team project, best first: the checkouts of registered projects,
 * those the scan of the code folders finds, and folders picked for Get it before, each whose `origin` is the
 * project's repo (any folder picked, when nobody has said its repo). Finding them registers nothing.
 */
export async function checkoutsFor(
	spoolDir: string,
	home: string,
	project: { link: ProjectLink; repo: string | null },
	ask: AskSeen,
): Promise<PlaceSurvey[]> {
	const repo = project.repo;
	const used = new Map<string, number>();
	const offered = new Set<string>();
	const registry = readRegistry(spoolDir).projects;
	const [known, scanned, picked] = await Promise.all([
		Promise.all(registry.map((one) => checkoutOf(one.root).catch(() => undefined))),
		repo === null ? Promise.resolve([]) : scanCheckouts(home),
		Promise.all(
			rememberedPicks(spoolDir).map(async (pick) => ({
				pick,
				checkout: await checkoutOf(pick.path).catch(() => undefined),
			})),
		),
	]);
	for (const [index, checkout] of known.entries()) {
		if (checkout === undefined || checkout.repo === undefined || checkout.repo !== repo) continue;
		offered.add(checkout.top);
		const at = Date.parse(registry[index]?.openedAt ?? "");
		if (Number.isFinite(at)) used.set(checkout.top, Math.max(used.get(checkout.top) ?? 0, at));
	}
	for (const found of scanned) if (found.repo === repo) offered.add(found.top);
	for (const { pick, checkout } of picked) {
		if (!existsSync(pick.path)) continue;
		if (repo !== null && checkout?.repo !== repo) continue;
		offered.add(pick.path);
		used.set(pick.path, Math.max(used.get(pick.path) ?? 0, pick.at));
	}
	const surveyed = await Promise.all(
		[...offered].map(async (path) => ({
			path,
			usedAt: used.get(path) ?? 0,
			...(await surveyPlace(path, project.link, ask)),
		})),
	);
	return rank(surveyed);
}

/** Best first: one already linked to the project, then the design/ holding most of the team's frames, then the latest used. */
export function rank(places: PlaceSurvey[]): PlaceSurvey[] {
	return [...places].sort(
		(a, b) =>
			Number(b.linked) - Number(a.linked) ||
			b.common - a.common ||
			b.usedAt - a.usedAt ||
			(a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
	);
}

// --- folders picked with "In a checkout…", kept in the daemon's state for the next Get it ---

/** How many picked folders are kept, latest first. */
const PICKS_KEPT = 20;

const picksFile = (spoolDir: string) => join(spoolDir, "get-it-picks.json");

/** The folders picked for Get it, latest first. */
export function rememberedPicks(spoolDir: string): { path: string; at: number }[] {
	try {
		const { picks } = JSON.parse(readFileSync(picksFile(spoolDir), "utf8")) as { picks?: unknown };
		if (!Array.isArray(picks)) return [];
		return picks.filter(
			(pick): pick is { path: string; at: number } =>
				typeof pick === "object" &&
				pick !== null &&
				typeof (pick as { path?: unknown }).path === "string" &&
				typeof (pick as { at?: unknown }).at === "number",
		);
	} catch {
		return [];
	}
}

/** A folder picked for Get it, offered again at the next one. */
export function rememberPick(spoolDir: string, path: string, at = Date.now()): void {
	const picks = [{ path, at }, ...rememberedPicks(spoolDir).filter((pick) => pick.path !== path)].slice(0, PICKS_KEPT);
	writeAtomic(picksFile(spoolDir), `${JSON.stringify({ picks }, null, 2)}\n`);
}

// --- git: where a checkout holds the project, and the move commit a branch from before the move lacks ---

const run = promisify(execFile);

/** git in a folder, the daemon's own git environment taken off; undefined when git says no. */
async function git(cwd: string, args: readonly string[]): Promise<string | undefined> {
	try {
		const env = { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_TERMINAL_PROMPT: "0" };
		return (await run("git", [...args], { cwd, env, timeout: 10_000, windowsHide: true })).stdout;
	} catch {
		return undefined;
	}
}

/** Where a checkout already holds this project's `spool.json`: the folder picked, or a tracked one inside it. */
export async function projectRootIn(dir: string, url: string): Promise<string | undefined> {
	if (linksTo(dir, url)) return dir;
	const checkout = await checkoutOf(dir);
	if (checkout === undefined) return undefined;
	if (linksTo(checkout.top, url)) return checkout.top;
	const listed = await git(checkout.top, ["ls-files", "-z", "--", PROJECT_LINK, `**/${PROJECT_LINK}`]);
	for (const file of listed?.split("\0") ?? []) {
		if (file === "") continue;
		const root = dirname(join(checkout.top, file));
		if (linksTo(root, url)) return root;
	}
	return undefined;
}

/** The remote's default branch, as `origin/main`: what its HEAD names, or a main or master it has. */
async function defaultBranch(top: string): Promise<string | undefined> {
	const head = (await git(top, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]))?.trim();
	if (head !== undefined && head !== "") return head;
	for (const name of ["origin/main", "origin/master"])
		if ((await git(top, ["rev-parse", "--verify", "--quiet", `refs/remotes/${name}`])) !== undefined) return name;
	return undefined;
}

/** How many move commits on the default branch are looked through for this project's. */
const MOVES_LOOKED = 20;

/**
 * The move commit this checkout's branch is waiting for, if it is from before the move: the remote's default branch
 * holds the commit that took this project's `design/` out of git (`design: moved to Spool Cloud`, adding the
 * `spool.json` naming it), the branch checked out doesn't, and its `design/` is still in git.
 */
export async function awaitedMove(dir: string, url: string): Promise<PreMove | undefined> {
	const top = (await checkoutOf(dir))?.top;
	if (top === undefined) return undefined;
	const base = await defaultBranch(top);
	if (base === undefined) return undefined;
	const log = await git(top, [
		"log",
		base,
		"--fixed-strings",
		`--grep=${MOVE_MESSAGE}`,
		`--max-count=${MOVES_LOOKED}`,
		"--format=%H%x1f%h%x1f%an%x1f%s",
	]);
	for (const line of log?.split("\n") ?? []) {
		const [commit, short, author, subject] = line.split("\x1f");
		if (commit === undefined || short === undefined || author === undefined || subject !== MOVE_MESSAGE) continue;
		const added = await git(top, [
			"diff-tree",
			"--no-commit-id",
			"-r",
			"--name-only",
			"--diff-filter=A",
			"-z",
			commit,
		]);
		let link: string | undefined;
		for (const path of added?.split("\0") ?? []) {
			if (path !== PROJECT_LINK && !path.endsWith(`/${PROJECT_LINK}`)) continue;
			try {
				const named = JSON.parse((await git(top, ["show", `${commit}:${path}`])) ?? "") as { project?: unknown };
				if (named.project === url) link = path;
			} catch {
				// not a spool.json spool wrote
			}
		}
		if (link === undefined) continue;
		if (await hasCommit(top, commit)) return undefined;
		const folder = dirname(link) === "." ? "design" : `${dirname(link)}/design`;
		const tracked = await git(top, ["ls-files", "--", folder]);
		if (tracked === undefined || tracked.trim() === "") return undefined;
		const branch = (await git(top, ["symbolic-ref", "--quiet", "--short", "HEAD"]))?.trim() ?? "HEAD";
		const command = `origin/${branch}` === base ? "git pull" : `git merge ${base}`;
		return { commit, short, author, branch, base, command };
	}
	return undefined;
}

/** Whether the branch checked out has a commit. */
export async function hasCommit(dir: string, commit: string): Promise<boolean> {
	return (await git(dir, ["merge-base", "--is-ancestor", commit, "HEAD"])) !== undefined;
}
