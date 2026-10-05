import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { type CloudRequestOptions, CloudSignedOut, keychainVault } from "./cloud-auth";
import {
	type CloudTeam,
	type CloudTeamProject,
	CloudTeamRefused,
	type CloudTeamsClient,
	cloudTeams,
} from "./cloud-teams";
import { registerAndOpenProject } from "./daemon/session";
import { type OpenSyncSocket, syncLocalCopy } from "./daemon/team-sync";
import { SpoolError } from "./errors";
import { checkoutOf } from "./git-remote";
import { isSafeName } from "./page-path";
import { expandHome, realDir } from "./paths";
import { readRegistry } from "./registry";
import {
	isTeamProject,
	PROJECT_LINK,
	type ProjectLink,
	parseProjectLink,
	refuseForeignLink,
	TEAM_GITIGNORE,
	writeProjectLink,
} from "./team-project";
import { scaffoldDirs, scaffoldFiles } from "./templates";

export interface InitOptions {
	/**
	 * Whether the new project keeps history (#158). Off unless the caller asks:
	 * an automatic save between an agent's own commits is noise in a log a team
	 * reads, so a project opts in, and init says which way it went out loud.
	 */
	history?: boolean;
}

/**
 * Scaffold the design/ contract, register the product root, and open its tab.
 * Never touches an existing design/, whoever owns it.
 */
export function initProject(targetDir: string, spoolDir: string, options: InitOptions = {}): { root: string } {
	const root = realDir(targetDir);
	refuseExisting(root);
	scaffold(root, scaffoldFiles(options.history ?? false));
	registerAndOpenProject(spoolDir, root);
	return { root };
}

export interface TeamInitOptions {
	/** The team, by its address or its name. */
	team: string;
	/** The spool.page this machine signs in to. */
	origin: string;
	/** A fake spool.page and Keychain, for tests. */
	request?: CloudRequestOptions;
	openSocket?: OpenSyncSocket;
}

/**
 * `spool init --team`: start the project in the team at spool.page first, then
 * scaffold design/ with its own `.gitignore` of everything, write the `spool.json` link beside it, and upload
 * the scaffold as the team's first saves. Nothing is staged or committed: design/ never enters git, and
 * spool.json is the repo's to commit. A project spool.page refuses leaves nothing on disk.
 */
export async function initTeamProject(
	targetDir: string,
	spoolDir: string,
	options: TeamInitOptions,
): Promise<{ root: string; link: ProjectLink; uploaded: boolean }> {
	const root = realDir(targetDir);
	refuseExisting(root);
	refuseForeignLink(root);
	const request = { ...options.request, origin: options.origin };
	const teams = cloudTeams(spoolDir, request);
	const team = await chosenTeam(teams, options.team);
	// where the code lives, as the team will see it: information, never a permission
	const repo = (await checkoutOf(root))?.repo;
	let created: CloudTeamProject;
	try {
		created = await teams.createProject(team.address, basename(root), repo);
	} catch (error) {
		throw teamProjectRefusal(error, team.name, basename(root));
	}
	const link = parseProjectLink(created.url);
	if (link === undefined) throw new SpoolError("spool.page returned an invalid team project");
	scaffold(root, { ...scaffoldFiles(false), ".gitignore": TEAM_GITIGNORE });
	writeProjectLink(root, link);
	registerAndOpenProject(spoolDir, root);
	let uploaded = true;
	try {
		await syncLocalCopy(root, spoolDir, options);
	} catch {
		// the files are here and the daemon sends them the next time it can reach spool.page
		uploaded = false;
	}
	return { root, link, uploaded };
}

/**
 * Where `spool init` with neither `--team` nor `--local` puts a project. Signed out, or editing in no team, it is
 * this Mac only, as it always was, and nothing goes over the network: a session on this Mac is the first thing
 * read. An editor or admin in teams chooses, unless the machine setting "New projects go to" already has.
 */
export type InitDestination =
	| { kind: "local" }
	| { kind: "team"; team: string }
	/** The teams this account edits in, by name: the person picks one, or this Mac. */
	| { kind: "choose"; teams: string[] }
	/** Signed in, but spool.page can't say which teams just now. */
	| { kind: "unknown" };

