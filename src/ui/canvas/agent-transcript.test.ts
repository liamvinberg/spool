import { describe, expect, it } from "vitest";
import { createClaudeAdapter } from "../../daemon/agent-claude";
import type { AgentEvent } from "../../daemon/agent-events";
import { CAPTURES, readCapture } from "../../test-helpers";
import { drawnBy } from "./agent-pace";
import {
	type AgentEntry,
	type AgentRow,
	duration,
	fullyShown,
	type Stamped,
	shownBy,
	transcriptOf,
} from "./agent-transcript";

/**
 * The transcript the rail draws (#192, #193), projected off #191's event union.
 *
 * The wire cases are asserted on hand-built event lists, because that is the only
 * way to pin a millisecond and a wire shape. Every rule is then asserted again over
 * the captures, which is what says it holds against events nobody wrote for it — and
 * the captures cut both ways: two designs on this map were wrong before a recording
 * corrected them, and one ticket claimed a fixture lacked something it already held.
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
const rows = (entries: readonly AgentEntry[]) => entries.filter((entry) => entry.kind === "row");
/** every row in the log, each delegate's own transcript unfolded in place (#194) */
const deep = (entries: readonly AgentEntry[]): AgentRow[] =>
	rows(entries).flatMap((row) => [row, ...deep(row.delegated)]);
/** what a row reads as on the line, which is the whole of what the log says out loud */
const lines = (entries: readonly AgentEntry[]) =>
	rows(entries).map(
		(row) => `${row.verb}${row.subject === null ? "" : ` ${row.subject}`}${row.count > 1 ? ` ×${row.count}` : ""}`,
	);

/** the rows of one capture, projected whole */
const rowsOf = (capture: string) => rows(transcriptOf("make these consistent", replay(capture)).entries);

/** a whole call, as the wire hands one over once its arguments have finished arriving */
const called = (id: string, tool: string, input: unknown, parent: string | null = null): AgentEvent => ({
	kind: "called",
	id,
	tool,
	input,
	parent,
});

const result = (id: string, over: Partial<Extract<AgentEvent, { kind: "result" }>> = {}): AgentEvent => ({
	kind: "result",
	id,
	failed: false,
	text: "",
	images: [],
	parent: null,
	...over,
});

const ROOT = "/Users/designer/kaffe";
const ready: AgentEvent = {
	kind: "ready",
	session: "s",
	model: "claude-opus-5",
	cwd: ROOT,
	version: "2.1.220",
	permissionMode: "default",
	apiKeySource: "none",
	capabilities: [],
	parent: null,
};

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

describe("one tool call", () => {
	/**
	 * One line of verb and subject, with the payload behind a disclosure closed by
	 * default. A nine-minute turn is nineteen of these, so the line is the receipt and
	 * the path is one click down rather than in the way.
	 */
	it("is one row, with the disclosure's payload separate from the line", () => {
		const { entries } = transcriptOf(
			"tidy the cart",
			stamp([
				ready,
				waiting,
				speaking,
				called("t1", "Read", { file_path: `${ROOT}/design/frames/app/cart/frame.tsx` }),
				result("t1"),
				done,
			]),
		);

		expect(rows(entries)).toEqual([
			{
				key: "row:t1",
				kind: "row",
				state: "done",
				verb: "read",
				subject: "cart",
				frame: "cart",
				count: 1,
				detail: "design/frames/app/cart/frame.tsx",
				shot: null,
				foreign: null,
				parent: null,
				delegated: [],
			},
		]);
	});

	/**
	 * Three beats, and the wire sends all three: the block opens with a name and an
	 * empty input, the subject types itself in as uneven partial JSON behind it, and
	 * the result settles it. A row cut mid-argument is beat one, which needs no case of
	 * its own.
	 */
	it("appears, has its subject typed in, and then runs", () => {
		const opening = stamp([
			ready,
			waiting,
			speaking,
			{ kind: "call", id: "t1", block: 1, tool: "Read", parent: null },
			{ kind: "call-input", block: 1, fragment: '{"file_path": "/Users/designer/kaffe/design/', parent: null },
			{ kind: "call-input", block: 1, fragment: 'frames/cart/frame.tsx", "offset": 1', parent: null },
			result("t1"),
		]);
		const at = (upto: number) => rows(transcriptOf("go", opening.slice(0, upto)).entries)[0];

		// the tool is named before its argument exists, and a half-arrived path names no
		// frame, so the subject slot waits rather than printing a word the wire has not
		// finished
		expect(at(4)).toMatchObject({ verb: "read", subject: null, state: "running" });
		expect(at(5)).toMatchObject({ verb: "read", subject: null, state: "running" });
		expect(at(6)).toMatchObject({ verb: "read", subject: "cart", state: "running" });
		expect(at(7)).toMatchObject({ verb: "read", subject: "cart", state: "done" });
	});

	/** the surface speaks frames and pages; a path lives behind the disclosure */
	it("names frames and pages rather than the files they are made of", () => {
		const paths = [
			`${ROOT}/design/frames/cart/frame.tsx`,
			`${ROOT}/design/frames/app/checkout/frame.tsx`,
			`${ROOT}/design/frames/cart/frame.json`,
			`${ROOT}/design/frames/app`,
			`${ROOT}/design/shared/tokens.css`,
			`${ROOT}/pnpm-lock.yaml`,
		];
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				waiting,
				speaking,
				...paths.map((file, index) => called(`t${index}`, "Read", { file_path: file })),
			]),
		);

		expect(rows(entries).map((row) => row.subject)).toEqual([
			"cart",
			"checkout",
			// the geometry sidecar is the frame too: twelve rows that each read `frame.tsx`
			// would name nothing at all
			"cart",
			// a page, and the one name here that is not a frame — which of the two it is
			// takes the project's own frame list, and #143 hands that in
			"app",
			"tokens.css",
			"pnpm-lock.yaml",
		]);
		expect(rows(entries).map((row) => row.frame)).toEqual(["cart", "checkout", "cart", null, null, null]);
	});

	/** the agent's own word for what it is doing, where spool has no better noun */
	it("reads a spool verb out of the shell rather than saying `run`", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				waiting,
				speaking,
				called("t1", "Bash", { command: "spool shot cart 2>&1 | tail -20", description: "Shoot the cart frame" }),
				// a compound command is several calls and it ends on its point, so the last
				// spool verb in it is the one worth a row
				called("t2", "Bash", {
					command: 'spool status 2>&1; echo "---"; spool logs cart 2>&1',
					description: "Check",
				}),
				called("t3", "Bash", { command: "find design -type f | sort", description: "List design tree files" }),
			]),
		);

		expect(lines(entries)).toEqual(["shot cart", "logs cart", "run List design tree files"]);
		expect(rows(entries).map((row) => row.frame)).toEqual(["cart", "cart", null]);
	});
});

