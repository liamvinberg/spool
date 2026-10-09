import type { AgentClosed, AgentEvent } from "./agent-events";
import type { AgentProcess } from "./agent-exec";

/**
 * How long a binary that has already said everything gets to exit on its own.
 *
 * Nothing here runs a clock on the *turn*: a turn is as long as the work is, and one
 * parked on a question waits for as long as the person does. This clock starts after the
 * turn is over, on the ending the binary itself reported, and it is about one thing only
 * — a process that has nothing left to do and has not gone. Ten seconds is longer than
 * any tidy-up and shorter than a person's patience.
 *
 * It is not tidiness. The thread's next message is refused while a turn is running in it,
 * and running is what the process being up means, so a binary that never exits takes the
 * conversation with it until the daemon is restarted.
 */
export const EXIT_GRACE_MS = 10_000;

/**
 * Events in the order they were pushed, read as an async iterable until `finish`.
 *
 * A push after `finish` is dropped: once a turn is over, nothing more is said in it.
 */
export interface EventFeed<T> {
	push(event: T): void;
	finish(): void;
	readonly finished: boolean;
	events(): AsyncGenerator<T>;
}

export function createEventFeed<T>(): EventFeed<T> {
	const pending: T[] = [];
	let waiting: (() => void) | undefined;
	let finished = false;
	return {
		push(event) {
			if (finished) return;
			pending.push(event);
			waiting?.();
			waiting = undefined;
		},
		finish() {
			if (finished) return;
			finished = true;
			waiting?.();
			waiting = undefined;
		},
		get finished() {
			return finished;
		},
		async *events() {
			for (;;) {
				while (pending.length > 0) yield pending.shift() as T;
				if (finished) return;
				await new Promise<void>((resolve) => {
					waiting = resolve;
				});
			}
		},
	};
}

/**
 * What every engine's turn runner shares around its own wire: the event feed, the
 * process once it is up, the grace an ended turn's process gets to exit, and giving the
 * turn up. Each runner keeps only what its binary says and how it is answered.
 */
export interface TurnShell {
	readonly events: AsyncIterable<AgentEvent>;
	push(event: AgentEvent): void;
	readonly finished: boolean;
	/** the process, once it is up */
	readonly proc: AgentProcess | undefined;
	/** the turn was left: stdin is closed and the grace is running */
	readonly left: boolean;
	/**
	 * Spawn the process and hand it to `run`, in the same tick it arrives, so nothing can
	 * land between the process being up and the runner listening to it. A spawn that fails
	 * closes the turn; a turn given up while it spawned has its process killed the moment
	 * it arrives, and `run` is never called.
	 */
	spawn(start: () => Promise<AgentProcess>, run: (started: AgentProcess) => void | Promise<void>): Promise<void>;
	/**
	 * The turn is over: no more input is coming, so stdin closes and the binary is left to
	 * exit on its own — and not forever, because a binary still up long after its own
	 * ending holds the thread against its next message. The grace runs out and the process
	 * is taken. The timer is nothing to keep a daemon alive for.
	 */
	leave(target: AgentProcess): void;
	/** the process exited: the grace is cancelled and the turn closes on this event */
	close(event: AgentClosed): void;
	/** give the turn up: the process is killed rather than asked, and nothing more is said */
	abandon(): void;
}

export function createTurnShell(): TurnShell {
	const feed = createEventFeed<AgentEvent>();
	let proc: AgentProcess | undefined;
	let stopped = false;
	let left = false;
	let leaving: ReturnType<typeof setTimeout> | undefined;
	return {
		events: { [Symbol.asyncIterator]: () => feed.events() },
		push: feed.push,
		get finished() {
			return feed.finished;
		},
		get proc() {
			return proc;
		},
		get left() {
			return left;
		},
		async spawn(start, run) {
			let started: AgentProcess;
			try {
				started = await start();
			} catch (error) {
				feed.push({
					kind: "closed",
					code: null,
					message: error instanceof Error ? error.message : String(error),
					parent: null,
				});
				feed.finish();
				return;
			}
			proc = started;
			if (stopped) {
				started.kill();
				return;
			}
			await run(started);
		},
		leave(target) {
			left = true;
			target.end();
			leaving ??= setTimeout(() => target.kill(), EXIT_GRACE_MS);
			leaving.unref?.();
		},
		close(event) {
			if (leaving !== undefined) clearTimeout(leaving);
			feed.push(event);
			feed.finish();
		},
		abandon() {
			stopped = true;
			if (leaving !== undefined) clearTimeout(leaving);
			proc?.kill();
			feed.finish();
		},
	};
}
