import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	type FakeAgentProc,
	fixtureAgentExecutor,
	makeApp,
	makeProject,
	makeTempDir,
	readModelsReply,
	until,
} from "../test-helpers";
import {
	type AgentOffer,
	askAgentOffer,
	askFrom,
	effortPin,
	isEffortShaped,
	listModelsRequestLine,
	modelsOf,
	offeredValue,
	reportOf,
} from "./agent-offer";
import { planAgentSpawn } from "./agent-spawn";

/**
 * The offered list and what is answering (#118, #199).
 *
 * Every fixture here is the installed binary's own reply, probed on 2.1.220. The
 * five models are `list_models` verbatim — the same bytes the design canvas plays —
 * and the sentences are what `/model` and `/effort` answered when asked.
 */

/**
 * The reply, read from the one place it is kept (#199).
 *
 * `fixtures/claude-models.json` is the `list_models` control response captured whole on
 * 2.1.220 — five rows, two of them resolving to the same model with only a parenthetical
 * between them, and one carrying no effort levels at all. The daemon reads it, the rail
 * draws it and the canvas plays it, so nobody types it out again.
 */
const LISTED = readModelsReply();

const MODELS = modelsOf(LISTED);

/** the thread the doors hang under, since which machine is answering is one thread's fact */
const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";
const OTHER = "2a1b3c4d-5e6f-4788-9900-aabbccddeeff";

const USAGE =
	"Usage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.";

/**
 * The binary, answering one probe: the control request, then a message per command.
 *
 * `resolve` is the alias-to-model table the CLI applies, so the fixture reports the
 * model at each message boundary the way the real one does — every message gets its
 * own `system/init` and the last one is the model a change landed on.
 */
function fakeBinary({
	resolve = { haiku: "claude-haiku-4-5-20251001", sonnet: "claude-sonnet-5", "opus[1m]": "claude-opus-5[1m]" },
	start = "claude-fable-5",
	names = {
		"claude-fable-5": "Fable 5",
		"claude-haiku-4-5-20251001": "Haiku 4.5",
		"claude-sonnet-5": "Sonnet 5",
		"claude-opus-5[1m]": "Opus 5",
	} as Record<string, string>,
	effort = "high",
	pinned = null as string | null,
	listed = LISTED as unknown,
}: {
	resolve?: Record<string, string>;
	start?: string;
	names?: Record<string, string>;
	effort?: string;
	pinned?: string | null;
	listed?: unknown;
} = {}) {
	let model = start;
	let level = pinned ?? effort;
	const said: string[] = [];
	const fixture = fixtureAgentExecutor((proc: FakeAgentProc, line: string) => {
		const wire = JSON.parse(line) as {
			type?: string;
			request_id?: string;
			request?: { subtype?: string };
			message?: { content?: { text?: string }[] };
		};
		if (wire.type === "control_request" && wire.request?.subtype === "list_models") {
			proc.emit(
				JSON.stringify({
					type: "control_response",
					response: { subtype: "success", request_id: wire.request_id, response: listed },
				}),
			);
			return;
		}
		if (wire.type !== "user") return;
		const text = wire.message?.content?.[0]?.text ?? "";
		said.push(text);
		const [head, argument] = text.split(/\s+/);
		let reply = "";
		if (head === "/model" && argument !== undefined) {
			const to = resolve[argument];
			// an alias the binary does not take gets the usage line and changes nothing
			if (to === undefined) reply = USAGE;
			else {
				model = to;
				reply = `Set model to ${names[to] ?? to} for this session only`;
			}
		} else if (head === "/model") {
			reply = `Current model: ${names[model] ?? model} (effort: ${level})\n${USAGE}`;
		} else if (head === "/effort" && argument !== undefined) {
			if (pinned !== null)
				reply = `CLAUDE_CODE_EFFORT_LEVEL=${pinned} overrides this session — clear it and ${argument} takes over`;
			else {
				level = argument;
				reply = `Set effort level to ${argument} (this session only)`;
			}
		}
		// every message boundary re-reports the model, which is the probe's own source
		proc.emit(JSON.stringify({ type: "system", subtype: "init", model, session_id: "s1" }));
		proc.emit(JSON.stringify({ type: "result", subtype: "success", result: reply, num_turns: 0, total_cost_usd: 0 }));
	});
	/**
	 * A session starts where its own flags put it.
	 *
	 * Read once, at spawn, because that is when they apply — and it is what makes the
	 * probe a picture of the turn rather than of the account's default. `--effort` is
	 * honoured over the exported variable, which is the measurement spool's whole
	 * confirm-before-passing rule rests on.
	 */
	const executor: typeof fixture.executor = async (spawn) => {
		const flag = (name: string) => {
			const at = spawn.args.indexOf(name);
			return at < 0 ? undefined : spawn.args[at + 1];
		};
		const asked = flag("--model");
		if (asked !== undefined) model = resolve[asked] ?? asked;
		const level0 = flag("--effort");
		if (level0 !== undefined) level = level0;
		return fixture.executor(spawn);
	};
	return { spawned: fixture.spawned, executor, said };
}

