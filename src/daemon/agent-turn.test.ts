import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "../attachment";
import {
	agentReader,
	fixtureAgentExecutor,
	makeApp,
	makeProject,
	makeTempDir,
	readCapture,
	replayAgentExecutor,
	until,
	writeFrame,
} from "../test-helpers";
import { readSelection } from "../verbs";
import type { AgentEvent } from "./agent-events";
import { agentFraming } from "./agent-spawn";
import { sessionFile } from "./agent-threads";
import { startAgentTurn } from "./agent-turn";

/** Every event of one turn, read off the stream the way a client would. */
async function drainTurn(res: Response, limit = 4000): Promise<AgentEvent[]> {
	const events = agentReader(res);
	const seen: AgentEvent[] = [];
	while (seen.length < limit) {
		let next: Awaited<ReturnType<typeof events.next>>;
		try {
			next = await events.next(2000);
		} catch {
			break;
		}
		seen.push(next.data as AgentEvent);
		if ((next.data as AgentEvent).kind === "closed") break;
	}
	return seen;
}

/** the conversation a turn runs under, which is the session id spool minted for it (#120) */
const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

function startTurn(name: string, app: ReturnType<typeof makeApp>, body: unknown = "make these consistent") {
	return app.request(`/api/p/${name}/agent/turn`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(
			typeof body === "string"
				? { thread: THREAD, said: [{ prompt: body }] }
				: { thread: THREAD, ...(body as Record<string, unknown>) },
		),
	});
}

/** what the hands point at, put the way the canvas puts it */
function point(name: string, app: ReturnType<typeof makeApp>, put: unknown) {
	return app.request(`/api/p/${name}/selection`, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(put),
	});
}

/** the one user message a turn sends, taken apart into its content blocks */
function sentContent(input: string | undefined): { type: string; text?: string; source?: Record<string, string> }[] {
	const line = JSON.parse(input ?? "{}") as { message?: { content?: unknown } };
	return (line.message?.content ?? []) as { type: string; text?: string }[];
}

function sentText(input: string | undefined): string {
	return sentContent(input).find((block) => block.type === "text")?.text ?? "";
}

/** every file under a root, so a test can say nothing landed */
function filesUnder(root: string): string[] {
	return readdirSync(root, { recursive: true }).map(String).sort();
}

