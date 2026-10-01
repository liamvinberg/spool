// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { Camera } from "../api";
import { type CameraStore, createCameraStore } from "./camera-store";
import { FrameLabel } from "./frame-label";

beforeEach(() => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	// a display frame, run the moment one is asked for
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		callback(performance.now());
		return 1;
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function cameraAt(camera: Camera): CameraStore {
	const store = createCameraStore();
	store.set(camera);
	return store;
}

function label(props: { name: string; frameWidth: number; camera: CameraStore }): HTMLElement {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	act(() => root.render(createElement(FrameLabel, { ...props, entered: false, selected: false, hovered: false })));
	const found = host.querySelector<HTMLElement>("[data-frame-label]");
	if (found === null) throw new Error("no label");
	return found;
}

describe("FrameLabel", () => {
	it("truncates within the frame's rendered width when zoomed out", () => {
		const el = label({ name: "landing--thread-refined", frameWidth: 1200, camera: cameraAt({ x: 0, y: 0, k: 0.2 }) });

		expect(el.style.width).toBe("240px");
		expect(el.style.transform).toBe("scale(5)");
		expect(el.innerHTML).toContain("min-w-0 truncate");
	});

	it("holds its size on screen through a zoom, which it follows without being rendered", () => {
		const camera = cameraAt({ x: 0, y: 0, k: 0.2 });
		const el = label({ name: "landing", frameWidth: 1200, camera });

		act(() => camera.set({ x: 40, y: 0, k: 0.5 }));

		expect(el.style.width).toBe("600px");
		expect(el.style.transform).toBe("scale(2)");
	});

	it("names the frame by its own folder, since the page around it says the rest", () => {
		const el = label({ name: "shop/checkout", frameWidth: 400, camera: cameraAt({ x: 0, y: 0, k: 1 }) });

		expect(el.getAttribute("data-frame-label")).toBe("shop/checkout");
		expect(el.innerHTML).toContain(">checkout</span>");
		expect(el.innerHTML).not.toContain(">shop/checkout<");
	});
});
