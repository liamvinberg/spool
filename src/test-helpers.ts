import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { onTestFinished } from "vitest";
import { createClaudeAdapter } from "./daemon/agent-claude";
import type { AgentExecutor, AgentProcess } from "./daemon/agent-exec";
import type { AgentSpawn } from "./daemon/agent-spawn";
import { createDaemonApp } from "./daemon/app";
import { renderOrigin } from "./daemon/lifecycle";
import { CONTROL_HEADER, PROJECT_HEADER, RENDER_HOST } from "./daemon/security";
import { serveDaemon } from "./daemon/server";
import type { TermExecutor, TermProcess, TermSpawn } from "./daemon/term-exec";
import { initProject } from "./init";
import { lookupProjectByName } from "./registry";
import { canvasJson } from "./templates";

/** A real 1×1 PNG — the cover store only accepts bytes it can identify. */
export const COVER_PNG = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XH1dWQAAAABJRU5ErkJggg==",
		"base64",
	),
);

export function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "spool-test-"));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

export function markProject(root: string): void {
	mkdirSync(join(root, "design"), { recursive: true });
	writeFileSync(join(root, "design", "canvas.json"), canvasJson);
}

/** A registered project scaffolded through the real init path. */
export function makeProject(spoolDir: string): { root: string; name: string } {
	const dir = makeTempDir();
	const { root } = initProject(dir, spoolDir);
	return { root, name: basename(root) };
}

export function writeDesignFile(root: string, rel: string, content: string): void {
	const file = join(root, "design", rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

export function writeFrame(root: string, name: string, tsx: string): void {
	writeDesignFile(root, join("frames", name, "frame.tsx"), tsx);
}

/** A frame on a named page (#39, #231): the page is a path, identity still the leaf name. */
export function writePageFrame(root: string, page: string, name: string, tsx: string): void {
	writeDesignFile(root, join("frames", page, name, "frame.tsx"), tsx);
}

/** A daemon app on a given ~/.spool dir, closed with the test. */
export function makeApp(spoolDir: string, options?: Partial<Parameters<typeof createDaemonApp>[0]>) {
	/** History's one-per-project disabling notice, collected instead of printed. */
	const historyNotices: string[] = [];
	const daemon = createDaemonApp({
		spoolDir,
		version: "0.0.0-test",
		controlHost: "localhost",
		controlToken: "test-control-token",
		onHistoryNotice: (message) => historyNotices.push(message),
		...options,
	});
	daemon.setSelfOrigin("http://localhost:7766");
	onTestFinished(() => daemon.close());
	return {
		historyNotices,
		/** the raw door: no capability is added, so a test can assert one is required */
		fetch: (input: string, init?: RequestInit) =>
			daemon.app.fetch(new Request(new URL(input, "http://localhost:7766"), init)),
		controlRequest: (input: string, init?: RequestInit) => {
			const request = new Request(new URL(input, "http://localhost:7766"), init);
			request.headers.set(CONTROL_HEADER, daemon.controlToken);
			return daemon.app.fetch(request);
		},
		request: (input: string, init?: RequestInit) => {
			const url = new URL(input, "http://localhost:7766");
			const path = url.pathname;
			const projectData = /^\/api\/p\/([^/]+)\/(?:scenarios\/|fixtures\/)/.exec(path);
			const render =
				/^\/p\/[^/]+\/frames\/[^/]+$/.test(path) ||
				path.startsWith("/play/") ||
				path.startsWith("/vendor/") ||
				projectData !== null;
			url.hostname = render ? RENDER_HOST : "localhost";
			const request = new Request(url.href, init);
			if (path.startsWith("/api/") && projectData === null && path !== "/api/health") {
				request.headers.set(CONTROL_HEADER, daemon.controlToken);
			}
			if (projectData !== null) {
				const name = decodeURIComponent(projectData[1] as string);
				const project = lookupProjectByName(spoolDir, name);
				if (project.kind === "found") request.headers.set(PROJECT_HEADER, daemon.projectCapability(project.root));
				// happy-dom strips the forbidden Origin header while constructing
				// a Request. Set the browser-owned sandbox origin afterwards so
				// this seam preserves the production request contract.
				request.headers.set("origin", "null");
			}
			return daemon.app.fetch(request);
		},
	};
}

/** A registered project behind a really-served daemon on an ephemeral port. */
export async function serveProject(options?: Partial<Parameters<typeof serveDaemon>[0]>) {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0, ...options });
	onTestFinished(() => daemon.close());
	return {
		spoolDir,
		root,
		name,
		url: daemon.url,
		renderUrl: renderOrigin(daemon.url),
		controlToken: daemon.controlToken,
	};
}