describe("one turn over the wire", () => {
	it("spawns the developer's agent and streams its events back in order", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const agent = replayAgentExecutor("claude-turn");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const events = await drainTurn(res);

		// the agent stands in the product root, not in design/
		expect(agent.spawned).toHaveLength(1);
		expect(agent.spawned[0]?.spawn.cwd).toBe(root);
		expect(events[0]?.kind).toBe("ready");
		expect(events.at(-1)?.kind).toBe("closed");
		// the order is the wire's, not a reassembly of it
		const kinds = events.map((event) => event.kind);
		// this window opens mid-stream, on a tool call whose arguments are already
		// arriving — so the prefix is the capture's, not a tidy one
		expect(kinds.slice(0, 6)).toEqual(["ready", "limit", "call-input", "call-input", "called", "call"]);
		expect(kinds.filter((kind) => kind === "ended")).toHaveLength(1);
		expect(kinds.indexOf("ended")).toBe(kinds.length - 2);
	});

	/*
	 * A turn is not the request's to end (#211).
	 *
	 * The whole of what the ticket is about, at the door: the reader goes away, the process
	 * stays up, and whoever comes back reads what happened while nobody was looking.
	 */
	it("outlives the reader that started it, and hands the whole turn to the next one", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor();
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app);
		await until(() => agent.spawned.length === 1);
		const proc = agent.spawned[0] as (typeof agent.spawned)[number];
		proc.emit(
			JSON.stringify({
				type: "stream_event",
				event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "before" } },
			}),
		);

		// the refresh: this reader is gone, and it takes nothing with it
		const events = agentReader(res);
		expect((await events.next()).data).toMatchObject({ kind: "say", text: "before" });
		await events.cancel();
		proc.emit(
			JSON.stringify({
				type: "stream_event",
				event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "after" } },
			}),
		);

		expect(proc.killed).toBe(false);

		// and the page that comes back gets the turn from the top: what it missed and what it
		// was never there for, in one read
		const again = await app.request(`/api/p/${name}/agent/turn/${THREAD}`);
		expect(again.status).toBe(200);
		const back = agentReader(again);
		// the turn introduces itself first: what it is called, whether it is up, and how much
		// of what follows already happened
		const opening = await back.opening();
		expect(opening.event).toBe("attached");
		expect(opening.data).toMatchObject({ running: true, from: 0 });
		expect((await back.next()).data).toMatchObject({ kind: "say", text: "before" });
		expect((await back.next()).data).toMatchObject({ kind: "say", text: "after" });
		await back.cancel();
	});

	it("refuses a second turn in a conversation that already has one running", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor();
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const first = await startTurn(name, app);
		await until(() => agent.spawned.length === 1);

		const second = await startTurn(name, app, "and this too");
		expect(second.status).toBe(409);
		expect(await second.text()).toContain("already running");
		// one process, because two agents writing the same files is the thing being refused
		expect(agent.spawned).toHaveLength(1);
		await agentReader(first).cancel();
	});

	it("says there is nothing to read where no turn is being held", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: fixtureAgentExecutor().executor });

		const res = await app.request(`/api/p/${name}/agent/turn/${THREAD}`);
		expect(res.status).toBe(404);
		// the ordinary answer for every thread that is not mid-turn, and not a failure: the
		// picture on disk is the whole of what the rail draws for one of those
		expect(await res.text()).toContain("no turn to read");

		const bad = await app.request(`/api/p/${name}/agent/turn/not-a-uuid`);
		expect(bad.status).toBe(400);
	});

	it("tells the rail which threads have a turn to pick up", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor();
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app);
		await until(() => agent.spawned.length === 1);
		await app.request(`/api/p/${name}/agent/threads/${THREAD}`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				ask: "make these consistent",
				life: "running",
				at: 1_700_000_000_000,
				entries: [{ key: "u0", kind: "user", text: "make these consistent" }],
				kept: 1,
				plan: null,
				queued: [],
			}),
		});

		const listed = (await (await app.request(`/api/p/${name}/agent/threads`)).json()) as {
			threads: { id: string; live: boolean; stopped: boolean }[];
		};
		const thread = listed.threads.find((one) => one.id === THREAD);
		// live and not cut, which are the two halves of the same question: a picture that says
		// a process was up either has one here to attach to or lost it to something that was
		// not a hand
		expect(thread?.live).toBe(true);
		expect(thread?.stopped).toBe(false);
		await agentReader(res).cancel();
	});

	it("sends the prompt as one line of structured input", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = replayAgentExecutor("claude-compact");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		await drainTurn(await startTurn(name, app, "tidy up the cart"));

		const written = agent.spawned[0]?.inputs ?? [];
		expect(written).toHaveLength(1);
		expect(JSON.parse(written[0] as string)).toEqual({
			type: "user",
			message: { role: "user", content: [{ type: "text", text: "tidy up the cart" }] },
		});
	});

	it("carries every selected frame and element ahead of the words, in one block", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", "export default function Frame() {\n\treturn <main>hi</main>;\n}\n");
		writeFrame(root, "menu", "export default function Frame() {\n\treturn <main>hi</main>;\n}\n");
		const agent = replayAgentExecutor("claude-compact");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		await point(name, app, { frames: ["cart", "menu"] });
		await drainTurn(await startTurn(name, app, "make these consistent"));

		// the second frame is the whole point: the daemon has always served a list
		expect(sentText(agent.spawned[0]?.inputs[0])).toBe(
			[
				"<selection>",
				"cart — design/frames/cart/frame.tsx — 1440×900",
				"menu — design/frames/menu/frame.tsx — 1440×900",
				"</selection>",
				"",
				"make these consistent",
			].join("\n"),
		);
	});

	it("carries the words alone when the hands point at nothing", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = replayAgentExecutor("claude-compact");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		await drainTurn(await startTurn(name, app, "start a habit tracker"));

		// no empty block: a shape claiming the moment had one is worse than silence
		expect(sentText(agent.spawned[0]?.inputs[0])).toBe("start a habit tracker");
	});

	it("carries the same bytes `spool selection` prints for the same moment", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", "export default function Frame() {\n\treturn <main>hi</main>;\n}\n");
		const agent = replayAgentExecutor("claude-compact");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		await point(name, app, {
			elements: [
				{
					frame: "cart",
					selector: "main",
					outerHtml: "<main>hi</main>",
					source: "frames/cart/frame.tsx:2:9",
					generated: false,
				},
			],
		});

		await drainTurn(await startTurn(name, app, "tighten this"));

		// the CLI's own read, over this same daemon: one contract, not two dialects
		vi.stubGlobal("fetch", (url: string, init?: RequestInit) => app.fetch(new URL(url).pathname, init));
		const printed = await readSelection("http://localhost:7766", name, "test-control-token");
		vi.unstubAllGlobals();
		expect(printed).not.toBe("");
		expect(sentText(agent.spawned[0]?.inputs[0])).toBe(`${printed}\n\ntighten this`);
	});

	it("sends an attached image as bytes and writes no file anywhere", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const agent = replayAgentExecutor("claude-compact");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		const before = filesUnder(root);
		// one pixel, the shape a `tool_result` already carries a screenshot in
		const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

		await drainTurn(
			await startTurn(name, app, { said: [{ prompt: "match this", attachment: { media: "image/png", data } }] }),
		);

		expect(sentContent(agent.spawned[0]?.inputs[0])).toEqual([
			{ type: "image", source: { type: "base64", media_type: "image/png", data } },
			{ type: "text", text: "match this" },
		]);
		// look-only: the app-owned folder gains no inbox, no lifetime and no deleter
		expect(filesUnder(root)).toEqual(before);
	});

	it("says so rather than dropping an attachment it cannot send", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor(() => {});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		const refused = async (attachment: unknown) =>
			(await startTurn(name, app, { said: [{ prompt: "match this", attachment }] })).status;

		expect(await refused({ media: "image/svg+xml", data: "PHN2Zy8+" })).toBe(400);
		expect(await refused({ media: "image/png", data: "not base64!" })).toBe(400);
		// base64's groups of four carry three bytes, so this is the ceiling passed
		expect(
			await refused({ media: "image/png", data: "A".repeat((Math.floor(MAX_ATTACHMENT_BYTES / 3) + 2) * 4) }),
		).toBe(400);
		expect(await refused("data:image/png;base64,AAAA")).toBe(400);
		// a message that half arrived is worse than one that was refused
		expect(agent.spawned).toHaveLength(0);
	});

	it("carries the settled arguments and puts no API key in the environment", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = replayAgentExecutor("claude-compact");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		await drainTurn(await startTurn(name, app));

		const spawn = agent.spawned[0]?.spawn;
		const args = spawn?.args ?? [];
		expect(spawn?.command).toBe("claude");
		expect(args).toContain("--include-partial-messages");
		expect(args[args.indexOf("--setting-sources") + 1]).toBe("user");
		expect(args[args.indexOf("--permission-mode") + 1]).toBe("default");
		// the agent really arrives knowing what spool is: this is the text the
		// child is handed, not a function a test called on its own
		expect(args[args.indexOf("--append-system-prompt") + 1]).toBe(agentFraming());
		// no key is configured, asked for, or stored anywhere in this path
		expect(JSON.stringify(spawn?.args)).not.toMatch(/API_KEY|sk-ant/i);
		expect(Object.keys(spawn?.env ?? {}).filter((key) => /API_KEY/i.test(key))).toEqual(
			Object.keys(process.env).filter((key) => /API_KEY/i.test(key)),
		);
	});

	it("closes stdin when the result lands rather than killing the process", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = replayAgentExecutor("claude-fanout");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		await drainTurn(await startTurn(name, app));

		expect(agent.spawned[0]?.ended).toBe(true);
		expect(agent.spawned[0]?.killed).toBe(false);
	});

	/**
	 * A binary that will not go is not a thread that is gone (#211).
	 *
	 * The turn ended, stdin closed and the process stayed up: nothing else moves after
	 * that. The turn reads as running forever, the thread refuses every message sent to
	 * it, and the only way out was to restart the daemon. So the grace is what the turn is
	 * left with, and when it runs out the process is taken.
	 */
	it("takes a binary still up long after its own ending, and lets the thread go", async () => {
		vi.useFakeTimers();
		// the whole capture, ending and all, from a process that then never exits
		const agent = fixtureAgentExecutor((proc) => proc.replay(readCapture("claude-fanout")));
		const turn = startAgentTurn({
			executor: agent.executor,
			root: "/tmp/product",
			content: [],
			session: { id: "6b5c1d2e-1111-4222-8333-444455556666", resume: false },
		});
		const seen: AgentEvent[] = [];
		const reading = (async () => {
			for await (const event of turn.events) seen.push(event);
		})();
		// the spawn is awaited, so the prompt and the answer to it land on the microtasks
		await vi.advanceTimersByTimeAsync(0);
		const proc = agent.spawned[0] as (typeof agent.spawned)[number];
		expect(seen.some((event) => event.kind === "ended")).toBe(true);
		// asked first, and given the whole grace to answer on its own
		expect(proc.ended).toBe(true);
		await vi.advanceTimersByTimeAsync(9_000);
		expect(proc.killed).toBe(false);

		await vi.advanceTimersByTimeAsync(1_500);

		expect(proc.killed).toBe(true);
		await reading;
		// and the turn is over, which is what lets the next message into this thread
		expect(seen.at(-1)?.kind).toBe("closed");
		vi.useRealTimers();
	});

	it("distinguishes an interrupted turn from a clean one at the client", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: replayAgentExecutor("claude-interrupt").executor });

		const events = await drainTurn(await startTurn(name, app));

		const ended = events.find((event) => event.kind === "ended");
		expect(ended?.kind === "ended" && ended.ending).toBe("stopped");
		expect(ended?.kind === "ended" && ended.reason).toBe("aborted_streaming");
	});

	it("reports a binary that never started rather than hanging", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor((proc) => proc.exit(null, "spawn claude ENOENT"));
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const events = await drainTurn(await startTurn(name, app));

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({ kind: "closed", code: null, message: "spawn claude ENOENT", parent: null });
	});

	it("takes the process with the turn that was abandoned", async () => {
		// a fixture that answers nothing: the turn is still in flight when whoever
		// asked for it goes away
		const agent = fixtureAgentExecutor(() => {});
		const turn = startAgentTurn({
			executor: agent.executor,
			root: "/tmp/product",
			content: [],
			session: { id: "6b5c1d2e-1111-4222-8333-444455556666", resume: false },
		});
		const seen: AgentEvent[] = [];
		const reading = (async () => {
			for await (const event of turn.events) seen.push(event);
		})();
		await until(() => agent.spawned.length === 1);

		turn.abandon();
		await reading;

		expect(agent.spawned[0]?.killed).toBe(true);
		// nothing of the turn arrived, and the stream says it is over rather than
		// leaving a reader hanging on a process that is gone
		expect(seen).toEqual([{ kind: "closed", code: null, parent: null }]);
	});

	it("carries a queued message's own selection rather than what the hands point at now", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", "export default function Frame() {\n\treturn <main>hi</main>;\n}\n");
		writeFrame(root, "menu", "export default function Frame() {\n\treturn <main>hi</main>;\n}\n");
		const agent = replayAgentExecutor("claude-compact");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		// what the hands are pointing at *now*, which is neither of the two moments below
		await point(name, app, { frames: ["menu"] });
		const pointedAt = (frame: string) => [
			{ kind: "frame", frame, path: `design/frames/${frame}/frame.tsx`, size: { w: 390, h: 844 } },
		];

		// the queue fired: two messages, one turn, each with the block from its own Enter
		await drainTurn(
			await startTurn(name, app, {
				said: [
					{ prompt: "make these consistent", selection: pointedAt("cart") },
					{ prompt: "and the menu too", selection: pointedAt("menu") },
				],
			}),
		);

		expect(sentContent(agent.spawned[0]?.inputs[0]).map((block) => block.text)).toEqual([
			"<selection>\ncart — design/frames/cart/frame.tsx — 390×844\n</selection>\n\nmake these consistent",
			"<selection>\nmenu — design/frames/menu/frame.tsx — 390×844\n</selection>\n\nand the menu too",
		]);
		// one spawn, so it really was one turn reading both rather than two turns
		expect(agent.spawned).toHaveLength(1);
		expect(agent.spawned[0]?.inputs).toHaveLength(1);
	});

	it("refuses a captured selection it cannot read rather than printing half of one", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor(() => {});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		const refused = async (selection: unknown) =>
			(await startTurn(name, app, { said: [{ prompt: "go", selection }] })).status;

		expect(await refused([{ kind: "frame", frame: "cart", path: "design/frames/cart/frame.tsx" }])).toBe(400);
		expect(await refused([{ kind: "element", frame: "cart", path: "p.tsx", name: "row" }])).toBe(400);
		expect(await refused("cart")).toBe(400);
		// a half-read entry would print `undefined` into somebody's prompt
		expect(agent.spawned).toHaveLength(0);
	});

	it("caps a captured excerpt the way the store does, so the block's budget still holds", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cart", "export default function Frame() {\n\treturn <main>hi</main>;\n}\n");
		const agent = replayAgentExecutor("claude-compact");
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		await drainTurn(
			await startTurn(name, app, {
				said: [
					{
						prompt: "make this smaller",
						selection: [
							{
								kind: "element",
								frame: "cart",
								name: "main",
								path: "design/frames/cart/frame.tsx",
								lines: [2, 2],
								selector: "main",
								excerpt: "x".repeat(600),
							},
						],
					},
				],
			}),
		);

		// `selectionBlock` is written against the promise that every excerpt reaching it is
		// already inside the cap, which is the store's own doing on the way in and nobody's
		// for a list arriving over the wire. The pointer is untouched: it is the whole of
		// what an agent needs, and the excerpt is the only field with a budget
		const excerpt = sentText(agent.spawned[0]?.inputs[0]).split("\n")[2] ?? "";
		expect(excerpt.trim()).toHaveLength(240);
		expect(excerpt.trim().endsWith("…")).toBe(true);
		expect(sentText(agent.spawned[0]?.inputs[0])).toContain("cart · main — design/frames/cart/frame.tsx:2-2");
	});

	it("replays every capture end to end", async () => {
		for (const capture of ["claude-plan", "claude-edits", "claude-mcp"] as const) {
			const spoolDir = join(makeTempDir(), ".spool");
			const { name } = makeProject(spoolDir);
			const app = makeApp(spoolDir, { agentExecutor: replayAgentExecutor(capture).executor });

			const events = await drainTurn(await startTurn(name, app));

			expect(events.length).toBeGreaterThan(readCapture(capture).length / 2);
			expect(events.at(-1)?.kind).toBe("closed");
			expect(events.some((event) => event.kind === "ready")).toBe(true);
		}
	});
});

