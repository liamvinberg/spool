// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { AgentEvent, ServedThread, ThreadPut } from "../api";
import { type AgentDeck, type AgentTurn, useAgentThreads } from "./agent-stream";
import { fullyShown } from "./agent-transcript";

/**
 * The hook that owns every thread's turn (#192, #200), on its own rather than under the
 * canvas.
 *
 * Both of these are properties nothing else can see. The canvas re-renders for its
 * own reasons — a watcher event, a flows read, a frame waking — so a rail mounted
 * inside it picks up arriving events whether or not the hook asked for a render.
 * Here nothing else renders, so the tick is the only thing that can.
 */

function mount(stored: readonly ServedThread[] = []) {
	const seen: AgentDeck[] = [];
	const encoder = new TextEncoder();
	const asked: string[] = [];
	/** every picture the rail wrote down, in the order it wrote them */
	const puts: ThreadPut[] = [];
	/**
	 * Every read of a turn this rail has opened, newest last.
	 *
	 * A list rather than one handle, because a turn now outlives the read of it (#211,
	 * #234): a dropped socket is followed by another read of the same turn, and a test
	 * about that has to be able to drop one and drive the next.
	 */
	const reads: { ctrl: ReadableStreamDefaultController<Uint8Array> | undefined; open: boolean }[] = [];
	/**
	 * What the doors answer instead of a stream, for the refusals a rail has to survive.
	 *
	 * `threads` is the read of what this project has, held open: the rail has no thread to
	 * put anything in until it lands, and what a press does in that window is its own claim.
	 */
	const door: { turn: number; gone: boolean; threads: Promise<void> | null } = {
		turn: 0,
		gone: false,
		threads: null,
	};

	const opened = () => {
		const read: { ctrl: ReadableStreamDefaultController<Uint8Array> | undefined; open: boolean } = {
			ctrl: undefined,
			open: true,
		};
		const body = new ReadableStream<Uint8Array>({
			start: (controller) => {
				read.ctrl = controller;
			},
		});
		reads.push(read);
		return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
	};
	const newest = () => reads[reads.length - 1];

	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			asked.push(url.pathname + url.search);
			// a project with nothing stored, which is what most cases here are about: the
			// picture coming back off disk is `agent-rail.test.ts`'s
			if (url.pathname.endsWith("/agent/threads")) {
				if (door.threads !== null) await door.threads;
				return Response.json({ threads: stored });
			}
			if (url.pathname.includes("/agent/threads/")) {
				puts.push(JSON.parse(String(init?.body ?? "{}")) as ThreadPut);
				return new Response(null, { status: 204 });
			}
			if (url.pathname.endsWith("/agent/turn") && door.turn !== 0) {
				return new Response(`the door said ${door.turn}`, { status: door.turn });
			}
			// the attach door's own answer for a thread it is holding nothing for
			if (url.pathname.includes("/agent/turn/") && door.gone) {
				return new Response("no turn to read", { status: 404 });
			}
			return opened();
		}),
	);

	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		for (const read of reads) if (read.open) read.ctrl?.close();
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});

	function Probe() {
		seen.push(useAgentThreads("test"));
		return null;
	}

	const write = (event: string, data: unknown) =>
		newest()?.ctrl?.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

	return {
		latest: () => (seen[seen.length - 1] as AgentDeck).turn as AgentTurn,
		asked,
		puts,
		door,
		reads,
		push: (event: AgentEvent) => write("agent", event),
		/** the line a turn opens with, which is the daemon saying what is being read (#211) */
		attached: (info: { turn?: string; running: boolean; from: number; logged: number }) => write("attached", info),
		/** the socket going, which is not the turn going (#234) */
		close: () => {
			const read = newest();
			if (read === undefined) return;
			read.open = false;
			read.ctrl?.close();
		},
		render: async () => {
			await act(async () => {
				root.render(createElement(Probe));
			});
		},
	};
}

async function settle(ms: number) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}

const still = () =>
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: query.includes("prefers-reduced-motion"),
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	}));

const waiting: AgentEvent = { kind: "waiting", parent: null };
const speaking: AgentEvent = { kind: "speaking", message: "m", model: "opus", parent: null };
const ended: AgentEvent = { kind: "ended", ending: "done", reason: "completed", stopReason: null, parent: null };
const closed: AgentEvent = { kind: "closed", code: 0, parent: null };

