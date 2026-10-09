import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../daemon/agent-events";
import { turnLayout } from "./agent-rail";
import { type AgentEntry, footed, type Stamped, settledPicture, transcriptOf } from "./agent-transcript";
import { captionOf, clockOf, receiptOf, spokenDuration } from "./agent-turn-foot";

/*
 * A turn's foot (#365): the frames it touched and its one status line, folded off the
 * frame events the daemon reads off design/ and the delegations the engine reports.
 */

const stamp = (events: readonly AgentEvent[]): Stamped[] => events.map((event, at) => ({ at: at * 1000, event }));

const started = (task: string, call: string, description: string): AgentEvent => ({
	kind: "task-started",
	task,
	call,
	description,
	agent: "designer",
	prompt: null,
	parent: null,
});

const held = (task: string, name: string, state: "held" | "released" = "held"): AgentEvent => ({
	kind: "spot",
	state,
	name,
	task,
	call: null,
	x: 0,
	y: 0,
	w: 1440,
	h: 900,
	parent: null,
});

const created = (
	frame: string,
	task: string | null,
	parent: string | null,
	spot?: string,
	call = "b1",
): AgentEvent => ({
	kind: "frame",
	change: "created",
	frame,
	lines: 18,
	call,
	task,
	...(spot === undefined ? {} : { spot }),
	parent,
});

const done = (task: string): AgentEvent => ({
	kind: "task-done",
	task,
	status: "completed",
	summary: null,
	parent: null,
});

const ended: AgentEvent = { kind: "ended", ending: "done", reason: null, stopReason: null, parent: null } as AgentEvent;