export interface SseEvent {
	event: string;
	data: unknown;
}

export class SseTimeout extends Error {}

/** Reads server-sent events off a streaming response, one promise per event. */
export function sseReader(res: Response) {
	const reader = (res.body as ReadableStream<Uint8Array>).getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const queue: SseEvent[] = [];
	// a timed-out read is never abandoned: the pending promise carries the next
	// chunk and must be consumed by a later call
	let pendingRead: ReturnType<typeof reader.read> | undefined;

	async function next(timeoutMs = 5000): Promise<SseEvent> {
		const deadline = Date.now() + timeoutMs;
		while (queue.length === 0) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) throw new SseTimeout("timed out waiting for an SSE event");
			pendingRead ??= reader.read();
			const outcome = await Promise.race([
				pendingRead,
				new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), remaining)),
			]);
			if (outcome === "timeout") continue;
			pendingRead = undefined;
			if (outcome.done) throw new Error("SSE stream ended");
			buffer += decoder.decode(outcome.value, { stream: true });
			const blocks = buffer.split("\n\n");
			buffer = blocks.pop() ?? "";
			for (const block of blocks) {
				const event = block.match(/^event: (.*)$/m)?.[1] ?? "message";
				const data = block.match(/^data: (.*)$/m)?.[1];
				if (data !== undefined) queue.push({ event, data: JSON.parse(data) });
			}
		}
		return queue.shift() as SseEvent;
	}

	async function drain(quietMs: number): Promise<void> {
		try {
			for (;;) await next(quietMs);
		} catch (error) {
			if (!(error instanceof SseTimeout)) throw error;
		}
	}

	async function expectQuiet(ms: number): Promise<void> {
		let seen: SseEvent;
		try {
			seen = await next(ms);
		} catch (error) {
			if (error instanceof SseTimeout) return;
			throw error;
		}
		throw new Error(`expected quiet, got ${JSON.stringify(seen)}`);
	}

	/** let the response go, which is a client hanging up rather than a stream ending */
	async function cancel(): Promise<void> {
		await reader.cancel();
	}

	return { next, drain, expectQuiet, cancel };
}

/**
 * The agent events off a turn's stream, and only those (#211).
 *
 * A turn's stream opens by saying what is being read — the name a stop quotes, whether the
 * process is up, how much of what follows is replay — and that line is the daemon talking
 * about the turn rather than the agent talking. Every assertion here is about the second
 * kind, so this is the reader that skips the first. `sseReader` is still what a test about
 * the opening line itself uses.
 */
export function agentReader(res: Response) {
	const sse = sseReader(res);

	async function next(timeoutMs = 5000): Promise<SseEvent> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			const left = deadline - Date.now();
			if (left <= 0) throw new SseTimeout("timed out waiting for an agent event");
			const seen = await sse.next(left);
			if (seen.event === "agent") return seen;
		}
	}

	async function drain(quietMs: number): Promise<void> {
		try {
			for (;;) await next(quietMs);
		} catch (error) {
			if (!(error instanceof SseTimeout)) throw error;
		}
	}

	async function expectQuiet(ms: number): Promise<void> {
		let seen: SseEvent;
		try {
			seen = await next(ms);
		} catch (error) {
			if (error instanceof SseTimeout) return;
			throw error;
		}
		throw new Error(`expected quiet, got ${JSON.stringify(seen)}`);
	}

	return { next, drain, expectQuiet, cancel: sse.cancel, opening: sse.next };
}

/** The terminal fixture executor (#42): the injected stand-in for the bun
 * toolchain — a controllable process emitting known ANSI, so daemon-seam
 * tests exercise sessions without ever downloading bun or OpenTUI. */