/**
 * A binary that answers nothing and exits when stdin closes, which is what `--print`
 * does. It is the honest shape of an older CLI that has never heard of `list_models`.
 */
function silentBinary() {
	const fixture = fixtureAgentExecutor();
	const executor: typeof fixture.executor = async (spawn) => {
		const proc = await fixture.executor(spawn);
		const end = proc.end.bind(proc);
		proc.end = () => {
			end();
			(proc as FakeAgentProc).exit(0);
		};
		return proc;
	};
	return { spawned: fixture.spawned, executor };
}

describe("what the binary offers", () => {
	it("asks for the list rather than shipping one", async () => {
		const binary = fakeBinary();

		const answered = await askAgentOffer({ executor: binary.executor, root: "/tmp/product", env: {} });

		// the request is a control request on the session, so the reply is structured
		// JSON rather than a sentence to parse
		const asked = binary.spawned[0]?.inputs ?? [];
		expect(JSON.parse(asked[0] as string)).toEqual({
			type: "control_request",
			request_id: expect.any(String),
			request: { subtype: "list_models" },
		});
		// five choices, not the ten aliases the usage line accepts
		expect(answered.models.map((model) => model.value)).toEqual([
			"default",
			"opus[1m]",
			"claude-fable-5[1m]",
			"sonnet",
			"haiku",
		]);
		expect(answered.models.map((model) => model.displayName)).toEqual([
			"Default (recommended)",
			"Opus (1M context)",
			"Fable",
			"Sonnet",
			"Haiku",
		]);
	});

	it("spends no turn and no token, and stands in the project root", async () => {
		const binary = fakeBinary();

		await askAgentOffer({ executor: binary.executor, root: "/tmp/product", env: {} });

		expect(binary.spawned).toHaveLength(1);
		expect(binary.spawned[0]?.spawn.cwd).toBe("/tmp/product");
		// only the commands the binary answers locally: `list_models` and `/model`, both
		// resolved before the model ever sees them
		expect(binary.said).toEqual(["/model"]);
	});

	it("carries each model's own effort levels, and haiku's absence of them", () => {
		expect(MODELS.find((model) => model.value === "sonnet")?.supportedEffortLevels).toEqual([
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
		]);
		// the reply has no `supportsEffort` key on haiku at all, so absence is the signal
		const haiku = MODELS.find((model) => model.value === "haiku");
		expect(haiku?.supportsEffort).toBeUndefined();
		expect(haiku?.supportedEffortLevels).toBeUndefined();
	});

	it("drops an entry `/model` could not be sent, and defaults nothing else", () => {
		const read = modelsOf({
			models: [
				{ displayName: "Nameless" },
				{ value: "sonnet" },
				"not an entry",
				{
					value: "opus[1m]",
					displayName: "Opus (1M context)",
					description: "d",
					supportedEffortLevels: ["high", 4],
				},
			],
		});

		// a row spool could not send is a row that lies when pressed
		expect(read.map((model) => model.value)).toEqual(["sonnet", "opus[1m]"]);
		// nothing to fall back to but the value, which is still the machine's own word
		expect(read[0]).toEqual({ value: "sonnet", resolvedModel: "sonnet", displayName: "sonnet", description: "" });
		expect(read[1]?.supportedEffortLevels).toEqual(["high"]);
	});

	it("tolerates a reply that is not a list at all", () => {
		expect(modelsOf(undefined)).toEqual([]);
		expect(modelsOf({})).toEqual([]);
		expect(modelsOf({ models: "sonnet" })).toEqual([]);
		expect(modelsOf([])).toEqual([]);
	});

	it("answers with an empty offer when the binary says nothing, rather than hanging", async () => {
		const answered = await askAgentOffer({ executor: silentBinary().executor, root: "/tmp/product", env: {} });

		// the process exits when stdin closes, and that exit is what ends the probe —
		// the timeout is the backstop, never the plan
		expect(answered.models).toEqual([]);
		expect(answered.current.value).toBeNull();
	});

	it("answers an empty offer when there is no binary to ask", async () => {
		const answered = await askAgentOffer({
			executor: () => Promise.reject(new Error("spawn claude ENOENT")),
			root: "/tmp/product",
			env: { CLAUDE_CODE_EFFORT_LEVEL: "max" },
		});

		// the missing agent is #201's surface, and this is not it: the menu opens with
		// nothing to pick rather than the door failing
		expect(answered).toEqual({
			models: [],
			current: { value: null, resolved: null, name: null, effort: "max", pin: "max" },
		});
	});

	it("is one control request line, quoted back once", () => {
		const line = listModelsRequestLine("req_1");

		expect(line.endsWith("\n")).toBe(true);
		expect(JSON.parse(line)).toEqual({
			type: "control_request",
			request_id: "req_1",
			request: { subtype: "list_models" },
		});
	});
});

