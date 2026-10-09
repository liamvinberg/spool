import type { AgentEnded, AgentEvent } from "./agent-events";

/**
 * When a turn is over, which is later than when the agent answers (#365).
 *
 * A turn ends when its engine has reported a result and no background task it started is
 * still running. The recorded Roast fan-out is the case: Claude Code reported its result at
 * 4:55 while five designers ran until 8:48, and a turn that ended on the result closed
 * stdin and took the designers with it. So an ending the agent reports while delegations
 * still run is held, and the turn reads `holding` instead; the turn ends on the first
 * ending after the last of them lands.
 *
 * Engine-agnostic: a task is what `task-started` names and `task-done` closes, and an engine
 * that reports the whole background set (`background`) is believed over both. Only agent
 * tasks count. A background shell is the agent's to leave running, and a dev server that
 * never exits would otherwise hold the turn forever.
 *
 * `settleMs` is how long a turn whose tasks have all landed waits for the agent to answer
 * them. Claude Code wakes the main agent on every notification and it answers with another
 * result, which ends the turn; the clock is for an agent that does not. Zero ends the turn
 * the moment the last task lands.
 */
export interface BackgroundHold {
	/** what to push for one event, and whether the turn is over with it */
	read(event: AgentEvent): { readonly events: readonly AgentEvent[]; readonly over: boolean };
	/** the tasks still running, which a stop ends as well */
	running(): readonly string[];
	/**
	 * A hand pressed Stop: the next ending ends the turn whatever still runs. A turn already
	 * holding is over at once, as the ending it held, now stopped.
	 */
	stop(): AgentEnded | undefined;
	/** the turn went another way: no clock is left running */
	close(): void;
}

export interface BackgroundHoldOptions {
	readonly settleMs: number;
	/** the clock ran out on a turn whose tasks had all landed: end it as this */
	readonly onSettled: (ended: AgentEnded) => void;
}

const AGENT_TYPES = /agent/i;

export function createBackgroundHold({ settleMs, onSettled }: BackgroundHoldOptions): BackgroundHold {
	const tasks = new Set<string>();
	let held: AgentEnded | undefined;
	let stopping = false;
	let clock: ReturnType<typeof setTimeout> | undefined;

	function quiet(): void {
		if (clock !== undefined) clearTimeout(clock);
		clock = undefined;
	}

	/** the last task landed while the agent was holding: give it the clock to answer */
	function drained(): { events: AgentEvent[]; over: boolean } {
		const ending = held;
		if (ending === undefined || tasks.size > 0) return { events: [], over: false };
		if (settleMs <= 0) {
			held = undefined;
			return { events: [ending], over: true };
		}
		quiet();
		clock = setTimeout(() => {
			clock = undefined;
			if (held === undefined || tasks.size > 0) return;
			held = undefined;
			onSettled(ending);
		}, settleMs);
		clock.unref?.();
		return { events: [], over: false };
	}

	return {
		read(event) {
			if (event.kind === "task-started") {
				tasks.add(event.task);
				quiet();
				return { events: [event], over: false };
			}
			if (event.kind === "task-done") {
				const had = tasks.delete(event.task);
				const after = had ? drained() : { events: [], over: false };
				return { events: [event, ...after.events], over: after.over };
			}
			if (event.kind === "background") {
				const before = tasks.size;
				tasks.clear();
				for (const one of event.tasks) {
					if (one.task !== "" && (one.type === null || AGENT_TYPES.test(one.type))) tasks.add(one.task);
				}
				const after = before > 0 && tasks.size === 0 ? drained() : { events: [], over: false };
				return { events: [event, ...after.events], over: after.over };
			}
			if (event.kind === "ended" && event.parent === null) {
				quiet();
				if (stopping || tasks.size === 0 || event.ending === "failed") {
					held = undefined;
					return { events: [event], over: true };
				}
				held = event;
				return { events: [{ kind: "holding", tasks: tasks.size, parent: null }], over: false };
			}
			return { events: [event], over: false };
		},
		running: () => [...tasks],
		stop() {
			stopping = true;
			quiet();
			const ending = held;
			held = undefined;
			return ending === undefined ? undefined : { ...ending, ending: "stopped" };
		},
		close: quiet,
	};
}
