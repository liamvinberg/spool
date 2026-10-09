import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../daemon/agent-events";
import { companionsOf } from "./agent-companion";

const at = (events: readonly AgentEvent[]) => events.map((event, index) => ({ at: index, event }));
const ROOT = "/p";
const ready: AgentEvent = {
	kind: "ready",
	session: null,
	model: null,
	cwd: ROOT,
	version: null,
	permissionMode: null,
	apiKeySource: null,
	capabilities: [],
	parent: null,
};

describe("the agent's companions", () => {
	it("is nobody before the agent touches the canvas", () => {
		expect(companionsOf(at([ready]))).toEqual([]);
	});

	it("rides the newest line while a frame streams, as one act however many lines come", () => {
		const one = companionsOf(
			at([ready, { kind: "frame-source", frame: "home", call: "c1", text: "a\n", lines: 1, parent: null }]),
		);
		const many = companionsOf(
			at([
				ready,
				{ kind: "frame-source", frame: "home", call: "c1", text: "a\n", lines: 1, parent: null },
				{ kind: "frame-source", frame: "home", call: "c1", text: "b\nc\n", lines: 3, parent: null },
			]),
		);
		expect(one).toMatchObject([{ key: "", name: null, frame: "home", act: "new", lines: 1 }]);
		expect(many).toMatchObject([{ act: "new", lines: 3, beat: one[0]?.beat }]);
	});

	it("lands, edits and deletes where the witness says the frame changed", () => {
		const frame = (change: "created" | "changed" | "deleted", extra: object = {}): AgentEvent => ({
			kind: "frame",
			change,
			frame: "home",
			lines: 40,
			call: "c1",
			task: null,
			parent: null,
			...extra,
		});
		expect(companionsOf(at([ready, frame("created")]))[0]?.act).toBe("landed");
		expect(companionsOf(at([ready, frame("changed", { range: { from: 4, to: 9 } })]))[0]).toMatchObject({
			act: "edit",
			range: { from: 4, to: 9 },
		});
		expect(companionsOf(at([ready, frame("deleted", { lines: 0 })]))[0]?.act).toBe("delete");
	});

	it("reads while a read of the frame is out, shoots while a shot is, and idles once it lands", () => {
		const read: AgentEvent = {
			kind: "called",
			id: "r1",
			tool: "Read",
			input: { file_path: `${ROOT}/frames/home/index.tsx` },
			parent: null,
		};
		const shot: AgentEvent = {
			kind: "called",
			id: "s1",
			tool: "Bash",
			input: { command: "spool shot home" },
			parent: null,
		};
		const done = (id: string): AgentEvent => ({
			kind: "result",
			id,
			failed: false,
			text: "",
			images: [],
			parent: null,
		});
		expect(companionsOf(at([ready, read]))[0]).toMatchObject({ frame: "home", act: "read" });
		expect(companionsOf(at([ready, read, done("r1")]))[0]?.act).toBe("idle");
		expect(companionsOf(at([ready, shot]))[0]).toMatchObject({ frame: "home", act: "shot" });
	});

	it("waits where it stands when it asks, and goes back to idle once answered", () => {
		const events: AgentEvent[] = [
			ready,
			{ kind: "frame", change: "created", frame: "home", lines: 40, call: "c1", task: null, parent: null },
			{
				kind: "asking",
				request: "q",
				call: "a1",
				tool: "AskUserQuestion",
				display: "AskUserQuestion",
				input: {},
				description: null,
				interaction: true,
				suggestions: [],
				parent: null,
			},
		];
		expect(companionsOf(at(events))[0]?.act).toBe("ask");
		const answered: AgentEvent = { kind: "answered", request: "q", answer: "picked", words: "x", parent: null };
		expect(companionsOf(at([...events, answered]))[0]?.act).toBe("idle");
	});

	it("stays the waiting ring when a write catches up behind the ask, until the asked call is over", () => {
		const events: AgentEvent[] = [
			ready,
			{ kind: "frame", change: "created", frame: "home", lines: 40, call: "c1", task: null, parent: null },
			{
				kind: "asking",
				request: "r",
				call: "b1",
				tool: "Bash",
				display: null,
				input: { command: "npm install dayjs" },
				description: null,
				interaction: false,
				suggestions: [],
				parent: null,
			},
			// the watcher's word on an earlier write, landing after the ask
			{ kind: "frame", change: "changed", frame: "home", lines: 41, call: null, task: null, parent: null },
		];
		expect(companionsOf(at(events))[0]?.act).toBe("ask");
		// and an agent that asked before any frame of its own had landed waits at the one that does
		const first = companionsOf(at([ready, ...events.slice(2)]))[0];
		expect(first?.act).toBe("ask");
		expect(first?.frame).toBe("home");
		const over: AgentEvent = { kind: "result", id: "b1", failed: true, text: "", images: [], parent: null };
		expect(companionsOf(at([...events, over]))[0]?.act).toBe("idle");
	});

	it("gives each designer its own square, named by its take, and lets it go when it reports back", () => {
		const started = (task: string, call: string, description: string): AgentEvent => ({
			kind: "task-started",
			task,
			call,
			description,
			agent: "designer",
			prompt: null,
			parent: null,
		});
		const events: AgentEvent[] = [
			ready,
			started("t1", "d1", "Design calm"),
			started("t2", "d2", "Design dense"),
			{
				kind: "spot",
				state: "held",
				name: "home--calm",
				task: "t1",
				call: "d1",
				x: 0,
				y: 0,
				w: 10,
				h: 10,
				parent: null,
			},
			{ kind: "frame", change: "created", frame: "home--dense", lines: 3, call: null, task: "t2", parent: null },
		];
		const two = companionsOf(at(events));
		expect(two).toMatchObject([
			{ key: "d1", name: "calm", frame: null, spot: { name: "home--calm" } },
			{ key: "d2", name: "dense", frame: "home--dense", act: "landed" },
		]);
		const done: AgentEvent = { kind: "task-done", task: "t2", status: "completed", summary: null, parent: null };
		expect(companionsOf(at([...events, done])).map((one) => one.key)).toEqual(["d1"]);
	});
});
