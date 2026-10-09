import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeAgentProc } from "../test-helpers";
import type { AgentEvent } from "./agent-events";
import { createEventQueue, createTurnShell, EXIT_GRACE_MS } from "./agent-turn-shell";

const SPAWN = { command: "agent", args: [], cwd: "/work", env: {} };

async function drain<T>(events: AsyncIterable<T>): Promise<T[]> {
	const seen: T[] = [];
	for await (const event of events) seen.push(event);
	return seen;
}

describe("an event queue", () => {
	it("hands events back in the order they were pushed, and ends at finish", async () => {
		const queue = createEventQueue<number>();
		const reading = drain(queue.events());
		queue.push(1);
		queue.push(2);
		await Promise.resolve();
		queue.push(3);
		queue.finish();
		queue.push(4);
		expect(await reading).toEqual([1, 2, 3]);
		expect(queue.finished).toBe(true);
	});

	it("gives a reader that comes after finish what was pushed before it", async () => {
		const queue = createEventQueue<string>();
		queue.push("a");
		queue.finish();
		expect(await drain(queue.events())).toEqual(["a"]);
	});
});

describe("a turn shell", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("closes the turn when the spawn fails", async () => {
		const shell = createTurnShell();
		const run = vi.fn();
		await shell.spawn(() => Promise.reject(new Error("spawn agent ENOENT")), run);
		expect(run).not.toHaveBeenCalled();
		expect(await drain(shell.events)).toEqual([
			{ kind: "closed", code: null, message: "spawn agent ENOENT", parent: null },
		]);
	});

	it("kills a process that arrives after the turn was given up", async () => {
		const shell = createTurnShell();
		const proc = new FakeAgentProc(SPAWN);
		let arrive: (proc: FakeAgentProc) => void = () => {};
		const run = vi.fn();
		const spawning = shell.spawn(() => new Promise((resolve) => (arrive = resolve)), run);
		shell.abandon();
		arrive(proc);
		await spawning;
		expect(proc.killed).toBe(true);
		expect(run).not.toHaveBeenCalled();
		expect(await drain(shell.events)).toEqual([]);
	});

	it("leaves an ended turn's process to exit, and kills it once the grace runs out", async () => {
		vi.useFakeTimers();
		const shell = createTurnShell();
		const proc = new FakeAgentProc(SPAWN);
		await shell.spawn(
			() => Promise.resolve(proc),
			(started) => started.onExit((code) => shell.close({ kind: "closed", code, parent: null })),
		);
		shell.leave(proc);
		expect(shell.left).toBe(true);
		expect(proc.ended).toBe(true);
		vi.advanceTimersByTime(EXIT_GRACE_MS - 1);
		expect(proc.killed).toBe(false);
		vi.advanceTimersByTime(1);
		expect(proc.killed).toBe(true);
		expect(await drain(shell.events)).toEqual([{ kind: "closed", code: null, parent: null }]);
	});

	it("cancels the grace when the process exits on its own", async () => {
		vi.useFakeTimers();
		const shell = createTurnShell();
		const proc = new FakeAgentProc(SPAWN);
		await shell.spawn(
			() => Promise.resolve(proc),
			(started) => started.onExit((code) => shell.close({ kind: "closed", code, parent: null })),
		);
		shell.leave(proc);
		proc.exit(0);
		vi.advanceTimersByTime(EXIT_GRACE_MS);
		expect(proc.killed).toBe(false);
	});

	it("kills the process at once when the turn is given up, and says nothing more", async () => {
		vi.useFakeTimers();
		const shell = createTurnShell();
		const proc = new FakeAgentProc(SPAWN);
		await shell.spawn(
			() => Promise.resolve(proc),
			() => {},
		);
		shell.push({ kind: "waiting", parent: null });
		shell.abandon();
		shell.push({ kind: "waiting", parent: null });
		expect(proc.killed).toBe(true);
		expect(shell.finished).toBe(true);
		const seen: AgentEvent[] = await drain(shell.events);
		expect(seen).toEqual([{ kind: "waiting", parent: null }]);
	});
});
