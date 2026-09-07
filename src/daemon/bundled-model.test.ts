import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { makeApp, makeProject, makeTempDir } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { readThread } from "./agent-threads";
import { deterministicModelRuntime } from "./fixtures/bundled-model-provider";

it("inherits project choices in new chats and restores each chat after daemon and host restart", {
	timeout: 30_000,
}, async () => {
	const directory = makeTempDir();
	const project = makeProject(directory);
	const otherProject = makeProject(directory);
	const children: ChildProcess[] = [];
	onTestFinished(async () => {
		await Promise.all(
			children
				.filter((child) => child.exitCode === null && child.signalCode === null)
				.map(async (child) => {
					const exited = once(child, "exit");
					child.kill();
					await exited;
				}),
		);
	});
	function start() {
		const client = new BundledHostClient(directory, (state) => {
			const child = fork(fileURLToPath(new URL("./fixtures/bundled-model-provider-host.ts", import.meta.url)), [], {
				env: bundledEnvironment(state),
				execArgv: ["--import", import.meta.resolve("tsx")],
				stdio: ["ignore", "ignore", "ignore", "ipc"],
			});
			children.push(child);
			return child;
		});
		const app = makeApp(directory, { agentEngines: [createSpoolEngine(directory, client)] });
		return { app, client };
	}
	const { app, client } = start();
	const first = randomUUID();
	const second = randomUUID();
	const path = (thread: string, name = project.name) => `/api/p/${name}/agent/threads/${thread}`;
	const choose = async (thread: string, choice: { value: string; effort?: string }) => {
		const response = await app.request(`${path(thread)}/model?engine=spool`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(choice),
		});
		expect(response.status).toBe(200);
	};
	const selected = { value: "spool/google/api_key/spool-test", effort: "high" };
	await choose(first, selected);
	expect(await (await app.request(`${path(second)}/models?engine=spool`)).json()).toMatchObject({
		current: selected,
	});
	await choose(second, { value: "spool/google/api_key/quick-image" });
	const turn = await app.request(`/api/p/${project.name}/agent/turn`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ thread: first, engine: "spool", said: [{ prompt: "use my saved model" }] }),
	});
	expect(turn.status).toBe(200);
	await turn.text();
	const saved = readThread(directory, project.root, first);
	if (!saved) throw new Error("Missing saved thread");
	const session = readFileSync(join(client.directory, "sessions", `${saved.session.id}.jsonl`), "utf8");
	expect(session).toContain('"provider":"google"');
	expect(session).toContain('"thinkingLevel":"high"');
	client.close();
	const restarted = start().app;
	expect(await (await restarted.request(`${path(first)}/models?engine=spool`)).json()).toMatchObject({
		current: selected,
	});
	for (const thread of [second, randomUUID()]) {
		expect(await (await restarted.request(`${path(thread)}/models?engine=spool`)).json()).toMatchObject({
			current: { value: "spool/google/api_key/quick-image", effort: null },
		});
	}
	expect(
		await (await restarted.request(`${path(randomUUID(), otherProject.name)}/models?engine=spool`)).json(),
	).toMatchObject({ current: { value: "spool/openai/api_key/spool-test", effort: "medium" } });
});

it("keeps model, connection method, effort and engine identity across account replacement and host restart", async () => {
	const directory = makeTempDir();
	const runtime = await deterministicModelRuntime(directory);
	onTestFinished(() => runtime.close());
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-openai" });
	await runtime.request({ kind: "connect", provider: "google", key: "fixture-google" });
	await runtime.request({ kind: "connect", provider: "xai", key: "fixture-xai" });
	const options = { root: makeTempDir(), session: { id: randomUUID() }, ask: {} };
	const offers = await runtime.offer(options);
	const duplicates = offers.models.filter((model) => model.displayName === "Test image model");
	expect(duplicates.map((model) => model.value)).toEqual([
		"spool/openai/api_key/spool-test",
		"spool/google/api_key/spool-test",
		"spool/xai/api_key/spool-test",
	]);
	expect(duplicates.map((model) => model.connection)).toEqual(["OpenAI API key", "Google API key", "xAI API key"]);
	const chosen = await runtime.offer({
		...options,
		choose: { value: "spool/xai/api_key/spool-test", effort: "high" },
	});
	expect(chosen.current).toMatchObject({ value: "spool/xai/api_key/spool-test", effort: "high" });
	await runtime.credentials.modify("xai", async () => ({
		type: "oauth",
		access: "fixture",
		refresh: "fixture-refresh",
		expires: Date.now() + 3_600_000,
	}));
	const changed = await runtime.offer(options);
	expect(
		changed.models.some((model) => model.value === "spool/xai/oauth/spool-test" && model.connection === "Grok"),
	).toBe(true);
	expect(changed.current).toEqual(chosen.current);
	expect(changed.models.some((model) => model.value === changed.current.value)).toBe(false);
	const restarted = await deterministicModelRuntime(directory);
	onTestFinished(() => restarted.close());
	expect((await restarted.offer(options)).current).toEqual(chosen.current);
	const quick = await restarted.offer({ ...options, choose: { value: "spool/google/api_key/quick-image" } });
	expect(quick.current.effort).toBeNull();
	expect(quick.models.find((model) => model.value === quick.current.value)?.supportedEffortLevels).toEqual([]);
	for (const value of [
		"spool/openai/api_key/text-only",
		"spool/openai/api_key/unknown",
		"claude/openai/api_key/spool-test",
	]) {
		await expect(restarted.offer({ ...options, choose: { value } })).rejects.toThrow("not available");
	}
	expect((await restarted.offer(options)).current).toEqual(quick.current);
});
