import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	CAPTURES,
	type FakeAgentProc,
	fixtureAgentExecutor,
	makeApp,
	makeProject,
	makeTempDir,
	readCapture,
	replayAgentExecutor,
	sseReader,
	until,
} from "../test-helpers";
import { createClaudeAdapter } from "./agent-claude";
import { answerPayload, parseAgentReply } from "./agent-control";
import type { AgentEvent } from "./agent-events";

/**
 * Approvals and the agent's own questions, over the wire (#121, #145, #162, #197).
 *
 * Both ride one `can_use_tool` request and are told apart by a flag on it, so the
 * two halves of this file are two readings of the same channel rather than two
 * features. Every claim about what the binary sends is read off `claude-mcp.json`,
 * which holds all twelve asks the repo has.
 */

const ASK_CALL = "toolu_01NoWtiLnKqzNvGj2MdAefyP";

/** the conversation a turn runs under, which is the session id spool minted for it (#120) */
const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

function startTurn(name: string, app: ReturnType<typeof makeApp>, prompt = "shoot the receipt") {
	return app.request(`/api/p/${name}/agent/turn`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ thread: THREAD, said: [{ prompt }] }),
	});
}

function answer(name: string, app: ReturnType<typeof makeApp>, body: unknown) {
	return app.request(`/api/p/${name}/agent/answer`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function drainTurn(res: Response, limit = 4000): Promise<AgentEvent[]> {
	const events = sseReader(res);
	const seen: AgentEvent[] = [];
	while (seen.length < limit) {
		try {
			seen.push((await events.next(2000)).data as AgentEvent);
		} catch {
			break;
		}
		if (seen.at(-1)?.kind === "closed") break;
	}
	return seen;
}

/** every union event one capture projects to, with no daemon in the way */
function project(capture: string): AgentEvent[] {
	const adapter = createClaudeAdapter();
	return readCapture(capture).flatMap((raw) => adapter.read(JSON.stringify(raw)));
}

/** the control responses spool wrote up stdin, which is where every answer goes */
function repliedBy(proc: FakeAgentProc | undefined): { request_id: string; response: Record<string, unknown> }[] {
	return (proc?.inputs ?? [])
		.map((line) => JSON.parse(line) as { type?: string; response?: Record<string, unknown> })
		.filter((line) => line.type === "control_response")
		.map((line) => line.response as unknown as { request_id: string; response: Record<string, unknown> });
}

/** every file under a root, so a test can say nothing landed */
const filesUnder = (root: string) => readdirSync(root, { recursive: true }).map(String).sort();

/** the ask out of the capture, whole, so a fixture can send the bytes the binary sends */
function capturedAsk(index: number): unknown {
	return readCapture("claude-mcp").filter((raw) => (raw as { type?: string }).type === "control_request")[
		index
	] as unknown;
}

/**
 * A fixture that reacts to the prompt and to nothing else.
 *
 * Stdin carries two kinds of line now: the message, and the answer to a request.
 * A fixture that answered every write would answer its own answer, which is a loop
 * rather than a session.
 */
const onPrompt = (react: (proc: FakeAgentProc) => void) =>
	fixtureAgentExecutor((proc, line) => {
		if ((JSON.parse(line) as { type?: string }).type === "user") react(proc);
	});

describe("what a waiting request carries", () => {
	it("reaches the client as data with the agent's own written description", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: replayAgentExecutor("claude-mcp").executor });

		const asks = (await drainTurn(await startTurn(name, app))).filter((event) => event.kind === "asking");

		// twelve in the capture, and nothing here parses a payload to find out what
		// they were: the request says what it wants in the agent's own sentence
		expect(asks).toHaveLength(12);
		expect(asks[0]).toMatchObject({
			kind: "asking",
			tool: "Bash",
			display: "Bash",
			description: "Read the spool skill contract",
			interaction: false,
			call: "toolu_01JkvosfCajmqoJCxktHQFMZ",
		});
		expect(asks[0]?.kind === "asking" && asks[0].request).toMatch(/^[0-9a-f-]{36}$/);
		// the agent's own question is one of the twelve and is flagged, which is the
		// whole of what separates it from an approval on this channel
		const questions = asks.filter((ask) => ask.kind === "asking" && ask.interaction);
		expect(questions).toHaveLength(1);
		expect(questions[0]?.kind === "asking" && questions[0].call).toBe(ASK_CALL);
		// and it is the one with neither of the two fields an approval is built from
		expect(questions[0]?.kind === "asking" && questions[0].description).toBeNull();
		expect(questions[0]?.kind === "asking" && questions[0].suggestions).toEqual([]);
	});

	it("carries the rules an always would grant, as the binary wrote them", () => {
		const asks = project("claude-mcp").filter((event) => event.kind === "asking");

		expect(asks[0]?.kind === "asking" && asks[0].suggestions).toEqual([
			{
				type: "addRules",
				rules: [{ toolName: "Bash", ruleContent: "spool skill *" }],
				behavior: "allow",
				destination: "localSettings",
			},
		]);
	});

	it("asks about work outside design/ and never about a frame", () => {
		// the fence is the allow rule, and the captures are its evidence: the window
		// with 429 events of writes and edits under design/ asks nothing at all, and
		// every ask in the repo is a shell command or a connector
		for (const capture of CAPTURES) {
			const asks = project(capture).filter((event) => event.kind === "asking");
			const tools = new Set(asks.map((ask) => (ask.kind === "asking" ? ask.tool : "")));
			expect([...tools].filter((tool) => tool === "Write" || tool === "Edit")).toEqual([]);
			if (capture !== "claude-mcp") expect(asks).toEqual([]);
		}
		expect(project("claude-edits").some((event) => event.kind === "called")).toBe(true);
	});
});

