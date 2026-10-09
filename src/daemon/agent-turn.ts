import { createBackgroundHold } from "./agent-background";
import { createClaudeAdapter } from "./agent-claude";
import {
	type AgentReply,
	answerFits,
	answerPayload,
	controlResponseLine,
	DECLINED,
	interruptRequestLine,
	stopTaskRequestLine,
	wordsOf,
} from "./agent-control";
import type { AgentPermissions } from "./agent-defaults";
import type { AgentAsking, AgentEnded, AgentEvent, AgentLimit, AgentRecovery } from "./agent-events";
import type { AgentExecutor, AgentProcess } from "./agent-exec";
import { providerRecovery } from "./agent-recovery";
import { type AgentAsk, type AgentSession, agentPromptLine, planAgentSpawn } from "./agent-spawn";
import { createTurnShell } from "./agent-turn-shell";

/**
 * One turn: spawn the developer's agent, send what the human said, and hand back
 * the union events in the order they arrive (#191, #197).
 *
 * The turn owns the process for exactly as long as the turn lasts, and the turn is the
 * daemon's rather than the request's (#211). The result event is what closes stdin and
 * the exit is what closes the stream; a client that goes away is a reader that stopped
 * reading, and the process does not notice. What ends a turn is a hand on the stop, the
 * thread being talked to again, or the daemon closing — `agent-live.ts` is where the turn
 * is held and where that contract is argued.
 *
 * It is not one-way. The binary asks before it runs what the fence has not made
 * quiet, and the agent asks when it has a question of its own, both down the same
 * request — so the turn holds what is waiting and writes the answer back up stdin.
 * Nothing here runs a clock on the work in either direction: a request waits until
 * somebody answers it, for as long as that takes, and spool never answers one itself.
 * The one clock is the shell's exit grace (`agent-turn-shell.ts`), and it starts only once
 * the turn is already over.
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
	/** the fence this project has on this machine (#281); absent is the fence as built */
	readonly permissions?: AgentPermissions;
	/** An earlier attempt already completed tools in this pending request. */
	readonly continuing?: boolean;
	/** spool's designer, as the `--agents` file in spool's state (#367) */
	readonly designer?: string;
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
	 * Give the turn up: the thread is being talked to again, or the daemon is closing.
	 *
	 * The blunt one, and not the domain's Stop. Nobody asked for this and nobody is
	 * reading the answer, so the process is killed rather than asked, and no clean result
	 * is waited for. `interrupt` above is what a hand pressing stop does.
	 */
	abandon(): void;
}

