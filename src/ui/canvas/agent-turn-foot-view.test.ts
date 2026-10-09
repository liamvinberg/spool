// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentEvent } from "../../daemon/agent-events";
import { FADE_OUT_MS, MOTION } from "./agent-motion";
import { type AgentTile, type AgentTurnFoot, type Stamped, sourceShape, transcriptOf } from "./agent-transcript";
import { TurnFoot } from "./agent-turn-foot";

/*
 * The turn's grid as the rail draws it (#365): finished tiles step back while others work,
 * a picture being taken wears corner marks, and a reserved spot replays its real source
 * when its file lands. The marks are ink, never a blend (#366, story 72).
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

	it("fades a spot let go empty where it stood, and lets a filled one become its frame", async () => {
		const calm = tile("calm", "reading", { delegation: "a1" });
		const loud = tile("loud", "reading", { delegation: "a2" });
		const quiet = tile("quiet-home", "fresh", { delegation: "a2" });
		const { host, render } = await draw(footOf([calm, loud, tile("bold", "done")]));
		const names = () =>
			[...host.querySelectorAll("[data-agent-tile]")].map((one) => one.getAttribute("data-agent-tile"));
		const leaving = () =>
			[...host.querySelectorAll("[data-agent-tile-leaving] [data-agent-tile]")].map((one) =>
				one.getAttribute("data-agent-tile"),
			);

		// calm is let go, loud is filled by its designer's frame under another name
		await render(footOf([quiet, tile("bold", "done")]));
		expect(names()).toEqual(["calm", "quiet-home", "bold"]);
		expect(leaving()).toEqual(["calm"]);
		expect(host.querySelector("[data-agent-tile-leaving]")?.className).toContain("animate-agent-fade-out");

		await wait(FADE_OUT_MS + 40);
		expect(names()).toEqual(["quiet-home", "bold"]);
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

	it("marks the block being changed in ink and greys, never with a blend", async () => {
		const { host } = await draw(footOf([tile("home", "editing")]));
		const mark = host.querySelector("[data-agent-companion-mark]");
		expect(mark).not.toBeNull();
		const classes = [mark, ...(mark?.querySelectorAll("*") ?? [])].map((one) => one?.getAttribute("class") ?? "");
		expect(classes.join(" ")).not.toMatch(/mix-blend|#fff|white|accent/);
		for (const colour of classes.join(" ").match(/\b(?:bg|border|text)-[a-z-]+(?=\s|$)/g) ?? [])
			expect(colour).toMatch(
				/^(?:bg|border|text)-(?:text|bg|surface|muted|border(?:-raised)?|\[[\d.]+px\]|t|b|l|r|x|y)$/,
			);
	});
});

describe("the turn's steps", () => {
	it("fade in under the line, and stay through their fade when it closes", async () => {
		const { host } = await draw(footOf([tile("home", "done")]));
		const line = () => host.querySelector<HTMLButtonElement>("button[data-agent-turn-line]");
		const steps = () => host.querySelector<HTMLElement>("[data-agent-steps]");
		expect(steps()?.hidden).toBe(true);

		await act(async () => line()?.click());
		expect(steps()?.getAttribute("data-agent-steps")).toBe("open");
		expect(steps()?.className).toContain("animate-agent-fade-in");

		await act(async () => line()?.click());
		expect(steps()?.getAttribute("data-agent-steps")).toBe("leaving");
		expect(steps()?.hidden).toBe(false);
		await wait(FADE_OUT_MS + 40);
		expect(steps()?.getAttribute("data-agent-steps")).toBe("shut");
		expect(steps()?.hidden).toBe(true);
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

describe("the turn's grid as a choice", () => {
	const ask = (state: "open" = "open") =>
		({
			key: "ask:q1",
			kind: "ask",
			request: "req-q",
			question: true,
			asked: "Which direction?",
			questions: [
				{
					header: "Direction",
					question: "Which direction?",
					multi: false,
					options: [
						{ label: "Calm", description: "Quiet." },
						{ label: "Bold", description: "Loud." },
					],
				},
			],
			always: false,
			state,
			words: null,
		}) as const;

	it("stands two across while the turn runs and three once it is over, like the grid", async () => {
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		const tiles = [tile("home--calm", "done"), tile("home--bold", "done")];
		const reach = { have: new Set(tiles.map((one) => one.frame)), onJump: () => {}, onPoint: () => {} };
		const columns = (foot: AgentTurnFoot) => {
			act(() =>
				root.render(
					createElement(TurnFoot, { foot, elapsed: 0, reach, steps: null, asks: [ask()], onAnswer: () => {} }),
				),
			);
			const grid = host.querySelector('[role="menu"][data-agent-tiles]');
			return grid?.classList.contains("grid-cols-2") ? 2 : grid?.classList.contains("grid-cols-3") ? 3 : null;
		};
		unmount = () => {
			act(() => root.unmount());
			host.remove();
		};
		expect(columns(footOf(tiles))).toBe(2);
		expect(columns(footOf(tiles, 3000))).toBe(3);
	});
});
