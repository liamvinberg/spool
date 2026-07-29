import { describe, expect, it } from "vitest";
import { createClaudeAdapter } from "../../daemon/agent-claude";
import type { AgentEvent } from "../../daemon/agent-events";
import { CAPTURES, readCapture } from "../../test-helpers";
import { drawnBy } from "./agent-pace";
import { type AgentEntry, duration, fullyShown, type Stamped, shownBy, transcriptOf } from "./agent-transcript";

/**
 * The transcript the rail draws (#192), projected off #191's event union.
 *
 * The wire cases are asserted on hand-built event lists, because that is the only
 * way to pin a millisecond. The seven captures are then replayed through the same
 * projection whole, which is what says the rules hold against events nobody wrote
 * for them.
 */

const stamp = (events: readonly (AgentEvent | [number, AgentEvent])[]): Stamped[] =>
	events.map((entry, index) =>
		Array.isArray(entry) ? { at: entry[0], event: entry[1] } : { at: index * 100, event: entry },
	);

const say = (text: string, block = 0): AgentEvent => ({ kind: "say", block, text, parent: null });
const waiting: AgentEvent = { kind: "waiting", parent: null };
const speaking: AgentEvent = { kind: "speaking", message: "m", model: "opus", parent: null };
const done: AgentEvent = { kind: "ended", ending: "done", reason: "completed", stopReason: null, parent: null };

const kinds = (entries: readonly AgentEntry[]) => entries.map((entry) => entry.kind);
const beat = (entries: readonly AgentEntry[]) => entries.find((entry) => entry.kind === "beat");
const prose = (entries: readonly AgentEntry[]) => entries.filter((entry) => entry.kind === "prose");

/** every event of one capture, as the daemon's adapter reads it, stamped on the wire's own order */
function replay(capture: string): Stamped[] {
	const adapter = createClaudeAdapter();
	const seen: Stamped[] = [];
	let at = 0;
	for (const line of readCapture(capture)) {
		for (const event of adapter.read(JSON.stringify(line))) {
			at += 40;
			seen.push({ at, event });
		}
	}
	return seen;
}

describe("the human's words", () => {
	it("are in the log before a single event has landed", () => {
		expect(transcriptOf("tidy the receipt", [])).toMatchObject({
			entries: [{ kind: "user", text: "tidy the receipt" }],
			over: false,
		});
	});
});

describe("the wait before the first token", () => {
	/**
	 * The measured median is over a second and a half, which is long enough that
	 * nothing on screen reads as a hang rather than as intent. The beat is what is on
	 * screen: one turning mark and a duration off the same clock the prose is paced by.
	 */
	it("puts a live beat in the log the moment the request goes up", () => {
		const { entries } = transcriptOf("go", stamp([[0, waiting]]));

		expect(kinds(entries)).toEqual(["user", "beat"]);
		expect(beat(entries)).toMatchObject({ state: "running", verb: null, since: 0, until: null });
	});

	/** a request going up is a fact; that the model is *thinking* is not, until it says so */
	it("says nothing about what the model is doing until the wire names it", () => {
		expect(beat(transcriptOf("go", stamp([waiting]))?.entries)?.verb).toBeNull();
		expect(
			beat(
				transcriptOf("go", stamp([waiting, speaking, { kind: "thinking", block: 0, tokens: 12, parent: null }]))
					.entries,
			)?.verb,
		).toBe("thinking");
	});

	/** it was the absence of an answer rather than a thing that happened */
	it("leaves no receipt once the first token lands", () => {
		const { entries } = transcriptOf("go", stamp([waiting, speaking, say("done.")]));

		expect(kinds(entries)).toEqual(["user", "prose"]);
	});

	/** every model request raises one, so the gaps inside a turn read the same way */
	it("opens a fresh beat for the next request in the same turn", () => {
		const { entries } = transcriptOf("go", stamp([waiting, speaking, say("one"), waiting]));

		expect(kinds(entries)).toEqual(["user", "prose", "beat"]);
	});

	/**
	 * `speaking` is one runtime's signal and the union has to survive a thinner one, so
	 * the wait is closed by whatever the answer turns out to start with. Without this a
	 * runtime that never says it is speaking leaves a mark turning for the whole turn
	 * and puts two messages into one block, since both open at block 0.
	 */
	it("closes the wait on whatever the answer starts with, not on one runtime's signal", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([waiting, say("one"), waiting, say("two"), done, { kind: "closed", code: 0, parent: null }]),
		);

		expect(kinds(entries)).toEqual(["user", "prose", "prose"]);
		expect(prose(entries).map((entry) => (entry.kind === "prose" ? entry.full : ""))).toEqual(["one", "two"]);
	});
});

