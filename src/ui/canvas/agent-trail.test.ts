// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { ProjectedFrame } from "../api";
import { createDeckStore } from "./agent-deck";
import type { AgentDeck } from "./agent-stream";
import { useAgentTrail } from "./agent-trail";
import type { AgentEntry, AgentTile } from "./agent-transcript";
import { createCameraStore } from "./camera-store";
import { createCanvasStore } from "./canvas-store";

/** The agent's trail on the canvas (task 443): what the turn is writing, then what it made, from the rail's own deck. */

/** the trail as the top right's row draws it when it has room */
function Trail(props: Parameters<typeof useAgentTrail>[0]) {
	return useAgentTrail(props)?.("full") ?? null;
}

const frame = (name: string, page: string, x: number, unseen?: "new"): ProjectedFrame =>
	({ name, page, x, y: 0, w: 240, h: 520, ...(unseen === undefined ? {} : { unseen }) }) as ProjectedFrame;

const deckOf = (tiles: [string, AgentTile["state"]][], phase: AgentDeck["turn"]["phase"]) => {
	const entries: AgentEntry[] = [
		{ key: "user", kind: "user", text: "a tip step and a dark landing", context: null, attached: [] },
		{
			key: "turn",
			kind: "turn",
			tiles: tiles.map(([name, state]) => ({
				key: name,
				frame: name,
				state,
				lines: 0,
				by: null,
				range: null,
				took: null,
			})),
			status: null,
			thinking: false,
			ms: null,
			ending: null,
		},
	];
	return {
		engine: "claude",
		open: "t1",
		threads: [{ id: "t1", at: Date.now() }],
		turn: { entries, phase, companions: [] },
	} as unknown as AgentDeck;
};

it("names the frame being written with its page from another, then counts the turn's frames and lands on one", () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	onTestFinished(() => {
		vi.unstubAllGlobals();
	});
	const deck = createDeckStore();
	deck.hold(
		deckOf(
			[
				["app/receipt--tip", "done"],
				["site/landing--dark", "drawing"],
			],
			"playing",
		),
	);
	const store = createCanvasStore();
	store.set({
		activePage: "app",
		frames: [
			frame("app/receipt", "app", 0),
			frame("app/receipt--tip", "app", 300, "new"),
			// older news nobody has looked at: the disc keeps it, the trail never counts it
			frame("app/cart--empty", "app", 600, "new"),
		],
	});
	const camera = createCameraStore();
	camera.set({ x: 0, y: 0, k: 1 });
	const onLand = vi.fn();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	const draw = () =>
		act(() =>
			root.render(
				createElement(Trail, {
					deck,
					store,
					camera,
					viewportRef: { current: host },
					page: "app",
					project: "kaffe",
					teammate: false,
					onFollow: () => {},
					toPage: () => {},
					onLand,
				}),
			),
		);
	draw();
	const trail = () => host.querySelector<HTMLButtonElement>("[data-agent-trail-button]");
	const label = () => host.querySelector("[data-agent-trail-label]")?.textContent;
	expect(trail()?.textContent).toMatch(/^claude/);
	expect(label()).toBe("landing--dark");
	expect(host.querySelector("[data-agent-trail-page]")?.textContent).toBe("site");

	act(() => {
		deck.hold(
			deckOf(
				[
					["app/receipt--tip", "done"],
					["site/landing--dark", "done"],
				],
				"settled",
			),
		);
		store.set((state) => ({ frames: [...state.frames, frame("site/landing--dark", "site", 0, "new")] }));
		deck.tell();
	});
	expect(label()).toBe("2 new");

	act(() => trail()?.click());
	const rows = [...host.querySelectorAll<HTMLButtonElement>("[data-agent-trail-row]")];
	expect(rows.map((row) => row.textContent)).toEqual(["appreceipt--tip", "sitelanding--dark"]);
	act(() => rows[1]?.click());
	expect(onLand).toHaveBeenCalledWith("site/landing--dark");
	expect(host.querySelector("[data-agent-trail-list]")).toBeNull();
});
