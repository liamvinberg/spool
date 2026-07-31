import type { AgentReply } from "./agent-control";
import type { AgentEvent } from "./agent-events";
import type { AgentTurn } from "./agent-turn";

/**
 * A turn that outlives the request that started it (#211).
 *
 * #191 gave the turn one owner and it was the wrong one: the process lived for exactly
 * as long as the POST whose response streamed it, so a refresh, a closed lid or two
 * seconds of dropped wifi killed the binary mid-edit. The conversation survived — the
 * thread id is the binary's own session id and the next message resumes it — but the
 * work in flight did not, and neither did the queue that was waiting on it.
 *
 * So the turn is held here and the stream is only a view of it. A viewer arrives, reads
 * the log from wherever it left off, follows what comes next, and leaves without the
 * process noticing. What kills a turn is a hand on the stop or the daemon closing, and
 * nothing else.
 *
 * **The log is kept whole and replayed from the top by default.** It is the same
 * decision #120 made about the picture, one layer down: the rail folds the event union
 * into a transcript and that fold is pure, so handing back every event a turn has
 * produced rebuilds exactly what was on screen — no second fold down here, and no
 * vocabulary to keep in step. What it costs is one turn's events in memory, which is
 * the same bytes the client was already holding.
 *
 * **An ended turn is kept for a while.** A turn that finished while nobody was watching
 * has an ending nobody has read, and the alternative is the rail inventing one: a stored
 * picture that says `running` with no live turn under it reads as cut, which is a lie
 * about a turn that finished cleanly. So the log stays reachable for a grace window
 * after the process is gone.
 */

/** one event and the id a viewer resumes after, which is its index in the log */
export interface AgentLogged {
	readonly id: number;
	readonly event: AgentEvent;
}

/** a viewer's own read of the log, which it can give up without the turn ending */
export interface AgentView extends AsyncIterable<AgentLogged> {
	/** stop this read where it stands — the client went away, and the turn has not */
	close(): void;
}

export interface AgentHeld {
	readonly root: string;
	readonly thread: string;
	/** what the rail calls this turn, which is the address its stop names (#165) */
	readonly id: string | undefined;
	/** the process is still up: a held turn outlives it by the grace window */
	readonly running: boolean;
	/** how much has arrived, which is what a fresh viewer is told it is replaying */
	readonly logged: number;
	answer(request: string, reply: AgentReply): boolean;
	interrupt(): boolean;
	/** the blunt one: the daemon is closing, or this thread is being talked to again */
	abandon(): void;
	/** read from `from` onward — what is already logged, and then what arrives */
	watch(from: number): AgentView;
}

export interface AgentHoldOptions {
	readonly root: string;
	readonly thread: string;
	readonly id?: string | undefined;
	readonly turn: AgentTurn;
	/** the process is gone: the caller starts its own grace window from here */
	readonly onEnded?: (() => void) | undefined;
}

/**
 * Hold one turn, and drain it whether or not anybody is reading.
 *
 * The drain is the whole point. #191 pulled events out of the turn inside the SSE
 * handler, so a turn with no viewer was a turn nobody was pulling — which is why the
 * process had to die with the request. Here the drain is the turn's own, started the
 * moment it is held, and a viewer is a second reader of what it wrote down.
 */
