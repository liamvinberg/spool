// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

const frames = [{ name: "home", x: 0, y: 0, w: 320, h: 240, kind: "html", hasThumb: false }];

describe("canvas context menu", () => {
	it("opens for a selected frame in design mode without selecting an element", async () => {
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
		await until(() => host.querySelector('iframe[title="home"]') !== null);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');
		const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
		expect(canvas).not.toBeNull();
		expect(iframe?.contentWindow).not.toBeNull();

		await act(async () => {
			canvas?.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
			);
			canvas?.dispatchEvent(
				new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
			);
		});

		const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
		postMessage.mockClear();
		await act(async () => {
			canvas?.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
			);
		});

		expect(host.querySelector('[role="menu"]')?.textContent).toContain("Export as PNG");
		expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ spool: "pick" }), "*");
	});

	it("does not offer frame export for an element-only selection", async () => {
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
		await until(() => host.querySelector('iframe[title="home"]') !== null);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');
		const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
		expect(canvas).not.toBeNull();
		expect(iframe?.contentWindow).not.toBeNull();

		const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
		postMessage.mockClear();
		await act(async () => {
			canvas?.dispatchEvent(
				new PointerEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: 40,
					clientY: 40,
					metaKey: true,
					pointerId: 1,
				}),
			);
		});
		const request = postMessage.mock.calls
			.map(([message]) => message)
			.find(
				(message) =>
					typeof message === "object" && message !== null && "spool" in message && message.spool === "pick",
			);
		expect(request).toEqual(expect.objectContaining({ spool: "pick" }));
		const id = (request as { id: number }).id;

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						spool: "picked",
						frame: "home",
						id,
						chain: [
							{
								selector: "#headline",
								tag: "h1",
								outerHtml: '<h1 id="headline">Hello</h1>',
								rect: { x: 20, y: 20, w: 180, h: 48 },
								radius: 0,
								source: "frames/home/frame.tsx:4:3",
								generated: false,
							},
						],
					},
				}),
			);
		});

		await act(async () => {
			canvas?.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
			);
		});

		const menu = host.querySelector('[role="menu"]');
		expect(menu).not.toBeNull();
		expect(menu?.textContent).not.toContain("Export");
	});
});

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
		vi.fn(async (input: RequestInfo | URL) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			if (url.pathname.endsWith("/state")) {
				return Response.json({ mode: "design", camera: { x: 0, y: 0, k: 1 } });
			}
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: [], frames, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
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
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
