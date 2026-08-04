// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

interface Projected {
	name: string;
	page?: string;
	kind: "html";
	x: number;
	y: number;
	w: number;
	h: number;
}

describe("canvas page tree", () => {
	it("selects a frame from another page and brings that page onto the canvas", async () => {
		const host = await mountCanvas({
			pages: ["shop"],
			frames: [frame("home"), frame("checkout", { page: "shop", x: 160 })],
		});

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
		expect(host.querySelector('button[aria-label="select"]')?.getAttribute("aria-pressed")).toBe("true");

		await act(async () => {
			host
				.querySelector<HTMLButtonElement>('button[aria-label="checkout frame"]')
				?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		});
		expect(host.querySelector('button[aria-label="select"]')?.getAttribute("aria-pressed")).toBe("true");

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shop page"]')?.click();
		});
		expect(host.querySelector('button[aria-label="checkout frame"]')?.getAttribute("aria-pressed")).toBe("false");
	});

	/**
	 * The rows between two rows, and nothing else. The projection arrives sorted
	 * by name, so a range worked out from it would take `about` and `home` here
	 * and leave `shell` out — two frames somebody never swept over, and one they
	 * did.
	 */
	it("ranges a shift-click over the order the rail is drawing", async () => {
		const host = await mountCanvas({
			pages: [],
			frames: [frame("about"), frame("home", { x: 160 }), frame("shell", { x: 320 })],
			order: { frames: { "": ["shell", "about", "home"] } },
		});
		expect(rowsListed(host)).toEqual(["shell frame", "about frame", "home frame"]);

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="shell frame"]')?.click();
		});
		await act(async () => {
			host
				.querySelector<HTMLButtonElement>('button[aria-label="home frame"]')
				?.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
		});

		expect(pressedRows(host)).toEqual(["shell frame", "about frame", "home frame"]);
	});
});

function frame(name: string, extra: Partial<Projected> = {}): Projected {
	return { name, kind: "html", x: 0, y: 0, w: 100, h: 100, ...extra };
}

/** every frame row on screen, in the order the rail is drawing them */
function rowsListed(host: HTMLElement): Array<string | null> {
	const tree = host.querySelector('[aria-label="Pages tree"]');
	return [...(tree?.querySelectorAll('button[aria-label$=" frame"]') ?? [])].map((node) =>
		node.getAttribute("aria-label"),
	);
}

function pressedRows(host: HTMLElement): Array<string | null> {
	const tree = host.querySelector('[aria-label="Pages tree"]');
	return [...(tree?.querySelectorAll('button[aria-label$=" frame"][aria-pressed="true"]') ?? [])].map((node) =>
		node.getAttribute("aria-label"),
	);
}

async function mountCanvas(project: {
	pages: readonly string[];
	frames: readonly Projected[];
	order?: unknown;
}): Promise<HTMLElement> {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: project.pages, frames: project.frames, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({
					frames: project.frames.map((each) => each.name),
					links: [],
					edges: [],
					unreadable: [],
				});
			}
			if (url.pathname.endsWith("/order")) return Response.json(project.order ?? {});
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
	const first = project.frames[0];
	await until(() => host.querySelector(`[data-frame-label="${first?.name ?? ""}"]`) !== null);
	return host;
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
