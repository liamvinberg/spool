// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { Camera, ProjectedFrame } from "../api";
import type { AgentCompanion } from "./agent-companion";
import { AgentCompanionLayer, type CompanionLayerProps } from "./agent-companion-layer";
import { type CameraStore, createCameraStore } from "./camera-store";

/**
 * The agent's companions on the canvas (#366): one ink square per working agent, at the
 * work. What each act draws, and that where it stands is fixed to its frame whatever the
 * camera does. The motion itself plays out frame by frame; here a display frame comes at
 * once, so every motion is read where it ends.
 */

const CAMERA: Camera = { x: 0, y: 0, k: 1 };
const FRAMES: ProjectedFrame[] = [
	{ name: "home", x: 100, y: 100, w: 400, h: 800 } as ProjectedFrame,
	{ name: "cart", x: 600, y: 100, w: 400, h: 800 } as ProjectedFrame,
];

const companion = (over: Partial<AgentCompanion> = {}): AgentCompanion => ({
	key: "",
	name: null,
	frame: "home",
	spot: null,
	act: "idle",
	lines: 0,
	range: null,
	beat: 1,
	...over,
});

/** display frames, run by hand: each a long way after the last, so every motion lands */
let frames: FrameRequestCallback[] = [];
let now = 0;
function flush() {
	for (let round = 0; round < 50 && frames.length > 0; round += 1) {
		now += 5000;
		for (const callback of frames.splice(0)) callback(now);
	}
}

function cameraAt(camera: Camera): CameraStore {
	frames = [];
	vi.spyOn(performance, "now").mockImplementation(() => now);
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
	vi.stubGlobal("cancelAnimationFrame", () => {});
	onTestFinished(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});
	const store = createCameraStore();
	store.set(camera);
	flush();
	return store;
}

function draw(props: CompanionLayerProps): { host: HTMLElement; again: (over: Partial<CompanionLayerProps>) => void } {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	act(() => {
		root.render(createElement(AgentCompanionLayer, props));
	});
	act(flush);
	return {
		host,
		again: (over) => {
			act(() => {
				root.render(createElement(AgentCompanionLayer, { ...props, ...over }));
			});
			act(flush);
		},
	};
}

const layer = (over: Partial<CompanionLayerProps> = {}) =>
	draw({ camera: cameraAt(CAMERA), frames: FRAMES, companions: [], marks: [], footed: false, ...over });