describe("answering", () => {
	/**
	 * A turn parked on one ask, with the client reading its stream.
	 *
	 * The fixture sends the capture's own request bytes and then nothing, which is
	 * exactly what the binary does: the next thing down the wire is whatever the
	 * answer causes, so a test that never answers is a test of a turn that never moves.
	 */
	async function parked(index = 0) {
		const spoolDir = join(makeTempDir(), ".spool");
		const project = makeProject(spoolDir);
		const agent = onPrompt((proc) => proc.emit(JSON.stringify(capturedAsk(index))));
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		const events = sseReader(await startTurn(project.name, app));
		const asking = (await events.next()).data as AgentEvent;
		if (asking.kind !== "asking") throw new Error(`expected an ask, got ${asking.kind}`);
		return { ...project, spoolDir, app, agent, events, asking };
	}

	it("sends an allow up the same stdin the prompt went down, and the call proceeds", async () => {
		const turn = await parked();

		expect(
			(await answer(turn.name, turn.app, { request: turn.asking.request, reply: { kind: "allow" } })).status,
		).toBe(204);

		const replies = repliedBy(turn.agent.spawned[0]);
		expect(replies).toHaveLength(1);
		expect(replies[0]?.request_id).toBe(turn.asking.request);
		expect(replies[0]?.response).toEqual({ behavior: "allow", decisionClassification: "user_temporary" });
		// the log's only trace of it, because the answer went the other way
		expect((await turn.events.next()).data).toEqual({
			kind: "answered",
			request: turn.asking.request,
			answer: "allow",
			words: null,
			parent: null,
		});
	});

	it("makes an always last the thread and touches no file", async () => {
		const turn = await parked();
		const before = filesUnder(turn.root);
		const settings = filesUnder(turn.spoolDir);

		await answer(turn.name, turn.app, { request: turn.asking.request, reply: { kind: "always" } });

		// the binary's own suggested rule, moved to the one destination it will not
		// write down: the complaint is repetition, not a permanent grant
		expect(repliedBy(turn.agent.spawned[0])[0]?.response).toEqual({
			behavior: "allow",
			decisionClassification: "user_temporary",
			updatedPermissions: [
				{
					type: "addRules",
					rules: [{ toolName: "Bash", ruleContent: "spool skill *" }],
					behavior: "allow",
					destination: "session",
				},
			],
		});
		expect(filesUnder(turn.root)).toEqual(before);
		expect(filesUnder(turn.spoolDir)).toEqual(settings);
	});

	it("sends a bare deny, with no words in it", async () => {
		const turn = await parked();

		await answer(turn.name, turn.app, { request: turn.asking.request, reply: { kind: "deny" } });

		// the message field is required and empty is the wordless refusal: anything in
		// it would be quoted to the agent as something the person said
		expect(repliedBy(turn.agent.spawned[0])[0]?.response).toEqual({
			behavior: "deny",
			message: "",
			decisionClassification: "user_reject",
		});
		expect((await turn.events.next()).data).toMatchObject({ kind: "answered", answer: "deny", words: null });
	});

	it("answers the agent's own question in the person's words and with its options", async () => {
		const said = await parked(10);
		expect(said.asking.kind === "asking" && said.asking.interaction).toBe(true);

		await answer(said.name, said.app, {
			request: said.asking.request,
			reply: { kind: "said", text: "neither — leave my install alone" },
		});

		// the whole input rebuilt around the one field added, because `updatedInput`
		// replaces the call's arguments rather than merging into them
		const reply = repliedBy(said.agent.spawned[0])[0]?.response as { updatedInput?: Record<string, unknown> };
		expect(Array.isArray(reply.updatedInput?.questions)).toBe(true);
		expect(reply.updatedInput?.response).toBe("neither — leave my install alone");
		expect((await said.events.next()).data).toMatchObject({
			kind: "answered",
			answer: "said",
			words: "neither — leave my install alone",
		});

		const picked = await parked(10);
		const question =
			"`spool shot` is blocked by the v0.3.0 CLI / v0.4.0 daemon split. How do you want the version gap closed?";
		await answer(picked.name, picked.app, {
			request: picked.asking.request,
			reply: { kind: "picked", picks: { [question]: "Ship it unverified" } },
		});

		const chosen = repliedBy(picked.agent.spawned[0])[0]?.response as { updatedInput?: Record<string, unknown> };
		expect(chosen.updatedInput?.answers).toEqual({ [question]: "Ship it unverified" });
		expect((await picked.events.next()).data).toMatchObject({ answer: "picked", words: "Ship it unverified" });
	});

	it("parks the turn until somebody answers, and runs no clock in either direction", async () => {
		const turn = await parked();

		// nothing is scheduled and nothing expires. The binary's own away-from-keyboard
		// timeout submits whatever was already picked, which is the weakest of the
		// tool's replies; spool submits nothing at all, for as long as that takes
		await turn.events.expectQuiet(600);
		expect(repliedBy(turn.agent.spawned[0])).toEqual([]);

		// and the turn moves again the moment it is answered, on the wire's own timing
		await answer(turn.name, turn.app, { request: turn.asking.request, reply: { kind: "allow" } });
		turn.agent.spawned[0]?.emit(
			JSON.stringify({
				type: "stream_event",
				event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "on it" } },
				parent_tool_use_id: null,
			}),
		);

		expect((await turn.events.next()).data).toMatchObject({ kind: "answered" });
		expect((await turn.events.next()).data).toMatchObject({ kind: "say", text: "on it" });
	});

	it("refuses an answer in the other one's vocabulary", async () => {
		const approval = await parked();
		expect(approval.asking.kind === "asking" && approval.asking.interaction).toBe(false);

		// there is no sentence that answers "may I run this", and letting one through
		// would allow the call and carry the words along as a spare argument — the
		// opposite of what somebody typing "wait, don't" meant
		const said = { request: approval.asking.request, reply: { kind: "said", text: "wait, don't run that" } };
		expect((await answer(approval.name, approval.app, said)).status).toBe(404);
		expect(repliedBy(approval.agent.spawned[0])).toEqual([]);
		// a deny is the one answer both take, because refusing is refusing
		expect(
			(await answer(approval.name, approval.app, { request: approval.asking.request, reply: { kind: "deny" } }))
				.status,
		).toBe(204);

		const question = await parked(10);
		expect(question.asking.kind === "asking" && question.asking.interaction).toBe(true);

		// and allowing a question with its arguments untouched is the empty answer, which
		// lands the agent on the weakest of the tool's replies
		const allow = { request: question.asking.request, reply: { kind: "allow" } };
		expect((await answer(question.name, question.app, allow)).status).toBe(404);
		expect(repliedBy(question.agent.spawned[0])).toEqual([]);
	});

	it("answers a request once and never twice", async () => {
		const turn = await parked();

		expect(
			(await answer(turn.name, turn.app, { request: turn.asking.request, reply: { kind: "allow" } })).status,
		).toBe(204);
		expect(
			(await answer(turn.name, turn.app, { request: turn.asking.request, reply: { kind: "deny" } })).status,
		).toBe(404);

		expect(repliedBy(turn.agent.spawned[0])).toHaveLength(1);
	});

	it("forgets what nobody answered once the turn is over", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = onPrompt((proc) => {
			proc.replay(readCapture("claude-mcp"));
			proc.exit(0);
		});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		const events = await drainTurn(await startTurn(name, app));
		const asking = events.find((event) => event.kind === "asking");

		// a request the turn ended under is one nobody can answer now, and a stale one
		// would take an answer meant for the next turn
		expect(
			(
				await answer(name, app, {
					request: asking?.kind === "asking" ? asking.request : "",
					reply: { kind: "allow" },
				})
			).status,
		).toBe(404);
	});
});

