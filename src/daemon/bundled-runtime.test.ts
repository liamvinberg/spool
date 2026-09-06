import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Context } from "@earendil-works/pi-ai";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeTempDir, writeDesignFile } from "../test-helpers";
import type { EngineTurnOptions } from "./agent-engine";
import type { AgentEvent } from "./agent-events";
import { BundledRuntime } from "./bundled-runtime";
import { BundledCredentialStore, writePrivate } from "./bundled-store";
import { deterministicBundledRuntime } from "./fixtures/bundled-provider";

function options(root: string, id = randomUUID(), prompt = "hello"): EngineTurnOptions {
	return {
		root,
		session: { id },
		said: [
			{
				prompt,
				selection: "<selection>first frame</selection>",
				attachment: { media: "image/png", data: "aGVsbG8=" },
			},
		],
		ask: { value: "openai/spool-test", effort: "high" },
		permissions: "ask",
	};
}

describe("owned bundled credentials", () => {
	it("serializes refresh, login and logout and preserves the last saved value on failure", async () => {
		const directory = makeTempDir();
		let fail = false;
		const store = new BundledCredentialStore(directory, (path, body) => {
			if (fail) throw new Error("disk full");
			writePrivate(path, body);
		});
		await store.modify("openai", async () => ({ type: "api_key", key: "original" }));
		let release: (() => void) | undefined;
		const pending = store.modify("openai", async () => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return { type: "api_key", key: "refreshed" };
		});
		await Promise.resolve();
		const logout = store.delete("openai");
		release?.();
		await expect(pending).rejects.toThrow("Connection changed");
		await logout;
		expect(await store.read("openai")).toBeUndefined();
		await store.modify("openai", async () => ({ type: "api_key", key: "saved" }));
		fail = true;
		await expect(store.modify("openai", async () => ({ type: "api_key", key: "unsaved" }))).rejects.toThrow(
			"disk full",
		);
		expect(await store.read("openai")).toEqual({ type: "api_key", key: "saved" });
		expect(await store.list()).toEqual([{ providerId: "openai", type: "api_key" }]);
		expect(statSync(directory).mode & 0o777).toBe(0o700);
		expect(statSync(join(directory, "credentials.json")).mode & 0o777).toBe(0o600);
	});
});

it("continues exact SDK sessions with images and context, independent threads, and no discovered code", async () => {
	const directory = makeTempDir();
	const root = makeTempDir();
	const contexts: Context[] = [];
	writeDesignFile(root, "AGENTS.md", "Project instruction as text");
	writeDesignFile(
		root,
		"../.pi/extensions/evil.ts",
		`require('node:fs').writeFileSync(${JSON.stringify(join(root, "executed"))}, 'yes')`,
	);
	const runtime = await deterministicBundledRuntime(directory, (context) => contexts.push(structuredClone(context)));
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const first = options(root);
	const events: AgentEvent[] = [];
	await runtime.turn("first", first, (event) => events.push(event));
	expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "done", reason: null });
	expect(contexts[0]?.tools?.map((tool) => tool.name)).toEqual(["read", "write", "edit", "ask_person"]);
	expect(JSON.stringify(contexts[0])).toContain("aGVsbG8=");
	expect(JSON.stringify(contexts[0])).toContain("first frame");
	expect(contexts[0]?.systemPrompt).toContain("Project instruction as text");
	expect(existsSync(join(root, "executed"))).toBe(false);
	await runtime.close();
	const restarted = await deterministicBundledRuntime(directory, (context) => contexts.push(structuredClone(context)));
	onTestFinished(() => restarted.close());
	await Promise.all([
		restarted.turn("resume", { ...first, said: [{ prompt: "continue", selection: "second selection" }] }, () => {}),
		restarted.turn("other", options(root), () => {}),
	]);
	expect(
		contexts
			.slice(1)
			.map((context) => context.messages.filter((message) => message.role === "user").length)
			.sort(),
	).toEqual([1, 2]);
	const session = readFileSync(join(directory, "sessions", `${first.session.id}.jsonl`), "utf8");
	expect(session).toContain("aGVsbG8=");
	expect(session).toContain("second selection");
	expect(statSync(join(directory, "sessions", `${first.session.id}.jsonl`)).mode & 0o777).toBe(0o600);
});

it("stops one active session without affecting another and refuses simultaneous turns in it", async () => {
	const directory = makeTempDir();
	const runtime = await deterministicBundledRuntime(directory);
	onTestFinished(() => runtime.close());
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const first = options(makeTempDir(), randomUUID(), "hold this turn");
	const events: AgentEvent[] = [];
	const held = runtime.turn("held", first, (event) => events.push(event));
	await expect.poll(() => events.some((event) => event.kind === "say")).toBe(true);
	await expect(runtime.turn("duplicate", first, () => {})).rejects.toThrow("active turn");
	await runtime.turn("independent", options(first.root), () => {});
	await runtime.request({ kind: "stop", turn: "held" });
	await held;
	expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "stopped" });
});

it("reports session save failure before inference and keeps the existing exact file intact", async () => {
	const directory = makeTempDir();
	const base = await deterministicBundledRuntime(directory);
	await base.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const original = options(makeTempDir());
	await base.turn("saved", original, () => {});
	await base.close();
	const path = join(directory, "sessions", `${original.session.id}.jsonl`);
	const saved = readFileSync(path, "utf8");
	const failing = new BundledRuntime(directory, base.credentials, base.models, () => {
		throw new Error("disk full");
	});
	const events: AgentEvent[] = [];
	await failing.turn("failure", original, (event) => events.push(event));
	expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "failed", reason: "disk full" });
	expect(readFileSync(join(directory, "provider-calls.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
	expect(readFileSync(path, "utf8")).toBe(saved);
	await failing.close();
	await base.close();
});

it("saves before idle disposal and reloads exact context with current instruction text", async () => {
	const directory = makeTempDir();
	const root = makeTempDir();
	const contexts: Context[] = [];
	const base = await deterministicBundledRuntime(directory, (context) => contexts.push(structuredClone(context)));
	await base.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	let saves = 0;
	const runtime = new BundledRuntime(
		directory,
		base.credentials,
		base.models,
		(path, value) => {
			writePrivate(path, value);
			saves += 1;
		},
		10,
	);
	onTestFinished(() => runtime.close());
	const first = options(root);
	await runtime.turn("first", first, () => {});
	const afterTurn = saves;
	await expect.poll(() => saves).toBeGreaterThan(afterTurn);
	writeDesignFile(root, "AGENTS.md", "Instruction changed after idle disposal");
	await runtime.turn("second", { ...first, said: [{ prompt: "continue", selection: "" }] }, () => {});
	expect(contexts[1]?.systemPrompt).toContain("Instruction changed after idle disposal");
	expect(contexts[1]?.messages.filter((message) => message.role === "user")).toHaveLength(2);
});
