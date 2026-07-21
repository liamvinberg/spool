import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { lookupProjectByName } from "../registry";
import { createFrameCompiler } from "./compile";
import { createChangeHub } from "./events";
import { reactVersion, vendorReactJs } from "./vendor";

export interface DaemonOptions {
	spoolDir: string;
	version: string;
}

/**
 * The daemon's Hono app, the primary seam: everything observable rides
 * app.request(), no port needed. The inferred AppType is the compile-time
 * tripwire between daemon and UI once the canvas exists.
 */
export function createDaemonApp({ spoolDir, version }: DaemonOptions) {
	const startedAt = new Date().toISOString();
	const compiler = createFrameCompiler(version);
	const hub = createChangeHub();

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

	const app = new Hono()
		.get("/api/health", (c) => c.json({ name: "spool", version, pid: process.pid, startedAt }))
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
		});

	return { app, close: () => hub.close() };
}

export type AppType = ReturnType<typeof createDaemonApp>["app"];
