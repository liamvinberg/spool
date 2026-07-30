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
import { type Attachment, MAX_ATTACHMENT_BYTES, parseAttachment } from "../attachment";
import { SPOOL_DEVELOPMENT_FAVICON_SVG, SPOOL_FAVICON_SVG } from "../brand";
import type { Cover } from "../cover";
import { SpoolError } from "../errors";
import { initProject } from "../init";
import { openProject } from "../open";
import { forgetResolvedProject, lookupProjectByName, readRegistry } from "../registry";
import { gridToSvg } from "../term/still";
import { requestUpgrade } from "../upgrade";
import { parseAgentReply } from "./agent-control";
import { type AgentExecutor, claudeExecutor } from "./agent-exec";
import { agentPromptContent } from "./agent-spawn";
import { type AgentTurn, startAgentTurn } from "./agent-turn";
import { createFrameCompiler } from "./compile";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import {
	captureWorkerCsp,
	captureWorkerDocument,
	escapeHtml,
	escapeInlineScript,
	escapeInlineStyle,
	escapeJsonScript,
	playerHandoffRejectedDocument,
	playerLoadErrorDocument,
} from "./document";
import { createChangeHub } from "./events";
import { createFlowGraph, recordWalk } from "./flows";
import { listDirectory } from "./fs-list";
import { type Geometry, parseGeometry, sidecarFileIn, writeGeometry } from "./geometry";
import { createGoReader } from "./go-reader";
import { assemblePlayerDocument, chromeFontFile, createPlayerCompiler, playerChromeCss, playerEtag } from "./play";
import { isSafeName, type ProjectJson, readFixture, readScenario } from "./project-files";
import { parseCanvasState, readCanvasState, writeCanvasState } from "./project-state";
import {
	type FrameKind,
	frameGeometry,
	listProjectFrames,
	lookupFrame,
	type ProjectCard,
	projectedKind,
	summarizeProject,
} from "./projection";
import { createResolvePass } from "./resolve-pass";
import {
	CAPTURE_HOST,
	CONTROL_HEADER,
	captureOriginFor,
	createCapability,
	matchesCapability,
	normalizeHostname,
	PROJECT_HEADER,
	RENDER_HOST,
	renderOriginFor,
} from "./security";
import { createSelectionStore, parseSelectionEntries, parseSelectionPut, type SelectionEntry } from "./selection";
import { selectionBlock } from "./selection-block";
import { type AppEvent, type MachineStateWatchAdapter, readSession, updateSession, watchMachineState } from "./session";
import { createShotTaker } from "./shots";
import type { TermExecutor } from "./term-exec";
import { termFontDataCss, termFontFile } from "./term-fonts";
import { createTermSessions } from "./term-sessions";
import { createThumbHealer, isCoverHash, readCoverImage, UnservableCoverError, writeCover } from "./thumbs";
import { readUiAsset, readUiIndex, UI_MISSING_NOTICE } from "./ui";
import { createUpdateChecker } from "./update-check";
import {
	reactVersion,
	type VendorModule,
	vendorPlayerShellJs,
	vendorReactJs,
	vendorSpoolJs,
	vendorSpoolJsxJs,
	vendorSpoolTermJs,
} from "./vendor";
import { createWebfonts } from "./webfonts";

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
	/** The agent spawn (#191) — swapped for a capture replayer so CI never runs a real agent. */
	agentExecutor?: AgentExecutor;
	/** Machine-state filesystem lifecycle boundary. */
	machineStateWatchAdapter?: MachineStateWatchAdapter;
	/** Machine-state observation failures stay visible without escaping a watcher callback. */
	onMachineStateWatchError?: (error: Error) => void;
}

/** The player's params (#24): Zod-validated, path-safe names only. */
const playParams = z.object({
	frame: z.string().refine(isSafeName, { message: "not a frame name" }).optional(),
	scenario: z.string().refine(isSafeName, { message: "not a scenario name" }).optional(),
	shell: z.literal("1").optional(),
	handoff: z
		.string()
		.regex(/^[A-Za-z0-9_-]{43}$/, { message: "not a shell handoff" })
		.optional(),
});