export function holdAgentTurn({ root, thread, id, turn, onEnded }: AgentHoldOptions): AgentHeld {
	const log: AgentEvent[] = [];
	let running = true;
	/** every viewer parked on the tail, woken together whenever the tail moves */
	const waiting = new Set<() => void>();

	function wake(): void {
		for (const resolve of waiting) resolve();
		waiting.clear();
	}

	function stop(): void {
		if (!running) return;
		running = false;
		wake();
		onEnded?.();
	}

	void (async () => {
		for await (const event of turn.events) {
			log.push(event);
			wake();
		}
		stop();
	})();

	function watch(from: number): AgentView {
		let closed = false;
		let next = Math.max(0, Math.min(from, log.length));
		const view: AgentView = {
			close: () => {
				closed = true;
				wake();
			},
			async *[Symbol.asyncIterator]() {
				for (;;) {
					while (next < log.length) {
						if (closed) return;
						const event = log[next];
						// the log only ever grows, so an index inside its length is always there —
						// the guard is for the type rather than for a case
						if (event === undefined) return;
						yield { id: next, event };
						next += 1;
					}
					// the tail is caught up: a turn that is over has nothing more to say, and one
					// that is not parks this viewer until it does
					if (closed || !running) return;
					await new Promise<void>((resolve) => waiting.add(resolve));
				}
			},
		};
		return view;
	}

	return {
		root,
		thread,
		id,
		get running() {
			return running;
		},
		get logged() {
			return log.length;
		},
		answer: (request, reply) => turn.answer(request, reply),
		interrupt: () => turn.interrupt(),
		abandon: () => {
			turn.abandon();
			stop();
		},
		watch,
	};
}

/** how long an ended turn stays readable, so a client that was away reads its ending */
const KEPT_MS = 5 * 60_000;

export interface AgentTurns {
	get(root: string, thread: string): AgentHeld | undefined;
	hold(options: Omit<AgentHoldOptions, "onEnded">): AgentHeld;
	/** the turns of one project, for the doors addressed by something other than a thread */
	of(root: string): Iterable<AgentHeld>;
	/** every thread this daemon can still show a turn for, live or lately ended */
	threads(root: string): Set<string>;
	close(): void;
}

/**
 * Every turn this daemon is holding, by the conversation it belongs to (#211).
 *
 * Keyed by thread rather than by turn, because a thread is a conversation and a
 * conversation has one turn running in it: that is what lets a reconnecting rail ask for
 * *the turn in this thread* without having to remember what the turn it lost was called.
 *
 * A held turn is dropped when its grace window closes, when the thread is talked to
 * again, or when the daemon shuts down.
 */
export function createAgentTurns(keptMs = KEPT_MS): AgentTurns {
	const held = new Map<string, AgentHeld>();
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	const keyOf = (root: string, thread: string) => `${root} ${thread}`;

	function drop(key: string): void {
		const timer = timers.get(key);
		if (timer !== undefined) clearTimeout(timer);
		timers.delete(key);
		// out of the map before it is abandoned, so the ending its own abandon reports finds
		// nothing to start a grace window for: a timer set from here would outlive the entry
		// and come due against whatever the thread was holding by then
		const going = held.get(key);
		held.delete(key);
		going?.abandon();
	}

	function keep(key: string): void {
		const timer = setTimeout(() => drop(key), keptMs);
		// a grace window is not a reason to keep the process alive: a daemon with nothing
		// left to do exits, and the log goes with it
		timer.unref();
		timers.set(key, timer);
	}

	function* of(root: string): Iterable<AgentHeld> {
		for (const one of held.values()) if (one.root === root) yield one;
	}

	return {
		get: (root, thread) => held.get(keyOf(root, thread)),
		/*
		 * Take a turn, replacing whatever this thread was holding.
		 *
		 * A running one is never replaced silently — the door refuses a second turn in a
		 * thread that already has one — so what this drops is only ever an ended turn still
		 * inside its grace window, and a thread being talked to again is the end of anybody's
		 * interest in the turn before it.
		 */
		hold: (options) => {
			const key = keyOf(options.root, options.thread);
			drop(key);
			const taken: AgentHeld = holdAgentTurn({
				...options,
				onEnded: () => {
					if (held.get(key) === taken) keep(key);
				},
			});
			held.set(key, taken);
			return taken;
		},
		of,
		threads: (root) => {
			const live = new Set<string>();
			for (const one of of(root)) live.add(one.thread);
			return live;
		},
		close: () => {
			for (const key of [...held.keys()]) drop(key);
		},
	};
}