/**
 * The conversation a turn belongs to (#120, #200).
 *
 * The session id is the thread, and the two flags are exclusive: `--session-id` wants an
 * id the binary has never seen and `--resume` wants one it has. So the file is the fact,
 * which also means a thread whose session has aged out carries on under its own id rather
 * than failing a resume.
 */
describe("the thread a turn runs under", () => {
	it("starts a session under the id the rail named", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor(() => {});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app, { said: [{ prompt: "go" }] });
		await until(() => agent.spawned.length === 1);

		const args: readonly string[] = agent.spawned[0]?.spawn.args ?? [];
		expect(args[args.indexOf("--session-id") + 1]).toBe(THREAD);
		expect(args).not.toContain("--resume");
		await agentReader(res).cancel();
	});

	it("resumes it once the binary has a session file under that id", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const home = makeTempDir();
		vi.stubEnv("HOME", home);
		vi.stubEnv("CLAUDE_CONFIG_DIR", "");
		const file = sessionFile(root, THREAD, { HOME: home });
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(file, "{}\n");
		const agent = fixtureAgentExecutor(() => {});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app, { said: [{ prompt: "and now the receipt" }] });
		await until(() => agent.spawned.length === 1);

		const args: readonly string[] = agent.spawned[0]?.spawn.args ?? [];
		expect(args[args.indexOf("--resume") + 1]).toBe(THREAD);
		expect(args).not.toContain("--session-id");
		await agentReader(res).cancel();
		vi.unstubAllEnvs();
	});
});

