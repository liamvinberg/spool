import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	agentReader,
	type FakeAgentProc,
	fixtureAgentExecutor,
	makeApp,
	makeProject,
	makeTempDir,
	readCapture,
	until,
	writeDesignFile,
	writeFrame,
} from "../test-helpers";
import { createBackgroundHold } from "./agent-background";
import type { AgentEvent } from "./agent-events";
import { sourceWritten } from "./agent-frames";

/*
 * A turn ends when its engine has answered and no designer it started still runs (#365).
 *
 * Read off `claude-background.json`, a real turn: the main agent answered at 8 seconds
 * with two background designers running, was woken by each one landing, and answered
 * for good once the set was empty. The turn is the whole of that, and the frames the
 * designers wrote with shell heredocs are the turn's, read off design/.
 */

const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

afterEach(() => {
	vi.useRealTimers();
});

function startTurn(name: string, app: ReturnType<typeof makeApp>, turn = "t1") {
	return app.request(`/api/p/${name}/agent/turn`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ thread: THREAD, turn, said: [{ prompt: "two directions for hello, one designer each" }] }),
	});
}

type Line = Record<string, unknown> & {
	type?: string;
	message?: {
		content?: {
			type?: string;
			id?: string;
			name?: string;
			input?: { command?: string };
			tool_use_id?: string;
			is_error?: boolean;
		}[];
	};
};

/**
 * The capture, a line at a time, with the disk doing what the recorded shell did: when a
 * heredoc's result comes back without an error, the frame it wrote is written into the
 * test's project, and the replay waits for the turn to have seen it, as the binary's next
 * line would only come after the write.
 */
async function replayWithWrites(
	proc: FakeAgentProc,
	root: string,
	seen: () => readonly AgentEvent[],
	stopAt = Number.POSITIVE_INFINITY,
): Promise<void> {
	const capture = readCapture("claude-background") as Line[];
	const commands = new Map<string, string>();
	for (const [index, line] of capture.entries()) {
		if (index >= stopAt) return;
		for (const block of line.message?.content ?? []) {
			if (block.type === "tool_use" && block.id !== undefined && typeof block.input?.command === "string")
				commands.set(block.id, block.input.command);
			if (block.type !== "tool_result" || block.is_error === true) continue;
			const command = commands.get(block.tool_use_id ?? "");
			const written = command === undefined ? undefined : sourceWritten("Bash", JSON.stringify({ command }));
			if (written === undefined) continue;
			writeFrame(root, written.frame, written.source);
			await until(() =>
				seen().some(
					(event) => event.kind === "frame" && event.frame === written.frame && event.change === "created",
				),
			);
		}
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
		await replayWithWrites(proc, root, () => seen);
		await until(() => seen.some((event) => event.kind === "ended"));
		proc.exit(0);
		await reading;

		const kinds = seen.map((event) => event.kind);
		// three results on the wire, one ending: the two before the set emptied held
		expect(readCapture("claude-background").filter((line) => (line as Line).type === "result")).toHaveLength(3);
		expect(kinds.filter((kind) => kind === "ended")).toHaveLength(1);
		expect(
			seen.filter((event) => event.kind === "holding").map((event) => event.kind === "holding" && event.tasks),
		).toEqual([2, 1]);
		expect(kinds.indexOf("ended")).toBeGreaterThan(kinds.lastIndexOf("task-done"));
		// and stdin stayed open until then: closing it is what took the designers with it
		expect(proc.ended).toBe(true);

		// each designer's frame is the turn's, attributed to its delegation and its task
		const created = seen.filter((event) => event.kind === "frame" && event.change === "created");
		expect(created.map((event) => event.kind === "frame" && event.frame).sort()).toEqual([
			"hello-calm",
			"hello-loud",
		]);
		const calm = created.find((event) => event.kind === "frame" && event.frame === "hello-calm");
		expect(calm?.kind === "frame" && calm.parent).toBe("toolu_01ET9HqZdgzmqYVbLxg15uMn");
		expect(calm?.kind === "frame" && calm.task).toBe("a333817c7dc56d393");
		expect(calm?.kind === "frame" && calm.lines).toBe(18);
		expect(calm?.kind === "frame" && calm.spot).toBe("hello-calm");

		// each held a spot the moment it started, named from its task, and its frame landed there
		const held = seen.filter((event) => event.kind === "spot" && event.state === "held");
		expect(held.map((event) => event.kind === "spot" && event.name)).toEqual(["hello-calm", "hello-loud"]);
		const spot = held[0];
		const sidecar = JSON.parse(readFileSync(join(root, "design/frames/hello-calm/frame.json"), "utf8")) as {
			x: number;
			y: number;
		};
		expect(spot?.kind === "spot" && { x: spot.x, y: spot.y }).toEqual({ x: sidecar.x, y: sidecar.y });
		expect(seen.filter((event) => event.kind === "spot" && event.state === "filled")).toHaveLength(2);
		expect(seen.filter((event) => event.kind === "spot" && event.state === "released")).toHaveLength(0);
		// the two spots stood clear of each other and of the frame that was there
		const second = held[1];
		expect(second?.kind === "spot" && spot?.kind === "spot" && second.x !== spot.x).toBe(true);
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
		await replayWithWrites(proc, root, () => seen, 240);
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
		// the spots the designers never filled went with them
		expect(seen.filter((event) => event.kind === "spot" && event.state === "released")).toHaveLength(2);
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
		const hold = createBackgroundHold({ settleMs: 0, onSettled: () => {} });
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
		const hold = createBackgroundHold({ settleMs: 0, onSettled: () => {} });
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

	it("holds an ending under running tasks and lets it go after the settle clock", () => {
		vi.useFakeTimers();
		const settled: AgentEvent[] = [];
		const hold = createBackgroundHold({ settleMs: 3000, onSettled: (event) => settled.push(event) });
		hold.read({
			kind: "task-started",
			task: "c1",
			call: "x",
			description: null,
			agent: null,
			prompt: null,
			parent: null,
		});
		const first = hold.read(ended);
		expect(first.over).toBe(false);
		expect(first.events).toEqual([{ kind: "holding", tasks: 1, parent: null }]);
		expect(hold.read({ kind: "task-done", task: "c1", status: null, summary: null, parent: null }).over).toBe(false);
		vi.advanceTimersByTime(2999);
		expect(settled).toHaveLength(0);
		vi.advanceTimersByTime(1);
		expect(settled).toEqual([ended]);
	});

	it("ends a held turn at once on Stop, as stopped", () => {
		const hold = createBackgroundHold({ settleMs: 3000, onSettled: () => {} });
		hold.read({
			kind: "task-started",
			task: "c1",
			call: "x",
			description: null,
			agent: null,
			prompt: null,
			parent: null,
		});
		hold.read(ended);
		expect(hold.running()).toEqual(["c1"]);
		expect(hold.stop()).toMatchObject({ kind: "ended", ending: "stopped" });
		hold.close();
	});
});

