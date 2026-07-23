import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { onTestFinished } from "vitest";
import { createDaemonApp } from "./daemon/app";
import { serveDaemon } from "./daemon/server";
import type { TermExecutor, TermProcess, TermSpawn } from "./daemon/term-exec";
import { initProject } from "./init";
import { canvasJson } from "./templates";

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

/** A frame on a named page (#39): one level down, identity still the leaf name. */
export function writePageFrame(root: string, page: string, name: string, tsx: string): void {
	writeDesignFile(root, join("frames", page, name, "frame.tsx"), tsx);
}

/** A daemon app on a given ~/.spool dir, closed with the test. */
export function makeApp(spoolDir: string, options?: Partial<Parameters<typeof createDaemonApp>[0]>) {
	const daemon = createDaemonApp({ spoolDir, version: "0.0.0-test", ...options });
	onTestFinished(() => daemon.close());
	return daemon.app;
}

/** A registered project behind a really-served daemon on an ephemeral port. */
export async function serveProject(options?: Partial<Parameters<typeof serveDaemon>[0]>) {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0, ...options });
	onTestFinished(() => daemon.close());
	return { spoolDir, root, name, url: daemon.url };
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

	return { next, drain, expectQuiet };
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

/** A terminal-bridge WebSocket client: binary frames collected as text, JSON
 * control frames parsed — the browser runtime's view of a session. */
export function termWsClient(url: string) {
	const socket = new WebSocket(url);
	socket.binaryType = "arraybuffer";
	const binary: string[] = [];
	const controls: { t: string; [key: string]: unknown }[] = [];
	socket.addEventListener("message", (event) => {
		if (typeof event.data === "string") controls.push(JSON.parse(event.data));
		else binary.push(new TextDecoder().decode(new Uint8Array(event.data as ArrayBuffer)));
	});
	const open = new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => resolve());
		socket.addEventListener("error", () => reject(new Error("terminal socket refused")));
	});
	return { socket, binary, controls, open, streamed: () => binary.join("") };
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