/**
 * Stopping a turn that is already running (#165).
 *
 * The whole of what makes this safe is that it is a request rather than a kill: the
 * binary survives it, hands the call it caught a synthetic rejection, and emits a
 * clean result carrying `terminal_reason: "aborted_streaming"`. `claude-interrupt` is
 * the capture of exactly that, so the aftermath below is the recording's own.
 */
describe("the stop", () => {
	/** a fixture that answers the prompt with silence and the interrupt with the capture */
	function stoppable() {
		return fixtureAgentExecutor((proc, line) => {
			if (!line.includes('"control_request"')) return;
			proc.replay(readCapture("claude-interrupt"));
			proc.exit(0);
		});
	}

	function stop(name: string, app: ReturnType<typeof makeApp>, turn: string) {
		return app.request(`/api/p/${name}/agent/interrupt`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ turn }),
		});
	}

	it("is a request the process survives, and the turn ends on the binary's own result", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = stoppable();
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app, { said: [{ prompt: "start a habit tracker" }], turn: "t1" });
		await until(() => agent.spawned.length === 1);
		expect((await stop(name, app, "t1")).status).toBe(204);
		const events = await drainTurn(res);

		// a control request went up the same stdin the prompt went down, and nothing
		// was killed: the binary is left to finish and exit on its own
		const asked = JSON.parse(agent.spawned[0]?.inputs[1] ?? "{}") as {
			type?: string;
			request?: { subtype?: string };
		};
		expect(asked.type).toBe("control_request");
		expect(asked.request?.subtype).toBe("interrupt");
		expect(agent.spawned[0]?.killed).toBe(false);
		// and what came back is a clean ending rather than a torn stream
		const ended = events.find((event) => event.kind === "ended");
		expect(ended?.kind === "ended" && ended.ending).toBe("stopped");
		expect(ended?.kind === "ended" && ended.reason).toBe("aborted_streaming");
		expect(events.at(-1)?.kind).toBe("closed");
	});

	it("holds a press that lands while the process is still spawning", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = stoppable();
		/*
		 * A spawn nobody has finished, which is a window the rail's stop is already live
		 * in: the composer draws it off the turn's own phase, and that is `playing` from
		 * the press that started the turn rather than from the process appearing.
		 */
		let spawn = () => {};
		const spawning = new Promise<void>((resolve) => {
			spawn = resolve;
		});
		const app = makeApp(spoolDir, {
			agentExecutor: async (plan) => {
				await spawning;
				return agent.executor(plan);
			},
		});

		const res = await startTurn(name, app, { said: [{ prompt: "start a habit tracker" }], turn: "t1" });
		// the turn exists and it is this project's, so the press is taken. Turning it away
		// as nothing to stop is the one refusal that would not be true: it is starting
		expect((await stop(name, app, "t1")).status).toBe(204);
		expect(agent.spawned).toHaveLength(0);

		spawn();
		const events = await drainTurn(res);

		// and it is spent the moment there is somewhere to spend it, behind the prompt it
		// is stopping rather than in front of it
		expect(agent.spawned[0]?.inputs[0]).toContain('"user"');
		expect(agent.spawned[0]?.inputs[1]).toContain('"interrupt"');
		const ended = events.find((event) => event.kind === "ended");
		expect(ended?.kind === "ended" && ended.ending).toBe("stopped");
	});

	it("never echoes the binary's interruption notice into the log", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: replayAgentExecutor("claude-interrupt").executor });

		const events = await drainTurn(await startTurn(name, app));

		// the capture really carries it, so this is an absence with something behind it
		expect(JSON.stringify(readCapture("claude-interrupt"))).toContain("[Request interrupted by user]");
		// it is addressed to the model rather than to anybody, and echoing it would
		// report the developer's own press back at them in their own voice
		expect(JSON.stringify(events)).not.toContain("[Request interrupted by user]");
	});

	it("stops the turn it was named and says so when there is none", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = stoppable();
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });

		const res = await startTurn(name, app, { said: [{ prompt: "go" }], turn: "mine" });
		await until(() => agent.spawned.length === 1);

		// a project can hold more than one turn, so a stop reaches the one it names
		expect((await stop(name, app, "somebody else's")).status).toBe(404);
		expect((await stop("ghost", app, "mine")).status).toBe(404);
		expect(
			(
				await app.request(`/api/p/${name}/agent/interrupt`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({}),
				})
			).status,
		).toBe(400);
		expect(agent.spawned[0]?.inputs).toHaveLength(1);

		expect((await stop(name, app, "mine")).status).toBe(204);
		await drainTurn(res);
		// and once it is over there is nothing left to stop, which is the same fact
		expect((await stop(name, app, "mine")).status).toBe(404);
	});
});

