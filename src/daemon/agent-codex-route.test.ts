import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentReader, makeApp, makeProject, makeTempDir, scriptedAgentExecutor } from "../test-helpers";
import type { AgentEvent } from "./agent-events";

const THREAD = "3c2b1a09-8f7e-4d6c-9b5a-4a3b2c1d0e0f";

/** a daemon whose Codex answers from recorded sessions */
function codexDaemon(...captures: [string, ...string[]]) {
	const spoolDir = join(makeTempDir(), ".spool");
	const { name } = makeProject(spoolDir);
	const scripted = scriptedAgentExecutor(...captures);
	const app = makeApp(spoolDir, { agentExecutor: scripted.executor });
	return { app, name, ...scripted };
}

describe("codex through the daemon", () => {
	it("is one of the engines the daemon runs", async () => {
		const { app, name } = codexDaemon("codex-turn");
		const body = (await (await app.request(`/api/p/${name}/agent/engines`)).json()) as {
			engines: { id: string; installed: boolean }[];
		};
		expect(body.engines.map((engine) => engine.id)).toContain("codex");
	});

	it("runs a thread's turn on codex once it is the chosen agent, and answers its approvals", async () => {
		const { app, name, spawned } = codexDaemon("codex-ask");
		const chose = await app.request(`/api/p/${name}/agent/engines`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ preferred: "codex" }),
		});
		expect(chose.status).toBe(200);
		const mode = await app.request(`/api/p/${name}/agent/threads/${THREAD}/permissions`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ mode: "ask" }),
		});
		expect(mode.status).toBe(200);
		const turn = app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ thread: THREAD, said: [{ prompt: "go" }] }),
		});
		const events = agentReader(await turn);
		const seen: AgentEvent[] = [];
		for (;;) {
			const event = (await events.next(5000)).data as AgentEvent;
			seen.push(event);
			if (event.kind === "asking")
				await app.request(`/api/p/${name}/agent/answer`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ request: event.request, reply: { kind: "allow" } }),
				});
			if (event.kind === "closed") break;
		}
		expect(spawned[0]?.spawn.command).toBe("codex");
		expect(spawned[0]?.mismatches).toEqual([]);
		const start = spawned[0]?.inputs.map((line) => JSON.parse(line)).find((line) => line.method === "thread/start");
		expect(start.params).toMatchObject({ approvalPolicy: "untrusted", sandbox: "workspace-write" });
		expect(seen.filter((event) => event.kind === "asking")).toHaveLength(1);
		expect(seen.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
	});
});
