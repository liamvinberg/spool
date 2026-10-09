// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import { Versioned } from "./agent-float";

function draw(element: ReturnType<typeof createElement>) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => root.render(element));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	return host;
}

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
