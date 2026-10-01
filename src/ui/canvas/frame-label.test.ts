// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { Camera } from "../api";
import { type CameraStore, createCameraStore, type FieldView } from "./camera-store";
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

/** a camera at rest: everything is drawn */
const RESTING: FieldView = { near: () => true, rest: null };

function label(props: { name: string; frameWidth: number; camera: CameraStore; view?: FieldView }): {
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

function element({ name, frameWidth, camera, view = RESTING }: Parameters<typeof label>[0]) {
	return createElement(FrameLabel, {
		name,
		frame: { x: 0, y: 0, w: frameWidth, h: 800 },
		camera,
		view,
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
		const moving: FieldView = { near: () => false, rest: null };
		const { el, root } = label({ name: "landing", frameWidth: 1200, camera });
		act(() => root.render(element({ name: "landing", frameWidth: 1200, camera, view: moving })));

		act(() => camera.set({ x: 40, y: 0, k: 0.5 }));
		expect(el.style.width).toBe("240px");

		act(() =>
			root.render(element({ name: "landing", frameWidth: 1200, camera, view: { ...RESTING, rest: camera.get() } })),
		);
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