describe("the door", () => {
	it("refuses a turn without a prompt, an unknown project, and no control token", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor(() => {});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		const post = (path: string, body: unknown) =>
			app.request(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});

		expect((await post(`/api/p/${name}/agent/turn`, { thread: THREAD, said: [{ prompt: "  " }] })).status).toBe(400);
		expect((await post(`/api/p/${name}/agent/turn`, { thread: THREAD, said: [] })).status).toBe(400);
		expect((await post(`/api/p/${name}/agent/turn`, { thread: THREAD })).status).toBe(400);
		// a turn belongs to a conversation, and spool minted its id before there was a
		// process: without one there is nothing to resume and nothing to store under (#120)
		expect((await post(`/api/p/${name}/agent/turn`, { said: [{ prompt: "go" }] })).status).toBe(400);
		expect((await post(`/api/p/${name}/agent/turn`, { thread: "kaffe", said: [{ prompt: "go" }] })).status).toBe(400);
		expect((await post("/api/p/ghost/agent/turn", { thread: THREAD, said: [{ prompt: "go" }] })).status).toBe(404);
		// spawning is the daemon's authority and nobody else's: without the
		// control capability this door does not open at all
		const uninvited = await app.fetch(`/api/p/${name}/agent/turn`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ said: [{ prompt: "go" }] }),
		});
		expect(uninvited.status).toBe(401);
		// nothing spawned for any of them
		expect(agent.spawned).toHaveLength(0);
	});
});

