import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CloudRequestOptions, CloudSignedOut } from "./cloud-auth";
import { CloudTeamRefused, cloudTeams } from "./cloud-teams";
import { registerAndOpenProject } from "./daemon/session";
import { type OpenSyncSocket, syncLocalCopy } from "./daemon/team-sync";
import { SpoolError } from "./errors";
import { registerProject } from "./registry";
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
	/** Where to say that a fetch is under way: it can take a while. */
	progress?: (line: string) => void;
	/** The environment a cloud agent is recognised by. */
	env?: Record<string, string | undefined>;
}

/**
 * A team project's `spool.json` with no `design/` beside it, as a fresh clone or a new worktree has, is filled from
 * the team before anything else runs: the folder comes down as a local copy, out of git like every other, and the
 * root is registered so the daemon keeps it in step. Anywhere else this does nothing. Every verb that walks up to
 * a project calls it first.
 */
export async function fetchLocalCopy(
	startDir: string,
	spoolDir: string,
	options: FetchOptions,
): Promise<{ root: string; fetched: boolean } | undefined> {
	const root = resolveProjectRoot(startDir);
	if (root === undefined) return undefined;
	if (!isTeamProject(root) || existsSync(join(root, "design", "canvas.json"))) return { root, fetched: false };
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
		// an agent in a cloud sandbox has no session and nobody at its terminal to sign it in
		const agent = cloudAgent(options.env ?? process.env);
		if (agent !== undefined && !(error instanceof CloudTeamRefused))
			throw new SpoolError(
				`${link.url} is a team project, and ${agent} can't fetch a team project's design/ yet; work on it from a machine with spool signed in to ${link.team}`,
			);
		if (error instanceof CloudSignedOut)
			throw new SpoolError(`${link.url} is a team project; run \`spool login\` to fetch its design/`);
		if (error instanceof CloudTeamRefused && error.status === 404)
			throw new SpoolError(`${link.url} isn't a team project you're in; ask an admin of ${link.team} to invite you`);
		throw error;
	}
	if (role === "viewer")
		throw new SpoolError(`you're a viewer of ${link.team}; open ${link.url} in a browser to look`);

	options.progress?.(`fetching design/ from ${link.url}…`);
	const design = join(root, "design");
	for (const dir of scaffoldDirs) mkdirSync(join(design, dir), { recursive: true });
	if (!existsSync(join(design, ".gitignore"))) writeFileSync(join(design, ".gitignore"), TEAM_GITIGNORE);
	await syncLocalCopy(root, spoolDir, options);
	if (!existsSync(join(design, "canvas.json"))) throw new SpoolError(`${link.url} has no files yet`);
	registerProject(spoolDir, root);
	return { root, fetched: true };
}

/**
 * The cloud-run agent this process is, if any: Claude Code on the web and GitHub's Copilot cloud agent say so in
 * the environment. Any other agent runs where someone can sign spool in, a Linux box over SSH included, so it is
 * told to. Asked only once a fetch has found no way in.
 */
export function cloudAgent(env: Record<string, string | undefined>): string | undefined {
	if (env.CLAUDE_CODE_REMOTE === "true") return "Claude Code on the web";
	if (env.AI_AGENT === "github_copilot_cloud_agent") return "Copilot's cloud agent";
	return undefined;
}
