import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { Context } from "hono";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { SpoolError } from "../errors";
import { checkoutOf } from "../git-remote";
import { createProject, initProject, startProject } from "../init";
import { mutateMachineState } from "../machine-state";
import { openProject } from "../open";
import { forgetResolvedProject, readRegistry } from "../registry";
import type { createAgentTurns } from "./agent-live";
import { DesignBoundaryError } from "./design-path";
import type { createChangeHub } from "./events";
import { createDirectory, listDirectory, refreshIndex, searchDirectories } from "./fs-list";
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
import { exportProject, importProject, TRANSFER_LIMITS, TransferError } from "./project-transfer";
import { describeMissingFrame, frameExists, type ProjectCard, summarizeProject } from "./projection";
import type { createSelectionStore } from "./selection";
import type { AppEvent, watchMachineState } from "./session";
import type { createSettingsStore } from "./settings";
import { type createTeamSync, endedWith, followedLink, goneLocalWith, movedOutOf } from "./team-sync";

/** Body of the picker's POSTs: { path } — anything else is a 400. */
function requestedPath(value: unknown, c: Context): { path: string } | Response {
	const path = (value as { path?: unknown }).path;
	if (typeof path !== "string" || path === "") {
		return c.json({ error: 'expected { "path": "/abs/dir" }' }, 400);
	}
	return { path };
}

/** Body of the picker's create: { path, name } — the folder to make it in, and what to call it. */
function requestedNewProject(value: unknown, c: Context): { path: string; name: string } | Response {
	const parsed = z.object({ path: z.string().min(1), name: z.string() }).safeParse(value);
	if (!parsed.success) {
		return c.json({ error: 'expected { "path": "/abs/dir", "name": "folder" }' }, 400);
	}
	return parsed.data;
}

/**
 * Home over HTTP, mounted under `/api`: the folder picker, the project list and each card's icon and
 * thumbnail, and what a hand does to a whole project there (open, create, rename, export, import, forget,
 * trash).
 */
