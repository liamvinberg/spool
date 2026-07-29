import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	fixtureAgentExecutor,
	makeApp,
	makeProject,
	makeTempDir,
	readCapture,
	replayAgentExecutor,
	sseReader,
	until,
} from "../test-helpers";
import type { AgentEvent } from "./agent-events";
import { agentFraming } from "./agent-spawn";
import { startAgentTurn } from "./agent-turn";

/** Every event of one turn, read off the stream the way a client would. */
async function drainTurn(res: Response, limit = 4000): Promise<AgentEvent[]> {
	const events = sseReader(res);
	const seen: AgentEvent[] = [];
	while (seen.length < limit) {
		let next: Awaited<ReturnType<typeof events.next>>;
		try {
			next = await events.next(2000);
		} catch {
			break;
		}
		seen.push(next.data as AgentEvent);
		if ((next.data as AgentEvent).kind === "closed") break;
	}
	return seen;
}

function startTurn(name: string, app: ReturnType<typeof makeApp>, prompt = "make these consistent") {
	return app.request(`/api/p/${name}/agent/turn`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ prompt }),
	});
}

describe("one turn over the wire", () => {
	it("spawns the developer's agent and streams its events back in order", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const agent = replayAgentExecutor("claude-turn");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const events = await drainTurn(res);

		// the agent stands in the product root, not in design/
		expect(agent.spawned).toHaveLength(1);
		expect(agent.spawned[0]?.spawn.cwd).toBe(root);
		expect(events[0]?.kind).toBe("ready");
		expect(events.at(-1)?.kind).toBe("closed");
		// the order is the wire's, not a reassembly of it
		const kinds = events.map((event) => event.kind);
		// this window opens mid-stream, on a tool call whose arguments are already
		// arriving — so the prefix is the capture's, not a tidy one
		expect(kinds.slice(0, 6)).toEqual(["ready", "limit", "call-input", "call-input", "called", "call"]);
		expect(kinds.filter((kind) => kind === "ended")).toHaveLength(1);
		expect(kinds.indexOf("ended")).toBe(kinds.length - 2);
	});

	it("sends the prompt as one line of structured input", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = replayAgentExecutor("claude-compact");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		await drainTurn(await startTurn(name, app, "tidy up the cart"));

		const written = agent.spawned[0]?.inputs ?? [];
		expect(written).toHaveLength(1);
		expect(JSON.parse(written[0] as string)).toEqual({
			type: "user",
			message: { role: "user", content: [{ type: "text", text: "tidy up the cart" }] },
		});
	});

	it("carries the settled arguments and puts no API key in the environment", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = replayAgentExecutor("claude-compact");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		await drainTurn(await startTurn(name, app));

		const spawn = agent.spawned[0]?.spawn;
		const args = spawn?.args ?? [];
		expect(spawn?.command).toBe("claude");
		expect(args).toContain("--include-partial-messages");
		expect(args[args.indexOf("--setting-sources") + 1]).toBe("user");
		expect(args[args.indexOf("--permission-mode") + 1]).toBe("default");
		// the agent really arrives knowing what spool is: this is the text the
		// child is handed, not a function a test called on its own
		expect(args[args.indexOf("--append-system-prompt") + 1]).toBe(agentFraming());
		// no key is configured, asked for, or stored anywhere in this path
		expect(JSON.stringify(spawn?.args)).not.toMatch(/API_KEY|sk-ant/i);
		expect(Object.keys(spawn?.env ?? {}).filter((key) => /API_KEY/i.test(key))).toEqual(
			Object.keys(process.env).filter((key) => /API_KEY/i.test(key)),
		);
	});

	it("closes stdin when the result lands rather than killing the process", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = replayAgentExecutor("claude-fanout");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		await drainTurn(await startTurn(name, app));

		expect(agent.spawned[0]?.ended).toBe(true);
		expect(agent.spawned[0]?.killed).toBe(false);
	});

	it("distinguishes an interrupted turn from a clean one at the client", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: replayAgentExecutor("claude-interrupt").executor });

		const events = await drainTurn(await startTurn(name, app));

		const ended = events.find((event) => event.kind === "ended");
		expect(ended?.kind === "ended" && ended.ending).toBe("stopped");
		expect(ended?.kind === "ended" && ended.reason).toBe("aborted_streaming");
	});

	it("reports a binary that never started rather than hanging", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor((proc) => proc.exit(null, "spawn claude ENOENT"));
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const events = await drainTurn(await startTurn(name, app));

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({ kind: "closed", code: null, message: "spawn claude ENOENT", parent: null });
	});

	it("takes the process with the turn that was abandoned", async () => {
		// a fixture that answers nothing: the turn is still in flight when whoever
		// asked for it goes away
		const agent = fixtureAgentExecutor(() => {});
		const turn = startAgentTurn({ executor: agent.executor, root: "/tmp/product", content: [] });
		const seen: AgentEvent[] = [];
		const reading = (async () => {
			for await (const event of turn.events) seen.push(event);
		})();
		await until(() => agent.spawned.length === 1);

		turn.stop();
		await reading;

		expect(agent.spawned[0]?.killed).toBe(true);
		// nothing of the turn arrived, and the stream says it is over rather than
		// leaving a reader hanging on a process that is gone
		expect(seen).toEqual([{ kind: "closed", code: null, parent: null }]);
	});

	it("replays every capture end to end", async () => {
		for (const capture of ["claude-plan", "claude-edits", "claude-mcp"] as const) {
			const spoolDir = join(makeTempDir(), ".spool");
			const { name } = makeProject(spoolDir);
			const app = makeApp(spoolDir, { agentExecutor: replayAgentExecutor(capture).executor });

			const events = await drainTurn(await startTurn(name, app));

			expect(events.length).toBeGreaterThan(readCapture(capture).length / 2);
			expect(events.at(-1)?.kind).toBe("closed");
			expect(events.some((event) => event.kind === "ready")).toBe(true);
		}
	});
});

describe("the door", () => {
	it("refuses a turn without a prompt, an unknown project, and no control token", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor(() => {});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		const post = (path: string, body: unknown) =>
			app.request(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

		expect((await post(`/api/p/${name}/agent/turn`, { prompt: "  " })).status).toBe(400);
		expect((await post(`/api/p/${name}/agent/turn`, {})).status).toBe(400);
		expect((await post("/api/p/ghost/agent/turn", { prompt: "go" })).status).toBe(404);
		// spawning is the daemon's authority and nobody else's: without the
		// control capability this door does not open at all
		const uninvited = await app.fetch(`/api/p/${name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ prompt: "go" }),
		});
		expect(uninvited.status).toBe(401);
		// nothing spawned for any of them
		expect(agent.spawned).toHaveLength(0);
	});
});