/**
 * The threads door (#120, #136, #200).
 *
 * The picture is the rail's and the disk is the daemon's, so what these check is the
 * seam: an envelope strict enough that a client cannot claim a restart or a close, an
 * opaque drawing that comes back byte for byte, and the two facts only the daemon can
 * answer riding out with it.
 */
describe("the threads door", () => {
	const picture = {
		ask: "shoot home and fix whatever reads wrong",
		life: "read",
		at: 1_700_000_000_000,
		entries: [{ key: "u0", kind: "user", text: "shoot home and fix whatever reads wrong" }],
		plan: null,
	};

	function threads(name: string, app: ReturnType<typeof makeApp>) {
		return app.request(`/api/p/${name}/agent/threads`);
	}

	function put(name: string, app: ReturnType<typeof makeApp>, id: string, body: unknown) {
		return app.request(`/api/p/${name}/agent/threads/${id}`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	it("hands back the drawing it was given, with nothing capped and nothing elided", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: fixtureAgentExecutor(() => {}).executor });

		expect((await put(name, app, THREAD, picture)).status).toBe(204);

		const served = (await (await threads(name, app)).json()) as { threads: { entries: unknown[] }[] };
		expect(served.threads).toHaveLength(1);
		expect(served.threads[0]?.entries).toEqual(picture.entries);
	});

	it("refuses an envelope that is not one, and a thread not named by a uuid", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: fixtureAgentExecutor(() => {}).executor });

		expect((await put(name, app, THREAD, { ...picture, ask: "" })).status).toBe(400);
		expect((await put(name, app, THREAD, { ...picture, life: "streaming" })).status).toBe(400);
		expect((await put(name, app, THREAD, { ...picture, entries: "lots" })).status).toBe(400);
		expect((await put(name, app, "kaffe", picture)).status).toBe(400);
		expect((await put("ghost", app, THREAD, picture)).status).toBe(404);
	});

	/** a reboot is not a hand: a thread mid-turn reads stopped and nothing resumes it */
	it("says a thread was stopped when no turn in this daemon is running it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: fixtureAgentExecutor(() => {}).executor });
		await put(name, app, THREAD, { ...picture, life: "running" });

		const served = (await (await threads(name, app)).json()) as {
			threads: { stopped: boolean; life: string; continuable: boolean }[];
		};
		expect(served.threads[0]).toMatchObject({ stopped: true, life: "unread" });
	});

	it("leaves a thread this daemon is still running alone", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const agent = fixtureAgentExecutor(() => {});
		const app = makeApp(spoolDir, { agentExecutor: agent.executor });
		await put(name, app, THREAD, { ...picture, life: "running" });

		const running = await startTurn(name, app, { said: [{ prompt: "carry on" }] });
		await until(() => agent.spawned.length === 1);
		const served = (await (await threads(name, app)).json()) as { threads: { stopped: boolean }[] };

		expect(served.threads[0]?.stopped).toBe(false);
		await running.body?.cancel();
	});

	it("closes a thread out of the strip and keeps every byte of it", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: fixtureAgentExecutor(() => {}).executor });
		await put(name, app, THREAD, picture);

		const closed = await app.request(`/api/p/${name}/agent/threads/${THREAD}/close`, { method: "POST" });
		expect(closed.status).toBe(204);

		const served = (await (await threads(name, app)).json()) as { threads: unknown[] };
		expect(served.threads).toEqual([]);
		// nothing was deleted: the file is still there, which the store's own test reads
		const again = await app.request(`/api/p/${name}/agent/threads/${THREAD}/close`, { method: "POST" });
		expect(again.status).toBe(204);
	});

	it("has nothing to say about a project that has never held a thread", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { name } = makeProject(spoolDir);
		const app = makeApp(spoolDir, { agentExecutor: fixtureAgentExecutor(() => {}).executor });

		expect(await (await threads(name, app)).json()).toEqual({ threads: [] });
		expect((await app.request(`/api/p/${name}/agent/threads/${THREAD}/close`, { method: "POST" })).status).toBe(404);
	});
});
