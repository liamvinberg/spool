// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

describe("canvas page tree", () => {
	it("selects a frame from another page and brings that page onto the canvas", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
				if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
				if (url.pathname.endsWith("/frames")) {
					return Response.json({
						root: "/project",
						pages: ["shop"],
						frames: [
							{ name: "home", kind: "html", x: 0, y: 0, w: 100, h: 100, hasThumb: false },
							{ name: "checkout", page: "shop", kind: "html", x: 160, y: 0, w: 100, h: 100, hasThumb: false },
						],
						collisions: [],
					});
				}
				if (url.pathname.endsWith("/flows"))
					return Response.json({ frames: ["home", "checkout"], links: [], edges: [], unreadable: [] });
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
		await until(() => host.querySelector('[data-frame-label="home"]') !== null);

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="Expand shop"]')?.click();
		});
		expect(host.querySelector('button[aria-label="checkout frame"]')?.closest("[inert]")).toBeNull();

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="checkout frame"]')?.click();
		});

		expect(host.querySelector('[data-frame-label="home"]')).toBeNull();
		expect(host.querySelector('[data-frame-label="checkout"]')).not.toBeNull();
		expect(host.querySelector('button[aria-label="checkout frame"]')?.getAttribute("aria-pressed")).toBe("true");

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shop page"]')?.click();
		});
		expect(host.querySelector('button[aria-label="checkout frame"]')?.getAttribute("aria-pressed")).toBe("false");
	});
});

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
