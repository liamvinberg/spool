import { cpSync, existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { addAgentsLine } from "./agents-line";
import { writeAtomic } from "./atomic-write";
import { cloudTeams, type MoveLoser } from "./cloud-teams";
import { commitPaths, type MoveCommit, onBranch, type PathsCommit, tracked } from "./daemon/history";
import { readdressCopy, travellingFiles } from "./daemon/team-sync";
import { SpoolError } from "./errors";
import { checkoutOf } from "./git-remote";
import type { TeamInitOptions } from "./init";
import { catchUp, type MoveProgress } from "./move-in";
import { expandHome, realDir } from "./paths";
import { readRegistry, teamProjects } from "./registry";
import {
	isTeamProject,
	localCopyOf,
	PROJECT_LINK,
	type ProjectLink,
	parseProjectLink,
	TEAM_GITIGNORE,
	writeProjectLink,
} from "./team-project";
import { SOLO_GITIGNORE } from "./templates";

/**
 * Moving a team project on from its team (task 136), this Mac's half: spool.page moves it, and this Mac brings its
 * copies along.
 *
 * - **To another team**: the same project, its id, history and shares kept; spool.page forwards the old address.
 *   Each copy here takes the new `spool.json` (one commit on the current branch where it is tracked), and a copy at
 *   exactly `<projects location>/<old team>/<old name>` moves to `<projects location>/<new team>/<new name>`.
 * - **Out of its team**: the copy here catches up, spool.page deletes the project, and one commit puts `design/` back
 *   in git and takes `spool.json` out. It is an ordinary project here from then on.
 * - **Into a checkout**: a copy in no repo moves its `design/` into a clone, `spool.json` and the AGENTS.md line
 *   committed at its root, and keeps syncing without going up again.
 *
 * A commit git won't take now is owed in `design/.spool/moved-commit.json`, and made at the daemon's next start.
 */
export interface TeamMoveOptions extends Omit<TeamInitOptions, "team"> {
	/** The machine's projects location, as the setting says it (`~/spool`). */
	location: string;
	wait?: (ms: number) => Promise<void>;
	signal?: AbortSignal;
}

/** What the daemon does around a move: it stops following a copy it moves, and moves registered folders. */
export interface MoveHooks {
	/** Stop following a copy until the returned release, which follows it again wherever it is then. */
	hold(root: string): () => void;
	/** A registered project is somewhere else now: its folder moves with `folder`, and its entry, tabs and recents follow. */
	relocate(from: string, to: string, folder: boolean): void;
	/** Another copy here of a project moved out of its team: it ends, as everyone else's does. */
	endMovedOut(root: string, link: ProjectLink): Promise<void>;
	/** Folders to the OS Trash. */
	trash(paths: string[]): Promise<void>;
	/** How a move out's catch-up is getting on. */
	onProgress?: (progress: MoveProgress) => void;
}

/** A move spool.page or this Mac refused, with the code the screens read. */
export class MoveRefused extends SpoolError {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
	}
}

/** How long a move waits on its commit before it answers; past that the commit lands on its own once git is free. */
const COMMIT_ANSWER_MS = 5_000;

/** What moving a project to another team would do on this Mac and at spool.page. */
export interface TeamMovePreview {
	losing: MoveLoser[];
	refusal: string | null;
	/** This Mac's copies whose tracked `spool.json` the move commits. */
	commits: string[];
	/** The copy with no repo whose folder moves with it. */
	folder: { from: string; to: string } | null;
}

export async function previewTeamMove(
	spoolDir: string,
	from: { team: string; project: string },
	to: { team: string; name?: string | undefined },
	options: TeamMoveOptions,
): Promise<TeamMovePreview> {
	const { losing, refusal } = await client(spoolDir, options).previewMove(from.team, from.project, to.team, to.name);
	const name = to.name ?? from.project;
	const copies = copiesOf(spoolDir, from);
	const commits: string[] = [];
	let folder: TeamMovePreview["folder"] = null;
	for (const root of copies) {
		if (await linkTracked(root)) commits.push(root);
		else if (folder === null && (await movesFolder(root, from, options)))
			folder = { from: root, to: home(options, to.team, name) };
	}
	return { losing, refusal, commits, folder };
}

