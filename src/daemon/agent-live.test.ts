import { describe, expect, it } from "vitest";
import { until } from "../test-helpers";
import type { AgentEvent } from "./agent-events";
import { type AgentHeld, createAgentTurns, holdAgentTurn } from "./agent-live";
import type { AgentTurn } from "./agent-turn";

/**
 * A turn nobody is watching, and a turn two people are (#211).
 *
 * The turn is stubbed rather than spawned, because what is under test is the holding: the
 * log accumulating with no reader, a viewer leaving without the turn noticing, and a
 * second viewer rebuilding what the first one saw.
 */

function fakeTurn() {
	const queue: AgentEvent[] = [];
	let waiting: (() => void) | undefined;
	let finished = false;
	let abandoned = false;
	let interrupts = 0;

	const push = (event: AgentEvent) => {
		queue.push(event);
		waiting?.();
		waiting = undefined;
	};

	const finish = () => {
		finished = true;
		waiting?.();
		waiting = undefined;
	};

	async function* events(): AsyncGenerator<AgentEvent> {
		for (;;) {
			while (queue.length > 0) yield queue.shift() as AgentEvent;
			if (finished) return;
			await new Promise<void>((resolve) => {
				waiting = resolve;
			});
		}
	}

	const turn: AgentTurn = {
		events: { [Symbol.asyncIterator]: () => events() },
		answer: () => true,
		interrupt: () => {
			interrupts += 1;
			return true;
		},
		abandon: () => {
			abandoned = true;
			finish();
		},
	};
	return {
		turn,
		push,
		finish,
		says: (text: string): AgentEvent => ({ kind: "say", block: 0, text, parent: null }),
		get abandoned() {
			return abandoned;
		},
		get interrupts() {
			return interrupts;
		},
	};
}

/** everything a viewer sees, read to the end of what is there rather than to the end of time */
async function read(held: AgentHeld, from = 0): Promise<AgentEvent[]> {
	const seen: AgentEvent[] = [];
	const view = held.watch(from);
	const done = (async () => {
		for await (const one of view) seen.push(one.event);
	})();
	await until(() => seen.length >= held.logged - from);
	view.close();
	await done;
	return seen;
}

describe("holding a turn", () => {
	it("drains the process with nobody reading, and hands the whole log to whoever arrives", async () => {
		const fake = fakeTurn();
		const held = holdAgentTurn({ root: "/p", thread: "t", id: "turn-1", turn: fake.turn });

		// the drain is the turn's own: these land in the log with no viewer in sight, which
		// is the whole of what #211 changed about who owns a turn
		fake.push(fake.says("one"));
		fake.push(fake.says("two"));
		await until(() => held.logged === 2);

		expect(await read(held)).toEqual([fake.says("one"), fake.says("two")]);
		expect(fake.abandoned).toBe(false);
	});

	it("lets a viewer go without the turn going with it", async () => {
		const fake = fakeTurn();
		const held = holdAgentTurn({ root: "/p", thread: "t", turn: fake.turn });
		fake.push(fake.says("one"));

		const view = held.watch(0);
		const seen: AgentEvent[] = [];
		const reading = (async () => {
			for await (const one of view) seen.push(one.event);
		})();
		await until(() => seen.length === 1);
		// the refresh: this reader is gone and the process is not
		view.close();
		await reading;

		expect(held.running).toBe(true);
		expect(fake.abandoned).toBe(false);

		// and the turn goes on writing into a log the next viewer will read
		fake.push(fake.says("two"));
		await until(() => held.logged === 2);
		expect(await read(held)).toEqual([fake.says("one"), fake.says("two")]);
	});

	it("reads from where a viewer left off, and follows what arrives after", async () => {
		const fake = fakeTurn();
		const held = holdAgentTurn({ root: "/p", thread: "t", turn: fake.turn });
		fake.push(fake.says("one"));
		fake.push(fake.says("two"));
		await until(() => held.logged === 2);

		const view = held.watch(2);
		const seen: AgentEvent[] = [];
		const reading = (async () => {
			for await (const one of view) seen.push(one.event);
		})();
		// nothing it already had, and everything after it
		fake.push(fake.says("three"));
		await until(() => seen.length === 1);
		expect(seen).toEqual([fake.says("three")]);

		view.close();
		await reading;
	});

	it("feeds two viewers of the same turn at once, each from its own place", async () => {
		const fake = fakeTurn();
		const held = holdAgentTurn({ root: "/p", thread: "t", turn: fake.turn });
		fake.push(fake.says("one"));
		await until(() => held.logged === 1);

		const [whole, tail] = await Promise.all([
			(async () => {
				const first = held.watch(0);
				const seen: AgentEvent[] = [];
				const reading = (async () => {
					for await (const one of first) seen.push(one.event);
				})();
				await until(() => seen.length === 2);
				first.close();
				await reading;
				return seen;
			})(),
			(async () => {
				const second = held.watch(1);
				const seen: AgentEvent[] = [];
				const reading = (async () => {
					for await (const one of second) seen.push(one.event);
				})();
				await until(() => seen.length === 1);
				second.close();
				await reading;
				return seen;
			})(),
			(async () => {
				await until(() => held.logged === 1);
				fake.push(fake.says("two"));
			})(),
		]);

		expect(whole).toEqual([fake.says("one"), fake.says("two")]);
		expect(tail).toEqual([fake.says("two")]);
	});

	it("ends the read when the turn is over rather than parking it forever", async () => {
		const fake = fakeTurn();
		const held = holdAgentTurn({ root: "/p", thread: "t", turn: fake.turn });
		fake.push(fake.says("one"));

		const seen: AgentEvent[] = [];
		const reading = (async () => {
			for await (const one of held.watch(0)) seen.push(one.event);
		})();
		await until(() => seen.length === 1);
		fake.finish();

		// the read returns on its own: a viewer parked on the tail of a turn that is over is
		// a browser tab waiting on a process that has exited
		await reading;
		expect(held.running).toBe(false);
	});
});

