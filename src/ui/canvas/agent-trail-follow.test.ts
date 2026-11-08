// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import type { Camera } from "../api";
import { type TrailSpot, useTrailFollow } from "./agent-trail-follow";
import { moveCamera } from "./camera";
import { createCameraStore } from "./camera-store";

/** Following the agent (task 443): the camera goes to each frame it writes, and anything else lets go. */

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
	});
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const VIEW = { w: 800, h: 600 };
const START: Camera = { x: 0, y: 0, k: 0.5 };
const TIP = { x: 1000, y: 20, w: 240, h: 520 };
const REFUND = { x: 1300, y: 20, w: 240, h: 520 };

function mount() {
	const camera = createCameraStore();
	camera.set(START);
	const viewport = document.createElement("div");
	Object.defineProperty(viewport, "clientWidth", { value: VIEW.w });
	Object.defineProperty(viewport, "clientHeight", { value: VIEW.h });
	const toPage = vi.fn();
	let follow: ReturnType<typeof useTrailFollow> | null = null;
	const props = { spot: null as TrailSpot | null, running: true, page: "app", teammate: false };
	function Harness(given: typeof props) {
		follow = useTrailFollow({ camera, viewportRef: { current: viewport }, toPage, ...given });
		return null;
	}
	const host = document.createElement("div");
	const root = createRoot(host);
	onTestFinished(() => act(() => root.unmount()));
	const render = (next: Partial<typeof props>) => {
		Object.assign(props, next);
		act(() => root.render(createElement(Harness, { ...props })));
	};
	render({});
	const settle = () => act(() => vi.advanceTimersByTime(400));
	return {
		camera,
		toPage,
		render,
		settle,
		following: () => follow?.following,
		press: (on: boolean) => act(() => follow?.follow(on)),
	};
}

it("goes to each frame as the agent writes it, the page with it, until a hand moves the camera", () => {
	const trail = mount();
	trail.render({ spot: { name: "app/receipt--tip", page: "app", box: TIP } });
	trail.settle();
	// written, not followed: the camera stays yours
	expect(trail.camera.get()).toEqual(START);

	trail.press(true);
	trail.settle();
	const onTip = moveCamera(START, TIP, VIEW.w, VIEW.h);
	expect(trail.camera.get()).toEqual(onTip);

	trail.render({ spot: { name: "app/refund", page: "app", box: REFUND } });
	trail.settle();
	expect(trail.camera.get()).toEqual(moveCamera(onTip, REFUND, VIEW.w, VIEW.h));

	// on another page the page goes too, and the switch's own cameras are not a hand
	trail.render({ spot: { name: "site/landing--dark", page: "site", box: { x: 0, y: 420, w: 520, h: 340 } } });
	expect(trail.toPage).toHaveBeenCalledTimes(1);
	const [page, , then] = trail.toPage.mock.calls[0] as [string, Camera | undefined, Camera];
	expect(page).toBe("site");
	act(() => {
		trail.camera.set({ x: 9, y: 9, k: 0.5 });
		trail.camera.fly(then);
	});
	trail.render({ page: "site" });
	trail.settle();
	expect(trail.following()).toBe(true);

	act(() => trail.camera.set({ x: 40, y: 40, k: 0.5 }));
	trail.settle();
	expect(trail.following()).toBe(false);
});

it("lets go on esc, for a teammate, and a beat after the turn ends", () => {
	const trail = mount();
	trail.render({ spot: { name: "app/receipt--tip", page: "app", box: TIP } });

	trail.press(true);
	act(() => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
	});
	expect(trail.following()).toBe(false);

	trail.press(true);
	trail.render({ teammate: true });
	expect(trail.following()).toBe(false);

	trail.render({ teammate: false });
	trail.press(true);
	trail.render({ running: false });
	act(() => vi.advanceTimersByTime(800));
	expect(trail.following()).toBe(true);
	act(() => vi.advanceTimersByTime(200));
	expect(trail.following()).toBe(false);
});
