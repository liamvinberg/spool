import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { agentReader, makeApp, makeProject, makeTempDir, scriptedAgentExecutor, until } from "../test-helpers";
import { createPiEngine, isLocalEndpoint, piPrompt } from "./agent-engine-pi";
import type { AgentOffer } from "./agent-offer";
import { engineSessions } from "./agent-sessions";
import type { ServedThread } from "./agent-threads";

/** the session ids the recordings were made under, which spool chose and pi took */
const TURN = "7d0c5b8e-2f4a-4c6e-9a1b-3e5f7a9c1d2b";
const STOP = "9b1e3d5f-7a2c-4e8b-8d0f-1c3e5a7b9d2f";
const BLANK = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

function setup(...captures: [string, ...string[]]) {
	const spoolDir = makeTempDir();
	const { root, name } = makeProject(spoolDir);
	const pi = scriptedAgentExecutor(...captures);
	const engines = () => [createPiEngine({ executor: pi.executor, spoolDir, look: () => true })];
	let app = makeApp(spoolDir, { agentEngines: engines() });
	const path = `/api/p/${name}/agent`;
	const send = (route: string, body: unknown) =>
		app.request(`${path}/${route}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	const threads = async () =>
		((await (await app.request(`${path}/threads`)).json()) as { threads: ServedThread[] }).threads;
	return {
		spoolDir,
		root,
		pi,
		path,
		send,
		threads,
		get: (route: string) => app.request(`${path}/${route}`),
		restart: () => {
			app = makeApp(spoolDir, { agentEngines: engines() });
		},
	};
}

/** every event a turn's stream carries, until it says the turn is over */
async function turnOf(view: ReturnType<typeof agentReader>): Promise<Record<string, unknown>[]> {
	const events: Record<string, unknown>[] = [];
	for (;;) {
		const { data } = await view.next();
		const event = data as Record<string, unknown>;
		events.push(event);
		if (event.kind === "closed") return events;
	}
}

const words = (events: readonly Record<string, unknown>[]) =>
	events
		.filter((event) => event.kind === "say")
		.map((event) => event.text)
		.join("");

describe("the pi engine", () => {
	it("offers pi's live models with each one's own thinking levels, and no modes", async () => {
		const { get, pi } = setup("pi-models");
		const offer = (await (await get(`threads/${BLANK}/models?engine=pi`)).json()) as AgentOffer;
		expect(pi.spawned[0]?.spawn.args).toEqual(["--mode", "rpc", "--no-session"]);
		expect(pi.spawned[0]?.mismatches).toEqual([]);
		expect(pi.spawned[0]?.remaining).toEqual([]);
		expect(offer.modes).toBe(false);
		expect(offer.models.length).toBeGreaterThan(1);
		expect(offer.models.every((model) => model.value.includes("/"))).toBe(true);
		expect(offer.models.some((model) => model.local)).toBe(false);
		const current = offer.models.find((model) => model.value === offer.current.value);
		// the levels are each model's own, past the four the spec named: pi reports them per model
		expect(offer.current.value).toBe("openai-codex/gpt-6.1-sol");
		expect(current?.supportedEffortLevels).toEqual(["minimal", "low", "medium", "high", "xhigh", "max"]);
		expect(offer.models.find((model) => model.value === "openai-codex/gpt-5.5")?.supportedEffortLevels).toEqual([
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
		]);
		expect(current?.supportedEffortLevels).toContain(offer.current.effort);
	});

	it("marks a model on this machine as local, and a model with no levels as having no effort", async () => {
		const { get } = setup("pi-models-local");
		const offer = (await (await get(`threads/${BLANK}/models?engine=pi`)).json()) as AgentOffer;
		expect(offer.models.map((model) => [model.value, model.local, model.supportedEffortLevels])).toEqual([
			["ollama/qwen3-coder:30b", true, ["off", "minimal", "low", "medium", "high"]],
			["ollama/llama3.2:3b", true, undefined],
		]);
		expect(isLocalEndpoint("http://127.0.0.1:1234/v1")).toBe(true);
		expect(isLocalEndpoint("https://chatgpt.com/backend-api")).toBe(false);
	});

	it("streams a turn under the session spool chose, and continues it in pi's own file after a restart", async () => {
		const { send, pi, spoolDir, root, threads, restart } = setup("pi-turn", "pi-resume");
		const view = agentReader(
			await send("turn", {
				thread: TURN,
				turn: "one",
				engine: "pi",
				said: [{ prompt: "Read note.txt with your read tool, then reply with its first word only." }],
			}),
		);
		const first = await turnOf(view);
		await view.cancel();
		expect(words(first)).toBe("marigold");
		expect(first.find((event) => event.kind === "called")).toMatchObject({ tool: "read" });
		expect(first.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
		const spawn = pi.spawned[0]?.spawn;
		expect(spawn?.command).toBe("pi");
		expect(spawn?.cwd).toBe(root);
		expect(spawn?.args.slice(0, 4)).toEqual(["--mode", "rpc", "--session-id", TURN]);
		expect(spawn?.args).toContain("--append-system-prompt");
		expect(pi.spawned[0]?.mismatches).toEqual([]);
		expect(pi.spawned[0]?.remaining).toEqual([]);

		// spool keeps the exact file pi said, and the thread continues only while pi has it
		const file = engineSessions(spoolDir, "pi").read(TURN) as string;
		expect(file).toBe(`${root}/sessions/2026-10-08T20-07-45-128Z_${TURN}.jsonl`);
		await until(() => pi.spawned[0]?.ended === true);
		await expect.poll(async () => (await threads()).length).toBe(1);
		expect((await threads())[0]).toMatchObject({ engine: "pi", continuable: false });
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, "");
		expect((await threads())[0]).toMatchObject({ engine: "pi", continuable: true });

		restart();
		const again = agentReader(
			await send("turn", { thread: TURN, turn: "two", said: [{ prompt: "And the second line's first word?" }] }),
		);
		const second = await turnOf(again);
		await again.cancel();
		expect(words(second)).not.toBe("");
		expect(second.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
		expect(pi.spawned[1]?.spawn.args.slice(0, 4)).toEqual(["--mode", "rpc", "--session", file]);
		expect(pi.spawned[1]?.mismatches).toEqual([]);
		rmSync(file);
		expect((await threads())[0]).toMatchObject({ continuable: false });
	});

	it("stops a turn with pi's own abort and ends it as stopped", async () => {
		const { send, pi } = setup("pi-stop");
		const view = agentReader(
			await send("turn", { thread: STOP, turn: "stop", engine: "pi", said: [{ prompt: "Count slowly." }] }),
		);
		for (;;) {
			const { data } = await view.next();
			if ((data as { kind?: string }).kind === "say") break;
		}
		expect((await send("interrupt", { turn: "stop" })).status).toBe(204);
		const rest = await turnOf(view);
		await view.cancel();
		expect(rest.find((event) => event.kind === "ended")).toMatchObject({ ending: "stopped" });
		expect(pi.spawned[0]?.inputs.map((line) => JSON.parse(line).type)).toEqual(["get_state", "prompt", "abort"]);
		expect(pi.spawned[0]?.mismatches).toEqual([]);
	});

	it("says what was selected and attaches pictures the way pi's prompt takes them", () => {
		expect(
			piPrompt([
				{
					prompt: "make it blue",
					selection: "<selection>card</selection>",
					attachments: [{ media: "image/png", data: "aGk=" }],
				},
			]),
		).toEqual({
			message: "<selection>card</selection>\n\nmake it blue",
			images: [{ type: "image", data: "aGk=", mimeType: "image/png" }],
		});
	});
});