export async function initDestination(
	spoolDir: string,
	options: { origin: string; setting: string; request?: CloudRequestOptions },
): Promise<InitDestination> {
	if (options.setting === "local") return { kind: "local" };
	if (options.setting !== "ask") return { kind: "team", team: options.setting };
	const request = { ...options.request, origin: options.origin };
	let token: string | undefined;
	try {
		token = await (request.vault ?? keychainVault(spoolDir, options.origin)).read();
	} catch {
		// no Keychain is no session
		token = undefined;
	}
	if (token === undefined) return { kind: "local" };
	let teams: CloudTeam[];
	try {
		teams = (await cloudTeams(spoolDir, request).list()).teams;
	} catch (error) {
		return error instanceof CloudSignedOut ? { kind: "local" } : { kind: "unknown" };
	}
	const editing = teams.filter((team) => team.role !== "viewer").map((team) => team.name);
	return editing.length === 0 ? { kind: "local" } : { kind: "choose", teams: editing };
}

/**
 * Where this `spool init` goes, from its flags first and the destination after: a person at a terminal is asked
 * (`pick`), and anyone else is told the choice and nothing is written, so an agent can relay it.
 */
export async function chooseInitTarget(
	flags: { team?: string | undefined; local: boolean },
	destination: () => Promise<InitDestination>,
	pick?: (teams: readonly string[]) => Promise<"local" | { team: string } | undefined>,
): Promise<{ kind: "local" } | { kind: "team"; team: string }> {
	if (flags.team !== undefined && flags.local) throw new SpoolError("choose one of `--team <name>` and `--local`");
	if (flags.local) return { kind: "local" };
	if (flags.team !== undefined) return { kind: "team", team: flags.team };
	const decided = await destination();
	if (decided.kind === "local" || decided.kind === "team") return decided;
	if (decided.kind === "unknown")
		throw new SpoolError(
			"spool.page can't be reached to see which teams you're in. Run again with `--local`, or with `--team <name>` once it can.",
		);
	if (pick === undefined) throw new SpoolError(describeChoice(decided.teams));
	const picked = await pick(decided.teams);
	if (picked === undefined) throw new SpoolError(`nothing was started. ${describeChoice(decided.teams)}`);
	return picked === "local" ? { kind: "local" } : { kind: "team", team: picked.team };
}

/** "You're in Tidemark and Devosurf. Run again with `--team <name>`, or `--local`." */
export function describeChoice(teams: readonly string[]): string {
	const named = teams.length < 2 ? teams.join("") : `${teams.slice(0, -1).join(", ")} and ${teams.at(-1)}`;
	return `You're in ${named}. Run again with \`--team <name>\`, or \`--local\`.`;
}

/** The team `wanted` names, by address or name, among the account's, refused unless this account edits in it. */
export async function chosenTeam(teams: CloudTeamsClient, wanted: string): Promise<CloudTeam> {
	const named = wanted.trim().toLowerCase();
	const { teams: mine } = await teams.list();
	const team = mine.find((each) => each.address === named || each.name.toLowerCase() === named);
	if (team === undefined) {
		const yours = mine.map((each) => each.name).join(" and ");
		throw new SpoolError(`you're not in a team called "${wanted}"${yours === "" ? "" : `; you're in ${yours}`}`);
	}
	if (team.role === "viewer") {
		throw new SpoolError(`you're a viewer of ${team.name}; only its editors and admins start team projects`);
	}
	return team;
}

/** The team already has a project by the folder's name. */
class ProjectNameTaken extends SpoolError {}

export function teamProjectRefusal(error: unknown, team: string, folder: string): unknown {
	if (!(error instanceof CloudTeamRefused)) return error;
	if (error.code === "project_taken")
		return new ProjectNameTaken(
			`${team} already has a project called "${folder}"; start this one in a folder with another name`,
		);
	if (error.code === "invalid_project_name" || error.code === "project_name_reserved")
		return new SpoolError(
			`"${folder}" can't name a team project; use a folder named with 2 to 40 letters, digits and hyphens`,
		);
	if (error.code === "editor_required")
		return new SpoolError(`you're a viewer of ${team}; only its editors and admins start team projects`);
	return new SpoolError(`spool.page refused the team project: ${error.code}`);
}

function refuseExisting(root: string): void {
	if (isTeamProject(root) && !existsSync(join(root, "design", "canvas.json"))) {
		throw new SpoolError(`${root} already has a ${PROJECT_LINK}; run \`spool open\` there to fetch its design/`);
	}
	const design = join(root, "design");
	if (existsSync(join(design, "canvas.json"))) {
		throw new SpoolError(`already a spool project: ${root} (run \`spool open\` instead)`);
	}
	if (existsSync(design)) {
		throw new SpoolError(`design/ already exists at ${root} and is not a spool project, move it aside first`);
	}
}

/** Refuse a folder `spool init` can't start a project in, before anything else is asked. */
export function checkInitTarget(targetDir: string): void {
	refuseExisting(realDir(targetDir));
}

/** Write the design/ contract. Never touches an existing design/, whoever owns it. */
function scaffold(root: string, files: Record<string, string>): void {
	const design = join(root, "design");
	for (const dir of scaffoldDirs) {
		mkdirSync(join(design, dir), { recursive: true });
	}
	for (const [rel, content] of Object.entries(files)) {
		const file = join(design, rel);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content);
	}
}