export interface TeamMoved {
	team: string;
	name: string;
	url: string;
	/** This Mac's copies afterwards, a moved folder at its new place. */
	roots: string[];
	/** Copies where the `spool.json` commit landed. */
	committed: string[];
	/** Copies where it waits for git. */
	commitWaiting: string[];
	losing: MoveLoser[];
}

export async function moveToTeam(
	spoolDir: string,
	from: { team: string; project: string },
	to: { team: string; name?: string | undefined },
	options: TeamMoveOptions,
	hooks: MoveHooks,
): Promise<TeamMoved> {
	const moved = await client(spoolDir, options).moveProject(from.team, from.project, to.team, to.name);
	const link = parseProjectLink(moved.url);
	if (link === undefined) throw new SpoolError("spool.page returned an invalid team project");
	const was = parseProjectLink(`${link.origin}/${from.team}/${from.project}`) ?? link;
	const roots: string[] = [];
	const committed: string[] = [];
	const commitWaiting: string[] = [];
	for (const root of copiesOf(spoolDir, from)) {
		const release = hooks.hold(root);
		let at = root;
		try {
			if (isTeamProject(root)) writeProjectLink(root, link);
			readdressCopy(root, was, link, { forwarded: false });
			if (await linkTracked(root)) {
				const commit = await answered(
					owe(root, { message: `spool: move ${from.project} to ${link.team}`, add: [PROJECT_LINK] }, options),
				);
				if (commit === "committed") committed.push(root);
				else commitWaiting.push(root);
			} else if (await movesFolder(root, from, options)) {
				const target = home(options, link.team, link.project);
				if (!existsSync(target)) {
					hooks.relocate(root, target, true);
					at = target;
				}
			}
		} finally {
			release();
		}
		roots.push(at);
	}
	return { team: link.team, name: link.project, url: link.url, roots, committed, commitWaiting, losing: moved.losing };
}

export interface MovedOut {
	root: string | null;
	committed: boolean;
	commitWaiting: boolean;
}

/**
 * Move out of the team: the copy here (the one at `path`, or the latest opened) catches up, spool.page deletes the
 * project and marks its address moved out, and the copy becomes an ordinary project in one commit. Every other copy
 * here ends as everyone else's does. Admins only, asked before anything is uploaded.
 */
export async function moveOutOfTeam(
	spoolDir: string,
	from: { team: string; project: string },
	path: string | undefined,
	options: TeamMoveOptions,
	hooks: MoveHooks,
): Promise<MovedOut> {
	const teams = client(spoolDir, options);
	const { teams: mine } = await teams.list();
	const team = mine.find((each) => each.address === from.team);
	if (team === undefined) throw new MoveRefused(`You're not in ${from.team}.`, "team_not_found");
	if (team.role !== "admin")
		throw new MoveRefused(`Only an admin of ${team.name} can move a project out of it.`, "admin_required");
	const copies = copiesOf(spoolDir, from);
	const root = path === undefined ? copies[0] : realDir(path);
	if (root !== undefined && !copies.includes(root))
		throw new SpoolError(`${root} isn't a copy of ${from.team}/${from.project} on this Mac.`);
	const link =
		root === undefined
			? undefined
			: (localCopyOf(root) ?? parseProjectLink(`${options.origin}/${from.team}/${from.project}`));
	const release = root === undefined ? undefined : hooks.hold(root);
	try {
		if (root !== undefined && link !== undefined) {
			if (!(await onBranch(root)))
				throw new SpoolError(
					`HEAD is detached in ${root}. Check out a branch first: the move is one commit on it.`,
				);
			await catchUp(root, spoolDir, link, {
				team: from.team,
				...options,
				...(hooks.onProgress === undefined ? {} : { onProgress: hooks.onProgress }),
			});
		}
		await teams.deleteProject(from.team, from.project, { out: true });
	} catch (error) {
		release?.();
		throw error;
	}
	for (const other of copies)
		if (other !== root) {
			const named = localCopyOf(other) ?? link;
			if (named !== undefined) await hooks.endMovedOut(other, named);
		}
	if (root === undefined) return { root: null, committed: false, commitWaiting: false };
	try {
		const change = await movedOut(root, from);
		if (change === undefined) return { root, committed: false, commitWaiting: false };
		const commit = await answered(owe(root, change, options));
		return { root, committed: commit === "committed", commitWaiting: commit !== "committed" };
	} finally {
		release?.();
	}
}

