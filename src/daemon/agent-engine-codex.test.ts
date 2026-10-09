import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	agentReader,
	fixtureAgentExecutor,
	makeApp,
	makeProject,
	makeTempDir,
	readCapture,
	type ScriptedStep,
	scriptedAgentExecutor,
} from "../test-helpers";
import { fallbackEngine } from "./agent-defaults";
import { codexChoice, codexOffer, codexSessions, createCodexEngine } from "./agent-engine-codex";
import type { AgentEvent } from "./agent-events";
import type { AgentTurn } from "./agent-turn";

const SESSION = { id: "6f1c1e4e-7d2a-4c1b-9a51-1a2b3c4d5e6f" };

/** the engine on recorded sessions */
function engineOn(...captures: [string, ...string[]]) {
	const scripted = scriptedAgentExecutor(...captures);
	const spoolDir = makeTempDir();
	const engine = createCodexEngine({
		executor: scripted.executor,
		spoolDir,
		version: "0.33.1",
	});
	return { engine, spoolDir, ...scripted };
}

/** every event a turn sends, answering what it asks the way `reply` says */
async function drain(turn: AgentTurn, on?: (event: AgentEvent) => void): Promise<AgentEvent[]> {
	const events: AgentEvent[] = [];
	for await (const event of turn.events) {
		events.push(event);
		on?.(event);
	}
	return events;
}

/** the first thread id a capture's out lines name in a notification */
function threadIn(capture: string, method: string): string {
	const params = outs(capture, method)[0]?.params as { threadId?: string; thread?: { id: string } } | undefined;
	const id = params?.threadId ?? params?.thread?.id;
	if (id === undefined) throw new Error(`${capture} has no ${method}`);
	return id;
}

/** what a capture's out lines carry, by method */
function outs(capture: string, method: string): Record<string, unknown>[] {
	return (readCapture(capture) as ScriptedStep[]).flatMap((step) =>
		"out" in step && step.out.method === method ? [step.out] : [],
	);
}

const ask = { value: "gpt-5.6-luna", effort: "low" };

