import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../daemon/agent-events";
import { shortNames } from "./agent-companion";
import { type Stamped, transcriptOf } from "./agent-transcript";

/** the companions as the turn's own fold reads them, which is the only way they are read */
const companionsOf = (seen: readonly Stamped[]) => transcriptOf([], seen).companions;
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
		// each at its own work, which its placeholder and its tile show rather than a square (#369);
		// and a name is never the name of the frame it stands at (#372)
		expect(two).toMatchObject([
			{ key: "d1", name: "calm", frame: null, spot: { name: "home--calm" }, own: true },
			{ key: "d2", name: null, frame: "home--dense", act: "landed", own: true },
		]);
		const done: AgentEvent = { kind: "task-done", task: "t2", status: "completed", summary: null, parent: null };
		expect(companionsOf(at([...events, done])).map((one) => one.key)).toEqual(["d1"]);
	});

	it("never gives two designers on a page the same name", () => {
		const spot = (name: string, task: string, call: string): AgentEvent => ({
			kind: "spot",
			state: "held",
			name,
			task,
			call,
			x: 0,
			y: 0,
			w: 10,
			h: 10,
			parent: null,
		});
		const names = companionsOf(
			at([ready, spot("hello-calm", "t1", "d1"), spot("hello-loud", "t2", "d2"), spot("hello-loud-2", "t3", "d3")]),
		).map((one) => one.name);
		expect(new Set(names).size).toBe(3);
		expect(names).toEqual(["calm", "loud", "loud 2"]);
	});
});

describe("designers at frames that stand (#372)", () => {
	it("go by their own take, never by the frame they read, and are drawn there", () => {
		const started = (task: string, call: string, description: string): AgentEvent => ({
			kind: "task-started",
			task,
			call,
			description,
			agent: "designer",
			prompt: null,
			parent: null,
		});
		const spot = (name: string, task: string, call: string): AgentEvent => ({
			kind: "spot",
			state: "held",
			name,
			task,
			call,
			x: 0,
			y: 0,
			w: 10,
			h: 10,
			parent: null,
		});
		const read = (id: string, parent: string): AgentEvent => ({
			kind: "called",
			id,
			tool: "Read",
			input: { file_path: `${ROOT}/design/frames/app/home/frame.tsx` },
			parent,
		});
		const companions = companionsOf(
			at([
				ready,
				started("t1", "d1", "Split home"),
				started("t2", "d2", "Calm home"),
				started("t3", "d3", "Tighten the home spacing"),
				spot("ideas/home--split", "t1", "d1"),
				spot("ideas/home--calm", "t2", "d2"),
				read("r1", "d1"),
				read("r2", "d2"),
				read("r3", "d3"),
			]),
		);
		expect(companions).toMatchObject([
			{ key: "d1", frame: "app/home", name: "split", own: false },
			{ key: "d2", frame: "app/home", name: "calm", own: false },
			{ key: "d3", frame: "app/home", name: "tighten", own: false },
		]);
	});

	it("say nothing the frame's own name already says", () => {
		const events: AgentEvent[] = [
			ready,
			{
				kind: "task-started",
				task: "t1",
				call: "d1",
				description: "Tighten home",
				agent: "designer",
				prompt: null,
				parent: null,
			},
			{ kind: "frame", change: "changed", frame: "app/home", lines: 3, call: null, task: "t1", parent: null },
		];
		expect(companionsOf(at(events))).toMatchObject([{ key: "d1", frame: "app/home", name: "tighten", own: false }]);
		const echoing = events.map((event) =>
			event.kind === "task-started" ? { ...event, description: "Home" } : event,
		) as AgentEvent[];
		expect(companionsOf(at(echoing))).toMatchObject([{ key: "d1", name: null }]);
	});
});

describe("short names", () => {
	it("drop the words every take starts with", () => {
		expect(shortNames(["hello-calm", "hello-loud"])).toEqual(["calm", "loud"]);
		expect(shortNames(["calm", "dense", null])).toEqual(["calm", "dense", null]);
	});

	it("take a second word where the first is shared, and a number where there is none", () => {
		expect(shortNames(["calm-dark", "calm-light", "bold"])).toEqual(["calm dark", "calm light", "bold"]);
		expect(shortNames(["calm", "calm"])).toEqual(["calm", "calm 2"]);
		expect(shortNames(["home-calm", "home-calm"])).toEqual(["calm", "calm 2"]);
	});
});