describe("the turn's grid", () => {
	it("holds a tile for each designer, fills it with its frame, and settles it with how long it took", () => {
		const events = stamp([
			started("t1", "a1", "Design hello-calm frame"),
			held("t1", "hello-calm"),
			started("t2", "a2", "Design hello-loud frame"),
			held("t2", "hello-loud"),
			{ kind: "holding", tasks: 2, parent: null },
			created("hello-calm", "t1", "a1", "hello-calm"),
			done("t1"),
		]);
		const foot = transcriptOf([], events).foot;

		expect(foot?.tiles.map((tile) => [tile.frame, tile.state])).toEqual([
			["hello-calm", "done"],
			["hello-loud", "reading"],
		]);
		expect(foot?.tiles[0]?.by).toBe("Design hello-calm frame");
		expect(foot?.tiles[0]?.took).toBe(6000);
		expect(foot?.status).toBe("1 designer working, 1 done");
		expect(foot?.ms).toBeNull();
	});

	it("keys a designer's tile by its placeholder on a nested page, one tile from start to frame (#369)", () => {
		const step = (task: string, description: string): AgentEvent => ({
			kind: "task-step",
			task,
			call: null,
			description,
			lastTool: "Bash",
			parent: null,
		});
		const working = [
			started("t1", "a1", "Split home"),
			held("t1", "ideas/home--split"),
			started("t2", "a2", "Calm home"),
			held("t2", "ideas/home--calm"),
			step("t1", "Running Read the home frame and the brief"),
			step("t2", "Running Write the calm frame, then spool check"),
		];
		const reading = transcriptOf([], stamp(working)).foot;
		expect(reading?.tiles).toMatchObject([
			{
				frame: "ideas/home--split",
				state: "reading",
				step: "Running Read the home frame and the brief",
				delegation: "a1",
			},
			{ frame: "ideas/home--calm", state: "reading", delegation: "a2" },
		]);
		expect(reading?.tiles.map((tile) => captionOf(tile))).toEqual(["Reading", "Drawing"]);

		// one frame lands in its placeholder, the other on a page of its designer's own choosing
		const landed = transcriptOf(
			[],
			stamp([
				...working,
				created("ideas/home--split", "t1", "a1", "ideas/home--split"),
				created("app/calm", "t2", "a2", "ideas/home--calm"),
			]),
		).foot;
		expect(landed?.tiles.map((tile) => [tile.frame, tile.state])).toEqual([
			["ideas/home--split", "fresh"],
			["app/calm", "fresh"],
		]);
		expect(landed?.tiles.every((tile) => tile.step === undefined)).toBe(true);
	});

	it("streams a frame the agent writes, then lands it, then rests it when its call returns", () => {
		const source = (lines: number): AgentEvent => ({
			kind: "frame-source",
			frame: "home",
			call: "w1",
			text: "x\n",
			lines,
			parent: null,
		});
		const drawing = transcriptOf([], stamp([source(1), source(2)])).foot;
		expect(drawing?.tiles[0]).toMatchObject({ frame: "home", state: "drawing", lines: 2 });
		expect(drawing?.status).toBe("Drawing home · 2 lines");

		const landed = transcriptOf([], stamp([source(1), created("home", null, null, undefined, "w1")])).foot;
		expect(landed?.tiles[0]?.state).toBe("fresh");

		const rested = transcriptOf(
			[],
			stamp([
				source(1),
				created("home", null, null, undefined, "w1"),
				{ kind: "result", id: "w1", failed: false, text: "", images: [], parent: null } as AgentEvent,
			]),
		).foot;
		expect(rested?.tiles[0]?.state).toBe("done");
	});

	it("keeps what a deleted frame was, and lets go of a spot nothing filled", () => {
		const foot = transcriptOf(
			[],
			stamp([
				started("t1", "a1", "Design hello-calm frame"),
				held("t1", "hello-calm"),
				held("t1", "hello-calm", "released"),
				{
					kind: "frame",
					change: "deleted",
					frame: "old",
					lines: 0,
					source: "export default () => null;\n",
					call: null,
					task: null,
					parent: null,
				},
				done("t1"),
				ended,
			]),
		).foot;

		expect(foot?.tiles.map((tile) => [tile.frame, tile.state])).toEqual([["old", "deleted"]]);
		expect(foot?.tiles[0]?.source).toBe("export default () => null;\n");
		expect(foot?.ending).toBe("done");
		expect(foot?.ms).toBe(5000);
	});

	it("reads the frames a change moved", () => {
		const foot = transcriptOf(
			[],
			stamp([
				{
					kind: "frame",
					change: "changed",
					frame: "home",
					lines: 40,
					range: { from: 3, to: 9 },
					call: "e1",
					task: null,
					parent: null,
				},
			]),
		).foot;
		expect(foot?.tiles[0]).toMatchObject({ state: "editing", range: { from: 3, to: 9 } });
		expect(captionOf(foot?.tiles[0] as NonNullable<typeof foot>["tiles"][number])).toBe("Changed lines 3–9");
	});

	it("settles a foot that leaves its turn mid-flight: what never landed goes, and it reads stopped", () => {
		const foot = transcriptOf(
			[],
			stamp([started("t1", "a1", "Design hello-calm frame"), held("t1", "hello-calm"), created("home", null, null)]),
		).foot;
		const [kept] = settledPicture([foot as AgentEntry]);
		expect(kept?.kind === "turn" && kept.tiles.map((tile) => [tile.frame, tile.state])).toEqual([["home", "done"]]);
		expect(kept?.kind === "turn" && kept.ending).toBe("stopped");
	});
});

