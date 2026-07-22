import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, isAbsolute, join, normalize, sep } from "node:path";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { validator } from "hono/validator";
import trash from "trash";
import { z } from "zod";
import { SpoolError } from "../errors";
import { initProject } from "../init";
import { openProject } from "../open";
import { lookupProjectByName, readRegistry } from "../registry";
import { createFrameCompiler } from "./compile";
import { errorDocument } from "./document";
import { createChangeHub } from "./events";
import { deriveFlows, recordWalk } from "./flows";
import { listDirectory } from "./fs-list";
import { type Geometry, parseGeometry, sidecarFile, writeGeometry } from "./geometry";
import { assemblePlayerDocument, chromeFontFile, createPlayerCompiler, playerEtag } from "./play";
import { isSafeName, type ProjectJson, readFixture, readScenario } from "./project-files";
import { parseCanvasState, readCanvasState, writeCanvasState } from "./project-state";
import { frameGeometry, listProjectFrames, type ProjectCard, summarizeProject } from "./projection";
import { createSelectionStore, parseSelectionPut } from "./selection";
import { type AppEvent, readSession, watchRegistry, writeSession } from "./session";
import { createShotTaker } from "./shots";
import { createThumbHealer, readThumb, writeThumb } from "./thumbs";
import { readUiAsset, readUiIndex, UI_MISSING_NOTICE } from "./ui";
import { reactVersion, type VendorModule, vendorReactJs, vendorSpoolJs, vendorSpoolJsxJs } from "./vendor";

export interface DaemonOptions {
	spoolDir: string;
	version: string;
	/** dist/ui — absent in seam tests and unbuilt checkouts. */
	uiDir?: string | undefined;
	/** The OS Trash (#7: spool never manages it) — swapped out by seam tests. */
	moveToTrash?: (paths: string[]) => Promise<void>;
	/** Editor launch for path:line jumps — swapped out by seam tests. */
	launchEditor?: (target: string) => void;
}

/** The player's params (#24): Zod-validated, path-safe names only. */
const playParams = z.object({
	frame: z.string().refine(isSafeName, { message: "not a frame name" }).optional(),
	scenario: z.string().refine(isSafeName, { message: "not a scenario name" }).optional(),
});

type LaunchEditor = (file: string, onError?: (fileName: string, message: string | null) => void) => void;

/** launch-editor is CJS `export =` — createRequire keeps the types honest. */
const launchEditorDefault = createRequire(import.meta.url)("launch-editor") as LaunchEditor;

/**
 * The daemon's Hono app, the primary seam: everything observable rides
 * app.request(), no port needed. The inferred AppType is the compile-time
 * tripwire between daemon and UI once the canvas exists.
 */