describe("the thinking beat", () => {
	/** the wire sends an empty string for a thought's text, so a duration is all of it */
	it("carries a duration and never prose", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				[0, waiting],
				[900, speaking],
				[1000, { kind: "thinking", block: 0, tokens: 0, parent: null }],
				[1400, { kind: "thinking", block: 0, tokens: 61, parent: null }],
				[2600, say("done.")],
			]),
		);
		const thought = beat(entries);

		expect(thought).toEqual({
			key: "think:1:0",
			kind: "beat",
			state: "done",
			verb: "thinking",
			since: 1000,
			until: 2600,
		});
		expect(duration((thought?.until ?? 0) - (thought?.since ?? 0))).toBe("1.6s");
	});

	it("gives each thinking block its own beat", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				waiting,
				speaking,
				{ kind: "thinking", block: 0, tokens: 10, parent: null },
				{ kind: "thinking", block: 2, tokens: 20, parent: null },
			]),
		);

		expect(kinds(entries)).toEqual(["user", "beat", "beat"]);
		expect(entries.filter((entry) => entry.kind === "beat").map((entry) => entry.state)).toEqual(["done", "running"]);
	});

	/** the model stopped composing the moment it called something */
	it("settles when the turn starts working rather than talking", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				waiting,
				speaking,
				{ kind: "thinking", block: 0, tokens: 10, parent: null },
				{ kind: "call", id: "t1", block: 1, tool: "Edit", parent: null },
			]),
		);

		expect(beat(entries)?.state).toBe("done");
	});
});

describe("the agent's words", () => {
	it("arrive as they are written rather than appearing whole", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				[0, waiting],
				[900, speaking],
				[1000, say("the frame ")],
				[1400, say("is live.")],
			]),
		);
		const [block] = prose(entries);

		expect(block).toMatchObject({ full: "the frame is live.", settled: false });
		expect(block?.kind === "prose" ? block.landed : []).toEqual([
			{ at: 1000, upto: 10 },
			{ at: 1400, upto: 18 },
		]);
		// and the schedule is what the pace reads, so nothing is drawn before it landed
		expect(drawnBy(block?.kind === "prose" ? block.landed : [], 950)).toBe(0);
	});

	it("keeps two blocks of one message apart", () => {
		const { entries } = transcriptOf("go", stamp([waiting, speaking, say("one", 0), say("two", 2)]));

		expect(prose(entries).map((entry) => (entry.kind === "prose" ? entry.full : ""))).toEqual(["one", "two"]);
	});

	/** the deltas are a preview; the settled assistant message is the authority */
	it("lets the settled message confirm the block its own deltas opened", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				waiting,
				speaking,
				say("the frame is liv"),
				{ kind: "said", text: "the frame is live.", parent: null },
			]),
		);

		expect(prose(entries)).toHaveLength(1);
		expect(prose(entries)[0]).toMatchObject({ full: "the frame is live.", settled: true });
	});

	/** a runtime that sends no partial messages opens no block, so the text arrives here first */
	it("draws a message that never streamed", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([waiting, speaking, { kind: "said", text: "done.", parent: null }, done]),
		);

		expect(prose(entries)).toEqual([{ key: "said:1:0", kind: "prose", full: "done.", landed: [], settled: true }]);
	});

	/**
	 * The pace can only spend what the schedule delivered, so text the authority added
	 * has to arrive on it too. Without this the last characters are undrawable and the
	 * clock that waits for the edge never stops.
	 */
	it("puts text the settled message added onto the schedule so the edge can reach it", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				[0, waiting],
				[900, speaking],
				[1000, say("the frame is liv")],
				[1600, { kind: "said", text: "the frame is live.", parent: null }],
			]),
		);
		const [block] = prose(entries);
		if (block?.kind !== "prose") throw new Error("no block");

		expect(block.landed.at(-1)).toEqual({ at: 1600, upto: 18 });
		expect(fullyShown(block, 4000)).toBe(true);
		expect(shownBy(block, 4000)).toBe(18);
	});

	it("draws nothing for a text block that never carried a character", () => {
		const { entries } = transcriptOf("go", stamp([waiting, speaking, say("", 0), done]));

		expect(kinds(entries)).toEqual(["user"]);
	});
});

