import type { AgentEvent } from "./agent-events";
import type { AgentExecutor, AgentProcess } from "./agent-exec";
import { createPiAdapter, PI_PROMPT, PI_STATE, piCommandLine, piDeclineLine } from "./agent-pi";
import { providerRecovery } from "./agent-recovery";
import type { AgentSpawn } from "./agent-spawn";
import type { AgentTurn } from "./agent-turn";

/**
 * One pi turn: spawn the person's own `pi --mode rpc`, send what they said, and hand back
 * the union events until pi settles (#363).
 *
 * The same contract as Claude Code's runner (`agent-turn.ts`), on pi's wire. A process per
 * turn, so a thread survives a daemon restart the way a Claude thread does: the session is
 * pi's own, on pi's own disk, and the next turn names it again. What differs is the wire:
 *
 *   - commands go down with ids, so the session reference is asked for (`get_state`) before
 *     the prompt goes, and arrives as the turn's `ready`;
 *   - the end of the turn is `agent_settled`, after which stdin closes and pi exits;
 *   - Stop is pi's own `abort`, after which pi settles the turn as aborted;
 *   - nothing ever asks, because pi has no approvals. An extension's own dialog is
 *     declined where it arrives, so a turn can never hang on a question nobody sees.
 */

/** the same grace Claude's runner gives a process that has said everything (`agent-turn.ts`) */
const EXIT_GRACE_MS = 10_000;

export interface PiTurnOptions {
	readonly executor: AgentExecutor;
	readonly spawn: AgentSpawn;
	/** the one `prompt` command this turn sends */
	readonly prompt: Readonly<Record<string, unknown>>;
	/** the model the thread asked for, which a limit or login bounce offers back */
	readonly model?: string;
	/** where pi says this session lives, as soon as it says it */
	readonly onSession?: (session: { id: string; file: string }) => void;
}

export function startPiTurn({ executor, spawn, prompt, model, onSession }: PiTurnOptions): AgentTurn {
	const adapter = createPiAdapter();
	const queue: AgentEvent[] = [];
	let waiting: (() => void) | undefined;
	let finished = false;
	let stopped = false;
	let ended = false;
	let proc: AgentProcess | undefined;
	let leaving: ReturnType<typeof setTimeout> | undefined;
	/** presses that landed before the prompt went, spent once it has */
	let interrupts = 0;
	let prompted = false;
	let asked = 0;

	function push(event: AgentEvent): void {
		if (finished) return;
		queue.push(event);
		waiting?.();
		waiting = undefined;
	}

	function finish(): void {
		if (finished) return;
		finished = true;
		waiting?.();
		waiting = undefined;
	}

	function interruptFrom(target: AgentProcess): void {
		while (asked < interrupts) {
			asked += 1;
			target.write(piCommandLine({ id: `spool-abort-${asked}`, type: "abort" }));
		}
	}

	/** the turn is over: no more input is coming, and pi is left to exit on its own */
	function leave(target: AgentProcess): void {
		ended = true;
		target.end();
		leaving ??= setTimeout(() => target.kill(), EXIT_GRACE_MS);
		leaving.unref?.();
	}

	/** the answer to `get_state`, or false where the line is something else */
	function answeredState(line: string): boolean {
		if (!line.includes(PI_STATE)) return false;
		try {
			const wire = JSON.parse(line) as {
				id?: unknown;
				type?: unknown;
				data?: { sessionId?: unknown; sessionFile?: unknown };
			};
			if (wire.id !== PI_STATE || wire.type !== "response") return false;
			const { sessionId, sessionFile } = wire.data ?? {};
			if (typeof sessionId === "string" && typeof sessionFile === "string")
				onSession?.({ id: sessionId, file: sessionFile });
			return true;
		} catch {
			/* the adapter reports a line that is not JSON */
			return false;
		}
	}

	void (async () => {
		let started: AgentProcess;
		try {
			started = await executor(spawn);
		} catch (error) {
			push({
				kind: "closed",
				code: null,
				message: error instanceof Error ? error.message : String(error),
				parent: null,
			});
			finish();
			return;
		}
		proc = started;
		if (stopped) {
			started.kill();
			return;
		}
		started.onLine((line) => {
			// one command at a time: the prompt goes once pi has said which session this is,
			// so the reference is known before anything in the turn can need it
			if (!prompted && answeredState(line)) {
				prompted = true;
				started.write(piCommandLine({ id: PI_PROMPT, type: "prompt", ...prompt }));
				interruptFrom(started);
			}
			for (const event of adapter.read(line)) {
				if (event.kind === "elicit") {
					started.write(piDeclineLine(event.request));
					continue;
				}
				const recovery =
					event.kind === "ended" && event.ending === "failed"
						? providerRecovery(event.reason ?? "", "pi", model)
						: undefined;
				// the provider's own words stay in the adapter: what leaves is spool's sentence
				if (recovery && event.kind === "ended")
					push({
						...event,
						recovery,
						reason: recovery.kind === "login" ? "Sign in to pi to continue." : "pi rate limit reached.",
						stopReason: null,
					});
				else push(event);
				if (event.kind === "ended" && !ended) leave(started);
			}
		});
		started.onExit((code, message) => {
			if (leaving !== undefined) clearTimeout(leaving);
			const recovery = code === 0 || code === null ? undefined : providerRecovery(message ?? "", "pi", model);
			push({
				kind: "closed",
				code,
				...(message === undefined ? {} : { message }),
				...(recovery ? { recovery } : {}),
				parent: null,
			});
			finish();
		});
		started.write(piCommandLine({ id: PI_STATE, type: "get_state" }));
	})();

	async function* events(): AsyncGenerator<AgentEvent> {
		for (;;) {
			while (queue.length > 0) yield queue.shift() as AgentEvent;
			if (finished) return;
			await new Promise<void>((resolve) => {
				waiting = resolve;
			});
		}
	}

	return {
		events: { [Symbol.asyncIterator]: () => events() },
		// pi has no approvals, so a turn is never parked on one and there is nothing to answer
		answer: () => false,
		interrupt: () => {
			if (finished || ended) return false;
			interrupts += 1;
			if (proc !== undefined && prompted) interruptFrom(proc);
			return true;
		},
		abandon: () => {
			stopped = true;
			if (leaving !== undefined) clearTimeout(leaving);
			proc?.kill();
			finish();
		},
	};
}