describe("put back", () => {
	it("writes a deleted frame back from the source the turn kept, and refuses one that stands", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "doomed", "export default () => <p>one</p>;\n");
		writeDesignFile(root, "frames/doomed/frame.json", '{ "x": 40, "y": 60, "w": 390, "h": 844 }\n');
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
		proc.emit(JSON.stringify({ type: "system", subtype: "init", session_id: THREAD, cwd: root }));
		rmSync(join(root, "design/frames/doomed"), { recursive: true });
		await until(() => seen.some((event) => event.kind === "frame" && event.change === "deleted"));
		const deleted = seen.find((event) => event.kind === "frame" && event.change === "deleted");
		expect(deleted?.kind === "frame" && deleted.source).toBe("export default () => <p>one</p>;\n");

		const put = (body: unknown) =>
			app.request(`/api/p/${name}/agent/put-back`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
		expect((await put({ thread: THREAD, frame: "../escape" })).status).toBe(404);
		expect((await put({ thread: THREAD, frame: "../escape", source: "x" })).status).toBe(400);
		expect((await put({ thread: THREAD, frame: "doomed" })).status).toBe(204);
		expect(readFileSync(join(root, "design/frames/doomed/frame.tsx"), "utf8")).toBe(
			"export default () => <p>one</p>;\n",
		);
		expect(JSON.parse(readFileSync(join(root, "design/frames/doomed/frame.json"), "utf8"))).toMatchObject({
			x: 40,
			y: 60,
		});
		expect((await put({ thread: THREAD, frame: "doomed", source: "x" })).status).toBe(409);
		expect(existsSync(join(root, "design/escape"))).toBe(false);

		// and the turn does not take the restore as the agent's own work
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(seen.filter((event) => event.kind === "frame" && event.change === "created")).toHaveLength(0);
		proc.emit(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: THREAD }));
		proc.exit(0);
		await reading;
	});
});

describe("a frame the main agent writes", () => {
	it("streams its source a line at a time and reports the change with its lines", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "home", "line 1\nline 2\nline 3\n");
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
		const stream = (event: unknown) =>
			proc.emit(JSON.stringify({ type: "stream_event", event, parent_tool_use_id: null, session_id: THREAD }));
		stream({ type: "message_start", message: { id: "m1" } });
		stream({
			type: "content_block_start",
			index: 0,
			content_block: { type: "tool_use", id: "w1", name: "Write", input: {} },
		});
		const input = JSON.stringify({
			file_path: `${root}/design/frames/home/frame.tsx`,
			content: "line 1\nline two\nline 3\nline 4\n",
		});
		for (let at = 0; at < input.length; at += 7)
			stream({
				type: "content_block_delta",
				index: 0,
				delta: { type: "input_json_delta", partial_json: input.slice(at, at + 7) },
			});
		await until(() => seen.some((event) => event.kind === "frame-source" && event.lines === 4));
		const sources = seen.filter((event) => event.kind === "frame-source");
		expect(sources.map((event) => event.kind === "frame-source" && event.text).join("")).toBe(
			"line 1\nline two\nline 3\nline 4\n",
		);
		// a line at a time, never the whole again
		expect(sources.map((event) => event.kind === "frame-source" && event.lines)).toEqual([1, 2, 3, 4]);

		writeFileSync(join(root, "design/frames/home/frame.tsx"), "line 1\nline two\nline 3\nline 4\n");
		await until(() => seen.some((event) => event.kind === "frame" && event.change === "changed"));
		const changed = seen.find((event) => event.kind === "frame" && event.change === "changed");
		expect(changed).toMatchObject({ frame: "home", lines: 4, range: { from: 2, to: 4 }, call: "w1" });
		proc.emit(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: THREAD }));
		proc.exit(0);
		await reading;
	});
});
