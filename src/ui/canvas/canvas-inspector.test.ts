// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { CanvasChrome } from "./canvas";
import { ProjectCanvas } from "./canvas";

/**
 * The selection inspector rail (#58) as the canvas drives it: the header pill
 * is its only control, it is sticky both ways, and the connections tab is the
 * complete outbound list — including the destinations that live on another
 * page, which it navigates to rather than walking.
 */

const PROJECTION = {
	root: "/project",
	pages: ["shop"],
	frames: [
		{ name: "home", kind: "html", x: 0, y: 0, w: 390, h: 844, hasThumb: false },
		{ name: "menu", kind: "html", x: 500, y: 0, w: 390, h: 844, hasThumb: false },
		{ name: "checkout", page: "shop", kind: "html", x: 0, y: 0, w: 390, h: 844, hasThumb: false },
	],
	collisions: [],
};

const FLOWS = {
	frames: ["home", "menu", "checkout"],
	edges: [
		{ from: "home", to: "menu", certainty: "will", sites: [] },
		{ from: "home", to: "checkout", certainty: "might", sites: [], verified: true },
		{ from: "home", to: "ghost", certainty: "will", sites: [], missing: true },
	],
	unreadable: [],
};

function mount() {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) return Response.json(PROJECTION);
			if (url.pathname.endsWith("/flows")) return Response.json(FLOWS);
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
	let chrome: CanvasChrome | null = null;
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});
	return {
		host,
		chrome: () => chrome,
		render: async () => {
			await act(async () => {
				root.render(
					createElement(ProjectCanvas, {
						project: "test",
						onChrome: (next: CanvasChrome | null) => {
							chrome = next;
						},
					}),
				);
			});
			await until(() => host.querySelector('[data-frame-label="home"]') !== null);
			await expandPage(host, "root");
		},
	};
}

const rail = (host: HTMLElement) => host.querySelector('aside[aria-label="Inspector"]');

const tab = (host: HTMLElement, name: string) =>
	[...host.querySelectorAll<HTMLButtonElement>('aside[aria-label="Inspector"] button')].find(
		(button) => button.textContent === name,
	);

/** The tree lists frames under an expanded page folder. */
async function expandPage(host: HTMLElement, page: string): Promise<void> {
	await act(async () => {
		host.querySelector<HTMLButtonElement>(`button[aria-label="Expand ${page}"]`)?.click();
	});
}

describe("the inspector rail", () => {
	it("stays closed until the pill summons it, then stays open across selections", async () => {
		const canvas = mount();
		await canvas.render();

		expect(canvas.chrome()?.inspectorOpen).toBe(false);
		expect(rail(canvas.host)?.hasAttribute("inert")).toBe(true);

		await act(async () => canvas.chrome()?.toggleInspector());
		expect(canvas.chrome()?.inspectorOpen).toBe(true);
		// nothing selected: the honest-empty line, inside the open rail
		expect(rail(canvas.host)?.textContent).toContain("select a frame to inspect it");

		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="home frame"]')?.click();
		});
		const open = rail(canvas.host);
		expect(open?.hasAttribute("inert")).toBe(false);
		expect(open?.textContent).toContain("home");
		expect(open?.textContent).toContain("design/frames/home/frame.tsx");
		expect(open?.textContent).toContain("390 × 844");

		// deselecting does not close it — the pill is the only control
		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="root page"]')?.click();
		});
		expect(canvas.chrome()?.inspectorOpen).toBe(true);
		expect(rail(canvas.host)?.textContent).toContain("select a frame to inspect it");
	});

	it("carries the selected frame's outbound count while it is closed, and nothing while open", async () => {
		const canvas = mount();
		await canvas.render();

		expect(canvas.chrome()?.outboundCount).toBeNull();

		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="home frame"]')?.click();
		});
		expect(canvas.chrome()?.outboundCount).toBe(3);

		await act(async () => canvas.chrome()?.toggleInspector());
		expect(canvas.chrome()?.outboundCount).toBeNull();
	});

	it("lists the whole outbound graph in the connections tab, missing destinations included", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => canvas.chrome()?.toggleInspector());
		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="home frame"]')?.click();
		});
		await act(async () => tab(canvas.host, "connections")?.click());

		const rows = [...canvas.host.querySelectorAll('button[aria-label$=" connection"]')];
		expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
			"menu connection",
			"checkout connection",
			"ghost connection",
		]);
		// a destination no frame answers to is named, never a place to go
		expect(rows[2]?.hasAttribute("disabled")).toBe(true);
		expect(rail(canvas.host)?.textContent).toContain("missing");
	});

	it("navigates the canvas from an off-page connection instead of walking to it", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => canvas.chrome()?.toggleInspector());
		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="home frame"]')?.click();
		});
		await act(async () => tab(canvas.host, "connections")?.click());

		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="checkout connection"]')?.click();
		});

		// the page followed the link and the target is the selection — no walk
		expect(canvas.host.querySelector('[data-frame-label="checkout"]')).not.toBeNull();
		expect(canvas.host.querySelector('[data-frame-label="home"]')).toBeNull();
		expect(canvas.host.querySelector('button[aria-label="checkout frame"]')?.getAttribute("aria-pressed")).toBe(
			"true",
		);
	});
});

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
