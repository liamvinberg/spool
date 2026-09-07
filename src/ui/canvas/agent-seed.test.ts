// @vitest-environment happy-dom

import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { SeedParagraphs, SeedSurface } from "./agent-seed";

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function mount(initial: { text: string; finished: boolean; still: boolean }) {
	vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
	const frames = new Map<number, FrameRequestCallback>();
	let nextFrame = 0;
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
		frames.set(++nextFrame, callback);
		return nextFrame;
	});
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
		frames.delete(id);
	});
	const seek = vi.fn();
	const animation = {
		set currentTime(time: number) {
			seek(time);
		},
		playbackRate: 0,
		play: vi.fn(),
		updatePlaybackRate: vi.fn<(rate: number) => void>(),
		cancel: vi.fn(),
	};
	Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value: () => [animation] });
	let destination = { x: 100, y: 50 };
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
		if (this.parentElement?.hasAttribute("data-agent-caret")) return new DOMRect(destination.x, destination.y, 30, 2);
		if (this.classList.contains("animate-agent-wind")) return new DOMRect(8, 0, 10, 2);
		return new DOMRect(0, 0, 400, 500);
	});
	function Transcript(props: typeof initial) {
		const viewport = useRef<HTMLDivElement>(null);
		return createElement(SeedSurface, {
			viewport,
			// biome-ignore lint/correctness/noChildrenProp: createElement requires this component's required children prop.
			children: createElement(
				"div",
				{ ref: viewport, "data-test-viewport": "" },
				createElement(SeedParagraphs, props),
			),
		});
	}
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const render = (props: typeof initial) => act(() => root.render(createElement(Transcript, props)));
	render(initial);
	const unmount = () => act(() => root.unmount());
	onTestFinished(() => {
		unmount();
		host.remove();
		Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
	});
	return {
		host,
		render,
		unmount,
		animation,
		seek,
		frames,
		aim: (point: typeof destination) => {
			destination = point;
		},
		step: (ms: number) => {
			for (let elapsed = 0; elapsed < ms; elapsed += 16) {
				act(() => {
					vi.advanceTimersByTime(Math.min(16, ms - elapsed));
					const pending = [...frames.values()];
					frames.clear();
					for (const callback of pending) callback(performance.now());
				});
			}
		},
		ink: () => host.querySelector("[data-agent-seed] g rect"),
	};
}

describe("Seed at the live prose edge", () => {
	it("eases with real receipts, rests through silence, and resumes without seeking the wind", () => {
		const props = { text: "", finished: false, still: false };
		const view = mount(props);
		view.step(32);
		expect(view.ink()?.getAttribute("data-receiving")).toBe("false");
		view.render({ ...props, text: `${props.text}${" more".repeat(40)}` });
		view.step(16);
		const first = view.animation.updatePlaybackRate.mock.lastCall?.[0] ?? 0;
		expect(first).toBeGreaterThan(0);
		expect(first).toBeLessThan(0.1);
		view.step(300);
		expect(view.animation.updatePlaybackRate.mock.lastCall?.[0]).toBeGreaterThan(first);
		expect(view.ink()?.getAttribute("data-receiving")).toBe("true");
		view.step(1800);
		expect(view.animation.updatePlaybackRate.mock.lastCall?.[0]).toBe(0);
		expect(view.ink()?.getAttribute("data-receiving")).toBe("false");
		view.render({ ...props, text: `${props.text}${" more".repeat(41)}` });
		view.step(16);
		expect(view.animation.updatePlaybackRate.mock.lastCall?.[0]).toBeGreaterThan(0);
		expect(view.seek.mock.calls).toEqual([[400]]);
	});

	it("gathers into a dot across paragraphs and unfolds with no trail or extra text", () => {
		const props = { text: "First paragraph.", finished: false, still: false };
		const view = mount(props);
		view.step(32);
		const before = Number(view.ink()?.getAttribute("y"));
		const seed = view.host.querySelector("[data-agent-seed]");
		view.aim({ x: 230, y: 180 });
		view.render({ ...props, text: `${props.text}\n\nStill arriving` });
		view.step(16);
		const first = Number(view.ink()?.getAttribute("y"));
		expect(first).toBeGreaterThan(before);
		expect(first).toBeLessThan(before + 2);
		view.step(144);
		expect(Number(view.ink()?.getAttribute("height"))).toBeGreaterThan(3.8);
		expect(Number(view.ink()?.getAttribute("width"))).toBeLessThan(4.6);
		view.step(1600);
		expect(Number(view.ink()?.getAttribute("height"))).toBeCloseTo(2, 2);
		expect(Number(view.ink()?.getAttribute("width"))).toBeCloseTo(10, 2);
		expect(Number(view.ink()?.getAttribute("y"))).toBeCloseTo(180, 1);
		expect(view.host.querySelector("[data-agent-seed]")).toBe(seed);
		expect(seed?.querySelector("path")).toBeNull();
		expect(view.host.textContent).toBe(props.text);
		expect(view.host.querySelector(".animate-agent-paragraph")).not.toBeNull();
		expect(view.host.querySelector(".animate-agent-rise")).not.toBeNull();
		expect(view.seek).toHaveBeenCalledTimes(1);
	});

	it("removes all live ink immediately on completion even with paragraphs still queued", () => {
		const props = { text: "First", finished: false, still: false };
		const view = mount(props);
		view.step(16);
		view.render({ ...props, text: "First\n\nSecond\n\nThird" });
		view.step(16);
		view.render({ ...props, text: "First\n\nSecond\n\nThird", finished: true });
		expect(view.host.querySelector("[data-agent-seed]")).toBeNull();
		expect(view.host.querySelector("[data-agent-caret]")).toBeNull();
		expect(view.animation.cancel).toHaveBeenCalledOnce();
		expect(view.frames.size).toBe(0);
		view.step(1600);
		expect(view.host.textContent).toBe("FirstSecondThird");
	});

	it.each([
		{ finished: true, still: false },
		{ finished: false, still: true },
	])("leaves history and reduced motion settled: %j", (state) => {
		const view = mount({ text: "Already received", ...state });
		expect(view.host.textContent).toBe("Already received");
		expect(view.host.querySelector("[data-agent-seed]")).toBeNull();
		expect(view.host.querySelector("[data-agent-caret]")).toBeNull();
		expect(view.frames.size).toBe(0);
		expect(view.animation.play).not.toHaveBeenCalled();
	});

	it("cancels the wind and its drawing loop when a live thread leaves the screen", () => {
		const view = mount({ text: "First", finished: false, still: false });
		view.step(16);
		view.unmount();
		expect(view.animation.cancel).toHaveBeenCalledOnce();
		expect(view.frames.size).toBe(0);
	});

	it("does not pin live ink over history when the reader scrolls away", () => {
		const view = mount({ text: "First", finished: false, still: false });
		view.step(32);
		const viewport = view.host.querySelector("[data-test-viewport]");
		Object.defineProperties(viewport, { scrollHeight: { value: 1200 }, clientHeight: { value: 500 } });
		view.aim({ x: 100, y: 800 });
		view.step(16);
		expect(view.ink()?.getAttribute("visibility")).toBe("hidden");
	});
});
