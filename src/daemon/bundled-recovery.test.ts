import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeTempDir, writeDesignFile } from "../test-helpers";
import type { EngineTurnOptions } from "./agent-engine";
import type { AgentEvent, AgentRecovery } from "./agent-events";
import { providerRecovery, retryAfterReset } from "./agent-recovery";
import { recoveryRuntime } from "./fixtures/bundled-recovery-provider";

it.each([
	"401 Invalid API key fixture-secret",
	'429 {"error":{"scope":"account","resets_at":2000000000,"message":"fixture-secret"}}',
])("continues a real completed edit after %s without resending or replaying it", async (failure) => {
	const directory = makeTempDir();
	const root = makeTempDir();
	writeDesignFile(root, "frames/home/frame.tsx", "before");
	let runtime = await recoveryRuntime(directory);
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-secret" });
	const options: EngineTurnOptions = {
		root,
		session: { id: randomUUID() },
		permissions: "ask",
		ask: { value: "spool/openai/api_key/spool-test" },
		said: [
			{
				prompt:
					'file tools: [{"name":"edit","arguments":{"path":"design/frames/home/frame.tsx","edits":[{"oldText":"before","newText":"after"}]}}]',
				selection: "captured selection",
				attachment: { media: "image/png", data: "aGVsbG8=" },
			},
		],
	};
	writeFileSync(join(directory, "failure.json"), JSON.stringify({ afterTool: true, message: failure }));
	const run = async (recovery?: string) => {
		const events: AgentEvent[] = [];
		await runtime.turn(randomUUID(), { ...options, ...(recovery ? { recovery } : {}) }, (event) =>
			events.push(event),
		);
		return events;
	};
	const token = (events: AgentEvent[]): string => {
		const event = events.find((event) => event.kind === "ended");
		expect(event).toMatchObject({ ending: "failed", recovery: { account: "OpenAI API key" } });
		expect(event?.kind === "ended" && event.recovery?.token).toBeTypeOf("string");
		return (event?.kind === "ended" ? event.recovery?.token : undefined) ?? "";
	};
	const first = await run();
	let held = token(first);
	expect(readFileSync(join(root, "design/frames/home/frame.tsx"), "utf8")).toBe("after");
	expect(first.filter((event) => event.kind === "result")).toHaveLength(1);
	expect(JSON.stringify(first)).not.toContain("fixture-secret");
	const repeated = await run(held);
	expect(token(repeated)).toBe(held);
	held = token(repeated);
	expect(repeated.filter((event) => event.kind === "result")).toHaveLength(0);
	const beforeRestart = readFileSync(join(directory, "failed-calls.jsonl"), "utf8");
	await runtime.close();
	runtime = await recoveryRuntime(directory);
	expect(readFileSync(join(directory, "failed-calls.jsonl"), "utf8")).toBe(beforeRestart);
	rmSync(join(directory, "failure.json"));
	const recovered = await run(held);
	expect(recovered.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
	expect(recovered.filter((event) => event.kind === "result")).toHaveLength(0);
	const calls = readFileSync(join(directory, "provider-calls.jsonl"), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	const context = calls.at(-1);
	expect(context.messages.filter((message: { role: string }) => message.role === "user")).toHaveLength(1);
	expect(context.messages.filter((message: { role: string }) => message.role === "toolResult")).toHaveLength(1);
	expect(JSON.stringify(context)).toContain("captured selection");
	expect(JSON.stringify(context)).toContain("aGVsbG8=");
	const duplicate = await run(held);
	expect(duplicate.find((event) => event.kind === "ended")).toMatchObject({
		ending: "failed",
		reason: "This recovery has already been continued",
		recovery: null,
	});
	expect(readFileSync(join(directory, "provider-calls.jsonl"), "utf8").trim().split("\n")).toHaveLength(calls.length);
	const saved = readFileSync(join(directory, "sessions", `${options.session.id}.jsonl`), "utf8");
	expect(saved).not.toContain("fixture-secret");
	await runtime.close();
});

it("reports only supplied limit scope and reset data, without guessing a reset from rounded SDK text", () => {
	const examples: [string, Partial<AgentRecovery> | undefined][] = [
		[
			'429 {"error":{"scope":"model","resets_at":2000000000}}',
			{ kind: "limit", scope: "model", resetsAt: 2000000000 },
		],
		["You have hit your ChatGPT usage limit. Try again in ~20 min.", { kind: "limit", scope: "account" }],
		["429 Rate limit reached for requests", { kind: "limit", scope: "unknown" }],
		["Authentication failed for openai", { kind: "login", scope: "account" }],
		["Server unavailable", undefined],
	];
	for (const [message, expected] of examples) {
		const result = providerRecovery(message, "ChatGPT");
		if (!expected) expect(result).toBeUndefined();
		else {
			expect(result).toMatchObject(expected);
			if (!expected.resetsAt) expect(result).not.toHaveProperty("resetsAt");
		}
	}
});

it("holds a first request before any account exists, then submits it once after connection", async () => {
	const directory = makeTempDir();
	const runtime = await recoveryRuntime(directory);
	const options: EngineTurnOptions = {
		root: makeTempDir(),
		session: { id: randomUUID() },
		said: [{ prompt: "first request", selection: "first selection" }],
		permissions: "ask",
		ask: {},
	};
	const events: AgentEvent[] = [];
	await runtime.turn("first", options, (event) => events.push(event));
	const ended = events.find((event) => event.kind === "ended");
	expect(ended).toMatchObject({ ending: "failed", recovery: { kind: "login" } });
	if (ended?.kind !== "ended" || !ended.recovery?.token) throw new Error("Missing recovery");
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-secret" });
	await runtime.turn(
		"recovery",
		{ ...options, recovery: ended.recovery.token, said: [{ prompt: "must not replace held input", selection: "" }] },
		() => {},
	);
	const context = JSON.parse(readFileSync(join(directory, "provider-calls.jsonl"), "utf8").trim());
	expect(context.messages.filter((message: { role: string }) => message.role === "user")).toHaveLength(1);
	expect(JSON.stringify(context)).toContain("first request");
	expect(JSON.stringify(context)).toContain("first selection");
	expect(JSON.stringify(context)).not.toContain("must not replace");
	await runtime.close();
});

it("retains exact Codex HTTP reset data before the native SDK turns it into approximate prose", async () => {
	const { createServer } = await import("node:http");
	const { stream } = await import("@earendil-works/pi-ai/api/openai-codex-responses");
	const runtime = await recoveryRuntime(makeTempDir());
	const server = createServer((_request, response) => {
		response.writeHead(429, { "content-type": "application/json" });
		response.end(
			JSON.stringify({
				error: { type: "usage_limit_reached", resets_at: 2000000000, message: "private diagnostic" },
			}),
		);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing fixture address");
	const payload = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fixture" } }),
	).toString("base64url");
	await runtime.request({ kind: "connect", provider: "openai", key: `fixture.${payload}.fixture` });
	runtime.models.registerProvider("openai", {
		api: "openai-responses",
		models: [...runtime.models.getModels("openai")],
		streamSimple: (model, context, options) =>
			stream({ ...model, api: "openai-codex-responses", baseUrl: `http://127.0.0.1:${address.port}` }, context, {
				...options,
				transport: "sse",
				maxRetries: 0,
			}),
	});
	try {
		const events: AgentEvent[] = [];
		await runtime.turn(
			randomUUID(),
			{
				root: makeTempDir(),
				session: { id: randomUUID() },
				permissions: "ask",
				ask: { value: "spool/openai/api_key/spool-test" },
				said: [{ prompt: "held", selection: "" }],
			},
			(event) => events.push(event),
		);
		expect(events.find((event) => event.kind === "ended")).toMatchObject({
			ending: "failed",
			recovery: { kind: "limit", scope: "account", resetsAt: 2000000000 },
		});
		expect(JSON.stringify(events)).not.toContain("private diagnostic");
	} finally {
		await runtime.close();
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
});

it("uses only supplied Retry-After data, preserving absolute and relative provider instructions", () => {
	expect(retryAfterReset("90", 2000000000000)).toBe(2000000090);
	expect(retryAfterReset("Wed, 18 May 2033 03:33:20 GMT", 0)).toBe(2000000000);
	expect(retryAfterReset(null, 2000000000000)).toBeUndefined();
	expect(retryAfterReset("try again later", 2000000000000)).toBeUndefined();
});
