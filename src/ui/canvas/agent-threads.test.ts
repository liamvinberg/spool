import { describe, expect, it } from "vitest";
import { askOf, bounced, cutPicture, lifeOf, storedLife } from "./agent-threads";
import type { AgentEntry } from "./agent-transcript";

/**
 * The five lives and what tells them apart (#136, #161, #200).
 *
 * The rule the whole vocabulary rests on is what *clears* a mark rather than what sets
 * it: opening a thread reads it, so `unread` goes on a look, and nothing about looking
 * answers a question, so `waiting` does not. A strip that spent one drawing on both would
 * go silent about a thread that will never finish, which is the one case the strip exists
 * for.
 *
 * What the marks look like is `agent-rail.test.ts`'s; this is which one a thread gets.
 */

const asked: AgentEntry = {
	key: "u0",
	kind: "user",
	text: "shoot home and fix what reads wrong",
	context: null,
	attached: null,
};
const note = (text: string): AgentEntry => ({ key: `n:${text}`, kind: "note", text });
const row = (state: "running" | "done", verb = "edit"): Extract<AgentEntry, { kind: "row" }> => ({
	key: `row:${verb}:${state}`,
	kind: "row",
	state,
	verb,
	subject: "home",
	detail: null,
	frame: "home",
	count: 1,
	shot: null,
	foreign: null,
	parent: null,
	delegated: [],
});
const beat = (until: number | null): AgentEntry => ({
	key: "beat:1",
	kind: "beat",
	state: "running",
	verb: null,
	since: 10,
	until,
});

describe("a thread's mark", () => {
	it("draws nothing for the thread in the rail and turns for one working elsewhere", () => {
		const running = { unread: false, stuck: false } as const;

		expect(lifeOf({ phase: "playing", open: true, ...running })).toBe("streaming");
		expect(lifeOf({ phase: "playing", open: false, ...running })).toBe("running");
	});

	/**
	 * A turn parked on a request never leaves `asking` and is spending nothing, which is
	 * the defect this state was opened by: the phase alone drew a turning ring for a
	 * thread that had stopped.
	 */
	it("is the waiting disc whenever a person is the only thing that can move it", () => {
		// a parked question and a waiting approval are one wire and one phase
		expect(lifeOf({ phase: "asking", open: false, unread: false, stuck: true })).toBe("waiting");
		// and a signed-out bounce is the third cause, which shares the mark
		expect(lifeOf({ phase: "settled", open: false, unread: true, stuck: true })).toBe("waiting");
	});

	/** waiting outranks every motion, because the thread has stopped and is costing nothing */
	it("is waiting even for the thread you are looking at", () => {
		expect(lifeOf({ phase: "asking", open: true, unread: false, stuck: true })).toBe("waiting");
	});

	it("is a solid dot once it has landed where nobody was looking", () => {
		expect(lifeOf({ phase: "settled", open: false, unread: true, stuck: false })).toBe("unread");
	});

	it("is nothing for an old thread and for one nobody has said anything to", () => {
		expect(lifeOf({ phase: "settled", open: false, unread: false, stuck: false })).toBe("read");
		expect(lifeOf({ phase: "idle", open: true, unread: false, stuck: false })).toBe("read");
	});

	/**
	 * The clearing rule, which is the whole reason waiting and unread are two drawings.
	 *
	 * `unread` is the flag a look clears, so the look reaches it and nothing else does;
	 * `stuck` is decided above it, so no look reaches that.
	 */
	it("clears on a look when it is unread and does not when it is waiting", () => {
		const landed = { phase: "settled", open: false, stuck: false } as const;
		expect(lifeOf({ ...landed, unread: true })).toBe("unread");
		expect(lifeOf({ ...landed, unread: false })).toBe("read");

		const parked = { phase: "asking", stuck: true, unread: false } as const;
		// opened, read, still waiting: a question is not answered by being looked at
		expect(lifeOf({ ...parked, open: true })).toBe("waiting");
	});

	/** the browser's own fact, which the next person to open the project does not inherit */
	it("stores streaming as what the thread was actually doing", () => {
		expect(storedLife("streaming")).toBe("running");
		expect(storedLife("running")).toBe("running");
		expect(storedLife("waiting")).toBe("waiting");
		expect(storedLife("unread")).toBe("unread");
		expect(storedLife("read")).toBe("read");
	});
});