describe("a codex turn, replayed", () => {
	it("starts a thread, keeps its id and streams the turn the way the rail reads it", async () => {
		const { engine, spoolDir, spawned } = engineOn("codex-turn");
		const turn = engine.start({
			root: makeTempDir(),
			session: SESSION,
			said: [
				{ prompt: "Run the shell command `ls design` and then reply with the single word ready.", selection: "" },
			],
			ask,
			permissions: "edits",
		});
		const events = await drain(turn);
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(spawned[0]?.remaining).toEqual([]);
		const thread = threadIn("codex-turn", "thread/started");
		expect(codexSessions(spoolDir).read(SESSION.id)).toBe(thread);
		expect(engine.continuable("", SESSION)).toBe(true);
		const kinds = events.map((event) => event.kind).filter((kind) => kind !== "other");
		expect(kinds[0]).toBe("ready");
		expect(events.find((event) => event.kind === "called")).toMatchObject({
			tool: "Bash",
			input: { command: "ls design" },
			parent: null,
		});
		expect(events.find((event) => event.kind === "result")).toMatchObject({ failed: false, text: "frames\n" });
		expect(
			events.filter((event) => event.kind === "said").map((event) => event.kind === "said" && event.text),
		).toEqual(["ready"]);
		expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
		expect(kinds.at(-1)).toBe("closed");
	});

	it("asks for the model and effort the thread chose, under the mode's policy and sandbox", async () => {
		const { engine, spawned } = engineOn("codex-turn");
		await drain(
			engine.start({
				root: makeTempDir(),
				session: SESSION,
				said: [{ prompt: "hi", selection: "" }],
				ask,
				permissions: "edits",
			}),
		);
		const lines = spawned[0]?.inputs.map(
			(line) => JSON.parse(line) as { method?: string; params?: Record<string, unknown> },
		);
		expect(lines?.find((line) => line.method === "thread/start")?.params).toMatchObject({
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
			model: "gpt-5.6-luna",
		});
		// a thread/start naming its cwd would have Codex write the project's trust into the
		// person's config.toml; the process already runs there
		expect(lines?.find((line) => line.method === "thread/start")?.params).not.toHaveProperty("cwd");
		expect(lines?.find((line) => line.method === "turn/start")?.params).toMatchObject({ effort: "low" });
	});

	it("resumes the thread spool kept, without asking Codex for its whole history", async () => {
		const { engine, spoolDir, spawned } = engineOn("codex-resume");
		const thread = threadIn("codex-resume", "thread/status/changed");
		codexSessions(spoolDir).write(SESSION.id, thread);
		const events = await drain(
			engine.start({
				root: makeTempDir(),
				session: SESSION,
				said: [{ prompt: "again", selection: "" }],
				ask,
				permissions: "edits",
			}),
		);
		expect(spawned[0]?.mismatches).toEqual([]);
		const resume = spawned[0]?.inputs.map((line) => JSON.parse(line)).find((line) => line.method === "thread/resume");
		expect(resume.params).toMatchObject({ threadId: thread, excludeTurns: true });
		expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
	});

	it("answers design/ writes and spool read verbs itself, and asks the person about the rest", async () => {
		const { engine, spawned } = engineOn("codex-ask");
		const turn = engine.start({
			root: makeTempDir(),
			session: SESSION,
			said: [{ prompt: "go", selection: "" }],
			ask,
			permissions: "ask",
		});
		const asked: AgentEvent[] = [];
		const events = await drain(turn, (event) => {
			if (event.kind !== "asking") return;
			asked.push(event);
			expect(turn.answer(event.request, { kind: "allow" })).toBe(true);
		});
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(spawned[0]?.remaining).toEqual([]);
		// the frame write and `spool skill` never reach the person
		expect(asked).toHaveLength(1);
		expect(asked[0]).toMatchObject({ tool: "Bash", input: { command: "touch outside.txt" } });
		const decisions = spawned[0]?.inputs
			.map((line) => JSON.parse(line))
			.filter((line) => line.result?.decision !== undefined)
			.map((line) => line.result.decision);
		expect(decisions).toEqual(["accept", "accept", "accept"]);
		expect(events.find((event) => event.kind === "called" && event.tool === "Write")).toMatchObject({
			input: { file_path: expect.stringMatching(/design\/frames\/note\/frame\.tsx$/) },
		});
		expect(events.find((event) => event.kind === "answered")).toMatchObject({ answer: "allow" });
	});

	it("starts a bypass thread with no approvals and no sandbox", async () => {
		const { engine, spawned } = engineOn("codex-bypass");
		const events = await drain(
			engine.start({
				root: makeTempDir(),
				session: SESSION,
				said: [{ prompt: "go", selection: "" }],
				ask,
				permissions: "bypass",
			}),
		);
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(events.find((event) => event.kind === "ready")).toMatchObject({
			permissionMode: "never dangerFullAccess",
		});
		const start = spawned[0]?.inputs.map((line) => JSON.parse(line)).find((line) => line.method === "thread/start");
		expect(start.params.developerInstructions).toContain("Approvals are off");
	});

	it("stops on Stop with Codex's interrupt, and ends stopped", async () => {
		const { engine, spawned } = engineOn("codex-interrupt");
		const turn = engine.start({
			root: makeTempDir(),
			session: SESSION,
			said: [{ prompt: "go", selection: "" }],
			ask,
			permissions: "edits",
		});
		const events = await drain(turn, (event) => {
			if (event.kind === "called") turn.interrupt();
		});
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(events.find((event) => event.kind === "ended")).toMatchObject({ ending: "stopped" });
	});

	it("bounces a signed-out turn to Codex's own sign-in before starting anything", async () => {
		const { engine, spawned } = engineOn("codex-signed-out");
		const events = await drain(
			engine.start({
				root: makeTempDir(),
				session: SESSION,
				said: [{ prompt: "go", selection: "" }],
				ask,
				permissions: "edits",
			}),
		);
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(events.find((event) => event.kind === "ended")).toMatchObject({
			ending: "failed",
			recovery: { kind: "login", account: "Codex", scope: "account" },
		});
		expect(spawned[0]?.inputs.some((line) => line.includes("thread/start"))).toBe(false);
	});
});

/**
 * A Codex that asks one approval a turn, the way `codex-ask` asks: the item first, then the
 * request naming it. Every decision spool sends back is kept, turn by turn.
 */
