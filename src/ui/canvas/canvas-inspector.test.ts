// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { Flows } from "../api";
import { ProjectCanvas } from "./canvas";

/**
 * The selection inspector rail (#58) as the canvas drives it: its fixed
 * canvas-edge strip is its control, it is sticky both ways, and the
 * connections tab is the complete outbound list — including the destinations
 * that live on another page, which it navigates to rather than walking.
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

const FLOWS: Flows = {
	frames: ["home", "menu", "checkout"],
	edges: [
		{ from: "home", to: "menu", certainty: "will", sites: [] },
		{ from: "home", to: "checkout", certainty: "might", sites: [], verified: true },
		{ from: "home", to: "ghost", certainty: "will", sites: [], missing: true },
	],
	unreadable: [],
};

function mount(flows: typeof FLOWS = FLOWS) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) return Response.json(PROJECTION);
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
		render: async () => {
			await act(async () => {
				root.render(
					createElement(ProjectCanvas, {
						project: "test",
						onChrome: () => {},
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
	it("stays collapsed until its canvas-edge control expands it, then stays open across selections", async () => {
		const canvas = mount();
		await canvas.render();

		expect(rail(canvas.host)?.getAttribute("style")).toContain("width: 44px");
		expect(canvas.host.querySelector('button[aria-label="Expand inspector"]')).not.toBeNull();

		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="Expand inspector"]')?.click();
		});
		expect(rail(canvas.host)?.getAttribute("style")).toContain("width: 300px");
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

		// deselecting does not close it — the rail's own control is the only control
		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="root page"]')?.click();
		});
		expect(canvas.host.querySelector('button[aria-label="Collapse inspector"]')).not.toBeNull();
		expect(rail(canvas.host)?.textContent).toContain("select a frame to inspect it");
	});

	it("reads the entered frame: being inside a prototype is when its elements matter", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="Expand inspector"]')?.click();
		});

		const viewport = canvas.host.querySelector<HTMLElement>('[role="application"]');
		for (const kind of ["pointerdown", "pointerup"]) {
			await act(async () => {
				viewport?.dispatchEvent(
					new PointerEvent(kind, { bubbles: true, button: 0, clientX: 50, clientY: 50, pointerId: 1 }),
				);
			});
		}
		await act(async () => {
			viewport?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 50, clientY: 50 }));
		});

		expect(canvas.host.querySelector('[data-frame-label="home"]')?.textContent).toContain("live · esc exits");
		expect(rail(canvas.host)?.textContent).toContain("design/frames/home/frame.tsx");
		expect(rail(canvas.host)?.textContent).not.toContain("select a frame to inspect it");
	});

	it("carries the selected frame's outbound count in the collapsed strip", async () => {
		const canvas = mount();
		await canvas.render();

		expect(canvas.host.querySelector('button[aria-label="Expand inspector"]')?.textContent).toBe("");

		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="home frame"]')?.click();
		});
		expect(canvas.host.querySelector('button[aria-label="Expand inspector"]')?.textContent).toBe("3");

		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="Expand inspector"]')?.click();
		});
		expect(canvas.host.querySelector('button[aria-label="Expand inspector"]')).toBeNull();
	});

	it("lists the whole outbound graph in the connections tab, missing destinations included", async () => {
		const canvas = mount();
		await canvas.render();
		// Cross-page connections no longer duplicate themselves under the frame.
		expect(canvas.host.querySelector("[data-portal]")).toBeNull();
		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="Expand inspector"]')?.click();
		});
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

	it("names a walk whose destination cannot be read instead of showing nothing", async () => {
		const canvas = mount({
			...FLOWS,
			edges: [],
			unreadable: [{ frame: "home", path: "shared/ui/rows.tsx", line: 11 }],
		});
		await canvas.render();
		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="Expand inspector"]')?.click();
		});
		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="home frame"]')?.click();
		});
		await act(async () => tab(canvas.host, "connections")?.click());

		// the frame has no derivable edge at all, and that must not read as "no walks"
		const text = rail(canvas.host)?.textContent ?? "";
		expect(text).toContain("unreadable");
		expect(text).toContain("shared/ui/rows.tsx:11");
		expect(text).not.toContain("no outbound links from this frame");
	});

	it("navigates the canvas from an off-page connection instead of walking to it", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => {
			canvas.host.querySelector<HTMLButtonElement>('button[aria-label="Expand inspector"]')?.click();
		});
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

	it("resizes up to 480 pixels and snaps to its strip below 144 pixels", async () => {
		const canvas = mount();
		await canvas.render();
		const inspector = rail(canvas.host);
		const resize = canvas.host.querySelector<HTMLButtonElement>('button[aria-label="Resize inspector"]');

		expect(inspector?.getAttribute("style")).toContain("width: 44px");
		expect(resize).not.toBeNull();

		await act(async () => {
			resize?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 0, pointerId: 1 }));
			resize?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: -600, pointerId: 1 }));
			resize?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: -600, pointerId: 1 }));
		});
		expect(inspector?.getAttribute("style")).toContain("width: 480px");

		await act(async () => {
			resize?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 0, pointerId: 2 }));
			resize?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 400, pointerId: 2 }));
			resize?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 400, pointerId: 2 }));
		});
		expect(inspector?.getAttribute("style")).toContain("width: 44px");
		expect(canvas.host.querySelector('button[aria-label="Expand inspector"]')).not.toBeNull();
	});
});

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
