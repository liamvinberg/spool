// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { Camera } from "../api";
import type { NearScreen } from "./camera";
import { type CameraStore, createCameraStore, REST_MS } from "./camera-store";
import { FrameLabel } from "./frame-label";

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	// a display frame, run the moment one is asked for
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		callback(performance.now());
		return 1;
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function cameraAt(camera: Camera): CameraStore {
	const store = createCameraStore();
	store.set(camera);
	return store;
}

/** a label on screen, whatever the camera */
const ON_SCREEN: NearScreen = () => true;

function label(props: { name: string; frameWidth: number; camera: CameraStore; near?: NearScreen }): {
	el: HTMLElement;
	root: Root;
} {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	act(() => root.render(element(props)));
	const found = host.querySelector<HTMLElement>("[data-frame-label]");
	if (found === null) throw new Error("no label");
	return { el: found, root };
}

function element({ name, frameWidth, camera, near = ON_SCREEN }: Parameters<typeof label>[0]) {
	return createElement(FrameLabel, {
		name,
		frame: { x: 0, y: 0, w: frameWidth, h: 800 },
		camera,
		near,
		entered: false,
		selected: false,
		hovered: false,
	});
}

describe("FrameLabel", () => {
	it("truncates within the frame's rendered width when zoomed out", () => {
		const { el } = label({
			name: "landing--thread-refined",
			frameWidth: 1200,
			camera: cameraAt({ x: 0, y: 0, k: 0.2 }),
		});

		expect(el.style.width).toBe("240px");
		expect(el.style.transform).toBe("scale(5)");
		expect(el.innerHTML).toContain("min-w-0 truncate");
	});

	it("holds its size on screen through a zoom, which it follows without being rendered", () => {
		const camera = cameraAt({ x: 0, y: 0, k: 0.2 });
		const { el } = label({ name: "landing", frameWidth: 1200, camera });

		act(() => camera.set({ x: 40, y: 0, k: 0.5 }));

		expect(el.style.width).toBe("600px");
		expect(el.style.transform).toBe("scale(2)");
	});

	it("leaves a label off screen alone while the camera moves, and catches it up once it rests", () => {
		const camera = cameraAt({ x: 0, y: 0, k: 0.2 });
		act(() => vi.advanceTimersByTime(REST_MS));
		const { el } = label({ name: "landing", frameWidth: 1200, camera, near: () => false });
		// at rest everything is drawn, on screen or not
		expect(el.style.width).toBe("240px");

		// the very first frame of a gesture already skips it
		act(() => camera.set({ x: 40, y: 0, k: 0.5 }));
		expect(el.style.width).toBe("240px");

		act(() => vi.advanceTimersByTime(REST_MS));
		expect(el.style.width).toBe("600px");
		expect(el.style.transform).toBe("scale(2)");
	});

	it("names the frame by its own folder, since the page around it says the rest", () => {
		const { el } = label({ name: "shop/checkout", frameWidth: 400, camera: cameraAt({ x: 0, y: 0, k: 1 }) });

		expect(el.getAttribute("data-frame-label")).toBe("shop/checkout");
		expect(el.innerHTML).toContain(">checkout</span>");
		expect(el.innerHTML).not.toContain(">shop/checkout<");
	});
});