describe("the turn a thread is running", () => {
	/**
	 * Reduced motion drops the pacing, not the updates: the arrival is what stillness
	 * asks not to see, and the clock is what puts arriving events on screen at all.
	 */
	it("keeps reading the stream when stillness is asked for", async () => {
		still();
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});

		expect(canvas.latest().elapsed).toBe(Number.POSITIVE_INFINITY);
		canvas.push(waiting);
		canvas.push(speaking);
		canvas.push({ kind: "say", block: 0, text: "the frame is live.", parent: null });
		await settle(300);

		// the stream is still open, so nothing but the tick can have rendered this
		expect(canvas.latest().phase).toBe("playing");
		expect(canvas.latest().entries.filter((entry) => entry.kind === "prose")).toEqual([
			{ key: "say:1:0", kind: "prose", full: "the frame is live.", landed: expect.anything(), settled: false },
		]);
	});

	/**
	 * The clock outlives the stream by design — the pace runs up to 0.8s behind the
	 * wire — and it has to stop once the edge has caught up, or it re-folds the
	 * transcript ten times a second for the rest of the session.
	 */
	it("stops its clock once the last word has landed", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});
		canvas.push(waiting);
		canvas.push(speaking);
		canvas.push({ kind: "say", block: 0, text: "done.", parent: null });
		canvas.push(ended);
		canvas.push(closed);
		canvas.close();
		await settle(1400);

		expect(canvas.latest().phase).toBe("settled");
		expect(canvas.latest().elapsed).toBe(Number.POSITIVE_INFINITY);
	});

	/** a message that never streamed has no schedule to spend, so the clock must not wait on one */
	it("stops its clock on a message that arrived whole", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});
		canvas.push(waiting);
		canvas.push(speaking);
		canvas.push({ kind: "said", text: "done.", parent: null });
		canvas.push(ended);
		canvas.push(closed);
		canvas.close();
		await settle(600);

		expect(canvas.latest().elapsed).toBe(Number.POSITIVE_INFINITY);
	});
});

/**
 * A read that stopped, over a turn that did not (#234).
 *
 * The daemon holds the turn and the rail holds a view of it, so a socket going says
 * nothing about the process: two seconds of dropped wifi used to draw the turn as
 * finished, fire the queue into a thread that was still running one, and corrupt the
 * boundary the next reload reads. The rail goes back and asks for the same turn instead.
 */
describe("a stream that dropped", () => {
	const THREAD = /\/agent\/turn\/[0-9a-f-]+\?from=(\d+)/;
	const attaches = (asked: readonly string[]) =>
		asked.map((path) => path.match(THREAD)?.[1]).filter((from): from is string => from !== undefined);

	it("goes back for the turn from the event it reached, and ends nothing", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});
		canvas.push(waiting);
		canvas.push(speaking);
		await settle(200);

		canvas.close();
		// the backoff's first step is jittered across 250–500ms, so a beat past it is where
		// the next read is
		await settle(700);

		// the turn is still the turn: nothing settled, nothing was cut, and the read that
		// opened asks for what comes after the two events already in hand
		expect(canvas.latest().phase).toBe("playing");
		expect(attaches(canvas.asked)).toEqual(["2"]);
		expect(canvas.asked.filter((path) => path.endsWith("/agent/turn"))).toHaveLength(1);
	});

	it("draws nothing twice when the turn comes back", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});
		canvas.push(waiting);
		canvas.push(speaking);
		canvas.push({ kind: "say", block: 0, text: "Reading the header.", parent: null });
		await settle(200);
		expect(canvas.latest().entries.filter((entry) => entry.kind === "prose")).toHaveLength(1);

		canvas.close();
		await settle(700);
		// the daemon replays nothing, because the rail asked for what it has not seen
		canvas.attached({ turn: "t1", running: true, from: 3, logged: 3 });
		canvas.push({ kind: "say", block: 1, text: "And the footer.", parent: null });
		await settle(300);

		const prose = canvas.latest().entries.filter((entry) => entry.kind === "prose");
		expect(prose.map((entry) => (entry.kind === "prose" ? entry.full : ""))).toEqual([
			"Reading the header.",
			"And the footer.",
		]);
		// the words the turn was started with stay above the boundary and are never replayed
		expect(canvas.latest().entries.filter((entry) => entry.kind === "user")).toHaveLength(1);
	});

	it("keeps the queue rather than firing it at a socket", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});
		canvas.push(waiting);
		await act(async () => {
			canvas.latest().queue("and the footer");
		});

		canvas.close();
		await settle(700);

		// one turn ever went down the wire: the queue fires when the daemon says the turn
		// is over, and a dropped socket is not the daemon saying anything
		expect(canvas.asked.filter((path) => path.endsWith("/agent/turn"))).toHaveLength(1);
		expect(canvas.latest().queued.map((one) => one.text)).toEqual(["and the footer"]);
	});

	it("draws the cut when the turn it was reading is gone", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});
		canvas.push(waiting);
		await act(async () => {
			canvas.latest().queue("and the footer");
		});
		await settle(200);

		// the daemon restarted under the read: it holds no turn for this thread any more,
		// and nobody is left who can say how the one it held went
		canvas.door.gone = true;
		canvas.close();
		await settle(700);

		expect(canvas.latest().phase).toBe("settled");
		expect(canvas.latest().entries.at(-1)).toMatchObject({ kind: "note", text: "stopped" });
		// and nothing fires into a repo nobody knows the state of
		expect(canvas.asked.filter((path) => path.endsWith("/agent/turn"))).toHaveLength(1);
		expect(canvas.latest().queued.map((one) => one.text)).toEqual(["and the footer"]);
	});
});

