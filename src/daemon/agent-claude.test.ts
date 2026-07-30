import { describe, expect, it } from "vitest";
import { CAPTURES, readCapture } from "../test-helpers";
import { CLAUDE_QUIET, createClaudeAdapter } from "./agent-claude";
import type { AgentEvent } from "./agent-events";

/** How a wire line names itself, which is what the quiet list is written in. */
function wireKey(raw: unknown): string {
	const line = raw as {
		type?: string;
		subtype?: string;
		event?: { type?: string; delta?: { type?: string } };
	};
	let key = line.type ?? "unknown";
	if (line.subtype !== undefined) key += `/${line.subtype}`;
	if (line.type === "stream_event") {
		key += `/${line.event?.type ?? "unknown"}`;
		if (line.event?.delta?.type !== undefined) key += `:${line.event.delta.type}`;
	}
	return key;
}

function project(capture: string): AgentEvent[] {
	const adapter = createClaudeAdapter();
	return readCapture(capture).flatMap((raw) => adapter.read(JSON.stringify(raw)));
}

/**
 * What the adapter deliberately does not model yet, per capture.
 *
 * `control_response` is the model list and the usage windows answering requests
 * spool does not yet make, which are their own tickets. They arrive as `other`
 * carrying their payload rather than as a crash, which is the whole point: a
 * shape spool has no member for costs a blank row.
 */
const UNMODELLED: Readonly<Record<string, readonly string[]>> = {
	"claude-turn": ["system/background_tasks_changed"],
	"claude-plan": ["system/background_tasks_changed"],
	"claude-edits": [],
	"claude-fanout": ["system/background_tasks_changed"],
	"claude-mcp": ["control_response", "system/hook_response", "system/hook_started"],
	"claude-interrupt": ["control_response", "system/hook_response", "system/hook_started"],
	"claude-compact": ["system/hook_response", "system/hook_started", "system/status"],
};

describe("replaying the captures", () => {
	it.each(CAPTURES)("replays %s without loss or crash", (name) => {
		const adapter = createClaudeAdapter();
		const silent = new Set<string>();
		let produced = 0;

		for (const raw of readCapture(name)) {
			const events = adapter.read(JSON.stringify(raw));
			produced += events.length;
			if (events.length === 0) silent.add(wireKey(raw));
		}

		expect(produced).toBeGreaterThan(0);
		// a line that says nothing has to be a decision on the quiet list, never a hole
		expect([...silent].filter((key) => !CLAUDE_QUIET.includes(key)).sort()).toEqual([]);
	});

	it.each(CAPTURES)("carries nothing unmodelled in %s beyond what is written down", (name) => {
		const unnamed = [...new Set(project(name).flatMap((event) => (event.kind === "other" ? [event.type] : [])))];

		expect(unnamed.sort()).toEqual([...(UNMODELLED[name] ?? [])].sort());
	});

	it.each(CAPTURES)("reads %s's init as a login rather than a key", (name) => {
		const ready = project(name).find((event) => event.kind === "ready");

		expect(ready).toBeDefined();
		// the whole of the no-keys claim: the spawn reused an existing CLI login
		expect(ready?.kind === "ready" && ready.apiKeySource).toBe("none");
		expect(ready?.kind === "ready" && ready.version).toBe("2.1.220");
	});
});

