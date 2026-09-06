import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAssistantMessageEventStream, type OAuthCredential, Type } from "@earendil-works/pi-ai";
import { createAgentSession, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir } from "../test-helpers";
import { bundledResources } from "./bundled-resources";
import { BundledRuntime } from "./bundled-runtime";
import { BundledCredentialStore, writePrivate } from "./bundled-store";
import { deterministicAuth } from "./fixtures/bundled-auth-provider";
import { deterministicBundledRuntime } from "./fixtures/bundled-provider";

const expired: OAuthCredential = { type: "oauth", access: "old-access", refresh: "old-refresh", expires: 0 };
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

it("uses pi key login for all four launch key providers, with one connection per provider and no readback", async () => {
	const runtime = await deterministicBundledRuntime(makeTempDir());
	onTestFinished(() => runtime.close());
	for (const provider of ["openai", "anthropic", "google", "xai"]) {
		const step = await runtime.request({ kind: "login", provider, method: "api_key" });
		if (!step || !("kind" in step) || step.kind !== "step") throw new Error("Missing login prompt");
		expect(step.step.type).toBe("secret");
		expect(await runtime.request({ kind: "login-input", id: step.id, value: `${provider}-private-key` })).toEqual({
			kind: "connected",
		});
	}

	deterministicAuth(runtime.models, { login: async () => ({ ...expired, expires: Date.now() + 3600000 }) });
	expect(await runtime.request({ kind: "login", provider: "xai", method: "oauth" })).toEqual({ kind: "connected" });
	expect((await runtime.credentials.list()).filter((item) => item.providerId === "xai")).toEqual([
		{ providerId: "xai", type: "oauth" },
	]);
	const replacement = await runtime.request({ kind: "login", provider: "xai", method: "api_key" });
	if (!replacement || !("kind" in replacement) || replacement.kind !== "step")
		throw new Error("Missing replacement prompt");
	expect(await runtime.request({ kind: "login-input", id: replacement.id, value: "replacement-private-key" })).toEqual(
		{ kind: "connected" },
	);
	expect((await runtime.credentials.list()).filter((item) => item.providerId === "xai")).toEqual([
		{ providerId: "xai", type: "api_key" },
	]);
	const account = await runtime.request({ kind: "account" });
	expect(JSON.stringify(account)).not.toContain("private-key");
	expect(await runtime.credentials.list()).toHaveLength(4);
	expect(await runtime.request({ kind: "login", provider: "anthropic", method: "oauth" })).toMatchObject({
		kind: "error",
	});
});

it("discards late login and refresh rotations on cancel, replacement and logout", async () => {
	const runtime = await deterministicBundledRuntime(makeTempDir());
	onTestFinished(() => runtime.close());
	const login = deferred<OAuthCredential>();
	deterministicAuth(runtime.models, { login: () => login.promise });
	const pending = await runtime.request({ kind: "login", provider: "xai", method: "oauth" });
	if (!pending || !("kind" in pending) || pending.kind !== "step") throw new Error("Missing login");
	await runtime.request({ kind: "login-cancel", id: pending.id });
	login.resolve({ ...expired, access: "late-login", expires: Date.now() + 3600000 });
	await new Promise((resolve) => setTimeout(resolve, 30));
	expect(await runtime.credentials.read("xai")).toBeUndefined();
	for (const operation of ["logout", "cancel"] as const) {
		await runtime.credentials.modify("xai", async () => expired);
		const refresh = deferred<OAuthCredential>();
		const entered = deferred<void>();
		deterministicAuth(runtime.models, {
			refresh: async () => {
				entered.resolve();
				return refresh.promise;
			},
			login: () => new Promise(() => {}),
		});
		const request = runtime.models.getAuth("xai");
		const rejected = expect(request).rejects.toThrow();
		await entered.promise;
		if (operation === "logout") {
			const logout = runtime.request({ kind: "disconnect", provider: "xai" });
			refresh.resolve({ ...expired, access: "stale-rotation", expires: Date.now() + 3600000 });
			await logout;
			expect(await runtime.credentials.read("xai")).toBeUndefined();
		} else {
			const next = await runtime.request({ kind: "login", provider: "xai", method: "oauth" });
			if (!next || !("kind" in next) || next.kind !== "step") throw new Error("Missing login");
			await runtime.request({ kind: "login-cancel", id: next.id });
			refresh.resolve({ ...expired, access: "stale-rotation", expires: Date.now() + 3600000 });
		}
		await rejected;
		expect(readFileSync(join(runtime.directory, "credentials.json"), "utf8")).not.toContain("stale-rotation");
	}
});

