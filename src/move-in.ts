import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { writeAtomic } from "./atomic-write";
import { type CloudTeamProject, cloudTeams } from "./cloud-teams";
import { commitMoveIn, type MoveCommit, onBranch } from "./daemon/history";
import { carrySharesOver } from "./daemon/shares";
import {
	staysOnThisMac,
	SyncPaused,
	syncLocalCopy,
	travellingFiles,
	unconfirmedFiles,
} from "./daemon/team-sync";
import { SpoolError } from "./errors";
import { checkoutOf } from "./git-remote";
import { chosenTeam, type TeamInitOptions, teamProjectRefusal } from "./init";
import { realDir } from "./paths";
import { registerProject } from "./registry";
import {
	isTeamProject,
	type ProjectLink,
	parseProjectLink,
	readProjectLink,
	refuseForeignLink,
	TEAM_GITIGNORE,
	writeProjectLink,
} from "./team-project";

/**
 * "Move to team…" (DEV-190): an existing project becomes a team project. The whole folder goes up first, and only
 * once the team has every file does anything change here: `spool.json` is written beside `design/`, `design/` gets
 * its `.gitignore` of everything, and one commit on the current branch takes `design/` out of git (the files stay)
 * and brings `spool.json` in. History before the move stays in git, and so does whatever in `design/` never travels
 * (`staysOnThisMac`), so teammates who pull keep it.
 *
 * A move that stops partway changes nothing here, and moving again picks up the same team project: the move under
 * way is remembered in `design/.spool/moving.json`, which never travels. A move whose commit git didn't take is
 * remembered in `design/.spool/move-commit.json`, and the daemon makes the commit at its next start.
 */
export interface MoveOptions extends TeamInitOptions {
	/** Sleep out a sync pause, and between looks at a repo git is busy merging or rebasing in. */
	wait?: (ms: number) => Promise<void>;
	/** The daemon is closing: a move waiting out a pause stops, and the commit is made at its next start. */
	signal?: AbortSignal;
	/** How far the upload has got, said as it goes. */
	onProgress?: (progress: MoveProgress) => void;
}

/** How far a move's upload has got: files the team has confirmed of all that go, and a pause it is waiting out. */
export interface MoveProgress {
	up: number;
	total: number;
	/** Why spool.page isn't taking saves, and when (ms since the epoch) it may again. */
	paused: { why: string; until: number } | null;
}

/** Limits that lift by themselves: a move waits them out. Any other stops it. */
const WAITED_OUT = new Set(["rate_limited", "unavailable"]);

export interface Moved {
	root: string;
	link: ProjectLink;
	/** The move commit, once git lets it be made. */
	commit: Promise<MoveCommit>;
}

export async function moveIntoTeam(targetDir: string, spoolDir: string, options: MoveOptions): Promise<Moved> {
	const root = realDir(targetDir);
	const design = join(root, "design");
	if (isTeamProject(root)) throw new SpoolError(`${basename(root)} is already a team project`);
	refuseForeignLink(root);
	if (!existsSync(join(design, "canvas.json"))) throw new SpoolError(`${root} is not a spool project`);
	if (!(await onBranch(root)))
		throw new SpoolError(`HEAD is detached in ${root}. Check out a branch first: the move is one commit on it.`);
	const request = { ...options.request, origin: options.origin };
	const teams = cloudTeams(spoolDir, request);
	const team = await chosenTeam(teams, options.team);

	const record = join(design, ".spool", "moving.json");
	const link = movingTo(record, team.address) ?? (await started());
	async function started(): Promise<ProjectLink> {
		const repo = (await checkoutOf(root))?.repo;
		let created: CloudTeamProject;
		try {
			created = await teams.createProject(team.address, basename(root), repo);
		} catch (error) {
			throw teamProjectRefusal(error, team.name, basename(root));
		}
		const made = parseProjectLink(created.url);
		if (made === undefined) throw new SpoolError("spool.page returned an invalid team project");
		writeAtomic(record, `${JSON.stringify({ project: made.url })}\n`);
		return made;
	}

	await upload(root, spoolDir, link, options);
	const missing = unconfirmedFiles(root, link);
	if (missing.length > 0)
		throw new SpoolError(
			`${team.name} doesn't have ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""} yet. Nothing changed here; try again.`,
		);

	try {
		await carrySharesOver(root, spoolDir, request, link);
	} catch {
		throw new SpoolError(
			`spool.page couldn't take ${basename(root)}'s shares just now. Nothing changed here; try again.`,
		);
	}
	writeProjectLink(root, link);
	writeFileSync(join(design, ".gitignore"), TEAM_GITIGNORE);
	// from here the move is made, and its commit is owed until git takes it, across restarts
	writeAtomic(owed(root), `${JSON.stringify({ project: link.url })}\n`);
	rmSync(record, { force: true });
	// the registry's change is what sets the daemon following the new local copy
	registerProject(spoolDir, root);
	return { root, link, commit: commitMove(root, options) };
}

