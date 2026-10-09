import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	agentReader,
	makeApp,
	makeProject,
	makeTempDir,
	replayAgentExecutor,
	scriptedAgentExecutor,
} from "../test-helpers";
import { shimDir } from "./agent-cli";
import { CODEX_DESIGNER_DESCRIPTION, CODEX_DESIGNER_FRAMING, codexFraming } from "./agent-codex-spawn";
import { DESIGNER_FRAMING, DESIGNER_PROMPT, designerDir, mountDesigner } from "./agent-designer";
import { piFraming } from "./agent-engine-pi";
import type { AgentEvent } from "./agent-events";
import { agentFraming } from "./agent-spawn";

/** the spool threads the recordings were made under, which each engine took as its session */
const CLAUDE = "6b5c1d2e-1111-4222-8333-444455556666";
const CODEX = "00000000-0000-4000-8000-000000000373";
const PI = "01a11e00-0000-7000-8000-000000000371";

/** the value that follows a flag, the way the child's argv reads it */
function flagValue(args: readonly string[], flag: string): string | undefined {
	const at = args.indexOf(flag);
	return at < 0 ? undefined : args[at + 1];
}

/** every `-c` override a Codex spawn carries */
function overrides(args: readonly string[]): string[] {
	return args.flatMap((arg, at) => (arg === "-c" ? [args[at + 1] as string] : []));
}

/** a daemon with every engine on recorded sessions, and the project it serves */
function daemon(executor: Parameters<typeof makeApp>[1] = {}) {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	const before = readdirSync(root, { recursive: true }).map(String).sort();
	const app = makeApp(spoolDir, { agentLook: () => true, ...executor });
	const put = (route: string, body: unknown) =>
		app.request(`/api/p/${name}/agent/${route}`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	return {
		spoolDir,
		root,
		name,
		app,
		/** the project's files now, less the ones it started with */
		added: () =>
			readdirSync(root, { recursive: true })
				.map(String)
				.filter((file) => !before.includes(file)),
		choose: async (engine: string, thread: string) => {
			expect((await put("engines", { preferred: engine })).status).toBe(200);
			expect((await put(`threads/${thread}/permissions`, { mode: "edits" })).status).toBe(200);
		},
		turn: async (thread: string, prompt: string) => {
			const res = await app.request(`/api/p/${name}/agent/turn`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ thread, said: [{ prompt }] }),
			});
			const events = agentReader(res);
			const seen: AgentEvent[] = [];
			for (;;) {
				const event = (await events.next(5000)).data as AgentEvent;
				seen.push(event);
				if (event.kind === "closed") return seen;
			}
		},
	};
}

/** what a fan-out looks like from the rail: the delegations, their tasks, and where they landed */
function fanOut(events: readonly AgentEvent[]) {
	const delegations = events.filter(
		(event) => event.kind === "called" && event.tool === "Agent" && event.parent === null,
	);
	const started = events.filter((event) => event.kind === "task-started");
	const done = events.filter((event) => event.kind === "task-done");
	const calls = new Set(delegations.map((event) => (event.kind === "called" ? event.id : "")));
	const nested = events.filter((event) => event.parent !== null && calls.has(event.parent));
	return { delegations, started, done, calls, nested };
}

describe("the designer's files", () => {
	it("live in spool's own state, one per engine", () => {
		const spoolDir = makeTempDir();
		const mount = {
			claude: mountDesigner(spoolDir, "claude"),
			codex: mountDesigner(spoolDir, "codex"),
			pi: mountDesigner(spoolDir, "pi"),
		};

		expect(mount).toEqual({
			claude: join(designerDir(spoolDir), "claude-agents.json"),
			codex: join(designerDir(spoolDir), "codex-designer.toml"),
			pi: join(designerDir(spoolDir), "pi-designer.ts"),
		});
		const agents = JSON.parse(readFileSync(mount.claude, "utf8")) as Record<string, { prompt: string }>;
		expect(Object.keys(agents)).toEqual(["designer"]);
		expect(agents.designer?.prompt).toBe(DESIGNER_PROMPT);
		expect(readFileSync(mount.codex, "utf8")).toBe(`developer_instructions = ${JSON.stringify(DESIGNER_PROMPT)}\n`);
		const extension = readFileSync(mount.pi, "utf8");
		expect(extension).toContain('name: "designer"');
		expect(extension).toContain(JSON.stringify(DESIGNER_PROMPT));
	});

	it("mount only the engine's own file", () => {
		const spoolDir = makeTempDir();
		mountDesigner(spoolDir, "codex");
		expect(readdirSync(designerDir(spoolDir))).toEqual(["codex-designer.toml"]);
	});

	it("are written again only when spool's designer changed", () => {
		const spoolDir = makeTempDir();
		const files = (["claude", "codex", "pi"] as const).map((engine) => mountDesigner(spoolDir, engine));
		const stamps = files.map((file) => statSync(file).mtimeMs);
		for (const engine of ["claude", "codex", "pi"] as const) mountDesigner(spoolDir, engine);
		expect(files.map((file) => statSync(file).mtimeMs)).toEqual(stamps);
	});
});

