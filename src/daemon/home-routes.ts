import { lstatSync, realpathSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import type { Context } from "hono";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { SpoolError } from "../errors";
import { checkoutOf } from "../git-remote";
import { initProject, startProject } from "../init";
import { openProject } from "../open";
import { forgetResolvedProject, readRegistry } from "../registry";
import { backInGitOffered } from "../team-moves";
import type { ProjectLink } from "../team-project";
import { isUntitled } from "../untitled";
import { updateLine } from "../update-how";
import type { createAgentTurns } from "./agent-live";
import type { Namings } from "./agent-naming";
import { DesignBoundaryError } from "./design-path";
import type { createChangeHub } from "./events";
import { listDirectory, refreshIndex, searchDirectories } from "./fs-list";
import type { MovedAway } from "./moved-away";
import {
	type createIconWatch,
	findProjectIcon,
	ICON_MAX_BYTES,
	ICON_REFUSALS,
	IconRefused,
	removeProjectIcon,
	writeProjectIcon,
} from "./project-icon";
import { type ResolveProject, withProject } from "./project-route";
import {
	type createThumbnailWatch,
	findProjectThumbnail,
	removeProjectThumbnail,
	setThumbnailFromFrame,
	ThumbnailRefused,
} from "./project-thumbnail";
import { exportProject, importArchive, TRANSFER_LIMITS, TransferError } from "./project-transfer";
import { describeMissingFrame, discoverFrames, frameExists, type ProjectCard, summarizeProject } from "./projection";
import { type AppEvent, readSession, type watchMachineState } from "./session";
import { type createTeamSync, endedWith, followedLink, goneLocalWith, movedOutOf } from "./team-sync";

/** Body of opening and designing in a folder: { path } — anything else is a 400. */
function requestedPath(value: unknown, c: Context): { path: string } | Response {
	const path = (value as { path?: unknown }).path;
	if (typeof path !== "string" || path === "") {
		return c.json({ error: 'expected { "path": "/abs/dir" }' }, 400);
	}
	return { path };
}

/**
 * Home over HTTP, mounted under `/api`: the folder chooser's reads, the project list and each card's icon and
 * thumbnail, and what a hand does to a whole project there (open, create, rename, export, import, forget,
 * trash).
 */
export function homeRoutes(deps: {
	resolve: ResolveProject;
	spoolDir: string;
	/** Where new projects go, as the setting says it (`~/spool`). */
	location: () => string;
	/** The home the folder chooser's search indexes, and the registry that marks its projects (#251/#277). */
	fsIndex: { home: string; spoolDir: string };
	/** Projects mid-rename or mid-trash, which every other project change waits out. */
	projectRenames: Set<string>;
	trashingProjects: Set<string>;
	/** Projects the agent is naming, which stay until it has answered. */
	namings: Pick<Namings, "has">;
	liveTurns: Pick<ReturnType<typeof createAgentTurns>, "of">;
	hub: Pick<ReturnType<typeof createChangeHub>, "forget">;
	/** A project renamed, as `createRenamer` does it. */
	rename: (root: string, name: string) => Promise<{ root: string; name: string }>;
	machineStateWatch: Pick<ReturnType<typeof watchMachineState>, "acknowledgeRegistry" | "acknowledgeSession">;
	emitAppEvent: (event: AppEvent) => void;
	registeredRoots: () => string[];
	trash: (paths: string[]) => Promise<void>;
	teamSync: Pick<ReturnType<typeof createTeamSync>, "state" | "hold">;
	/**
	 * A team project deleted at spool.page (spool#411): to its team's trash, or `empty`, an untouched one for good.
	 * Throws what refused it, as a SpoolError in plain words.
	 */
	deleteFromTeam: (link: ProjectLink, how: { empty: boolean }) => Promise<void>;
	/** A project whose design/ moved into a team this account can't edit (spool#194), as its cover says. */
	movedAway: (root: string) => MovedAway | undefined;
	iconWatch: Pick<ReturnType<typeof createIconWatch>, "saw">;
	thumbnailWatch: Pick<ReturnType<typeof createThumbnailWatch>, "saw">;
}) {
	const {
		spoolDir,
		location,
		fsIndex,
		projectRenames,
		trashingProjects,
		namings,
		liveTurns,
		hub,
		machineStateWatch,
		emitAppEvent,
		registeredRoots,
		teamSync,
		movedAway,
		iconWatch,
		thumbnailWatch,
	} = deps;
	const projectTransfers = new Map<string, AbortController>();
	const cancelledTransfers = new Map<string, number>();

	return (
		new Hono()
			.get("/fs/list", (c) => {
				const path = c.req.query("path");
				const listing = listDirectory(path);
				if (listing === undefined) return c.json({ error: "no such directory" }, 404);
				// no path is the chooser opening: the moment to walk home again behind the index that stands (#277)
				if (path === undefined) void refreshIndex(fsIndex);
				return c.json(listing);
			})
			.get("/fs/search", async (c) => {
				// one indexed walk of home, answered under the folder asked for: the browse is what an empty query still shows
				const found = await searchDirectories(c.req.query("q") ?? "", { ...fsIndex, under: c.req.query("under") });
				if (found === undefined) return c.json({ error: "not under home" }, 400);
				return c.json(found);
			})
			.post(
				"/projects/export",
				validator("json", (value, c) => {
					const root =
						typeof value === "object" && value !== null ? (value as { root?: unknown }).root : undefined;
					return typeof root === "string" ? { root } : c.json({ error: "A project root is required." }, 400);
				}),
				async (c) => {
					try {
						const { root } = c.req.valid("json");
						const bytes = await exportProject(root, spoolDir, c.req.raw.signal);
						c.header("Content-Type", "application/zip");
						c.header(
							"Content-Disposition",
							`attachment; filename="project.spool"; filename*=UTF-8''${encodeURIComponent(basename(root))}.spool`,
						);
						return c.body(Buffer.from(bytes));
					} catch (error) {
						return c.json({ error: error instanceof Error ? error.message : "Export failed." }, 400);
					}
				},
			)
			.post(
				"/projects/transfer/cancel",
				validator("json", (value, c) => {
					const transfer =
						typeof value === "object" && value !== null ? (value as { transfer?: unknown }).transfer : undefined;
					return typeof transfer === "string"
						? { transfer }
						: c.json({ error: "A transfer id is required." }, 400);
				}),
				(c) => {
					const transfer = c.req.valid("json").transfer;
					for (const [id, at] of cancelledTransfers) if (Date.now() - at > 300_000) cancelledTransfers.delete(id);
					if (cancelledTransfers.size >= 1000)
						cancelledTransfers.delete(cancelledTransfers.keys().next().value ?? "");
					cancelledTransfers.set(transfer, Date.now());
					projectTransfers.get(transfer)?.abort();
					return c.json({ cancelled: true });
				},
			)
			.post("/projects/import", async (c) => {
				const transfer = c.req.query("transfer");
				if (!transfer || !/^[a-zA-Z0-9-]{1,100}$/.test(transfer))
					return c.json({ error: "A transfer id is required." }, 400);
				if (projectTransfers.has(transfer)) return c.json({ error: "This transfer is already running." }, 409);
				const controller = new AbortController();
				const cancelledAt = cancelledTransfers.get(transfer);
				cancelledTransfers.delete(transfer);
				if (cancelledAt !== undefined && Date.now() - cancelledAt <= 300_000) controller.abort();
				projectTransfers.set(transfer, controller);
				try {
					const declared = Number(c.req.header("content-length"));
					if (declared > TRANSFER_LIMITS.compressedBytes)
						throw new TransferError("The archive exceeds the compressed size limit.");
					const body = c.req.raw.body;
					if (!body) throw new TransferError("Choose a Spool project file.");
					return c.json(await importArchive(body, location(), spoolDir, controller.signal));
				} catch (error) {
					if (controller.signal.aborted) return c.json({ error: "Import cancelled.", cancelled: true }, 409);
					return c.json({ error: error instanceof Error ? error.message : "Import failed." }, 400);
				} finally {
					projectTransfers.delete(transfer);
				}
			})
			.post("/projects/open", validator("json", requestedPath), (c) => {
				try {
					const { root } = openProject(c.req.valid("json").path, spoolDir);
					return c.json({ root, name: basename(root) });
				} catch (error) {
					if (!(error instanceof SpoolError)) throw error;
					return c.json({ error: error.message }, 404);
				}
			})
			.post("/projects/init", validator("json", requestedPath), (c) => {
				try {
					const { root } = initProject(c.req.valid("json").path, spoolDir);
					return c.json({ root, name: basename(root) });
				} catch (error) {
					if (!(error instanceof SpoolError)) throw error;
					return c.json({ error: error.message }, 409);
				}
			})
			// New project: the next free untitled in the projects location, opened at once
			.post("/projects/start", (c) => {
				try {
					const { root } = startProject(location(), spoolDir);
					return c.json({ root, name: basename(root) });
				} catch (error) {
					if (!(error instanceof SpoolError)) throw error;
					return c.json({ error: error.message }, 409);
				}
			})
			.post(
				"/projects/rename",
				validator("json", (value, c) => {
					const parsed = z.object({ root: z.string(), name: z.string() }).safeParse(value);
					return parsed.success ? parsed.data : c.json({ error: "Expected a project root and name." }, 400);
				}),
				async (c) => {
					const { root, name } = c.req.valid("json");
					try {
						return c.json(await deps.rename(root, name));
					} catch (error) {
						if (!(error instanceof SpoolError)) throw error;
						return c.json({ error: error.message }, 409);
					}
				},
			)
			.post(
				"/projects/forget",
				validator("json", (value, c) => {
					const root = (value as { root?: unknown }).root;
					if (typeof root !== "string" || root === "") {
						return c.json({ error: 'expected { "root": "/abs/dir" }' }, 400);
					}
					return { root };
				}),
				(c) => {
					// home's remove (#13): the registry forgets, the folder is untouched —
					// and its open tab closes in the same machine-state mutation
					const { root } = c.req.valid("json");
					const result = forgetResolvedProject(spoolDir, root);
					if (result.removed) {
						machineStateWatch.acknowledgeRegistry(result.registry);
						emitAppEvent({ kind: "registry" });
					}
					if (result.sessionChanged) {
						machineStateWatch.acknowledgeSession(result.session);
						emitAppEvent({ kind: "session" });
					}
					if (!result.removed) {
						return c.json({ error: `not a registered project root: ${root}` }, 404);
					}
					return c.body(null, 204);
				},
			)
			.post(
				"/projects/trash",
				validator("json", (value, c) => {
					const parsed = z
						.object({
							root: z.string().min(1),
							abandoned: z.literal(true).optional(),
							fromTeam: z.literal(true).optional(),
						})
						.safeParse(value);
					return parsed.success ? parsed.data : c.json({ error: "Expected a project root." }, 400);
				}),
				async (c) => {
					const { root, abandoned, fromTeam } = c.req.valid("json");
					const roots = registeredRoots();
					if (!roots.includes(root)) return c.json({ error: "This project is no longer registered." }, 404);
					// a closed project nobody named or drew in goes by itself, and only while it still is one (spool#51)
					if (abandoned === true && !isAbandoned(spoolDir, root)) {
						return c.json({ error: "This project is open, named or has frames, so it stays." }, 409);
					}
					if (projectRenames.has(root)) return c.json({ error: "Project change is in progress." }, 409);
					if (trashingProjects.has(root)) return c.json({ error: "This project is moving to the trash." }, 409);
					if (namings.has(root) || [...liveTurns.of(root)].some((turn) => turn.running)) {
						return c.json({ error: "Let the agent finish or stop its turn before trashing this project." }, 409);
					}
					const stateRoot = realpathSync(spoolDir);
					if (
						root === resolve(root, "..") ||
						roots.some((held) => held.startsWith(`${root}${sep}`)) ||
						stateRoot === root ||
						stateRoot.startsWith(`${root}${sep}`)
					) {
						return c.json(
							{ error: "This folder contains another Spool project or its app data. Hide it instead." },
							409,
						);
					}
					// a team copy leaves its team first, when that is asked: an untitled one New made and nobody used
					// for good, or Delete from the team to its trash (spool#411)
					const link = followedLink(root);
					const leaves = link !== undefined && (fromTeam === true || abandoned === true) ? link : undefined;
					if (fromTeam === true && leaves === undefined)
						return c.json({ error: "This project isn't in a team any more." }, 409);
					trashingProjects.add(root);
					let moved = false;
					let release: (() => void) | undefined;
					try {
						if (!lstatSync(root).isDirectory() || realpathSync(root) !== root) {
							return c.json(
								{ error: "The project folder has changed. Open its folder again before trashing it." },
								409,
							);
						}
						if (leaves !== undefined) {
							release = teamSync.hold(root);
							try {
								await deps.deleteFromTeam(leaves, { empty: abandoned === true });
							} catch (error) {
								release();
								release = undefined;
								if (!(error instanceof SpoolError)) throw error;
								return c.json({ error: error.message }, 409);
							}
						}
						await deps.trash([root]);
						moved = true;
						const result = forgetResolvedProject(spoolDir, root);
						hub.forget(root);
						if (result.removed) {
							machineStateWatch.acknowledgeRegistry(result.registry);
							emitAppEvent({ kind: "registry" });
						}
						if (result.sessionChanged) {
							machineStateWatch.acknowledgeSession(result.session);
							emitAppEvent({ kind: "session" });
						}
						return c.body(null, 204);
					} catch (error) {
						const detail = error instanceof Error ? error.message : String(error);
						return c.json(
							{
								error: moved
									? `The folder moved to the trash, but Spool could not remove it from the list. Hide it instead. ${detail}`
									: leaves !== undefined && release !== undefined
										? `It was deleted from ${leaves.team}, but its folder could not move to the trash: ${detail}`
										: `Could not trash the project: ${detail}`,
							},
							409,
						);
					} finally {
						release?.();
						trashingProjects.delete(root);
					}
				},
			)
			.get("/projects", async (c) => {
				// the app waits on this before it shows anything, and every card is a
				// walk of a project's design folder — so they run together (#13)
				const projects: ProjectCard[] = await Promise.all(
					readRegistry(spoolDir).projects.map(async (project) => {
						const link = followedLink(project.root);
						const ended = endedWith(project.root);
						const movedOut = ended === undefined ? undefined : movedOutOf(project.root);
						const sync = link === undefined ? undefined : teamSync.state(project.root);
						// a copy paused for an update is paused on its cover too (#206)
						const paused =
							sync === undefined
								? null
								: (sync.paused ?? (sync.update === null ? null : updateLine(sync.update.team)));
						const goneLocal = link === undefined ? undefined : goneLocalWith(project.root);
						const moved = movedAway(project.root);
						const [summary, icon, thumbnail, inRepo, backInGit] = await Promise.all([
							summarizeProject(project.root),
							findProjectIcon(project.root),
							findProjectThumbnail(project.root),
							link === undefined ? false : checkoutOf(project.root).then((found) => found !== undefined),
							backInGitOffered(project.root),
						]);
						return {
							name: basename(project.root),
							root: project.root,
							openedAt: project.openedAt,
							...(link === undefined
								? {}
								: { team: { url: link.url, team: link.team, project: link.project, inRepo } }),
							...(ended === undefined ? {} : { ended }),
							...(movedOut === undefined ? {} : { movedOut }),
							...(icon === undefined ? {} : { icon }),
							...(thumbnail === undefined ? {} : { thumbnail }),
							...(paused === null ? {} : { syncPaused: paused }),
							...(goneLocal === undefined ? {} : { goneLocal }),
							...(moved === undefined ? {} : { moved }),
							...(backInGit ? { backInGit: true as const } : {}),
							...summary,
						};
					}),
				);
				// the registry appends a project the first time it is opened, so of two
				// opened in the same millisecond the later entry is the more recent
				projects.reverse();
				projects.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
				return c.json({ projects });
			})
			// "Change icon…": the chosen image becomes design/shared/icon.<ext>, the only icon.* there
			.post("/projects/icon", async (c) => {
				const root = c.req.query("root");
				if (root === undefined || !registeredRoots().includes(root))
					return c.json({ error: "This project is no longer registered." }, 404);
				if (projectRenames.has(root)) return c.json({ error: "Project change is in progress." }, 409);
				if (trashingProjects.has(root)) return c.json({ error: "This project is moving to the trash." }, 409);
				// read no further than the cap, whatever the request says it carries
				const tooBig = () => c.json({ error: ICON_REFUSALS.size }, 413);
				if (Number(c.req.header("content-length")) > ICON_MAX_BYTES) return tooBig();
				const chunks: Uint8Array[] = [];
				let length = 0;
				const reader = c.req.raw.body?.getReader();
				for (;;) {
					const chunk = await reader?.read();
					if (chunk === undefined || chunk.done) break;
					length += chunk.value.length;
					if (length > ICON_MAX_BYTES) {
						await reader?.cancel();
						return tooBig();
					}
					chunks.push(chunk.value);
				}
				const bytes = Buffer.concat(chunks);
				try {
					const icon = writeProjectIcon(root, bytes);
					iconWatch.saw(root, icon);
					emitAppEvent({ kind: "icon", root, icon });
					return c.json({ icon });
				} catch (error) {
					if (error instanceof IconRefused) return c.json({ error: error.message }, 400);
					if (error instanceof DesignBoundaryError) return c.json({ error: error.message }, 400);
					return c.json({ error: `Could not save the icon: ${(error as Error).message}` }, 409);
				}
			})
			// "Remove icon": design/shared/icon.* goes, and the favicon or the letter comes back
			.post(
				"/projects/icon/remove",
				validator("json", (value, c) => {
					const parsed = z.object({ root: z.string().min(1) }).safeParse(value);
					return parsed.success ? parsed.data : c.json({ error: "Expected a project root." }, 400);
				}),
				async (c) => {
					const { root } = c.req.valid("json");
					if (!registeredRoots().includes(root))
						return c.json({ error: "This project is no longer registered." }, 404);
					if (projectRenames.has(root)) return c.json({ error: "Project change is in progress." }, 409);
					if (trashingProjects.has(root)) return c.json({ error: "This project is moving to the trash." }, 409);
					try {
						removeProjectIcon(root);
					} catch (error) {
						return c.json({ error: `Could not remove the icon: ${(error as Error).message}` }, 409);
					}
					const icon = await findProjectIcon(root);
					iconWatch.saw(root, icon);
					emitAppEvent({ kind: "icon", root, icon: icon ?? null });
					return c.json({ icon: icon ?? null });
				},
			)
			// "Set as thumbnail": the frame's still as it is now becomes design/shared/thumbnail.<ext>, the only one there
			.post(
				"/p/:project/thumbnail",
				validator("json", (value, c) => {
					const parsed = z.object({ frame: z.string().min(1) }).safeParse(value);
					return parsed.success ? parsed.data : c.json({ error: "Expected a frame." }, 400);
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						const { frame } = c.req.valid("json");
						try {
							if (!frameExists(root, frame)) return c.json({ error: describeMissingFrame(frame) }, 404);
							const thumbnail = setThumbnailFromFrame(root, frame);
							thumbnailWatch.saw(root, thumbnail);
							emitAppEvent({ kind: "thumbnail", root, thumbnail });
							return c.json({ thumbnail });
						} catch (error) {
							if (error instanceof ThumbnailRefused) return c.json({ error: error.message }, 409);
							if (error instanceof DesignBoundaryError) return c.json({ error: error.message }, 400);
							return c.json({ error: `Could not set the thumbnail: ${(error as Error).message}` }, 409);
						}
					}),
			)
			// "Remove thumbnail": design/shared/thumbnail.* goes, and the card shows its top-left frame again
			.post(
				"/projects/thumbnail/remove",
				validator("json", (value, c) => {
					const parsed = z.object({ root: z.string().min(1) }).safeParse(value);
					return parsed.success ? parsed.data : c.json({ error: "Expected a project root." }, 400);
				}),
				(c) => {
					const { root } = c.req.valid("json");
					if (!registeredRoots().includes(root))
						return c.json({ error: "This project is no longer registered." }, 404);
					if (projectRenames.has(root)) return c.json({ error: "Project change is in progress." }, 409);
					if (trashingProjects.has(root)) return c.json({ error: "This project is moving to the trash." }, 409);
					try {
						removeProjectThumbnail(root);
					} catch (error) {
						return c.json({ error: `Could not remove the thumbnail: ${(error as Error).message}` }, 409);
					}
					thumbnailWatch.saw(root, undefined);
					emitAppEvent({ kind: "thumbnail", root, thumbnail: null });
					return c.json({ thumbnail: null });
				},
			)
	);
}

/**
 * Still an untitled project with no frames, and closed: what New made and nobody used, on this Mac or in a team. A tab
 * open on it again, in any window, is someone using it after all.
 */
function isAbandoned(spoolDir: string, root: string): boolean {
	return (
		isUntitled(basename(root)) &&
		(discoverFrames(root)?.length ?? 0) === 0 &&
		!readSession(spoolDir).open.includes(root)
	);
}
