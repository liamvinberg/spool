// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

const frames = [
	{ name: "origin", x: 0, y: 0, w: 100, h: 100, hasThumb: false },
	{ name: "right", x: 180, y: 0, w: 100, h: 100, hasThumb: false },
];

describe("live canvas keyboard navigation", () => {
	it("returns from an entered frame, moves spatially, and enters the target without walking", async () => {
		const requests: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const raw = input instanceof Request ? input.url : String(input);
				const url = new URL(raw, window.location.href);
				requests.push(url.pathname);
				if (url.pathname.endsWith("/state")) {
					return Response.json({ mode: "live", camera: { x: 0, y: 0, k: 1 } });
				}
				if (url.pathname.endsWith("/frames")) {
					return Response.json({ root: "/project", pages: [], frames, collisions: [] });
				}
				if (url.pathname.endsWith("/flows"))
					return Response.json({ frames: frames.map(({ name }) => name), links: [], edges: [], unreadable: [] });
				return Response.json({});
			}),
		);
		vi.stubGlobal(
			"EventSource",
			class {
				addEventListener() {}
				close() {}
			},
		);
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
			callback(performance.now() + 1000);
			return 1;
		});
		vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
			vi.unstubAllGlobals();
			vi.restoreAllMocks();
		});

		await act(async () => {
			root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} }));
		});
		await until(() => host.querySelector('[data-frame-label="origin"]') !== null);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');
		expect(canvas).not.toBeNull();

		await act(async () => {
			canvas?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 50, clientY: 50 }));
		});
		expect(labelText(host, "origin")).toContain("live · esc exits");

		await act(async () => {
			window.dispatchEvent(new MessageEvent("message", { data: { spool: "key", frame: "origin", key: "Escape" } }));
		});
		expect(document.activeElement).toBe(canvas);
		expect(labelClass(host, "origin")).toContain("text-thread");

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
		});
		expect(labelClass(host, "right")).toContain("text-thread");

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		});
		expect(labelText(host, "right")).toContain("live · esc exits");
		expect(requests.some((path) => path.endsWith("/walked"))).toBe(false);
	});
});

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}

function labelText(host: HTMLElement, name: string): string {
	return host.querySelector(`[data-frame-label="${name}"]`)?.textContent ?? "";
}

function labelClass(host: HTMLElement, name: string): string {
	return (
		[...(host.querySelector(`[data-frame-label="${name}"]`)?.querySelectorAll("span") ?? [])]
			.find((span) => span.textContent === name)
			?.getAttribute("class") ?? ""
	);
}
