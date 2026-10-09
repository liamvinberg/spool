import { describe, expect, it } from "vitest";
import { createCodexRpc } from "./agent-codex-rpc";

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
