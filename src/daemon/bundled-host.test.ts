import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import type { AgentEvent } from "./agent-events";

it("starts one lazy real host, stops on host failure and reopens the exact saved session", {
	timeout: 30_000,
}, async () => {
	const directory = makeTempDir();
	const children: ChildProcess[] = [];
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-provider-host.ts", import.meta.url)), [], {
			env: bundledEnvironment(state),
			execArgv: ["--import", import.meta.resolve("tsx")],
			stdio: ["ignore", "ignore", "pipe", "ipc"],
		});
		children.push(child);
		return child;
	});
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
	const engine = createSpoolEngine(directory, client);
	expect(children).toHaveLength(0);
	if (engine.authentication.kind !== "managed") throw new Error("Expected managed auth");
	const step = await engine.authentication.start("openai", "api_key");
	if (step.kind !== "input") throw new Error("Expected key input");
	expect(await engine.authentication.input(step.id, "fixture-key")).toEqual({ kind: "connected" });
	expect(children).toHaveLength(1);
	const options = {
		root: makeTempDir(),
		session: { id: randomUUID() },
		said: [{ prompt: "hello", selection: "selection one" }],
		ask: { value: "openai/spool-test" },
		permissions: "ask" as const,
	};
	const first: AgentEvent[] = [];
	for await (const event of engine.start(options).events) first.push(event);
	expect(first.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
	const second = engine.start({ ...options, said: [{ prompt: "hold this turn", selection: "selection two" }] });
	const secondEvents: AgentEvent[] = [];
	const read = (async () => {
		for await (const event of second.events) secondEvents.push(event);
	})();
	await expect.poll(() => secondEvents.some((event) => event.kind === "say")).toBe(true);
	children[0]?.kill("SIGKILL");
	await read;
	expect(secondEvents.at(-1)).toMatchObject({ kind: "closed", code: 1 });
	expect(await engine.continuable(options.root, options.session)).toBe(true);
	const third: AgentEvent[] = [];
	for await (const event of engine.start({ ...options, said: [{ prompt: "resume", selection: "selection three" }] })
		.events)
		third.push(event);
	expect(children).toHaveLength(2);
	expect(third.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
	const calls = readFileSync(join(directory, "provider-calls.jsonl"), "utf8").trim().split("\n");
	expect(calls).toHaveLength(3);
	expect(calls[2]).toContain("selection one");
	expect(calls[2]).toContain("selection two");
	expect(calls[2]).toContain("selection three");
});

it("does not pass ambient accounts, executable settings or provider variables to the host", async () => {
	const environment = bundledEnvironment(makeTempDir());
	for (const name of [
		"OPENAI_API_KEY",
		"ANTHROPIC_API_KEY",
		"NODE_OPTIONS",
		"AWS_PROFILE",
		"GOOGLE_APPLICATION_CREDENTIALS",
		"PI_AUTH_FILE",
	])
		expect(environment[name]).toBeUndefined();
	expect(environment.HOME).not.toBe(process.env.HOME);
	const engine = createSpoolEngine(makeTempDir());
	onTestFinished(() => engine.close?.());
	expect(await engine.account(makeTempDir())).toEqual({ signedIn: false, account: null });
});