describe("the framing", () => {
	it("tells every engine's main agent to fan directions out and keep single edits", () => {
		expect(DESIGNER_FRAMING).toBe(
			"When someone asks for options or several directions, give each direction to its own designer with a brief. Make single edits yourself.",
		);
		expect(agentFraming()).toContain(DESIGNER_FRAMING);
		expect(piFraming()).toContain(DESIGNER_FRAMING);
		// Codex lists its multi-agent tools only under exec's ALL_TOOLS, so its line says where
		expect(codexFraming()).toContain(CODEX_DESIGNER_FRAMING);
		expect(CODEX_DESIGNER_FRAMING.startsWith(DESIGNER_FRAMING)).toBe(true);
	});
});

describe("claude's designer", () => {
	it("rides each turn as an --agents file in spool's state, and its fan-out replays as delegations", async () => {
		const agent = replayAgentExecutor("claude-designers");
		const { spoolDir, root, added, turn } = daemon({ agentExecutor: agent.executor });

		const events = await turn(CLAUDE, "two directions for the hello frame");

		const args = agent.spawned[0]?.spawn.args ?? [];
		expect(flagValue(args, "--agents")).toBe(mountDesigner(spoolDir, "claude"));
		expect(flagValue(args, "--agents")?.startsWith(spoolDir)).toBe(true);
		expect(existsSync(flagValue(args, "--agents") as string)).toBe(true);
		expect(flagValue(args, "--agents")?.startsWith(root)).toBe(false);
		// the designers it delegates to share its shell, so this daemon's spool leads their PATH
		expect(agent.spawned[0]?.spawn.env.PATH?.split(delimiter)[0]).toBe(shimDir(spoolDir));
		expect(added()).toEqual([]);

		const { delegations, started, done, nested } = fanOut(events);
		expect(delegations).toHaveLength(2);
		expect(
			delegations.every(
				(event) =>
					event.kind === "called" && (event.input as { subagent_type?: string }).subagent_type === "designer",
			),
		).toBe(true);
		expect(started.map((event) => event.kind === "task-started" && event.agent)).toEqual(["designer", "designer"]);
		// Claude says a task is done twice, as it updates and as it notifies
		expect(new Set(done.map((event) => event.kind === "task-done" && event.task)).size).toBe(2);
		expect(nested.length).toBeGreaterThan(0);
	});
});