it("surfaces failed login and rotated-token persistence without using an unsaved secret", async () => {
	const base = await deterministicBundledRuntime(makeTempDir());
	let fail = false;
	const store = new BundledCredentialStore(makeTempDir(), (path, content) => {
		if (fail) throw new Error("disk full including private-token");
		writePrivate(path, content);
	});
	const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
	const models = await ModelRuntime.create({ credentials: store, modelsPath: null, refreshOnCreate: false });
	const configuration = base.models.getRegisteredProviderConfig("openai");
	if (!configuration) throw new Error("Missing fixture provider");
	models.registerProvider("openai", configuration);
	const runtime = new BundledRuntime(makeTempDir(), store, models);
	onTestFinished(() => runtime.close());
	await store.modify("xai", async () => expired);
	deterministicAuth(models, {
		refresh: async () => ({ ...expired, access: "unsaved-access", expires: Date.now() + 3600000 }),
	});
	fail = true;
	await expect(models.getAuth("xai")).rejects.toThrow();
	expect(await store.read("xai")).toEqual(expired);
	const step = await runtime.request({ kind: "login", provider: "openai", method: "api_key" });
	if (!step || !("kind" in step) || step.kind !== "step") throw new Error("Missing prompt");
	const result = await runtime.request({ kind: "login-input", id: step.id, value: "unsaved-secret" });
	expect(result).toMatchObject({ kind: "error" });
	expect(JSON.stringify(result)).not.toMatch(/private-token|unsaved-secret/);
	await base.close();
});

it("refreshes once for concurrent consumers and again inside a real SDK tool loop", async () => {
	const runtime = await deterministicBundledRuntime(makeTempDir());
	onTestFinished(() => runtime.close());
	let refreshes = 0;
	deterministicAuth(runtime.models, {
		refresh: async () => ({
			...expired,
			refresh: `refresh-${++refreshes}`,
			access: `access-${refreshes}`,
			expires: Date.now() + 3600000,
		}),
	});
	await runtime.credentials.modify("xai", async () => expired);
	const values = await Promise.all([runtime.models.getAuth("xai"), runtime.models.getAuth("xai")]);
	expect(refreshes).toBe(1);
	expect(values.map((result) => result?.auth.apiKey)).toEqual(["access-1", "access-1"]);
	const provider = runtime.models.getProvider("xai");
	const model = runtime.models.getModels("xai")[0];
	if (!provider || !model) throw new Error("Missing provider");
	const keys: (string | undefined)[] = [];
	runtime.models.registerNativeProvider({
		...provider,
		streamSimple: (model, context, options) => {
			keys.push(options?.apiKey);
			const stream = createAssistantMessageEventStream();
			const tool = !context.messages.some((entry) => entry.role === "toolResult");
			const message = {
				role: "assistant" as const,
				api: model.api,
				provider: model.provider,
				model: model.id,
				timestamp: Date.now(),
				content: tool
					? [{ type: "toolCall" as const, id: "expire", name: "expire", arguments: {} }]
					: [{ type: "text" as const, text: "Done" }],
				stopReason: tool ? ("toolUse" as const) : ("stop" as const),
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
			};
			queueMicrotask(() => {
				stream.push({ type: "done", reason: message.stopReason, message });
				stream.end(message);
			});
			return stream;
		},
	});
	const root = makeTempDir();
	const { session } = await createAgentSession({
		cwd: root,
		modelRuntime: runtime.models,
		model,
		sessionManager: SessionManager.inMemory(root, { id: randomUUID() }),
		resourceLoader: bundledResources(root),
		settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
		noTools: "all",
		tools: ["expire"],
		customTools: [
			{
				name: "expire",
				label: "Expire",
				description: "Expire fixture credentials",
				parameters: Type.Object({}),
				execute: async () => {
					await runtime.credentials.modify("xai", async () => ({ ...expired, refresh: "refresh-1" }));
					return { content: [{ type: "text", text: "Expired fixture token" }], details: {} };
				},
			},
		],
	});
	onTestFinished(() => session.dispose());
	await session.prompt("Use the tool, then finish.");
	expect(keys).toEqual(["access-1", "access-2"]);
	expect(refreshes).toBe(2);
});

