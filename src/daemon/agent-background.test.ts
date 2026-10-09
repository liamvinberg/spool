import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	agentReader,
	type FakeAgentProc,
	fixtureAgentExecutor,
	makeApp,
	makeProject,
	makeTempDir,
	readCapture,
	until,
	writeFrame,
} from "../test-helpers";
import { createBackgroundHold } from "./agent-background";
import type { AgentEvent } from "./agent-events";

/*
 * A turn ends when its engine has answered and no designer it started still runs (#365).
 *
 * Read off `claude-background.json`, a real turn: the main agent answered at 8 seconds
 * with two background designers running, was woken by each one landing, and answered
 * for good once the set was empty. The turn is the whole of that. What the designers
 * wrote is `agent-frames.test.ts`'s.
 */

const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

function startTurn(name: string, app: ReturnType<typeof makeApp>, turn = "t1") {
	return app.request(`/api/p/${name}/agent/turn`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ thread: THREAD, turn, said: [{ prompt: "two directions for hello, one designer each" }] }),
	});
}

/** the capture, a line at a time, up to `stopAt` */
async function replay(proc: FakeAgentProc, stopAt = Number.POSITIVE_INFINITY): Promise<void> {
	for (const [index, line] of readCapture("claude-background").entries()) {
		if (index >= stopAt) return;
		proc.emit(JSON.stringify(line));
		await new Promise((resolve) => setImmediate(resolve));
	}
}

describe("a turn with designers in the background", () => {
	it("holds through the agent's early answers and ends on the last one", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "hello", "export default () => <p>hello</p>;\n");
		const agent = fixtureAgentExecutor();
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app);
		await until(() => agent.spawned.length === 1);
		const proc = agent.spawned[0] as FakeAgentProc;
		const seen: AgentEvent[] = [];
		const reading = (async () => {
			const events = agentReader(res);
			for (;;) {
				const next = await events.next(15_000);
				seen.push(next.data as AgentEvent);
				if ((next.data as AgentEvent).kind === "closed") return;
			}
		})();
		await replay(proc);
		await until(() => seen.some((event) => event.kind === "ended"));
		proc.exit(0);
		await reading;

		const kinds = seen.map((event) => event.kind);
		// three results on the wire, one ending: the two before the set emptied held
		expect(
			readCapture("claude-background").filter((line) => (line as { type?: string }).type === "result"),
		).toHaveLength(3);
		expect(kinds.filter((kind) => kind === "ended")).toHaveLength(1);
		expect(
			seen.filter((event) => event.kind === "holding").map((event) => event.kind === "holding" && event.tasks),
		).toEqual([2, 1]);
		expect(kinds.indexOf("ended")).toBeGreaterThan(kinds.lastIndexOf("task-done"));
		// and stdin stayed open until then: closing it is what took the designers with it
		expect(proc.ended).toBe(true);
	});

	it("ends the designers with the turn when Stop is pressed", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "hello", "export default () => <p>hello</p>;\n");
		const agent = fixtureAgentExecutor();
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app);
		await until(() => agent.spawned.length === 1);
		const proc = agent.spawned[0] as FakeAgentProc;
		const seen: AgentEvent[] = [];
		const reading = (async () => {
			const events = agentReader(res);
			for (;;) {
				const next = await events.next(15_000);
				seen.push(next.data as AgentEvent);
				if ((next.data as AgentEvent).kind === "closed") return;
			}
		})();
		// up to the agent's first answer, with both designers still running
		await replay(proc, 240);
		await until(() => seen.some((event) => event.kind === "holding"));
		expect(proc.ended).toBe(false);

		const stopped = await app.request(`/api/p/${name}/agent/interrupt`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ turn: "t1" }),
		});
		expect(stopped.status).toBe(204);
		await until(() => seen.some((event) => event.kind === "ended"));
		proc.exit(0);
		await reading;

		const asked = proc.inputs
			.slice(1)
			.map((line) => JSON.parse(line) as { request?: { subtype?: string; task_id?: string } });
		expect(asked.map((line) => line.request?.subtype)).toEqual(["interrupt", "stop_task", "stop_task"]);
		expect(asked.slice(1).map((line) => line.request?.task_id)).toEqual(["a333817c7dc56d393", "a102d1706d2f45a67"]);
		const ended = seen.find((event) => event.kind === "ended");
		expect(ended?.kind === "ended" && ended.ending).toBe("stopped");
		expect(proc.ended).toBe(true);
	});
});

