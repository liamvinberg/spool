// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import type { ProjectedPlaceholder } from "../../daemon/projection";
import type { AgentEntry, AgentTile } from "./agent-transcript";
import { createCameraStore } from "./camera-store";
import { PlaceholderFrame, type PlaceholderWork, tileFor, workOf } from "./placeholder-frame";

/**
 * A designer's placeholder frame on the canvas (#369): dashed where its frame will land,
 * with the direction's name and brief, and what its designer is doing inside it.
 */

const tile = (over: Partial<AgentTile>): AgentTile => ({
	key: "tile:ideas/home--split",
	frame: "ideas/home--split",
	state: "reading",
	lines: 0,
	by: "Split home",
	range: null,
	took: null,
	...over,
});

const foot = (tiles: AgentTile[], ms: number | null = null): AgentEntry => ({
	key: "turn",
	kind: "turn",
	tiles,
	status: null,
	thinking: false,
	ms,
	ending: null,
});

describe("what a placeholder says its designer is doing", () => {
	it("is the turn's tile for it while the turn runs, and nothing once it is over", () => {
		const one = tile({});
		expect(tileFor([foot([one])], "ideas/home--split")).toBe(one);
		expect(tileFor([foot([one], 9000)], "ideas/home--split")).toBeUndefined();
		expect(tileFor([foot([one])], "elsewhere")).toBeUndefined();
	});

	it("reads, draws or checks by its step's first verb, and counts lines while its source streams", () => {
		expect(workOf(tile({}))).toEqual({ phase: "Reading", detail: null });
		expect(workOf(tile({ step: "Running Read the home frame" }))).toEqual({
			phase: "Reading",
			detail: "Read the home frame",
		});
		expect(workOf(tile({ step: "Running Write the frame, then spool check" }))?.phase).toBe("Drawing");
		expect(workOf(tile({ step: "Running spool check and shot" }))?.phase).toBe("Checking");
		expect(workOf(tile({ state: "drawing", lines: 12 }))).toEqual({ phase: "Drawing", detail: "12 lines" });
		expect(workOf(tile({ state: "fresh" }))).toBeNull();
		expect(workOf(undefined)).toBeNull();
	});
});

describe("a placeholder frame on the canvas", () => {
	const placeholder: ProjectedPlaceholder = {
		name: "ideas/home--split",
		page: "ideas",
		x: 100,
		y: 50,
		w: 390,
		h: 844,
		title: "Split home",
		brief: "Two panes, one for the list and one for the detail.",
	};

	function draw(work: PlaceholderWork | null): HTMLElement {
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
		});
		const camera = createCameraStore();
		camera.set({ x: 0, y: 0, k: 1 });
		act(() => root.render(createElement(PlaceholderFrame, { placeholder, camera, work, pointed: false })));
		return host;
	}

	it("stands where its frame will, with its own name, the direction's name and its brief", () => {
		const host = draw(null);
		const frame = host.querySelector<HTMLElement>('[data-placeholder-frame="ideas/home--split"]');
		expect(frame?.style.transform).toBe("translate(100px, 50px)");
		expect(frame?.textContent).toContain("home--split");
		expect(frame?.textContent).toContain("Split home");
		expect(frame?.textContent).toContain("Two panes");
		// a teammate's canvas has no turn of it: no live mark
		expect(host.querySelector("[data-placeholder-live]")).toBeNull();
	});

	it("shows what its designer is doing, with a live mark, while this canvas's turn has it at work", () => {
		const host = draw({ phase: "Drawing", detail: "Write the split frame" });
		expect(host.querySelector("[data-placeholder-frame]")?.getAttribute("data-placeholder-work")).toBe("drawing");
		expect(host.querySelector("[data-placeholder-live]")).not.toBeNull();
		expect(host.textContent).toContain("Write the split frame");
	});
});
