import { describe, expect, it } from "vitest";
import {
	fixtureAgentExecutor,
	makeTempDir,
	readCapture,
	type ScriptedStep,
	scriptedAgentExecutor,
} from "../test-helpers";
import { briefTitle, callsOf, createCodexAdapter, limitOf } from "./agent-codex";
import { createCodexRpc } from "./agent-codex-rpc";
import { CODEX_MODES, planCodexSpawn, versionAtLeast, versionIn } from "./agent-codex-spawn";
import { codexInput, inDesign, isSpoolRead, quietApproval } from "./agent-codex-turn";
import { codexChoice, codexOffer, codexThreads, createCodexEngine } from "./agent-engine-codex";
import type { AgentEvent } from "./agent-events";
import type { AgentTurn } from "./agent-turn";

const SESSION = { id: "6f1c1e4e-7d2a-4c1b-9a51-1a2b3c4d5e6f" };

/** the engine on recorded sessions */
function engineOn(...captures: [string, ...string[]]) {
	const scripted = scriptedAgentExecutor(...captures);
	const spoolDir = makeTempDir();
	const engine = createCodexEngine({
		executor: scripted.executor,
		spoolDir,
		version: "0.33.1",
	});
	return { engine, spoolDir, ...scripted };
}

/** every event a turn sends, answering what it asks the way `reply` says */
async function drain(turn: AgentTurn, on?: (event: AgentEvent) => void): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of turn.events) {
		events.push(event);
		on?.(event);
	}
	return events;
}

/** the first thread id a capture's out lines name in a notification */
function threadIn(capture: string, method: string): string {
	const params = outs(capture, method)[0]?.params as { threadId?: string; thread?: { id: string } } | undefined;
	const id = params?.threadId ?? params?.thread?.id;
	if (id === undefined) throw new Error(`${capture} has no ${method}`);
	return id;
}

/** what a capture's out lines carry, by method */
function outs(capture: string, method: string): Record<string, unknown>[] {
	return (readCapture(capture) as ScriptedStep[]).flatMap((step) =>
		"out" in step && step.out.method === method ? [step.out] : [],
	);
}

const ask = { value: "gpt-5.6-luna", effort: "low" };