describe("codex's designer", () => {
	it("rides each turn as an agent role whose config is in spool's state", async () => {
		const codex = scriptedAgentExecutor("codex-designers");
		const { spoolDir, root, added, choose, turn } = daemon({ agentExecutor: codex.executor });
		await choose("codex", CODEX);

		await turn(CODEX, "two directions for the hello frame");

		const args = codex.spawned[0]?.spawn.args ?? [];
		const file = mountDesigner(spoolDir, "codex");
		expect(overrides(args)).toContain(`agents.designer.config_file=${JSON.stringify(file)}`);
		expect(overrides(args)).toContain(`agents.designer.description=${JSON.stringify(CODEX_DESIGNER_DESCRIPTION)}`);
		expect(file.startsWith(spoolDir) && !file.startsWith(root)).toBe(true);
		expect(existsSync(file)).toBe(true);
		// a role rides as flags: Codex's own home is never pointed elsewhere
		expect(codex.spawned[0]?.spawn.env.CODEX_HOME).toBe(process.env.CODEX_HOME);
		expect(codex.spawned[0]?.spawn.env.PATH?.split(delimiter)[0]).toBe(shimDir(spoolDir));
		expect(added()).toEqual([]);
		expect(codex.spawned[0]?.mismatches).toEqual([]);
	});

	it("reads each spawn as a delegation, with the sub-agent's work under it until its thread lands", async () => {
		const codex = scriptedAgentExecutor("codex-designers");
		const { choose, turn } = daemon({ agentExecutor: codex.executor });
		await choose("codex", CODEX);

		const events = await turn(CODEX, "two directions for the hello frame");

		const { delegations, started, done, calls, nested } = fanOut(events);
		expect(delegations).toHaveLength(2);
		expect(started).toHaveLength(2);
		expect(started.every((event) => event.kind === "task-started" && calls.has(event.call ?? ""))).toBe(true);
		expect(done.map((event) => event.kind === "task-done" && event.status)).toEqual(["completed", "completed"]);
		expect(done.every((event) => event.kind === "task-done" && (event.summary ?? "").includes("frame.tsx"))).toBe(
			true,
		);
		// a `wait` names the children too, but they stay under the call that spawned them
		const waits = events.filter((event) => event.kind === "called" && event.tool === "wait");
		expect(waits.length).toBeGreaterThan(0);
		const parents = new Set(nested.map((event) => event.parent));
		expect(parents).toEqual(calls);
		// all but the status a child reports in the moment before its spawn names it
		const strays = events.filter((event) => event.parent !== null && !calls.has(event.parent));
		expect(strays.every((event) => event.kind === "other" && event.type === "thread/status/changed")).toBe(true);
		// only the main thread's turn ends the turn
		expect(events.filter((event) => event.kind === "ended")).toHaveLength(1);
	});

	it("holds a spot for each designer, by the role Codex names when asked", async () => {
		const codex = scriptedAgentExecutor("codex-designers");
		const { choose, turn } = daemon({ agentExecutor: codex.executor });
		await choose("codex", CODEX);

		const events = await turn(CODEX, "two directions for the hello frame");

		expect(codex.spawned[0]?.mismatches).toEqual([]);
		// the spawn names no role: the turn asks each child's thread for it
		const reads = (codex.spawned[0]?.inputs ?? [])
			.map((line) => JSON.parse(line) as { method?: string; params?: { threadId?: string } })
			.filter((line) => line.method === "thread/read");
		const { started } = fanOut(events);
		expect(reads.map((line) => line.params?.threadId)).toEqual(
			started.map((event) => event.kind === "task-started" && event.task),
		);
		expect(started.map((event) => event.kind === "task-started" && event.agent)).toEqual(["designer", "designer"]);
		// each spot is held the moment its designer starts, before anything it does, named from its brief
		const held = events.filter((event) => event.kind === "spot" && event.state === "held");
		expect(held.map((event) => event.kind === "spot" && event.name)).toEqual(["hello-loud", "hello-calm"]);
		for (const spot of held) {
			const call = spot.kind === "spot" ? spot.call : null;
			const work = events.findIndex((event) => event.parent === call && event.kind !== "other");
			expect(work).toBeGreaterThan(events.indexOf(spot));
		}
	});

	it("leaves a probe without the designer", async () => {
		const codex = scriptedAgentExecutor("codex-models");
		const { app, name } = daemon({ agentExecutor: codex.executor });

		await app.request(`/api/p/${name}/agent/threads/${CODEX}/models?engine=codex`);

		expect(codex.spawned.length).toBeGreaterThan(0);
		for (const proc of codex.spawned)
			expect(overrides(proc.spawn.args).some((value) => value.startsWith("agents."))).toBe(false);
	});
});

describe("pi's designer", () => {
	it("rides each turn as an extension in spool's state, and its calls replay as delegations", async () => {
		const pi = scriptedAgentExecutor("pi-designers");
		const { spoolDir, root, added, choose, turn } = daemon({ agentExecutor: pi.executor });
		await choose("pi", PI);

		const events = await turn(PI, "two directions for the hello frame");

		const args = pi.spawned[0]?.spawn.args ?? [];
		expect(flagValue(args, "-e")).toBe(mountDesigner(spoolDir, "pi"));
		expect(flagValue(args, "-e")?.startsWith(root)).toBe(false);
		expect(existsSync(flagValue(args, "-e") as string)).toBe(true);
		expect(pi.spawned[0]?.spawn.env.PATH?.split(delimiter)[0]).toBe(shimDir(spoolDir));
		expect(added()).toEqual([]);
		expect(pi.spawned[0]?.mismatches).toEqual([]);

		const { delegations, started, done } = fanOut(events);
		expect(
			delegations.map((event) => event.kind === "called" && (event.input as { description?: string }).description),
		).toEqual(["Calm hello frame", "Loud hello frame"]);
		expect(started.map((event) => event.kind === "task-started" && event.agent)).toEqual(["designer", "designer"]);
		const steps = events.filter((event) => event.kind === "task-step");
		expect(steps.length).toBeGreaterThan(2);
		expect(
			steps.some(
				(event) => event.kind === "task-step" && (event.description ?? "").startsWith("write design/frames/"),
			),
		).toBe(true);
		expect(done.map((event) => event.kind === "task-done" && event.status)).toEqual(["completed", "completed"]);
		expect(done.every((event) => event.kind === "task-done" && (event.summary ?? "").startsWith("Created"))).toBe(
			true,
		);
	});

	it("leaves a probe without the designer", async () => {
		const pi = scriptedAgentExecutor("pi-models");
		const { app, name } = daemon({ agentExecutor: pi.executor });

		await app.request(`/api/p/${name}/agent/threads/${PI}/models?engine=pi`);

		expect(pi.spawned[0]?.spawn.args).toEqual(["--mode", "rpc", "--no-session"]);
	});
});
