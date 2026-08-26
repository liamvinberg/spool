// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, onTestFinished, vi } from "vitest";
import type { Geometry } from "../api";
import { ProjectCanvas } from "./canvas";

/**
 * What a resize drag puts on the screen, and when (#264). The size the pointer
 * works out reaches the frame once per painted frame, because the box is the
 * live document's viewport and every size that lands relayouts it. So the
 * animation frame is held here rather than run, and these are about what the
 * canvas shows while it waits: the last size wins, a release that beats the
 * frame still settles on the size it was let go of, and a drag that was called
 * off paints nothing at all.
 */

/** One frame, alone: nothing to snap an edge to, so the numbers are the pointer's. */
const ALONE = [{ name: "home", x: 0, y: 0, w: 320, h: 240, kind: "html" }];

let asked: Array<{ url: string; body: unknown }> = [];
let painting = new Map<number, FrameRequestCallback>();

beforeEach(() => {
	asked = [];
	painting = new Map();
});

it("applies one size per painted frame, and it is the last one", async () => {
	const { host, canvas } = await renderCanvas();
	await grabEastEdge(host, canvas);

	await move(canvas, 500);
	await move(canvas, 460);
	// both moves are worked out, neither has been given to the frame yet
	expect(readout(host)).toBe("320 × 240");

	await paint();
	expect(readout(host)).toBe("460 × 240");
});

it("settles on the size the pointer let go of when the release beats the frame", async () => {
	const { host, canvas } = await renderCanvas();
	await grabEastEdge(host, canvas);

	await move(canvas, 460);
	await release(canvas);

	expect(readout(host)).toBe("460 × 240");
	expect(lastGeometry()?.home).toEqual({ x: 0, y: 0, w: 460, h: 240 });
});

it("paints nothing after a drag is called off", async () => {
	const { host, canvas } = await renderCanvas();
	await grabEastEdge(host, canvas);

	await move(canvas, 460);
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));
	});
	await paint();

	expect(readout(host)).toBe("320 × 240");
	expect(lastGeometry()).toBeUndefined();
});

/** Select the frame, then take hold of the handle on its east edge. */
async function grabEastEdge(host: HTMLElement, canvas: HTMLElement): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 160, clientY: 120, pointerId: 1 }),
		);
	});
	await release(canvas);
	const handle = host.querySelector<HTMLElement>('[data-handle="e"]');
	if (handle === null) throw new Error("the frame kept no resize handle");
	await act(async () => {
		handle.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 320, clientY: 120, pointerId: 1 }),
		);
	});
}

async function move(canvas: HTMLElement, to: number): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: to, clientY: 120, pointerId: 1 }));
	});
}

async function release(canvas: HTMLElement): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 }));
	});
}

/** Let the display have the frame the canvas has been waiting on. */
async function paint(): Promise<void> {
	const queued = [...painting.values()];
	painting.clear();
	await act(async () => {
		for (const frame of queued) frame(performance.now());
	});
}

/** The size the ring reports, which is the size the frame is drawn at. */
function readout(host: HTMLElement): string | null {
	const spans = [...host.querySelectorAll("span")];
	return spans.find((span) => span.textContent?.includes("×"))?.textContent ?? null;
}

function lastGeometry(): Record<string, Geometry> | undefined {
	return asked
		.filter((ask) => ask.url.endsWith("/geometry"))
		.map((ask) => (ask.body as { frames: Record<string, Geometry> }).frames)
		.at(-1);
}

async function renderCanvas(): Promise<{ host: HTMLDivElement; canvas: HTMLElement }> {
	stubCanvasApis();
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
	const canvas = host.querySelector<HTMLElement>('[role="application"]');
	if (canvas === null) throw new Error("canvas did not render");
	return { host, canvas };
}

function stubCanvasApis(): void {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const setAttribute = HTMLIFrameElement.prototype.setAttribute;
	vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(function (
		this: HTMLIFrameElement,
		name,
		value,
	) {
		setAttribute.call(this, name, name === "src" ? "about:blank" : value);
	});
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
			asked.push({ url: url.pathname, body });
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: [], frames: ALONE, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ALONE.map((frame) => frame.name), links: [], edges: [], unreadable: [] });
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
	// the display is the test's to hand out: nothing is painted until `paint()`
	let handles = 0;
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((frame) => {
		handles += 1;
		painting.set(handles, frame);
		return handles;
	});
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((handle) => {
		painting.delete(handle);
	});
}

async function until(ready: () => boolean, tries = 40): Promise<void> {
	for (let i = 0; i < tries; i++) {
		if (ready()) return;
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
	}
	throw new Error("condition never became true");
}
