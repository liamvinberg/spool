import { createHash } from "node:crypto";
import { type Dirent, existsSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { writeAtomic } from "./atomic-write";
import { keychainVault } from "./cloud-auth";
import { type CloudTeamProject, cloudTeams } from "./cloud-teams";
import { commitMoveIn, type MoveCommit } from "./daemon/history";
import { syncLocalCopy } from "./daemon/team-sync";
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
	TEAM_GITIGNORE,
	writeProjectLink,
} from "./team-project";
import { travels } from "./team-sync-protocol";

/**
 * "Move to team…" (DEV-190): an existing project becomes a team project. The whole folder goes up first, and only
 * once the team has every file does anything change here: `spool.json` is written beside `design/`, `design/` gets
 * its `.gitignore` of everything, and one commit on the current branch takes `design/` out of git (the files stay)
 * and brings `spool.json` in. History before the move stays in git.
 *
 * A move that stops partway changes nothing here, and moving again picks up the same team project: the move under
 * way is remembered in `design/.spool/moving.json`, which never travels.
 */
export interface MoveOptions extends TeamInitOptions {
	/** Sleep between looks at a repo git is busy merging or rebasing in. */
	wait?: (ms: number) => Promise<void>;
}

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
	if (!existsSync(join(design, "canvas.json"))) throw new SpoolError(`${root} is not a spool project`);
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

	try {
		await syncLocalCopy({
			root,
			origin: options.origin,
			vault: request.vault ?? keychainVault(spoolDir, options.origin),
			...(options.openSocket === undefined ? {} : { openSocket: options.openSocket }),
			notice: () => {},
			moving: link,
		});
	} catch {
		throw new SpoolError(`spool.page couldn't take ${basename(root)} just now. Nothing changed here; try again.`);
	}
	const missing = notConfirmed(design, link);
	if (missing.length > 0)
		throw new SpoolError(
			`${team.name} doesn't have ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""} yet. Nothing changed here; try again.`,
		);

	writeProjectLink(root, link);
	writeFileSync(join(design, ".gitignore"), TEAM_GITIGNORE);
	rmSync(record, { force: true });
	// the registry's change is what sets the daemon following the new local copy
	registerProject(spoolDir, root);
	const commit = commitMoveIn(root, options.wait === undefined ? {} : { wait: options.wait });
	return { root, link, commit };
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

/** Every travelling file on disk whose bytes the team hasn't confirmed, design-relative. */
function notConfirmed(design: string, link: ProjectLink): string[] {
	let files: Record<string, { hash: string | null }> = {};
	try {
		const state = JSON.parse(readFileSync(join(design, ".spool", "sync.json"), "utf8")) as {
			project?: string;
			files?: typeof files;
		};
		if (state.project === link.url && state.files !== undefined) files = state.files;
	} catch {
		// no record is nothing confirmed
	}
	const missing: string[] = [];
	const walk = (dir: string) => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			if (!entry.isFile() || !lstatSync(full).isFile()) continue;
			const path = relative(design, full).split(sep).join("/");
			if (!travels(path)) continue;
			const hash = createHash("sha256").update(readFileSync(full)).digest("hex");
			if (files[path]?.hash !== hash) missing.push(path);
		}
	};
	walk(design);
	return missing.sort();
}

/** Whether a root's `spool.json` names this team project. */
export function linksTo(root: string, url: string): boolean {
	try {
		return isTeamProject(root) && readProjectLink(root).url === url;
	} catch {
		return false;
	}
}