const PLAYER_HANDOFF_TTL_MS = 30_000;
/** Browser handoffs are deliberately short and bounded: issuing the control document is a public GET. */
const MAX_PLAYER_HANDOFFS = 64;

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
	agentExecutor,
	machineStateWatchAdapter,
	onMachineStateWatchError,
}: DaemonOptions) {
	const controlToken = providedControlToken ?? createCapability();
	const controlHostname = normalizeHostname(controlHost ?? "localhost");
	let controlOrigin = `http://${controlHostname.includes(":") ? `[${controlHostname}]` : controlHostname}`;
	let renderOrigin = renderOriginFor(controlOrigin);
	let captureOrigin = captureOriginFor(controlOrigin);
	const projectCapabilities = new Map<string, string>();
	const playerHandoffs = new Map<string, { project: string; frame: string; scenario: string; expiresAt: number }>();

	function projectCapability(root: string): string {
		let capability = projectCapabilities.get(root);
		if (capability === undefined) {
			capability = createCapability();
			projectCapabilities.set(root, capability);
		}
		return capability;
	}

	function issuePlayerHandoff(project: string, frame: string, scenario: string): string {
		const now = Date.now();
		for (const [token, handoff] of playerHandoffs) {
			if (handoff.expiresAt <= now) playerHandoffs.delete(token);
		}
		while (playerHandoffs.size >= MAX_PLAYER_HANDOFFS) {
			const oldest = playerHandoffs.keys().next().value;
			if (oldest === undefined) break;
			playerHandoffs.delete(oldest);
		}
		const token = createCapability();
		playerHandoffs.set(token, { project, frame, scenario, expiresAt: now + PLAYER_HANDOFF_TTL_MS });
		return token;
	}

	function consumePlayerHandoff(
		token: string | undefined,
		project: string,
		frame: string | undefined,
		scenario: string,
	): boolean {
		if (token === undefined) return false;
		const handoff = playerHandoffs.get(token);
		playerHandoffs.delete(token);
		return (
			handoff !== undefined &&
			handoff.expiresAt > Date.now() &&
			handoff.project === project &&
			handoff.frame === frame &&
			handoff.scenario === scenario
		);
	}

	const startedAt = new Date().toISOString();
	const webfonts = createWebfonts({ cacheDir: join(spoolDir, "webfonts") });
	const compiler = createFrameCompiler(version, webfonts);
	const playerCompiler = createPlayerCompiler(version, webfonts);
	const flowGraph = createFlowGraph();
	// a shared/ edit wakes the frames whose graph reaches it, not every document
	const hub = createChangeHub({ framesUsing: (root, path) => flowGraph.framesUsing(root, path) });
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
		controlOrigin,
	});

	// the app-level channel: registry and session changes, fanned to every page
	const appListeners = new Set<(event: AppEvent) => void>();
	const emitAppEvent = (event: AppEvent) => {
		for (const listener of appListeners) listener(event);
	};
	const machineStateWatch = watchMachineState(spoolDir, emitAppEvent, {
		...(machineStateWatchAdapter === undefined ? {} : { adapter: machineStateWatchAdapter }),
		onError:
			onMachineStateWatchError ??
			((error) => console.error(`spool: machine-state observation failed: ${error.message}`)),
	});

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
		stored: (root, frame, cover) => hub.publish(root, { kind: "thumb", frame, cover }),
	});
	const goReader = createGoReader();
	const resolvePass = createResolvePass({
		read: (target) => goReader.read(target),
		sources: (root) => flowGraph.sources(root),
		moved: (root) => hub.publish(root, { kind: "resolved" }),
		now: () => new Date().toISOString(),
	});

	// Persisted terminal grids remain readable, but the default executor is a
	// hard stop until project processes can run inside an OS sandbox.
	const terms = createTermSessions({
		executor: termExecutor ?? disabledTermExecutor,
		// a persisted screen is a new cover: name its image in the event, so the
		// canvas swaps addresses without a projection read
		publish: (root, frame) => {
			const { cover } = terms.cover(root, frame);
			hub.publish(root, { kind: "thumb", frame, ...(cover === undefined ? {} : { cover }) });
		},
	});

	// #191's ADR: the daemon spawns the developer's own agent when the hands ask
	// for it. Project code never reaches this — it is a control-plane route
	// behind the control token, the same boundary #41 drew.
	const spawnAgent = agentExecutor ?? claudeExecutor();
	/**
	 * Every turn in flight, the project it is running in, and what the rail calls it.
	 *
	 * The project is carried because an answer arrives on its own request rather than
	 * on the stream that asked for it (#197): a waiting request is addressed by the id
	 * the binary gave it, and this is what keeps one project's answer from reaching
	 * another project's turn.
	 *
	 * The name is carried for the same reason and a different id (#165). A stop has no
	 * request to quote — it is the one thing spool asks the binary for rather than
	 * answers — so the rail names its own turn when it starts one, and the stop names
	 * it back. Absent for a client that never intends to stop anything.
	 */
	const liveTurns = new Map<AgentTurn, { root: string; id?: string }>();

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

	/** The most the one uploaded cover image may weigh. */
	const MAX_COVER_BYTES = 16 * 1024 * 1024;

	/**
	 * Ask the headless fallback for a frame's cover. The healer holds the
	 * per-frame cooldown and runs one shot at a time, so calling this for every
	 * uncovered frame in a projection read costs a queue, never a stampede.
	 */
	function requestHeal(root: string, name: string, frame: string, geometry?: { w: number; h: number }): void {
		if (selfOrigin === undefined) return;
		const { w, h } = geometry ?? frameGeometry(root, frame);
		healer.request({
			root,
			frame,
			url: `${selfOrigin}/p/${encodeURIComponent(name)}/frames/${encodeURIComponent(frame)}`,
			width: w,
			height: h,
		});
	}

	/** The capture protocol carries exactly one image. */
	async function parseCover(c: Context): Promise<Buffer> {
		const form = await c.req.formData();
		const entries = [...form.entries()];
		const [key, value] = entries[0] ?? [];
		if (
			entries.length !== 1 ||
			key !== "cover" ||
			value === undefined ||
			typeof value === "string" ||
			value.size === 0 ||
			value.size > MAX_COVER_BYTES
		) {
			throw new Error("not a cover");
		}
		return Buffer.from(await value.arrayBuffer());
	}

	/**
	 * Headers for a cover. The hash in the URL is the content, so the answer can
	 * never go stale: the browser holds it for a year and revalidates nothing,
	 * and a changed cover arrives as a different address.
	 */
	function immutableCover(c: Context, type: string): void {
		c.header("cache-control", "private, max-age=31536000, immutable");
		c.header("content-type", type);
		c.header("x-content-type-options", "nosniff");
	}

	/** Body of the picker's POSTs: { path } — anything else is a 400. */
	function requestedPath(value: unknown, c: Context): { path: string } | Response {
		const path = (value as { path?: unknown }).path;
		if (typeof path !== "string" || path === "") {
			return c.json({ error: 'expected { "path": "/abs/dir" }' }, 400);
		}
		return { path };
	}

	type HostClass = "control" | "render" | "capture" | "unexpected";

	function hostClass(url: string): HostClass {
		const hostname = normalizeHostname(new URL(url).hostname);
		if (hostname === controlHostname) return "control";
		if (hostname === RENDER_HOST) return "render";
		if (hostname === CAPTURE_HOST) return "capture";
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
			if (host === "capture") {
				const url = new URL(c.req.url);
				if (c.req.method !== "GET" || url.pathname !== "/capture" || url.search !== "") {
					return c.text("not found", 404);
				}
				await next();
				return;
			}
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
			if (isRenderOnlyPath(path) || path === "/capture") return c.text("not found", 404);
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
		.get("/capture", (c) => {
			c.header("cache-control", "no-store");
			c.header("content-security-policy", captureWorkerCsp(controlOrigin));
			c.header("x-content-type-options", "nosniff");
			return c.html(captureWorkerDocument(controlOrigin));
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
				const { root, open } = value as { root?: unknown; open?: unknown };
				if (typeof root !== "string" || typeof open !== "boolean") {
					return c.text('session mutation must be { "root": string, "open": boolean }', 400);
				}
				return { root, open };
			}),
			(c) => {
				const { root, open } = c.req.valid("json");
				const result = updateSession(spoolDir, root, open);
				if (result.kind === "unregistered") {
					return c.text(`not a registered project root: ${result.root}`, 400);
				}
				machineStateWatch.acknowledgeSession(result.session);
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
		.post(
			"/api/projects/forget",
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
			const name = c.req.param("project");
			const project = resolveProject(c, name);
			if ("response" in project) return project.response;
			try {
				const projection = listProjectFrames(project.root);
				return c.json({
					...projection,
					frames: projection.frames.map((frame) => {
						if (frame.kind === "html") {
							// This read is the moment a canvas learns a frame has no cover
							// to show, and a frame with none renders its placeholder and
							// asks for nothing (#111). So the heal is enqueued here rather
							// than waiting for a request that will never come.
							if (frame.cover === undefined) requestHeal(project.root, name, frame.name, frame);
							return frame;
						}
						const { state, cover } = terms.cover(project.root, frame.name);
						return { ...frame, ...(cover === undefined ? {} : { cover }), terminalCover: state };
					}),
				});
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				throw error;
			}
		})
		.get("/api/p/:project/thumbs/:frame", async (c) => {
			// A terminal frame's still, for `spool shot` and `spool verify` (#42):
			// rasterized from the persisted grid in the pinned font, which never
			// starts project code. The canvas reads covers from /covers instead —
			// this door exists because the CLI has a control token and no image URL.
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			if (!isSafeName(frame)) return c.text(`not a frame name: "${frame}"`, 404);
			if (projectedKind(project.root, frame) !== "term") {
				return c.text(`"${frame}" is not a terminal frame; its cover is a stored image, not a grid`, 404);
			}
			let screen: Awaited<ReturnType<typeof terms.screen>>;
			try {
				screen = await terms.screen(project.root, frame);
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				throw error;
			}
			if (screen.kind !== "current") return c.text(screen.message, screen.kind === "stale" ? 409 : 404);
			const still = gridToSvg(screen.grid, termFontDataCss());
			const etag = `"term-still-${createHash("sha256").update(still).digest("hex").slice(0, 32)}"`;
			c.header("cache-control", "no-cache");
			if (c.req.header("if-none-match") === etag) return c.body(null, 304);
			c.header("etag", etag);
			c.header("content-type", "image/svg+xml; charset=utf-8");
			return c.body(still);
		})
		.get("/covers/:project/:frame/:hash", async (c) => {
			// The hash addresses the image content, which makes the URL both the credential because an <img> cannot
			// carry the control header, and an immutable cache key, so a warm
			// reload fetches none of them.
			const name = c.req.param("project");
			const project = resolveProject(c, name);
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			const hash = c.req.param("hash");
			if (!isSafeName(frame) || !isCoverHash(hash)) {
				return c.text("no such cover", 404);
			}
			let kind: FrameKind | undefined;
			try {
				kind = projectedKind(project.root, frame);
				if (kind === "term") {
					if (terms.cover(project.root, frame).cover?.hash !== hash) return c.text("no such cover", 404);
					const still = await terms.persistedStill(project.root, frame);
					if (still === undefined) return c.text("no such cover", 404);
					immutableCover(c, "image/svg+xml; charset=utf-8");
					return c.body(still);
				}
				const image = kind === "html" ? readCoverImage(project.root, frame, hash) : undefined;
				if (image !== undefined) {
					immutableCover(c, image.type);
					return c.body(new Uint8Array(image.bytes));
				}
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				throw error;
			}
			// The address named a cover this frame does not have. Heal it: the shot
			// lands, the thumb event carries the new image, and the canvas asks
			// again at the address that now exists.
			if (kind === "html") requestHeal(project.root, name, frame);
			return c.text("no such cover", 404);
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
		.get("/api/p/:project/flows", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json(await flowGraph.flows(project.root));
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
		.post(
			"/api/p/:project/agent/turn",
			validator("json", (value, c) => {
				const body = (typeof value === "object" && value !== null ? value : {}) as {
					said?: unknown;
					turn?: unknown;
				};
				// a turn is what the human said, which is one message when they pressed Enter
				// against a quiet rail and several when a queue fired as one turn (#170)
				if (!Array.isArray(body.said) || body.said.length === 0) {
					return c.text('a turn is { "said": [{ "prompt": "…" }] }', 400);
				}
				if (body.turn !== undefined && (typeof body.turn !== "string" || body.turn === "")) {
					return c.text('"turn" is the id a stop names this turn by', 400);
				}
				const said: { prompt: string; selection?: SelectionEntry[]; attachment?: Attachment }[] = [];
				for (const raw of body.said) {
					const one = (typeof raw === "object" && raw !== null ? raw : {}) as {
						prompt?: unknown;
						selection?: unknown;
						attachment?: unknown;
					};
					if (typeof one.prompt !== "string" || one.prompt.trim() === "") {
						return c.text('a turn is { "said": [{ "prompt": "…" }] }', 400);
					}
					// an attachment is optional and never guessed at: a picture spool cannot
					// send is said out loud rather than dropped out of the message (#119)
					const attached = one.attachment === undefined ? undefined : parseAttachment(one.attachment);
					if (one.attachment !== undefined && attached === undefined) {
						return c.text(
							`an attachment is { "media": "image/png", "data": "<base64>" } — png, jpeg, gif or webp under ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`,
							400,
						);
					}
					// a message that captured its own selection at Enter hands it back here;
					// one that did not is asking for what the hands are pointing at now (#170)
					const captured = one.selection === undefined ? undefined : parseSelectionEntries(one.selection);
					if (one.selection !== undefined && captured === undefined) {
						return c.text('"selection" is the entry list this daemon served the rail', 400);
					}
					said.push({
						prompt: one.prompt,
						...(captured === undefined ? {} : { selection: captured }),
						...(attached === undefined ? {} : { attachment: attached }),
					});
				}
				return { said, turn: typeof body.turn === "string" ? body.turn : undefined };
			}),
			(c) => {
				// one turn, streamed as it arrives (#191): the prompt goes down the
				// binary's stdin and its events come back over this response in the
				// order the wire sent them
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { said, turn: named } = c.req.valid("json");
				const turn = startAgentTurn({
					executor: spawnAgent,
					root: project.root,
					// what the hands are pointing at rides with the words, in the bytes
					// `spool selection` prints for this same moment (#116) — or, for a
					// message the queue held, for the moment it was said (#170)
					content: agentPromptContent(
						said.map((one) => ({
							prompt: one.prompt,
							selection: selectionBlock(one.selection ?? selections.get(project.root)),
							...(one.attachment === undefined ? {} : { attachment: one.attachment }),
						})),
					),
				});
				liveTurns.set(turn, { root: project.root, ...(named === undefined ? {} : { id: named }) });
				return streamSSE(c, async (stream) => {
					let id = 0;
					stream.onAbort(() => turn.abandon());
					try {
						for await (const event of turn.events) {
							try {
								await stream.writeSSE({ event: "agent", data: JSON.stringify(event), id: String(id++) });
							} catch {
								// the client hung up mid-write — stop reading, but never
								// swallow a failure from the turn itself
								break;
							}
						}
					} finally {
						turn.abandon();
						liveTurns.delete(turn);
					}
				});
			},
		)
		.post(
			"/api/p/:project/agent/interrupt",
			validator("json", (value, c) => {
				const body = (typeof value === "object" && value !== null ? value : {}) as { turn?: unknown };
				if (typeof body.turn !== "string" || body.turn === "") {
					return c.text('a stop is { "turn": "…" }', 400);
				}
				return { turn: body.turn };
			}),
			(c) => {
				/*
				 * The way out of a turn that is already running (#165).
				 *
				 * Its own door for the reason an answer has one: the turn's stream is a
				 * response the client is reading and has no way back up. The turn names
				 * itself when it starts, so a project holding two of them stops the one the
				 * hands are looking at rather than both.
				 *
				 * What goes down the wire is a request rather than a kill. The process
				 * survives it and ends the turn itself, which is why this answers with
				 * nothing: everything there is to say arrives on the stream.
				 */
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { turn: named } = c.req.valid("json");
				for (const [turn, live] of liveTurns) {
					if (live.root === project.root && live.id === named && turn.interrupt()) return c.body(null, 204);
				}
				// nothing is running under that name: it ended on its own, or it was never
				// this project's. Both are the same fact from here, and both mean stopped
				return c.text(`no turn "${named}" to stop`, 404);
			},
		)
		.post(
			"/api/p/:project/agent/answer",
			validator("json", (value, c) => {
				const body = (typeof value === "object" && value !== null ? value : {}) as {
					request?: unknown;
					reply?: unknown;
				};
				const reply = parseAgentReply(body.reply);
				if (typeof body.request !== "string" || body.request === "" || reply === undefined) {
					return c.text(
						'an answer is { "request": "…", "reply": { "kind": "allow" | "always" | "deny" | "said" | "picked" } }',
						400,
					);
				}
				return { request: body.request, reply };
			}),
			(c) => {
				/*
				 * The answer to a request the turn is parked on (#121, #145).
				 *
				 * It is its own door rather than a second body on the turn's stream, because
				 * that stream is a response the client is reading and has no way back up. The
				 * request's own id is the address, so nothing here has to name a turn: a
				 * project can hold several and exactly one of them is holding this request.
				 */
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				const { request, reply } = c.req.valid("json");
				for (const [turn, live] of liveTurns) {
					if (live.root === project.root && turn.answer(request, reply)) return c.body(null, 204);
				}
				// nobody is waiting on it: the turn ended, it was answered already, or it
				// belongs to another project. All three are the same fact from here
				return c.text(`no waiting request "${request}"`, 404);
			},
		)
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
				// the enriched list comes straight back, because the composer's chips are
				// the promise of what the prompt will carry and only this side knows the
				// paths, the sizes, the line ranges and the excerpts (#116)
				return c.json({ selection: selections.get(project.root) });
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
			// A self-capture arrives as one image. The answer is its immutable address, so the canvas can put the new
			// cover on screen without re-reading the projection.
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
			let image: Buffer;
			try {
				image = await parseCover(c);
			} catch {
				return c.text("a cover is one image in the cover field", 400);
			}
			let cover: Cover;
			try {
				cover = writeCover(project.root, frame, image);
			} catch (error) {
				if (error instanceof DesignBoundaryError) return c.text(error.message, 400);
				if (error instanceof UnservableCoverError) return c.text(error.message, 400);
				throw error;
			}
			hub.publish(project.root, { kind: "thumb", frame, cover });
			return c.json(cover);
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
					const message = `not a playable request — ${issues}`;
					return value.shell === "1" && hostClass(c.req.url) === "render"
						? c.html(playerLoadErrorDocument(message, "failed to load"), 400)
						: c.text(message, 400);
				}
				return parsed.data;
			}),
			async (c) => {
				const name = c.req.param("project");
				const { frame, scenario, shell, handoff } = c.req.valid("query");
				const controlRequest = hostClass(c.req.url) === "control";
				const shellRender = !controlRequest && shell === "1";
				const shellDocument = (body: string, status: number) =>
					new Response(body, { status, headers: { "content-type": "text/html; charset=UTF-8" } });
				const shellFailure = (message: string, status: number) =>
					shellDocument(playerLoadErrorDocument(message, "failed to load"), status);
				const playScenario = scenario ?? "default";
				if (shellRender && !consumePlayerHandoff(handoff, name, frame, playScenario)) {
					// Single-use stays: a leaked shell URL must not be re-embeddable, since
					// shell mode is what hands a live player port to its parent. This is
					// the one failure the outer page repairs by reloading, so it reports
					// through its own signal rather than the generic load error (#88).
					return shellDocument(playerHandoffRejectedDocument("invalid or expired player shell handoff"), 403);
				}
				if (!shellRender && !controlRequest && handoff !== undefined) {
					return c.text("a player shell handoff requires shell=1", 400);
				}
				const project = resolveProject(c, name);
				if ("response" in project) {
					if (shellRender) return shellFailure(await project.response.text(), project.response.status);
					return project.response;
				}
				const projection = listProjectFrames(project.root);
				const names = projection.frames.map((entry) => entry.name);
				const first = names[0];
				if (first === undefined) {
					const message = `nothing to play in "${name}" — a frame is born by writing design/frames/<name>/frame.tsx`;
					return shellRender ? shellFailure(message, 404) : c.text(message, 404);
				}
				if (frame !== undefined && !names.includes(frame)) {
					const message = `no frame "${frame}" to play — expected design/frames/${frame}/frame.tsx`;
					return shellRender ? shellFailure(message, 404) : c.text(message, 404);
				}
				// the selected-else-first start (#13): an explicit ?frame= wins, then
				// whatever the canvas last pointed at, then the first frame by name
				const selected = selections.get(project.root).find((entry) => names.includes(entry.frame))?.frame;
				const start = frame ?? selected ?? first;
				const frames = Object.fromEntries(
					projection.frames.map((entry) => [entry.name, { w: entry.w, h: entry.h }]),
				);
				if (controlRequest) protectControlDocument(c);
				// Validate before returning the control shell. The render-origin
				// iframe repeats this request, but the player compiler is content-
				// cached, so project code is built only once.
				const htmlFrames = projection.frames.filter((entry) => entry.kind === "html");
				const termFrames = projection.frames.filter((entry) => entry.kind === "term");
				const compiled = await playerCompiler.getBundle(project.root, htmlFrames);
				if (compiled.kind === "error") return c.html(playerLoadErrorDocument(compiled.message), 500);
				const terminals = Object.create(null) as Record<string, { svg: string }>;
				for (const entry of termFrames) {
					let screen: Awaited<ReturnType<typeof terms.screen>>;
					try {
						screen = await terms.screen(project.root, entry.name);
					} catch (error) {
						if (error instanceof DesignBoundaryError) {
							return shellRender ? shellFailure(error.message, 400) : c.text(error.message, 400);
						}
						throw error;
					}
					if (screen.kind !== "current") {
						return c.html(
							playerLoadErrorDocument(screen.message, "failed to load"),
							screen.kind === "stale" ? 409 : 404,
						);
					}
					terminals[entry.name] = { svg: gridToSvg(screen.grid, termFontDataCss()) };
				}
				if (controlRequest) {
					const requestUrl = new URL(c.req.url);
					requestUrl.searchParams.set("frame", start);
					requestUrl.searchParams.set("scenario", playScenario);
					requestUrl.searchParams.set("shell", "1");
					requestUrl.searchParams.set("handoff", issuePlayerHandoff(name, start, playScenario));
					return c.html(
						assemblePlayerShell({
							project: name,
							start,
							frames,
							terminals: termFrames.map((entry) => entry.name),
							controlToken,
							innerUrl: `${renderOrigin}${requestUrl.pathname}${requestUrl.search}`,
						}),
					);
				}
				const config = {
					project: name,
					projectCapability: projectCapability(project.root),
					start,
					scenario: playScenario,
					frames,
					...(shell === "1" ? { shell: true as const } : {}),
					...(termFrames.length === 0 ? {} : { terminals }),
				};
				const etag = playerEtag(compiled.bundle, config);
				if (!shellRender && c.req.header("if-none-match") === etag) return c.body(null, 304);
				if (shellRender) {
					c.header("cache-control", "no-store");
				} else {
					c.header("etag", etag);
				}
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
		.get("/vendor/webfont/:key", async (c) => {
			// A project's own fonts.css named this file's URL and nothing else can
			// (#80): the key is content-addressed and only a resolved stylesheet
			// puts one in reach. Null-origin sandboxed frames fetch it under CORS,
			// both to render and to inline into their own stills.
			const file = await webfonts.read(c.req.param("key"));
			if (file === undefined) return c.text("no such font", 404);
			c.header("access-control-allow-origin", "*");
			const etag = `"webfont-${c.req.param("key")}"`;
			if (c.req.header("if-none-match") === etag) return c.body(null, 304);
			c.header("etag", etag);
			c.header("cache-control", "public, max-age=0, must-revalidate");
			c.header("content-type", file.type);
			return c.body(new Uint8Array(file.bytes));
		})
		.get("/player-assets/react.js", async (c) => {
			const etag = `"react-${reactVersion}"`;
			if (c.req.header("if-none-match") === etag) return c.body(null, 304);
			c.header("etag", etag);
			c.header("cache-control", "public, max-age=0, must-revalidate");
			c.header("content-type", "text/javascript; charset=utf-8");
			return c.body(await vendorReactJs());
		})
		.get("/player-assets/player-shell.js", (c) => serveRuntime(c, vendorPlayerShellJs, false))
		.get("/player-assets/fonts/:file", (c) => {
			const file = chromeFontFile(c.req.param("file"));
			if (file === undefined) return c.text("no such font", 404);
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

	async function serveRuntime(c: Context, module: () => Promise<VendorModule>, crossOrigin = true): Promise<Response> {
		if (crossOrigin) c.header("access-control-allow-origin", "*");
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
		const boot = `<script>window.__SPOOL_CONTROL__ = ${escapeJsonScript(controlToken)}; window.__SPOOL_RENDER_ORIGIN__ = ${escapeJsonScript(renderOrigin)}; window.__SPOOL_CAPTURE_ORIGIN__ = ${escapeJsonScript(captureOrigin)};</script>`;
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
		start,
		frames,
		terminals,
		controlToken: shellToken,
		innerUrl,
	}: {
		project: string;
		start: string;
		frames: Record<string, { w: number; h: number }>;
		terminals: string[];
		controlToken: string;
		innerUrl: string;
	}): string {
		const config = escapeJsonScript({ project, start, frames, terminals, innerUrl, controlToken: shellToken });
		const bridge = `(() => {
	const config = window.__SPOOL_SHELL__;
	const headers = { "${CONTROL_HEADER}": config.controlToken };
	let geometryRevision = 0;
	let geometryRequest = 0;
	let geometrySubscribed = false;
	function retainedGeometry() {
		return Object.entries(config.frames).map(([name, geometry]) => ({ name, w: geometry.w, h: geometry.h }));
	}
	let latestGeometry = retainedGeometry();
	function pendingGeometry() {
		const revision = ++geometryRevision;
		window.dispatchEvent(new CustomEvent("spool-player-geometry-pending", { detail: { revision } }));
		return revision;
	}
	function announceGeometry(revision, frames) {
		window.dispatchEvent(new CustomEvent("spool-player-geometry", { detail: { revision, frames } }));
	}
	function replayGeometry() {
		const revision = pendingGeometry();
		announceGeometry(revision, latestGeometry);
	}
	async function sendGeometry() {
		const request = ++geometryRequest;
		const revision = pendingGeometry();
		let settled = false;
		const fallback = setTimeout(() => {
			if (request !== geometryRequest || settled) return;
			settled = true;
			announceGeometry(revision, latestGeometry);
		}, 1000);
		try {
			const response = await fetch("/api/p/" + encodeURIComponent(config.project) + "/frames", { headers });
			if (!response.ok) throw new Error("geometry unavailable");
			const listing = await response.json();
			if (!Array.isArray(listing.frames)) throw new Error("invalid geometry");
			if (request !== geometryRequest) return;
			const frames = listing.frames
				.filter((frame) => frame && typeof frame.name === "string" && Number.isInteger(frame.w) && frame.w > 0 && Number.isInteger(frame.h) && frame.h > 0)
				.map(({ name, w, h }) => ({ name, w, h }));
			if (frames.length !== listing.frames.length) throw new Error("invalid geometry");
			latestGeometry = frames;
			if (settled || revision !== geometryRevision) {
				replayGeometry();
			} else {
				settled = true;
				announceGeometry(revision, latestGeometry);
			}
		} catch {
			if (request === geometryRequest && !settled) {
				settled = true;
				announceGeometry(revision, latestGeometry);
			}
		} finally {
			clearTimeout(fallback);
		}
	}
	async function followGeometry() {
		void sendGeometry();
		try {
			const response = await fetch("/api/p/" + encodeURIComponent(config.project) + "/events", {
				headers: { ...headers, accept: "text/event-stream" },
			});
			if (!response.ok || !response.body) return;
			geometrySubscribed = true;
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
			geometrySubscribed = false;
			setTimeout(followGeometry, 1000);
		}
	}
	addEventListener("spool-player-geometry-request", () => {
		replayGeometry();
		if (geometrySubscribed) void sendGeometry();
	});
	addEventListener("spool-player-walked", (event) => {
		const walk = event.detail;
		if (walk && typeof walk.from === "string" && typeof walk.to === "string") {
			void fetch("/api/p/" + encodeURIComponent(config.project) + "/walked", {
				method: "POST",
				headers: { ...headers, "content-type": "application/json" },
				body: JSON.stringify({ from: walk.from, to: walk.to }),
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
<style>${escapeInlineStyle(playerChromeCss("/player-assets/fonts/"))}</style>
<style>html, body, #root { width: 100%; height: 100%; } body { margin: 0; overflow: hidden; background: #0e0e0e; } .spool-screen-scroll > iframe { display: block; width: 100%; height: 100%; border: 0; }</style>
</head>
<body>
<div id="root"></div>
<script>window.__SPOOL_SHELL__ = JSON.parse(${escapeJsonScript(config)});</script>
<script type="importmap">{"imports":{"react":"/player-assets/react.js","react-dom":"/player-assets/react.js","react-dom/client":"/player-assets/react.js","react/jsx-runtime":"/player-assets/react.js"}}</script>
<script type="module">import { bootPlayerShell } from "/player-assets/player-shell.js"; bootPlayerShell(window.__SPOOL_SHELL__);</script>
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
			captureOrigin = captureOriginFor(controlOrigin);
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
			machineStateWatch.stop();
			for (const turn of liveTurns.keys()) turn.abandon();
			liveTurns.clear();
			void terms.close();
			hub.close();
			updateChecker.stop();
			void shots.close();
			void goReader.close();
		},
	};
}

export type AppType = ReturnType<typeof createDaemonApp>["app"];