describe("what the union carries", () => {
	it("feature-detects off the init capabilities", () => {
		const ready = project("claude-mcp").find((event) => event.kind === "ready");

		expect(ready?.kind === "ready" && ready.capabilities).toEqual([
			"interrupt_receipt_v1",
			"interrupt_cancel_queued_v1",
			"msg_lifecycle_v1",
		]);
		expect(ready?.kind === "ready" && ready.permissionMode).toBe("default");
	});

	it("gives thinking a count and never prose, because the wire sends an empty string", () => {
		const thoughts = project("claude-turn").filter((event) => event.kind === "thinking");

		expect(thoughts.length).toBeGreaterThan(50);
		for (const thought of thoughts) {
			expect(Object.keys(thought)).not.toContain("text");
			expect(typeof thought.tokens).toBe("number");
		}
		// the count climbs across one block rather than restarting per delta
		const climb = thoughts.slice(2, 8).map((thought) => thought.tokens);
		expect(climb).toEqual([0, 50, 150, 300, 400, 500]);
	});

	it("lets the binary's own running count take over when it sends one", () => {
		// claude-edits carries system/thinking_tokens, which is cumulative for the
		// message and lands just before the delta it accounts for
		const climb = project("claude-edits")
			.filter((event) => event.kind === "thinking")
			.slice(0, 3)
			.map((event) => event.tokens);

		expect(climb).toEqual([0, 50, 85]);
	});

	it("opens a tool call with a name and an empty input, then uneven fragments", () => {
		const events = project("claude-turn");
		const at = events.findIndex((event) => event.kind === "call");
		const opened = events[at];
		const fragments = events
			.slice(at + 1)
			.filter((event): event is Extract<AgentEvent, { kind: "call-input" }> => event.kind === "call-input")
			.slice(0, 3);

		expect(opened?.kind === "call" && opened.tool).toBe("TaskCreate");
		expect(opened?.kind === "call" && opened.id).toMatch(/^toolu_/);
		// the block genuinely opens empty; the subject types itself in behind it
		expect(fragments[0]?.fragment).toBe("");
		expect(fragments[1]?.fragment.length).toBeGreaterThan(0);
		// uneven, splitting mid-token — nothing here parses a fragment
		expect(new Set(fragments.map((fragment) => fragment.fragment.length)).size).toBeGreaterThan(1);
	});

	it("names a foreign call with the names the binary sent, and never parses a prefix", () => {
		const foreign = project("claude-mcp").find((event) => event.kind === "called" && event.foreign !== undefined);

		expect(foreign?.kind === "called" && foreign.foreign).toEqual({
			server: "Notion",
			tool: "Notion-Search",
			iconUrl: "https://www.google.com/s2/favicons?domain=notion.com&sz=64",
		});
	});

	it("tells a call that failed from one that never ran", () => {
		const refused = project("claude-mcp").find(
			(event) => event.kind === "result" && event.nonExecution !== undefined,
		);

		expect(refused?.kind === "result" && refused.failed).toBe(true);
		// a rule refused it and the server was never asked, which is a different
		// fact from the server failing
		expect(refused?.kind === "result" && refused.nonExecution).toBe("permission-rule");
	});

	it("carries a picture back inline rather than as a path to fetch", () => {
		const pictures = project("claude-turn").filter((event) => event.kind === "result" && event.images.length > 0);

		expect(pictures.length).toBeGreaterThan(0);
		expect(pictures[0]?.kind === "result" && pictures[0].images[0]?.media).toBe("image/png");
	});

	it("counts the tools a deferred search loaded, so an empty answer is visible", () => {
		const searched = project("claude-mcp").filter((event) => event.kind === "result" && event.tools !== undefined);

		expect(searched.length).toBeGreaterThan(0);
		expect(searched[0]?.kind === "result" && (searched[0].tools ?? []).length).toBeGreaterThan(0);
	});

	it("carries the usage window the binary chose, with no utilization below a warning", () => {
		const limit = project("claude-compact").find((event) => event.kind === "limit");

		expect(limit?.kind === "limit" && limit.limit).toEqual({
			status: "allowed",
			window: "five_hour",
			resetsAt: 1785254400,
			usingOverage: false,
		});
	});

	it("carries a sub-agent's three channels and tags its own turns to their parent", () => {
		const events = project("claude-fanout");
		const started = events.find((event) => event.kind === "task-started");
		const step = events.find((event) => event.kind === "task-step");
		const summary = events.find((event) => event.kind === "task-done" && event.summary !== null);

		expect(started?.kind === "task-started" && started.agent).toBe("designer");
		expect(started?.kind === "task-started" && (started.prompt ?? "").length).toBeGreaterThan(0);
		expect(step?.kind === "task-step" && step.lastTool).toBe("Bash");
		expect(step?.kind === "task-step" && step.description).toBe("Running Run spool skill");
		expect(summary?.kind === "task-done" && summary.status).toBe("completed");
		// the delegate's own turns reach the parent stream tagged with the call
		// that launched them, never as deltas
		const delegated = events.filter((event) => event.parent !== null);
		expect(delegated.length).toBeGreaterThan(0);
		expect(delegated.every((event) => event.kind !== "say")).toBe(true);
		expect(new Set(delegated.map((event) => event.parent)).size).toBe(3);
	});

	it("tells an interrupted turn from a clean one by its terminal reason", () => {
		const stopped = project("claude-interrupt").find((event) => event.kind === "ended");
		const clean = project("claude-fanout").find((event) => event.kind === "ended");

		expect(stopped?.kind === "ended" && stopped.ending).toBe("stopped");
		expect(stopped?.kind === "ended" && stopped.reason).toBe("aborted_streaming");
		expect(clean?.kind === "ended" && clean.ending).toBe("done");
		expect(clean?.kind === "ended" && clean.reason).toBe("completed");
	});

	it("reads a compaction as its own two beats", () => {
		const events = project("claude-compact");

		expect(events.some((event) => event.kind === "compacting")).toBe(true);
		const compacted = events.find((event) => event.kind === "compacted");
		expect(compacted?.kind === "compacted" && compacted.trigger).toBe("manual");
		expect(compacted?.kind === "compacted" && compacted.droppedTokens).toBe(87203);
	});
});

describe("tolerance", () => {
	it("takes an event type nobody modelled rather than failing on it", () => {
		const adapter = createClaudeAdapter();

		const events = adapter.read(JSON.stringify({ type: "sonar_ping", ping: 1 }));

		expect(events).toEqual([
			{ kind: "other", type: "sonar_ping", parent: null, vendor: { type: "sonar_ping", ping: 1 } },
		]);
	});

	it("takes a stream event and a system subtype nobody modelled", () => {
		const adapter = createClaudeAdapter();

		expect(adapter.read(JSON.stringify({ type: "system", subtype: "weather" }))[0]?.kind).toBe("other");
		expect(adapter.read(JSON.stringify({ type: "stream_event", event: { type: "message_pause" } }))[0]).toMatchObject(
			{
				kind: "other",
				type: "stream_event/message_pause",
			},
		);
	});

	it("takes a line that is not JSON at all", () => {
		const adapter = createClaudeAdapter();

		expect(adapter.read("Warning: something on stdout")).toEqual([
			{ kind: "other", type: "unparsed", parent: null, vendor: "Warning: something on stdout" },
		]);
	});
});