export function createDaemonApp({ spoolDir, version, uiDir, moveToTrash, launchEditor }: DaemonOptions) {
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

	// the app-level channel: registry and session changes, fanned to every page
	const appListeners = new Set<(event: AppEvent) => void>();
	const emitAppEvent = (event: AppEvent) => {
		for (const listener of appListeners) listener(event);
	};
	const stopRegistryWatch = watchRegistry(spoolDir, emitAppEvent);

	// the healer needs a dialable origin, which exists only once the server has
	// bound — in-process app.request() never activates it
	let selfOrigin: string | undefined;
	const shots = createShotTaker();
	const healer = createThumbHealer({
		capture: (target) => shots.capture(target),
		stored: (root, frame) => hub.publish(root, { kind: "thumb", frame }),
	});

	function resolveProject(c: Context, name: string): { root: string } | { response: Response } {
		const lookup = lookupProjectByName(spoolDir, name);
		if (lookup.kind === "unknown") {
			return { response: c.text(`unknown project "${name}" — run \`spool open\` in its product root first`, 404) };
		}
		if (lookup.kind === "ambiguous") {
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

	// scenario and fixture reads land in null-origin sandboxed frames — CORS open
	function serveProjectJson(c: Context, result: ProjectJson): Response {
		c.header("access-control-allow-origin", "*");
		if (result.kind === "missing") return c.text(result.message, 404);
		if (result.kind === "invalid") return c.text(result.message, 500);
		c.header("content-type", "application/json; charset=utf-8");
		return c.body(result.json);
	}

	const app = new Hono()
		.get("/api/health", (c) => c.json({ name: "spool", version, pid: process.pid, startedAt }))
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
				await stream.writeSSE({
					event: "hello",
					data: JSON.stringify({ name: "spool", version }),
					id: String(id++),
				});
				const listener = (event: AppEvent) => {
					void stream.writeSSE({ event: "app", data: JSON.stringify(event), id: String(id++) }).catch(() => {});
				};
				appListeners.add(listener);
				stream.onAbort(() => {
					appListeners.delete(listener);
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
			return c.json(listProjectFrames(project.root));
		})
		.get("/api/p/:project/thumbs/:frame", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const frame = c.req.param("frame");
			if (!isSafeName(frame)) return c.text(`not a frame name: "${frame}"`, 404);
			const thumb = readThumb(project.root, frame);
			if (thumb === undefined) {
				// a missing cover heals itself: enqueue the Playwright fallback and
				// let the thumb event tell the canvas to look again
				if (selfOrigin !== undefined && existsSync(join(project.root, "design", "frames", frame, "frame.tsx"))) {
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
			if (c.req.header("if-none-match") === thumb.etag) return c.body(null, 304);
			c.header("etag", thumb.etag);
			c.header("content-type", "image/png");
			return c.body(new Uint8Array(thumb.png));
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
					return c.text('canvas state must be { "mode": "live" | "design", "camera"?: { x, y, k } }', 400);
				}
				return state;
			}),
			(c) => {
				const project = resolveProject(c, c.req.param("project"));
				if ("response" in project) return project.response;
				writeCanvasState(project.root, c.req.valid("json"));
				return c.body(null, 204);
			},
		)
		.get("/api/p/:project/flows", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return c.json(deriveFlows(project.root));
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
					if (!existsSync(join(project.root, "design", "frames", frame, "frame.tsx"))) {
						return c.text(`no frame "${frame}" to walk`, 404);
					}
				}
				recordWalk(project.root, from, to);
				hub.publish(project.root, { kind: "walked" });
				return c.body(null, 204);
			},
		)
		.get("/api/p/:project/verify/:frame", async (c) => {
			// the agent's compile probe (#25): shot and logs branch on this JSON —
			// ok hands the closure etag (the log cache key), error the text verbatim
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const doc = await compiler.getDocument(project.root, c.req.param("frame"));
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
				// all-or-nothing: every frame verified before the first sidecar write
				for (const name of Object.keys(frames)) {
					if (!existsSync(join(project.root, "design", "frames", name, "frame.tsx"))) {
						return c.text(`no frame "${name}" to place`, 404);
					}
				}
				for (const [name, geometry] of Object.entries(frames)) {
					writeGeometry(sidecarFile(project.root, name), geometry);
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
				for (const name of c.req.valid("json").frames) {
					if (!isSafeName(name)) return c.text(`not a frame name: "${name}"`, 400);
					const dir = join(project.root, "design", "frames", name);
					if (!existsSync(join(dir, "frame.tsx"))) return c.text(`no frame "${name}" to trash`, 404);
					dirs.push(dir);
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
				const target = join(project.root, rel);
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
			if (!isSafeName(frame) || !existsSync(join(project.root, "design", "frames", frame, "frame.tsx"))) {
				return c.text(`no frame "${frame}" to cover`, 404);
			}
			const png = Buffer.from(await c.req.arrayBuffer());
			if (png.byteLength === 0) return c.text("empty capture", 400);
			writeThumb(project.root, frame, png);
			hub.publish(project.root, { kind: "thumb", frame });
			return c.body(null, 204);
		})
		.get("/p/:project/frames/:frame", async (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			const doc = await compiler.getDocument(project.root, c.req.param("frame"));
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
				const compiled = await playerCompiler.getBundle(project.root, names);
				if (compiled.kind === "error") return c.html(errorDocument("player", compiled.message), 500);
				const config = {
					project: name,
					start,
					scenario: scenario ?? "default",
					frames: Object.fromEntries(projection.frames.map((entry) => [entry.name, { w: entry.w, h: entry.h }])),
				};
				const etag = playerEtag(compiled.bundle, config);
				if (c.req.header("if-none-match") === etag) return c.body(null, 304);
				c.header("etag", etag);
				c.header("x-spool-cache", compiled.cache);
				return c.html(assemblePlayerDocument(config, compiled.bundle));
			},
		)
		.get("/api/p/:project/scenarios/:name", (c) => {
			const project = resolveProject(c, c.req.param("project"));
			if ("response" in project) return project.response;
			return serveProjectJson(c, readScenario(project.root, c.req.param("name")));
		})
		.get("/api/p/:project/fixtures/:name{.+}", (c) => {
			const project = resolveProject(c, c.req.param("project"));
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
		.get("/vendor/fonts/:file", (c) => {
			// the player chrome's mono rides spool's own install — never a CDN
			const file = chromeFontFile(c.req.param("file"));
			if (file === undefined) return c.text("no such font", 404);
			const etag = `"font-${version}-${c.req.param("file")}"`;
			if (c.req.header("if-none-match") === etag) return c.body(null, 304);
			c.header("etag", etag);
			c.header("cache-control", "public, max-age=0, must-revalidate");
			c.header("content-type", "font/woff2");
			return c.body(new Uint8Array(readFileSync(file)));
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

	async function serveRuntime(c: Context, module: () => Promise<VendorModule>): Promise<Response> {
		c.header("access-control-allow-origin", "*");
		const runtime = await module();
		if (c.req.header("if-none-match") === runtime.etag) return c.body(null, 304);
		c.header("etag", runtime.etag);
		c.header("cache-control", "public, max-age=0, must-revalidate");
		c.header("content-type", "text/javascript; charset=utf-8");
		return c.body(runtime.js);
	}

	function serveUiIndex(c: Context): Response {
		const index = readUiIndex(uiDir);
		if (index === undefined) return c.text(UI_MISSING_NOTICE, 503);
		c.header("content-type", index.contentType);
		c.header("cache-control", index.cacheControl);
		return c.body(new Uint8Array(index.body));
	}

	return {
		app,
		/** Activate origin-dependent work (the thumb healer) once really bound. */
		setSelfOrigin: (origin: string) => {
			selfOrigin = origin;
		},
		close: () => {
			stopRegistryWatch();
			hub.close();
			void shots.close();
		},
	};
}

export type AppType = ReturnType<typeof createDaemonApp>["app"];