describe("a run of writes", () => {
	/** six edits are `edit home ×6`, and the count is the whole receipt */
	it("is one row per frame, counting the calls it holds", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				waiting,
				speaking,
				called("t1", "Edit", { file_path: `${ROOT}/design/frames/home/frame.tsx` }),
				result("t1"),
				called("t2", "Edit", { file_path: `${ROOT}/design/frames/home/frame.tsx` }),
				result("t2"),
				// it is writes rather than edits: a delegate switches to rewriting the file
				// whole partway through, and that is still one act
				called("t3", "Write", { file_path: `${ROOT}/design/frames/home/frame.tsx` }),
				result("t3"),
				done,
			]),
		);

		expect(lines(entries)).toEqual(["edit home ×3"]);
		expect(rows(entries)[0]).toMatchObject({ frame: "home", detail: "design/frames/home/frame.tsx", state: "done" });
	});

	/**
	 * The mark settles once, when the run closes, rather than striking a check between
	 * every pair of edits — while the run can still gain a call it is working, and the
	 * count climbing is what says so.
	 */
	it("keeps working between its own calls", () => {
		const events = stamp([
			ready,
			waiting,
			speaking,
			called("t1", "Edit", { file_path: `${ROOT}/design/frames/home/frame.tsx` }),
			result("t1"),
			called("t2", "Edit", { file_path: `${ROOT}/design/frames/home/frame.tsx` }),
			result("t2"),
			done,
		]);
		const at = (upto: number) => rows(transcriptOf("go", events.slice(0, upto)).entries)[0];

		expect(at(5)).toMatchObject({ count: 1, state: "running" });
		expect(at(6)).toMatchObject({ count: 2, state: "running" });
		expect(at(8)).toMatchObject({ count: 2, state: "done" });
	});

	/** the next thing the log draws ends it, and time is never the rule */
	it("ends on the next thing the log draws", () => {
		const write = (id: string) => called(id, "Edit", { file_path: `${ROOT}/design/frames/home/frame.tsx` });
		const shot = called("s1", "Bash", { command: "spool shot home", description: "Shoot" });

		expect(lines(transcriptOf("go", stamp([ready, write("t1"), shot, write("t2")])).entries)).toEqual([
			"edit home",
			"shot home",
			"edit home",
		]);
		// the agent saying something is the log drawing something
		expect(
			lines(transcriptOf("go", stamp([ready, write("t1"), say("now the totals."), write("t2")])).entries),
		).toEqual(["edit home", "edit home"]);
		// a thought is too, and it is what settles the mark once the writes are over
		const thought: AgentEvent = { kind: "thinking", block: 0, tokens: 40, parent: null };
		expect(rows(transcriptOf("go", stamp([ready, write("t1"), result("t1"), thought])).entries)[0]).toMatchObject({
			state: "done",
		});
	});

	/**
	 * Only what stays drawn ends it. The wait for the next request opens a beat and
	 * then takes it back, so a run it ended would be a run broken by nothing the reader
	 * can see — and two identical rows would end up next to each other with no reason
	 * between them.
	 */
	it("is not ended by a beat the log takes back", () => {
		const write = (id: string) => called(id, "Edit", { file_path: `${ROOT}/design/frames/home/frame.tsx` });
		const { entries } = transcriptOf(
			"go",
			stamp([ready, write("t1"), result("t1"), waiting, speaking, write("t2"), result("t2"), done]),
		);

		expect(kinds(entries)).toEqual(["user", "row"]);
		expect(lines(entries)).toEqual(["edit home ×2"]);
	});

	/** a call that draws nothing cannot break a run: the plan is not a row (#117) */
	it("is not broken by the plan's own bookkeeping", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				called("t1", "Edit", { file_path: `${ROOT}/design/frames/home/frame.tsx` }),
				called("p1", "TaskUpdate", { taskId: "1", status: "completed" }),
				called("t2", "Edit", { file_path: `${ROOT}/design/frames/home/frame.tsx` }),
			]),
		);

		expect(lines(entries)).toEqual(["edit home ×2"]);
	});

	/** never two files, which is the clause that has never had to fire in a capture */
	it("never spans two frames", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				called("t1", "Edit", { file_path: `${ROOT}/design/frames/home/frame.tsx` }),
				called("t2", "Edit", { file_path: `${ROOT}/design/frames/cart/frame.tsx` }),
				called("t3", "Edit", { file_path: `${ROOT}/design/frames/cart/frame.tsx` }),
			]),
		);

		expect(lines(entries)).toEqual(["edit home", "edit cart ×2"]);
	});
});

