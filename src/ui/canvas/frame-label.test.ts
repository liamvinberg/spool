// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { Camera } from "../api";
import type { NearScreen } from "./camera";
import { type CameraStore, createCameraStore, REST_MS } from "./camera-store";
import { FrameLabel, LabelField } from "./frame-label";

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

/** where every label's frame stands in these tests, in world units */
const AT = { x: 100, y: 50 };

function element({ name, frameWidth, camera, near = ON_SCREEN }: Parameters<typeof label>[0]) {
	return createElement(FrameLabel, {
		name,
		frame: { ...AT, w: frameWidth, h: 800 },
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
		// in screen pixels, where the frame's top left falls at this zoom, and never scaled
		expect(el.parentElement?.style.transform).toBe("translate(20px, 10px)");
		expect(el.style.transform).toBe("");
		expect(el.innerHTML).toContain("min-w-0 truncate");
	});

	it("holds its size on screen through a zoom, which it follows without being rendered", () => {
		const camera = cameraAt({ x: 0, y: 0, k: 0.2 });
		const { el } = label({ name: "landing", frameWidth: 1200, camera });

		act(() => camera.set({ x: 40, y: 0, k: 0.5 }));
		// where it stands moves with the frame in the very frame the camera does
		expect(el.parentElement?.style.transform).toBe("translate(50px, 25px)");
		expect(el.style.transform).toBe("");

		act(() => vi.advanceTimersByTime(REST_MS));
		expect(el.style.width).toBe("600px");
	});

	it("lets its width trail a zoom by a few drawn frames at most, and lands it exactly at rest", () => {
		const camera = cameraAt({ x: 0, y: 0, k: 0.2 });
		act(() => vi.advanceTimersByTime(REST_MS));
		const { el } = label({ name: "landing", frameWidth: 1000, camera });
		expect(el.style.width).toBe("200px");

		// four drawn frames of one gesture: the width is written on its one turn among them
		const widths: string[] = [];
		for (const k of [0.21, 0.22, 0.23, 0.24]) {
			act(() => camera.set({ x: 0, y: 0, k }));
			widths.push(el.style.width);
		}
		const written = widths.filter((width, i) => width !== (i === 0 ? "200px" : widths[i - 1]));
		expect(written).toHaveLength(1);
		expect(widths.at(-1)).not.toBe("200px");

		act(() => vi.advanceTimersByTime(REST_MS));
		expect(el.style.width).toBe("240px");
	});

	it("writes nothing on a pan, which the field carries for every label at once", () => {
		const camera = cameraAt({ x: 0, y: 0, k: 0.5 });
		const { el } = label({ name: "landing", frameWidth: 1200, camera });
		const place = el.parentElement;
		if (place === null) throw new Error("no place");
		place.style.transform = "translate(-1px, -1px)";

		act(() => camera.set({ x: 300, y: -120, k: 0.5 }));

		expect(place.style.transform).toBe("translate(-1px, -1px)");
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
		expect(el.parentElement?.style.transform).toBe("translate(50px, 25px)");
	});

	it("hides a label it leaves behind in a zoom, so it never stands over another frame", () => {
		const camera = cameraAt({ x: 0, y: 0, k: 0.2 });
		act(() => vi.advanceTimersByTime(REST_MS));
		let onScreen = true;
		const { el } = label({ name: "landing", frameWidth: 1200, camera, near: () => onScreen });
		const place = el.parentElement;
		if (place === null) throw new Error("no place");

		// its frame leaves the screen mid-zoom: where it last stood is now somewhere else's
		onScreen = false;
		act(() => camera.set({ x: 0, y: 0, k: 0.6 }));
		expect(place.style.transform).toBe("translate(20px, 10px)");
		expect(place.style.visibility).toBe("hidden");

		// back on screen it is placed for this zoom and shown in the same frame
		onScreen = true;
		act(() => camera.set({ x: 0, y: 0, k: 0.7 }));
		expect(place.style.transform).toBe("translate(70px, 35px)");
		expect(place.style.visibility).toBe("");
	});

	it("names the frame by its own folder, since the page around it says the rest", () => {
		const { el } = label({ name: "shop/checkout", frameWidth: 400, camera: cameraAt({ x: 0, y: 0, k: 1 }) });

		expect(el.getAttribute("data-frame-label")).toBe("shop/checkout");
		expect(el.innerHTML).toContain(">checkout</span>");
		expect(el.innerHTML).not.toContain(">shop/checkout<");
	});
});

describe("LabelField", () => {
	it("carries its labels by the camera's translation alone, so they keep their size", () => {
		const camera = cameraAt({ x: 30, y: -10, k: 0.25 });
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
		});
		act(() => root.render(createElement(LabelField, { camera }, null)));
		const field = host.querySelector<HTMLElement>("[data-canvas-labels]");
		expect(field?.style.transform).toBe("translate(30px, -10px)");

		act(() => camera.set({ x: -200, y: 80, k: 4 }));
		expect(field?.style.transform).toBe("translate(-200px, 80px)");
	});
});