function askingCodex(asks: "fileChange" | "command") {
	const decisions: unknown[] = [];
	const { executor, spawned } = fixtureAgentExecutor(
		(proc, line) => {
			const message = JSON.parse(line) as { id?: number; method?: string; result?: { decision?: unknown } };
			const answer = (result: unknown) => proc.emit(JSON.stringify({ id: message.id, result }));
			const thread = { threadId: "main", turnId: "turn" };
			if (message.method === "initialize") answer({ userAgent: "spool/0.161.0 (Linux; x86_64) unknown" });
			if (message.method === "account/read") answer({ account: { type: "chatgpt" }, requiresOpenaiAuth: true });
			if (message.method === "config/read") answer({ config: {}, origins: {} });
			if (message.method === "thread/start" || message.method === "thread/resume")
				answer({ thread: { id: "main", cwd: proc.spawn.cwd }, model: "gpt-5.6-luna", approvalPolicy: "untrusted" });
			if (message.method === "turn/start") {
				answer({ turn: { id: "turn" } });
				const item =
					asks === "fileChange"
						? {
								type: "fileChange",
								id: "patch",
								changes: [{ path: `${proc.spawn.cwd}/src/app.ts`, kind: { type: "update" }, diff: "x" }],
								status: "inProgress",
							}
						: {
								type: "commandExecution",
								id: "patch",
								command: "/usr/bin/zsh -lc 'touch outside.txt'",
								cwd: proc.spawn.cwd,
								commandActions: [{ type: "unknown", command: "touch outside.txt" }],
								status: "inProgress",
							};
				proc.emit(JSON.stringify({ method: "item/started", params: { ...thread, item } }));
				proc.emit(
					JSON.stringify({
						id: 0,
						method: `item/${asks === "command" ? "commandExecution" : asks}/requestApproval`,
						params: {
							...thread,
							itemId: "patch",
							...(asks === "command"
								? {
										command: item.command,
										commandActions: item.commandActions,
										availableDecisions: ["accept", "acceptForSession", "cancel"],
									}
								: {}),
						},
					}),
				);
			}
			if (message.id === 0 && message.result !== undefined) {
				decisions.push(message.result.decision);
				proc.emit(
					JSON.stringify({
						method: "turn/completed",
						params: { threadId: "main", turn: { id: "turn", status: "completed" } },
					}),
				);
			}
		},
		(proc) => proc.exit(0),
	);
	return { executor, spawned, decisions };
}

describe("allow for this thread", () => {
	for (const asks of ["fileChange", "command"] as const)
		it(`answers a ${asks} the person allowed for the thread in its later turns, and only in that thread`, async () => {
			const { executor, decisions } = askingCodex(asks);
			const engine = createCodexEngine({ executor, spoolDir: makeTempDir(), version: "0.33.1" });
			const root = makeTempDir();
			const turnOn = (session: { id: string }, reply: "always" | "allow") => {
				const turn = engine.start({
					root,
					session,
					said: [{ prompt: "go", selection: "" }],
					ask,
					permissions: "ask",
				});
				return drain(turn, (event) => {
					if (event.kind === "asking") expect(turn.answer(event.request, { kind: reply })).toBe(true);
				});
			};
			const first = await turnOn(SESSION, "always");
			expect(first.filter((event) => event.kind === "asking")).toHaveLength(1);
			// the next turn is a new Codex process, which has forgotten its own session accept
			const second = await turnOn(SESSION, "allow");
			expect(second.some((event) => event.kind === "asking")).toBe(false);
			// another thread still asks
			const other = await turnOn({ id: "0d9c8b7a-6f5e-4d3c-8b2a-1f0e9d8c7b6a" }, "allow");
			expect(other.filter((event) => event.kind === "asking")).toHaveLength(1);
			expect(decisions).toEqual(["acceptForSession", "acceptForSession", "accept"]);
		});
});

