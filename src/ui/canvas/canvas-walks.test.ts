// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { Flows } from "../api";
import { type CanvasChrome, ProjectCanvas } from "./canvas";

/**
 * The walk layer as the canvas drives it (#151, amended by #203): the walks
 * this page can take that no arrow can reach, on screen at rest with nothing
 * selected. Same-page edges stay the arrows; a walk that leaves the page docks
 * on its frame as a pressable tag; a walk that lands nowhere is not drawn.
 *
 * The geometry is walk-layer.test.ts's. What is asserted here is the wiring:
 * that the marks appear without being asked for, that pressing one travels,
 * and that the one toggle governs the whole layer.
 */

const PROJECTION = {
	root: "/project",
	pages: ["shop"],
	frames: [
		{ name: "home", kind: "html", x: 0, y: 0, w: 390, h: 844 },
		{ name: "menu", kind: "html", x: 500, y: 0, w: 390, h: 844 },
		{ name: "checkout", page: "shop", kind: "html", x: 0, y: 0, w: 390, h: 844 },
	],
	collisions: [],
};

const FLOWS: Flows = {
	frames: ["home", "menu", "checkout"],
	edges: [
		{ from: "home", to: "menu", certainty: "will", sites: [] },
		{ from: "home", to: "checkout", certainty: "might", sites: [], verified: true },
		{ from: "home", to: "ghost", certainty: "will", sites: [], missing: true },
	],
	unreadable: [],
};

function mount(flows: Flows = FLOWS) {
	const chrome: { latest: CanvasChrome | null } = { latest: null };
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) return Response.json(PROJECTION);
			if (url.pathname.endsWith("/flows/resolve")) return Response.json({ skipped: 0, read: 0, unavailable: 0 });
			if (url.pathname.endsWith("/flows")) return Response.json(flows);
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
	return {
		host,
		chrome,
		render: async () => {
			await act(async () => {
				root.render(
					createElement(ProjectCanvas, {
						project: "test",
						onChrome: (next: CanvasChrome | null) => {
							if (next !== null) chrome.latest = next;
						},
					}),
				);
			});
			await until(() => host.querySelector('[data-frame-label="home"]') !== null);
		},
	};
}

const exitTag = (host: HTMLElement, target: string) =>
	host.querySelector<HTMLButtonElement>(`[data-walk-exit="${target}"]`);

describe("the walk layer", () => {
	it("draws an off-page walk on its own frame, with nothing selected and nothing hovered", async () => {
		const canvas = mount();
		await canvas.render();

		const tag = exitTag(canvas.host, "checkout");
		expect(tag).not.toBeNull();
		// the page it lands on, and the certainty the arrows already distinguish
		expect(tag?.textContent).toContain("checkout");
		expect(tag?.textContent).toContain("shop");
		// nothing was selected to earn it
		expect(canvas.host.querySelector('button[aria-label="home frame"]')?.getAttribute("aria-pressed")).toBe("false");
	});

	it("leaves a same-page walk to the arrow that already draws it", async () => {
		const canvas = mount();
		await canvas.render();

		expect(exitTag(canvas.host, "menu")).toBeNull();
	});

	/**
	 * The canvas draws what you can act on (#203). A dead walk cannot be
	 * pressed and its fix is in source, so it stays in `spool flows` and in
	 * what an agent reads rather than taking a face here.
	 */
	it("draws nothing for a destination no frame answers to", async () => {
		const canvas = mount();
		await canvas.render();

		expect(canvas.host.textContent).not.toContain("ghost");
		expect(canvas.host.textContent).not.toContain("missing");
	});

	it("draws nothing for a walk whose destination cannot be read", async () => {
		const canvas = mount({
			...FLOWS,
			edges: [],
			unreadable: [{ frame: "home", path: "shared/ui/rows.tsx", line: 11 }],
		});
		await canvas.render();

		expect(canvas.host.textContent).not.toContain("rows.tsx");
		expect(canvas.host.textContent).not.toContain("unreadable");
		expect(canvas.chrome.latest?.hasThreads).toBe(false);
	});

	it("travels when an exit tag is pressed: the page follows and the target is the selection", async () => {
		const canvas = mount();
		await canvas.render();

		await act(async () => {
			exitTag(canvas.host, "checkout")?.click();
		});

		expect(canvas.host.querySelector('[data-frame-label="checkout"]')).not.toBeNull();
		expect(canvas.host.querySelector('[data-frame-label="home"]')).toBeNull();
		expect(canvas.host.querySelector('button[aria-label="checkout frame"]')?.getAttribute("aria-pressed")).toBe(
			"true",
		);
	});

	it("hides the whole layer on one toggle, arrows and tags together", async () => {
		const canvas = mount();
		await canvas.render();
		expect(canvas.chrome.latest?.arrowsOn).toBe(true);

		await act(async () => canvas.chrome.latest?.toggleArrows());

		expect(exitTag(canvas.host, "checkout")).toBeNull();
		expect(canvas.host.querySelector("svg[data-flow-arrows]")).toBeNull();
	});

	it("offers the toggle for a page whose only walks leave it", async () => {
		// no same-page edge at all: the old rule counted no thread and drew no switch
		const canvas = mount({
			frames: ["home", "menu", "checkout"],
			edges: [{ from: "home", to: "checkout", certainty: "will", sites: [] }],
			unreadable: [],
		});
		await canvas.render();

		expect(canvas.chrome.latest?.hasThreads).toBe(true);
	});

	it("draws no switch over a page with nothing to hide", async () => {
		const canvas = mount({ frames: ["home", "menu", "checkout"], edges: [], unreadable: [] });
		await canvas.render();

		expect(canvas.chrome.latest?.hasThreads).toBe(false);
	});
});

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
