import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentReader, makeApp, makeProject, makeTempDir, until } from "../test-helpers";
import type { AgentReply } from "./agent-control";
import type { AgentEngine, AgentEngineId, EngineTurnOptions } from "./agent-engine";
import type { AgentEvent } from "./agent-events";
import type { AgentOffer } from "./agent-offer";
import { putThread, readThread, type ServedThread, type ThreadPut, writeThread } from "./agent-threads";

const ONE = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";
const TWO = "2a1b3c4d-5e6f-4788-9900-112233445566";
const picture: ThreadPut = {
	ask: "keep the card",
	life: "read",
	at: 1234,
	entries: [{ kind: "user", text: "keep the card" }],
	kept: 1,
	plan: null,
	queued: [{ prompt: "then its receipt", selection: [], attachment: { media: "image/png", data: "aGk=" } }],
	draft: "next thought",
};

/** Independent engines speak only the shared contract, with no Claude wire interpreter. */
function fakeEngine(id: AgentEngineId) {
	const starts: EngineTurnOptions[] = [];
	const replies: AgentReply[] = [];
	let stopped = 0;
	let abandoned = 0;
	let available = true;
	let sessionPresent = true;
	const offer: AgentOffer = {
		models: [{ value: id, resolvedModel: `${id}-model`, displayName: id, description: "fixture" }],
		current: { value: id, resolved: `${id}-model`, name: id, effort: null, pin: null },
	};
	const engine: AgentEngine = {
		id,
		authentication: { kind: "external", command: "fixture login" },
		installed: () => available,
		account: async () => ({ signedIn: true, account: `${id}@example.test` }),
		offer: async () => offer,
		choice: (result) => ({ value: result.current.value ?? id }),
		continuable: async () => sessionPresent,
		start: (options) => {
			starts.push(options);
			let finish: (() => void) | undefined;
			const done = new Promise<void>((resolve) => {
				finish = resolve;
			});
			return {
				events: (async function* (): AsyncGenerator<AgentEvent> {
					yield { kind: "say", block: 0, text: id, parent: null };
					await done;
					yield { kind: "closed", code: 0, parent: null };
				})(),
				answer: (request, reply) => {
					if (request !== `${id}-ask`) return false;
					replies.push(reply);
					return true;
				},
				interrupt: () => {
					stopped += 1;
					finish?.();
					return true;
				},
				abandon: () => {
					abandoned += 1;
					finish?.();
				},
			};
		},
	};
	return {
		engine,
		starts,
		replies,
		get stopped() {
			return stopped;
		},
		get abandoned() {
			return abandoned;
		},
		unavailable: () => {
			available = false;
		},
		missingSession: () => {
			sessionPresent = false;
		},
	};
}