describe("what is answering", () => {
	it("reads the model and the effort out of the binary's own report", () => {
		expect(reportOf("Current model: Haiku 4.5 (effort: high)\nUsage: /model <name>.")).toEqual({
			name: "Haiku 4.5",
			effort: "high",
		});
		// the clause is optional in the sentence, so it is optional here
		expect(reportOf("Current model: Opus 5")).toEqual({ name: "Opus 5", effort: null });
		// a shape that changed costs the words, never the turn
		expect(reportOf("Set model to Haiku 4.5 for this session only")).toEqual({ name: null, effort: null });
		expect(reportOf("")).toEqual({ name: null, effort: null });
	});

	it("names the row the binary resolved, and breaks the tie with what was asked", () => {
		// `Default (recommended)` and `Opus (1M context)` resolve to the same model and
		// the parenthetical is the only thing telling them apart
		expect(offeredValue(MODELS, "claude-opus-5[1m]", undefined)).toBe("default");
		expect(offeredValue(MODELS, "claude-opus-5[1m]", "opus[1m]")).toBe("opus[1m]");
		// an ask the binary did not honour does not get to name the row
		expect(offeredValue(MODELS, "claude-sonnet-5", "haiku")).toBe("sonnet");
		expect(offeredValue(MODELS, "claude-fable-5", undefined)).toBe("claude-fable-5[1m]");
		// a model outside the offer names no row, and the reported name is what is left
		expect(offeredValue(MODELS, "claude-3-5-sonnet-20241022", undefined)).toBeNull();
		expect(offeredValue(MODELS, null, "sonnet")).toBe("sonnet");
	});

	it("reports the row nobody chose as the row nobody chose", async () => {
		const binary = fakeBinary({ start: "claude-opus-5[1m]" });

		const answered = await askAgentOffer({ executor: binary.executor, root: "/tmp/product", env: {} });

		expect(answered.current.value).toBe("default");
		expect(answered.current.resolved).toBe("claude-opus-5[1m]");
		expect(answered.current.effort).toBe("high");
		expect(answered.current.pin).toBeNull();
	});

	it("keeps the binary's own name for a machine outside the offer", async () => {
		const binary = fakeBinary({
			start: "claude-3-5-haiku-20241022",
			names: { "claude-3-5-haiku-20241022": "Haiku 3.5" },
		});

		const answered = await askAgentOffer({ executor: binary.executor, root: "/tmp/product", env: {} });

		expect(answered.current.value).toBeNull();
		expect(answered.current.name).toBe("Haiku 3.5");
	});
});