/**
 * Everything in design/ that travels goes up, a limit that lifts by itself waited out as often as it comes, so a
 * project bigger than a minute's saves moves in one go. Each round picks up where the last stopped, from what the
 * copy's record says the team has. Any other stop names its cause, and nothing here has changed.
 */
async function upload(root: string, spoolDir: string, link: ProjectLink, options: MoveOptions): Promise<void> {
	const name = basename(root);
	const total = travellingFiles(root).length;
	const say = (paused: MoveProgress["paused"] = null) => options.onProgress?.({ up, total, paused });
	let up = total - unconfirmedFiles(root, link).length;
	say();
	for (;;) {
		try {
			await syncLocalCopy(root, spoolDir, {
				...options,
				moving: link,
				onSaved: () => {
					up = Math.min(total, up + 1);
					say();
				},
			});
			return;
		} catch (error) {
			if (!(error instanceof SyncPaused && WAITED_OUT.has(error.reason))) {
				const why = error instanceof SyncPaused ? error.why : error instanceof Error ? error.message : String(error);
				const again = error instanceof SyncPaused ? "" : "; try again";
				throw new SpoolError(`${name} didn't move: ${why}. Nothing changed here${again}.`);
			}
			say({ why: error.why, until: Date.now() + error.seconds * 1_000 });
			await sleep(error.seconds * 1_000, options);
			if (options.signal?.aborted === true)
				throw new SpoolError(`spool closed before ${name} moved. Nothing changed here; move it again.`);
			up = total - unconfirmedFiles(root, link).length;
			say();
		}
	}
}

/** A pause slept out, cut short when the daemon closes. */
function sleep(ms: number, options: Pick<MoveOptions, "wait" | "signal">): Promise<void> {
	if (options.wait !== undefined) return options.wait(ms);
	return new Promise((resolve) => {
		const done = () => {
			clearTimeout(timer);
			options.signal?.removeEventListener("abort", done);
			resolve();
		};
		const timer = setTimeout(done, ms);
		options.signal?.addEventListener("abort", done, { once: true });
	});
}

/** Where a move whose commit hasn't been made yet says so. */
function owed(root: string): string {
	return join(root, "design", ".spool", "move-commit.json");
}

/**
 * The move commit, owed until it is made: what never travels stays in git, and once the commit lands, or there is
 * no git to make it in, nothing is owed any more. A detached HEAD or a repo git never let go of leaves it owed.
 */
async function commitMove(root: string, options: Pick<MoveOptions, "wait" | "signal"> = {}): Promise<MoveCommit> {
	const staying = new Set(staysOnThisMac(root).map(({ path }) => path));
	const commit = await commitMoveIn(root, {
		keep: (path) => staying.has(path),
		...(options.wait === undefined ? {} : { wait: options.wait }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (commit.kind === "committed" || commit.kind === "no-git") rmSync(owed(root), { force: true });
	return commit;
}

/** Every move among these roots whose commit is still owed, its commit tried again: what a daemon does at start. */
export async function finishMoves(
	roots: readonly string[],
	options: Pick<MoveOptions, "signal"> = {},
): Promise<{ root: string; commit: MoveCommit }[]> {
	const finished: { root: string; commit: MoveCommit }[] = [];
	for (const root of roots)
		if (existsSync(owed(root)) && isTeamProject(root))
			finished.push({ root, commit: await commitMove(root, options) });
	return finished;
}

/** The team project a move that stopped partway was going to, if it was this one. */
function movingTo(record: string, team: string): ProjectLink | undefined {
	try {
		const link = parseProjectLink((JSON.parse(readFileSync(record, "utf8")) as { project?: unknown }).project);
		return link?.team === team ? link : undefined;
	} catch {
		return undefined;
	}
}

/** Whether a root's `spool.json` names this team project. */
export function linksTo(root: string, url: string): boolean {
	try {
		return isTeamProject(root) && readProjectLink(root).url === url;
	} catch {
		return false;
	}
}