it("handles browser callback cancellation of manual input and rejects stale prompt answers", async () => {
	const runtime = await deterministicBundledRuntime(makeTempDir());
	onTestFinished(() => runtime.close());
	const callback = new AbortController();
	let selection = "";
	deterministicAuth(runtime.models, {
		login: async (interaction) => {
			interaction.notify({
				type: "info",
				message: "Use the account you want to connect.",
				links: [{ label: "Account help", url: "https://example.invalid/help" }],
			});
			await new Promise((resolve) => setTimeout(resolve, 50));
			await interaction
				.prompt({ type: "manual_code", message: "Paste code", signal: callback.signal })
				.catch(() => {});
			selection = await interaction.prompt({
				type: "select",
				message: "Choose account",
				options: [{ id: "personal", label: "Personal" }],
			});
			return { ...expired, expires: Date.now() + 3600000 };
		},
	});
	const start = await runtime.request({ kind: "login", provider: "xai", method: "oauth" });
	if (!start || !("kind" in start) || start.kind !== "step") throw new Error("Missing info");
	expect(start.step.type).toBe("info");
	await new Promise((resolve) => setTimeout(resolve, 60));
	const manual = await runtime.request({ kind: "login-poll", id: start.id });
	if (!manual || !("kind" in manual) || manual.kind !== "step") throw new Error("Missing prompt");
	callback.abort();
	await runtime.request({ kind: "login-input", id: start.id, revision: manual.revision, value: "personal" });
	expect(selection).toBe("");
	const choice = await runtime.request({ kind: "login-poll", id: start.id });
	if (!choice || !("kind" in choice) || choice.kind !== "step") throw new Error("Missing choice");
	expect(choice.step.type).toBe("select");
	expect(
		await runtime.request({ kind: "login-input", id: start.id, revision: choice.revision, value: "personal" }),
	).toEqual({ kind: "connected" });
});

it("does not render or persist credential-bearing provider errors", async () => {
	const runtime = await deterministicBundledRuntime(makeTempDir());
	onTestFinished(() => runtime.close());
	await runtime.request({ kind: "connect", provider: "openai", key: "private-provider-key" });
	const provider = runtime.models.getProvider("openai");
	if (!provider) throw new Error("Missing provider");
	runtime.models.registerNativeProvider({
		...provider,
		streamSimple: (model) => {
			const stream = createAssistantMessageEventStream();
			const message = {
				role: "assistant" as const,
				api: model.api,
				provider: model.provider,
				model: model.id,
				timestamp: Date.now(),
				content: [],
				stopReason: "error" as const,
				errorMessage: "Request failed: Bearer private-provider-key",
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
			};
			queueMicrotask(() => {
				stream.push({ type: "error", reason: "error", error: message });
				stream.end(message);
			});
			return stream;
		},
	});
	const id = randomUUID();
	const events: unknown[] = [];
	await runtime.turn(
		"failed",
		{
			root: makeTempDir(),
			session: { id },
			said: [{ prompt: "hello", selection: "" }],
			ask: { value: "spool/openai/api_key/spool-test" },
			permissions: "ask",
		},
		(event) => events.push(event),
	);
	expect(JSON.stringify(events)).not.toContain("private-provider-key");
	expect(readFileSync(join(runtime.directory, "sessions", `${id}.jsonl`), "utf8")).not.toContain(
		"private-provider-key",
	);
});
