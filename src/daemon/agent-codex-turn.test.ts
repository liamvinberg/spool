import { describe, expect, it } from "vitest";
import { fixtureAgentExecutor, makeTempDir } from "../test-helpers";
import { codexFraming } from "./agent-codex-spawn";
import { approvalScopes, codexInput, inDesign, isSpoolRead, quietApproval, startCodexTurn } from "./agent-codex-turn";

/** a Codex that answers the handshake, the account, its config and a thread start, and nothing more */
function codexWith(config: Record<string, unknown>) {
	return fixtureAgentExecutor(
		(proc, line) => {
			const message = JSON.parse(line) as { id?: number; method?: string };
			const answer = (result: unknown) => proc.emit(JSON.stringify({ id: message.id, result }));
			if (message.method === "initialize") answer({ userAgent: "spool/0.161.0 (Linux; x86_64) unknown" });
			if (message.method === "account/read") answer({ account: { type: "chatgpt" }, requiresOpenaiAuth: true });
			if (message.method === "config/read") answer({ config, origins: {} });
			if (message.method === "thread/start") proc.exit(0);
		},
		(proc) => proc.exit(0),
	);
}

describe("a codex turn's developer instructions", () => {
	for (const [named, config, starts] of [
		["the person's own, then spool's", { developer_instructions: "Answer in Swedish." }, "Answer in Swedish.\n\n"],
		["spool's alone where the person has none", { developer_instructions: null }, ""],
	] as const)
		it(`are ${named}`, async () => {
			const { executor, spawned } = codexWith(config);
			const turn = startCodexTurn({
				executor,
				root: makeTempDir(),
				env: {},
				said: [{ prompt: "go", selection: "" }],
				ask: {},
				permissions: "edits",
				session: null,
				onSession: () => {},
				version: "0.33.1",
			});
			for await (const _ of turn.events);
			const sent = spawned[0]?.inputs.map((line) => JSON.parse(line) as { method?: string; params?: unknown });
			expect(sent?.find((line) => line.method === "config/read")?.params).toMatchObject({ cwd: expect.any(String) });
			const start = sent?.find((line) => line.method === "thread/start")?.params as {
				developerInstructions?: string;
			};
			expect(start.developerInstructions).toBe(`${starts}${codexFraming()}`);
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

	it("remembers an allowed change by each file it touches and a command as Codex split it", () => {
		const change = { id: "c", type: "fileChange", changes: [{ path: "src/a.ts" }, { path: "/p/b.ts" }] };
		expect(approvalScopes(root, "item/fileChange/requestApproval", {}, change)).toEqual([
			"file:/p/src/a.ts",
			"file:/p/b.ts",
		]);
		expect(approvalScopes(root, "item/fileChange/requestApproval", {})).toEqual([]);
		expect(
			approvalScopes(root, "item/commandExecution/requestApproval", {
				command: "/bin/zsh -lc 'ls && pwd'",
				commandActions: [{ command: "ls" }, { command: "pwd" }],
			}),
		).toEqual(["command:ls\npwd"]);
		expect(approvalScopes(root, "item/commandExecution/requestApproval", { command: "make" })).toEqual([
			"command:make",
		]);
		expect(approvalScopes(root, "item/commandExecution/requestApproval", {})).toEqual([]);
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

	it("puts pictures before words, as Codex's input list", () => {
		expect(
			codexInput([{ prompt: "look", selection: "frame a", attachments: [{ media: "image/png", data: "aGk=" }] }]),
		).toEqual([
			{ type: "image", url: "data:image/png;base64,aGk=" },
			{ type: "text", text: "frame a\n\nlook", text_elements: [] },
		]);
	});
});