describe("a codex turn, replayed", () => {
	it("starts a thread, keeps its id and streams the turn the way the rail reads it", async () => {
		const { engine, spoolDir, spawned } = engineOn("codex-turn");
		const turn = engine.start({
			root: makeTempDir(),
			session: SESSION,
			said: [
				{ prompt: "Run the shell command `ls design` and then reply with the single word ready.", selection: "" },
			],
			ask,
			permissions: "edits",
		});
		const events = await drain(turn);
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(spawned[0]?.remaining).toEqual([]);
		const thread = threadIn("codex-turn", "thread/started");
		expect(codexThreads(spoolDir).read(SESSION.id)).toBe(thread);
		expect(engine.continuable("", SESSION)).toBe(true);
		const kinds = events.map((event) => event.kind).filter((kind) => kind !== "other");
		expect(kinds[0]).toBe("ready");
		expect(events.find((event) => event.kind === "called")).toMatchObject({
			tool: "Bash",
			input: { command: "ls design" },
			parent: null,
		});
		expect(events.find((event) => event.kind === "result")).toMatchObject({ failed: false, text: "frames\n" });
		expect(
			events.filter((event) => event.kind === "said").map((event) => event.kind === "said" && event.text),
		).toEqual(["ready"]);
		expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
		expect(kinds.at(-1)).toBe("closed");
	});

	it("asks for the model and effort the thread chose, under the mode's policy and sandbox", async () => {
		const { engine, spawned } = engineOn("codex-turn");
		await drain(
			engine.start({
				root: makeTempDir(),
				session: SESSION,
				said: [{ prompt: "hi", selection: "" }],
				ask,
				permissions: "edits",
			}),
		);
		const lines = spawned[0]?.inputs.map(
			(line) => JSON.parse(line) as { method?: string; params?: Record<string, unknown> },
		);
		expect(lines?.find((line) => line.method === "thread/start")?.params).toMatchObject({
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
			model: "gpt-5.6-luna",
		});
		expect(lines?.find((line) => line.method === "turn/start")?.params).toMatchObject({ effort: "low" });
	});

	it("resumes the thread spool kept, without asking Codex for its whole history", async () => {
		const { engine, spoolDir, spawned } = engineOn("codex-resume");
		const thread = threadIn("codex-resume", "thread/status/changed");
		codexThreads(spoolDir).write(SESSION.id, thread);
		const events = await drain(
			engine.start({
				root: makeTempDir(),
				session: SESSION,
				said: [{ prompt: "again", selection: "" }],
				ask,
				permissions: "edits",
			}),
		);
		expect(spawned[0]?.mismatches).toEqual([]);
		const resume = spawned[0]?.inputs.map((line) => JSON.parse(line)).find((line) => line.method === "thread/resume");
		expect(resume.params).toMatchObject({ threadId: thread, excludeTurns: true });
		expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
	});

	it("answers design/ writes and spool read verbs itself, and asks the person about the rest", async () => {
		const { engine, spawned } = engineOn("codex-ask");
		const turn = engine.start({
			root: makeTempDir(),
			session: SESSION,
			said: [{ prompt: "go", selection: "" }],
			ask,
			permissions: "ask",
		});
		const asked: AgentEvent[] = [];
		const events = await drain(turn, (event) => {
			if (event.kind !== "asking") return;
			asked.push(event);
			expect(turn.answer(event.request, { kind: "allow" })).toBe(true);
		});
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(spawned[0]?.remaining).toEqual([]);
		// the frame write and `spool skill` never reach the person
		expect(asked).toHaveLength(1);
		expect(asked[0]).toMatchObject({ tool: "Bash", input: { command: "touch outside.txt" } });
		const decisions = spawned[0]?.inputs
			.map((line) => JSON.parse(line))
			.filter((line) => line.result?.decision !== undefined)
			.map((line) => line.result.decision);
		expect(decisions).toEqual(["accept", "accept", "accept"]);
		expect(events.find((event) => event.kind === "called" && event.tool === "Write")).toMatchObject({
			input: { file_path: expect.stringMatching(/design\/frames\/note\/frame\.tsx$/) },
		});
		expect(events.find((event) => event.kind === "answered")).toMatchObject({ answer: "allow" });
	});

	it("starts a bypass thread with no approvals and no sandbox", async () => {
		const { engine, spawned } = engineOn("codex-bypass");
		const events = await drain(
			engine.start({
				root: makeTempDir(),
				session: SESSION,
				said: [{ prompt: "go", selection: "" }],
				ask,
				permissions: "bypass",
			}),
		);
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(events.find((event) => event.kind === "ready")).toMatchObject({
			permissionMode: "never dangerFullAccess",
		});
		expect(spawned[0]?.spawn.args.join(" ")).toContain("developer_instructions=");
	});

	it("stops on Stop with Codex's interrupt, and ends stopped", async () => {
		const { engine, spawned } = engineOn("codex-interrupt");
		const turn = engine.start({
			root: makeTempDir(),
			session: SESSION,
			said: [{ prompt: "go", selection: "" }],
			ask,
			permissions: "edits",
		});
		const events = await drain(turn, (event) => {
			if (event.kind === "called") turn.interrupt();
		});
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "stopped" });
	});

	it("bounces a signed-out turn to Codex's own sign-in before starting anything", async () => {
		const { engine, spawned } = engineOn("codex-signed-out");
		const events = await drain(
			engine.start({
				root: makeTempDir(),
				session: SESSION,
				said: [{ prompt: "go", selection: "" }],
				ask,
				permissions: "edits",
			}),
		);
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(events.find((event) => event.kind === "ended")).toMatchObject({
			ending: "failed",
			recovery: { kind: "login", account: "Codex", scope: "account" },
		});
		expect(spawned[0]?.inputs.some((line) => line.includes("thread/start"))).toBe(false);
	});
});

