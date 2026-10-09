import type { AgentExecutor, AgentProcess } from "./agent-exec";
import { createPiAdapter, createPiRpc, PI_PROMPT, PI_STATE, piCommandLine, piDeclineLine } from "./agent-pi";
import { providerRecovery } from "./agent-recovery";
import type { AgentSpawn } from "./agent-spawn";
import type { AgentTurn } from "./agent-turn";
import { createTurnShell } from "./agent-turn-shell";

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
	const shell = createTurnShell();
	const { push } = shell;
	/** presses that landed before the prompt went, spent once it has */
	let interrupts = 0;
	let prompted = false;
	let asked = 0;

	function interruptFrom(target: AgentProcess): void {
		while (asked < interrupts) {
			asked += 1;
			target.write(piCommandLine({ id: `spool-abort-${asked}`, type: "abort" }));
		}
	}

	void shell.spawn(
		() => executor(spawn),
		(started) => {
			const rpc = createPiRpc(started);
			started.onLine((line) => {
				rpc.read(line);
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
					// the turn is over: no more input is coming, and pi is left to exit on its own
					if (event.kind === "ended" && !shell.left) shell.leave(started);
				}
			});
			started.onExit((code, message) => {
				rpc.close(message ?? "pi exited.");
				const recovery = code === 0 || code === null ? undefined : providerRecovery(message ?? "", "pi", model);
				shell.close({
					kind: "closed",
					code,
					...(message === undefined ? {} : { message }),
					...(recovery ? { recovery } : {}),
					parent: null,
				});
			});
			// one command at a time: the prompt goes once pi has said which session this is,
			// so the reference is known before anything in the turn can need it
			rpc.request<{ sessionId?: unknown; sessionFile?: unknown }>({ id: PI_STATE, type: "get_state" }).then(
				(state) => {
					if (shell.finished) return;
					const { sessionId, sessionFile } = state.data ?? {};
					if (typeof sessionId === "string" && typeof sessionFile === "string")
						onSession?.({ id: sessionId, file: sessionFile });
					prompted = true;
					started.write(piCommandLine({ id: PI_PROMPT, type: "prompt", ...prompt }));
					interruptFrom(started);
				},
				// gone before it answered: the exit has already closed the turn
				() => {},
			);
		},
	);

	return {
		events: shell.events,
		// pi has no approvals, so a turn is never parked on one and there is nothing to answer
		answer: () => false,
		interrupt: () => {
			if (shell.finished || shell.left) return false;
			interrupts += 1;
			if (shell.proc !== undefined && prompted) interruptFrom(shell.proc);
			return true;
		},
		abandon: () => shell.abandon(),
	};
}