describe("the codex engine's probes", () => {
	it("reads the signed-in account's email, and nobody when signed out", async () => {
		expect(await engineOn("codex-account").engine.account(makeTempDir())).toEqual({
			signedIn: true,
			account: "you@example.com",
		});
		expect(await engineOn("codex-signed-out").engine.account(makeTempDir())).toEqual({
			signedIn: false,
			account: null,
		});
	});

	it("offers every listed model with the efforts Codex reports for it, beyond the usual four", async () => {
		const { engine, spawned } = engineOn("codex-models");
		const offer = await engine.offer({ root: makeTempDir(), session: SESSION, ask: {} });
		expect(spawned[0]?.mismatches).toEqual([]);
		expect(offer.models.length).toBeGreaterThan(1);
		const terra = offer.models.find((model) => model.value === "gpt-5.6-terra");
		expect(terra?.supportedEffortLevels).toContain("ultra");
		const luna = offer.models.find((model) => model.value === "gpt-5.6-luna");
		expect(luna?.supportedEffortLevels).not.toContain("ultra");
		const listed = (readCapture("codex-models") as ScriptedStep[]).flatMap((step) =>
			"out" in step && Array.isArray((step.out.result as { data?: unknown })?.data)
				? ((step.out.result as { data: { model: string; isDefault: boolean; hidden: boolean }[] }).data ?? [])
				: [],
		);
		expect(offer.current.value).toBe(listed.find((one) => one.isDefault)?.model);
		expect(offer.models.map((model) => model.value)).toEqual(
			listed.filter((one) => !one.hidden).map((one) => one.model),
		);
	});

	it("is installed when a codex at least the oldest spool runs is on the path", () => {
		const read: string[] = [];
		const of = (found: boolean, codexVersion: string | null) =>
			createCodexEngine({
				executor: scriptedAgentExecutor("codex-turn").executor,
				spoolDir: makeTempDir(),
				version: "0.33.1",
				look: () => found,
				codexVersion: () => {
					read.push(String(codexVersion));
					return codexVersion;
				},
			});
		expect(of(true, "0.161.0").installed()).toBe(true);
		expect(of(true, "0.151.0").installed()).toBe(true);
		// one that cannot say its version is left to the handshake
		expect(of(true, null).installed()).toBe(true);
		expect(of(true, "0.150.0").installed()).toBe(false);
		// nothing on the path is never asked its version
		expect(of(false, "0.161.0").installed()).toBe(false);
		expect(read).toEqual(["0.161.0", "0.151.0", "null", "0.150.0"]);
	});

	it("is passed over for the fallback when it is older than spool runs", () => {
		const codex = createCodexEngine({
			executor: scriptedAgentExecutor("codex-turn").executor,
			spoolDir: makeTempDir(),
			version: "0.33.1",
			look: () => true,
			codexVersion: () => "0.140.0",
		});
		const pi = { id: "pi" as const, installed: () => true };
		expect(fallbackEngine([codex, pi])).toBe("pi");
	});

	it("ends a turn on a codex older than the protocol spool speaks, before starting a thread", async () => {
		const { spawned, executor } = fixtureAgentExecutor(
			(proc, line) => {
				const message = JSON.parse(line) as { id?: number; method?: string };
				if (message.method === "initialize")
					proc.emit(
						JSON.stringify({ id: message.id, result: { userAgent: "spool/0.150.0 (Linux; x86_64) unknown" } }),
					);
			},
			// it goes when its input closes, as Codex does
			(proc) => proc.exit(0),
		);
		const engine = createCodexEngine({ executor, spoolDir: makeTempDir(), version: "0.33.1" });
		const events = await drain(
			engine.start({
				root: makeTempDir(),
				session: SESSION,
				said: [{ prompt: "go", selection: "" }],
				ask,
				permissions: "edits",
			}),
		);
		expect(events.find((event) => event.kind === "ended")).toMatchObject({
			ending: "failed",
			reason: expect.stringContaining("Codex 0.150.0 is older than 0.151.0"),
		});
		expect(spawned[0]?.inputs.some((line) => line.includes("thread/start"))).toBe(false);
	});
});

describe("codex's offer and choice", () => {
	const listed = [
		{
			id: "a",
			model: "a",
			displayName: "A",
			description: "",
			hidden: false,
			isDefault: true,
			defaultReasoningEffort: "medium",
			supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "medium" }],
		},
		{
			id: "b",
			model: "b",
			displayName: "B",
			description: "",
			hidden: false,
			isDefault: false,
			defaultReasoningEffort: "high",
			supportedReasoningEfforts: [{ reasoningEffort: "high" }, { reasoningEffort: "ultra" }],
		},
		{ id: "h", model: "h", displayName: "H", description: "", hidden: true, supportedReasoningEfforts: [] },
	];

	it("answers with the ask, then the person's Codex config, then Codex's default", () => {
		expect(codexOffer(listed, undefined, { value: "b", effort: "ultra" }).current).toMatchObject({
			value: "b",
			effort: "ultra",
		});
		expect(codexOffer(listed, { model: "b" }, {}).current).toMatchObject({ value: "b", effort: "high" });
		expect(codexOffer(listed, undefined, {}).current).toMatchObject({ value: "a", effort: "medium" });
		expect(codexOffer(listed, undefined, { value: "h" }).current.value).toBe("a");
	});

	it("keeps an effort only on a model that has it", () => {
		const offer = codexOffer(listed, undefined, {});
		expect(codexChoice(offer, { value: "b" }, { effort: "low" })).toEqual({ value: "b" });
		expect(codexChoice(offer, { value: "a" }, { effort: "low" })).toEqual({ value: "a", effort: "low" });
		expect(codexChoice(offer, {}, {})).toEqual({});
	});
});