/** where a square's centre stands on screen, off its transform */
function centre(host: HTMLElement, key = "main"): { x: number; y: number } {
	const square = host.querySelector<HTMLElement>(`[data-agent-companion="${key}"] > div:last-child`);
	const [x, y] = (square?.style.transform ?? "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
	return { x: (x ?? Number.NaN) + 5, y: (y ?? Number.NaN) + 5 };
}

describe("the agent's companions on the canvas", () => {
	it("draws nobody while no agent is anywhere", () => {
		expect(layer().host.querySelector("[data-agent-companion]")).toBeNull();
	});

	it("docks on the frame's name row between calls, and on no frame it is not at", () => {
		const { host } = layer({ companions: [companion()] });
		const square = host.querySelectorAll("[data-agent-companion]");
		expect(square).toHaveLength(1);
		expect(square[0]?.getAttribute("data-frame")).toBe("home");
		// the right end of the name row, just above the frame's top edge
		expect(centre(host)).toEqual({ x: 495, y: 82 });
	});

	it("draws nobody for a frame that is not on this page", () => {
		expect(
			layer({ companions: [companion({ frame: "elsewhere" })] }).host.querySelector("[data-agent-companion]"),
		).toBeNull();
	});

	it("rides the newest line while the source streams", () => {
		const few = centre(layer({ companions: [companion({ act: "new", lines: 32 })] }).host);
		const many = centre(layer({ companions: [companion({ act: "new", lines: 288 })] }).host);
		// left of the frame's text, lower the more has come
		expect(few.x).toBeLessThan(130);
		expect(many.y).toBeGreaterThan(few.y);
		expect(many.y).toBeLessThan(900);
	});

	it("slides down the left wall while the agent reads, a hairline behind it", () => {
		const { host } = layer({ companions: [companion({ act: "read" })] });
		expect(centre(host)).toEqual({ x: 88, y: 900 });
		expect(host.querySelector("[data-companion-trail]")).not.toBeNull();
	});

	it("hops to the block a change landed in and rings it, once the document measured it", () => {
		const mark = { key: "home:c1", frame: "home", box: { x: 20, y: 300, w: 350, h: 120 } };
		const { host } = layer({
			companions: [companion({ act: "edit", range: { from: 40, to: 52 }, lines: 200 })],
			marks: [mark],
		});
		expect(centre(host)).toEqual({ x: 120, y: 400 });
		const ring = host.querySelector<HTMLElement>("[data-companion-ring]");
		expect(ring?.style.top).toBe("398px");
		expect(ring?.style.width).toBe("354px");
	});

	it("goes to the lines' height where no document could measure the block", () => {
		const { host } = layer({ companions: [companion({ act: "edit", range: { from: 101, to: 110 }, lines: 200 })] });
		expect(centre(host)).toEqual({ x: 100, y: 500 });
		expect(host.querySelector("[data-companion-ring]")).toBeNull();
	});

	it("flies four corners out of the docked square while the frame is photographed", () => {
		const { host } = layer({ companions: [companion({ act: "shot" })] });
		expect(centre(host)).toEqual({ x: 495, y: 82 });
		expect(
			[...host.querySelectorAll("[data-companion-corner]")].map((one) => one.getAttribute("data-companion-corner")),
		).toEqual(["nw", "ne", "se", "sw"]);
		expect(host.querySelector("[data-companion-flash]")).not.toBeNull();
	});

	it("gathers a deleted frame into the square where it last stood", () => {
		const { host, again } = layer({ companions: [companion()] });
		again({
			frames: FRAMES.filter((one) => one.name !== "home"),
			companions: [companion({ act: "delete", beat: 2 })],
		});
		const ghost = host.querySelector<HTMLElement>("[data-companion-ghost]");
		expect(ghost?.style.left).toBe("100px");
		expect(ghost?.style.height).toBe("800px");
	});

	it("opens into the waiting ring when the agent asks, and hangs under the frame when the rail is shut", () => {
		const docked = layer({ companions: [companion({ act: "ask" })] }).host;
		expect(docked.querySelector("[data-companion-waiting]")).not.toBeNull();
		expect(docked.querySelector("[data-companion-square]")).toBeNull();
		expect(centre(docked)).toEqual({ x: 495, y: 82 });

		const footed = layer({ companions: [companion({ act: "ask" })], footed: true }).host;
		// on the notch of the card that hangs 22px under the frame, 15px in from its left foot
		expect(centre(footed)).toEqual({ x: 115, y: 914 });
	});

	it("names its agents only once two of them share the page", () => {
		const alone = layer({ companions: [companion({ key: "d1", name: "calm" })] }).host;
		expect(alone.querySelector("[data-companion-name]")).toBeNull();

		const two = layer({
			companions: [companion({ key: "d1", name: "calm" }), companion({ key: "d2", name: "dense", frame: "cart" })],
		}).host;
		expect([...two.querySelectorAll("[data-companion-name]")].map((one) => one.textContent)).toEqual([
			"calm",
			"dense",
		]);
	});

	it("stands at a designer's held spot before its frame exists", () => {
		const spot = { name: "home--calm", x: 1100, y: 100, w: 400, h: 800 };
		const { host } = layer({ companions: [companion({ key: "d1", frame: null, spot })] });
		expect(centre(host, "d1")).toEqual({ x: 1495, y: 82 });
	});

	it("moves with the camera on the frame it moves", () => {
		const camera = cameraAt(CAMERA);
		const { host } = draw({ camera, frames: FRAMES, companions: [companion()], marks: [], footed: false });
		act(() => camera.set({ x: -40, y: 30, k: 2 }));
		act(flush);
		expect(centre(host)).toEqual({ x: 955, y: 212 });
	});

	it("leaves where it stopped when the turn ends", () => {
		const { host, again } = layer({ companions: [companion()] });
		again({ companions: [] });
		const leaving = host.querySelector('[data-agent-companion="main"] .animate-agent-depart');
		expect(leaving).not.toBeNull();
	});
});
