import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { addAgentsLine } from "./agents-line";
import { type CloudRequestOptions, CloudSignedOut, sessionVault } from "./cloud-auth";
import {
	type CloudTeam,
	type CloudTeamProject,
	CloudTeamRefused,
	type CloudTeamsClient,
	cloudTeams,
} from "./cloud-teams";
import { registerAndOpenProject } from "./daemon/session";
import { forgetStartedHere, markStartedHere } from "./daemon/started-here";
import { type OpenSyncSocket, syncLocalCopy } from "./daemon/team-sync";
import { SpoolError } from "./errors";
import { checkoutOf, type ProjectNameSource, teamProjectNameAt } from "./git-remote";
import { fetchLocalCopy } from "./open";
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
import { untitledName } from "./untitled";

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
	/** A fake spool.page and session vault, for tests. */
	request?: CloudRequestOptions;
	openSocket?: OpenSyncSocket;
}

/** Why init joined a project the team already had: it is this repo's, or it had this repo's name and no repo yet. */
export type JoinReason = "repo" | "repaired";

export type TeamInitResult = {
	root: string;
	link: ProjectLink;
	/** The team, by its name. */
	team: string;
	/** The name init wanted, and where it came from. */
	named: { name: string; from: ProjectNameSource };
	/** The file the AGENTS.md line went into, in a checkout. */
	agents?: string;
} & (
	| {
			started: "made" /** Whether the scaffold reached spool.page; the daemon sends it otherwise. */;
			uploaded: boolean;
	  }
	| { started: "joined"; why: JoinReason }
);

/**
 * `spool init --team`: name the project as `teamProjectNameAt` says, then start it in the team at spool.page, or join
 * the one the team already has for this repo (spool#295), as `joinOrStart` decides from the team's projects.
 *
 * Started, design/ is scaffolded with its own `.gitignore` of everything, the `spool.json` link is written beside it,
 * and the scaffold is uploaded as the team's first saves. Joined, nothing is scaffolded and nothing goes up: the link
 * is written and the team's design/ fetched, as `spool open` fills a fresh clone, and a failed fetch leaves neither
 * behind. `refuseExisting` runs first, so no design/ is here to lose either way.
 *
 * Nothing is staged or committed: design/ never enters git, and spool.json is the repo's to commit. In a checkout,
 * the AGENTS.md line goes beside it (task 136), for the same commit; `agents` is the file it went into. A project
 * spool.page refuses leaves nothing on disk.
 */
export async function initTeamProject(
	targetDir: string,
	spoolDir: string,
	options: TeamInitOptions & { name?: string | undefined },
): Promise<TeamInitResult> {
	const root = realDir(targetDir);
	refuseExisting(root);
	refuseForeignLink(root);
	const teams = cloudTeams(spoolDir, { ...options.request, origin: options.origin });
	const team = await chosenTeam(teams, options.team);
	const checkout = await checkoutOf(root);
	const named = teamProjectNameAt(root, checkout, options.name);
	const repo = checkout?.repo;
	const about = { root, team: team.name, named };
	// a project made between the read and the create is decided again, once, from what the team has then
	for (let tries = 0; ; tries++) {
		const { projects } = await teams.projects(team.address);
		const choice = joinOrStart(projects, named, repo);
		if (choice.kind === "taken") throw takenRefusal(team.name, choice.project);
		if (choice.kind === "join") {
			const joined = await joinTeamProject(root, spoolDir, teams, team, choice, repo, options);
			return { ...about, ...joined, started: "joined", why: choice.why };
		}
		let made: { link: ProjectLink; agents?: string };
		try {
			made = await makeTeamProject(root, spoolDir, teams, team, named.name, "init");
		} catch (error) {
			if (error instanceof ProjectNameTaken && tries === 0) continue;
			throw error;
		}
		let uploaded = true;
		try {
			await syncLocalCopy(root, spoolDir, options);
		} catch {
			// the files are here and the daemon sends them the next time it can reach spool.page
			uploaded = false;
		}
		return { ...about, ...made, started: "made", uploaded };
	}
}

/** What init does with the team's projects: start a new one, join one, or refuse a name another project holds. */
export type TeamProjectChoice =
	| { kind: "start" }
	| { kind: "join"; project: CloudTeamProject; why: JoinReason }
	| { kind: "taken"; project: CloudTeamProject };