const THREAD = "3c2b1a09-8f7e-4d6c-9b5a-4a3b2c1d0e0f";

/** a daemon whose Codex answers from recorded sessions */
function codexDaemon(...captures: [string, ...string[]]) {
	const spoolDir = join(makeTempDir(), ".spool");
	const { name } = makeProject(spoolDir);
	const scripted = scriptedAgentExecutor(...captures);
	const app = makeApp(spoolDir, { agentExecutor: scripted.executor });
	return { app, name, ...scripted };
}

describe("codex through the daemon", () => {
	it("is one of the engines the daemon runs", async () => {
		const { app, name } = codexDaemon("codex-turn");
		const body = (await (await app.request(`/api/p/${name}/agent/engines`)).json()) as {
			engines: { id: string; installed: boolean }[];
		};
		expect(body.engines.map((engine) => engine.id)).toContain("codex");
	});

	it("runs a thread's turn on codex once it is the chosen agent, and answers its approvals", async () => {
		const { app, name, spawned } = codexDaemon("codex-ask");
		const chose = await app.request(`/api/p/${name}/agent/engines`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ preferred: "codex" }),
		});
		expect(chose.status).toBe(200);
		const mode = await app.request(`/api/p/${name}/agent/threads/${THREAD}/permissions`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ mode: "ask" }),
		});
		expect(mode.status).toBe(200);
		const turn = app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ thread: THREAD, said: [{ prompt: "go" }] }),
		});
		const events = agentReader(await turn);
		const seen: AgentEvent[] = [];
		for (;;) {
			const event = (await events.next(5000)).data as AgentEvent;
			seen.push(event);
			if (event.kind === "asking")
				await app.request(`/api/p/${name}/agent/answer`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ request: event.request, reply: { kind: "allow" } }),
				});
			if (event.kind === "closed") break;
		}
		expect(spawned[0]?.spawn.command).toBe("codex");
		expect(spawned[0]?.mismatches).toEqual([]);
		const start = spawned[0]?.inputs.map((line) => JSON.parse(line)).find((line) => line.method === "thread/start");
		expect(start.params).toMatchObject({ approvalPolicy: "untrusted", sandbox: "workspace-write" });
		expect(seen.filter((event) => event.kind === "asking")).toHaveLength(1);
		expect(seen.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
	});

	/**
	 * Each of the three answers the rail offers, as the decision Codex reads (#366): Allow
	 * once, Allow for this chat as the session's own accept, which spool keeps for the
	 * thread's later turns (see "allow for this thread"), and Deny as a decline. Words are
	 * no answer to an approval, whichever engine asked.
	 */
	for (const [kind, decision] of [
		["allow", "accept"],
		["always", "acceptForSession"],
		["deny", "decline"],
	] as const)
		it(`answers an approval's ${kind} with codex's ${decision}`, async () => {
			const { app, name, spawned } = codexDaemon("codex-ask");
			await app.request(`/api/p/${name}/agent/engines`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ preferred: "codex" }),
			});
			await app.request(`/api/p/${name}/agent/threads/${THREAD}/permissions`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ mode: "ask" }),
			});
			const turn = app.request(`/api/p/${name}/agent/turn`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ thread: THREAD, said: [{ prompt: "go" }] }),
			});
			const events = agentReader(await turn);
			const reply = (request: string, body: unknown) =>
				app.request(`/api/p/${name}/agent/answer`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ request, reply: body }),
				});
			for (;;) {
				const event = (await events.next(5000)).data as AgentEvent;
				if (event.kind === "asking") {
					// an approval takes no sentence, typed or otherwise
					expect((await reply(event.request, { kind: "said", text: "sure" })).status).not.toBe(200);
					// a session-long accept only where codex offered one: spool makes up no rule
					const offered = event.suggestions.length > 0;
					expect((await reply(event.request, { kind })).status).toBe(kind !== "always" || offered ? 204 : 404);
					if (kind === "always" && !offered) return;
				}
				if (event.kind === "answered") {
					expect(event.answer).toBe(kind);
					break;
				}
			}
			const sent = spawned[0]?.inputs.map((line) => JSON.parse(line)) ?? [];
			expect(sent.some((line) => line.result?.decision === decision)).toBe(true);
		});
});