describe("choosing one", () => {
	it("sends the message the menu is a shortcut for", async () => {
		const binary = fakeBinary();

		const answered = await askAgentOffer({
			executor: binary.executor,
			root: "/tmp/product",
			env: {},
			choose: { value: "haiku" },
		});

		// the change, then the question — so what comes back is a report of the change
		expect(binary.said).toEqual(["/model haiku", "/model"]);
		expect(answered.current.value).toBe("haiku");
		expect(answered.current.resolved).toBe("claude-haiku-4-5-20251001");
	});

	it("leaves the readout where it was when the binary refuses the alias", async () => {
		const binary = fakeBinary();

		const answered = await askAgentOffer({
			executor: binary.executor,
			root: "/tmp/product",
			env: {},
			ask: { value: "sonnet" },
			choose: { value: "opusplan" },
		});

		// `/model`'s usage line accepts ten aliases and `list_models` offers five; asking
		// for one it will not take changes nothing, and the readout says where it still is
		// — which is where the standing ask put the probe, not the account's own default
		expect(answered.current.value).toBe("sonnet");
		expect(askFrom(answered, { value: "opusplan" }, { value: "sonnet" })).toEqual({ value: "sonnet" });
	});

	it("follows the report when the binary resolves the ask somewhere else", async () => {
		// `/model opusplan` is accepted and lands on Sonnet, measured on the installed
		// binary. The ask follows the report rather than insisting on a name it did not
		// keep, which is what stops the readout and the next spawn disagreeing
		const binary = fakeBinary({ resolve: { opusplan: "claude-sonnet-5" } });

		const answered = await askAgentOffer({
			executor: binary.executor,
			root: "/tmp/product",
			env: {},
			choose: { value: "opusplan" },
		});

		expect(answered.current.value).toBe("sonnet");
		expect(askFrom(answered, { value: "opusplan" }, {})).toEqual({ value: "sonnet" });
	});

	it("carries the standing ask on the probe, so one axis does not reset the other", async () => {
		const binary = fakeBinary();

		const answered = await askAgentOffer({
			executor: binary.executor,
			root: "/tmp/product",
			env: {},
			ask: { value: "haiku" },
			choose: { effort: "low" },
		});

		// a probe that started bare reported the account's default here, so picking a level
		// flipped the readout back to a model nobody had chosen — which a live daemon did
		expect(binary.spawned[0]?.spawn.args).toContain("--model");
		expect(answered.current.value).toBe("haiku");
		expect(answered.current.effort).toBe("low");
	});

	it("hands the binary's own default back as no flag at all", async () => {
		const binary = fakeBinary();

		const answered = await askAgentOffer({ executor: binary.executor, root: "/tmp/product", env: {} });

		// nobody chose Fable, the account did — so pinning it would freeze a default that
		// can move, and the readout reads it off the report on every ask instead
		expect(answered.current.value).toBe("claude-fable-5[1m]");
		expect(askFrom(answered, {}, {})).toEqual({});
	});

	it("takes an effort level as its own message", async () => {
		const binary = fakeBinary();

		const answered = await askAgentOffer({
			executor: binary.executor,
			root: "/tmp/product",
			env: {},
			choose: { value: "sonnet", effort: "xhigh" },
		});

		expect(binary.said).toEqual(["/model sonnet", "/effort xhigh", "/model"]);
		expect(answered.current.effort).toBe("xhigh");
		expect(askFrom(answered, { value: "sonnet", effort: "xhigh" }, {})).toEqual({ value: "sonnet", effort: "xhigh" });
	});

	it("keeps only what the binary confirmed, so an unconfirmed level never becomes a flag", () => {
		const answered: AgentOffer = {
			models: MODELS,
			current: { value: "sonnet", resolved: "claude-sonnet-5", name: "Sonnet 5", effort: "max", pin: "max" },
		};

		// measured, `--effort` outranks CLAUDE_CODE_EFFORT_LEVEL — so a level the
		// environment just refused in session must not reach a later spawn and win
		expect(askFrom(answered, { effort: "low" }, { value: "sonnet" })).toEqual({ value: "sonnet" });
		expect(planAgentSpawn("/tmp/product", {}, null, askFrom(answered, { effort: "low" }, {})).args).not.toContain(
			"--effort",
		);
	});
});

