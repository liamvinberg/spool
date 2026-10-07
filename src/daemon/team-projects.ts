import { basename, join } from "node:path";
import { type Context, Hono } from "hono";
import { validator } from "hono/validator";
import { CloudSignedOut, originOf } from "../cloud-auth";
import { CloudTeamRefused, cloudTeams } from "../cloud-teams";
import { SpoolError } from "../errors";
import { getTeamProject } from "../get-it";
import { checkoutOf, cloneCommand } from "../git-remote";
import { type MoveProgress, moveIntoTeam } from "../move-in";
import { expandHome, realDir } from "../paths";
import { readRegistry, teamProjects } from "../registry";
import type { DaemonCloud } from "./app";
import type { MoveCommit } from "./history";
import { staysOnThisMac } from "./team-sync";

/** A team project as Home's team page shows it: on this Mac already, or dimmed with "Get it". */
export interface TeamProjectOnMac {
	name: string;
	url: string;
	/** Where its code lives (`host/path`), or null when nobody has said. */
	repo: string | null;
	/** The command to clone the repo; Spool never clones. */
	clone: string | null;
	/** Its local copies on this Mac, latest opened first. None means "Get it". */
	copies: string[];
	/** Checkouts on this Mac whose `origin` is the project's repo: Get it's first offer. */
	checkouts: string[];
	/** Where "Just on this Mac" puts it: `<projects location>/<team>/<project>`. */
	home: string;
}

/** What a move came to, as Home says it. */
export type MoveOutcome = { root: string; name: string; commit: MoveCommit["kind"] | "waiting" };

/** How a move ended: what it came to, or what stopped it. */
export type MoveEnded = { outcome: MoveOutcome } | { error: string };

/**
 * What the move sheet asks of a project: the move under way and its team, or how one ended that no sheet heard,
 * said once.
 */
export interface MoveReading {
	progress: MoveProgress | null;
	team: string | null;
	ended: MoveEnded | null;
}

/** How long the end of a move no sheet heard is kept for the next one. */
const ENDED_KEPT_MS = 60 * 60_000;

/** How long a move waits on its commit before it answers; past that the commit lands on its own once git is free. */
const COMMIT_ANSWER_MS = 5_000;

/**
 * The daemon's side of "Get it" and "Move to team…" (DEV-190), mounted at `/api/cloud` beside the team routes.
 */
