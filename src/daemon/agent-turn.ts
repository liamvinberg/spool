import { createClaudeAdapter } from "./agent-claude";
import {
	type AgentReply,
	answerFits,
	answerPayload,
	controlResponseLine,
	DECLINED,
	interruptRequestLine,
	wordsOf,
} from "./agent-control";
import type { AgentAsking, AgentEvent } from "./agent-events";
import type { AgentExecutor, AgentProcess } from "./agent-exec";
import { type AgentAsk, type AgentSession, agentPromptLine, planAgentSpawn } from "./agent-spawn";

/**
 * One turn: spawn the developer's agent, send what the human said, and hand back
 * the union events in the order they arrive (#191, #197).
 *
 * The turn owns the process for exactly as long as the turn lasts. The result
 * event is what closes stdin, the exit is what closes the stream, and a client
 * that goes away takes the process with it — nothing outlives the thing that
 * asked for it.
 *
 * It is not one-way. The binary asks before it runs what the fence has not made
 * quiet, and the agent asks when it has a question of its own, both down the same
 * request — so the turn holds what is waiting and writes the answer back up stdin.
 * Nothing here runs a clock in either direction: a request waits until somebody
 * answers it, for as long as that takes, and spool never answers one itself.
 */

export interface AgentTurnOptions {
	readonly executor: AgentExecutor;
	/** the project root: the agent stands in the product root, not in design/ */
	readonly root: string;
	/** the user message's content blocks, so an image rides the same way text does */
	readonly content: readonly unknown[];
	/** the thread this turn continues, which is the binary's session id (#120, #200) */
	readonly session: AgentSession;
	/** which machine the thread chose, and how hard it should think (#199) */
	readonly ask?: AgentAsk;
}

export interface AgentTurn {
	readonly events: AsyncIterable<AgentEvent>;
	/**
	 * Answer a request this turn is parked on, and say whether it was this turn's to
	 * answer (#121, #145).
	 *
	 * False rather than a throw, because the caller is routing: a project can hold
	 * more than one turn and only one of them is holding any given request. It is
	 * also what makes answering the same request twice a no-op instead of a second
	 * line down a stdin the binary is no longer listening on for it.
	 */
	answer(request: string, reply: AgentReply): boolean;
	/**
	 * Stop the turn the hands no longer want, which is spool's Stop (#165).
	 *
	 * Not a kill and not `abandon` below. It is a control request going up the same stdin
	 * the prompt went down, so the binary survives it: it stops what it is doing, hands
	 * the call it caught a synthetic rejection, and emits a clean result saying it was
	 * aborted. The turn then ends the way every turn ends, which is why nothing here has
	 * to teach the stream a second way to finish.
	 *
	 * True as long as there is a turn to stop, spawning included: a press that lands
	 * before the process exists is held and spent when it does. False only once the turn
	 * is over, which is the same fact the caller reports as nothing to stop.
	 */
	interrupt(): boolean;
	/**
	 * Give the turn up: the client disconnected, or the daemon is closing.
	 *
	 * The blunt one, and not the domain's Stop. Nobody asked for this and nobody is
	 * reading the answer, so the process is killed rather than asked, and no clean result
	 * is waited for. `interrupt` above is what a hand pressing stop does.
	 */
	abandon(): void;
}

export function startAgentTurn({ executor, root, content, session, ask }: AgentTurnOptions): AgentTurn {
	const adapter = createClaudeAdapter();
	const queue: AgentEvent[] = [];
	let waiting: (() => void) | undefined;
	let finished = false;
	let stopped = false;
	let proc: AgentProcess | undefined;
	/**
	 * The requests nobody has answered yet, by the id an answer names.
	 *
	 * Held whole rather than as a set of ids, because an answer is built out of the
	 * request: a picked option and a typed sentence both rebuild the call's own
	 * arguments around themselves, and an always hands back the rules the request
	 * suggested for itself.
	 */
	const asking = new Map<string, AgentAsking>();
	/**
	 * The presses this turn owes the binary, so a stop cannot land in the gap before
	 * there is a process to ask.
	 *
	 * The spawn is awaited, so the turn exists and reports itself as running for as long
	 * as that takes — and the rail's press is live from the same instant, because the
	 * composer draws the stop off its own phase rather than off the wire. A press in that
	 * window used to be turned away as *no turn to stop*, which is the one refusal that
	 * is not true: the turn is starting. So the press is remembered and spent the moment
	 * the process is up, which is the same promise `abandon`'s own flag already makes for
	 * a client that goes away mid-spawn.
	 *
	 * It is a count rather than a flag so a second press is a second request rather than
	 * one the binary has already answered.
	 */
	let interrupts = 0;
	let asked = 0;

	/** every press not yet down the wire, in one place so the spawn and the door agree */
	function interruptFrom(target: AgentProcess): void {
		while (asked < interrupts) {
			asked += 1;
			target.write(interruptRequestLine(`spool-interrupt-${asked}`));
		}
	}

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
			started = await executor(planAgentSpawn(root, process.env, session, ask));
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
				// a connector's own question never reaches anybody: it is declined where it
				// arrives, on the protocol's own word for it, and the log says nothing
				// because nothing was asked of the person
				if (event.kind === "elicit") {
					started.write(controlResponseLine(event.request, DECLINED));
					continue;
				}
				// the turn is parked from here until somebody answers. Nothing is scheduled
				// and nothing expires: the binary's own away-from-keyboard timeout would
				// submit whatever was already picked, and spool submits nothing at all
				if (event.kind === "asking") asking.set(event.request, event);
				push(event);
				// the turn is over: no more input is coming, so stdin closes and the
				// binary is left to exit on its own rather than being killed
				if (event.kind === "ended" && event.parent === null) {
					// a request the turn ended under is a request nobody can answer now, and a
					// stale one would take an answer meant for the next turn
					asking.clear();
					started.end();
				}
			}
		});
		started.onExit((code, message) => {
			asking.clear();
			push({ kind: "closed", code, ...(message === undefined ? {} : { message }), parent: null });
			finish();
		});
		started.write(agentPromptLine(content));
		// a press that landed while this was spawning is spent here, in the order the
		// hands made it and behind the prompt it is stopping
		interruptFrom(started);
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
		answer: (request, reply) => {
			const held = asking.get(request);
			// an answer in the wrong vocabulary is refused rather than translated: the
			// channel is shared and the two things riding it take different answers
			if (held === undefined || proc === undefined || !answerFits(held, reply)) return false;
			asking.delete(request);
			proc.write(controlResponseLine(request, answerPayload(held, reply)));
			// the log's only trace of the answer, because it went up stdin rather than
			// down the stream the transcript is folded from
			push({ kind: "answered", request, answer: reply.kind, words: wordsOf(reply), parent: held.parent });
			return true;
		},
		interrupt: () => {
			// a turn that is over is nothing to stop, and a turn given up is over — `abandon`
			// finishes it. One still spawning is not, so the press is taken now and spent
			// when there is somewhere to spend it
			if (finished) return false;
			interrupts += 1;
			if (proc !== undefined) interruptFrom(proc);
			// nothing is pushed and nothing is cleared: the binary answers the request, ends
			// the turn on its own terms and exits, and the stream says all three. A request
			// still parked when the press lands is one the binary's own abort resolves —
			// spool inventing an answer for it here would be spool answering a question
			return true;
		},
		abandon: () => {
			stopped = true;
			asking.clear();
			proc?.kill();
			finish();
		},
	};
}
