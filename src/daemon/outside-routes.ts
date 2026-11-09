import { Hono } from "hono";
import { isHarness, terminalOf } from "../outside/harness";
import { connect, disconnect, HookInstallError, harnessFiles, hookLines } from "../outside/install";
import type { Payload } from "../outside/session";
import type { Outside } from "./outside";
import { type ResolveProject, withProject } from "./project-route";

/**
 * Agents outside spool (task 531), over HTTP.
 *
 * `/api/hook/:harness` is what a connected harness's hook script posts each event to; the
 * daemon's middleware lets it in by the hook secret alone. The rest is the canvas's and the
 * CLI's: what a project's canvas draws, a `spool` verb saying an agent ran it, and the ask's
 * three answers.
 */
export function outsideRoutes(deps: {
	outside: Outside;
	resolve: ResolveProject;
	spoolDir: string;
	/** where this daemon takes hooks */
	origin: () => string;
}) {
	const { outside, resolve, spoolDir } = deps;
	const harnessOf = (value: string | undefined) => (isHarness(value) ? value : undefined);
	return new Hono()
		.post("/hook/:harness", async (c) => {
			const harness = harnessOf(c.req.param("harness"));
			if (harness === undefined) return c.body(null, 204);
			const payload = (await c.req.json().catch(() => undefined)) as Payload | undefined;
			if (payload === undefined || payload === null || typeof payload !== "object") return c.body(null, 204);
			outside.hook(harness, payload, terminalOf(c.req.header("x-spool-term"), c.req.header("x-spool-app")));
			return c.body(null, 204);
		})
		.get("/outside", (c) =>
			c.json({
				harnesses: (["claude", "codex", "pi"] as const).map((harness) => ({
					harness,
					file: harnessFiles(harness, spoolDir).said,
					connected: outside.connected()[harness] === "connected",
					lines: hookLines(harness, spoolDir),
				})),
			}),
		)
		.post("/outside/:harness/:act", (c) => {
			const harness = harnessOf(c.req.param("harness"));
			const act = c.req.param("act");
			if (harness === undefined) return c.text("no such agent", 404);
			try {
				if (act === "connect") connect(harness, spoolDir, deps.origin());
				else if (act === "disconnect") disconnect(harness, spoolDir);
				else if (act === "later") return c.json(outside.later(harness));
				else if (act !== "changed") return c.text("not found", 404);
			} catch (error) {
				if (error instanceof HookInstallError) return c.json({ error: error.message }, 409);
				throw error;
			}
			outside.changed(harness);
			return c.json({ file: harnessFiles(harness, spoolDir).said });
		})
		.get("/p/:project/outside", (c) =>
			withProject(c, resolve, (root) => {
				c.header("cache-control", "no-store");
				return c.json(outside.view(root));
			}),
		)
		.post("/p/:project/outside/notice", (c) =>
			withProject(c, resolve, async (root) => {
				const { harness } = ((await c.req.json().catch(() => ({}))) ?? {}) as { harness?: unknown };
				if (!isHarness(harness)) return c.text("no such agent", 400);
				outside.notice(root, harness);
				return c.body(null, 204);
			}),
		)
		.post("/p/:project/outside/open", (c) =>
			withProject(c, resolve, async (root) => {
				const { id } = ((await c.req.json().catch(() => ({}))) ?? {}) as { id?: unknown };
				if (typeof id !== "string") return c.text("which session?", 400);
				return (await outside.open(root, id)) ? c.body(null, 204) : c.text("could not bring it forward", 409);
			}),
		);
}