describe("a call that went outside", () => {
	const meta = {
		kind: "called" as const,
		id: "t1",
		tool: "mcp__claude_ai_Notion__notion-search",
		input: { query: "tokens" },
		foreign: {
			server: "Notion",
			tool: "Notion-Search",
			iconUrl: "https://www.google.com/s2/favicons?domain=notion.com&sz=64",
		},
		parent: null,
	};

	/**
	 * `ask <Server>`, off the metadata riding with the call. Spool never invents the
	 * noun and never parses the wire name for one: the server slot is the binary's own
	 * word, and `ask` is spool's own verb so no connector author can break the one mark
	 * that says the agent left the building.
	 */
	it("is `ask <Server>`, with the wire name behind the disclosure", () => {
		const { entries } = transcriptOf("find the tokens", stamp([ready, waiting, speaking, meta, result("t1")]));

		expect(lines(entries)).toEqual(["ask Notion"]);
		expect(rows(entries)[0]).toMatchObject({
			detail: "mcp__claude_ai_Notion__notion-search",
			foreign: { server: "Notion", tool: "Notion-Search", raw: "mcp__claude_ai_Notion__notion-search" },
		});
	});

	/** a local-first canvas must not tell a favicon service which connectors you have */
	it("drops the icon rather than carrying it", () => {
		const { entries } = transcriptOf("go", stamp([ready, meta]));

		expect(JSON.stringify(rows(entries))).not.toContain("favicon");
	});

	/**
	 * The metadata rides with the whole call, so until it lands spool has no word for
	 * the row — and the wire name is not one it will print. #142 settled that
	 * `mcp__claude_ai_Notion__notion-search` exists exactly once in this interface, one
	 * click down.
	 */
	it("waits for the name rather than drawing its wire name", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				{ kind: "call", id: "t1", block: 1, tool: "mcp__claude_ai_Notion__notion-search", parent: null },
				{ kind: "call-input", block: 1, fragment: '{"query": "tokens"}', parent: null },
			]),
		);

		expect(rows(entries)).toEqual([]);
	});

	/** a runtime that names the tool and not the server degrades rather than guessing */
	it("puts the tool's own name in the subject when no server is named", () => {
		const { entries } = transcriptOf(
			"go",
			// the wire's own shape: a field it has nothing for is absent rather than null
			stamp([ready, { ...meta, foreign: { tool: "Search Files" } }]),
		);

		expect(lines(entries)).toEqual(["ask Search Files"]);
	});

	/**
	 * A runtime that names neither leaves the subject empty. The row still says the
	 * agent went outside, and the wire name stays where #142 put it: once, one click
	 * down, and never on a line.
	 */
	it("says only `ask` rather than falling back to the wire name", () => {
		const { entries } = transcriptOf("go", stamp([ready, { ...meta, foreign: {} }]));

		expect(lines(entries)).toEqual(["ask"]);
		expect(rows(entries)[0]).toMatchObject({ detail: "mcp__claude_ai_Notion__notion-search" });
	});
});

describe("the calls the log is not a receipt for", () => {
	/**
	 * A plan is written in nine seconds and then runs for nine minutes, and a question
	 * has not happened yet: both outlive the call that made them, so both leave the
	 * transcript for a place of their own (#117, #145). What matters here is that
	 * neither leaves a wire name on a line in the meantime, and that the plan's own line
	 * is one however many calls wrote the list.
	 */
	it("draw one line for the plan and none at all for the rest", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				called("p1", "TaskCreate", { subject: "Write the frame", activeForm: "Writing the frame" }),
				called("p2", "TaskCreate", { subject: "Shoot it", activeForm: "Shooting it" }),
				called("p3", "TaskUpdate", { taskId: "1", status: "in_progress" }),
				called("q1", "AskUserQuestion", { questions: [{ question: "Which currency?", options: [] }] }),
				called("t1", "Read", { file_path: `${ROOT}/design/frames/cart/frame.tsx` }),
			]),
		);

		expect(lines(entries)).toEqual(["plan 2 tasks", "read cart"]);
	});

	/** and the one question in the captures is the case that caught it */
	it("leave nothing behind in the capture that holds one", () => {
		const seen = replay("claude-mcp");
		const asked = seen.filter(({ event }) => event.kind === "called" && event.tool === "AskUserQuestion");

		expect(asked).toHaveLength(1);
		expect(lines(rowsOf("claude-mcp"))).not.toContain("askuserquestion");
	});
});

/**
 * The plan is the one thing a turn produces that outlives the call that made it, so
 * it is the one exception to the one-line rule: the list leaves the log for a strip
 * of its own and only the line saying it was written stays behind (#117, #194).
 */
