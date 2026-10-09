// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { Fade, Versioned } from "./agent-float";
import { FADE_OUT_MS } from "./agent-motion";

function draw(element: ReturnType<typeof createElement>) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => root.render(element));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	return Object.assign(host, { redraw: (next: ReturnType<typeof createElement>) => act(() => root.render(next)) });
}

/** what a Fade draws around a Stop, open or not */
const stop = (open: boolean, fold = false) =>
	createElement(Fade, {
		open,
		fold,
		"data-probe": "",
		// biome-ignore lint/correctness/noChildrenProp: a .ts test has no JSX, and Fade's props require them
		children: createElement("button", { type: "button" }, "Stop"),
	});

/** the reader asking for stillness, from the next thing that mounts */
function stillnessAsked() {
	const was = window.matchMedia;
	window.matchMedia = ((query: string) => ({
		...was.call(window, query),
		matches: query.includes("reduce"),
	})) as never;
	onTestFinished(() => {
		window.matchMedia = was;
	});
}

describe("a thing that fades in and out of the rail", () => {
	it("stays mounted through its exit, inert and hidden, and only then goes", () => {
		vi.useFakeTimers();
		onTestFinished(() => {
			vi.useRealTimers();
		});
		const host = draw(stop(true));
		const probe = () => host.querySelector<HTMLElement>("[data-probe]");
		expect(probe()?.className).toContain("animate-agent-fade-in");
		expect(probe()?.hasAttribute("inert")).toBe(false);

		host.redraw(stop(false));
		expect(probe()?.textContent).toBe("Stop");
		expect(probe()?.className).toContain("animate-agent-fade-out");
		expect(probe()?.hasAttribute("inert")).toBe(true);
		expect(probe()?.getAttribute("aria-hidden")).toBe("true");
		expect(probe()?.hasAttribute("data-leaving")).toBe(true);

		act(() => vi.advanceTimersByTime(FADE_OUT_MS - 10));
		expect(probe()).not.toBeNull();
		act(() => vi.advanceTimersByTime(20));
		expect(probe()).toBeNull();
	});

	it("comes straight back when asked back mid-exit", () => {
		vi.useFakeTimers();
		onTestFinished(() => {
			vi.useRealTimers();
		});
		const host = draw(stop(true));
		host.redraw(stop(false));
		act(() => vi.advanceTimersByTime(FADE_OUT_MS / 2));
		host.redraw(stop(true));
		act(() => vi.advanceTimersByTime(FADE_OUT_MS));
		const probe = host.querySelector<HTMLElement>("[data-probe]");
		expect(probe?.className).toContain("animate-agent-fade-in");
		expect(probe?.hasAttribute("inert")).toBe(false);
	});

	it("folds its height away as it goes, where it stands in a column", () => {
		const host = draw(stop(true, true));
		const probe = () => host.querySelector<HTMLElement>("[data-probe]");
		expect(probe()?.className).toContain("animate-agent-step");
		host.redraw(stop(false, true));
		expect(probe()?.className).toContain("animate-agent-step-out");
		expect(probe()?.textContent).toBe("Stop");
	});

	it("goes at once where stillness was asked for", () => {
		stillnessAsked();
		const host = draw(stop(true));
		host.redraw(stop(false));
		expect(host.querySelector("[data-probe]")).toBeNull();
	});
});

describe("a model's name with its version", () => {
	it("reads as Opus 5.5, its period bold with 0.08em either side", () => {
		const host = draw(createElement(Versioned, { name: "Opus 5.5" }));
		expect(host.textContent).toBe("Opus 5.5");
		const periods = [...host.querySelectorAll<HTMLElement>("[data-version-period]")];
		expect(periods).toHaveLength(1);
		expect(periods[0]?.textContent).toBe(".");
		expect(periods[0]?.style.fontWeight).toBe("700");
		expect(periods[0]?.style.marginInline).toBe("0.08em");
	});

	it("leaves the words and a period outside a version alone", () => {
		const host = draw(createElement(Versioned, { name: "GPT-5.1.2 mini. Fast" }));
		expect(host.textContent).toBe("GPT-5.1.2 mini. Fast");
		expect(host.querySelectorAll("[data-version-period]")).toHaveLength(2);
	});

	it("keeps the version legible while a search marks part of it", () => {
		const host = draw(createElement(Versioned, { name: "Opus 5.5", hit: "s 5." }));
		expect(host.textContent).toBe("Opus 5.5");
		const mark = host.querySelector("mark");
		expect(mark?.textContent).toBe("s 5.");
		expect(mark?.querySelector("[data-version-period]")).not.toBeNull();
		expect(host.querySelectorAll("[data-version-period]")).toHaveLength(1);
	});
});