function setup(engines: readonly AgentEngine[]) {
	const spoolDir = makeTempDir();
	const { root, name } = makeProject(spoolDir);
	const app = makeApp(spoolDir, { agentEngines: engines });
	const path = `/api/p/${name}/agent`;
	const send = (route: string, body: unknown, method = "POST") =>
		app.request(`${path}/${route}`, {
			method,
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	const threads = async () =>
		((await (await app.request(`${path}/threads`)).json()) as { threads: ServedThread[] }).threads;
	return { spoolDir, root, app, path, send, threads };
}

describe("engine ownership through the daemon", () => {
	it("routes independent turns, offers, accounts, answers and Stop while replay survives a departing viewer", async () => {
		const claude = fakeEngine("claude");
		const spool = fakeEngine("spool");
		const { app, path, send, threads } = setup([claude.engine, spool.engine]);
		const first = agentReader(
			await send("turn", { thread: ONE, turn: "one", engine: "claude", said: [{ prompt: "one" }] }),
		);
		const second = agentReader(
			await send("turn", {
				thread: TWO,
				turn: "two",
				engine: "spool",
				said: [{ prompt: "two", selection: [], attachment: { media: "image/png", data: "aGk=" } }],
			}),
		);
		expect((await first.next()).data).toMatchObject({ text: "claude" });
		expect((await second.next()).data).toMatchObject({ text: "spool" });
		await first.cancel();
		expect(claude.abandoned).toBe(0);
		expect((await send("turn", { thread: ONE, said: [{ prompt: "duplicate" }] })).status).toBe(409);
		expect(spool.starts[0]).toMatchObject({
			session: (await threads()).find((thread) => thread.id === TWO)?.session,
			said: [{ prompt: "two", selection: "", attachment: { data: "aGk=" } }],
			permissions: "ask",
		});
		expect((await threads()).map((thread) => [thread.engine, thread.live, thread.continuable])).toEqual([
			["claude", true, true],
			["spool", true, true],
		]);
		expect(await (await app.request(`${path}/threads/${TWO}/models`)).json()).toMatchObject({
			current: { value: "spool" },
		});
		expect(await (await app.request(`${path}/login?thread=${TWO}`)).json()).toMatchObject({
			account: "spool@example.test",
		});
		expect(await (await send(`threads/${TWO}/model`, { value: "spool" })).json()).toMatchObject({
			current: { value: "spool" },
		});
		expect((await send("answer", { request: "spool-ask", reply: { kind: "said", text: "keep it" } })).status).toBe(
			204,
		);
		expect(spool.replies).toEqual([{ kind: "said", text: "keep it" }]);
		expect(claude.replies).toEqual([]);
		const replay = agentReader(await app.request(`${path}/turn/${ONE}`));
		expect((await replay.next()).data).toMatchObject({ text: "claude" });
		expect((await send("interrupt", { turn: "one" })).status).toBe(204);
		expect((await replay.next()).data).toMatchObject({ kind: "closed" });
		expect(spool.stopped).toBe(0);
		await send("interrupt", { turn: "two" });
		expect((await second.next()).data).toMatchObject({ kind: "closed" });
		await replay.cancel();
		await second.cancel();
	});

	it("migrates a legacy record durably without changing its picture or exact resume identity", async () => {
		const claude = fakeEngine("claude");
		const { spoolDir, root, send, threads } = setup([claude.engine]);
		putThread(spoolDir, root, ONE, picture);
		const [directory] = readdirSync(join(spoolDir, "threads"));
		const file = join(spoolDir, "threads", directory ?? "", `${ONE}.json`);
		const legacy = { id: ONE, ...picture, stopped: false, closed: false };
		writeFileSync(file, JSON.stringify(legacy));
		expect((await threads())[0]).toMatchObject({ ...legacy, engine: "claude", session: { id: ONE } });
		expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ ...legacy, engine: "claude", session: { id: ONE } });
		const view = agentReader(await send("turn", { thread: ONE, turn: "resume", said: [{ prompt: "continue" }] }));
		await view.next();
		expect(claude.starts[0]?.session).toEqual({ id: ONE });
		expect(readThread(spoolDir, root, ONE)).toMatchObject(picture);
		await send("interrupt", { turn: "resume" });
		await view.cancel();
	});

	it("resumes the engine's saved reference even when it differs from the rail thread id", async () => {
		const spool = fakeEngine("spool");
		const { spoolDir, root, send } = setup([spool.engine]);
		writeThread(spoolDir, root, {
			...picture,
			id: ONE,
			engine: "spool",
			session: { id: TWO },
			stopped: false,
			closed: false,
		});
		expect((await send(`threads/${ONE}`, picture, "PUT")).status).toBe(204);
		const view = agentReader(await send("turn", { thread: ONE, turn: "resume", said: [{ prompt: "continue" }] }));
		await view.next();
		expect(spool.starts[0]?.session).toEqual({ id: TWO });
		expect(readThread(spoolDir, root, ONE)).toMatchObject({ ...picture, session: { id: TWO } });
		await send("interrupt", { turn: "resume" });
		await view.cancel();
	});

	it("rejects reassignment and all client session references, including before the first picture save", async () => {
		const spool = fakeEngine("spool");
		const { spoolDir, root, send } = setup([spool.engine, fakeEngine("claude").engine]);
		const view = agentReader(
			await send("turn", { thread: ONE, turn: "one", engine: "spool", said: [{ prompt: "go" }] }),
		);
		await view.next();
		expect((await send(`threads/${ONE}`, { ...picture, engine: "claude" }, "PUT")).status).toBe(409);
		expect((await send(`threads/${ONE}`, picture, "PUT")).status).toBe(204);
		expect(readThread(spoolDir, root, ONE)?.engine).toBe("spool");
		for (const session of [{ id: TWO }, { path: "/tmp/arbitrary.jsonl" }, "../../elsewhere"]) {
			expect((await send(`threads/${TWO}`, { ...picture, session }, "PUT")).status).toBe(400);
			expect((await send("turn", { thread: TWO, session, said: [{ prompt: "go" }] })).status).toBe(400);
		}
		await send("interrupt", { turn: "one" });
		await view.cancel();
		await until(() => spool.stopped === 1);
		expect((await send("turn", { thread: ONE, engine: "claude", said: [{ prompt: "switch" }] })).status).toBe(409);
	});

	it("keeps unavailable engine and missing session history readable while another engine works", async () => {
		const spool = fakeEngine("spool");
		const { spoolDir, root, app, path, send, threads } = setup([spool.engine]);
		putThread(spoolDir, root, ONE, { ...picture, engine: "claude" });
		putThread(spoolDir, root, TWO, { ...picture, engine: "spool" });
		expect((await threads()).map((thread) => [thread.engine, thread.continuable])).toEqual([
			["claude", false],
			["spool", true],
		]);
		expect((await send("turn", { thread: ONE, said: [{ prompt: "continue" }] })).status).toBe(503);
		expect((await app.request(`${path}/threads/${ONE}/models`)).status).toBe(503);
		spool.missingSession();
		expect((await threads())[1]).toMatchObject({ ...picture, continuable: false });
		spool.unavailable();
		expect((await threads())[1]).toMatchObject({ ...picture, continuable: false });
	});
});