describe("the plan", () => {
	const create = (id: string, subject: string, activeForm: string) =>
		called(id, "TaskCreate", { subject, description: "…", activeForm });
	const move = (id: string, task: string, status: string) => called(id, "TaskUpdate", { taskId: task, status });

	it("is absent from a turn that never writes one", () => {
		expect(
			transcriptOf("go", stamp([ready, called("t1", "Read", { file_path: `${ROOT}/AGENTS.md` })])).plan,
		).toBeNull();
	});

	/** the count is the receipt and it climbs, because seven creates are seven events */
	it("counts its tasks in as they are written", () => {
		const written = [
			create("p1", "Author the home frame", "Authoring the home frame"),
			create("p2", "Shoot it and read the shot back", "Verifying the frame"),
		];
		const upTo = (upto: number) => transcriptOf("go", stamp([ready, ...written.slice(0, upto)]));

		expect(upTo(0).plan).toBeNull();
		expect(lines(upTo(1).entries)).toEqual(["plan 1 task"]);
		expect(upTo(1).plan).toMatchObject({ total: 1, done: 0, running: null });
		expect(lines(upTo(2).entries)).toEqual(["plan 2 tasks"]);
		expect(upTo(2).plan?.total).toBe(2);
	});

	/**
	 * Both phrasings are the agent's own: the written form the list reads in, and the
	 * present participle it supplies alongside precisely so that a surface never has to
	 * invent a friendlier one for a task in flight.
	 */
	it("reads a running task in the agent's own present participle and never in spool's", () => {
		const { plan } = transcriptOf(
			"go",
			stamp([
				ready,
				create("p1", "Author the home frame", "Authoring the home frame"),
				create("p2", "Shoot it and read the shot back", "Verifying the frame"),
				move("p3", "1", "completed"),
				move("p4", "2", "in_progress"),
			]),
		);

		expect(plan).toEqual({
			total: 2,
			done: 1,
			running: "Verifying the frame",
			tasks: [
				{ key: "task:1", name: "Author the home frame", state: "done" },
				{ key: "task:2", name: "Verifying the frame", state: "running" },
			],
		});
	});

	/** written down and not started is the one place a row in this rail is pending */
	it("leaves a task nobody has started pending", () => {
		const { plan } = transcriptOf("go", stamp([ready, create("p1", "Wire the flow graph", "Wiring the flow graph")]));

		expect(plan?.tasks.map((task) => task.state)).toEqual(["pending"]);
	});

	/** the list is the object, so a move is the list changing and never a line */
	it("draws no line when a task moves", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				create("p1", "Author the home frame", "Authoring the home frame"),
				move("p2", "1", "in_progress"),
			]),
		);

		expect(lines(entries)).toEqual(["plan 1 task"]);
	});

	/** a window that opens after the list was written has nothing to move */
	it("moves nothing when the update names a task this stream never saw written", () => {
		const { entries, plan } = transcriptOf("go", stamp([ready, move("p1", "3", "completed")]));

		expect(plan).toBeNull();
		expect(lines(entries)).toEqual([]);
	});

	/**
	 * Per thread, for the reason a run is (#135): the shelf belongs to the conversation,
	 * so a delegate that writes its own list keeps it inside its own transcript rather
	 * than merging its tasks into the strip above the log. No capture holds one — 0 of 7 —
	 * which is exactly why the rule is asserted rather than assumed.
	 */
	it("keeps a delegate's own list out of the conversation's strip", () => {
		const { entries, plan } = transcriptOf(
			"go",
			stamp([
				ready,
				called("d1", "Agent", { description: "Design cart--empty" }),
				called("p1", "TaskCreate", { subject: "Author the frame", activeForm: "Authoring the frame" }, "d1"),
				called("p2", "TaskUpdate", { taskId: "1", status: "in_progress" }, "d1"),
			]),
		);
		const delegation = rows(entries)[0];

		expect(plan).toBeNull();
		expect(lines(entries)).toEqual(["delegate Design cart--empty"]);
		expect(lines(delegation?.delegated ?? [])).toEqual(["plan 1 task"]);
	});

	/**
	 * The nine-minute turn, replayed: seven tasks written in nine seconds and then moved
	 * across the rest of it. `0/7 Setting up tokens, fonts, and scenario seed` becomes
	 * `1/7 Authoring the home frame` sixteen rows further down the log, which is what a
	 * transcript cannot hold — and the reading in between is honest, because for a moment
	 * one task has landed and the agent has not said which is next.
	 */
	it("goes on changing while the log grows past the line that wrote it", () => {
		const seen = replay("claude-plan");
		const readings: string[] = [];
		const below: number[] = [];
		for (let upto = 1; upto <= seen.length; upto += 1) {
			const { entries, plan } = transcriptOf("go", seen.slice(0, upto));
			if (plan === null) continue;
			const reading = `${plan.done}/${plan.total} ${plan.running ?? "—"}`;
			if (readings.at(-1) === reading) continue;
			readings.push(reading);
			const drawn = rows(entries);
			below.push(drawn.length - 1 - drawn.findIndex((row) => row.verb === "plan"));
		}

		expect(readings.slice(-3)).toEqual([
			"0/7 Setting up tokens, fonts, and scenario seed",
			"1/7 —",
			"1/7 Authoring the home frame",
		]);
		// the count climbs as the list is written, and then the phrasing carries it
		expect(readings.slice(0, 7)).toEqual(["0/1 —", "0/2 —", "0/3 —", "0/4 —", "0/5 —", "0/6 —", "0/7 —"]);
		// and by the time it last changed, sixteen rows sat between it and the line in the
		// log that says it was written: a log would have carried it off the top
		expect(below.at(-1)).toBe(16);
		expect(lines(rowsOf("claude-plan"))).toContain("plan 7 tasks");
	});

	/** the same seven, written into a turn that never got around to starting one */
	it("says nothing is running when nothing has been started", () => {
		expect(transcriptOf("go", replay("claude-turn")).plan).toMatchObject({ total: 7, done: 0, running: null });
	});

	/** two updates and no creates: this window opened after the list was written */
	it("has no list in the window that only moves one", () => {
		const seen = replay("claude-edits");
		const moves = seen.filter(({ event }) => event.kind === "called" && event.tool === "TaskUpdate");

		expect(moves).toHaveLength(2);
		expect(transcriptOf("go", seen).plan).toBeNull();
		expect(lines(rowsOf("claude-edits")).some((line) => line.startsWith("plan"))).toBe(false);
	});
});