describe("a turn with a shell in the background", () => {
	it("ends on the agent's answer while the shell runs on", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor();
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app);
		await until(() => agent.spawned.length === 1);
		const proc = agent.spawned[0] as FakeAgentProc;
		const seen: AgentEvent[] = [];
		const reading = (async () => {
			const events = agentReader(res);
			for (;;) {
				const next = await events.next(15_000);
				seen.push(next.data as AgentEvent);
				if ((next.data as AgentEvent).kind === "closed") return;
			}
		})();
		// claude-background.json's shape, for a `run_in_background` Bash rather than a designer:
		// the set changes, then the task starts, then the agent answers
		const shell = { task_id: "b7k2q9", task_type: "local_bash", description: "pnpm dev" };
		for (const line of [
			{ type: "system", subtype: "init", session_id: THREAD, cwd: root },
			{
				type: "assistant",
				parent_tool_use_id: null,
				session_id: THREAD,
				message: {
					id: "m1",
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_shell",
							name: "Bash",
							input: { command: "pnpm dev", run_in_background: true },
						},
					],
				},
			},
			{ type: "system", subtype: "background_tasks_changed", tasks: [shell], session_id: THREAD },
			{ type: "system", subtype: "task_started", ...shell, tool_use_id: "toolu_shell", session_id: THREAD },
			{
				type: "user",
				parent_tool_use_id: null,
				session_id: THREAD,
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_shell",
							content: "Command running in background with ID: b7k2q9",
						},
					],
				},
			},
			{ type: "result", subtype: "success", is_error: false, result: "The dev server is up.", session_id: THREAD },
		])
			proc.emit(JSON.stringify(line));

		await until(() => seen.some((event) => event.kind === "ended"));
		expect(seen.some((event) => event.kind === "holding")).toBe(false);
		expect(seen.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
		// stdin closed on the answer: the shell is the agent's to leave running
		expect(proc.ended).toBe(true);
		proc.exit(0);
		await reading;
	});
});

describe("the hold", () => {
	const ended = { kind: "ended", ending: "done", parent: null } as unknown as AgentEvent;

	it("ends at once when nothing runs, and never counts a background shell", () => {
		const hold = createBackgroundHold({ wakes: true });
		expect(
			hold.read({
				kind: "background",
				tasks: [{ task: "b1", description: "dev server", agent: null, type: "local_bash" }],
				parent: null,
			}).over,
		).toBe(false);
		expect(hold.read(ended).over).toBe(true);
	});

	it("never counts a background shell that starts after the set names it", () => {
		const hold = createBackgroundHold({ wakes: true });
		hold.read({
			kind: "task-started",
			task: "b1",
			call: "x",
			description: "pnpm dev",
			agent: null,
			prompt: null,
			type: "local_bash",
			parent: null,
		});
		expect(hold.running()).toEqual([]);
		expect(hold.read(ended).over).toBe(true);
	});

	const started = {
		kind: "task-started",
		task: "c1",
		call: "x",
		description: null,
		agent: null,
		prompt: null,
		parent: null,
	} as const satisfies AgentEvent;
	const landed = { kind: "task-done", task: "c1", status: null, summary: null, parent: null } as const;

	it("holds an ending under running tasks, and ends on the woken agent's answer after they land", () => {
		const hold = createBackgroundHold({ wakes: true });
		hold.read(started);
		const first = hold.read(ended);
		expect(first.over).toBe(false);
		expect(first.events).toEqual([{ kind: "holding", tasks: 1, parent: null }]);
		// landed, and no clock: the turn waits for the answer the landing wakes
		expect(hold.read(landed)).toEqual({ events: [landed], over: false });
		const answer = { ...ended, reason: "both written" } as AgentEvent;
		expect(hold.read(answer)).toEqual({ events: [answer], over: true });
	});

	it("lets the held ending go as the last task lands, for an engine that does not wake its agent", () => {
		const hold = createBackgroundHold({ wakes: false });
		hold.read(started);
		expect(hold.read(ended).over).toBe(false);
		expect(hold.read(landed)).toEqual({ events: [landed, ended], over: true });
	});

	it("ends a held turn at once on Stop, as stopped", () => {
		const hold = createBackgroundHold({ wakes: true });
		hold.read(started);
		hold.read(ended);
		expect(hold.running()).toEqual(["c1"]);
		expect(hold.stop()).toMatchObject({ kind: "ended", ending: "stopped" });
	});
});
