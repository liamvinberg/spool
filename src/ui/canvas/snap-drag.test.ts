// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import type { Geometry } from "../api";
import { ProjectCanvas } from "./canvas";

/**
 * Where a move drag puts a frame down (#241). The math is covered beside the
 * pure module; what these are about is the wiring: the gutter the row keeps
 * reaches the dragged frame, the spans it earns reach the screen, and the
 * platform modifier held through the drag takes all of it away.
 */

const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

/** Two frames a gutter of 80 apart, and a third out on its own to drag in. */
const ROW = [
	{ name: "home", x: 0, y: 0, w: 320, h: 240 },
	{ name: "shell", x: 400, y: 0, w: 320, h: 240 },
	{ name: "detail", x: 1000, y: 0, w: 320, h: 240 },
];

let asked: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
	asked = [];
});

it("lands a dragged frame on the gutter the row already keeps", async () => {
	const { host, canvas } = await renderCanvas();
	// 804 would leave a gap of 84 — four short of the row's 80
	await drag(canvas, { from: 1010, to: 814 });

	expect(host.querySelectorAll("[data-snap-span]")).toHaveLength(2);

	await release(canvas);
	expect(lastGeometry()?.detail?.x).toBe(800);
});

it("marks every gap carrying the matched spacing", async () => {
	const { host, canvas } = await renderCanvas();
	await drag(canvas, { from: 1010, to: 814 });

	const spans = [...host.querySelectorAll<HTMLElement>('[data-snap-span="x"]')];
	// the row's own gutter and the one the drag just made, both 80 wide
	expect(spans.map((span) => span.style.left)).toEqual(["320px", "720px"]);
	expect(spans.map((span) => span.style.width)).toEqual(["80px", "80px"]);
	// laid across the middle of the shared overlap, which is the row's own band
	expect(spans.map((span) => span.style.top)).toEqual(["117px", "117px"]);
});

it("gives the frame to the pointer when the platform modifier is held", async () => {
	const { host, canvas } = await renderCanvas();
	await drag(canvas, { from: 1010, to: 814, extra: ACCEL });

	expect(host.querySelectorAll("[data-snap-span]")).toHaveLength(0);

	await release(canvas);
	expect(lastGeometry()?.detail?.x).toBe(804);
});

async function drag(
	canvas: HTMLElement,
	{ from, to, extra = {} }: { from: number; to: number; extra?: PointerEventInit },
): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: from, clientY: 100, pointerId: 1 }),
		);
	});
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointermove", { bubbles: true, clientX: to, clientY: 100, pointerId: 1, ...extra }),
		);
	});
}

async function release(canvas: HTMLElement): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 }));
	});
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
	await until(() => host.querySelector('[data-frame-label="detail"]') !== null);
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
				return Response.json({ root: "/project", pages: [], frames: ROW, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ROW.map((frame) => frame.name), links: [], edges: [], unreadable: [] });
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
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
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