/**
 * A screenshot does not earn a place off the line the way the plan does: it is fixed
 * at the one moment it was taken. So it is the payload of the row that read it, and
 * roughly 150 KB of base64 is why it must never reach the line itself (#117).
 */
describe("a picture a call handed back", () => {
	const look = called("t1", "Read", { file_path: `${ROOT}/design/.spool/verify/home.png` });
	const png = (data: string) => result("t1", { images: [{ media: "image/png", data }] });

	it("rides one field below the line, with the path still behind the disclosure", () => {
		const { entries } = transcriptOf("go", stamp([ready, look, png("iVBORw0KGgo")]));

		expect(rows(entries)).toEqual([
			{
				key: "row:t1",
				kind: "row",
				state: "done",
				verb: "look",
				subject: "home",
				frame: "home",
				count: 1,
				detail: "design/.spool/verify/home.png",
				shot: { media: "image/png", data: "iVBORw0KGgo" },
				foreign: null,
				parent: null,
				delegated: [],
			},
		]);
	});

	/** 150 KB of base64 on a line would be the end of the line as a receipt */
	it("keeps the bytes out of every word the line is made of", () => {
		const data = "iVBORw0KGgo".repeat(14_000);
		const row = rows(transcriptOf("go", stamp([ready, look, png(data)])).entries)[0];

		expect(row?.shot?.data).toHaveLength(data.length);
		for (const word of [row?.verb, row?.subject, row?.detail]) expect(word).not.toContain("iVBORw0KGgo");
	});

	it("is absent from a call that handed one nothing back", () => {
		expect(rows(transcriptOf("go", stamp([ready, look, result("t1")])).entries)[0]?.shot).toBeNull();
	});

	/**
	 * Four in the edits window and one in each of the two plan windows, every one of them
	 * a `spool shot` the agent read back off `.spool/verify/<frame>.png`. So the row says
	 * which frame it looked at and never says `.png` at all.
	 */
	it("comes back on the look rows of every capture that holds one", () => {
		for (const [capture, count] of [
			["claude-edits", 4],
			["claude-plan", 1],
			["claude-turn", 1],
		] as const) {
			const shown = deep(transcriptOf("go", replay(capture)).entries).filter((row) => row.shot !== null);

			expect(shown).toHaveLength(count);
			for (const row of shown) {
				expect(row).toMatchObject({ verb: "look", subject: "home", frame: "home", shot: { media: "image/png" } });
				expect(row.detail).toBe("design/.spool/verify/home.png");
			}
		}
	});
});

describe("a search for a tool that is not spool's", () => {
	const search = (id: string, query: string) => called(id, "ToolSearch", { query, max_results: 10 });

	/**
	 * The two-step is machinery and the log holds work on the project, so a search that
	 * answered draws nothing. An empty one is the exception and the whole reason the
	 * rule exists: a connector nobody has signed in to offers no failing tool, it
	 * offers no tool, so this row is the only trace it leaves anywhere.
	 */
	it("draws only when it comes back with nothing", () => {
		const answered = transcriptOf(
			"go",
			stamp([
				ready,
				search("t1", "notion search page"),
				result("t1", { tools: ["mcp__claude_ai_Notion__notion-search"] }),
			]),
		);
		const empty = transcriptOf(
			"go",
			stamp([ready, search("t2", "+figma get code"), result("t2", { text: "No matching deferred tools found" })]),
		);

		expect(rows(answered.entries)).toEqual([]);
		expect(rows(empty.entries)).toEqual([
			{
				key: "row:t2",
				kind: "row",
				state: "failed",
				verb: "find",
				subject: "+figma get code",
				frame: null,
				count: 1,
				detail: "No matching deferred tools found",
				shot: null,
				foreign: null,
				parent: null,
				delegated: [],
			},
		]);
	});
});

describe("how a row settles", () => {
	const read = called("t1", "Read", { file_path: `${ROOT}/design/frames/cart/frame.tsx` });

	/** the tool ran and its own output is the error, so the mark is two strokes crossing */
	it("failed when the wire says the call failed", () => {
		const { entries } = transcriptOf("go", stamp([ready, read, result("t1", { failed: true, text: "not found" })]));

		expect(rows(entries)[0]).toMatchObject({ state: "failed", detail: "not found" });
	});

	/**
	 * The wire cannot tell a stop from a permission denial by the error alone, because
	 * both stamp the same denial kind. What separates them is the non-execution kind:
	 * the developer stopped this one, so it did not fail and it did not run.
	 */
	it("stopped when the non-execution kind says the developer stopped it", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				read,
				result("t1", {
					failed: true,
					nonExecution: "user-rejected",
					text: "The user doesn't want to proceed with this tool use.",
				}),
			]),
		);

		// and the row keeps its own path: what the binary writes there is addressed to
		// the model, so drawing it reports the developer's own press back at them
		expect(rows(entries)[0]).toMatchObject({ state: "stopped", detail: "design/frames/cart/frame.tsx" });
	});

	/** a rule refused it, which is a fault the agent ran into rather than a hand */
	it("failed when a rule refused the call, in the developer's own words", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				read,
				result("t1", { failed: true, nonExecution: "permission-rule", text: "Skip Drive — use Notion only." }),
			]),
		);

		expect(rows(entries)[0]).toMatchObject({ state: "failed", detail: "Skip Drive — use Notion only." });
	});

	/** spool never claims something errored when it simply never ran */
	it("stops rather than fails when the turn ends with it still in flight", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				read,
				{ kind: "ended", ending: "stopped", reason: "aborted_streaming", stopReason: null, parent: null },
			]),
		);

		expect(rows(entries)[0]).toMatchObject({ state: "stopped" });
	});

	/**
	 * A delegation's own result is the launch receipt — measured at 84ms, against a
	 * task that outlives it by minutes — so the row settles on the task instead.
	 */
	it("holds a delegation open until its task reports, not until its call returns", () => {
		const events = stamp([
			ready,
			called("d1", "Agent", { description: "Design cart--empty", subagent_type: "designer" }),
			{
				kind: "task-started",
				task: "a5e0",
				call: "d1",
				description: null,
				agent: "designer",
				prompt: null,
				parent: null,
			},
			result("d1", { text: "Async agent launched successfully." }),
			{ kind: "task-done", task: "a5e0", status: "completed", summary: null, parent: null },
		]);

		expect(rows(transcriptOf("go", events.slice(0, 4)).entries)[0]).toMatchObject({
			verb: "delegate",
			subject: "Design cart--empty",
			state: "running",
		});
		expect(rows(transcriptOf("go", events).entries)[0]).toMatchObject({ state: "done" });
	});
});