/**
 * The copy is an ordinary project on disk: `spool.json` gone, the solo `.gitignore` back, and no record of the team.
 * In a checkout, the commit that says so in git: `spool.json` out, and everything in `design/` that travels in, with
 * its `.gitignore`; what never travelled stays as git has it.
 */
async function movedOut(root: string, from: { team: string; project: string }): Promise<PathsCommit | undefined> {
	const design = join(root, "design");
	const files = travellingFiles(root);
	rmSync(join(root, PROJECT_LINK), { force: true });
	writeAtomic(join(design, ".gitignore"), SOLO_GITIGNORE);
	rmSync(join(design, ".spool", "sync.json"), { force: true });
	if ((await checkoutOf(root)) === undefined) return undefined;
	return {
		message: `spool: move ${from.project} out of ${from.team}`,
		remove: [PROJECT_LINK],
		add: [...files.map((file) => `design/${file}`), "design/.gitignore"],
	};
}

/**
 * Into a checkout: a copy in no repo moves its `design/` into a clone's root, `spool.json` and the AGENTS.md line
 * beside it in one commit on the current branch. Its record goes with `design/`, so it syncs on without going up
 * again; the repo is recorded from the clone's `origin`, and the old folder goes to the Trash.
 */
export async function moveIntoCheckout(
	spoolDir: string,
	from: { team: string; project: string },
	place: { path: string; checkout: string },
	options: TeamMoveOptions,
	hooks: MoveHooks,
): Promise<{ root: string; committed: boolean; commitWaiting: boolean }> {
	const root = realDir(place.path);
	if (!copiesOf(spoolDir, from).includes(root))
		throw new SpoolError(`${root} isn't a copy of ${from.team}/${from.project} on this Mac.`);
	if ((await checkoutOf(root)) !== undefined)
		throw new MoveRefused(
			`${root} is already in a repo. Only a project in no repo moves into a checkout.`,
			"in_a_repo",
		);
	const picked = realDir(expandHome(place.checkout));
	const checkout = await checkoutOf(picked);
	if (checkout === undefined)
		throw new MoveRefused(`${picked} isn't a git checkout. Choose a clone.`, "not_a_checkout");
	const top = realDir(checkout.top);
	if (existsSync(join(top, "design")))
		throw new MoveRefused(`${top} already has a design/ folder. Choose another checkout.`, "checkout_has_design");
	if (readRegistry(spoolDir).projects.some((project) => project.root === top) || existsSync(join(top, PROJECT_LINK)))
		throw new MoveRefused(`${top} is already a spool project. Choose another checkout.`, "checkout_is_a_project");
	if (!(await onBranch(top)))
		throw new SpoolError(`HEAD is detached in ${top}. Check out a branch first: the move is one commit on it.`);
	const link = localCopyOf(root) ?? parseProjectLink(`${options.origin}/${from.team}/${from.project}`);
	if (link === undefined) throw new SpoolError(`${root} has no spool.json naming its team project.`);

	const release = hooks.hold(root);
	try {
		moveFolder(join(root, "design"), join(top, "design"));
		// the copy's design/ stays out of git in its checkout as it was in no repo
		writeAtomic(join(top, "design", ".gitignore"), TEAM_GITIGNORE);
		writeProjectLink(top, link);
		const agents = await addAgentsLine(top);
		hooks.relocate(root, top, false);
		const commit = await answered(
			owe(
				top,
				{
					message: `spool: bring ${link.project} into this repo`,
					add: [PROJECT_LINK, ...(agents === undefined ? [] : [relative(top, agents).split(sep).join("/")])],
				},
				options,
			),
		);
		if (checkout.repo !== undefined)
			await client(spoolDir, options)
				.setRepo(link.team, link.project, checkout.repo)
				.catch(() => undefined);
		await hooks.trash([root]).catch(() => undefined);
		return { root: top, committed: commit === "committed", commitWaiting: commit !== "committed" };
	} finally {
		release();
	}
}