describe("the other two question-shaped cases", () => {
	it("declines a connector's elicitation without asking anybody", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = onPrompt((proc) => {
			proc.emit(
				JSON.stringify({
					type: "control_request",
					request_id: "elicit-1",
					request: {
						subtype: "elicitation",
						mcp_server_name: "claude.ai Notion",
						message: "Which workspace should I write to?",
						requested_schema: { type: "object", properties: {} },
					},
				}),
			);
			proc.exit(0);
		});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const events = await drainTurn(await startTurn(name, app));

		// decline is the protocol's own word, and it is not cancel: cancel says the
		// person walked away from a form, decline says there was never a form
		expect(repliedBy(agent.spawned[0])).toEqual([
			{ subtype: "success", request_id: "elicit-1", response: { action: "decline" } },
		]);
		// nobody was asked, so nothing about it reaches the client as something to answer
		expect(events.filter((event) => event.kind === "asking")).toEqual([]);
		expect(events.filter((event) => event.kind === "elicit")).toEqual([]);
	});

	it("declares no dialog kinds at the handshake, so a dialog is never received", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor(() => {});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app);
		await until(() => (agent.spawned[0]?.inputs.length ?? 0) > 0);

		// the client declares which dialog kinds it can display and the binary treats
		// absence as cannot-display, so declaring none is the whole of the decision:
		// spool sends no handshake at all and the flag never appears in the spawn
		const written = agent.spawned[0]?.inputs.join("") ?? "";
		expect(written).not.toMatch(/supportedDialogKinds|dialog_kinds|initialize/);
		expect(JSON.stringify(agent.spawned[0]?.spawn.args)).not.toMatch(/dialog/i);
		await res.body?.cancel();
	});
});

