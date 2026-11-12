import { describe, expect, it } from "vitest";
import type { AgentDeck } from "./agent-stream";
import { madeOf, type TrailTurn, trailTurnOf, trailWords, wayTo, writingOf } from "./agent-trail-model";
import type { AgentEntry, AgentTile } from "./agent-transcript";

/** What the agent's trail says (task 443), read off the open thread's last turn. */

const said = (text: string): AgentEntry => ({ key: `user:${text}`, kind: "user", text, context: null, attached: [] });
const foot = (tiles: [string, AgentTile["state"]][]): AgentEntry => ({
	key: "turn",
	kind: "turn",
	tiles: tiles.map(([frame, state]) => ({ key: frame, frame, state, lines: 0, by: null, range: null, took: null })),
	status: null,
	thinking: false,
	ms: null,
	ending: null,
});
const deckOf = (entries: AgentEntry[], phase: AgentDeck["turn"]["phase"]) =>
	({
		engine: "claude",
		open: "t1",
		threads: [{ id: "t1", at: 5_000 }],
		turn: { entries, phase, companions: [] },
	}) as unknown as AgentDeck;
const turnOf = (tiles: [string, AgentTile["state"]][], at: TrailTurn["at"] = null): TrailTurn => ({
	key: "t1:0",
	agent: "claude",
	running: true,
	ended: null,
	tiles: tiles.map(([frame, state]) => ({ frame, state })),
	at,
});

describe("the trail's turn", () => {
	it("is the turn after the last thing said, never the foot of the turn before", () => {
		const before = [said("a tip step"), foot([["app/receipt--tip", "done"]])];
		const asked = trailTurnOf(deckOf([...before, said("now a refund")], "playing"));
		expect(asked).toMatchObject({ agent: "claude", running: true, ended: null, tiles: [] });

		const over = trailTurnOf(deckOf([...before, said("now a refund"), foot([["app/refund", "done"]])], "settled"));
		// it ended when the thread last moved, which is what the ten minutes count from
		expect(over).toMatchObject({ running: false, ended: 5_000, tiles: [{ frame: "app/refund" }] });
	});

	it("counts what the turn wrote that still stands: not a frame it deleted, a placeholder or a frame gone since", () => {
		const turn = turnOf([
			["app/receipt--tip", "done"],
			["app/refund", "editing"],
			["app/old", "deleted"],
			["app/calm", "reading"],
			["app/moved-away", "done"],
		]);
		const standing = new Set(["app/receipt--tip", "app/refund", "app/old", "app/calm"]);
		expect(madeOf(turn, standing)).toEqual(["app/receipt--tip", "app/refund"]);
	});

	it("is on the frame being written, else the one just changed, else the last written, else what it reads", () => {
		const known = (path: string) => path.replace("/parts/card.tsx", "");
		expect(
			writingOf(
				turnOf([
					["app/receipt--tip", "drawing"],
					["app/refund", "fresh"],
				]),
				known,
			),
		).toEqual({ frame: "app/receipt--tip", reading: false });
		expect(
			writingOf(
				turnOf([
					["app/receipt--tip", "editing"],
					["app/refund", "done"],
				]),
				known,
			),
		).toEqual({ frame: "app/receipt--tip", reading: false });
		expect(
			writingOf(
				turnOf([
					["app/receipt--tip", "done"],
					["app/gone", "deleted"],
				]),
				known,
			),
		).toEqual({ frame: "app/receipt--tip", reading: false });
		// nothing written yet: the frame holding the file it reads
		expect(writingOf(turnOf([], { frame: "app/receipt/parts/card.tsx", reading: true }), known)).toEqual({
			frame: "app/receipt",
			reading: true,
		});
	});
});

describe("which way the trail points", () => {
	const camera = { x: 0, y: 0, k: 1 };
	const size = { w: 800, h: 600 };
	const frame = (x: number, y: number, page = "app") => ({ x, y, w: 200, h: 100, page });

	it("points nowhere once the frame's middle is in view, even with the rest of it off the edge", () => {
		expect(wayTo([frame(650, 250)], "app", camera, size)).toEqual({ kind: "here" });
	});

	it("turns toward a frame off screen, and names the page of one on another", () => {
		expect(wayTo([frame(1200, 250)], "app", camera, size)).toEqual({ kind: "angle", angle: 0 });
		const below = wayTo([frame(300, 900)], "app", camera, size);
		expect(below.kind === "angle" && below.angle).toBeCloseTo(Math.PI / 2);
		expect(wayTo([frame(0, 0, "site")], "app", camera, size)).toEqual({ kind: "page", page: "site" });
	});
});

it("folds the trail's pages to one mark, then cuts a long frame name in its middle, then keeps only the agent", () => {
	const name = "order--gift-note-and-delivery-date";
	expect(trailWords(["site", "launch"], name, "full")).toEqual({ pages: ["site", "launch"], label: name });
	expect(trailWords(["site", "launch"], name, "middle")).toEqual({ pages: ["…"], label: name });
	expect(trailWords(["site", "launch"], name, "cut")).toEqual({ pages: ["…"], label: "order--gi…very-date" });
	expect(trailWords([], "app-ring", "cut")).toEqual({ pages: [], label: "app-ring" });
	expect(trailWords(["site"], name, "name")).toEqual({ pages: [], label: null });
});
