import { type ChildProcess, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished, vi } from "vitest";
import * as atomicWrite from "../atomic-write";
import { initProject } from "../init";
import { readRegistry } from "../registry";
import { COVER_PNG, makeTempDir, writeFrame } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import type { AgentEvent } from "./agent-events";
import { readThread } from "./agent-threads";
import { CONTROL_HEADER } from "./security";
import { serveDaemon } from "./server";

async function fixture() {
	const parent = realpathSync(makeTempDir());
	const spoolDir = join(parent, "state");
	const folder = join(parent, "before");
	mkdirSync(folder);
	const { root } = initProject(folder, spoolDir);
	writeFrame(root, "home", "before");
	const directory = join(spoolDir, "bundled");
	const children: ChildProcess[] = [];
	const newClient = () =>
		new BundledHostClient(directory, (state) => {
			const child = fork(
				fileURLToPath(new URL("./fixtures/bundled-recovery-provider-host.ts", import.meta.url)),
				[],
				{
					cwd: state,
					env: bundledEnvironment(state),
					execArgv: ["--import", import.meta.resolve("tsx")],
					stdio: ["ignore", "ignore", "ignore", "ipc"],
				},
			);
			children.push(child);
			return child;
		});
	let client = newClient();
	let engine = createSpoolEngine(spoolDir, client);
	const launch = () =>
		serveDaemon({ spoolDir, version: "test", host: "127.0.0.1", port: 0, history: false, agentEngines: [engine] });
	let daemon = await launch();
	onTestFinished(async () => {
		await daemon.close();
		for (const child of children)
			if (child.exitCode === null && child.signalCode === null) {
				const exited = once(child, "exit");
				child.kill();
				await exited;
			}
	});
	await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const request = (path: string, body?: unknown, method = "POST") =>
		fetch(`${daemon.url}${path}`, {
			method,
			headers: { [CONTROL_HEADER]: daemon.controlToken, "content-type": "application/json" },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	const thread = randomUUID();
	const turn = async (
		name: string,
		prompt: string,
		recovery?: string,
		attachment = false,
		approve?: "always" | "deny",
	): Promise<AgentEvent[]> => {
		const response = await request(`/api/p/${name}/agent/turn`, {
			thread,
			engine: "spool",
			...(recovery ? { recovery } : {}),
			said: [
				{
					prompt,
					selection: [
						{ kind: "frame", frame: "home", path: "design/frames/home/frame.tsx", size: { w: 400, h: 300 } },
					],
					...(attachment
						? { attachment: { media: "image/png", data: Buffer.from(COVER_PNG).toString("base64") } }
						: {}),
				},
			],
		});
		expect(response.status).toBe(200);
		const events: AgentEvent[] = [];
		const reader = response.body?.getReader();
		if (!reader) throw new Error("Missing event stream");
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const chunk = await reader.read();
			buffer += decoder.decode(chunk.value, { stream: !chunk.done });
			const blocks = buffer.split("\n\n");
			buffer = blocks.pop() ?? "";
			for (const part of blocks) {
				const data = part.match(/^data: (.*)$/m)?.[1];
				if (!part.includes("event: agent\n") || !data) continue;
				const event = JSON.parse(data) as AgentEvent;
				events.push(event);
				if (event.kind === "asking") {
					if (!approve) throw new Error("Unexpected permission request");
					expect(
						(await request(`/api/p/${name}/agent/answer`, { request: event.request, reply: { kind: approve } }))
							.status,
					).toBe(204);
				}
			}
			if (chunk.done) break;
		}
		return events;
	};
	return {
		root,
		parent,
		spoolDir,
		directory,
		get client() {
			return client;
		},
		get engine() {
			return engine;
		},
		request,
		thread,
		turn,
		calls: () => readFileSync(join(directory, "provider-calls.jsonl"), "utf8"),
		rename: (name = "after") => request("/api/projects/rename", { root, name }),
		restart: async () => {
			await daemon.close();
			// A new daemon owns a new client; only durable state survives shutdown.
			client = newClient();
			engine = createSpoolEngine(spoolDir, client);
			daemon = await launch();
		},
	};
}
const prompt =
	'file tools: [{"name":"read","arguments":{"path":"design/frames/home/frame.tsx"}},{"name":"edit","arguments":{"path":"design/frames/home/frame.tsx","edits":[{"oldText":"before","newText":"after"}]}}]';

it.each([false, true])(
	"continues exact completed sessions through HTTP rename, restarting=%s",
	{ timeout: 30_000 },
	async (restart) => {
		const f = await fixture();
		expect((await f.turn("before", prompt, undefined, true)).find((event) => event.kind === "ended")).toMatchObject({
			ending: "done",
		});
		const thread = readThread(f.spoolDir, f.root, f.thread);
		if (!thread) throw new Error("Missing thread");
		expect(
			(
				await f.request(`/api/p/before/agent/threads/${f.thread}/model`, {
					value: "spool/openai/api_key/second-test",
					effort: "high",
				})
			).status,
		).toBe(200);
		const offerFile = join(f.directory, "offers", `${thread.session.id}.json`);
		const offerBefore = readFileSync(offerFile, "utf8");
		const file = join(f.directory, "sessions", `${thread.session.id}.jsonl`);
		const before = readFileSync(file, "utf8").split("\n");
		const calls = f.calls();
		expect((await f.rename()).status).toBe(200);
		const moved = join(f.parent, "after");
		expect(readFileSync(offerFile, "utf8")).toBe(offerBefore);
		expect(readThread(f.spoolDir, moved, f.thread)?.session).toEqual(thread.session);
		expect(readFileSync(file, "utf8").split("\n").slice(1)).toEqual(before.slice(1));
		expect(JSON.parse(readFileSync(file, "utf8").split("\n")[0] ?? "").cwd).toBe(moved);
		if (restart) await f.restart();
		expect(f.calls()).toBe(calls);
		expect(
			await (
				await f.request(`/api/p/after/agent/threads/${randomUUID()}/models?engine=spool`, undefined, "GET")
			).json(),
		).toMatchObject({ current: { value: "spool/openai/api_key/second-test", effort: "high" } });
		writeFileSync(join(moved, "AGENTS.md"), "Renamed project instruction.");
		const next = await f.turn(
			"after",
			'file tools: [{"name":"write","arguments":{"path":"design/new.txt","content":"new root"}}]',
		);
		expect(next.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
		expect(next.find((event) => event.kind === "ready")).toMatchObject({
			model: "second-test",
			session: thread.session.id,
		});
		expect(readFileSync(join(moved, "design/new.txt"), "utf8")).toBe("new root");
		expect(existsSync(f.root)).toBe(false);
		const context = JSON.parse(f.calls().trim().split("\n").at(-1) ?? "");
		expect(context.systemPrompt).toContain("Renamed project instruction.");
		expect(context.messages.filter((message: { role: string }) => message.role === "user")).toHaveLength(2);
		expect(context.messages.filter((message: { role: string }) => message.role === "toolResult")).toHaveLength(3);
		expect(JSON.stringify(context)).toContain(Buffer.from(COVER_PNG).toString("base64"));
	},
);

it.each([false, true])(
	"keeps the held recovery token, draft, selection and completed edit through rename, restarting=%s",
	{ timeout: 30_000 },
	async (restart) => {
		const f = await fixture();
		writeFileSync(
			join(f.directory, "failure.json"),
			JSON.stringify({ afterTool: true, afterMutation: true, message: "401 Invalid API key" }),
		);
		const first = await f.turn("before", prompt, undefined, true);
		const ended = first.find((event) => event.kind === "ended");
		if (ended?.kind !== "ended" || !ended.recovery?.token) throw new Error("Missing recovery");
		const picture = {
			engine: "spool",
			ask: prompt,
			life: "read",
			at: 10,
			entries: first,
			kept: first.length,
			plan: null,
			queued: [],
			draft: "My next draft",
			pending: [{ prompt, selection: "captured" }],
			recovery: ended.recovery,
		};
		expect((await f.request(`/api/p/before/agent/threads/${f.thread}`, picture, "PUT")).status).toBe(204);
		const saved = readThread(f.spoolDir, f.root, f.thread);
		const calls = f.calls();
		expect((await f.rename()).status).toBe(200);
		expect(readThread(f.spoolDir, join(f.parent, "after"), f.thread)).toEqual(saved);
		if (restart) await f.restart();
		expect(f.calls()).toBe(calls);
		rmSync(join(f.directory, "failure.json"));
		const next = await f.turn("after", "Do not replace my held request", ended.recovery.token);
		expect(next.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
		expect(next.filter((event) => event.kind === "result")).toHaveLength(0);
		const context = JSON.parse(f.calls().trim().split("\n").at(-1) ?? "");
		expect(context.messages.filter((message: { role: string }) => message.role === "user")).toHaveLength(1);
		expect(context.messages.filter((message: { role: string }) => message.role === "toolResult")).toHaveLength(2);
		expect(JSON.stringify(context)).toContain(Buffer.from(COVER_PNG).toString("base64"));
		expect(JSON.stringify(context)).not.toContain("Do not replace");
		expect(readFileSync(join(f.parent, "after/design/frames/home/frame.tsx"), "utf8")).toBe("after");
	},
);

it("rolls back session bytes, recovery, registry, threads and folder on a late persistence failure", {
	timeout: 30_000,
}, async () => {
	const f = await fixture();
	writeFileSync(
		join(f.directory, "failure.json"),
		JSON.stringify({ afterTool: true, afterMutation: true, message: "401 Invalid API key" }),
	);
	const first = await f.turn("before", prompt);
	const ended = first.find((event) => event.kind === "ended");
	if (ended?.kind !== "ended" || !ended.recovery?.token) throw new Error("Missing recovery");
	const thread = readThread(f.spoolDir, f.root, f.thread);
	if (!thread) throw new Error("Missing thread");
	const paths = [
		join(f.directory, "sessions", `${thread.session.id}.jsonl`),
		join(f.directory, "recovery", `${thread.session.id}.json`),
		join(f.spoolDir, "registry.json"),
		join(f.spoolDir, "session.json"),
	];
	const before = paths.map((path) => readFileSync(path, "utf8"));
	const write = atomicWrite.writeAtomic;
	const failure = vi.spyOn(atomicWrite, "writeAtomic").mockImplementation((path, contents) => {
		if (path === join(f.spoolDir, "session.json")) throw new Error("Injected final write failure");
		write(path, contents);
	});
	try {
		expect((await f.rename()).status).toBe(409);
	} finally {
		failure.mockRestore();
	}
	expect(paths.map((path) => readFileSync(path, "utf8"))).toEqual(before);
	expect(existsSync(f.root)).toBe(true);
	expect(existsSync(join(f.parent, "after"))).toBe(false);
	expect(readThread(f.spoolDir, f.root, f.thread)).toEqual(thread);
	rmSync(join(f.directory, "failure.json"));
	expect(
		(await f.turn("before", "recover", ended.recovery.token)).find((event) => event.kind === "ended"),
	).toMatchObject({ ending: "done" });
});

it("blocks turn starts, trash and a second rename throughout asynchronous preparation and completion", {
	timeout: 30_000,
}, async () => {
	const f = await fixture();
	await f.turn("before", "hello");
	const prepare = f.engine.prepareRename;
	if (!prepare) throw new Error("Missing rename lifecycle");
	let releasePrepare = () => {};
	let releaseFinish = () => {};
	let prepared = false;
	let finishing = false;
	const pausePrepare = new Promise<void>((resolve) => {
		releasePrepare = resolve;
	});
	const pauseFinish = new Promise<void>((resolve) => {
		releaseFinish = resolve;
	});
	f.engine.prepareRename = async (...args) => {
		const relocation = await prepare(...args);
		prepared = true;
		await pausePrepare;
		return {
			token: relocation.token,
			finish: async (committed) => {
				finishing = true;
				await pauseFinish;
				await relocation.finish(committed);
			},
		};
	};
	const renaming = f.rename();
	await expect.poll(() => prepared).toBe(true);
	const start = (name: string) =>
		f.request(`/api/p/${name}/agent/turn`, { thread: randomUUID(), engine: "spool", said: [{ prompt: "racing" }] });
	expect((await start("before")).status).toBe(409);
	expect((await f.rename("other")).status).toBe(409);
	expect((await f.request("/api/projects/trash", { root: f.root })).status).toBe(409);
	releasePrepare();
	await expect.poll(() => finishing).toBe(true);
	expect((await start("after")).status).toBe(409);
	expect((await f.request("/api/projects/trash", { root: join(f.parent, "after") })).status).toBe(409);
	releaseFinish();
	expect((await renaming).status).toBe(200);
	expect(readRegistry(f.spoolDir).projects[0]?.root).toBe(join(f.parent, "after"));
	expect((await f.turn("after", "continue")).find((event) => event.kind === "ended")).toMatchObject({
		ending: "done",
	});
});

it("moves only grants inside the project and rebuilds protected boundaries at the new root", {
	timeout: 30_000,
}, async () => {
	const f = await fixture();
	const outside = join(f.parent, "outside");
	const write = (path: string, content: string) =>
		`file tools: ${JSON.stringify([{ name: "write", arguments: { path, content } }])}`;
	const first = await f.turn("before", write("source/one.txt", "one"), undefined, false, "always");
	expect(first.filter((event) => event.kind === "asking")).toHaveLength(1);
	const external = await f.turn("before", write(join(outside, "one.txt"), "outside"), undefined, false, "always");
	expect(external.filter((event) => event.kind === "asking")).toHaveLength(1);
	expect((await f.rename()).status).toBe(200);
	const moved = join(f.parent, "after");
	const inside = await f.turn("after", write("source/two.txt", "two"), undefined, false, "deny");
	expect(inside.filter((event) => event.kind === "asking")).toHaveLength(0);
	expect(readFileSync(join(moved, "source/two.txt"), "utf8")).toBe("two");
	const retained = await f.turn("after", write(join(outside, "two.txt"), "outside two"), undefined, false, "deny");
	expect(retained.filter((event) => event.kind === "asking")).toHaveLength(0);
	expect(readFileSync(join(outside, "two.txt"), "utf8")).toBe("outside two");
	const ungranted = await f.turn("after", write("ungranted/no.txt", "must not write"), undefined, false, "deny");
	expect(ungranted.filter((event) => event.kind === "asking")).toHaveLength(1);
	expect(existsSync(join(moved, "ungranted/no.txt"))).toBe(false);
	const oldScope = await f.turn(
		"after",
		write(join(f.root, "source/no.txt"), "must not write"),
		undefined,
		false,
		"deny",
	);
	expect(oldScope.filter((event) => event.kind === "asking")).toHaveLength(1);
	expect(existsSync(f.root)).toBe(false);
	for (const protectedPath of ["design/canvas.json", join(f.directory, "credentials.json")]) {
		const before = readFileSync(protectedPath.startsWith("/") ? protectedPath : join(moved, protectedPath), "utf8");
		const protectedTurn = await f.turn("after", write(protectedPath, "must not write"), undefined, false, "deny");
		expect(protectedTurn.filter((event) => event.kind === "asking")).toHaveLength(0);
		expect(JSON.stringify(protectedTurn)).toContain("protected");
		expect(readFileSync(protectedPath.startsWith("/") ? protectedPath : join(moved, protectedPath), "utf8")).toBe(
			before,
		);
	}
	await f.restart();
	const lost = await f.turn("after", write("source/three.txt", "must request again"), undefined, false, "deny");
	expect(lost.filter((event) => event.kind === "asking")).toHaveLength(1);
});

it("rejects forged ownership before moving any folder or registry state", { timeout: 30_000 }, async () => {
	const f = await fixture();
	await f.turn("before", "hello");
	const thread = readThread(f.spoolDir, f.root, f.thread);
	if (!thread) throw new Error("Missing thread");
	await f.client.restart();
	const path = join(f.directory, "sessions", `${thread.session.id}.jsonl`);
	const bytes = readFileSync(path, "utf8");
	const lines = bytes.split("\n");
	lines[0] = JSON.stringify({ ...JSON.parse(lines[0] ?? ""), cwd: join(f.parent, "other-project") });
	const forged = lines.join("\n");
	writeFileSync(path, forged);
	const registry = readRegistry(f.spoolDir);
	expect((await f.rename()).status).toBe(409);
	expect(readRegistry(f.spoolDir)).toEqual(registry);
	expect(readFileSync(path, "utf8")).toBe(forged);
	expect(existsSync(f.root)).toBe(true);
	expect(existsSync(join(f.parent, "after"))).toBe(false);
	writeFileSync(path, bytes);
	expect((await f.rename()).status).toBe(200);
});

it("retains scoped command grants across the move without widening native command access", {
	timeout: 30_000,
}, async () => {
	const f = await fixture();
	const outside = join(f.parent, "outside");
	mkdirSync(join(f.root, "source"));
	mkdirSync(outside);
	const command = (path: string, file: string) =>
		`file tools: ${JSON.stringify([{ name: "bash", arguments: { command: `printf written > '${path}/${file}'`, writable_paths: [path] } }])}`;
	for (const path of ["source", outside]) {
		const events = await f.turn("before", command(path, "one.txt"), undefined, false, "always");
		expect(events.filter((event) => event.kind === "asking")).toHaveLength(1);
		expect(events.filter((event) => event.kind === "result")).toMatchObject([{ failed: false }]);
	}
	expect((await f.rename()).status).toBe(200);
	for (const path of ["source", outside]) {
		const events = await f.turn("after", command(path, "two.txt"), undefined, false, "deny");
		expect(events.filter((event) => event.kind === "asking")).toHaveLength(0);
		expect(events.filter((event) => event.kind === "result")).toMatchObject([{ failed: false }]);
	}
	expect(readFileSync(join(f.parent, "after/source/two.txt"), "utf8")).toBe("written");
	expect(readFileSync(join(outside, "two.txt"), "utf8")).toBe("written");
	const old = await f.turn("after", command(join(f.root, "source"), "no.txt"), undefined, false, "deny");
	expect(old.filter((event) => event.kind === "asking")).toHaveLength(1);
	expect(existsSync(f.root)).toBe(false);
});

it("relocates first-send recovery with no SDK file and preserves the exact original request", {
	timeout: 30_000,
}, async () => {
	const f = await fixture();
	await f.client.request({ kind: "disconnect", provider: "openai" });
	const events = await f.turn("before", "original first request", undefined, true);
	const ended = events.find((event) => event.kind === "ended");
	if (ended?.kind !== "ended" || !ended.recovery?.token) throw new Error("Missing recovery");
	const session = readThread(f.spoolDir, f.root, f.thread)?.session;
	if (!session) throw new Error("Missing session");
	expect(existsSync(join(f.directory, "sessions", `${session.id}.jsonl`))).toBe(false);
	expect((await f.rename()).status).toBe(200);
	await f.restart();
	expect(existsSync(join(f.directory, "provider-calls.jsonl"))).toBe(false);
	await f.client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const next = await f.turn("after", "replacement is ignored", ended.recovery.token);
	expect(next.find((event) => event.kind === "ended")).toMatchObject({ ending: "done" });
	expect(f.calls()).toContain("original first request");
	expect(f.calls()).not.toContain("replacement is ignored");
});

it.each(["prepare", "finish"])(
	"keeps the durable transaction valid when the host exits during %s",
	{ timeout: 30_000 },
	async (phase) => {
		const f = await fixture();
		await f.turn("before", "hello");
		const calls = f.calls();
		const prepare = f.engine.prepareRename;
		if (!prepare) throw new Error("Missing rename lifecycle");
		f.engine.prepareRename = async (...args) => {
			const relocation = await prepare(...args);
			if (phase === "prepare") {
				await f.client.restart();
				await f.client.request({ kind: "account" });
			}
			return {
				token: relocation.token,
				finish: async (committed) => {
					if (phase === "finish") {
						await f.client.restart();
						await f.client.request({ kind: "account" });
					}
					await relocation.finish(committed);
				},
			};
		};
		expect((await f.rename()).status).toBe(200);
		expect(f.calls()).toBe(calls);
		expect((await f.turn("after", "continue")).find((event) => event.kind === "ended")).toMatchObject({
			ending: "done",
		});
	},
);