export class FakeTermProc implements TermProcess {
	inputs: string[] = [];
	sizes: { cols: number; rows: number }[] = [];
	signals: string[] = [];
	killed = false;
	spawn: TermSpawn;
	private dataCb: (chunk: Uint8Array) => void = () => {};
	private exitCb: (code: number) => void = () => {};
	constructor(spawn: TermSpawn) {
		this.spawn = spawn;
	}
	write(data: Uint8Array): void {
		this.inputs.push(new TextDecoder().decode(data));
	}
	resize(cols: number, rows: number): void {
		this.sizes.push({ cols, rows });
	}
	signal(sig: "SIGSTOP" | "SIGCONT"): void {
		this.signals.push(sig);
	}
	kill(): void {
		this.killed = true;
	}
	onData(cb: (chunk: Uint8Array) => void): void {
		this.dataCb = cb;
	}
	onExit(cb: (code: number) => void): void {
		this.exitCb = cb;
	}
	emit(text: string): void {
		this.dataCb(new TextEncoder().encode(text));
	}
	exit(code: number): void {
		this.exitCb(code);
	}
}

export function fixtureTermExecutor() {
	const spawned: FakeTermProc[] = [];
	const executor: TermExecutor = async (spawn) => {
		const proc = new FakeTermProc(spawn);
		spawned.push(proc);
		return proc;
	};
	return { spawned, executor };
}

/**
 * The seven recorded sessions (#190), read straight from their tracked home.
 *
 * Joined off this module's own directory rather than resolved through `new URL`, because
 * a DOM test environment shims the global `URL` to resolve against the served origin and
 * `fileURLToPath` then has no file to hand back — and the rail's own tests are DOM tests
 * that read captures. Same shape the runtime's own DOM tests use.
 */
export function readCapture(name: string): readonly unknown[] {
	const file = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "captures", `${name}.json`);
	return JSON.parse(readFileSync(file, "utf8")) as readonly unknown[];
}

export const CAPTURES = [
	"claude-turn",
	"claude-plan",
	"claude-edits",
	"claude-fanout",
	"claude-mcp",
	"claude-interrupt",
	"claude-compact",
] as const;

/**
 * The `list_models` control reply, captured whole (#118, #199).
 *
 * Beside the session captures rather than in one of them, because it is not a window of
 * a session: it is one control response, taken on the same 2.1.220 the seven were. It
 * has one reader on each side of the wire and three tests asserting on it, so it is read
 * from here rather than typed out again in each — the same rule the captures are under.
 *
 * The canvas keeps its own copy under `design/shared/fixtures/`, because spool's mock
 * convention resolves fixtures under `design/` and nowhere else.
 */
export function readModelsReply(): unknown {
	const file = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "claude-models.json");
	return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

/** one message the wire streamed: what it said, and the fragments it said it in */
export interface StreamedMessage {
	readonly text: string;
	/** the length of each delta, in the order they landed */
	readonly deltas: readonly number[];
}

/**
 * Every message a capture streamed, in the order the wire opened them.
 *
 * Keyed by the message the deltas belong to and the block inside it, which is how the
 * transcript keys prose and is not optional: block indexes reset with every request, so
 * keying on the index alone glues `claude-mcp`'s eight messages into one 5,002-character
 * string nobody wrote.
 *
 * The deltas rather than the settled message, because the deltas are what a reader
 * watches arrive — and where a capture elided an assistant message, the authority that
 * lands afterwards is shorter than what was streamed.
 */
export function streamedMessages(capture: string): readonly StreamedMessage[] {
	const adapter = createClaudeAdapter();
	const blocks = new Map<string, { text: string; deltas: number[] }>();
	let id = "";
	for (const line of readCapture(capture)) {
		for (const event of adapter.read(JSON.stringify(line))) {
			// the work of every thread reaches the log; the words of only one do
			if (event.parent !== null) continue;
			if (event.kind === "speaking") id = event.message ?? "";
			if (event.kind !== "say") continue;
			const key = `${id}:${event.block}`;
			const block = blocks.get(key) ?? { text: "", deltas: [] };
			block.text += event.text;
			block.deltas.push(event.text.length);
			blocks.set(key, block);
		}
	}
	return [...blocks.values()].filter((block) => block.text.trim() !== "");
}

