import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CloudRequestOptions, keychainVault } from "./cloud-auth";
import { CloudTeamRefused, cloudTeams } from "./cloud-teams";
import { registerAndOpenProject } from "./daemon/session";
import { type OpenSyncSocket, syncLocalCopy } from "./daemon/team-sync";
import { SpoolError } from "./errors";
import { resolveProjectRoot } from "./resolve";
import { isTeamProject, PROJECT_LINK, readProjectLink, TEAM_GITIGNORE } from "./team-project";
import { scaffoldDirs } from "./templates";

/** Resolve the product root by walk-up, register it, and open its tab. */
export function openProject(startDir: string, spoolDir: string): { root: string } {
	const root = resolveProjectRoot(startDir);
	if (root === undefined) {
		throw new SpoolError(`no spool project found from ${startDir}, run \`spool init\` in your product root`);
	}
	if (!existsSync(join(root, "design", "canvas.json"))) {
		throw new SpoolError(
			`${root} is a team project with no design/ on this machine yet; run \`spool open\` there to fetch it`,
		);
	}
	registerAndOpenProject(spoolDir, root);
	return { root };
}

export interface FetchOptions {
	/** The spool.page this machine signs in to. */
	origin: string;
	request?: CloudRequestOptions;
	openSocket?: OpenSyncSocket;
}

/**
 * A team project's `spool.json` with no `design/` beside it, as a fresh clone has, is filled from the team
 * before anything else runs: the folder comes down as a local copy, out of git like every other.
 * Anywhere else this does nothing.
 */
export async function fetchLocalCopy(startDir: string, spoolDir: string, options: FetchOptions): Promise<void> {
	const root = resolveProjectRoot(startDir);
	if (root === undefined || !isTeamProject(root) || existsSync(join(root, "design", "canvas.json"))) return;
	const link = readProjectLink(root);
	if (link.origin !== options.origin) {
		throw new SpoolError(
			`${join(root, PROJECT_LINK)} names ${link.origin}, but this machine signs in to ${options.origin}`,
		);
	}
	const request = { ...options.request, origin: options.origin };
	let role: string;
	try {
		role = (await cloudTeams(spoolDir, request).project(link.team, link.project)).role;
	} catch (error) {
		if (error instanceof CloudTeamRefused && error.status === 404)
			throw new SpoolError(`${link.url} isn't a team project you're in; ask an admin of ${link.team} to invite you`);
		throw error;
	}
	if (role === "viewer")
		throw new SpoolError(`you're a viewer of ${link.team}; open ${link.url} in a browser to look`);

	const design = join(root, "design");
	for (const dir of scaffoldDirs) mkdirSync(join(design, dir), { recursive: true });
	if (!existsSync(join(design, ".gitignore"))) writeFileSync(join(design, ".gitignore"), TEAM_GITIGNORE);
	await syncLocalCopy({
		root,
		origin: options.origin,
		vault: request.vault ?? keychainVault(spoolDir, options.origin),
		...(options.openSocket === undefined ? {} : { openSocket: options.openSocket }),
		notice: () => {},
	});
	if (!existsSync(join(design, "canvas.json"))) throw new SpoolError(`${link.url} has no files yet`);
}
