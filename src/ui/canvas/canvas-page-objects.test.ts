// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

/**
 * A page standing on the field that holds it (#265), driven through the canvas.
 *
 * What the pure model cannot answer is what a hand can do to one, so this is
 * about the four gestures: it is drawn where its place says, a press takes it
 * and puts the frame selection down, a drag writes the durable, and a
 * double-click goes inside.
 */

interface Projected {
	name: string;
	page?: string;
	kind: "html";
	x: number;
	y: number;
	w: number;
	h: number;
}

/** every PUT this canvas made to the places durable, in order */
const written: Record<string, { x: number; y: number }>[] = [];

function frame(name: string, extra: Partial<Projected> = {}): Projected {
	return { name, kind: "html", x: 0, y: 0, w: 100, h: 100, ...extra };
}

const PROJECT = {
	pages: ["shop"],
	frames: [frame("home"), frame("checkout", { page: "shop" })],
	places: { shop: { x: 400, y: 0 } },
};

function pageObject(host: HTMLElement, page: string): HTMLElement | null {
	return host.querySelector<HTMLElement>(`[data-page-object="${page}"]`);
}

describe("a page on the field", () => {
	it("stands where its place says, drawing the frames under it", async () => {
		const host = await mountCanvas(PROJECT);
		const object = pageObject(host, "shop");
		expect(object).not.toBeNull();
		expect(object?.style.transform).toBe("translate(400px, 0px)");
		// its name and its count ride above it, the way a frame's label does
		expect(host.textContent).toContain("shop");
	});

	it("draws no object for the page the canvas is standing on", async () => {
		const host = await mountCanvas({
			pages: ["shop", "shop/sale"],
			frames: [frame("home"), frame("checkout", { page: "shop" }), frame("deal", { page: "shop/sale" })],
			places: { shop: { x: 400, y: 0 }, "shop/sale": { x: 900, y: 0 } },
		});
		// the root page draws `shop` and never `shop/sale`, which is inside it
		expect(pageObject(host, "shop")).not.toBeNull();
		expect(pageObject(host, "shop/sale")).toBeNull();
	});

	it("is taken on its own, and puts the frame selection down", async () => {
		const host = await mountCanvas(PROJECT);
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="home frame"]')?.click();
		});
		expect(host.querySelector('button[aria-label="home frame"]')?.getAttribute("aria-pressed")).toBe("true");

		await press(host, { x: 410, y: 10 });
		expect(host.querySelector('button[aria-label="home frame"]')?.getAttribute("aria-pressed")).toBe("false");
		// the rail names the page and says how much is under it, and offers nothing to type
		expect(host.querySelector('[data-properties-row="path"]')?.textContent).toContain("frames/shop");
		expect(host.querySelector('[data-properties-row="frames"]')?.textContent).toContain("1");
	});

	it("moves where it is dragged and writes the arrangement", async () => {
		const host = await mountCanvas(PROJECT);
		await drag(host, { x: 410, y: 10 }, { x: 470, y: 40 });
		expect(pageObject(host, "shop")?.style.transform).toBe("translate(460px, 30px)");
		await until(() => written.at(-1)?.shop?.x === 460);
		expect(written.at(-1)).toEqual({ shop: { x: 460, y: 30 } });
	});

	it("takes one press of undo back, on the stack the frames share", async () => {
		const host = await mountCanvas(PROJECT);
		await drag(host, { x: 410, y: 10 }, { x: 470, y: 40 });
		await until(() => written.at(-1)?.shop?.x === 460);
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }));
		});
		expect(pageObject(host, "shop")?.style.transform).toBe("translate(400px, 0px)");
		await until(() => written.at(-1)?.shop?.x === 400);
		expect(written.at(-1)).toEqual({ shop: { x: 400, y: 0 } });
	});

	it("goes inside on a double-click, the gesture that goes inside a frame", async () => {
		const host = await mountCanvas(PROJECT);
		await act(async () => {
			host
				.querySelector('[data-canvas-camera=""]')
				?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 410, clientY: 10 }));
		});
		expect(host.querySelector('[data-frame-label="checkout"]')).not.toBeNull();
		expect(host.querySelector('[data-frame-label="home"]')).toBeNull();
		expect(pageObject(host, "shop")).toBeNull();
	});

	it("says so on a page nobody has written into, and never on a page of pages", async () => {
		const host = await mountCanvas({
			pages: ["shop", "fresh"],
			frames: [frame("home"), frame("checkout", { page: "shop" })],
			places: { shop: { x: 400, y: 0 }, fresh: { x: 800, y: 0 } },
		});
		expect(host.querySelector("[data-page-empty]")).toBeNull();

		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="fresh page"]')?.click();
		});
		const empty = host.querySelector("[data-page-empty]");
		expect(empty?.textContent).toContain("no frames yet");
		expect(empty?.textContent).toContain("frames/fresh/<name>/frame.tsx");
	});
});

/** a pointer press and release on the camera layer, in viewport coordinates */
async function press(host: HTMLElement, at: { x: number; y: number }): Promise<void> {
	await drag(host, at, at);
}

async function drag(host: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
	const surface = host.querySelector('[role="application"]');
	if (surface === null) throw new Error("no canvas surface");
	const pointer = (type: string, at: { x: number; y: number }) =>
		new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: at.x, clientY: at.y });
	await act(async () => {
		surface.dispatchEvent(pointer("pointerdown", from));
	});
	if (from.x !== to.x || from.y !== to.y) {
		await act(async () => {
			surface.dispatchEvent(pointer("pointermove", to));
		});
	}
	await act(async () => {
		surface.dispatchEvent(pointer("pointerup", to));
	});
}

async function mountCanvas(project: {
	pages: readonly string[];
	frames: readonly Projected[];
	places: Record<string, { x: number; y: number }>;
}): Promise<HTMLElement> {
	written.length = 0;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			if (url.pathname.endsWith("/places")) {
				written.push(JSON.parse(String(init?.body ?? "{}")));
				return new Response(null, { status: 204 });
			}
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) {
				return Response.json({
					root: "/project",
					pages: project.pages,
					places: project.places,
					frames: project.frames,
					collisions: [],
				});
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({
					frames: project.frames.map((each) => each.name),
					links: [],
					edges: [],
					unreadable: [],
				});
			}
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
	// the presses below are in viewport coordinates, so they only mean what this
	// file says they mean once the stored camera has landed at the origin
	await until(() => camera(host)?.style.transform === "translate(0px, 0px) scale(1)");
	return host;
}

function camera(host: HTMLElement): HTMLElement | null {
	return host.querySelector<HTMLElement>('[data-canvas-camera=""]');
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