describe("the signed-out bounce", () => {
	/** the binary's own words, read where the refusal lands rather than out of a private file */
	it("is read off the agent's own refusal", () => {
		expect(bounced([asked, note("Not logged in")])).toBe(true);
		expect(bounced([asked, note("Invalid API key · Please run /login")])).toBe(true);
		expect(bounced([asked, note("No authentication available")])).toBe(true);
	});

	it("is not an ordinary failure and not a stop", () => {
		expect(bounced([asked, note("stopped")])).toBe(false);
		expect(bounced([asked, note("error_during_execution")])).toBe(false);
		expect(bounced([asked])).toBe(false);
	});

	/**
	 * A usage wind-down is not a thread waiting on anybody. The agent is told to finish
	 * and does, so the thread is still working and still draws working.
	 */
	it("is not what a usage wind-down looks like", () => {
		// the wind-down is a limit event, which draws no note and moves no mark: a thread
		// inside its grace period is a thread that is still going
		expect(bounced([asked, note("approaching_limit")])).toBe(false);
		expect(lifeOf({ phase: "playing", open: false, unread: false, stuck: false })).toBe("running");
	});
});

describe("the name", () => {
	it("is the human's own ask and nothing generated", () => {
		expect(askOf([asked])).toBe("shoot home and fix what reads wrong");
	});

	it("is the words the thread opened with, not the last thing said in it", () => {
		const later: AgentEntry = { key: "u1", kind: "user", text: "now the receipt", context: null, attached: null };
		expect(askOf([asked, row("done"), later])).toBe("shoot home and fix what reads wrong");
	});

	it("says a thread nobody has spoken to is new", () => {
		expect(askOf([])).toBe("new thread");
		expect(askOf([row("done")])).toBe("new thread");
	});
});

describe("what a restart leaves", () => {
	/**
	 * A thread caught mid-turn is cut where the lights went out. The events that would
	 * say so are gone, because the drawing was stored rather than the stream, so the
	 * aftermath is derived from the entries themselves.
	 */
	it("stops every row that was still running and closes the beat", () => {
		const cut = cutPicture([asked, beat(null), row("running"), row("done", "shot")]);

		expect(cut.filter((entry) => entry.kind === "row").map((entry) => entry.state)).toEqual(["stopped", "done"]);
		expect(cut.find((entry) => entry.kind === "beat")).toMatchObject({ state: "stopped", until: 10 });
	});

	it("ends the log on spool's own word for a turn that did not finish", () => {
		expect(cutPicture([asked, row("running")]).at(-1)).toEqual({ key: "restart", kind: "note", text: "stopped" });
	});

	/** a request nobody can answer now: there is no process left for an answer to reach */
	it("drops a question the restart caught open", () => {
		const ask: AgentEntry = {
			key: "ask:1",
			kind: "ask",
			request: "req-1",
			question: true,
			asked: "which of these?",
			questions: [],
			always: false,
			state: "open",
			words: null,
		};

		expect(cutPicture([asked, ask]).find((entry) => entry.kind === "ask")).toMatchObject({ state: "dropped" });
	});

	/** what comes out of here is what gets written back, so a second restore must not stack */
	it("is the same picture twice over", () => {
		const once = cutPicture([asked, row("running")]);
		expect(cutPicture(once)).toEqual(once);
	});

	it("stops a delegate's own rows with the row that opened them", () => {
		const parent = { ...row("running", "delegate"), delegated: [row("running", "write")] };
		const [, cut] = cutPicture([asked, parent]);

		expect(cut).toMatchObject({ state: "stopped", delegated: [{ state: "stopped" }] });
	});
});
