import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { addAgentsLine } from "./agents-line";
import { CloudSignedOut } from "./cloud-auth";
import { type CloudTeamProject, CloudTeamRefused, cloudTeams, type SeenAsk } from "./cloud-teams";
import { hasEnded, resumeLocalCopy } from "./daemon/team-sync";
import { SpoolError } from "./errors";
import { hasCommit, surveyPlace } from "./get-it-places";
import { checkoutOf } from "./git-remote";
import type { TeamInitOptions } from "./init";
import { linksTo } from "./move-in";
import { fetchLocalCopy } from "./open";
import { expandHome, realDir } from "./paths";
import { registerProject } from "./registry";
import { isTeamProject, PROJECT_LINK, parseProjectLink, refuseForeignLink, writeProjectLink } from "./team-project";

/**
 * "Get it" (DEV-190): a team project not yet on this Mac becomes a local copy here, in one of three places.
 *
 * - **In a checkout**: a clone of the project's repo, known on this Mac or picked. The local copy goes where the
 *   checkout's tracked `spool.json` for this project already is, or beside a new `spool.json` at the folder picked.
 * - **Just on this Mac**: `<projects location>/<team>/<project>`, with no repo at all.
 *
 * Either way it is the fetch any `spool` verb makes: `spool.json` names the project, and `design/` comes down from
 * the team, out of git. Spool never clones a repo; the person does, with the command the team page shows.
 */
export type GetItPlace = { kind: "checkout"; path: string } | { kind: "mac"; location: string };

export type GetItOptions = Omit<TeamInitOptions, "team"> & {
	/** Whoever asked has gone: a Get it waiting for the move commit stops waiting. */
	signal?: AbortSignal;
	/** How often a branch from before the move is looked at for the move commit: a second. */
	waitMs?: number;
};

/** How often a branch from before the move is looked at for its move commit. */
const MOVE_WAIT_MS = 1_000;

export async function getTeamProject(
	team: string,
	project: string,
	place: GetItPlace,
	spoolDir: string,
	options: GetItOptions,
): Promise<{ root: string }> {
	const request = { ...options.request, origin: options.origin };
	const teams = cloudTeams(spoolDir, request);
	let found: CloudTeamProject & { role: string };
	try {
		found = await teams.project(team, project);
	} catch (error) {
		if (error instanceof CloudSignedOut) throw new SpoolError("Sign in to spool.page to get team projects.");
		if (error instanceof CloudTeamRefused && error.status === 404)
			throw new SpoolError(`${team} has no project called ${project}, or you're no longer in it.`);
		throw error;
	}
	if (found.role === "viewer") throw new SpoolError(`You're a viewer of ${team}; open ${found.url} in a browser.`);
	const link = parseProjectLink(found.url);
	if (link === undefined) throw new SpoolError("spool.page returned an invalid team project");

	let root: string;
	let made: string | undefined;
	if (place.kind === "checkout") {
		const chosen = realDir(place.path);
		const ask = (files: readonly SeenAsk[]) => teams.seen(link.team, link.project, files);
		let found = await surveyPlace(chosen, link, ask);
		// a branch from before the move: Get it carries on by itself once the move commit is merged in
		while (found.survey.kind === "pre-move") {
			const { commit } = found.survey;
			while (!(await hasCommit(chosen, commit))) await waited(options.waitMs ?? MOVE_WAIT_MS, options.signal);
			found = await surveyPlace(chosen, link, ask);
		}
		const { survey } = found;
		if (survey.kind === "other") throw new SpoolError(`${chosen}: ${survey.why}. Choose another place.`);
		root = found.root;
	} else {
		root = join(expandHome(place.location), link.team, link.project);
		if (!existsSync(root)) {
			made = firstMissing(root);
			mkdirSync(root, { recursive: true });
		}
		root = realDir(root);
	}
	const wrote = !linksTo(root, link.url);
	if (wrote) {
		if (isTeamProject(root)) throw new SpoolError(`${root} already has a ${PROJECT_LINK} for another team project.`);
		refuseForeignLink(root);
		if (place.kind === "mac" && existsSync(join(root, "design")))
			throw new SpoolError(`${root} already has a design/ folder. Choose another place.`);
		if (place.kind === "mac" && made === undefined && readdirSync(root).length > 0)
			throw new SpoolError(`${root} isn't empty. Choose another place.`);
		writeProjectLink(root, link);
	}
	const fresh = !existsSync(join(root, "design"));
	try {
		await fetchLocalCopy(root, spoolDir, options);
	} catch (error) {
		// a refused Get it leaves the place as it was found
		if (made !== undefined) rmSync(made, { recursive: true, force: true });
		else {
			if (wrote) rmSync(join(root, PROJECT_LINK), { force: true });
			if (fresh) rmSync(join(root, "design"), { recursive: true, force: true });
		}
		throw error;
	}
	// a spool.json written into a checkout brings the AGENTS.md line with it, for the commit that takes it in
	if (wrote && place.kind === "checkout") {
		const top = (await checkoutOf(root))?.top;
		if (top !== undefined) await addAgentsLine(top);
	}
	// a copy that ended here, its person an editor again, is followed again
	if (hasEnded(root)) resumeLocalCopy(root);
	registerProject(spoolDir, root);
	// a project with no repo yet takes the one it was just got into: information for the team, never a permission
	if (found.repo === null && place.kind === "checkout") {
		const repo = (await checkoutOf(root))?.repo;
		if (repo !== undefined) await teams.setRepo(link.team, link.project, repo).catch(() => undefined);
	}
	return { root };
}

/** A wait of `ms`, cut short with a refusal when whoever asked has gone. */
function waited(ms: number, signal: AbortSignal | undefined): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted === true) return reject(new SpoolError("Get it stopped waiting for the merge."));
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", stop);
			resolve();
		}, ms);
		const stop = () => {
			clearTimeout(timer);
			reject(new SpoolError("Get it stopped waiting for the merge."));
		};
		signal?.addEventListener("abort", stop, { once: true });
	});
}

/** The outermost folder of `path` that doesn't exist yet, so a refused Get it takes away exactly what it made. */
function firstMissing(path: string): string {
	let at = path;
	while (!existsSync(dirname(at))) at = dirname(at);
	return at;
}