/** the longest message a capture streamed, which is what every claim about size is about */
export const longestStreamed = (capture: string): StreamedMessage =>
	streamedMessages(capture).reduce((most, block) => (block.text.length > most.text.length ? block : most), {
		text: "",
		deltas: [],
	});

/**
 * The agent fixture executor (#191): the injected stand-in for the developer's
 * binary. It replays a capture line by line, so CI never spawns an agent, never
 * touches a login, and never depends on a model.
 */
export class FakeAgentProc implements AgentProcess {
	inputs: string[] = [];
	ended = false;
	killed = false;
	spawn: AgentSpawn;
	/** what the fixture does when a prompt lands, the way the binary answers one */
	whenWritten: ((proc: FakeAgentProc, line: string) => void) | undefined;
	/**
	 * What the fixture does once its input closes, the way a probe that reads no stdin
	 * answers (#201).
	 *
	 * `claude auth status` is asked nothing and prints a document, so the close is the
	 * only thing that happens to it before it speaks.
	 */
	whenEnded: ((proc: FakeAgentProc) => void) | undefined;
	private lineCb: (line: string) => void = () => {};
	private exitCb: (code: number | null, message?: string) => void = () => {};
	constructor(spawn: AgentSpawn) {
		this.spawn = spawn;
	}
	write(line: string): void {
		this.inputs.push(line);
		this.whenWritten?.(this, line);
	}
	end(): void {
		this.ended = true;
		this.whenEnded?.(this);
	}
	kill(): void {
		this.killed = true;
		this.exit(null);
	}
	onLine(cb: (line: string) => void): void {
		this.lineCb = cb;
	}
	onExit(cb: (code: number | null, message?: string) => void): void {
		this.exitCb = cb;
	}
	emit(line: string): void {
		this.lineCb(line);
	}
	/** the capture, one wire line at a time, exactly as the binary would print it */
	replay(events: readonly unknown[]): void {
		for (const event of events) this.emit(JSON.stringify(event));
	}
	exit(code: number | null, message?: string): void {
		if (this.killed && code !== null) return;
		this.exitCb(code, message);
	}
}

/**
 * An executor that hands back a controllable process, and remembers every spawn
 * it was asked for — which is how a test reads the settled arguments and the
 * environment the child would have received.
 */
export function fixtureAgentExecutor(
	whenWritten?: (proc: FakeAgentProc, line: string) => void,
	whenEnded?: (proc: FakeAgentProc) => void,
) {
	const spawned: FakeAgentProc[] = [];
	const executor: AgentExecutor = async (spawn) => {
		const proc = new FakeAgentProc(spawn);
		proc.whenWritten = whenWritten;
		proc.whenEnded = whenEnded;
		spawned.push(proc);
		return proc;
	};
	return { spawned, executor };
}

/**
 * A binary answering the login probe, and nothing else (#201).
 *
 * `claude auth status --json` prints a document and exits, so the fixture answers on the
 * close: one reply for whichever spawn asked the question, and the ordinary fixture
 * behaviour for a turn's own spawn.
 */
export function loginAgentExecutor(reply: string) {
	return fixtureAgentExecutor(undefined, (proc) => {
		for (const line of reply.split("\n")) proc.emit(line);
		proc.exit(0);
	});
}

/** An executor that answers a prompt with one capture, then exits cleanly. */
export function replayAgentExecutor(capture: string) {
	return fixtureAgentExecutor((proc) => {
		proc.replay(readCapture(capture));
		proc.exit(0);
	});
}

export async function until(condition: () => boolean, ms = 8000): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > ms) throw new Error("condition never held");
		await new Promise((r) => setTimeout(r, 25));
	}
}

/** Wait for a counter to stop moving — spawns settled, watcher replays drained. */
export async function settle(read: () => number, quietMs = 300): Promise<void> {
	let last = read();
	let quietSince = Date.now();
	const start = Date.now();
	while (Date.now() - quietSince < quietMs) {
		if (Date.now() - start > 8000) return;
		await new Promise((r) => setTimeout(r, 40));
		const now = read();
		if (now !== last) {
			last = now;
			quietSince = Date.now();
		}
	}
}
