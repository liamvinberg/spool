// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "../../daemon/agent-events";
import { MOTION } from "./agent-motion";
import { type AgentTile, type AgentTurnFoot, type Stamped, sourceShape, transcriptOf } from "./agent-transcript";
import { TurnFoot } from "./agent-turn-foot";

/*
 * The turn's grid as the rail draws it (#365): finished tiles step back while others work,
 * a picture being taken wears corner marks, and a reserved spot replays its real source
 * when its file lands.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stamp = (events: readonly AgentEvent[]): Stamped[] => events.map((event, at) => ({ at: at * 1000, event }));

const tile = (frame: string, state: AgentTile["state"], extra: Partial<AgentTile> = {}): AgentTile => ({
	key: frame,
	frame,
	state,
	lines: 40,
	by: null,
	range: null,
	took: null,
	...extra,
});

const footOf = (tiles: AgentTile[], ms: number | null = null): AgentTurnFoot => ({
	key: "foot",
	kind: "turn",
	tiles,
	status: "Working",
	thinking: false,
	ms,
	ending: ms === null ? null : "done",
});

let unmount: (() => void) | null = null;
afterEach(() => {
	unmount?.();
	unmount = null;
});

async function draw(foot: AgentTurnFoot) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const reach = { have: new Set(foot.tiles.map((one) => one.frame)), onJump: () => {}, onPoint: () => {} };
	const render = (next: AgentTurnFoot) =>
		act(() => root.render(createElement(TurnFoot, { foot: next, elapsed: 0, reach, steps: null })));
	await render(foot);
	unmount = () => {
		act(() => root.unmount());
		host.remove();
	};
	return { host, render };
}

const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

describe("the turn's grid, drawn", () => {
	it("draws finished tiles smaller while others still work, and full size once the turn is over", async () => {
		const tiles = [tile("calm", "done"), tile("loud", "reading")];
		const { host, render } = await draw(footOf(tiles));
		const small = () =>
			[...host.querySelectorAll("[data-agent-tile]")].map(
				(one) => one.querySelector("[data-agent-tile-small]") !== null,
			);
		expect(small()).toEqual([true, false]);

		await render(footOf([tile("calm", "done"), tile("loud", "done")]));
		expect(small()).toEqual([false, false]);

		await render(footOf(tiles, 4000));
		expect(small()).toEqual([false, false]);
	});

	it("strikes corner marks round a tile while its picture is taken, and folds them in after", async () => {
		const { host, render } = await draw(footOf([tile("home", "shooting")]));
		expect(host.querySelector("[data-agent-tile-corners]")?.getAttribute("data-agent-tile-corners")).toBe("open");
		expect(host.querySelectorAll("[data-agent-tile-corners] > span")).toHaveLength(4);

		await render(footOf([tile("home", "done")]));
		// still there while they fold in, then gone
		expect(host.querySelector("[data-agent-tile-corners]")?.getAttribute("data-agent-tile-corners")).toBe("leaving");
		await wait(MOTION.cornersIn + 60);
		expect(host.querySelector("[data-agent-tile-corners]")).toBeNull();
	});

	it("replays a filled spot's real source for about a second, then draws the picture", async () => {
		const replay = sourceShape("export default function Home() {\n\treturn (\n\t\t<main>\n\t\t</main>\n\t);\n}\n");
		const { host } = await draw(footOf([tile("home", "fresh", { replay })]));
		const rows = host.querySelectorAll("[data-agent-tile-replay] > span");
		expect(rows).toHaveLength(6);
		// each row runs in after the one above it
		const delays = [...rows].map((row) => Number.parseInt((row as HTMLElement).style.animationDelay, 10));
		expect(delays).toEqual([...delays].sort((a, b) => a - b));
		expect(Math.max(...delays)).toBeLessThan(MOTION.replay);

		await wait(MOTION.replay + 60);
		expect(host.querySelector("[data-agent-tile-replay]")).toBeNull();
		expect(host.querySelector(".animate-agent-draw-in")).not.toBeNull();
	});
});

describe("the turn's grid, folded", () => {
	const shot = (id: string, command: string): AgentEvent => ({
		kind: "called",
		id,
		tool: "Bash",
		input: { command },
		parent: null,
	});
	const landed = (frame: string, call = "w0"): AgentEvent => ({
		kind: "frame",
		change: "created",
		frame,
		lines: 10,
		call,
		task: null,
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

	it("reads a tile as shooting while a spool shot of it is out, and done after", () => {
		const out = stamp([
			landed("home"),
			result("w0"),
			landed("cart", "w1"),
			result("w1"),
			shot("s1", "spool shot home cart"),
		]);
		expect(transcriptOf([], out).foot?.tiles.map((one) => one.state)).toEqual(["shooting", "shooting"]);
		const back = stamp([landed("home"), result("w0"), shot("s1", "spool shot home"), result("s1")]);
		expect(transcriptOf([], back).foot?.tiles.map((one) => one.state)).toEqual(["done"]);
	});

	it("never shoots a frame the turn did not touch", () => {
		const foot = transcriptOf([], stamp([landed("home"), result("w0"), shot("s1", "spool shot elsewhere")])).foot;
		expect(foot?.tiles.map((one) => [one.frame, one.state])).toEqual([["home", "done"]]);
	});

	it("carries a designer's real source into the spot it fills, and only while it is fresh", () => {
		const events = stamp([
			{
				kind: "task-started",
				task: "t1",
				call: "a1",
				description: "Design home",
				agent: "designer",
				prompt: null,
				parent: null,
			},
			{
				kind: "spot",
				state: "held",
				name: "home",
				task: "t1",
				call: null,
				x: 0,
				y: 0,
				w: 1440,
				h: 900,
				parent: null,
			},
			{
				kind: "frame",
				change: "created",
				frame: "home",
				lines: 3,
				source: "export default () => (\n\t<main />\n);\n",
				call: "b1",
				task: "t1",
				spot: "home",
				parent: "a1",
			},
		]);
		const [fresh] = transcriptOf([], events).foot?.tiles ?? [];
		expect(fresh?.state).toBe("fresh");
		expect(fresh?.replay).toEqual([
			[0, expect.any(Number)],
			[1, expect.any(Number)],
			[0, expect.any(Number)],
		]);
		const done = transcriptOf(
			[],
			[...events, ...stamp([{ kind: "task-done", task: "t1", status: "completed", summary: null, parent: null }])],
		).foot;
		expect(done?.tiles[0]?.replay).toBeUndefined();
	});
});