describe("the answer door", () => {
	it("refuses an answer nobody is waiting on, a malformed one, and an uninvited one", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: fixtureAgentExecutor(() => {}).executor });

		expect((await answer(name, app, { request: "nobody", reply: { kind: "allow" } })).status).toBe(404);
		expect((await answer(name, app, { reply: { kind: "allow" } })).status).toBe(400);
		expect((await answer(name, app, { request: "r", reply: { kind: "maybe" } })).status).toBe(400);
		// an answer with nothing in it is spool putting words in somebody's mouth
		expect((await answer(name, app, { request: "r", reply: { kind: "said", text: "   " } })).status).toBe(400);
		expect((await answer(name, app, { request: "r", reply: { kind: "picked", picks: {} } })).status).toBe(400);
		expect((await answer("ghost", app, { request: "r", reply: { kind: "allow" } })).status).toBe(404);
		const uninvited = await app.fetch(`/api/p/${name}/agent/answer`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ request: "r", reply: { kind: "allow" } }),
		});
		expect(uninvited.status).toBe(401);
	});
});

describe("the answer itself", () => {
	const asking = {
		kind: "asking",
		request: "r",
		call: "c",
		tool: "Bash",
		display: "Bash",
		input: { command: "ls", description: "look" },
		description: "look",
		interaction: false,
		suggestions: [
			{ type: "addRules", rules: [{ toolName: "Bash" }], behavior: "allow", destination: "userSettings" },
		],
		parent: null,
	} as const;

	it("moves every suggested rule to the thread, whatever the request suggested", () => {
		expect(answerPayload(asking, { kind: "always" }).updatedPermissions).toEqual([
			{ type: "addRules", rules: [{ toolName: "Bash" }], behavior: "allow", destination: "session" },
		]);
		// nothing to grant is an allow and says so, rather than an empty rule list the
		// next call could read as a grant
		expect(answerPayload({ ...asking, suggestions: [] }, { kind: "always" })).toEqual({
			behavior: "allow",
			decisionClassification: "user_temporary",
		});
	});

	it("reads exactly the five answers off the wire and defaults none of them", () => {
		expect(parseAgentReply({ kind: "allow" })).toEqual({ kind: "allow" });
		expect(parseAgentReply({ kind: "said", text: "do the other one" })).toEqual({
			kind: "said",
			text: "do the other one",
		});
		expect(parseAgentReply({ kind: "picked", picks: { q: "a" } })).toEqual({ kind: "picked", picks: { q: "a" } });
		expect(parseAgentReply({ kind: "said" })).toBeUndefined();
		expect(parseAgentReply({ kind: "picked", picks: { q: 1 } })).toBeUndefined();
		expect(parseAgentReply({ kind: "picked", picks: ["a"] })).toBeUndefined();
		expect(parseAgentReply({})).toBeUndefined();
	});
});