describe("a turn that ends", () => {
	/** the log is receipts, and "it worked" is not one */
	it("says nothing when it ended cleanly", () => {
		const { entries, over } = transcriptOf("go", stamp([waiting, speaking, say("done."), done]));

		expect(kinds(entries)).toEqual(["user", "prose"]);
		expect(over).toBe(true);
	});

	it("says one flat word when it was stopped", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				waiting,
				speaking,
				say("redoing the"),
				{ kind: "ended", ending: "stopped", reason: "aborted_streaming", stopReason: null, parent: null },
			]),
		);

		expect(entries.at(-1)).toEqual({ key: "end", kind: "note", text: "stopped" });
	});

	it("carries an unfinished beat into the ending it got", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				waiting,
				speaking,
				{ kind: "thinking", block: 0, tokens: 8, parent: null },
				{ kind: "ended", ending: "stopped", reason: "aborted_streaming", stopReason: null, parent: null },
			]),
		);

		expect(beat(entries)?.state).toBe("stopped");
	});

	/** spool is not the authority on why somebody else's process gave up */
	it("quotes the wire's own word for a failure", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				waiting,
				{ kind: "ended", ending: "failed", reason: "error_during_execution", stopReason: null, parent: null },
			]),
		);

		expect(entries.at(-1)).toMatchObject({ kind: "note", text: "error_during_execution" });
	});

	it("quotes the runner verbatim when the agent never started", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([{ kind: "closed", code: null, message: "spawn claude ENOENT", parent: null }]),
		);

		expect(entries.at(-1)).toMatchObject({ kind: "note", text: "spawn claude ENOENT" });
	});

	it("never swallows a process that went away without finishing", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([waiting, speaking, say("half a"), { kind: "closed", code: 1, parent: null }]),
		);

		expect(entries.at(-1)).toMatchObject({ kind: "note", text: "the agent exited 1" });
	});

	it("is silent about the exit that follows a turn that ended", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([waiting, speaking, say("done."), done, { kind: "closed", code: 0, parent: null }]),
		);

		expect(kinds(entries)).toEqual(["user", "prose"]);
	});
});

describe("what a delegate does", () => {
	/** it belongs to the frame it writes, not to the log the human is reading */
	it("never reaches the transcript", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				waiting,
				speaking,
				{ kind: "say", block: 0, text: "delegating.", parent: null },
				{ kind: "say", block: 0, text: "I am a sub-agent", parent: "call-1" },
				{ kind: "thinking", block: 1, tokens: 90, parent: "call-1" },
			]),
		);

		expect(prose(entries).map((entry) => (entry.kind === "prose" ? entry.full : ""))).toEqual(["delegating."]);
		expect(kinds(entries)).toEqual(["user", "prose"]);
	});
});

describe("every capture, replayed whole", () => {
	for (const capture of CAPTURES) {
		it(`projects ${capture} without loss or crash`, () => {
			const seen = replay(capture);
			const { entries } = transcriptOf("make these consistent", seen);

			expect(entries[0]).toMatchObject({ kind: "user" });
			// no beat is left running once the stream is over, and nothing draws an empty
			// message or a duration that runs backwards
			for (const entry of entries) {
				if (entry.kind === "beat") {
					expect(entry.until === null || entry.until >= entry.since).toBe(true);
				}
				if (entry.kind === "prose") expect(entry.full.length).toBeGreaterThan(0);
			}
			// every message the wire settled is in the log exactly once
			const said = seen.filter(({ event }) => event.kind === "said" && event.parent === null && event.text !== "");
			const drawn = entries.filter((entry) => entry.kind === "prose");
			expect(drawn.length).toBe(said.length);
			expect(drawn.map((entry) => (entry.kind === "prose" ? entry.full : ""))).toEqual(
				said.map(({ event }) => (event.kind === "said" ? event.text : "")),
			);
		});
	}
});
