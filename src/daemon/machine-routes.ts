import { Hono } from "hono";
import { validator } from "hono/validator";
import type { createCloudAccount } from "./cloud-account";
import type { ResolveProject } from "./project-route";
import {
	type AppEvent,
	orderSession,
	readSession,
	updateSession,
	visitProject,
	type watchMachineState,
} from "./session";
import type { createSettingsStore } from "./settings";

/**
 * This machine's own state over HTTP, mounted under `/api`: who it is signed in to spool.page as, the
 * tabs it has open, and its settings (#281).
 */
export function machineRoutes(deps: {
	resolve: ResolveProject;
	spoolDir: string;
	cloudAccount: ReturnType<typeof createCloudAccount>;
	settings: ReturnType<typeof createSettingsStore>;
	/** The registry and session files this daemon wrote itself, so their watch does not hear them as news. */
	machineStateWatch: Pick<ReturnType<typeof watchMachineState>, "acknowledgeRegistry" | "acknowledgeSession">;
	emitAppEvent: (event: AppEvent) => void;
	/** The history setting changed: who keeps history is decided again now. */
	historyChanged: () => void;
}) {
	const { spoolDir, cloudAccount, settings, machineStateWatch, emitAppEvent } = deps;
	return (
		new Hono()
			.get("/cloud/account", async (c) => c.json(await cloudAccount.read()))
			.post("/cloud/account/sign-in", async (c) => {
				cloudAccount.signIn();
				return c.json(await cloudAccount.read(), 202);
			})
			.post("/cloud/account/reopen", (c) => c.json({ reopened: cloudAccount.reopen() }))
			.post("/cloud/account/cancel", (c) => {
				cloudAccount.cancel();
				return c.body(null, 204);
			})
			.post("/cloud/account/changed", (c) => {
				cloudAccount.changed();
				return c.body(null, 204);
			})
			.post("/cloud/account/sign-out", async (c) => {
				try {
					await cloudAccount.signOut();
				} catch (error) {
					return c.text(error instanceof Error ? error.message : "could not sign out", 503);
				}
				return c.json(await cloudAccount.read());
			})
			.get("/session", (c) => c.json(readSession(spoolDir)))
			.put(
				"/session",
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
			// the tab this page landed on or switched to: recent is where you were last
			// on this Mac. The page that said so updates its own cards; the others hear
			// nothing, so a tab switch costs no page a walk of every project.
			.put(
				"/session/active",
				validator("json", (value, c) => {
					const { root } = value as { root?: unknown };
					if (typeof root !== "string") return c.text('an active tab must be { "root": string }', 400);
					return { root };
				}),
				(c) => {
					const result = visitProject(spoolDir, c.req.valid("json").root);
					if (result.kind === "unregistered") {
						return c.text(`not a registered project root: ${result.root}`, 400);
					}
					machineStateWatch.acknowledgeRegistry(result.registry);
					return c.json({ openedAt: result.openedAt });
				},
			)
			// tabs dragged into an arrangement: the list is the whole mutation, and it
			// opens and closes nothing — a root it no longer names stays open
			.put(
				"/session/order",
				validator("json", (value, c) => {
					const { order } = value as { order?: unknown };
					if (!Array.isArray(order) || order.some((root) => typeof root !== "string")) {
						return c.text('a tab arrangement must be { "order": string[] }', 400);
					}
					return { order: order as string[] };
				}),
				(c) => {
					const session = orderSession(spoolDir, c.req.valid("json").order);
					machineStateWatch.acknowledgeSession(session);
					emitAppEvent({ kind: "session" });
					return c.body(null, 204);
				},
			)
			// #281: the settings registry with its values, for one project or for none.
			// A project setting asked for without a project reads as its default.
			.get("/settings", (c) => {
				const name = c.req.query("project");
				if (name === undefined || name === "") return c.json(settings.read());
				const project = deps.resolve(c, name);
				if ("response" in project) return project.response;
				return c.json(settings.read(project.root));
			})
			.put(
				"/settings",
				validator("json", (value, c) => {
					// one write, or several under `writes`; several are checked as a set
					// and land as one, which is what a theme of ten tokens needs
					const shape =
						'a setting write is { "key", "value", "project"? } or { "writes": [{ "key", "value" }], "project"? }';
					const body = (typeof value === "object" && value !== null ? value : {}) as {
						key?: unknown;
						value?: unknown;
						writes?: unknown;
						project?: unknown;
					};
					if (body.project !== undefined && typeof body.project !== "string") return c.text(shape, 400);
					if (Array.isArray(body.writes)) {
						for (const write of body.writes as unknown[]) {
							const { key } = (typeof write === "object" && write !== null ? write : {}) as { key?: unknown };
							if (typeof key !== "string") return c.text(shape, 400);
						}
						return body as { writes: { key: string; value: unknown }[]; project?: string };
					}
					if (typeof body.key !== "string") return c.text(shape, 400);
					return body as { key: string; value: unknown; project?: string };
				}),
				(c) => {
					const body = c.req.valid("json");
					let root: string | undefined;
					if (body.project !== undefined) {
						const project = deps.resolve(c, body.project);
						if ("response" in project) return project.response;
						root = project.root;
					}
					const one = !("writes" in body);
					const writes = "writes" in body ? body.writes : [{ key: body.key, value: body.value }];
					const written = settings.writeMany(writes, root);
					if (!written.ok) return c.text(written.reason, written.status);
					// history reads its flag off canvas.json at every window, but a project
					// switched on has to be picked up now rather than at the next arrival
					if (writes.some((write) => write.key === "history")) deps.historyChanged();
					emitAppEvent({ kind: "settings" });
					return c.json(one ? written.readings[0] : written.readings);
				},
			)
	);
}
