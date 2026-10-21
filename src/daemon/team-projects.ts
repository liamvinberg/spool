import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { type Context, Hono } from "hono";
import { validator } from "hono/validator";
import { CloudSignedOut, originOf } from "../cloud-auth";
import { CloudTeamRefused, cloudTeams, type SeenAsk } from "../cloud-teams";
import { SpoolError } from "../errors";
import { getTeamProject } from "../get-it";
import { checkoutsFor, type PlaceSurvey, rememberPick, type Survey, surveyPlace } from "../get-it-places";
import { checkoutOf, cloneCommand } from "../git-remote";
import { linksTo, type MoveProgress, moveIntoTeam } from "../move-in";
import { expandHome, realDir } from "../paths";
import { readRegistry, teamProjects } from "../registry";
import {
	copiesOf,
	type MoveHooks,
	MoveRefused,
	moveIntoCheckout,
	moveOutOfTeam,
	moveSentence,
	moveToTeam,
	previewTeamMove,
	type TeamMoveOptions,
} from "../team-moves";
import { parseProjectLink } from "../team-project";
import type { DaemonCloud } from "./app";
import { branchesTouchingDesign, type MoveCommit } from "./history";
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

/** How a move ended: its outcome, or what stopped it, with spool.page's reason when it was spool.page's refusal. */
export type MoveEnded = { outcome: MoveOutcome } | { error: string; code?: string };

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
	/** The home folder Get it scans the code folders of for checkouts. */
	home?: string;
	cloud?: DaemonCloud | undefined;
	/** The machine's projects location, where "Just on this Mac" goes. */
	location: () => string;
	notice?: (message: string) => void;
	/** The daemon is closing: a move commit still waiting on git stops, and is made at the next start. */
	signal?: AbortSignal;
	/** What the daemon does around moving a team project on (task 136); none, and those routes refuse. */
	hooks?: Omit<MoveHooks, "onProgress">;
	/** A move changed what Home's covers show. */
	changed?: () => void;
}) {
	const origin = () => originOf(options.cloud);
	const asked = () => ({
		origin: origin(),
		...(options.cloud === undefined ? {} : { request: options.cloud }),
		...(options.cloud?.openSocket === undefined ? {} : { openSocket: options.cloud.openSocket }),
	});
	const refused = (c: Context, error: unknown) => {
		const { status, ...said } = refusal(error);
		return c.json(said, status);
	};
	/** Each move under way, by its project's root: the team it goes to and how far it has got, for the sheet. */
	const moves = new Map<string, { team: string; progress: MoveProgress }>();
	/**
	 * How a move ended whose answer had nobody to go to, the sheet that asked closed or reloaded: told to the next
	 * sheet that asks, once, for as long as `ENDED_KEPT_MS`.
	 */
	const ended = new Map<string, { team: string; ended: MoveEnded; at: number }>();
	const moving = (): TeamMoveOptions => ({
		...asked(),
		location: options.location(),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	const hooks = (onProgress?: (progress: MoveProgress) => void): MoveHooks => {
		if (options.hooks === undefined) throw new SpoolError("this daemon doesn't move team projects");
		return { ...options.hooks, ...(onProgress === undefined ? {} : { onProgress }) };
	};
	/** A team project Get it is about: its link, its repo, and how to ask the team about files. */
	const getting = async (team: string, name: string) => {
		const teams = cloudTeams(options.spoolDir, { ...options.cloud, origin: origin() });
		const found = await teams.project(team, name);
		if (found.role === "viewer") throw new SpoolError(`You're a viewer of ${team}; open ${found.url} in a browser.`);
		const link = parseProjectLink(found.url);
		if (link === undefined) throw new SpoolError("spool.page returned an invalid team project");
		const ask = (files: readonly SeenAsk[]) => teams.seen(link.team, link.project, files);
		return { link, repo: found.repo ?? null, ask };
	};
	/** Where a move went wrong, said for the sheet: spool.page's code, and a sentence for it. */
	const moveRefused = (
		c: Context,
		error: unknown,
		about: { team: string; project: string; to?: string; name?: string },
	) => {
		if (error instanceof CloudTeamRefused)
			return c.json({ error: moveSentence(error.code, about), code: error.code }, 409);
		if (error instanceof MoveRefused) return c.json({ error: error.message, code: error.code }, 409);
		return refused(c, error);
	};
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
			/** The branches whose design/ changes aren't merged yet: the Move sheet says to merge them first. */
			.get("/move/branches", async (c) => {
				const path = c.req.query("path");
				if (path === undefined || path === "") return c.json({ error: "expected ?path=/abs/project" }, 400);
				try {
					return c.json(await branchesTouchingDesign(realDir(path), { signal: c.req.raw.signal }));
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
			/**
			 * Where Get it can put a team project (spool#193): its checkouts on this Mac best first, found by the
			 * registry, the scan of the code folders and folders picked before, each with what is there; and the
			 * folder "Just on this Mac" makes.
			 */
			.get("/teams/:team/projects/:project/places", async (c) => {
				const team = c.req.param("team");
				const name = c.req.param("project");
				try {
					const { link, repo, ask } = await getting(team, name);
					const checkouts = await checkoutsFor(options.spoolDir, options.home ?? homedir(), { link, repo }, ask);
					const mac = join(expandHome(options.location()), team, name);
					return c.json({ checkouts, mac: { path: mac, survey: macSurvey(mac, link.url) } });
				} catch (error) {
					return refused(c, error);
				}
			})
			/** What is at a folder picked with "In a checkout…", said on its line before Get it is pressed. */
			.get("/teams/:team/projects/:project/places/survey", async (c) => {
				const path = c.req.query("path");
				if (path === undefined || path === "") return c.json({ error: "expected ?path=/abs/folder" }, 400);
				try {
					const { link, ask } = await getting(c.req.param("team"), c.req.param("project"));
					const at = realDir(path);
					return c.json({ path: at, usedAt: 0, ...(await surveyPlace(at, link, ask)) } satisfies PlaceSurvey);
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
						// a folder picked is offered again at the next Get it
						if (body.where === "checkout" && existsSync(body.path))
							rememberPick(options.spoolDir, realDir(body.path));
						const { root } = await getTeamProject(
							c.req.param("team"),
							c.req.param("project"),
							body.where === "mac"
								? { kind: "mac", location: options.location() }
								: { kind: "checkout", path: body.path },
							options.spoolDir,
							{ ...asked(), signal: c.req.raw.signal },
						);
						return c.json({ root, name: basename(root) });
					} catch (error) {
						return refused(c, error);
					}
				},
			)
			/** How many comments a team project holds, for the sheet that moves it out of its team to say so. */
			.get("/teams/:team/projects/:project/comments/count", async (c) => {
				try {
					return c.json(
						await cloudTeams(options.spoolDir, { ...options.cloud, origin: origin() }).commentCount(
							c.req.param("team"),
							c.req.param("project"),
						),
					);
				} catch (error) {
					return refused(c, error);
				}
			})
			/** D1: what moving a team project to another team would do, here and at spool.page. */
			.get("/teams/:team/projects/:project/move", async (c) => {
				const to = c.req.query("to");
				const name = c.req.query("name");
				if (to === undefined || to === "") return c.json({ error: "expected ?to=<team address>" }, 400);
				const from = { team: c.req.param("team"), project: c.req.param("project") };
				try {
					return c.json(await previewTeamMove(options.spoolDir, from, { team: to, name }, moving()));
				} catch (error) {
					return moveRefused(c, error, { ...from, to, ...(name === undefined ? {} : { name }) });
				}
			})
			/** D2: the same project to another team; this Mac's copies follow it, committed where spool.json is tracked. */
			.post(
				"/teams/:team/projects/:project/move",
				validator("json", (value, c) => {
					const { to, name } = value as { to?: unknown; name?: unknown };
					if (typeof to !== "string" || to === "" || (name !== undefined && typeof name !== "string"))
						return c.json(
							{ error: 'expected { "to": "<team address>", "name"?: "<name>" }', code: "invalid_input" },
							400,
						);
					return { to, ...(name === undefined ? {} : { name }) };
				}),
				async (c) => {
					const body = c.req.valid("json");
					const from = { team: c.req.param("team"), project: c.req.param("project") };
					try {
						const moved = await moveToTeam(
							options.spoolDir,
							from,
							{ team: body.to, name: body.name },
							moving(),
							hooks(),
						);
						options.notice?.(`moved ${from.team}/${from.project} to ${moved.team}/${moved.name}`);
						options.changed?.();
						return c.json(moved);
					} catch (error) {
						return moveRefused(c, error, { ...from, ...body });
					}
				},
			)
			/** D3: out of its team: this Mac's copy catches up, the team deletes it, and one commit puts design/ back in git. */
			.post(
				"/teams/:team/projects/:project/out",
				validator("json", (value, c) => {
					const path = (value as { path?: unknown } | null)?.path;
					if (path !== undefined && (typeof path !== "string" || path === ""))
						return c.json({ error: 'expected { "path"?: "/abs/project" }' }, 400);
					return { path: path as string | undefined };
				}),
				async (c) => {
					const from = { team: c.req.param("team"), project: c.req.param("project") };
					let key: string | undefined;
					try {
						const path = c.req.valid("json").path;
						key = path === undefined ? copiesOf(options.spoolDir, from)[0] : realDir(path);
						if (key !== undefined && moves.has(key))
							return c.json({ error: `${basename(key)} is already moving.` }, 409);
						const root = key;
						if (root !== undefined)
							moves.set(root, { team: from.team, progress: { up: 0, total: 0, paused: null } });
						const out = await moveOutOfTeam(
							options.spoolDir,
							from,
							root,
							moving(),
							hooks(
								root === undefined ? undefined : (progress) => moves.set(root, { team: from.team, progress }),
							),
						);
						options.notice?.(`moved ${from.team}/${from.project} out of ${from.team}`);
						options.changed?.();
						return c.json(out);
					} catch (error) {
						return moveRefused(c, error, from);
					} finally {
						if (key !== undefined) moves.delete(key);
					}
				},
			)
			/** D4: a copy in no repo into a checkout: design/ moves in, spool.json and the AGENTS.md line are committed. */
			.post(
				"/teams/:team/projects/:project/into",
				validator("json", (value, c) => {
					const { path, checkout } = (value ?? {}) as { path?: unknown; checkout?: unknown };
					if (typeof path !== "string" || path === "" || typeof checkout !== "string" || checkout === "")
						return c.json({ error: 'expected { "path": "/abs/project", "checkout": "/abs/clone" }' }, 400);
					return { path, checkout };
				}),
				async (c) => {
					const from = { team: c.req.param("team"), project: c.req.param("project") };
					try {
						const into = await moveIntoCheckout(options.spoolDir, from, c.req.valid("json"), moving(), hooks());
						options.changed?.();
						return c.json(into);
					} catch (error) {
						return moveRefused(c, error, from);
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
						const { status: _, ...said } = refusal(error);
						answer(said);
						return refused(c, error);
					} finally {
						if (root !== undefined) moves.delete(root);
					}
				},
			)
	);
}

/** What the daemon answers a team-project request that failed, and with which status. */
function refusal(error: unknown): { error: string; code?: string; status: 401 | 409 | 503 } {
	if (error instanceof CloudSignedOut) return { error: "Sign in to spool.page again.", status: 401 };
	if (error instanceof CloudTeamRefused) return { error: error.message, code: error.code, status: 409 };
	if (error instanceof SpoolError) return { error: error.message, status: 409 };
	return { error: "spool.page could not be reached. Try again.", status: 503 };
}

/** What "Just on this Mac" finds at its folder: nothing yet, or a folder Get it won't fill. */
function macSurvey(path: string, url: string): Survey {
	if (!existsSync(path)) return { kind: "empty" };
	if (linksTo(path, url)) return { kind: "synced" };
	try {
		if (readdirSync(path).length === 0) return { kind: "empty" };
	} catch {
		return { kind: "other", why: "Isn't a folder" };
	}
	return { kind: "other", why: "Isn't empty" };
}

/** Every checkout this Mac's registered projects sit in, with the repo its `origin` names. */
async function knownCheckouts(spoolDir: string): Promise<Map<string, string>> {
	const found = new Map<string, string>();
	const roots = readRegistry(spoolDir).projects.map((project) => project.root);
	for (const checkout of await Promise.all(roots.map((root) => checkoutOf(root).catch(() => undefined))))
		if (checkout?.repo !== undefined) found.set(checkout.top, checkout.repo);
	return found;
}
