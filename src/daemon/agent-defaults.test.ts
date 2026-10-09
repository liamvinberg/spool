import { mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mutateMachineState } from "../machine-state";
import { fixtureAgentExecutor, makeApp, makeProject, makeTempDir, until } from "../test-helpers";
import { agentDefaultsFile, createAgentDefaults, ENGINE_ORDER, fallbackEngine } from "./agent-defaults";
import type { AgentEngine, AgentEngineId } from "./agent-engine";
import { createClaudeEngine } from "./agent-engine-claude";
import { threadsDir } from "./agent-threads";

const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";
const OTHER = "2f0e2d3c-4b5a-4697-8899-aabbccddeeff";
const json = (body: unknown) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** An engine that is only there to be counted, never started. */
function standIn(id: AgentEngineId, installed = true): AgentEngine {
	return {
		id,
		installed: () => installed,
		account: async () => ({ signedIn: true, account: id }),
		offer: async () => {
			throw new Error("no offer");
		},
		choice: (_offer, wanted) => wanted,
		start: () => {
			throw new Error("no turns");
		},
		continuable: () => false,
	};
}

describe("the fallback", () => {
	it("is the first installed engine in the order", () => {
		expect(ENGINE_ORDER).toEqual(["claude", "codex", "pi"]);
		expect(fallbackEngine([standIn("pi"), standIn("claude")])).toBe("claude");
		expect(fallbackEngine([standIn("pi"), standIn("claude", false)])).toBe("pi");
		// nothing installed still names the first engine in the order, whose wall says how to get it
		expect(fallbackEngine([standIn("pi", false), standIn("claude", false)])).toBe("claude");
		expect(fallbackEngine([])).toBeUndefined();
	});

	it("starts a machine with nothing saved on that engine and on Auto-edit", async () => {
		const spoolDir = makeTempDir();
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentEngines: [standIn("pi", false), standIn("claude", false)] });
		expect(await (await app.request(`/api/p/${name}/agent/engines`)).json()).toMatchObject({
			preferred: "claude",
			mode: "edits",
		});
	});
});

describe("the machine's agent choice", () => {
	const engines = () => [standIn("pi"), createClaudeEngine(fixtureAgentExecutor().executor, () => true)];

	it("is saved before it is answered and read the same after a restart and in every project", async () => {
		const spoolDir = makeTempDir();
		const first = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentEngines: engines() });
		const choose = (preferred: unknown) =>
			app.request(`/api/p/${first.name}/agent/engines`, { method: "PUT", ...json({ preferred }) });

		expect((await choose("nope")).status).toBe(400);
		expect(await (await choose("pi")).json()).toMatchObject({ preferred: "pi" });
		expect(JSON.parse(readFileSync(agentDefaultsFile(spoolDir), "utf8"))).toMatchObject({ engine: "pi" });
		expect(await (await choose("claude")).json()).toMatchObject({ preferred: "claude" });

		const restarted = makeApp(spoolDir, { agentEngines: engines() });
		const second = makeProject(spoolDir);
		for (const name of [first.name, second.name]) {
			expect(await (await restarted.request(`/api/p/${name}/agent/engines`)).json()).toMatchObject({
				preferred: "claude",
			});
		}
	});

	it("keeps the last value it read when the file stops parsing", async () => {
		const spoolDir = makeTempDir();
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentEngines: engines() });
		await app.request(`/api/p/${name}/agent/engines`, { method: "PUT", ...json({ preferred: "pi" }) });
		await app.request(`/api/p/${name}/agent/threads/${THREAD}/permissions`, {
			method: "PUT",
			...json({ mode: "bypass" }),
		});
		writeFileSync(agentDefaultsFile(spoolDir), "{ half a write");
		expect(await (await app.request(`/api/p/${name}/agent/engines`)).json()).toMatchObject({
			preferred: "pi",
			mode: "bypass",
		});
	});

	it("starts a new thread on it, and leaves a started thread on its own engine", async () => {
		const spoolDir = makeTempDir();
		const { name } = makeProject(spoolDir);
		const claude = fixtureAgentExecutor();
		const app = makeApp(spoolDir, {
			agentEngines: [standIn("pi"), createClaudeEngine(claude.executor, () => true)],
		});
		// nothing saved: the turn takes the fallback rather than any engine of its own
		void app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			...json({ thread: THREAD, said: [{ prompt: "start" }] }),
		});
		await until(() => claude.spawned.length === 1);
		claude.spawned[0]?.exit(0);
		const threads = async () =>
			((await (await app.request(`/api/p/${name}/agent/threads`)).json()) as { threads: { engine: string }[] })
				.threads;
		await expect.poll(async () => (await threads())[0]?.engine).toBe("claude");

		createAgentDefaults(spoolDir, () => []).setEngine("pi");
		// the started thread refuses another engine; a new one takes the machine's
		const refused = await app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			...json({ thread: THREAD, engine: "pi", said: [{ prompt: "again" }] }),
		});
		expect(refused.status).toBe(409);
		const login = async (thread: string) =>
			(await (await app.request(`/api/p/${name}/agent/login?thread=${thread}`)).json()) as { account: string };
		expect((await login(OTHER)).account).toBe("pi");
	});
});

describe("the one-time migration", () => {
	it("takes the most recently written per-project values, and never the removed bundled engine", () => {
		const spoolDir = makeTempDir();
		const older = makeProject(spoolDir);
		const newer = makeProject(spoolDir);
		const set = (root: string, path: string[], value: unknown) =>
			mutateMachineState(spoolDir, { kind: "set-project-setting", root, path, value });
		set(older.root, ["agent", "engine"], "claude");
		set(older.root, ["agent", "permissions"], "ask");
		set(newer.root, ["agent", "engine"], "spool");
		set(newer.root, ["agent", "permissions"], "bypass");
		const registry = join(spoolDir, "registry.json");
		const data = JSON.parse(readFileSync(registry, "utf8"));
		for (const project of data.projects)
			project.openedAt = project.root === newer.root ? "2026-10-02T00:00:00.000Z" : "2026-10-01T00:00:00.000Z";
		writeFileSync(registry, JSON.stringify(data));
		const models = (root: string, defaults: unknown, at: number) => {
			const dir = threadsDir(spoolDir, root);
			mkdirSync(dir, { recursive: true });
			const file = join(dir, "models.json");
			writeFileSync(file, JSON.stringify({ defaults, threads: {} }));
			utimesSync(file, at, at);
		};
		models(older.root, { claude: { value: "haiku", effort: "low" } }, 1000);
		models(newer.root, { claude: { value: "opus", effort: "high" }, spool: { value: "spool/x" } }, 2000);

		const defaults = createAgentDefaults(spoolDir, () => [standIn("pi"), standIn("claude")]);
		expect(defaults.read()).toEqual({ engine: "claude", mode: "bypass" });
		expect(defaults.model("claude")).toEqual({ value: "opus", effort: "high" });
		expect(defaults.model("pi")).toEqual({});

		// once: a later per-project value is not read again
		set(older.root, ["agent", "permissions"], "edits");
		expect(createAgentDefaults(spoolDir, () => [standIn("claude")]).read().mode).toBe("bypass");
	});
});