/**
 * A page that came back to a turn that never stopped (#211).
 *
 * The turn outlives the request that started it, so a refresh loses the response and
 * nothing else. What the rail has to do with that is keep the conversation it stored,
 * refold the turn off the log the daemon replays, and never draw the two over each other.
 */
describe("a turn picked back up", () => {
	const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

	/** the picture a turn in flight wrote down: the conversation, and the turn so far */
	const midTurn = (over: Partial<ServedThread> = {}): ServedThread => ({
		id: THREAD,
		ask: "make the header tighter",
		life: "running",
		at: 1_700_000_000_000,
		entries: [
			{ key: "u0", kind: "user", text: "make the header tighter", context: null, attached: null },
			{ key: "say:1:0", kind: "prose", full: "Reading the header.", landed: [], settled: true },
		],
		// the human's words are the conversation's; the prose under them is the turn's, and
		// the replay is what draws that
		kept: 1,
		plan: null,
		queued: [],
		draft: "",
		stopped: false,
		closed: false,
		continuable: true,
		live: true,
		...over,
	});

	it("attaches to the turn the daemon is still holding rather than drawing it cut", async () => {
		const canvas = mount([midTurn()]);
		await canvas.render();
		await settle(120);

		// it went and asked for the turn in that thread, rather than starting one
		expect(canvas.asked.some((path) => path.includes(`/agent/turn/${THREAD}`))).toBe(true);

		canvas.attached({ turn: "1700000000000-1", running: true, from: 0, logged: 1 });
		canvas.push({ kind: "say", block: 0, text: "Reading the header.", parent: null });
		await settle(200);

		const turn = canvas.latest();
		expect(turn.phase).toBe("playing");
		// the human's words once, off the stored picture, and the turn's prose once, off the
		// replay — the boundary is what keeps the second from being drawn twice
		expect(turn.entries.filter((entry) => entry.kind === "user")).toHaveLength(1);
		expect(turn.entries.filter((entry) => entry.kind === "prose")).toEqual([
			{ key: "say:0:0", kind: "prose", full: "Reading the header.", landed: expect.anything(), settled: false },
		]);
		// and a replay is not an arrival: it is drawn whole rather than typed out from the
		// beginning, the way a picture off disk is
		expect(fullyShown(turn.entries.find((entry) => entry.kind === "prose") as never, turn.elapsed)).toBe(true);
	});

	it("carries on live from where the replay left off", async () => {
		const canvas = mount([midTurn()]);
		await canvas.render();
		await settle(120);

		canvas.attached({ turn: "1700000000000-1", running: true, from: 0, logged: 1 });
		canvas.push({ kind: "say", block: 0, text: "Reading the header.", parent: null });
		await settle(120);
		canvas.push(ended);
		canvas.push(closed);
		canvas.close();
		await settle(400);

		// it ends the way any turn ends, on the daemon's own word for it — no invented
		// `stopped`, and no second copy of anything
		expect(canvas.latest().phase).toBe("settled");
		expect(canvas.latest().entries.filter((entry) => entry.kind === "note")).toEqual([]);
	});

	it("takes back the messages it was holding when the page went away", async () => {
		const canvas = mount([
			midTurn({ queued: [{ id: "held-1", text: "and the footer", context: null, attached: null }] }),
		]);
		await canvas.render();
		await settle(120);

		// spool holds the queue, and a browser is the one place a thing can be lost by a
		// keystroke: they come back with the picture rather than going with the page
		expect(canvas.latest().queued.map((one) => one.text)).toEqual(["and the footer"]);
	});

	it("draws a thread the daemon is no longer holding as the cut it was", async () => {
		const canvas = mount([midTurn({ live: false, stopped: true })]);
		await canvas.render();
		await settle(120);

		expect(canvas.asked.some((path) => path.includes(`/agent/turn/${THREAD}`))).toBe(false);
		expect(canvas.latest().phase).toBe("idle");
		expect(canvas.latest().entries.at(-1)).toMatchObject({ kind: "note", text: "stopped" });
	});

	/**
	 * The queue is spool's to hold, and holding it is not the same as keeping it (#170, #234).
	 *
	 * Words waiting on a turn that has already ended are words nobody is going to send: the
	 * only thing that ever fired a queue was a stream closing, so a daemon restart left them
	 * in the box for the life of the project, with everything typed afterwards going out in
	 * front of them.
	 */
	it("sends a queue that came back with no turn left to wait for", async () => {
		const canvas = mount([
			midTurn({
				live: false,
				stopped: true,
				queued: [{ id: "held-1", text: "and the footer", context: null, attached: null }],
			}),
		]);
		await canvas.render();
		await settle(200);

		expect(canvas.asked.filter((path) => path.endsWith("/agent/turn"))).toHaveLength(1);
		expect(canvas.latest().queued).toEqual([]);
		expect(canvas.latest().phase).toBe("playing");
		// and the picture no longer claims them, so a second page does not send them again
		expect(canvas.puts.at(-1)?.queued).toEqual([]);
	});
});

