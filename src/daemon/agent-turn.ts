import { createClaudeAdapter } from "./agent-claude";
import type { AgentEvent } from "./agent-events";
import type { AgentExecutor, AgentProcess } from "./agent-exec";
import { agentPromptLine, planAgentSpawn } from "./agent-spawn";

/**
 * One turn: spawn the developer's agent, send what the human said, and hand back
 * the union events in the order they arrive (#191).
 *
 * The turn owns the process for exactly as long as the turn lasts. The result
 * event is what closes stdin, the exit is what closes the stream, and a client
 * that goes away takes the process with it — nothing outlives the thing that
 * asked for it.
 */

export interface AgentTurnOptions {
	readonly executor: AgentExecutor;
	/** the project root: the agent stands in the product root, not in design/ */
	readonly root: string;
	/** the user message's content blocks, so an image rides the same way text does */
	readonly content: readonly unknown[];
}

export interface AgentTurn {
	readonly events: AsyncIterable<AgentEvent>;
	/** abandon it: the client disconnected, or the daemon is closing */
	stop(): void;
}

export function startAgentTurn({ executor, root, content }: AgentTurnOptions): AgentTurn {
	const adapter = createClaudeAdapter();
	const queue: AgentEvent[] = [];
	let waiting: (() => void) | undefined;
	let finished = false;
	let stopped = false;
	let proc: AgentProcess | undefined;

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

	void (async () => {
		let started: AgentProcess;
		try {
			started = await executor(planAgentSpawn(root, process.env));
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
			for (const event of adapter.read(line)) {
				push(event);
				// the turn is over: no more input is coming, so stdin closes and the
				// binary is left to exit on its own rather than being killed
				if (event.kind === "ended" && event.parent === null) started.end();
			}
		});
		started.onExit((code, message) => {
			push({ kind: "closed", code, ...(message === undefined ? {} : { message }), parent: null });
			finish();
		});
		started.write(agentPromptLine(content));
	})();

	async function* events(): AsyncGenerator<AgentEvent> {
		for (;;) {
			while (queue.length > 0) {
				yield queue.shift() as AgentEvent;
			}
			if (finished) return;
			await new Promise<void>((resolve) => {
				waiting = resolve;
			});
		}
	}

	return {
		events: { [Symbol.asyncIterator]: () => events() },
		stop: () => {
			stopped = true;
			proc?.kill();
			finish();
		},
	};
}
