import { Hono } from "hono";
import { isAgentEngineId } from "./agent-engine";
import { type AgentSetup, isPiKeyProvider } from "./agent-setup";

/**
 * The machine's agents over HTTP, mounted under `/api` (spool#250): what the first run's
 * Agents step draws, and the presses on it. No project in the path, because an agent is
 * installed and signed in for the whole machine. Each change arrives on `/api/events` as
 * an `agents` event carrying the whole list.
 */
export function agentSetupRoutes(setup: AgentSetup) {
	return (
		new Hono()
			// every agent asked again: a `which` each, and the agent's own word on who is signed in
			.get("/agents", async (c) => c.json(await setup.read(c.req.raw.signal)))
			.post("/agents/:engine/:action{install|sign-in|cancel}", (c) => {
				const id = c.req.param("engine");
				if (!isAgentEngineId(id)) return c.text("unknown engine", 404);
				const action = c.req.param("action");
				if (action === "cancel") {
					setup.cancel(id);
					return c.body(null, 204);
				}
				const refused = action === "install" ? setup.install(id) : setup.signIn(id);
				if (refused !== undefined) return c.text(refused.refused, refused.status);
				return c.json(setup.snapshot(), 202);
			})
			.post("/agents/:engine/code", async (c) => {
				const id = c.req.param("engine");
				const body = (await c.req.json().catch(() => ({}))) as { code?: unknown };
				if (!isAgentEngineId(id) || typeof body.code !== "string" || body.code.trim() === "")
					return c.text('a code is { "code": "…" }', 400);
				if (!setup.code(id, body.code)) return c.text("no sign-in is waiting for a code", 409);
				return c.body(null, 204);
			})
			.post("/agents/pi/key", async (c) => {
				const body = (await c.req.json().catch(() => ({}))) as { provider?: unknown; key?: unknown };
				if (!isPiKeyProvider(body.provider) || typeof body.key !== "string" || body.key.trim() === "")
					return c.text('a key is { "provider": "<pi provider>", "key": "…" }', 400);
				return c.json(await setup.piKey(body.provider, body.key));
			})
	);
}