export function startAgentTurn({
	executor,
	root,
	content,
	session,
	ask,
	permissions,
	continuing,
	designer,
}: AgentTurnOptions): AgentTurn {
	const adapter = createClaudeAdapter();
	const shell = createTurnShell();
	const { push } = shell;
	let completed = continuing === true;
	let limit: AgentLimit | undefined;
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
	/**
	 * The turn lasts until its background designers land, not until the agent answers
	 * (#365): an ending the agent reports while they run is held, and the turn reads
	 * `holding` until the agent answers the last of them landing, which Claude Code wakes
	 * it to do.
	 */
	const background = createBackgroundHold({ wakes: true });
	let stopTasks = 0;

	/** the turn is over: no more input is coming, so stdin closes and the binary is left to exit */
	function over(target: AgentProcess): void {
		// a request the turn ended under is a request nobody can answer now, and a
		// stale one would take an answer meant for the next turn
		asking.clear();
		shell.leave(target);
	}

	/** a stop ends the background designers too, each by the binary's own `stop_task` */
	function stopBackground(target: AgentProcess): void {
		for (const task of background.running()) {
			stopTasks += 1;
			target.write(stopTaskRequestLine(`spool-stop-task-${stopTasks}`, task));
		}
	}

	/** every press not yet down the wire, in one place so the spawn and the door agree */
	function interruptFrom(target: AgentProcess): void {
		while (asked < interrupts) {
			asked += 1;
			target.write(interruptRequestLine(`spool-interrupt-${asked}`));
		}
		if (interrupts > 0) {
			stopBackground(target);
			const held = background.stop();
			if (held !== undefined) {
				push(held);
				over(target);
			}
		}
	}

	function recoveryFor(words: string): AgentRecovery | undefined {
		const recovery =
			providerRecovery(words, "Claude Code", ask?.value) ??
			(limit?.status === "rejected"
				? {
						kind: "limit" as const,
						account: "Claude Code",
						scope: "unknown" as const,
						...(ask?.value ? { offer: ask.value } : {}),
					}
				: undefined);
		if (!recovery) return undefined;
		const scope =
			recovery.kind === "limit" && limit?.window
				? ["seven_day_opus", "seven_day_sonnet", "seven_day_overage_included"].includes(limit.window)
					? "model"
					: ["five_hour", "seven_day", "overage"].includes(limit.window)
						? "account"
						: recovery.scope
				: recovery.scope;
		return {
			...recovery,
			scope,
			token: completed ? "claude-continue" : "claude-retry",
			...(recovery.kind === "limit" && limit?.resetsAt ? { resetsAt: limit.resetsAt } : {}),
		};
	}

	void shell.spawn(
		() => executor(planAgentSpawn(root, process.env, session, ask, permissions, designer)),
		(started) => {
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
					if (event.kind === "result" && !event.nonExecution) completed = true;
					if (event.kind === "limit") limit = event.limit;
					const recovery =
						event.kind === "ended" && event.ending === "failed" ? recoveryFor(event.reason ?? "") : undefined;
					const read: AgentEvent =
						recovery && event.kind === "ended"
							? ({
									...event,
									recovery,
									reason:
										recovery.kind === "login"
											? "Sign in to Claude Code to continue."
											: "Claude Code rate limit reached.",
									stopReason: null,
								} satisfies AgentEnded)
							: event;
					const { events, over: done } = background.read(read);
					for (const one of events) push(one);
					// the turn is over: no more input is coming, so stdin closes and the
					// binary is left to exit on its own rather than being killed
					if (done) over(started);
				}
			});
			started.onExit((code, message) => {
				asking.clear();
				const recovery = code === 0 ? undefined : recoveryFor(message ?? "");
				shell.close({
					kind: "closed",
					code,
					...(message === undefined ? {} : { message }),
					parent: null,
					...(recovery
						? {
								recovery,
								message:
									recovery.kind === "login"
										? "Sign in to Claude Code to continue."
										: "Claude Code rate limit reached.",
							}
						: {}),
				});
			});
			started.write(agentPromptLine(content));
			// a press that landed while this was spawning is spent here, in the order the
			// hands made it and behind the prompt it is stopping
			interruptFrom(started);
		},
	);

	function answer(request: string, reply: AgentReply): boolean {
		const held = asking.get(request);
		const proc = shell.proc;
		// an answer in the wrong vocabulary is refused rather than translated: the
		// channel is shared and the two things riding it take different answers
		if (held === undefined || proc === undefined || !answerFits(held, reply)) return false;
		asking.delete(request);
		proc.write(controlResponseLine(request, answerPayload(held, reply)));
		// the log's only trace of the answer, because it went up stdin rather than
		// down the stream the transcript is folded from
		push({ kind: "answered", request, answer: reply.kind, words: wordsOf(reply), parent: held.parent });
		return true;
	}

	return {
		events: shell.events,
		answer,
		interrupt: () => {
			// a turn that is over is nothing to stop, and a turn given up is over — `abandon`
			// finishes it. One still spawning is not, so the press is taken now and spent
			// when there is somewhere to spend it
			if (shell.finished) return false;
			interrupts += 1;
			if (shell.proc !== undefined) interruptFrom(shell.proc);
			// nothing is pushed and nothing is cleared: the binary answers the request, ends
			// the turn on its own terms and exits, and the stream says all three. A request
			// still parked when the press lands is one the binary's own abort resolves —
			// spool inventing an answer for it here would be spool answering a question
			return true;
		},
		abandon: () => {
			asking.clear();
			shell.abandon();
		},
	};
}
