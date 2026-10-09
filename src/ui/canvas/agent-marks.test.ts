// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import { EndMark, Spinner, WaitingMark } from "./agent-marks";

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

describe("the agent's marks", () => {
	it("turns a ring with its arc, and rests it as a track alone", () => {
		const turning = draw(createElement(Spinner, { className: "h-3 w-3" })).querySelector("svg") as SVGElement;
		expect(turning.getAttribute("class")).toContain("animate-agent-spin");
		expect(turning.querySelectorAll("path")).toHaveLength(1);

		const resting = draw(createElement(Spinner, { turning: false })).querySelector("svg") as SVGElement;
		expect(resting.getAttribute("class")).not.toContain("animate-agent-spin");
		expect(resting.querySelectorAll("path")).toHaveLength(0);
		expect(resting.querySelectorAll("circle")).toHaveLength(1);
	});

	it("wears the data marks of the surface that draws it", () => {
		const host = draw(createElement(Spinner, { "data-rail-mark": "working" }));
		expect(host.querySelector('svg[data-rail-mark="working"]')).not.toBeNull();
		const waiting = draw(createElement(WaitingMark, { "data-rail-mark": "waiting" }));
		expect(waiting.querySelector('[data-rail-mark="waiting"] .animate-agent-breathe')).not.toBeNull();
	});

	it("ends on a check, a square or a cross", () => {
		const drawn = (ending: "done" | "stopped" | "failed") =>
			draw(createElement(EndMark, { ending })).querySelector(`[data-agent-end-mark="${ending}"]`);
		expect(drawn("done")?.querySelector("path")?.getAttribute("d")).toBe("M3.5 7.4 5.9 9.8 10.5 4.6");
		expect(drawn("stopped")?.querySelector("rect")).not.toBeNull();
		expect(drawn("failed")?.querySelector("path")?.getAttribute("d")).toBe("M4.5 4.5l5 5M9.5 4.5l-5 5");
	});
});
