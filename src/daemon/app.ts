import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import { basename, isAbsolute, join, normalize, sep } from "node:path";
import type { Duplex } from "node:stream";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { validator } from "hono/validator";
import trash from "trash";
import { z } from "zod";
import { SPOOL_DEVELOPMENT_FAVICON_SVG, SPOOL_FAVICON_SVG } from "../brand";
import { SpoolError } from "../errors";
import { initProject } from "../init";
import { openProject } from "../open";
import { lookupProjectByName, readRegistry } from "../registry";
import { gridToSvg } from "../term/still";
import { requestUpgrade } from "../upgrade";
import { stampLabels } from "./call-site";
import { createFrameCompiler } from "./compile";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { errorDocument, escapeHtml, escapeInlineScript, escapeJsonScript } from "./document";
import { createChangeHub } from "./events";
import { deriveFlows, recordWalk } from "./flows";
import { listDirectory } from "./fs-list";
import { type Geometry, parseGeometry, sidecarFileIn, writeGeometry } from "./geometry";
import { createGoReader } from "./go-reader";
import { assemblePlayerDocument, chromeFontFile, createPlayerCompiler, playerEtag } from "./play";
import { isSafeName, type ProjectJson, readFixture, readScenario } from "./project-files";
import { parseCanvasState, readCanvasState, writeCanvasState } from "./project-state";
import {
	frameGeometry,
	listProjectFrames,
	lookupFrame,
	type ProjectCard,
	projectedKind,
	summarizeProject,
} from "./projection";
import { createResolvePass } from "./resolve-pass";
import {
	CONTROL_HEADER,
	createCapability,
	matchesCapability,
	normalizeHostname,
	PROJECT_HEADER,
	RENDER_HOST,
	renderOriginFor,
} from "./security";
import { createSelectionStore, parseSelectionPut } from "./selection";
import { type AppEvent, readSession, watchRegistry, writeSession } from "./session";
import { createShotTaker } from "./shots";
import type { TermExecutor } from "./term-exec";
import { termFontDataCss, termFontFile } from "./term-fonts";
import { createTermSessions } from "./term-sessions";
import { createThumbHealer, readThumb, UnknownThumbFormatError, writeThumb } from "./thumbs";
import { readUiAsset, readUiIndex, UI_MISSING_NOTICE } from "./ui";
import { createUpdateChecker } from "./update-check";
import {
	reactVersion,
	type VendorModule,
	vendorReactJs,
	vendorSpoolJs,
	vendorSpoolJsxJs,
	vendorSpoolTermJs,
} from "./vendor";

export interface DaemonOptions {
	spoolDir: string;
	version: string;
	/** Exact control virtual host. Tests use localhost; the bound daemon passes its configured loopback host. */
	controlHost?: string | undefined;
	/** Injectable only for deterministic seam tests. Production always generates one. */
	controlToken?: string | undefined;
	/** dist/ui — absent in seam tests and unbuilt checkouts. */
	uiDir?: string | undefined;
	/** The checkout daemon keeps its browser identity distinct from the release. */
	development?: boolean | undefined;
	/** The OS Trash (#7: spool never manages it) — swapped out by seam tests. */
	moveToTrash?: (paths: string[]) => Promise<void>;
	/** Editor launch for path:line jumps — swapped out by seam tests. */
	launchEditor?: (target: string) => void;
	/** #30 phone-home: on only when `spool serve` resolves it on from config. */
	updateCheck?: boolean | undefined;
	/** The registry probe — swapped out by seam tests. */
	fetchLatest?: () => Promise<string | undefined>;
	/** The toast door's detached `spool upgrade` spawn — swapped out by seam tests. */
	upgrade?: () => { ok: true } | { ok: false; error: string };
	/** Retained seam for dormant session tests; public daemon routes never invoke it. */
	termExecutor?: TermExecutor;
}

/** The player's params (#24): Zod-validated, path-safe names only. */
const playParams = z.object({
	frame: z.string().refine(isSafeName, { message: "not a frame name" }).optional(),
	scenario: z.string().refine(isSafeName, { message: "not a scenario name" }).optional(),
});

type LaunchEditor = (file: string, onError?: (fileName: string, message: string | null) => void) => void;

/** launch-editor is CJS `export =` — createRequire keeps the types honest. */
const launchEditorDefault = createRequire(import.meta.url)("launch-editor") as LaunchEditor;

const disabledTermExecutor: TermExecutor = async () => {
	throw new SpoolError("terminal execution is disabled until it can run in an OS sandbox");
};

/**
 * The daemon's Hono app, the primary seam: everything observable rides
 * app.request(), no port needed. The inferred AppType is the compile-time
 * tripwire between daemon and UI once the canvas exists.
 */