describe("the effort the environment holds", () => {
	it("is read off the environment rather than out of a sentence", () => {
		expect(effortPin({ CLAUDE_CODE_EFFORT_LEVEL: "max" })).toBe("max");
		expect(effortPin({})).toBeNull();
		// checked for shape and not for membership, because which levels exist is the
		// binary's business: `/effort auto` is accepted and offered by no model, and a list
		// here would answer "that is not a pin" about a variable that is plainly set
		expect(effortPin({ CLAUDE_CODE_EFFORT_LEVEL: "auto" })).toBe("auto");
		expect(effortPin({ CLAUDE_CODE_EFFORT_LEVEL: "--dangerously-skip-permissions" })).toBeNull();
		expect(isEffortShaped("")).toBe(false);
	});

	it("outranks the control, and the control does not ask", async () => {
		const binary = fakeBinary({ pinned: "max" });

		const answered = await askAgentOffer({
			executor: binary.executor,
			root: "/tmp/product",
			env: { CLAUDE_CODE_EFFORT_LEVEL: "max" },
			choose: { effort: "low" },
		});

		// the refusal is already known, so asking would only put a sentence about it in
		// a log nobody opened a menu to read
		expect(binary.said).toEqual(["/model"]);
		expect(answered.current.pin).toBe("max");
		expect(answered.current.effort).toBe("max");
	});
});

describe("the spawn's own two flags", () => {
	it("carries the ask, and nothing where nobody asked", () => {
		const thread = { id: "11111111-2222-4333-8444-555555555555", resume: false };
		const bare = planAgentSpawn("/tmp/product", {}, thread);
		expect(bare.args).not.toContain("--model");
		expect(bare.args).not.toContain("--effort");

		const asked = planAgentSpawn("/tmp/product", {}, thread, { value: "haiku", effort: "low" });
		expect(asked.args[asked.args.indexOf("--model") + 1]).toBe("haiku");
		expect(asked.args[asked.args.indexOf("--effort") + 1]).toBe("low");
	});

	it("carries no thread on the probe, so the menu never writes into a conversation", () => {
		// `/model haiku` is a local command the runtime records in whatever session it lands
		// in, so resuming a thread to ask a question about the binary would write the menu's
		// own plumbing into the transcript the rail draws
		const probe = planAgentSpawn("/tmp/product", {}, null, { value: "haiku" });

		expect(probe.args).not.toContain("--session-id");
		expect(probe.args).not.toContain("--resume");
		expect(probe.args[probe.args.indexOf("--model") + 1]).toBe("haiku");
	});

	it("is what the turn spawns with, so a choice outlives the session that took it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const binary = fakeBinary();
		const app = makeApp(spoolDir, { agentExecutor: binary.executor });

		const chosen = await app.request(`/api/p/${name}/agent/threads/${THREAD}/model`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ value: "haiku" }),
		});
		expect(chosen.status).toBe(200);
		expect(((await chosen.json()) as AgentOffer).current.value).toBe("haiku");

		const spawns = binary.spawned.length;
		void app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ thread: THREAD, said: [{ prompt: "tidy the cart" }] }),
		});
		await until(() => binary.spawned.length > spawns);

		// the probe spawned first and carried no flags — the point of the round trip is
		// to find out what the binary does with the ask — and the turn carries them
		const turnSpawn = binary.spawned.at(-1)?.spawn.args ?? [];
		expect(turnSpawn[turnSpawn.indexOf("--model") + 1]).toBe("haiku");
	});
});