/**
 * Whether `spool init --team` joins a project the team has or starts one (spool#295), from the team's projects, the
 * name init wants and the checkout's repo. A project of this name and this repo is joined, anywhere. At the top of a
 * checkout, where the name came from the repo, the repo's only project is joined whatever its name, and a project of
 * the repo's name with no repo recorded is joined and given it. Otherwise a name another project holds is refused,
 * and a free one started: `--name` is how a repo gets a second project on purpose.
 */
export function joinOrStart(
	projects: readonly CloudTeamProject[],
	named: { name: string; from: ProjectNameSource },
	repo: string | undefined,
): TeamProjectChoice {
	const wanted = named.name.toLowerCase();
	const same = projects.find((project) => project.name === wanted);
	if (same !== undefined && repo !== undefined && same.repo === repo)
		return { kind: "join", project: same, why: "repo" };
	if (named.from === "repo" && repo !== undefined) {
		const ours = projects.filter((project) => project.repo === repo);
		const [only] = ours;
		if (ours.length === 1 && only !== undefined) return { kind: "join", project: only, why: "repo" };
		if (same !== undefined && same.repo === null) return { kind: "join", project: same, why: "repaired" };
	}
	return same === undefined ? { kind: "start" } : { kind: "taken", project: same };
}

/**
 * A project the team has, joined here: its repo recorded first when it had none, then the link written and its
 * design/ fetched from the team, never scaffolded, so nothing on this Mac goes up over the team's canvas. A fetch
 * that fails takes the link and whatever came down with it.
 */
async function joinTeamProject(
	root: string,
	spoolDir: string,
	teams: CloudTeamsClient,
	team: CloudTeam,
	choice: { project: CloudTeamProject; why: JoinReason },
	repo: string | undefined,
	options: TeamInitOptions,
): Promise<{ link: ProjectLink; agents?: string }> {
	const link = parseProjectLink(choice.project.url);
	if (link === undefined) throw new SpoolError("spool.page returned an invalid team project");
	if (choice.why === "repaired" && repo !== undefined) await teams.setRepo(team.address, choice.project.name, repo);
	writeProjectLink(root, link);
	try {
		await fetchLocalCopy(root, spoolDir, options);
	} catch (error) {
		rmSync(join(root, "design"), { recursive: true, force: true });
		rmSync(join(root, PROJECT_LINK), { force: true });
		throw error;
	}
	const agents = await agentsLine(root);
	registerAndOpenProject(spoolDir, root);
	return { link, ...(agents === undefined ? {} : { agents }) };
}

/** The AGENTS.md line, beside spool.json for the same commit, in a checkout. */
async function agentsLine(root: string): Promise<string | undefined> {
	const checkout = await checkoutOf(root);
	return checkout === undefined ? undefined : await addAgentsLine(checkout.top);
}

/** A name the team's project holds that init won't join: `--name` is the way to another. */
function takenRefusal(team: string, project: CloudTeamProject): ProjectNameTaken {
	const whose = project.repo === null ? "" : ` for ${project.repo}`;
	return new ProjectNameTaken(
		`${team} already has a project called "${project.name}"${whose}; pass \`--name <name>\` to start this one under another name`,
	);
}

/**
 * The team's project made at spool.page under `name`, then scaffolded, linked and registered here. Nothing is
 * uploaded yet: that is the caller's, once or by the daemon's own copy.
 */