describe("the turns this daemon is holding", () => {
	it("keeps an ended turn readable for its grace window, then lets it go", async () => {
		const turns = createAgentTurns(40);
		const fake = fakeTurn();
		const held = turns.hold({ root: "/p", thread: "t", turn: fake.turn });
		fake.push(fake.says("done"));
		await until(() => held.logged === 1);
		fake.finish();
		await until(() => !held.running);

		// still there the instant it ends, which is what lets a client that was away read the
		// ending rather than the rail inventing a `stopped` for it
		expect(turns.get("/p", "t")).toBe(held);
		expect(await read(turns.get("/p", "t") as AgentHeld)).toEqual([fake.says("done")]);

		await until(() => turns.get("/p", "t") === undefined);
		expect(turns.threads("/p").size).toBe(0);
	});

	it("holds one turn per conversation and keeps two projects apart", () => {
		const turns = createAgentTurns();
		const one = turns.hold({ root: "/one", thread: "t", turn: fakeTurn().turn });
		const two = turns.hold({ root: "/two", thread: "t", turn: fakeTurn().turn });

		// the same thread id in two projects is two turns, because the key is both
		expect(turns.get("/one", "t")).toBe(one);
		expect(turns.get("/two", "t")).toBe(two);
		expect([...turns.of("/one")]).toEqual([one]);
		expect(turns.threads("/two")).toEqual(new Set(["t"]));
		turns.close();
	});

	it("takes the process with it when the daemon closes, which is the one blunt exit", async () => {
		const turns = createAgentTurns();
		const fake = fakeTurn();
		turns.hold({ root: "/p", thread: "t", turn: fake.turn });

		turns.close();

		expect(fake.abandoned).toBe(true);
		expect(turns.get("/p", "t")).toBeUndefined();
		// and the entry does not come back on the ending its own abandon reported
		await until(() => turns.get("/p", "t") === undefined);
	});

	it("passes a stop through to the turn it names", () => {
		const turns = createAgentTurns();
		const fake = fakeTurn();
		const held = turns.hold({ root: "/p", thread: "t", id: "turn-1", turn: fake.turn });

		expect(held.id).toBe("turn-1");
		expect(held.interrupt()).toBe(true);
		expect(fake.interrupts).toBe(1);
		// a stop is not a kill: the process survives it and ends the turn itself
		expect(fake.abandoned).toBe(false);
		turns.close();
	});
});
