import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AgentEvent } from "./agent-events";
import { createPiAdapter, PI_PROMPT, PI_STATE, piDeclineLine, piModelValue } from "./agent-pi";

/** the lines pi printed in a recorded rpc session, with spool's own ids on its answers */
function printed(capture: string): string[] {
	const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "captures", `${capture}.json`);
	const steps = JSON.parse(readFileSync(file, "utf8")) as ({ in: { id?: string } } | { out: { id?: string } })[];
	const ids = new Map([
		["spool-1", PI_STATE],
		["spool-2", PI_PROMPT],
	]);
	return steps.flatMap((step) =>
		"out" in step ? [JSON.stringify({ ...step.out, ...(step.out.id ? { id: ids.get(step.out.id) } : {}) })] : [],
	);
}

function read(capture: string): AgentEvent[] {
	const adapter = createPiAdapter();
	return printed(capture).flatMap((line) => adapter.read(line));
}

describe("the pi adapter", () => {
	it("reads a recorded turn into the union: the session, a read call and its result, the words and the end", () => {
		const events = read("pi-turn");
		expect(events[0]).toMatchObject({
			kind: "ready",
			session: "7d0c5b8e-2f4a-4c6e-9a1b-3e5f7a9c1d2b",
			model: "openai-codex/gpt-5.6-luna",
		});
		const kinds = events.map((event) => event.kind);
		expect(kinds.filter((kind) => kind === "other")).toEqual([]);
		expect(kinds.indexOf("call")).toBeLessThan(kinds.indexOf("called"));
		expect(kinds.indexOf("called")).toBeLessThan(kinds.indexOf("result"));
		const called = events.find((event) => event.kind === "called");
		expect(called).toMatchObject({ tool: "read", input: { path: "note.txt" } });
		const result = events.find((event) => event.kind === "result");
		expect(result).toMatchObject({ id: called?.kind === "called" ? called.id : "", failed: false });
		expect(result?.kind === "result" ? result.text : "").toContain("marigold");
		const said = events
			.filter((event) => event.kind === "say")
			.map((event) => (event.kind === "say" ? event.text : ""))
			.join("");
		expect(said).toBe("marigold");
		expect(events.at(-1)).toMatchObject({ kind: "ended", ending: "done", stopReason: "stop" });
		expect(kinds.filter((kind) => kind === "ended")).toHaveLength(1);
	});

	it("says how full the window is after each answer: its tokens over the model's window", () => {
		const events = read("pi-turn");
		// the window get_state names, and the last message's whole prompt and answer
		expect(events.filter((event) => event.kind === "context")).toEqual([
			{ kind: "context", used: 1210, window: 272000, parent: null },
			{ kind: "context", used: 1239, window: 272000, parent: null },
		]);
		// a stopped message carries no usage worth a reading
		expect(
			read("pi-stop")
				.filter((event) => event.kind === "context")
				.every((event) => event.kind === "context" && event.used > 0),
		).toBe(true);
	});

	it("ends a stopped turn as stopped, on pi's own settle rather than the end of a run", () => {
		const events = read("pi-stop");
		expect(events.filter((event) => event.kind === "thinking")).not.toHaveLength(0);
		expect(events.filter((event) => event.kind === "ended")).toEqual([
			expect.objectContaining({ ending: "stopped", stopReason: "aborted" }),
		]);
	});

	it("ends a prompt pi refused, which no settle will follow", () => {
		const adapter = createPiAdapter();
		expect(
			adapter.read(JSON.stringify({ id: PI_PROMPT, type: "response", success: false, error: "No model selected" })),
		).toEqual([{ kind: "ended", ending: "failed", reason: "No model selected", stopReason: null, parent: null }]);
	});

	it("turns an extension's dialog into a request the turn declines, and lets the rest pass", () => {
		const adapter = createPiAdapter();
		const asked = adapter.read(JSON.stringify({ type: "extension_ui_request", id: "ui-1", method: "confirm" }));
		expect(asked).toEqual([{ kind: "elicit", request: "ui-1", parent: null }]);
		expect(adapter.read(JSON.stringify({ type: "extension_ui_request", id: "ui-2", method: "notify" }))).toEqual([]);
		expect(JSON.parse(piDeclineLine("ui-1"))).toEqual({ type: "extension_ui_response", id: "ui-1", cancelled: true });
	});

	it("names a model the way pi's own command line does", () => {
		expect(piModelValue({ id: "qwen3-coder:30b", provider: "ollama" })).toBe("ollama/qwen3-coder:30b");
		expect(piModelValue(undefined)).toBeNull();
	});
});