export function createDaemonApp({
	spoolDir,
	version,
	controlHost,
	controlToken: providedControlToken,
	uiDir,
	development,
	moveToTrash,
	launchEditor,
	updateCheck,
	fetchLatest,
	upgrade,
	termExecutor,
}: DaemonOptions) {
	const controlToken = providedControlToken ?? createCapability();
	const controlHostname = normalizeHostname(controlHost ?? "localhost");
	let controlOrigin = `http://${controlHostname.includes(":") ? `[${controlHostname}]` : controlHostname}`;
	let renderOrigin = renderOriginFor(controlOrigin);
	const projectCapabilities = new Map<string, string>();

	function projectCapability(root: string): string {
		let capability = projectCapabilities.get(root);
		if (capability === undefined) {
			capability = createCapability();
			projectCapabilities.set(root, capability);
		}
		return capability;
	}

	const startedAt = new Date().toISOString();
	const compiler = createFrameCompiler(version);
	const playerCompiler = createPlayerCompiler(version);
	const hub = createChangeHub();
	// what Liam points at, per project — daemon memory only, dies with it (#3)
	const selections = createSelectionStore();
	const trashImpl = moveToTrash ?? (async (paths: string[]) => void (await trash(paths)));
	const editorImpl =
		launchEditor ??
		((target: string) =>
			launchEditorDefault(target, (fileName, message) =>
				console.error(`spool: could not open an editor on ${fileName}${message === null ? "" : ` — ${message}`}`),
			));

	const frameAuthority = (root: string) => ({
		projectCapability: projectCapability(root),
	});

	// the app-level channel: registry and session changes, fanned to every page
	const appListeners = new Set<(event: AppEvent) => void>();
	const emitAppEvent = (event: AppEvent) => {
		for (const listener of appListeners) listener(event);
	};
	const stopRegistryWatch = watchRegistry(spoolDir, emitAppEvent);

	// #30: the daily registry ask — constructed idle, started only by a
	// really-listening daemon whose owner has not opted out; a check that
	// learns of a newer release tells every connected page over app SSE
	const upgradeImpl = upgrade ?? (() => requestUpgrade(spoolDir));
	const updateChecker = createUpdateChecker({
		spoolDir,
		version,
		...(fetchLatest === undefined ? {} : { fetchLatest }),
		onUpdate: (latest) => emitAppEvent({ kind: "update", latest }),
	});
	const updateAvailable = () => (updateCheck === true ? updateChecker.available() : undefined);

	// the healer needs a dialable origin, which exists only once the server has
	// bound — in-process app.request() never activates it
	let selfOrigin: string | undefined;
	const shots = createShotTaker();
	const healer = createThumbHealer({
		capture: (target) => shots.capture(target),
		stored: (root, frame) => hub.publish(root, { kind: "thumb", frame }),
	});
	const goReader = createGoReader();
	const resolvePass = createResolvePass({
		read: (target) => goReader.read(target),
		moved: (root) => hub.publish(root, { kind: "walked" }),
		now: () => new Date().toISOString(),
	});

	// Persisted terminal grids remain readable, but the default executor is a
	// hard stop until project processes can run inside an OS sandbox.
	const terms = createTermSessions({
		executor: termExecutor ?? disabledTermExecutor,
		publish: (root, frame) => hub.publish(root, { kind: "thumb", frame }),
	});

	function resolveProject(c: Context, name: string): { root: string } | { response: Response } {
		const lookup = lookupProjectByName(spoolDir, name);
		if (lookup.kind === "unknown") {
			return { response: c.text(`unknown project "${name}" — run \`spool open\` in its product root first`, 404) };
		}
		if (lookup.kind === "ambiguous") {
			if (!c.req.path.startsWith("/api/")) {
				return { response: c.text(`"${name}" names multiple registered projects`, 409) };
			}
			return {
				response: c.text(
					`"${name}" names ${lookup.roots.length} registered projects:\n${lookup.roots.join("\n")}`,
					409,
				),
			};
		}
		return { root: lookup.root };
	}

	/** Body of the picker's POSTs: { path } — anything else is a 400. */
	function requestedPath(value: unknown, c: Context): { path: string } | Response {
		const path = (value as { path?: unknown }).path;
		if (typeof path !== "string" || path === "") {
			return c.json({ error: 'expected { "path": "/abs/dir" }' }, 400);
		}
		return { path };
	}

	type HostClass = "control" | "render" | "unexpected";

	function hostClass(url: string): HostClass {
		const hostname = normalizeHostname(new URL(url).hostname);
		if (hostname === controlHostname) return "control";
		if (hostname === RENDER_HOST) return "render";
		return "unexpected";
	}

	function isProjectDataPath(path: string): boolean {
		return /^\/api\/p\/[^/]+\/(?:scenarios\/[^/]+|fixtures\/.+)$/.test(path);
	}

	function isExecutableRenderPath(path: string): boolean {
		return /^\/p\/[^/]+\/frames\/[^/]+$/.test(path) || path.startsWith("/play/");
	}

	function isRenderOnlyPath(path: string): boolean {
		return /^\/p\/[^/]+\/frames\/[^/]+$/.test(path) || path.startsWith("/vendor/") || isProjectDataPath(path);
	}

	function normalizedOrigin(value: string): string | undefined {
		try {
			return new URL(value).origin;
		} catch {
			return undefined;
		}
	}

	function registeredCapabilityRoot(capability: string | undefined): string | undefined {
		if (capability === undefined) return undefined;
		const registered = new Set(readRegistry(spoolDir).projects.map((project) => project.root));
		for (const [root, expected] of projectCapabilities) {
			if (registered.has(root) && matchesCapability(expected, capability)) return root;
		}
		return undefined;
	}

	function resolveProjectData(c: Context): { root: string } | { response: Response } {
		const origin = c.req.header("origin");
		if (origin !== "null") return { response: c.text("forbidden", 403) };
		const supplied = c.req.header(PROJECT_HEADER);
		const root = registeredCapabilityRoot(supplied);
		if (root === undefined) return { response: c.text("unauthenticated", 401) };
		if (basename(root) !== c.req.param("project")) return { response: c.text("forbidden", 403) };
		c.header("access-control-allow-origin", "null");
		return { root };
	}

	// scenario and fixture reads land in null-origin sandboxed frames. Their
	// capability, not a wildcard origin, selects the one root they may read.
	function serveProjectJson(c: Context, result: ProjectJson): Response {
		// The same display-name URL can select different registered roots by
		// capability. Never let an HTTP cache collapse those authorities.
		c.header("cache-control", "no-store");
		c.header("vary", "Origin, X-Spool-Project");
		if (result.kind === "missing") return c.text(result.message, 404);
		if (result.kind === "invalid") return c.text(result.message, 500);
		c.header("content-type", "application/json; charset=utf-8");
		return c.body(result.json);
	}

	const app = new Hono()
		.use("*", async (c, next) => {
			const host = hostClass(c.req.url);
			if (host === "unexpected") return c.text("unexpected host", 421);
			const path = c.req.path;
			if (host === "render") {
				const allowed = isRenderOnlyPath(path) || path.startsWith("/play/") || path === "/favicon.svg";
				if (!allowed) return c.text("not found", 404);
				// A direct render URL must retain the opaque-origin law that its
				// canvas and Play wrappers impose. This also keeps capabilities
				// in one document unreadable to another project on the shared host.
				if (isExecutableRenderPath(path)) c.header("content-security-policy", "sandbox allow-scripts");
				await next();
				return;
			}
			if (isRenderOnlyPath(path)) return c.text("not found", 404);
			if (!path.startsWith("/api/") || path === "/api/health") {
				await next();
				return;
			}
			if (c.req.method === "OPTIONS") return c.text("forbidden", 403);
			if (!matchesCapability(controlToken, c.req.header(CONTROL_HEADER))) {
				return c.text("unauthenticated", 401);
			}
			const origin = c.req.header("origin");
			if (origin !== undefined && normalizedOrigin(origin) !== controlOrigin) {
				return c.text("forbidden", 403);
			}
			await next();
		})
		.get("/api/health", (c) => c.json({ name: "spool", version, pid: process.pid, startedAt }))
		.post("/api/upgrade", (c) => {
			// the toast door (#30): spawn the one orchestrator detached and stand
			// back — the SSE drop and the version flip tell the rest of the story
			const outcome = upgradeImpl();
			if (!outcome.ok) return c.json({ error: outcome.error }, 409);
			return c.json({ started: true }, 202);
		})
		.get("/api/session", (c) => c.json(readSession(spoolDir)))
		.put(
			"/api/session",
			validator("json", (value, c) => {
				const open = (value as { open?: unknown }).open;
				if (!Array.isArray(open) || !open.every((root): root is string => typeof root === "string")) {
					return c.text('session must be { "open": [root, ...] }', 400);
				}
				const registered = new Set(readRegistry(spoolDir).projects.map((project) => project.root));
				const rogue = open.find((root) => !registered.has(root));
				if (rogue !== undefined) return c.text(`not a registered project root: ${rogue}`, 400);
				return { open };
			}),
			(c) => {
				writeSession(spoolDir, { open: [...new Set(c.req.valid("json").open)] });
				emitAppEvent({ kind: "session" });
				return c.body(null, 204);
			},
		)
		.get("/api/events", (c) => {
			return streamSSE(c, async (stream) => {
				let id = 0;
				// subscribed before the first write: an event emitted while hello is
				// still in flight is delivered, never dropped into the handshake gap
				const listener = (event: AppEvent) => {
					void stream.writeSSE({ event: "app", data: JSON.stringify(event), id: String(id++) }).catch(() => {});
				};
				appListeners.add(listener);
				stream.onAbort(() => {
					appListeners.delete(listener);
				});
				// hello carries the daemon's version — the reconnect after an upgrade
				// answers a different one, and the page reloads itself on it (#30)
				await stream.writeSSE({
					event: "hello",
					data: JSON.stringify({ name: "spool", version, latest: updateAvailable() ?? null }),
					id: String(id++),
				});
				await new Promise<void>((resolve) => stream.onAbort(resolve));
			});
		})
		.get("/api/fs/list", (c) => {
			const listing = listDirectory(c.req.query("path"));
			if (listing === undefined) return c.json({ error: "no such directory" }, 404);
			return c.json(listing);
		})
		.post("/api/projects/open", validator("json", requestedPath), (c) => {
			try {
				const { root } = openProject(c.req.valid("json").path, spoolDir);
				return c.json({ root, name: basename(root) });
			} catch (error) {
				if (!(error instanceof SpoolError)) throw error;
				// nothing found by walk-up: the picker's next move is offering init
				return c.json({ error: error.message, offerInit: true }, 404);
			}
		})
		.post("/api/projects/init", validator("json", requestedPath), (c) => {
			try {
				const { root } = initProject(c.req.valid("json").path, spoolDir);
				return c.json({ root, name: basename(root) });
			} catch (error) {
				if (!(error instanceof SpoolError)) throw error;
				return c.json({ error: error.message }, 409);
			}
		})
		.get("/api/projects", (c) => {
			const projects: ProjectCard[] = readRegistry(spoolDir)
				.projects.map((project) => ({
					name: basename(project.root),
					root: project.root,
					openedAt: project.openedAt,
					...summarizeProject(project.root),
				}))
				.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
			return c.json({ projects });
		})
		.get("/api/p/:project/frames", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			try {
				const projection = listProjectFrames(project.root);
				return c.json({
					...projection,
					frames: projection.frames.map((frame) => {
						if (frame.kind !== "term") return frame;
						const terminalCover = terms.cover(project.root, frame.name);
						return {
							...frame,
							hasThumb: terminalCover.kind === "current",
							terminalCover,
						};
					}),
				});
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				throw error;
			}
		})
		.get("/api/p/:project/thumbs/:frame", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			if (!isSafeName(frame)) return c.text(`not a frame name: "${frame}"`, 404);
			const kind = projectedKind(project.root, frame);
			if (kind === "term") {
				// Terminal stills rasterize from a persisted grid in the pinned
				// font. Reading that store never starts project code.
				let screen: Awaited<ReturnType<typeof terms.screen>>;
				try {
					screen = await terms.screen(project.root, frame);
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				if (screen.kind !== "current") {
					return c.text(screen.message, screen.kind === "stale" ? 409 : 404);
				}
				const svg = gridToSvg(screen.grid, termFontDataCss());
				const etag = `"term-still-${createHash("sha256").update(svg).digest("hex").slice(0, 32)}"`;
				// covers are the canvas's bulk traffic: let the browser hold them and
				// revalidate, so an unchanged still costs a 304 instead of its bytes.
				// Revalidation re-runs the control check, so a cache can never serve
				// a cover the caller is no longer entitled to.
				c.header("cache-control", "no-cache");
				if (c.req.header("if-none-match") === etag) return c.body(null, 304);
				c.header("etag", etag);
				c.header("content-type", "image/svg+xml; charset=utf-8");
				return c.body(svg);
			}
			const thumb = readThumb(project.root, frame);
			if (thumb === undefined) {
				// a missing cover heals itself: enqueue the Playwright fallback and
				// let the thumb event tell the canvas to look again
				if (selfOrigin !== undefined && kind === "html") {
					const name = c.req.param("project");
					const { w, h } = frameGeometry(project.root, frame);
					healer.request({
						root: project.root,
						frame,
						url: `${selfOrigin}/p/${encodeURIComponent(name)}/frames/${encodeURIComponent(frame)}`,
						width: w,
						height: h,
					});
				}
				return c.text(`no thumbnail for "${frame}"`, 404);
			}
			c.header("cache-control", "no-cache");
			if (c.req.header("if-none-match") === thumb.etag) return c.body(null, 304);
			c.header("etag", thumb.etag);
			c.header("content-type", thumb.type);
			return c.body(new Uint8Array(thumb.bytes));
		})
		.get("/api/p/:project/state", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json(readCanvasState(project.root));
		})
		.put(
			"/api/p/:project/state",
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
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				try {
					writeCanvasState(project.root, c.req.valid("json"));
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				return c.body(null, 204);
			},
		)
		.get("/api/p/:project/flows", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json(deriveFlows(project.root));
		})
		.post("/api/p/:project/flows/resolve", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			// the pass dials this daemon: before the server binds there is no
			// origin to render from, and in-process app.request() never binds one
			if (selfOrigin === undefined) return c.json({ skipped: 0, read: 0, unavailable: 0, ran: false });
			const listing = listProjectFrames(project.root);
			const frames = listing.frames
				.filter((frame) => frame.kind === "html")
				.map((frame) => ({ name: frame.name, width: frame.w, height: frame.h }));
			try {
				const result = await resolvePass.run({
					root: project.root,
					project: c.req.param("project"),
					origin: selfOrigin,
					frames,
				});
				return c.json({ ...result, ran: true });
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				throw error;
			}
		})
		.post(
			"/api/p/:project/walked",
			validator("json", (value, c) => {
				const { from, to } = (value ?? {}) as { from?: unknown; to?: unknown };
				if (typeof from !== "string" || !isSafeName(from) || typeof to !== "string" || !isSafeName(to)) {
					return c.text('a walk is { "from": "<frame>", "to": "<frame>" }', 400);
				}
				return { from, to };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { from, to } = c.req.valid("json");
				// only witness walks between frames that really exist — a session
				// racing a delete records nothing
				for (const frame of [from, to]) {
					if (projectedKind(project.root, frame) === undefined) {
						return c.text(`no frame "${frame}" to walk`, 404);
					}
				}
				// a mark that records moves the flows payload; a discarded walk is
				// silent — the map never claims more than source (#34)
				try {
					if (recordWalk(project.root, from, to)) hub.publish(project.root, { kind: "walked" });
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				return c.body(null, 204);
			},
		)
		.post("/api/p/:project/term/:frame/restart", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			if (!isSafeName(frame) || projectedKind(project.root, frame) !== "term") {
				return c.text(`no terminal frame "${frame}" to restart`, 404);
			}
			return c.text("terminal execution is disabled until it can run in an OS sandbox", 409);
		})
		.get("/api/p/:project/verify/:frame", async (c) => {
			// the agent's compile probe (#25): shot and logs branch on this JSON —
			// ok hands the closure etag (the log cache key), error the text verbatim
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			const doc = await compiler.getDocument(project.root, frame, frameAuthority(project.root));
			if (doc.kind === "missing") return c.json({ kind: "missing", message: doc.message }, 404);
			if (doc.kind === "error") return c.json({ kind: "error", message: doc.message }, 500);
			return c.json({ kind: "ok", etag: doc.etag });
		})
		.get("/api/p/:project/selection", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json({ selection: selections.get(project.root) });
		})
		.put(
			"/api/p/:project/selection",
			validator("json", (value, c) => {
				const put = parseSelectionPut(value);
				if (put === undefined) {
					return c.text('selection must be { "frames": [name, ...] } or { "element": { ... } }', 400);
				}
				return put;
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				selections.set(project.root, c.req.valid("json"));
				return c.body(null, 204);
			},
		)
		.put(
			"/api/p/:project/geometry",
			validator("json", (value, c) => {
				const frames =
					typeof value === "object" && value !== null ? (value as { frames?: unknown }).frames : undefined;
				if (typeof frames !== "object" || frames === null || Array.isArray(frames)) {
					return c.text('geometry must be { "frames": { "<name>": { x, y, w, h } } }', 400);
				}
				const parsed: Record<string, Geometry> = {};
				for (const [name, raw] of Object.entries(frames)) {
					const geometry = parseGeometry(raw);
					if (!isSafeName(name) || geometry === undefined || geometry.w <= 0 || geometry.h <= 0) {
						return c.text(`not a placeable geometry for "${name}"`, 400);
					}
					parsed[name] = geometry;
				}
				return { frames: parsed };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { frames } = c.req.valid("json");
				// all-or-nothing: every frame resolved before the first sidecar write
				const sidecars = new Map<string, string>();
				const designDir = realDesignDir(project.root);
				try {
					for (const name of Object.keys(frames)) {
						const found = lookupFrame(project.root, name);
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
					hub.publish(project.root, { kind: "geometry", frame: name });
				}
				return c.body(null, 204);
			},
		)
		.post(
			"/api/p/:project/trash",
			validator("json", (value, c) => {
				const frames =
					typeof value === "object" && value !== null ? (value as { frames?: unknown }).frames : undefined;
				if (
					!Array.isArray(frames) ||
					frames.length === 0 ||
					!frames.every((name): name is string => typeof name === "string")
				) {
					return c.text('trash must be { "frames": [name, ...] }', 400);
				}
				return { frames };
			}),
			async (c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const dirs: string[] = [];
				try {
					const designDir = realDesignDir(project.root);
					for (const name of c.req.valid("json").frames) {
						if (!isSafeName(name)) return c.text(`not a frame name: "${name}"`, 400);
						const found = lookupFrame(project.root, name);
						if (found.kind !== "found") return c.text(`no frame "${name}" to trash`, 404);
						dirs.push(resolveDesignPath(designDir, found.dir));
					}
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				// the whole folder moves; the OS Trash owns restore from here (#7)
				await trashImpl(dirs);
				return c.body(null, 204);
			},
		)
		.post(
			"/api/p/:project/stamp-labels",
			validator("json", (value, c) => {
				const stamps =
					typeof value === "object" && value !== null ? (value as { stamps?: unknown }).stamps : undefined;
				if (
					!Array.isArray(stamps) ||
					stamps.length > 256 ||
					!stamps.every((stamp): stamp is string => typeof stamp === "string")
				) {
					return c.text('stamp-labels must be { "stamps": ["frames/…:line:col", ...] }, at most 256', 400);
				}
				return { stamps };
			}),
			(c) => {
				// the rail's call-site rows (#58): each stamp's repeating call, or null
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				return c.json({ labels: stampLabels(project.root, c.req.valid("json").stamps) });
			},
		)
		.post(
			"/api/p/:project/editor",
			validator("json", (value, c) => {
				if (typeof value !== "object" || value === null) {
					return c.text('editor must be { "path": "design/…", "line"?: n }', 400);
				}
				const { path, line } = value as { path?: unknown; line?: unknown };
				if (typeof path !== "string" || path === "") {
					return c.text('editor must be { "path": "design/…", "line"?: n }', 400);
				}
				if (line !== undefined && (typeof line !== "number" || !Number.isInteger(line) || line < 1)) {
					return c.text("line must be a positive integer", 400);
				}
				return line === undefined ? { path } : { path, line };
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { path, line } = c.req.valid("json");
				const rel = normalize(path.replaceAll("\\", "/"));
				// only design/ files are spool's to open, and never through ..
				if (isAbsolute(rel) || rel.split(sep)[0] !== "design") {
					return c.text(`not a design/ path: "${path}"`, 400);
				}
				let target: string;
				try {
					const designDir = realDesignDir(project.root);
					target = resolveDesignPath(designDir, join(designDir, ...rel.split(sep).slice(1)), path);
				} catch (error) {
					if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
					throw error;
				}
				if (!existsSync(target)) return c.text(`no file at "${path}"`, 404);
				editorImpl(line === undefined ? target : `${target}:${line}`);
				return c.body(null, 204);
			},
		)
		.put("/api/p/:project/thumbs/:frame", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			// captures are only accepted for frames that exist — never a write for a ghost
			const kind = isSafeName(frame) ? projectedKind(project.root, frame) : undefined;
			if (kind === undefined) return c.text(`no frame "${frame}" to cover`, 404);
			// a terminal's still is the daemon's grid, never a DOM capture
			if (kind === "term") {
				return c.text(`"${frame}" is a terminal frame — its stills rasterize from the grid`, 400);
			}
			const cover = Buffer.from(await c.req.arrayBuffer());
			if (cover.byteLength === 0) return c.text("empty capture", 400);
			try {
				writeThumb(project.root, frame, cover);
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				if (error instanceof UnknownThumbFormatError) return c.text(error.message, 400);
				throw error;
			}
			hub.publish(project.root, { kind: "thumb", frame });
			return c.body(null, 204);
		})
		.get("/p/:project/frames/:frame", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			const doc = await compiler.getDocument(project.root, frame, frameAuthority(project.root));
			if (doc.kind === "missing") return c.text(doc.message, 404);
			if (doc.kind === "error") return c.html(doc.document, 500);
			if (c.req.header("if-none-match") === doc.etag) return c.body(null, 304);
			c.header("etag", doc.etag);
			c.header("x-spool-cache", doc.cache);
			return c.html(doc.document);
		})
		.get(
			"/play/:project",
			validator("query", (value, c) => {
				const parsed = playParams.safeParse(value);
				if (!parsed.success) {
					const issues = parsed.error.issues
						.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
						.join("; ");
					return c.text(`not a playable request — ${issues}`, 400);
				}
				return parsed.data;
			}),
			async (c) => {
				const name = c.req.param("project");
				const project = resolveProject(c, name);
				if ("response" in project) return project.response;
				const { frame, scenario } = c.req.valid("query");
				const projection = listProjectFrames(project.root);
				const names = projection.frames.map((entry) => entry.name);
				const first = names[0];
				if (first === undefined) {
					return c.text(
						`nothing to play in "${name}" — a frame is born by writing design/frames/<name>/frame.tsx`,
						404,
					);
				}
				if (frame !== undefined && !names.includes(frame)) {
					return c.text(`no frame "${frame}" to play — expected design/frames/${frame}/frame.tsx`, 404);
				}
				// the selected-else-first start (#13): an explicit ?frame= wins, then
				// whatever the canvas last pointed at, then the first frame by name
				const selected = selections.get(project.root).find((entry) => names.includes(entry.frame))?.frame;
				const start = frame ?? selected ?? first;
				if (hostClass(c.req.url) === "control") {
					const requestUrl = new URL(c.req.url);
					protectControlDocument(c);
					return c.html(
						assemblePlayerShell({
							project: name,
							controlToken,
							innerUrl: `${renderOrigin}${requestUrl.pathname}${requestUrl.search}`,
						}),
					);
				}
				// Only html frames enter the compile. Terminal frames ride the
				// config as daemon-rendered persisted grids; project term.tsx is
				// never compiled or executed without an OS sandbox.
				const htmlFrames = projection.frames.filter((entry) => entry.kind === "html");
				const termFrames = projection.frames.filter((entry) => entry.kind === "term");
				const compiled = await playerCompiler.getBundle(project.root, htmlFrames);
				if (compiled.kind === "error") return c.html(errorDocument("player", compiled.message), 500);
				const terminals: Record<string, { svg: string }> = {};
				for (const entry of termFrames) {
					let screen: Awaited<ReturnType<typeof terms.screen>>;
					try {
						screen = await terms.screen(project.root, entry.name);
					} catch (error) {
						if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
						throw error;
					}
					if (screen.kind !== "current") {
						return c.text(screen.message, screen.kind === "stale" ? 409 : 404);
					}
					terminals[entry.name] = { svg: gridToSvg(screen.grid) };
				}
				const config = {
					project: name,
					projectCapability: projectCapability(project.root),
					start,
					scenario: scenario ?? "default",
					frames: Object.fromEntries(projection.frames.map((entry) => [entry.name, { w: entry.w, h: entry.h }])),
					...(termFrames.length === 0 ? {} : { terminals }),
				};
				const etag = playerEtag(compiled.bundle, config);
				if (c.req.header("if-none-match") === etag) return c.body(null, 304);
				c.header("etag", etag);
				c.header("x-spool-cache", compiled.cache);
				return c.html(assemblePlayerDocument(config, compiled.bundle));
			},
		)
		.options("/api/p/:project/scenarios/:name", (c) => serveProjectDataPreflight(c))
		.options("/api/p/:project/fixtures/:name{.+}", (c) => serveProjectDataPreflight(c))
		.get("/api/p/:project/scenarios/:name", (c) => {
			const project = resolveProjectData(c);
			if ("response" in project) return project.response;
			return serveProjectJson(c, readScenario(project.root, c.req.param("name")));
		})
		.get("/api/p/:project/fixtures/:name{.+}", (c) => {
			const project = resolveProjectData(c);
			if ("response" in project) return project.response;
			return serveProjectJson(c, readFixture(project.root, c.req.param("name")));
		})
		.get("/api/p/:project/events", (c) => {
			const name = c.req.param("project");
			const project = resolveProject(c, name);
			if ("response" in project) return project.response;
			return streamSSE(c, async (stream) => {
				let id = 0;
				await stream.writeSSE({ event: "hello", data: JSON.stringify({ project: name }), id: String(id++) });
				const unsubscribe = hub.subscribe(project.root, (event) => {
					void stream.writeSSE({ event: "change", data: JSON.stringify(event), id: String(id++) }).catch(() => {});
				});
				stream.onAbort(unsubscribe);
				await new Promise<void>((resolve) => stream.onAbort(resolve));
			});
		})
		.get("/vendor/react.js", async (c) => {
			// sandboxed srcdoc frames fetch this from a null origin — CORS must be open
			c.header("access-control-allow-origin", "*");
			const etag = `"react-${reactVersion}"`;
			if (c.req.header("if-none-match") === etag) return c.body(null, 304);
			c.header("etag", etag);
			c.header("cache-control", "public, max-age=0, must-revalidate");
			c.header("content-type", "text/javascript; charset=utf-8");
			return c.body(await vendorReactJs());
		})
		.get("/vendor/spool.js", (c) => serveRuntime(c, vendorSpoolJs))
		.get("/vendor/spool-jsx.js", (c) => serveRuntime(c, vendorSpoolJsxJs))
		.get("/vendor/spool-term.js", (c) => serveRuntime(c, vendorSpoolTermJs))
		.get("/vendor/fonts/:file", (c) => {
			// chrome and terminal monos ride spool's own install — never a CDN;
			// null-origin sandboxed frames fetch fonts under CORS
			const file = chromeFontFile(c.req.param("file")) ?? termFontFile(c.req.param("file"));
			if (file === undefined) return c.text("no such font", 404);
			c.header("access-control-allow-origin", "*");
			const etag = `"font-${version}-${c.req.param("file")}"`;
			if (c.req.header("if-none-match") === etag) return c.body(null, 304);
			c.header("etag", etag);
			c.header("cache-control", "public, max-age=0, must-revalidate");
			c.header("content-type", "font/woff2");
			return c.body(new Uint8Array(readFileSync(file)));
		})
		.get("/favicon.svg", (c) => {
			c.header("content-type", "image/svg+xml");
			c.header("cache-control", "no-cache");
			return c.body(development === true ? SPOOL_DEVELOPMENT_FAVICON_SVG : SPOOL_FAVICON_SVG);
		})
		.get("/ui/*", (c) => {
			const asset = readUiAsset(uiDir, c.req.path.slice("/ui/".length));
			if (asset === undefined) return c.text("no such asset", 404);
			c.header("content-type", asset.contentType);
			c.header("cache-control", asset.cacheControl);
			return c.body(new Uint8Array(asset.body));
		})
		.get("/", (c) => serveUiIndex(c))
		.get("/p/:project", (c) => serveUiIndex(c));

	app.onError((error, c) => {
		if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
		throw error;
	});

	async function serveRuntime(c: Context, module: () => Promise<VendorModule>): Promise<Response> {
		c.header("access-control-allow-origin", "*");
		const runtime = await module();
		if (c.req.header("if-none-match") === runtime.etag) return c.body(null, 304);
		c.header("etag", runtime.etag);
		c.header("cache-control", "public, max-age=0, must-revalidate");
		c.header("content-type", "text/javascript; charset=utf-8");
		return c.body(runtime.js);
	}

	function serveProjectDataPreflight(c: Context): Response {
		const requestedHeaders = (c.req.header("access-control-request-headers") ?? "")
			.split(",")
			.map((header) => header.trim().toLowerCase())
			.filter((header) => header !== "");
		if (
			c.req.header("origin") !== "null" ||
			c.req.header("access-control-request-method")?.toUpperCase() !== "GET" ||
			requestedHeaders.length !== 1 ||
			requestedHeaders[0] !== PROJECT_HEADER
		) {
			return c.text("forbidden", 403);
		}
		c.header("access-control-allow-origin", "null");
		c.header("access-control-allow-methods", "GET");
		c.header("access-control-allow-headers", PROJECT_HEADER);
		c.header("vary", "Origin, Access-Control-Request-Headers");
		return c.body(null, 204);
	}

	function serveUiIndex(c: Context): Response {
		const index = readUiIndex(uiDir);
		if (index === undefined) return c.text(UI_MISSING_NOTICE, 503);
		protectControlDocument(c);
		c.header("content-type", index.contentType);
		c.header("cache-control", "no-store");
		const boot = `<script>window.__SPOOL_CONTROL__ = ${escapeJsonScript(controlToken)}; window.__SPOOL_RENDER_ORIGIN__ = ${escapeJsonScript(renderOrigin)};</script>`;
		const html = index.body.toString("utf8");
		return c.body(html.includes("</head>") ? html.replace("</head>", `${boot}\n</head>`) : `${boot}\n${html}`);
	}

	function protectControlDocument(c: Context): void {
		// A foreign page must not turn the authenticated UI into a clickjacking
		// oracle. This CSP is the modern rule; X-Frame-Options covers older engines.
		c.header("content-security-policy", "frame-ancestors 'none'");
		c.header("x-frame-options", "DENY");
		c.header("cache-control", "no-store");
	}

	function assemblePlayerShell({
		project,
		controlToken: shellToken,
		innerUrl,
	}: {
		project: string;
		controlToken: string;
		innerUrl: string;
	}): string {
		const config = escapeJsonScript({ project, controlToken: shellToken });
		const bridge = `(() => {
	const config = window.__SPOOL_SHELL__;
	const inner = document.getElementById("spool-player");
	const headers = { "${CONTROL_HEADER}": config.controlToken };
	async function sendGeometry() {
		const response = await fetch("/api/p/" + encodeURIComponent(config.project) + "/frames", { headers });
		if (!response.ok) return;
		const listing = await response.json();
		inner.contentWindow.postMessage({ spool: "player-geometry", frames: listing.frames }, "*");
	}
	async function followGeometry() {
		try {
			const response = await fetch("/api/p/" + encodeURIComponent(config.project) + "/events", {
				headers: { ...headers, accept: "text/event-stream" },
			});
			if (!response.ok || !response.body) return;
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			for (;;) {
				const next = await reader.read();
				if (next.done) return;
				buffer += decoder.decode(next.value, { stream: true });
				const blocks = buffer.split("\\n\\n");
				buffer = blocks.pop() || "";
				for (const block of blocks) {
					const raw = block.match(/^data: (.*)$/m)?.[1];
					if (!raw) continue;
					try {
						const change = JSON.parse(raw);
						if (change.kind === "geometry") void sendGeometry();
					} catch {}
				}
			}
		} finally {
			setTimeout(followGeometry, 1000);
		}
	}
	addEventListener("message", (event) => {
		if (event.source !== inner.contentWindow || !event.data || typeof event.data !== "object") return;
		const message = event.data;
		if (message.spool === "player-close") {
			window.close();
			setTimeout(() => { if (!window.closed) location.href = "/p/" + encodeURIComponent(config.project); }, 150);
			return;
		}
		if (message.spool === "player-walked" && typeof message.from === "string" && typeof message.to === "string") {
			void fetch("/api/p/" + encodeURIComponent(config.project) + "/walked", {
				method: "POST",
				headers: { ...headers, "content-type": "application/json" },
				body: JSON.stringify({ from: message.from, to: message.to }),
				keepalive: true,
			});
		}
	});
	void followGeometry();
})();`;
		return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(project)} · spool</title>
<style>html, body, iframe { width: 100%; height: 100%; } body { margin: 0; overflow: hidden; background: #0e0e0e; } iframe { display: block; border: 0; }</style>
</head>
<body>
<iframe id="spool-player" title="${escapeHtml(project)}" sandbox="allow-scripts" src="${escapeHtml(innerUrl)}"></iframe>
<script>window.__SPOOL_SHELL__ = ${config};</script>
<script>${escapeInlineScript(bridge)}</script>
</body>
</html>
`;
	}

	// Project terminal code has no OS sandbox. Refuse at the socket boundary
	// before parsing a path, looking up a project, or touching an executor.
	function handleUpgrade(_req: IncomingMessage, socket: Duplex, _head: Buffer): void {
		socket.destroy();
	}

	return {
		app,
		controlToken,
		/** Stable for this daemon and canonical root; rendered project code receives only its own. */
		projectCapability,
		/** Activate origin-dependent work (the thumb healer) once really bound. */
		setSelfOrigin: (origin: string) => {
			controlOrigin = new URL(origin).origin;
			renderOrigin = renderOriginFor(controlOrigin);
			selfOrigin = renderOrigin;
		},
		/** Begin the daily phone-home — post-listen only, and only when opted in. */
		startUpdateCheck: () => {
			if (updateCheck === true) updateChecker.start();
		},
		/** The /term upgrade path — wired by serveDaemon onto the raw server. */
		handleUpgrade,
		/** Terminal sessions, exposed for the player's static grids and seam tests. */
		terms,
		close: () => {
			stopRegistryWatch();
			void terms.close();
			hub.close();
			updateChecker.stop();
			void shots.close();
			void goReader.close();
		},
	};
}

export type AppType = ReturnType<typeof createDaemonApp>["app"];
