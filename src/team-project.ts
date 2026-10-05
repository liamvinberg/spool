import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SpoolError } from "./errors";

/**
 * A team project: a project whose `design/` a team shares live through Spool Cloud instead of
 * tracking it in git. Each machine holds a local copy, a real `design/`, and the repo tracks only the small
 * `spool.json` beside it that names the team project. It grants nothing: who may sync is the cloud's to say.
 */
export const PROJECT_LINK = "spool.json";

/**
 * A local copy's own `design/.gitignore`: everything, itself included, so git never sees the team's copy and
 * never writes to it. A solo project's ignores only `.spool/`.
 */
export const TEAM_GITIGNORE = "*\n";

/** Where a team project lives: `<origin>/<team>/<project>`. */
export interface ProjectLink {
	url: string;
	origin: string;
	team: string;
	project: string;
}

const SEGMENT = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/u;

/** Whether the folder is a team project's root: the link sits beside `design/`. */
export function isTeamProject(root: string): boolean {
	return existsSync(join(root, PROJECT_LINK));
}

/** A team project's URL taken apart, or nothing when it isn't one. */
export function parseProjectLink(value: unknown): ProjectLink | undefined {
	if (typeof value !== "string") return undefined;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	const [team, project, ...rest] = url.pathname.slice(1).split("/");
	if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || rest.length > 0)
		return undefined;
	if (team === undefined || project === undefined || !SEGMENT.test(team) || !SEGMENT.test(project)) return undefined;
	return { url: `${url.origin}/${team}/${project}`, origin: url.origin, team, project };
}

/** The team project a root's `spool.json` names. */
export function readProjectLink(root: string): ProjectLink {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(join(root, PROJECT_LINK), "utf8"));
	} catch {
		throw new SpoolError(`${join(root, PROJECT_LINK)} is not readable JSON`);
	}
	const link = parseProjectLink((parsed as { project?: unknown } | null)?.project);
	if (link === undefined)
		throw new SpoolError(
			`${join(root, PROJECT_LINK)} must hold { "project": "https://spool.page/<team>/<project>" }`,
		);
	return link;
}

/** The link and nothing else, so a public repo shows no more than the team's and project's names. */
export function writeProjectLink(root: string, link: ProjectLink): void {
	writeFileSync(join(root, PROJECT_LINK), `${JSON.stringify({ project: link.url }, null, "\t")}\n`);
}