export function teamProjectRoutes(options: {
	spoolDir: string;
	cloud?: DaemonCloud | undefined;
	/** The machine's projects location, where "Just on this Mac" goes. */
	location: () => string;
	notice?: (message: string) => void;
	/** The daemon is closing: a move commit still waiting on git stops, and is made at the next start. */
	signal?: AbortSignal;
}) {
	const origin = () => originOf(options.cloud);
	const asked = () => ({
		origin: origin(),
		...(options.cloud === undefined ? {} : { request: options.cloud }),
		...(options.cloud?.openSocket === undefined ? {} : { openSocket: options.cloud.openSocket }),
	});
	const refused = (c: Context, error: unknown) => {
		const { error: said, status } = refusal(error);
		return c.json({ error: said }, status);
	};
	/** Each move under way, by its project's root: the team it goes to and how far it has got, for the sheet. */
	const moves = new Map<string, { team: string; progress: MoveProgress }>();
	/**
	 * How a move ended whose answer had nobody to go to, the sheet that asked closed or reloaded: told to the next
	 * sheet that asks, once, for as long as `ENDED_KEPT_MS`.
	 */
	const ended = new Map<string, { team: string; ended: MoveEnded; at: number }>();
	return (
		new Hono()
			/** How far a move under way has got, and a pause it is waiting out; null when none is. */
			.get("/move/progress", (c) => {
				const path = c.req.query("path");
				if (path === undefined || path === "") return c.json({ error: "expected ?path=/abs/project" }, 400);
				const nothing: MoveReading = { progress: null, team: null, ended: null };
				let root: string;
				try {
					root = realDir(path);
				} catch {
					return c.json(nothing);
				}
				const moving = moves.get(root);
				if (moving !== undefined) return c.json({ progress: moving.progress, team: moving.team, ended: null });
				const over = ended.get(root);
				ended.delete(root);
				if (over === undefined || Date.now() - over.at > ENDED_KEPT_MS) return c.json(nothing);
				return c.json({ progress: null, team: over.team, ended: over.ended } satisfies MoveReading);
			})
			/** What in a project's design/ would stay on this Mac if it moved: the Move sheet names it first. */
			.get("/move/stays", (c) => {
				const path = c.req.query("path");
				if (path === undefined || path === "") return c.json({ error: "expected ?path=/abs/project" }, 400);
				try {
					return c.json({ stays: staysOnThisMac(realDir(path)) });
				} catch (error) {
					return refused(c, error);
				}
			})
			.get("/teams/:team/projects", async (c) => {
				const team = c.req.param("team");
				try {
					const { projects } = await cloudTeams(options.spoolDir, {
						...options.cloud,
						origin: origin(),
					}).projects(team);
					const held = new Map(teamProjects(options.spoolDir).map(({ link, copies }) => [link.url, copies]));
					const checkouts = await knownCheckouts(options.spoolDir);
					const listed: TeamProjectOnMac[] = projects.map((project) => ({
						name: project.name,
						url: project.url,
						repo: project.repo ?? null,
						clone: project.repo ? cloneCommand(project.repo) : null,
						copies: held.get(project.url) ?? [],
						checkouts: project.repo
							? [...checkouts].filter(([, repo]) => repo === project.repo).map(([top]) => top)
							: [],
						home: join(expandHome(options.location()), team, project.name),
					}));
					return c.json({ projects: listed });
				} catch (error) {
					return refused(c, error);
				}
			})
			.post(
				"/teams/:team/projects/:project/get",
				validator("json", (value, c) => {
					const { where, path } = value as { where?: unknown; path?: unknown };
					if (where === "mac") return { where } as const;
					if (where === "checkout" && typeof path === "string" && path !== "") return { where, path } as const;
					return c.json({ error: 'expected { "where": "checkout", "path" } or { "where": "mac" }' }, 400);
				}),
				async (c) => {
					const body = c.req.valid("json");
					try {
						const { root } = await getTeamProject(
							c.req.param("team"),
							c.req.param("project"),
							body.where === "mac"
								? { kind: "mac", location: options.location() }
								: { kind: "checkout", path: body.path },
							options.spoolDir,
							asked(),
						);
						return c.json({ root, name: basename(root) });
					} catch (error) {
						return refused(c, error);
					}
				},
			)
			.post(
				"/teams/:team/move",
				validator("json", (value, c) => {
					const path = (value as { path?: unknown }).path;
					return typeof path === "string" && path !== ""
						? { path }
						: c.json({ error: 'expected { "path": "/abs/project" }' }, 400);
				}),
				async (c) => {
					const path = c.req.valid("json").path;
					const team = c.req.param("team");
					let root: string | undefined;
					/** The answer, kept for the next sheet when the one that asked is gone. */
					const answer = (over: MoveEnded) => {
						if (root !== undefined && c.req.raw.signal.aborted)
							ended.set(root, { team, ended: over, at: Date.now() });
					};
					try {
						const key = realDir(path);
						if (moves.has(key)) return c.json({ error: `${basename(key)} is already moving.` }, 409);
						moves.set(key, { team, progress: { up: 0, total: 0, paused: null } });
						ended.delete(key);
						root = key;
						const moved = await moveIntoTeam(path, options.spoolDir, {
							team,
							...asked(),
							...(options.signal === undefined ? {} : { signal: options.signal }),
							onProgress: (progress) => moves.set(key, { team, progress }),
						});
						void moved.commit.then((commit) =>
							options.notice?.(
								commit.kind === "committed"
									? `moved ${moved.root} to ${moved.link.url} in commit ${commit.commit.slice(0, 7)}`
									: `moved ${moved.root} to ${moved.link.url}; the move commit wasn't made (${commit.kind})`,
							),
						);
						const commit = await Promise.race([
							moved.commit.then((made) => made.kind),
							new Promise<"waiting">((resolve) =>
								setTimeout(() => resolve("waiting"), COMMIT_ANSWER_MS).unref(),
							),
						]);
						const outcome: MoveOutcome = { root: moved.root, name: basename(moved.root), commit };
						answer({ outcome });
						return c.json(outcome);
					} catch (error) {
						answer({ error: refusal(error).error });
						return refused(c, error);
					} finally {
						if (root !== undefined) moves.delete(root);
					}
				},
			)
	);
}

/** What the daemon answers a team-project request that failed, and with which status. */
function refusal(error: unknown): { error: string; status: 401 | 409 | 503 } {
	if (error instanceof CloudSignedOut) return { error: "Sign in to spool.page again.", status: 401 };
	if (error instanceof CloudTeamRefused) return { error: `spool.page refused: ${error.code}`, status: 409 };
	if (error instanceof SpoolError) return { error: error.message, status: 409 };
	return { error: "spool.page could not be reached. Try again.", status: 503 };
}

/** Every checkout this Mac's registered projects sit in, with the repo its `origin` names. */
async function knownCheckouts(spoolDir: string): Promise<Map<string, string>> {
	const found = new Map<string, string>();
	const roots = readRegistry(spoolDir).projects.map((project) => project.root);
	for (const checkout of await Promise.all(roots.map((root) => checkoutOf(root).catch(() => undefined))))
		if (checkout?.repo !== undefined) found.set(checkout.top, checkout.repo);
	return found;
}