describe("what a delegate does", () => {
	/**
	 * Its rows reach the transcript inside the row that delegated it: a sub-agent is one
	 * row that expands into its own transcript (#194), so a fan-out is one line per
	 * delegate until somebody wants more. They reach it at all because for a delegate
	 * the place is the canvas — a frame it writes lands out there, and the row is how you
	 * get to it (#143).
	 */
	it("is one row that expands into its own transcript", () => {
		const { entries } = transcriptOf(
			"three takes on the cart",
			stamp([
				ready,
				called("d1", "Agent", { description: "Design cart--empty" }),
				called("t1", "Write", { file_path: `${ROOT}/design/frames/cart--empty/frame.tsx` }, "d1"),
				result("t1", { parent: "d1" }),
			]),
		);

		// one line in the log, and the delegate's own work one click down inside it
		expect(lines(entries)).toEqual(["delegate Design cart--empty"]);
		expect(rows(entries).map((row) => row.parent)).toEqual([null]);
		expect(lines(rows(entries)[0]?.delegated ?? [])).toEqual(["write cart--empty"]);
		expect(rows(entries)[0]?.delegated.map((theirs) => theirs.parent)).toEqual(["d1"]);
	});

	/**
	 * Its live step, which is a snapshot rather than a log: sixty-seven of them land in
	 * the fan-out against twelve rows, so it is what a delegation says about itself
	 * between the rows it draws. It replaces rather than appends, and it goes the moment
	 * the task lands, because by then its rows are under it and its frames are out on the
	 * canvas.
	 */
	it("says where it is between the rows it draws, and stops when it lands", () => {
		const step = (description: string): AgentEvent => ({
			kind: "task-step",
			task: "a1",
			call: "d1",
			description,
			lastTool: "Write",
			parent: null,
		});
		const upTo = (count: number) =>
			rows(
				transcriptOf(
					"go",
					stamp([
						ready,
						called("d1", "Agent", { description: "Design cart--empty" }),
						{
							kind: "task-started",
							task: "a1",
							call: "d1",
							description: "d",
							agent: "designer",
							prompt: "…",
							parent: null,
						},
						step("Reading design/frames/cart/frame.tsx"),
						step("Writing design/frames/cart--empty/frame.tsx"),
						{ kind: "task-done", task: "a1", status: "completed", summary: "done", parent: null },
					]).slice(0, count),
				).entries,
			)[0];

		expect(upTo(4)?.detail).toBe("Reading design/frames/cart/frame.tsx");
		expect(upTo(5)?.detail).toBe("Writing design/frames/cart--empty/frame.tsx");
		expect(upTo(6)).toMatchObject({ detail: null, state: "done" });
	});

	/** a row spool cannot file under anything stays in the log rather than being dropped */
	it("keeps a row in the log when the call that delegated it was never seen", () => {
		const { entries } = transcriptOf(
			"go",
			stamp([ready, called("t1", "Write", { file_path: `${ROOT}/design/frames/cart--empty/frame.tsx` }, "d9")]),
		);

		expect(lines(entries)).toEqual(["write cart--empty"]);
		expect(rows(entries)[0]?.parent).toBe("d9");
	});

	/** two delegates writing at once are two runs, not one broken twice */
	it("keeps its own run apart from every other thread's", () => {
		const write = (id: string, frame: string, parent: string) =>
			called(id, "Edit", { file_path: `${ROOT}/design/frames/${frame}/frame.tsx` }, parent);
		const { entries } = transcriptOf(
			"go",
			stamp([
				ready,
				write("a1", "cart--empty", "d1"),
				write("b1", "cart--empty-b", "d2"),
				write("a2", "cart--empty", "d1"),
				write("b2", "cart--empty-b", "d2"),
			]),
		);

		expect(lines(entries)).toEqual(["edit cart--empty ×2", "edit cart--empty-b ×2"]);
	});

	/** it belongs to the frame it writes, not to the log the human is reading */
	it("never reaches the transcript with its words", () => {
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

/**
 * The rules again, against events nobody wrote for them.
 *
 * A hand-built list pins a millisecond and a wire shape; only a recording says the
 * rule survives a real session. Where a claim here is a count it is a count of what
 * is in the repo: the captures are spliced windows and every one of them has content
 * elided, so a distribution belongs to the parent recording and cannot be recomputed
 * from these files.
 */
describe("the two minutes of edits, replayed", () => {
	/** nineteen rows became nine on the parent; twenty-two calls become twelve here */
	it("draws one row per call, with runs of writes collapsed", () => {
		const seen = replay("claude-edits");
		const whole = seen.filter(({ event }) => event.kind === "called");
		const bookkeeping = whole.filter(({ event }) => event.kind === "called" && event.tool.startsWith("Task"));

		expect(whole).toHaveLength(24);
		expect(bookkeeping).toHaveLength(2);
		expect(lines(rowsOf("claude-edits"))).toEqual([
			"write home",
			"shot home",
			"look home",
			// six edits, one row, and the two TaskUpdates that sit inside this window draw
			// nothing at all — a call that draws nothing cannot break a run
			"edit home ×6",
			"logs home",
			"look home",
			"edit home ×4",
			"shot home",
			"look home",
			"edit home ×3",
			"shot home",
			"look home",
		]);
	});

	/** the count is a live receipt rather than a summary written at the end */
	it("climbs the count while the run is happening", () => {
		const seen = replay("claude-edits");
		const climbed: number[] = [];
		for (let upto = 1; upto <= seen.length; upto += 1) {
			const run = rows(transcriptOf("go", seen.slice(0, upto)).entries).find((row) => row.verb === "edit");
			if (run === undefined || climbed.at(-1) === run.count) continue;
			climbed.push(run.count);
			if (run.count === 6) break;
		}

		expect(climbed).toEqual([1, 2, 3, 4, 5, 6]);
	});

	/** every row names the frame it touched, and the path is behind the disclosure */
	it("names one frame and keeps every path off the line", () => {
		const drawn = rowsOf("claude-edits");

		expect(new Set(drawn.map((row) => row.subject))).toEqual(new Set(["home"]));
		expect(new Set(drawn.map((row) => row.frame))).toEqual(new Set(["home"]));
		expect(drawn.filter((row) => row.detail !== null)).toHaveLength(drawn.length);
	});
});

describe("the connector window, replayed", () => {
	/** four calls went outside, and the row says where each of them went */
	it("draws every foreign call as `ask <Server>` and nothing else as `ask`", () => {
		const seen = replay("claude-mcp");
		const outside = seen.filter(({ event }) => event.kind === "called" && event.foreign !== undefined);
		const asked = rowsOf("claude-mcp").filter((row) => row.verb === "ask");

		expect(outside).toHaveLength(4);
		expect(asked.map((row) => row.subject)).toEqual(["Notion", "Google Drive", "Google Drive", "Google Drive"]);
		// the server's own name is the subject and the wire name is one click down, so
		// `mcp__` appears exactly once per row and never on the line
		for (const row of asked) {
			expect(row.detail === null || row.foreign?.raw === row.detail || !row.detail.startsWith("mcp__")).toBe(true);
			expect(row.verb).toBe("ask");
			expect(row.subject).not.toContain("mcp__");
		}
		expect(JSON.stringify(rowsOf("claude-mcp"))).not.toContain("favicon");
	});

	/**
	 * Four searches, one row. Asked for Figma the agent searched, got nothing back, and
	 * said nothing about it anywhere in the capture — so this row is the only place the
	 * connector nobody had signed in to is visible at all.
	 */
	it("draws the one search that came back empty and none of the three that answered", () => {
		const seen = replay("claude-mcp");
		const searches = seen.filter(({ event }) => event.kind === "called" && event.tool === "ToolSearch");
		const found = rowsOf("claude-mcp").filter((row) => row.verb === "find");

		expect(searches).toHaveLength(4);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			state: "failed",
			subject: "+figma get code variables styles frame",
			detail: "No matching deferred tools found",
		});
	});

	/** the refused Drive search is a cross, in the sentence the developer typed */
	it("fails the call a rule refused", () => {
		const refused = rowsOf("claude-mcp").filter((row) => row.state === "failed" && row.verb === "ask");

		expect(refused).toHaveLength(1);
		expect(refused[0]).toMatchObject({ subject: "Google Drive", detail: "Skip Drive — use Notion only." });
	});

	/** three writes to three files are three rows: the run's own clause, firing */
	it("keeps three consecutive writes to three different files apart", () => {
		expect(lines(rowsOf("claude-mcp")).filter((line) => line.startsWith("write"))).toEqual([
			"write tokens.css",
			"write fonts.css",
			"write receipt",
		]);
	});
});

describe("the stopped turn, replayed", () => {
	/**
	 * The interrupt stamps the call it caught with the same denial kind a permission
	 * decline gets, so a rail that forked on the error alone would draw a cross and say
	 * a `read` failed. It did not fail and it did not run.
	 */
	it("stops the call the press caught rather than failing it", () => {
		const drawn = rowsOf("claude-interrupt");

		expect(lines(drawn)).toEqual([
			"run List project root and design folder contents",
			"read probe.txt",
			"read CLAUDE.md",
			// cut mid-argument, which is beat one of the three and needed no case of its own
			"read",
		]);
		expect(drawn.map((row) => row.state)).toEqual(["done", "done", "stopped", "stopped"]);
		// nothing in this capture ever errored, and nothing draws a cross
		expect(drawn.some((row) => row.state === "failed")).toBe(false);
	});
});

describe("the fan-out, replayed", () => {
	/**
	 * Three delegates, three rows, and every one of their own rows inside the row that
	 * launched it. The log is the three lines and the two the parent drew itself; the
	 * twelve writes are one click down each.
	 */
	it("is three rows that expand, and the log is those three lines", () => {
		const drawn = rowsOf("claude-fanout");
		const delegations = drawn.filter((row) => row.verb === "delegate");

		expect(delegations).toHaveLength(3);
		// nothing tagged to a delegate is loose in the log: every one of them is inside its
		// own delegation, which is what makes a fan-out one line per sub-agent
		expect(drawn.filter((row) => row.parent !== null)).toEqual([]);
		expect(new Set(delegations.flatMap((row) => row.delegated.map((theirs) => theirs.parent))).size).toBe(3);
		expect(delegations.flatMap((row) => row.delegated).length).toBeGreaterThan(drawn.length);
	});

	/**
	 * A fan-out is uneven and its order is not the one you would write down: the three
	 * designers land their first writes minutes apart, and `cart--empty-c` lands its
	 * before `cart--empty-b` does. Whoever finishes first arrives first, so nothing here
	 * sorts them and the log is read forward one event at a time to see it.
	 */
	it("lands the three delegates' frames as they finish rather than in a tidy order", () => {
		const seen = replay("claude-fanout");
		/** the frames the delegates write, in the order each one first reaches the log */
		const appeared: string[] = [];
		for (let upto = 1; upto <= seen.length; upto += 1) {
			for (const row of deep(transcriptOf("go", seen.slice(0, upto)).entries)) {
				if (row.verb !== "write" || row.frame === null || appeared.includes(row.frame)) continue;
				appeared.push(row.frame);
			}
			if (appeared.length === 3) break;
		}

		expect(appeared).toEqual(["cart--empty", "cart--empty-c", "cart--empty-b"]);
		// and that is not the order the folder sorts them in, which is the whole finding
		expect(appeared).not.toEqual([...appeared].sort());
	});

	/** each delegate's own transcript keeps every rule the parent's log keeps */
	it("collapses each delegate's writes to its own frame inside its own row", () => {
		const delegations = rowsOf("claude-fanout").filter((row) => row.verb === "delegate");

		expect(delegations.map((row) => lines(row.delegated).filter((line) => line.startsWith("write")))).toEqual([
			["write cart--empty ×2", "write cart--empty", "write cart--empty"],
			["write cart--empty-b ×2"],
			["write cart--empty-c ×2"],
		]);
	});

	/**
	 * Two errored `Edit`s have sat in this fixture since the first capture and the rail
	 * drew a check on both of them: it had no failed state at all until #142. Neither
	 * carries a non-execution kind, so both ran and both failed, and the mark is two
	 * strokes crossing rather than one flat one.
	 */
	it("crosses the two calls that ran and failed", () => {
		const seen = replay("claude-fanout");
		const errored = seen.filter(({ event }) => event.kind === "result" && event.failed);
		const stamped = seen.filter(({ event }) => event.kind === "result" && event.nonExecution !== undefined);
		const failed = deep(rowsOf("claude-fanout")).filter((row) => row.state === "failed");

		expect(errored).toHaveLength(2);
		expect(stamped).toEqual([]);
		expect(failed).toHaveLength(2);
		for (const row of failed) {
			expect(row).toMatchObject({ verb: "edit", parent: expect.any(String) });
			// the tool's own account of why, which outranks the path the row was holding
			expect(row.detail).toContain("String to replace not found in file.");
		}
		// and no row in this capture is stopped: nobody pressed anything
		expect(deep(rowsOf("claude-fanout")).some((row) => row.state === "stopped" && row.verb !== "delegate")).toBe(
			false,
		);
	});

	/** the delegation that reported is done; the two the window never heard back from are not */
	it("settles a delegation on its task rather than on its launch", () => {
		const delegations = rowsOf("claude-fanout").filter((row) => row.verb === "delegate");

		expect(delegations.map((row) => row.state)).toEqual(["done", "stopped", "stopped"]);
	});
});

describe("every capture, replayed whole", () => {
	for (const capture of CAPTURES) {
		it(`draws ${capture} in spool's own nouns`, () => {
			const { entries, over } = transcriptOf("make these consistent", replay(capture));
			// every delegate's own transcript included, since its rows keep every rule the
			// parent's do — for a delegate the place is the canvas too (#143, #194)
			const drawn = deep(entries);

			for (const row of drawn) {
				// the surface speaks frames and pages: a path never reaches a line, and a row
				// that names a frame names one the project could take you to
				expect(row.subject ?? "").not.toContain("/");
				expect(row.verb).not.toContain("/");
				// nor does a wire name, which lives behind the disclosure and nowhere else
				expect(`${row.verb} ${row.subject ?? ""}`).not.toContain("mcp__");
				expect(row.frame === null || row.frame === row.subject).toBe(true);
				// a work row is never pending: a call is running from the moment its block opens
				expect(row.state).not.toBe("pending");
				expect(row.count).toBeGreaterThan(0);
				// and a picture stays one field below the line, never on it: a screenshot is
				// roughly 150 KB of base64 and the row above it already said `look`
				expect(`${row.verb} ${row.subject ?? ""} ${row.detail ?? ""}`).not.toContain("iVBORw0KGgo");
			}
			// nothing is left turning once the stream is over. Two of these windows were cut
			// with the turn still going, and a run still open is what that honestly looks
			// like — the next write would still have joined it.
			if (over) expect(drawn.filter((row) => row.state === "running")).toEqual([]);
			else expect(drawn.filter((row) => row.state === "running").length).toBeLessThanOrEqual(1);
		});

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
