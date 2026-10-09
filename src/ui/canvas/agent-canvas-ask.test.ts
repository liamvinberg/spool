// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import type { AskEntry } from "./agent-ask-view";
import { CanvasAsk, HANG } from "./agent-canvas-ask";
import type { Box } from "./camera";
import { createCameraStore } from "./camera-store";

/*
 * The ask standing on the canvas while the rail is shut (#366): under its frame's left foot
 * at one size on screen, moved with the camera, and taking no press on its way out.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ask: AskEntry = {
	key: "ask:c1",
	kind: "ask",
	request: "req-1",
	question: false,
	asked: "Adding a date library.",
	tool: "Bash",
	detail: "npm install dayjs",
	questions: [],
	always: false,
	state: "open",
	words: null,
};

function stand(frame: Box, leaving = false) {
	const camera = createCameraStore();
	camera.set({ x: 0, y: 0, k: 1 });
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const answers: string[] = [];
	const render = (box: Box, out = leaving) =>
		act(() =>
			root.render(
				createElement(CanvasAsk, {
					camera,
					frame: box,
					entry: ask,
					onAnswer: (request) => answers.push(request),
					leaving: out,
				}),
			),
		);
	render(frame);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	const card = () => host.querySelector<HTMLElement>("[data-agent-canvas-ask]");
	const at = () => (card()?.style.transform.match(/-?\d+/g) ?? []).map(Number);
	return { camera, card, at, render, answers };
}

describe("an ask on the canvas", () => {
	it("hangs under its frame's left foot", () => {
		const { at } = stand({ x: 100, y: 50, w: 400, h: 300 });
		expect(at()).toEqual([100, 50 + 300 + HANG.below]);
	});

	it("moves with the camera, keeping its own size on screen", async () => {
		const { camera, at, card } = stand({ x: 100, y: 50, w: 400, h: 300 });
		camera.set({ x: -50, y: 20, k: 0.5 });
		// the camera speaks on the next display frame
		await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
		// the frame's foot under that camera, and the card as wide as it was
		expect(at()).toEqual([Math.round(-50 + 100 * 0.5), Math.round(20 + 350 * 0.5 + HANG.below)]);
		expect(card()?.style.width).toBe("360px");
	});

	it("follows a frame that moved under a still camera", () => {
		const { at, render } = stand({ x: 100, y: 50, w: 400, h: 300 });
		render({ x: 300, y: 50, w: 400, h: 300 });
		expect(at()[0]).toBe(300);
	});

	it("answers from where it stands, and takes no press while it leaves", () => {
		const { card, answers, render } = stand({ x: 0, y: 0, w: 400, h: 300 });
		act(() => card()?.querySelector<HTMLButtonElement>('[data-agent-option="Allow"]')?.click());
		expect(answers).toEqual(["req-1"]);
		render({ x: 0, y: 0, w: 400, h: 300 }, true);
		expect(card()?.getAttribute("data-agent-canvas-ask")).toBe("leaving");
		expect(card()?.className).toContain("pointer-events-none");
	});
});
