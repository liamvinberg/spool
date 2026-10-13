// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { createCameraStore } from "./camera-store";
import { createPresenceRoom } from "./presence";
import { PresenceLayer } from "./presence-layer";

beforeEach(() => {
	// a display frame, run the moment one is asked for
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		callback(performance.now());
		return 1;
	});
	vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

it("moves a teammate's pointer in the very frame the camera moves, never a render behind (DEV-301)", () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const camera = createCameraStore();
	camera.set({ x: 0, y: 0, k: 1 });
	const room = createPresenceRoom();
	room.hear({
		type: "presence",
		person: { accountId: "ada", name: "ada", color: "red" },
		state: { page: "", pointer: { x: 100, y: 100 }, pressed: false, dragging: [], inside: null, view: null },
		still: 0,
	});
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	act(() => root.render(createElement(PresenceLayer, { room, camera, frames: [], page: "" })));
	const pointer = () => host.querySelector<HTMLElement>('[data-presence-cursor="ada"] > div')?.style.transform;
	expect(pointer()).toBe("translate(99px, 99px)");

	// outside any act: what is drawn is what the frame shows, with nothing left to flush
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", false);
	camera.set({ x: 50, y: -20, k: 1 });
	expect(pointer()).toBe("translate(149px, 79px)");
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