describe("the codex engine's probes", () => {
	it("reads the signed-in account's email, and nobody when signed out", async () => {
		expect(await engineOn("codex-account").engine.account(makeTempDir())).toEqual({
			signedIn: true,
			account: "you@example.com",
		});
		expect(await engineOn("codex-signed-out").engine.account(makeTempDir())).toEqual({
			signedIn: false,
			account: null,
		});
	});

	it("offers every listed model with the efforts Codex reports for it, beyond the usual four", async () => {
		const { engine, spawned } = engineOn("codex-models");
		const offer = await engine.offer({ root: makeTempDir(), session: SESSION, ask: {} });
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(offer.models.length).toBeGreaterThan(1);
		const terra = offer.models.find((model) => model.value === "gpt-5.6-terra");
		expect(terra?.supportedEffortLevels).toContain("ultra");
		const luna = offer.models.find((model) => model.value === "gpt-5.6-luna");
		expect(luna?.supportedEffortLevels).not.toContain("ultra");
		const listed = (readCapture("codex-models") as ScriptedStep[]).flatMap((step) =>
			"out" in step && Array.isArray((step.out.result as { data?: unknown })?.data)
				? ((step.out.result as { data: { model: string; isDefault: boolean; hidden: boolean }[] }).data ?? [])
				: [],
		);
		expect(offer.current.value).toBe(listed.find((one) => one.isDefault)?.model);
		expect(offer.models.map((model) => model.value)).toEqual(
			listed.filter((one) => !one.hidden).map((one) => one.model),
		);
	});

	it("is installed when a codex is on the path, without running it", () => {
		const of = (found: boolean) =>
			createCodexEngine({
				executor: scriptedAgentExecutor("codex-turn").executor,
				spoolDir: makeTempDir(),
				version: "0.33.1",
				look: () => found,
			});
		expect(of(true).installed()).toBe(true);
		expect(of(false).installed()).toBe(false);
	});

	it("ends a turn on a codex older than the protocol spool speaks, before starting a thread", async () => {
		const { spawned, executor } = fixtureAgentExecutor(
			(proc, line) => {
				const message = JSON.parse(line) as { id?: number; method?: string };
				if (message.method === "initialize")
					proc.emit(
						JSON.stringify({ id: message.id, result: { userAgent: "spool/0.150.0 (Linux; x86_64) unknown" } }),
					);
			},
			// it goes when its input closes, as Codex does
			(proc) => proc.exit(0),
		);
		const engine = createCodexEngine({ executor, spoolDir: makeTempDir(), version: "0.33.1" });
		const events = await drain(
			engine.start({
				root: makeTempDir(),
				session: SESSION,
				said: [{ prompt: "go", selection: "" }],
				ask,
				permissions: "edits",
			}),
		);
		expect(events.find((event) => event.kind === "ended")).toMatchObject({
			ending: "failed",
			reason: expect.stringContaining("Codex 0.150.0 is older than 0.151.0"),
		});
		expect(spawned[0]?.inputs.some((line) => line.includes("thread/start"))).toBe(false);
	});
});

describe("codex's offer and choice", () => {
	const listed = [
		{
			id: "a",
			model: "a",
			displayName: "A",
			description: "",
			hidden: false,
			isDefault: true,
			defaultReasoningEffort: "medium",
			supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "medium" }],
		},
		{
			id: "b",
			model: "b",
			displayName: "B",
			description: "",
			hidden: false,
			isDefault: false,
			defaultReasoningEffort: "high",
			supportedReasoningEfforts: [{ reasoningEffort: "high" }, { reasoningEffort: "ultra" }],
		},
		{ id: "h", model: "h", displayName: "H", description: "", hidden: true, supportedReasoningEfforts: [] },
	];

	it("answers with the ask, then the person's Codex config, then Codex's default", () => {
		expect(codexOffer(listed, undefined, { value: "b", effort: "ultra" }).current).toMatchObject({
			value: "b",
			effort: "ultra",
		});
		expect(codexOffer(listed, { model: "b" }, {}).current).toMatchObject({ value: "b", effort: "high" });
		expect(codexOffer(listed, undefined, {}).current).toMatchObject({ value: "a", effort: "medium" });
		expect(codexOffer(listed, undefined, { value: "h" }).current.value).toBe("a");
	});

	it("keeps an effort only on a model that has it", () => {
		const offer = codexOffer(listed, undefined, {});
		expect(codexChoice(offer, { value: "b" }, { effort: "low" })).toEqual({ value: "b" });
		expect(codexChoice(offer, { value: "a" }, { effort: "low" })).toEqual({ value: "a", effort: "low" });
		expect(codexChoice(offer, {}, {})).toEqual({});
	});
});

