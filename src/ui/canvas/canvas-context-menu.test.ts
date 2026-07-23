// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

const frames = [{ name: "home", x: 0, y: 0, w: 320, h: 240, kind: "html", hasThumb: false }];

describe("canvas context menu", () => {
	it("reloads a frame with a fresh document", async () => {
		const { host, canvas } = await renderCanvas();
		const firstDocument = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
		expect(firstDocument).not.toBeNull();

		await reloadFromMenu(host, canvas);

		expect(host.querySelector('iframe[title="home"]')).not.toBe(firstDocument);
		expect(host.querySelector('[role="menu"]')).toBeNull();
	});

	it("restarts a terminal frame when reloading it", async () => {
		const { host, canvas, requests } = await renderCanvas([
			{ name: "shell", x: 0, y: 0, w: 320, h: 240, kind: "term", hasThumb: false },
		]);
		await reloadFromMenu(host, canvas);

		expect(
			requests.mock.calls.some(([input, init]) => {
				const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
				const method = input instanceof Request ? input.method : init?.method;
				return url.pathname === "/api/p/test/term/shell/restart" && method === "POST";
			}),
		).toBe(true);
	});

	it("opens for a selected frame in design mode without selecting an element", async () => {
		const { host, canvas } = await renderCanvas();
		const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
		expect(iframe?.contentWindow).not.toBeNull();

		await act(async () => {
			canvas.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
			);
			canvas.dispatchEvent(
				new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
			);
		});

		const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
		postMessage.mockClear();
		await openFrameMenu(canvas);

		expect(host.querySelector('[role="menu"]')?.textContent).toContain("Export as PNG");
		expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ spool: "pick" }), "*");
	});

	it("clears an element-only selection when reloading", async () => {
		const { host, canvas } = await renderCanvas();
		const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
		expect(iframe?.contentWindow).not.toBeNull();

		const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
		postMessage.mockClear();
		await act(async () => {
			canvas.dispatchEvent(
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

		await openFrameMenu(canvas);

		const menu = host.querySelector('[role="menu"]');
		expect(menu).not.toBeNull();
		expect(menu?.textContent).not.toContain("Export");

		await clickMenuItem(host, "Reload frame");
		await openFrameMenu(canvas);

		expect(host.querySelector('[role="menu"]')?.textContent).toContain("Export as PNG");
	});
});

async function renderCanvas(projectedFrames = frames) {
	const requests = stubCanvasApis(projectedFrames);
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
	const frame = projectedFrames[0];
	if (frame === undefined) throw new Error("a canvas test needs one frame");
	await until(() => host.querySelector(`iframe[title="${frame.name}"]`) !== null);
	const canvas = host.querySelector<HTMLElement>('[role="application"]');
	if (canvas === null) throw new Error("canvas did not render");
	return { host, canvas, requests };
}

async function openFrameMenu(canvas: HTMLElement): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
		);
	});
}

async function clickMenuItem(host: HTMLElement, label: string): Promise<void> {
	const item = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
		(candidate) => candidate.textContent === label,
	);
	expect(item).toBeDefined();
	await act(async () => item?.click());
}

async function reloadFromMenu(host: HTMLElement, canvas: HTMLElement): Promise<void> {
	await openFrameMenu(canvas);
	await clickMenuItem(host, "Reload frame");
}

function stubCanvasApis(projectedFrames = frames) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const setAttribute = HTMLIFrameElement.prototype.setAttribute;
	vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(function (
		this: HTMLIFrameElement,
		name,
		value,
	) {
		setAttribute.call(this, name, name === "src" ? "about:blank" : value);
	});
	const requests = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
		const raw = input instanceof Request ? input.url : String(input);
		const url = new URL(raw, window.location.href);
		if (url.pathname.endsWith("/state")) {
			return Response.json({ mode: "design", camera: { x: 0, y: 0, k: 1 } });
		}
		if (url.pathname.endsWith("/frames")) {
			return Response.json({ root: "/project", pages: [], frames: projectedFrames, collisions: [] });
		}
		if (url.pathname.endsWith("/flows")) {
			return Response.json({
				frames: projectedFrames.map((frame) => frame.name),
				links: [],
				edges: [],
				unreadable: [],
			});
		}
		return Response.json({});
	});
	vi.stubGlobal("fetch", requests);
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
	return requests;
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
