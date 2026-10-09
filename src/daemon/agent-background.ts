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
 * What happens once the last task lands depends on the engine, and no clock decides it.
 * Claude Code wakes the main agent on every task notification and it answers with another
 * result (`claude-background.json`: each `task_notification` is followed by `init`,
 * `requesting` and a fresh `result`), so a held turn waits for that answer and ends on it.
 * Codex does not wake the main thread for a child that finished in the background, so
 * nothing more is coming and the held ending is let go the moment the last child lands.
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
}

export interface BackgroundHoldOptions {
	/**
	 * The engine wakes its agent when a task lands, so the agent's own next answer is what
	 * ends a turn whose tasks have all landed. Without it the turn ends as they land.
	 */
	readonly wakes: boolean;
}

const AGENT_TYPES = /agent/i;

/** a task holds the turn when it is an agent's: unnamed is an agent, as the engines without the word only run agents */
function holds(type: string | null | undefined): boolean {
	return type === undefined || type === null || AGENT_TYPES.test(type);
}

export function createBackgroundHold({ wakes }: BackgroundHoldOptions): BackgroundHold {
	const tasks = new Set<string>();
	let held: AgentEnded | undefined;
	let stopping = false;

	/** the last task landed while the agent was holding: an agent woken by it says the last word */
	function drained(): { events: AgentEvent[]; over: boolean } {
		const ending = held;
		if (ending === undefined || tasks.size > 0 || wakes) return { events: [], over: false };
		held = undefined;
		return { events: [ending], over: true };
	}

	return {
		read(event) {
			if (event.kind === "task-started") {
				if (!holds(event.type)) return { events: [event], over: false };
				tasks.add(event.task);
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
					if (one.task !== "" && holds(one.type)) tasks.add(one.task);
				}
				const after = before > 0 && tasks.size === 0 ? drained() : { events: [], over: false };
				return { events: [event, ...after.events], over: after.over };
			}
			if (event.kind === "ended" && event.parent === null) {
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
			const ending = held;
			held = undefined;
			return ending === undefined ? undefined : { ...ending, ending: "stopped" };
		},
	};
}