describe("the doors", () => {
	const post = (app: ReturnType<typeof makeApp>, name: string, body: unknown) =>
		app.request(`/api/p/${name}/agent/threads/${THREAD}/model`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});

	it("answers the offer on a read", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: fakeBinary().executor });

		const res = await app.request(`/api/p/${name}/agent/threads/${THREAD}/models`);

		expect(res.status).toBe(200);
		const body = (await res.json()) as AgentOffer;
		expect(body.models).toHaveLength(5);
		expect(body.current.value).toBe("claude-fable-5[1m]");
	});

	it("refuses a choice it could not send", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: fakeBinary().executor });

		expect((await post(app, name, {})).status).toBe(400);
		expect((await post(app, name, { value: "" })).status).toBe(400);
		// one lowercase word, which is what a level has to be to be an argument at all
		expect((await post(app, name, { effort: "--dangerously-skip-permissions" })).status).toBe(400);
		expect((await post(app, name, { effort: 4 })).status).toBe(400);
		// an offered alias never starts with a dash, and one that does is a value being
		// handed to argv where a flag would go
		expect((await post(app, name, { value: "--dangerously-skip-permissions" })).status).toBe(400);
	});

	it("only ever spawns with an alias the reply named", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const binary = fakeBinary();
		const app = makeApp(spoolDir, { agentExecutor: binary.executor });

		// a full model id is legal for the binary and is not one of the five offered rows.
		// What reaches a spawn is the row the report named, never the string that was sent,
		// which makes "`--model` carries an offered alias" an invariant rather than a habit
		expect((await post(app, name, { value: "claude-3-5-haiku-20241022" })).status).toBe(200);
		const spawns = binary.spawned.length;
		void app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ thread: THREAD, said: [{ prompt: "tidy the cart" }] }),
		});
		await until(() => binary.spawned.length > spawns);

		const args = binary.spawned.at(-1)?.spawn.args ?? [];
		const model = args[args.indexOf("--model") + 1];
		expect(model).toBeDefined();
		expect(MODELS.map((one) => one.value)).toContain(model);
	});

	it("leaves a level no model listed off the spawn, rather than carrying a table that says which", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const binary = fakeBinary();
		const app = makeApp(spoolDir, { agentExecutor: binary.executor });

		// `/effort auto` is accepted by the command and offered by no model, so the round
		// trip is what refuses it — the shape is fine and the offer is what decides
		expect((await post(app, name, { effort: "auto" })).status).toBe(200);
		const spawns = binary.spawned.length;
		void app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ thread: THREAD, said: [{ prompt: "tidy the cart" }] }),
		});
		await until(() => binary.spawned.length > spawns);

		expect(binary.spawned.at(-1)?.spawn.args).not.toContain("--effort");
	});

	it("is one thread's choice and not another thread's", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const binary = fakeBinary();
		const app = makeApp(spoolDir, { agentExecutor: binary.executor });

		await post(app, name, { value: "haiku" });
		const spawns = binary.spawned.length;
		// a project runs one thread on Opus and another on Haiku, so a project-wide ask
		// would carry the open thread's choice into the one you switched to
		void app.request(`/api/p/${name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ thread: OTHER, said: [{ prompt: "tidy the cart" }] }),
		});
		await until(() => binary.spawned.length > spawns);

		expect(binary.spawned.at(-1)?.spawn.args).not.toContain("--model");
	});

	it("refuses a thread that is not named by a session's own uuid", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: fakeBinary().executor });

		expect((await app.request(`/api/p/${name}/agent/threads/not-a-uuid/models`)).status).toBe(400);
		const chosen = await app.request(`/api/p/${name}/agent/threads/not-a-uuid/model`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ value: "haiku" }),
		});
		expect(chosen.status).toBe(400);
	});

	it("is one project's choice and not another's", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const first = makeProject(spoolDir);
		const second = makeProject(spoolDir);
		const binary = fakeBinary();
		const app = makeApp(spoolDir, { agentExecutor: binary.executor });

		await post(app, first.name, { value: "haiku" });
		const spawns = binary.spawned.length;
		void app.request(`/api/p/${second.name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ thread: THREAD, said: [{ prompt: "tidy the cart" }] }),
		});
		await until(() => binary.spawned.length > spawns);

		expect(binary.spawned.at(-1)?.spawn.args).not.toContain("--model");
	});
});