/**
 * The picker's "+" (#242): make the folder, then run the one scaffold on it.
 * The folder lands inside the one being browsed, and a name is one path
 * segment, never a path — the picker is where you choose where.
 */
export function createProject(parentDir: string, name: string, spoolDir: string): { root: string } {
	const trimmed = name.trim();
	if (trimmed === "") return startProject(parentDir, spoolDir);
	if (!isSafeName(trimmed)) throw new SpoolError(`Not a folder name: ${JSON.stringify(trimmed)}`);
	const parent = expandHome(parentDir);
	try {
		mkdirSync(parent, { recursive: true });
		const target = join(realDir(parent), trimmed);
		if (existsSync(target)) throw new SpoolError(`${trimmed} already exists here. Choose another name.`);
		mkdirSync(target);
		return initProject(target, spoolDir);
	} catch (error) {
		if (error instanceof SpoolError) throw error;
		throw new SpoolError(
			`Could not create a project in ${parent}. Choose another folder or check that it is writable.`,
		);
	}
}

/**
 * The app's New project while a team is chosen in Home's switcher: the folder is made where the picker says, then
 * started in the team as `spool init --team` starts one. No name is the next free `untitled` the team doesn't have
 * yet. A team that refuses leaves no folder behind.
 */
export async function createTeamProject(
	parentDir: string,
	name: string,
	spoolDir: string,
	options: TeamInitOptions,
): Promise<{ root: string; link: ProjectLink; uploaded: boolean }> {
	const trimmed = name.trim();
	if (trimmed !== "" && !isSafeName(trimmed)) throw new SpoolError(`Not a folder name: ${JSON.stringify(trimmed)}`);
	const parent = expandHome(parentDir);
	mkdirSync(parent, { recursive: true });
	for (let suffix = 1; suffix <= 100; suffix++) {
		const folder = trimmed !== "" ? trimmed : suffix === 1 ? "untitled" : `untitled-${suffix}`;
		const target = join(realDir(parent), folder);
		if (existsSync(target)) {
			if (trimmed !== "") throw new SpoolError(`${trimmed} already exists here. Choose another name.`);
			continue;
		}
		mkdirSync(target);
		try {
			return await initTeamProject(target, spoolDir, options);
		} catch (error) {
			rmSync(target, { recursive: true, force: true });
			if (trimmed !== "" || !(error instanceof ProjectNameTaken)) throw error;
		}
	}
	throw new SpoolError("Could not find a free name for the project. Give it one.");
}

/** Allocate with mkdir itself: another request or process may take any name before us. */
export function startProject(location: string, spoolDir: string): { root: string } {
	const parent = expandHome(location);
	try {
		mkdirSync(parent, { recursive: true });
		const directory = realDir(parent);
		const registered = new Set(readRegistry(spoolDir).projects.map((project) => basename(project.root)));
		for (let suffix = 1; ; suffix++) {
			const name = suffix === 1 ? "untitled" : `untitled-${suffix}`;
			if (registered.has(name)) continue;
			const target = join(directory, name);
			try {
				mkdirSync(target);
			} catch (error) {
				if (error instanceof Error && "code" in error && error.code === "EEXIST") continue;
				throw error;
			}
			return initProject(target, spoolDir);
		}
	} catch (error) {
		throw new SpoolError(
			`Could not create a project in ${parent}. Check that the folder is writable or change the save location. ${error instanceof Error ? error.message : ""}`,
		);
	}
}
