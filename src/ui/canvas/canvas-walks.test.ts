// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { SETTINGS } from "../../settings/registry";
import type { Flows } from "../api";
import { settingsMoved } from "../settings";
import { type CanvasChrome, ProjectCanvas } from "./canvas";
import { openEventStream } from "./test-event-stream";

/**
 * The walk layer as the canvas drives it (#151, amended by #203): the walks
 * this page can take that no arrow can reach, on screen at rest with nothing
 * selected. Same-page edges stay the arrows; a walk that leaves the page docks
 * on its frame as a pressable tag; a walk that lands nowhere is not drawn.
 *
 * The geometry is walk-layer.test.ts's. What is asserted here is the wiring:
 * that the marks appear without being asked for, that pressing one travels,
 * and that the one setting governs the whole layer.
 */

const PROJECTION = {
	root: "/project",
	pages: ["shop"],
	frames: [
		{ name: "home", x: 0, y: 0, w: 390, h: 844 },
		{ name: "menu", x: 500, y: 0, w: 390, h: 844 },
		{ name: "shop/checkout", page: "shop", x: 0, y: 0, w: 390, h: 844 },
	],
};

const FLOWS: Flows = {
	frames: ["home", "menu", "shop/checkout"],
	edges: [
		{ from: "home", to: "menu", certainty: "will", sites: [] },
		{ from: "home", to: "shop/checkout", certainty: "might", sites: [], verified: true },
		{ from: "home", to: "ghost", certainty: "will", sites: [], missing: true },
	],
	unreadable: [],
};

/** The machine's settings as the daemon reads them back: only the threads matter here. */
const threadsReading = (on: boolean) => ({
	project: null,
	entries: [{ ...SETTINGS["canvas.threads"], key: "canvas.threads", value: on, source: on ? "default" : "file" }],
});

function mount(flows: Flows = FLOWS) {
	const chrome: { latest: CanvasChrome | null } = { latest: null };
	const settings = { threads: true, writes: [] as unknown[] };
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/events")) return openEventStream();
			if (url.pathname.endsWith("/api/settings")) {
				if (init?.method === "PUT") {
					const body = JSON.parse(String(init.body)) as { key: string; value: boolean };
					settings.writes.push(body);
					settings.threads = body.value;
					return Response.json(threadsReading(settings.threads).entries[0]);
				}
				return Response.json(threadsReading(settings.threads));
			}
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
		settings,
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
			// the settings are one machine-wide reading, shared across tests: read this test's
			await act(async () => settingsMoved());
		},
	};
}

const exitTag = (host: HTMLElement, target: string) =>
	host.querySelector<HTMLButtonElement>(`[data-walk-exit="${target}"]`);

describe("the walk layer", () => {
	it("draws an off-page walk on its own frame, with nothing selected and nothing hovered", async () => {
		const canvas = mount();
		await canvas.render();

		const tag = exitTag(canvas.host, "shop/checkout");
		expect(tag).not.toBeNull();
		// the page it lands on, and the certainty the arrows already distinguish
		expect(tag?.textContent).toContain("checkout");
		expect(tag?.textContent).toContain("shop");
		// the tag says the page beside the name, so the name is the frame's own (#336)
		expect(tag?.textContent).not.toContain("shop/checkout");
		// nothing was selected to earn it — read off the rail, whose rows exist
		// once the folder holding them is open (#229)
		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="Expand root"]')?.click();
		});
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
	});

	it("travels when an exit tag is pressed: the page follows and the target is the selection", async () => {
		const canvas = mount();
		await canvas.render();

		await act(async () => {
			exitTag(canvas.host, "shop/checkout")?.click();
		});

		expect(canvas.host.querySelector('[data-frame-label="shop/checkout"]')).not.toBeNull();
		expect(canvas.host.querySelector('[data-frame-label="home"]')).toBeNull();
		expect(canvas.host.querySelector('button[aria-label="checkout frame"]')?.getAttribute("aria-pressed")).toBe(
			"true",
		);
	});

	it("flies to the target once its page has arrived, and draws none of the flight on the page it left", async () => {
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
		const canvas = mount();
		await canvas.render();
		const field = () => canvas.host.querySelector<HTMLElement>("[data-canvas-camera]");
		expect(field()?.style.transform).toBe("translate(0px, 0px) scale(1)");

		// from here the display frames come when the test says
		const due: FrameRequestCallback[] = [];
		vi.mocked(requestAnimationFrame).mockImplementation((callback) => {
			due.push(callback);
			return 1;
		});
		const drawn: { page: boolean; transform: string }[] = [];
		// and the clock stands still unless a frame moves it, so the flight is
		// asked for and drawn at the moments the test names, however long a
		// loaded runner takes over the click in between
		const start = performance.now();
		vi.spyOn(performance, "now").mockReturnValue(start);
		const frame = (ahead: number) => {
			const now = start + ahead;
			for (const callback of due.splice(0)) callback(now);
			drawn.push({
				page: canvas.host.querySelector('[data-frame-label="shop/checkout"]') !== null,
				transform: field()?.style.transform ?? "",
			});
		};

		await act(async () => {
			exitTag(canvas.host, "shop/checkout")?.click();
		});
		frame(0);
		frame(110);
		frame(400);

		// every frame of it is on the page it lands on: the page and the flight are one commit
		expect(drawn.every((one) => one.page)).toBe(true);
		const x = (transform: string) => Number(/translate\(([-\d.]+)px/.exec(transform)?.[1]);
		// it sets off from where the camera stood and travels, rather than cutting,
		// to the frame in the middle of the screen
		const [first, middle, last] = drawn.map((one) => x(one.transform));
		expect(first).toBeGreaterThanOrEqual(0);
		expect(middle).toBeGreaterThan(first ?? Number.NaN);
		expect(middle).toBeLessThan(405);
		expect(last).toBe(405);
		expect(drawn[2]?.transform).toBe("translate(405px, -22px) scale(1)");
	});

	it("hides the whole layer when the threads setting is off, arrows and tags together", async () => {
		const canvas = mount();
		await canvas.render();
		await until(() => exitTag(canvas.host, "shop/checkout") !== null);

		canvas.settings.threads = false;
		await act(async () => settingsMoved());

		await until(() => exitTag(canvas.host, "shop/checkout") === null);
		expect(canvas.host.querySelector("svg[data-flow-arrows]")).toBeNull();
	});

	it("flips the machine setting on the threads key, and the layer follows", async () => {
		const canvas = mount();
		await canvas.render();
		await until(() => exitTag(canvas.host, "shop/checkout") !== null);

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true }));
		});

		expect(canvas.settings.writes).toEqual([{ key: "canvas.threads", value: false }]);
		await until(() => exitTag(canvas.host, "shop/checkout") === null);
	});
});

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
