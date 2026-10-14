import { Hono } from "hono";
import { validator } from "hono/validator";
import { isFramePath } from "../page-path";
import { parseOrder, readOrder, storedOrder, writeOrder } from "./canvas-order";
import { parsePlaces, writePlaces } from "./canvas-places";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import type { createChangeHub } from "./events";
import { type createFlowGraph, recordWalk } from "./flows";
import { type Geometry, parseGeometry, sidecarFileIn, writeGeometry } from "./geometry";
import { locateInDesign } from "./locate";
import { answeringDiskRefusals, type ResolveProject, withProject } from "./project-route";
import { parseCanvasState, readCanvasState, writeCanvasState } from "./project-state";
import { frameDirectories, frameExists, listProjectFramesAwaited, lookupFrame } from "./projection";
import type { createResolvePass } from "./resolve-pass";
import { markSeen } from "./seen";
import { type createSelectionStore, parseSelectionPut } from "./selection";

/**
 * One project's canvas over HTTP, mounted under `/api/p`: its frames, the arrangement a hand made of them
 * (camera, order, places, geometry), the flow map, what has been looked at, and what is selected.
 */
export function canvasRoutes(deps: {
	resolve: ResolveProject;
	/** A frame read with no cover: the booth owes it a picture. */
	owePicture: (root: string, project: string, frame: string) => void;
	flowGraph: Pick<ReturnType<typeof createFlowGraph>, "flows">;
	resolvePass: Pick<ReturnType<typeof createResolvePass>, "run">;
	/** This daemon's own origin once it is really listening, which the resolve pass dials. */
	origin: () => string | undefined;
	hub: Pick<ReturnType<typeof createChangeHub>, "publish">;
	selections: Pick<ReturnType<typeof createSelectionStore>, "get" | "set">;
}) {
	return (
		new Hono()
			.get("/:project/frames", (c) => {
				const name = c.req.param("project");
				return withProject(c, deps.resolve, async (root) => {
					try {
						const projection = await listProjectFramesAwaited(root, { seen: true });
						return c.json({
							...projection,
							frames: projection.frames.map((frame) => {
								// This read is the moment a canvas learns a frame has no cover
								// to show, and a frame with none renders its placeholder and
								// asks for nothing (#111). So its picture is owed from here
								// rather than waiting for a request that will never come.
								if (frame.cover === undefined) deps.owePicture(root, name, frame.name);
								return frame;
							}),
						});
					} catch (error) {
						if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
						throw error;
					}
				});
			})
			.get("/:project/state", (c) =>
				withProject(c, deps.resolve, (root) => {
					return c.json(readCanvasState(root));
				}),
			)
			.put(
				"/:project/state",
				validator("json", (value, c) => {
					const state = parseCanvasState(value);
					if (state === undefined) {
						return c.text(
							"canvas state must be an object without mode; supported fields are camera, arrows, activePage, and pageCameras",
							400,
						);
					}
					return state;
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						try {
							writeCanvasState(root, c.req.valid("json"));
						} catch (error) {
							if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
							throw error;
						}
						return c.body(null, 204);
					}),
			)
			/*
			 * Manual order (#228), beside the camera because both are arrangement —
			 * and in a different file, because this one is the canvas rather than
			 * this machine's view of it: canvas.json is committed and cloned where
			 * .spool/ is per-machine ephemera.
			 *
			 * What is stored is advisory. A name in it can be stale, can name a
			 * frame that has since moved page, and can be missing one born a second
			 * ago, so a PUT is never refused for naming a frame the projection does
			 * not have and a read never rewrites the file to agree — the client
			 * merges the two, and cleaning here would drop the place a frame an
			 * agent is halfway through writing is about to come back to.
			 */
			.get("/:project/order", (c) =>
				withProject(c, deps.resolve, (root) => {
					// the document rather than the daemon's reading of it: a flat project's
					// pages are the bare list they have always been (#231)
					const order = answeringDiskRefusals(c, () => storedOrder(readOrder(root)));
					if ("response" in order) return order.response;
					return c.json(order.value);
				}),
			)
			.put(
				"/:project/order",
				validator("json", (value, c) => {
					const order = parseOrder(value);
					if (order === undefined) {
						return c.text(
							'order must be { "pages": [page, ...] or { "<page>": [page, ...] }, "frames": { "<page>": [frame, ...] } }',
							400,
						);
					}
					return order;
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						const written = answeringDiskRefusals(c, () => writeOrder(root, c.req.valid("json")));
						if ("response" in written) return written.response;
						return c.body(null, 204);
					}),
			)
			/**
			 * Where each page stands on the field holding it (#265).
			 *
			 * The second thing about this canvas a hand arranged, and it goes in the
			 * same committed file for the same reason. There is no GET beside this
			 * one: a page's place arrives on the projection, already completed for
			 * every page that had none, so a second read would only be able to say
			 * less.
			 */
			.put(
				"/:project/places",
				validator("json", (value, c) => {
					const places = parsePlaces(value);
					if (places === undefined) {
						return c.text('places must be { "<page>": { "x": number, "y": number } }', 400);
					}
					return places;
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						const written = answeringDiskRefusals(c, () => writePlaces(root, c.req.valid("json")));
						if ("response" in written) return written.response;
						return c.body(null, 204);
					}),
			)
			.get("/:project/flows", async (c) =>
				withProject(c, deps.resolve, async (root) => {
					return c.json(await deps.flowGraph.flows(root));
				}),
			)
			.post("/:project/flows/resolve", async (c) =>
				withProject(c, deps.resolve, async (root) => {
					// the pass dials this daemon: before the server binds there is no
					// origin to render from, and in-process app.request() never binds one
					const origin = deps.origin();
					if (origin === undefined) return c.json({ skipped: 0, read: 0, unavailable: 0, ran: false });
					const listing = await listProjectFramesAwaited(root);
					const frames = listing.frames.map((frame) => ({ name: frame.name, width: frame.w, height: frame.h }));
					try {
						const result = await deps.resolvePass.run({
							root,
							project: c.req.param("project"),
							origin,
							frames,
						});
						return c.json({ ...result, ran: true });
					} catch (error) {
						if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
						throw error;
					}
				}),
			)
			.post(
				"/:project/walked",
				validator("json", (value, c) => {
					const { from, to } = (value ?? {}) as { from?: unknown; to?: unknown };
					if (typeof from !== "string" || !isFramePath(from) || typeof to !== "string" || !isFramePath(to)) {
						return c.text('a walk is { "from": "<frame>", "to": "<frame>" }', 400);
					}
					return { from, to };
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						const { from, to } = c.req.valid("json");
						// only witness walks between frames that really exist — a session
						// racing a delete records nothing
						for (const frame of [from, to]) {
							if (!frameExists(root, frame)) {
								return c.text(`no frame "${frame}" to walk`, 404);
							}
						}
						// a mark that records moves the flows payload; a discarded walk is
						// silent — the map never claims more than source (#34)
						try {
							if (recordWalk(root, from, to)) deps.hub.publish(root, { kind: "walked" });
						} catch (error) {
							if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
							throw error;
						}
						return c.body(null, 204);
					}),
			)
			/**
			 * These frames have been looked at (seen.ts). The canvas says so when a
			 * frame has held enough of the viewport long enough to have been read, and
			 * when one is pressed. Names the project does not hold are ignored rather
			 * than refused: a browser one beat behind a delete is not an error.
			 */
			.post(
				"/:project/seen",
				validator("json", (value, c) => {
					const { frames } = (value ?? {}) as { frames?: unknown };
					if (!Array.isArray(frames) || frames.some((name) => typeof name !== "string" || !isFramePath(name))) {
						return c.text('seen is { "frames": ["<frame>", ...] }', 400);
					}
					return { frames: frames as string[] };
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						try {
							const dirs = frameDirectories(root);
							markSeen(
								root,
								[...dirs].map(([name, dir]) => ({ name, dir })),
								c.req.valid("json").frames,
							);
						} catch (error) {
							if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
							throw error;
						}
						return c.body(null, 204);
					}),
			)
			.post(
				"/:project/locate",
				validator("json", (value, c) => {
					const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
					const { path, find } = body;
					if (typeof path !== "string" || path === "")
						return c.text('locate must be { "path", "find": [...] }', 400);
					if (!Array.isArray(find) || !find.every((one): one is string => typeof one === "string")) {
						return c.text('locate must be { "path", "find": [...] }', 400);
					}
					return { path, find };
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						// where one write landed (#214): the canvas has the strings the edit was made
						// of and only this side owns the file, so the line range comes from here
						const { path, find } = c.req.valid("json");
						// nothing found is an answer rather than an error: a file the agent has
						// already moved on from is the ordinary case, and it costs a mark, not a turn
						return c.json({ range: locateInDesign(root, path, find) ?? null });
					}),
			)
			.get("/:project/selection", (c) =>
				withProject(c, deps.resolve, (root) => {
					return c.json({ selection: deps.selections.get(root) });
				}),
			)
			.put(
				"/:project/selection",
				validator("json", (value, c) => {
					const put = parseSelectionPut(value);
					if (put === undefined) {
						return c.text('selection must be { "frames": [name, ...] } or { "element": { ... } }', 400);
					}
					return put;
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						deps.selections.set(root, c.req.valid("json"));
						// the enriched list comes straight back, because the composer's chips are
						// the promise of what the prompt will carry and only this side knows the
						// paths, the sizes, the line ranges and the excerpts (#116)
						return c.json({ selection: deps.selections.get(root) });
					}),
			)
			.put(
				"/:project/geometry",
				validator("json", (value, c) => {
					const frames =
						typeof value === "object" && value !== null ? (value as { frames?: unknown }).frames : undefined;
					if (typeof frames !== "object" || frames === null || Array.isArray(frames)) {
						return c.text('geometry must be { "frames": { "<name>": { x, y, w, h } } }', 400);
					}
					const parsed: Record<string, Geometry> = {};
					for (const [name, raw] of Object.entries(frames)) {
						const geometry = parseGeometry(raw);
						if (!isFramePath(name) || geometry === undefined || geometry.w <= 0 || geometry.h <= 0) {
							return c.text(`not a placeable geometry for "${name}"`, 400);
						}
						parsed[name] = geometry;
					}
					return { frames: parsed };
				}),
				(c) =>
					withProject(c, deps.resolve, (root) => {
						const { frames } = c.req.valid("json");
						// all-or-nothing: every frame resolved before the first sidecar write
						const sidecars = new Map<string, string>();
						const designDir = realDesignDir(root);
						try {
							for (const name of Object.keys(frames)) {
								const found = lookupFrame(root, name);
								if (found.kind !== "found") return c.text(`no frame "${name}" to place`, 404);
								sidecars.set(name, resolveDesignPath(designDir, sidecarFileIn(found.dir)));
							}
						} catch (error) {
							if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
							throw error;
						}
						for (const [name, geometry] of Object.entries(frames)) {
							const sidecar = sidecars.get(name);
							if (sidecar === undefined) continue;
							writeGeometry(sidecar, geometry, designDir);
							deps.hub.publish(root, { kind: "geometry", frame: name });
						}
						return c.body(null, 204);
					}),
			)
	);
}
