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

	it("leaves a turn kept from before the foot as it was drawn", () => {
		const old: AgentEntry[] = [
			{ key: "a:user", kind: "user", text: "hi", context: null, attached: [] },
			{ key: "a:wait:0", kind: "wait", state: "done", at: 0, ms: 900 },
		];
		expect(turnLayout(old).map(({ entry }) => entry.kind)).toEqual(["user", "wait"]);
	});
});