async function makeTeamProject(
	root: string,
	spoolDir: string,
	teams: CloudTeamsClient,
	team: CloudTeam,
	name: string,
	asked: RefusalFor,
): Promise<{ root: string; link: ProjectLink; agents?: string }> {
	// where the code lives, as the team will see it: information, never a permission
	const repo = (await checkoutOf(root))?.repo;
	let created: CloudTeamProject;
	try {
		created = await teams.createProject(team.address, name, repo);
	} catch (error) {
		throw teamProjectRefusal(error, team.name, name, asked);
	}
	const link = parseProjectLink(created.url);
	if (link === undefined) throw new SpoolError("spool.page returned an invalid team project");
	scaffold(root, { ...scaffoldFiles(false), ".gitignore": TEAM_GITIGNORE });
	writeProjectLink(root, link);
	const agents = await agentsLine(root);
	registerAndOpenProject(spoolDir, root);
	return { root, link, ...(agents === undefined ? {} : { agents }) };
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
		token = await (request.vault ?? sessionVault(spoolDir, options.origin)).read();
	} catch {
		// no vault to read is no session
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

/** The team already has a project by the name asked for, live or in its trash. */
class ProjectNameTaken extends SpoolError {}

/**
 * Who asked for the project, for how a refusal says to try again: `init` (and the app's New project, which tries the
 * next name itself) takes `--name`; a move in takes the name init would, so a clash is the team's project to rename.
 */
export type RefusalFor = "init" | "move";

export function teamProjectRefusal(error: unknown, team: string, name: string, asked: RefusalFor): unknown {
	// the team's, not the project's: said as spool.page says it
	if (!(error instanceof CloudTeamRefused) || error.code === "unpaid") return error;
	const other =
		asked === "init"
			? "pass `--name <name>` to start this one under another name"
			: "rename that one in the team first";
	if (error.code === "project_taken")
		return new ProjectNameTaken(`${team} already has a project called "${name}"; ${other}`);
	if (error.code === "name_in_trash")
		return new ProjectNameTaken(
			`a project in ${team}'s trash holds the name "${name}"; restore or delete it there${asked === "init" ? ", or pass `--name <name>` to start this one under another name" : ""}`,
		);
	if (error.code === "invalid_project_name" || error.code === "project_name_reserved")
		return new SpoolError(
			asked === "init"
				? `"${name}" can't name a team project; pass \`--name\` with 2 to 40 letters, digits and hyphens`
				: `"${name}" can't name a team project; use a folder named with 2 to 40 letters, digits and hyphens`,
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
 * The app's New project while a team is chosen in Home's switcher: the next free `untitled` in `parentDir` that
 * the team doesn't have yet, started in the team as `spool init --team` starts one. A team that refuses leaves no
 * folder behind.
 */
export async function startTeamProject(
	parentDir: string,
	spoolDir: string,
	options: TeamInitOptions,
): Promise<{ root: string; link: ProjectLink }> {
	const parent = expandHome(parentDir);
	mkdirSync(parent, { recursive: true });
	const registered = new Set(readRegistry(spoolDir).projects.map((project) => basename(project.root)));
	const teams = cloudTeams(spoolDir, { ...options.request, origin: options.origin });
	// the team's names are read beside it, so the first try is a free name rather than one round trip per taken one
	const [team, theirs] = await Promise.all([
		chosenTeam(teams, options.team),
		teams.projects(options.team).then(
			({ projects }) => new Set(projects.map((project) => project.name)),
			() => new Set<string>(),
		),
	]);
	for (let suffix = 1; suffix <= 100; suffix++) {
		const folder = untitledName(suffix);
		const target = join(realDir(parent), folder);
		if (registered.has(folder) || theirs.has(folder) || existsSync(target)) continue;
		mkdirSync(target);
		// this Mac's own: closed untitled and empty, it may go from the team by itself (spool#411)
		markStartedHere(spoolDir, realDir(target));
		try {
			// the daemon's own copy of it uploads the scaffold, as it does any change: nothing waits on that here
			return await makeTeamProject(realDir(target), spoolDir, teams, team, folder, "init");
		} catch (error) {
			forgetStartedHere(spoolDir, realDir(target));
			rmSync(target, { recursive: true, force: true });
			if (!(error instanceof ProjectNameTaken)) throw error;
		}
	}
	throw new SpoolError("Could not find a free name for the project. Rename an untitled one and try again.");
}

/**
 * New project: the next free `untitled` in the projects location. Allocated with mkdir itself, since another
 * request or process may take any name before us.
 */
export function startProject(location: string, spoolDir: string): { root: string } {
	const parent = expandHome(location);
	try {
		mkdirSync(parent, { recursive: true });
		const directory = realDir(parent);
		const registered = new Set(readRegistry(spoolDir).projects.map((project) => basename(project.root)));
		for (let suffix = 1; ; suffix++) {
			const name = untitledName(suffix);
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