/**
 * The queue against the doors that say no (#170, #234).
 *
 * Words spool is holding are spool's to keep hold of, and every one of these is a way the
 * old rail lost them: fired into a refusal and dropped in an error line, written down as
 * still-waiting a moment before they went out, or cancelled in memory only.
 */
describe("what the queue survives", () => {
	const queueOne = async (canvas: ReturnType<typeof mount>) => {
		await canvas.render();
		await act(async () => {
			canvas.latest().send("go");
		});
		canvas.push(waiting);
		await act(async () => {
			canvas.latest().queue("and the footer");
		});
		await settle(120);
	};

	it("writes the box down before the send goes out, never after", async () => {
		const canvas = mount();
		await queueOne(canvas);

		canvas.push(ended);
		canvas.push(closed);
		canvas.close();
		await settle(300);

		// the pictures and the doors are recorded in the one order they were asked in, so the
		// writes that landed before the queue fired are the ones in front of that POST
		const fired = canvas.asked.lastIndexOf("/api/p/test/agent/turn");
		const before = canvas.asked.slice(0, fired).filter((path) => path.includes("/agent/threads/")).length;
		// a refresh in the window between the write and the send used to come back holding
		// words the daemon was already running, and send them a second time
		expect(canvas.puts.slice(0, before).some((put) => put.queued.length === 0)).toBe(true);
	});

	it("writes a take-back down as it happens rather than on the next throttle", async () => {
		const canvas = mount();
		await queueOne(canvas);
		const wrote = canvas.puts.length;

		await act(async () => {
			canvas.latest().unqueue(canvas.latest().queued[0]?.id ?? "");
		});

		expect(canvas.puts.length).toBeGreaterThan(wrote);
		expect(canvas.puts.at(-1)?.queued).toEqual([]);
	});

	/**
	 * Words the rail cannot take yet are words it has to say it did not take (#234).
	 *
	 * The threads of a project arrive over a door, and until they do there is no thread for
	 * anything to go into. Both ways in returned nothing at all for that, and the composer —
	 * which had already emptied itself — took it for a send: Enter on a rail that was still
	 * loading swallowed the sentence, with no draft and no log line left of it.
	 */
	it("takes nothing while it has nowhere to put it, and says so", async () => {
		const canvas = mount();
		let land = () => {};
		canvas.door.threads = new Promise<void>((resolve) => {
			land = resolve;
		});
		await canvas.render();

		let said = true;
		let queued = true;
		await act(async () => {
			said = canvas.latest().send("go");
			queued = canvas.latest().queue("and the footer");
		});

		expect(said).toBe(false);
		expect(queued).toBe(false);
		expect(canvas.asked.some((path) => path.endsWith("/agent/turn"))).toBe(false);

		land();
		await settle(120);
		expect(canvas.latest().send("go")).toBe(true);
	});

	it("hands the words back to the box when the thread is already running a turn", async () => {
		const canvas = mount();
		await canvas.render();
		// the door's own answer to a second turn in one thread, which is what a rail that
		// lost its read and came back without attaching gets (#211)
		canvas.door.turn = 409;
		await act(async () => {
			canvas.latest().send("go");
		});
		await settle(200);
		canvas.door.turn = 0;

		// the words are the box's again, in the order they were going to be said in, and the
		// read has gone to find the turn that is actually running
		expect(canvas.latest().queued.map((one) => one.text)).toEqual(["go"]);
		expect(canvas.asked.some((path) => path.includes("/agent/turn/"))).toBe(true);
		// nothing is drawn about it: the refusal is spool's own bookkeeping
		expect(canvas.latest().entries.filter((entry) => entry.kind === "note")).toEqual([]);
		expect(canvas.latest().entries.filter((entry) => entry.kind === "user")).toEqual([]);
	});
});
