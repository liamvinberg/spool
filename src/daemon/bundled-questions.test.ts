import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { agentReader, makeApp, makeProject, makeTempDir } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import type { AgentAsking, AgentEvent } from "./agent-events";
import { deterministicBundledRuntime } from "./fixtures/bundled-provider";
import { askOrder, orderQuestion } from "./fixtures/bundled-question";

it("routes real host questions once through the daemon, keeps absent viewers waiting and isolates concurrent threads", {
	timeout: 30_000,
}, async () => {
	const directory = join(makeTempDir(), "bundled");
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-provider-host.ts", import.meta.url)), [], {
			env: bundledEnvironment(state),
			execArgv: ["--import", import.meta.resolve("tsx")],
			stdio: ["ignore", "ignore", "ignore", "ipc"],
		});
		onTestFinished(async () => {
			if (child.exitCode !== null || child.signalCode !== null) return;
			const exited = once(child, "exit");
			child.kill();
			await exited;
		});
		return child;
	});
	await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const state = makeTempDir();
	const { name } = makeProject(state);
	const app = makeApp(state, { agentEngines: [createSpoolEngine(directory, client)] });
	const path = `/api/p/${name}/agent`;
	const send = (route: string, body: unknown) =>
		app.request(`${path}/${route}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	const through = async (reader: ReturnType<typeof agentReader>, kind: AgentEvent["kind"]) => {
		for (;;) {
			const event = (await reader.next()).data as AgentEvent;
			if (event.kind === kind) return event;
		}
	};
	const start = async (thread: string, turn: string, script = [askOrder]) => {
		const reader = agentReader(
			await send("turn", {
				thread,
				turn,
				engine: "spool",
				said: [{ prompt: `file tools: ${JSON.stringify(script)}` }],
			}),
		);
		const ask = (await through(reader, "asking")) as AgentAsking;
		return { reader, ask };
	};
	const one = randomUUID();
	const two = randomUUID();
	const first = await start(one, "one", [askOrder, askOrder]);
	const second = await start(two, "two");
	expect(first.ask).toMatchObject({ interaction: true, input: askOrder.arguments, suggestions: [] });
	expect(first.ask.request).not.toBe(second.ask.request);
	for (const reply of [
		{ kind: "allow" },
		{ kind: "always" },
		{ kind: "picked", picks: { stale: "Under the confirmation" } },
		{ kind: "picked", picks: { [orderQuestion.question]: "Not an option" } },
	])
		expect((await send("answer", { request: first.ask.request, reply })).status).toBe(404);
	expect(
		await client.request({ kind: "answer", turn: "missing", request: first.ask.request, reply: { kind: "deny" } }),
	).toBe(false);
	await first.reader.cancel();
	const calls = () => readFileSync(join(directory, "provider-calls.jsonl"), "utf8").trim().split("\n");
	expect(calls()).toHaveLength(2);
	await second.reader.expectQuiet(100);
	expect(calls()).toHaveLength(2);
	const reconnect = agentReader(await app.request(`${path}/turn/${one}`));
	expect(await through(reconnect, "asking")).toEqual(first.ask);
	const picked = { kind: "picked", picks: { [orderQuestion.question]: "Under the confirmation" } };
	expect((await send("answer", { request: first.ask.request, reply: picked })).status).toBe(204);
	expect(await through(reconnect, "answered")).toMatchObject({
		request: first.ask.request,
		words: "Under the confirmation",
	});
	const next = (await through(reconnect, "asking")) as AgentAsking;
	expect(next.request).not.toBe(first.ask.request);
	expect((await send("answer", { request: first.ask.request, reply: { kind: "deny" } })).status).toBe(404);
	await second.reader.expectQuiet(100);
	expect(
		(
			await send("answer", {
				request: next.request,
				reply: { kind: "said", text: "Put it above the items instead." },
			})
		).status,
	).toBe(204);
	await through(reconnect, "closed");
	expect(calls().at(-1)).toContain("Put it above the items instead.");
	expect(calls().at(-1)).toContain("Under the confirmation");
	expect((await send("answer", { request: second.ask.request, reply: { kind: "deny" } })).status).toBe(204);
	expect(await through(second.reader, "answered")).toMatchObject({ answer: "deny", words: null });
	await through(second.reader, "closed");
	expect(calls().at(-1)).toContain("dismissed the question without answering it");
	expect(calls().at(-1)).not.toContain("Put it above the items instead.");
	await reconnect.cancel();
	await second.reader.cancel();
	const stopped = await start(one, "stop");
	expect((await send("interrupt", { turn: "stop" })).status).toBe(204);
	expect(await through(stopped.reader, "ended")).toMatchObject({ ending: "stopped" });
	await through(stopped.reader, "closed");
	expect((await send("answer", { request: stopped.ask.request, reply: picked })).status).toBe(404);
	await stopped.reader.cancel();
	const resumed = await start(one, "resumed");
	expect((await send("answer", { request: stopped.ask.request, reply: picked })).status).toBe(404);
	expect((await send("answer", { request: resumed.ask.request, reply: picked })).status).toBe(204);
	expect(await through(resumed.reader, "ended")).toMatchObject({ ending: "done" });
	await through(resumed.reader, "closed");
	await resumed.reader.cancel();
});

it.each(["ask", "edits", "bypass"] as const)(
	"keeps questions pending in %s through every applied mode and settles cancellation",
	async (permissions) => {
		const directory = join(makeTempDir(), "bundled");
		const runtime = await deterministicBundledRuntime(directory);
		onTestFinished(() => runtime.close());
		await runtime.request({ kind: "connect", provider: "openai", key: "fixture-key" });
		const events: AgentEvent[] = [];
		const running = runtime.turn(
			"turn",
			{
				root: makeTempDir(),
				session: { id: randomUUID() },
				ask: { value: "openai/spool-test" },
				permissions,
				said: [{ prompt: "Ask about the order number", selection: "" }],
			},
			(event) => events.push(event),
		);
		await expect.poll(() => events.some((event) => event.kind === "asking")).toBe(true);
		const ask = events.find((event) => event.kind === "asking");
		if (ask?.kind !== "asking") throw new Error("Missing question");
		for (const mode of ["bypass", "edits", "ask"] as const) {
			expect(await runtime.request({ kind: "permissions", turn: "turn", mode })).toBe(mode);
			expect(events.some((event) => event.kind === "answered" || event.kind === "ended")).toBe(false);
		}
		for (const kind of ["allow", "always"] as const)
			expect(await runtime.request({ kind: "answer", turn: "turn", request: ask.request, reply: { kind } })).toBe(
				false,
			);
		await runtime.request({ kind: "stop", turn: "turn" });
		await running;
		expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "stopped" });
		expect(events.some((event) => event.kind === "answered")).toBe(false);
		expect(
			await runtime.request({ kind: "answer", turn: "turn", request: ask.request, reply: { kind: "deny" } }),
		).toBe(false);
	},
);

it("requires complete picks for multi-question calls and closes a waiting SDK session without an unresolved ask", async () => {
	const runtime = await deterministicBundledRuntime(join(makeTempDir(), "bundled"));
	onTestFinished(() => runtime.close());
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const events: AgentEvent[] = [];
	const options = {
		root: makeTempDir(),
		session: { id: randomUUID() },
		ask: { value: "openai/spool-test" },
		permissions: "bypass" as const,
		said: [
			{
				prompt: `file tools: ${JSON.stringify([{ name: "ask_person", arguments: { questions: [orderQuestion, { ...orderQuestion, question: "And on the next receipt?" }] } }])}`,
				selection: "",
			},
		],
	};
	const running = runtime.turn("multi", options, (event) => events.push(event));
	await expect.poll(() => events.some((event) => event.kind === "asking")).toBe(true);
	const ask = events.find((event) => event.kind === "asking");
	if (ask?.kind !== "asking") throw new Error("Missing ask");
	expect(
		await runtime.request({
			kind: "answer",
			turn: "multi",
			request: ask.request,
			reply: { kind: "picked", picks: { [orderQuestion.question]: "Under the confirmation" } },
		}),
	).toBe(false);
	expect(events.some((event) => event.kind === "answered")).toBe(false);
	await runtime.close();
	await running;
	expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "stopped" });
	expect(events.at(-1)?.kind).toBe("closed");
	expect(await runtime.request({ kind: "answer", turn: "multi", request: ask.request, reply: { kind: "deny" } })).toBe(
		false,
	);
});
