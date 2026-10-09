import { describe, expect, it } from "vitest";
import { briefTitle, callsOf, createCodexAdapter, limitOf } from "./agent-codex";

describe("codex's wire, read", () => {
	it("names Codex's items as the tools the rail already draws", () => {
		expect(
			callsOf({
				id: "x",
				type: "commandExecution",
				command: "/bin/sh -lc 'ls'",
				commandActions: [{ command: "ls" }, { command: "pwd" }],
			}),
		).toMatchObject([{ id: "x", tool: "Bash", input: { command: "ls && pwd" } }]);
		expect(
			callsOf({
				id: "f",
				type: "fileChange",
				changes: [
					{ path: "/p/a", kind: { type: "add" }, diff: "x" },
					{ path: "/p/b", kind: { type: "update" }, diff: "y" },
				],
			}).map((call) => [call.id, call.tool]),
		).toEqual([
			["f", "Write"],
			["f#1", "Edit"],
		]);
		expect(callsOf({ id: "m", type: "mcpToolCall", server: "figma", tool: "get" })[0]?.tool).toBe("mcp__figma__get");
	});

	it("warns at three quarters of a window and says when the limit is hit", () => {
		expect(limitOf({ primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 1 } })).toMatchObject({
			status: "allowed",
		});
		expect(limitOf({ primary: { usedPercent: 80, windowDurationMins: 300, resetsAt: 1 } })).toMatchObject({
			status: "allowed_warning",
		});
		expect(
			limitOf({ primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: 1 }, rateLimitReachedType: "x" }),
		).toMatchObject({
			status: "rejected",
		});
	});

	it("says how full the window is from the main thread's last request, never a sub-agent's", () => {
		const adapter = createCodexAdapter();
		adapter.main = "main";
		const usage = (threadId: string, last: number, window: unknown = 258400) => ({
			threadId,
			turnId: "t",
			tokenUsage: {
				total: { totalTokens: 90000 },
				last: { totalTokens: last, inputTokens: last - 5, outputTokens: 5 },
				modelContextWindow: window,
			},
		});
		expect(adapter.read("thread/tokenUsage/updated", usage("main", 15747))).toEqual([
			{ kind: "context", used: 15747, window: 258400, parent: null },
		]);
		expect(adapter.read("thread/tokenUsage/updated", usage("child", 4000))).toEqual([]);
		// a window Codex does not know says nothing
		expect(adapter.read("thread/tokenUsage/updated", usage("main", 15747, null))).toEqual([]);
	});

	it("keeps a sub-agent's work under the call that spawned it, and ends only on the main thread", () => {
		const adapter = createCodexAdapter();
		adapter.main = "main";
		const spawn = {
			id: "spawn-1",
			type: "collabAgentToolCall",
			tool: "spawnAgent",
			senderThreadId: "main",
			receiverThreadIds: ["child"],
			status: "inProgress",
		};
		adapter.read("item/started", { threadId: "main", turnId: "t", item: spawn });
		const child = adapter.read("item/started", {
			threadId: "child",
			turnId: "c",
			item: { id: "cmd", type: "commandExecution", command: "ls", commandActions: [{ command: "ls" }] },
		});
		expect(child.every((event) => event.parent === "spawn-1")).toBe(true);
		expect(
			adapter
				.read("turn/completed", { threadId: "child", turn: { id: "c", status: "completed" } })
				.some((event) => event.kind === "ended"),
		).toBe(false);
		expect(
			adapter
				.read("turn/completed", { threadId: "main", turn: { id: "t", status: "completed" } })
				.some((event) => event.kind === "ended"),
		).toBe(true);
	});
});

describe("a spawn's title", () => {
	it("is the brief's task name, or its first line cut at a word", () => {
		expect(briefTitle("task_name: calm hello\nDraw it quiet.")).toBe("calm hello");
		expect(briefTitle("Draw the calm direction.\nMore.")).toBe("Draw the calm direction.");
		expect(
			briefTitle("You are the loud direction designer. In the current project, create design/frames/hello-loud"),
		).toBe("You are the loud direction designer. In the current…");
		expect(briefTitle("")).toBeNull();
		expect(briefTitle(undefined)).toBeNull();
	});
});
