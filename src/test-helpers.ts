import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { onTestFinished } from "vitest";
import { createDaemonApp } from "./daemon/app";
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

/** A daemon app on a given ~/.spool dir, closed with the test. */
export function makeApp(spoolDir: string, options?: Partial<Parameters<typeof createDaemonApp>[0]>) {
	const daemon = createDaemonApp({ spoolDir, version: "0.0.0-test", ...options });
	onTestFinished(() => daemon.close());
	return daemon.app;
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