export function homeRoutes(deps: {
	resolve: ResolveProject;
	spoolDir: string;
	settings: Pick<ReturnType<typeof createSettingsStore>, "read">;
	/** The home the picker's search indexes, and the registry that marks its projects (#251/#277). */
	fsIndex: { home: string; spoolDir: string };
	/** Projects mid-rename or mid-trash, which every other project change waits out. */
	projectRenames: Set<string>;
	trashingProjects: Set<string>;
	liveTurns: Pick<ReturnType<typeof createAgentTurns>, "of" | "relocate">;
	hub: Pick<ReturnType<typeof createChangeHub>, "forget">;
	selections: Pick<ReturnType<typeof createSelectionStore>, "relocate">;
	machineStateWatch: Pick<ReturnType<typeof watchMachineState>, "acknowledgeRegistry" | "acknowledgeSession">;
	emitAppEvent: (event: AppEvent) => void;
	registeredRoots: () => string[];
	trash: (paths: string[]) => Promise<void>;
	teamSync: Pick<ReturnType<typeof createTeamSync>, "state">;
	iconWatch: Pick<ReturnType<typeof createIconWatch>, "saw">;
	thumbnailWatch: Pick<ReturnType<typeof createThumbnailWatch>, "saw">;
}) {
	const {
		spoolDir,
		settings,
		fsIndex,
		projectRenames,
		trashingProjects,
		liveTurns,
		hub,
		selections,
		machineStateWatch,
		emitAppEvent,
		registeredRoots,
		teamSync,
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
				// no path is the picker opening: the moment to walk home again behind the index that stands (#277)
				if (path === undefined) void refreshIndex(fsIndex);
				return c.json(listing);
			})
			.post("/fs/create", validator("json", requestedNewProject), (c) => {
				try {
					const { path, name } = c.req.valid("json");
					return c.json(createDirectory(path, name));
				} catch (error) {
					if (!(error instanceof SpoolError)) throw error;
					return c.json({ error: error.message }, 409);
				}
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
					const reader = c.req.raw.body?.getReader();
					if (!reader) throw new TransferError("Choose a Spool project file.");
					const cancelUpload = () => {
						void reader.cancel().catch(() => {});
					};
					controller.signal.addEventListener("abort", cancelUpload, { once: true });
					const chunks: Uint8Array[] = [];
					let length = 0;
					try {
						for (;;) {
							controller.signal.throwIfAborted();
							const chunk = await reader.read();
							if (chunk.done) break;
							length += chunk.value.length;
							if (length > TRANSFER_LIMITS.compressedBytes)
								throw new TransferError("The archive exceeds the compressed size limit.");
							chunks.push(chunk.value);
						}
					} finally {
						controller.signal.removeEventListener("abort", cancelUpload);
						await reader.cancel();
					}
					const location = settings.read().entries.find((entry) => entry.key === "projects.location");
					return c.json(
						await importProject(
							Buffer.concat(chunks),
							String(location?.value ?? "~/spool"),
							spoolDir,
							controller.signal,
						),
					);
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
					// nothing found by walk-up: the picker's next move is offering init
					return c.json({ error: error.message, offerInit: true }, 404);
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
			.post("/projects/start", (c) => {
				try {
					const location = settings.read().entries.find((entry) => entry.key === "projects.location");
					const { root } = startProject(String(location?.value ?? "~/spool"), spoolDir);
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
					const target = join(dirname(root), name.trim());
					if (projectRenames.has(root) || projectRenames.has(target))
						return c.json({ error: "Project change is in progress." }, 409);
					if (trashingProjects.has(root)) return c.json({ error: "This project is moving to the trash." }, 409);
					if ([...liveTurns.of(root)].some((turn) => turn.running)) {
						return c.json({ error: "Let the agent finish or stop its turn before renaming this project." }, 409);
					}
					projectRenames.add(root);
					projectRenames.add(target);
					try {
						const result = mutateMachineState(spoolDir, { kind: "rename-project", root, name });
						if (result.root !== root) {
							hub.forget(root);
							liveTurns.relocate(root, result.root);
							selections.relocate(root, result.root);
						}
						machineStateWatch.acknowledgeRegistry(result.registry);
						machineStateWatch.acknowledgeSession(result.session);
						emitAppEvent({ kind: "project-renamed", from: root, root: result.root, name: result.name });
						return c.json({ root: result.root, name: result.name });
					} catch (error) {
						if (!(error instanceof SpoolError)) throw error;
						return c.json({ error: error.message }, 409);
					} finally {
						projectRenames.delete(root);
						projectRenames.delete(target);
					}
				},
			)
			.post("/projects/create", validator("json", requestedNewProject), (c) => {
				try {
					const { path, name } = c.req.valid("json");
					// the "+" (#242): mkdir, then the same scaffold init runs
					const { root } = createProject(path, name, spoolDir);
					return c.json({ root, name: basename(root) });
				} catch (error) {
					if (!(error instanceof SpoolError)) throw error;
					return c.json({ error: error.message }, 409);
				}
			})
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
					const parsed = z.object({ root: z.string().min(1) }).safeParse(value);
					return parsed.success ? parsed.data : c.json({ error: "Expected a project root." }, 400);
				}),
				async (c) => {
					const { root } = c.req.valid("json");
					const roots = registeredRoots();
					if (!roots.includes(root)) return c.json({ error: "This project is no longer registered." }, 404);
					if (projectRenames.has(root)) return c.json({ error: "Project change is in progress." }, 409);
					if (trashingProjects.has(root)) return c.json({ error: "This project is moving to the trash." }, 409);
					if ([...liveTurns.of(root)].some((turn) => turn.running)) {
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
					trashingProjects.add(root);
					let moved = false;
					try {
						if (!lstatSync(root).isDirectory() || realpathSync(root) !== root) {
							return c.json(
								{ error: "The project folder has changed. Open its folder again before trashing it." },
								409,
							);
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
									: `Could not trash the project: ${detail}`,
							},
							409,
						);
					} finally {
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
						const paused = link === undefined ? null : teamSync.state(project.root).paused;
						const goneLocal = link === undefined ? undefined : goneLocalWith(project.root);
						const [summary, icon, thumbnail, inRepo] = await Promise.all([
							summarizeProject(project.root),
							findProjectIcon(project.root),
							findProjectThumbnail(project.root),
							link === undefined ? false : checkoutOf(project.root).then((found) => found !== undefined),
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