describe("the turn's line", () => {
	const call = (id: string, tool: string, input: unknown): AgentEvent => ({
		kind: "called",
		id,
		tool,
		input,
		parent: null,
	});
	const result = (id: string): AgentEvent => ({
		kind: "result",
		id,
		failed: false,
		text: "",
		images: [],
		parent: null,
	});
	const statusOf = (events: readonly AgentEvent[]) => transcriptOf([], stamp(events)).foot?.status;

	it("says what the agent is doing now, in present words", () => {
		expect(statusOf([call("s1", "Bash", { command: "spool skill" })])).toBe("Reading the spool docs");
		expect(statusOf([call("r1", "Read", { file_path: "design/frames/cart/frame.tsx" })])).toBe("Reading cart");
		expect(statusOf([call("e1", "Edit", { file_path: "design/frames/home/frame.tsx" })])).toBe("Editing home");
		expect(statusOf([call("s2", "Bash", { command: "spool shot home cart" })])).toBe("Taking pictures of home, cart");
		expect(statusOf([call("b1", "Bash", { command: "npm i dayjs", description: "Install dayjs" })])).toBe(
			"Installing dayjs",
		);
		expect(
			statusOf([
				call("r1", "Read", { file_path: "design/a.tsx" }),
				call("r2", "Read", { file_path: "design/b.tsx" }),
			]),
		).toBe("Reading 2 files");
	});

	it("says what it last did while it thinks, and never a bare thinking", () => {
		const status = statusOf([
			call("r1", "Read", { file_path: "design/frames/cart/frame.tsx" }),
			result("r1"),
			{ kind: "waiting", parent: null },
		]);
		expect(status).toBe("Thinking after reading cart");
		expect(status).not.toMatch(/^thinking$/i);
	});

	it("says the receipt in words, and the clock in minutes", () => {
		expect(spokenDuration(528_000)).toBe("8m 48s");
		expect(spokenDuration(42_400)).toBe("42s");
		expect(clockOf(296_000)).toBe("4:56");
		const foot = { key: "turn", kind: "turn", tiles: [], status: null, thinking: false } as const;
		expect(receiptOf({ ...foot, ms: 528_000, ending: "done" })).toBe("Done in 8m 48s");
		expect(receiptOf({ ...foot, ms: 62_000, ending: "stopped" })).toBe("Stopped after 1m 02s");
	});

	it("is the turn's last entry above the note that ended it, with the turn's steps behind it", () => {
		const transcript = transcriptOf(
			[{ text: "go" }],
			stamp([
				{ kind: "waiting", parent: null } as AgentEvent,
				{ kind: "say", block: 0, text: "On it.", parent: null } as AgentEvent,
				{ kind: "ended", ending: "stopped", reason: "aborted", stopReason: null, parent: null } as AgentEvent,
			]),
		);
		const entries = footed(transcript);
		expect(entries.map((entry) => entry.kind)).toEqual(["user", "wait", "prose", "turn", "note"]);
		const laid = turnLayout(entries);
		expect(laid.map(({ entry }) => entry.kind)).toEqual(["user", "prose", "turn", "note"]);
		expect(laid[2]?.steps.map((step) => step.kind)).toEqual(["wait"]);
	});

	it("draws a run of thinking between two steps as one line, its time the run's", () => {
		const user: AgentEntry = { key: "a:user", kind: "user", text: "hi", context: null, attached: [] };
		const wait = (n: number, at: number, ms: number | null, state: "done" | "running" = "done"): AgentEntry => ({
			key: `a:wait:${n}`,
			kind: "wait",
			state,
			at,
			ms,
		});
		const row = { key: "a:row", kind: "row" } as unknown as AgentEntry;
		const foot = { key: "turn", kind: "turn", tiles: [], status: null, thinking: false, ms: null, ending: null };
		const laid = turnLayout([
			user,
			wait(0, 0, 900),
			wait(1, 2_000, 1_100),
			row,
			wait(2, 9_000, 500),
			foot as AgentEntry,
		]);
		const steps = laid.find(({ entry }) => entry.kind === "turn")?.steps ?? [];
		expect(steps.map((step) => step.key)).toEqual(["a:wait:0", "a:row", "a:wait:2"]);
		expect(steps[0]).toMatchObject({ kind: "wait", state: "done", ms: 2_000 });
		// a run still counting counts on from what the run already took
		const live = turnLayout([user, wait(0, 0, 900), wait(1, 5_000, null, "running"), foot as AgentEntry]);
		const counting = live.find(({ entry }) => entry.kind === "turn")?.steps ?? [];
		expect(counting).toHaveLength(1);
		expect(counting[0]).toMatchObject({ key: "a:wait:0", state: "running", ms: null, at: 4_100 });
	});

	it("leaves a turn kept from before the foot as it was drawn", () => {
		const old: AgentEntry[] = [
			{ key: "a:user", kind: "user", text: "hi", context: null, attached: [] },
			{ key: "a:wait:0", kind: "wait", state: "done", at: 0, ms: 900 },
		];
		expect(turnLayout(old).map(({ entry }) => entry.kind)).toEqual(["user", "wait"]);
	});
});