describe("what spool answers for the person", () => {
	const root = "/p";
	it("reads design/ by path, never a sibling that only starts the same", () => {
		expect(inDesign(root, "/p/design/frames/a/frame.tsx")).toBe(true);
		expect(inDesign(root, "design/x.ts")).toBe(true);
		expect(inDesign(root, "/p/design")).toBe(false);
		expect(inDesign(root, "/p/designs/x")).toBe(false);
		expect(inDesign(root, "/p/design/../src/x")).toBe(false);
		expect(inDesign(root, "/elsewhere/design/x")).toBe(false);
	});

	it("takes one plain spool read verb, never a chain or a write", () => {
		expect(isSpoolRead("spool skill")).toBe(true);
		expect(isSpoolRead("spool shot frames/a")).toBe(true);
		expect(isSpoolRead("spool url && rm -rf .")).toBe(false);
		expect(isSpoolRead("spool status > out.txt")).toBe(false);
		expect(isSpoolRead("spool init")).toBe(false);
		expect(isSpoolRead("spoolx skill")).toBe(false);
	});

	it("answers a file change by the item's paths and a command by every part Codex split it into", () => {
		const change = (path: string) => ({ id: "c", type: "fileChange", changes: [{ path, kind: { type: "add" } }] });
		expect(quietApproval(root, "item/fileChange/requestApproval", {}, change("/p/design/a.tsx"))).toBe(true);
		expect(quietApproval(root, "item/fileChange/requestApproval", {}, change("/p/src/a.tsx"))).toBe(false);
		expect(quietApproval(root, "item/fileChange/requestApproval", {})).toBe(false);
		const command = (...commands: string[]) => ({
			commandActions: commands.map((one) => ({ type: "unknown", command: one })),
		});
		expect(quietApproval(root, "item/commandExecution/requestApproval", command("spool skill"))).toBe(true);
		expect(quietApproval(root, "item/commandExecution/requestApproval", command("spool skill", "rm x"))).toBe(false);
		expect(quietApproval(root, "item/commandExecution/requestApproval", {})).toBe(false);
	});
});

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

describe("codex's spawn", () => {
	it("trusts the project for its own process, so Codex never writes to the person's config", () => {
		const spawn = planCodexSpawn('/work/my "app"', {}, { permissions: "ask" });
		expect(spawn.args).toContain('projects={"/work/my \\"app\\""={trust_level="trusted"}}');
		expect(spawn.args).toContain("sandbox_workspace_write.network_access=true");
		expect(spawn.cwd).toBe('/work/my "app"');
	});

	it("maps each mode to Codex's own approval policy and sandbox", () => {
		expect(CODEX_MODES).toMatchObject({
			ask: { approvalPolicy: "untrusted", sandbox: "workspace-write" },
			edits: { approvalPolicy: "on-request", sandbox: "workspace-write" },
			bypass: { approvalPolicy: "never", sandbox: "danger-full-access" },
		});
	});

	it("reads and compares Codex's version", () => {
		expect(versionIn("codex-cli 0.161.0\n")).toBe("0.161.0");
		expect(versionAtLeast("0.161.0", "0.157.0")).toBe(true);
		expect(versionAtLeast("0.157.0", "0.157.0")).toBe(true);
		expect(versionAtLeast("0.99.9", "0.157.0")).toBe(false);
		expect(versionAtLeast("1.0.0", "0.157.0")).toBe(true);
	});

	it("puts pictures before words, as Codex's input list", () => {
		expect(
			codexInput([{ prompt: "look", selection: "frame a", attachments: [{ media: "image/png", data: "aGk=" }] }]),
		).toEqual([
			{ type: "image", url: "data:image/png;base64,aGk=" },
			{ type: "text", text: "frame a\n\nlook", text_elements: [] },
		]);
	});
});

describe("codex's rpc", () => {
	it("pairs responses to requests, routes server requests and refuses what it does not know", async () => {
		const written: string[] = [];
		const rpc = createCodexRpc({ write: (line) => written.push(line) });
		const asked: string[] = [];
		rpc.onRequest((_id, method) => asked.push(method));
		const answer = rpc.request("model/list", {});
		const sent = JSON.parse(written[0] as string) as { id: number; method: string };
		expect(sent.method).toBe("model/list");
		rpc.read(JSON.stringify({ id: sent.id, result: { data: [] } }));
		await expect(answer).resolves.toEqual({ data: [] });
		const failing = rpc.request("thread/resume", {});
		const failed = JSON.parse(written[1] as string) as { id: number };
		rpc.read(JSON.stringify({ id: failed.id, error: { code: -32600, message: "no rollout" } }));
		await expect(failing).rejects.toThrow("no rollout");
		rpc.read(JSON.stringify({ id: 0, method: "item/commandExecution/requestApproval", params: {} }));
		expect(asked).toEqual(["item/commandExecution/requestApproval"]);
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