/** Every commit among these roots that a move still owes, tried again: what a daemon does at start. */
export async function finishOwedCommits(
	roots: readonly string[],
	options: Pick<TeamMoveOptions, "signal"> = {},
): Promise<{ root: string; commit: MoveCommit }[]> {
	const finished: { root: string; commit: MoveCommit }[] = [];
	for (const root of roots) {
		let change: PathsCommit;
		try {
			change = JSON.parse(readFileSync(owed(root), "utf8")) as PathsCommit;
		} catch {
			continue;
		}
		finished.push({ root, commit: await commit(root, change, options) });
	}
	return finished;
}

/** Where a commit a move hasn't made yet is kept until git takes it. */
function owed(root: string): string {
	return join(root, "design", ".spool", "moved-commit.json");
}

/** A move's commit, owed across restarts until it is made, or there is no git to make it in. */
function owe(
	root: string,
	change: PathsCommit,
	options: Pick<TeamMoveOptions, "wait" | "signal">,
): Promise<MoveCommit> {
	writeAtomic(
		owed(root),
		`${JSON.stringify({ message: change.message, remove: change.remove ?? [], add: change.add ?? [] })}\n`,
	);
	return commit(root, change, options);
}

async function commit(
	root: string,
	change: PathsCommit,
	options: Pick<TeamMoveOptions, "wait" | "signal">,
): Promise<MoveCommit> {
	const made = await commitPaths(root, {
		message: change.message,
		remove: change.remove ?? [],
		add: change.add ?? [],
		...(options.wait === undefined ? {} : { wait: options.wait }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (made.kind === "committed" || made.kind === "no-git") rmSync(owed(root), { force: true });
	return made;
}

/** A commit's answer for the screens: made, or still waiting on git once a few seconds have passed. */
async function answered(commit: Promise<MoveCommit>): Promise<MoveCommit["kind"] | "waiting"> {
	return Promise.race([
		commit.then((made) => made.kind),
		new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), COMMIT_ANSWER_MS).unref()),
	]);
}

function client(spoolDir: string, options: Omit<TeamInitOptions, "team">) {
	return cloudTeams(spoolDir, { ...options.request, origin: options.origin });
}

/** This Mac's copies of a team project, latest opened first. */
export function copiesOf(spoolDir: string, at: { team: string; project: string }): string[] {
	return teamProjects(spoolDir).find(({ link }) => link.team === at.team && link.project === at.project)?.copies ?? [];
}

/** Whether a copy's `spool.json` is tracked in a checkout: a move commits it there. */
async function linkTracked(root: string): Promise<boolean> {
	return existsSync(join(root, PROJECT_LINK)) && (await tracked(root, PROJECT_LINK));
}

/** `<projects location>/<team>/<name>`. */
function home(options: Pick<TeamMoveOptions, "location">, team: string, name: string): string {
	return join(expandHome(options.location), team, name);
}

/** Whether a copy sits in no repo at exactly `<projects location>/<old team>/<old name>`: such a folder moves with it. */
async function movesFolder(
	root: string,
	from: { team: string; project: string },
	options: Pick<TeamMoveOptions, "location">,
): Promise<boolean> {
	let place: string;
	try {
		place = realDir(home(options, from.team, from.project));
	} catch {
		return false;
	}
	return place === root && (await checkoutOf(root)) === undefined;
}

/** A folder moved, across disks too. */
function moveFolder(from: string, to: string): void {
	try {
		renameSync(from, to);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
		cpSync(from, to, { recursive: true, verbatimSymlinks: true });
		rmSync(from, { recursive: true, force: true });
	}
}
