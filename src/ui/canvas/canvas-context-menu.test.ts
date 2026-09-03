// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { accelKeyName } from "../../runtime/platform-keys";
import { ProjectCanvas } from "./canvas";

/** The deep-select modifier as this environment binds it — ctrl under happy-dom, ⌘ on a Mac. */
const ACCEL = accelKeyName() === "Meta" ? { metaKey: true } : { ctrlKey: true };

const frames = [{ name: "home", x: 0, y: 0, w: 320, h: 240 }];

describe("canvas context menu", () => {
	it("reloads a frame with a fresh document", async () => {
		const { host, canvas } = await renderCanvas();
		const firstDocument = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
		expect(firstDocument).not.toBeNull();

		await reloadFromMenu(host, canvas);

		expect(host.querySelector('iframe[title="home"]')).not.toBe(firstDocument);
		expect(host.querySelector('[role="menu"]')).toBeNull();
	});

	it("opens for a frame without selecting an element", async () => {
		const { host, canvas } = await renderCanvas();
		const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
		expect(iframe?.contentWindow).not.toBeNull();

		const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
		postMessage.mockClear();
		await openFrameMenu(canvas);

		const menu = host.querySelector('[role="menu"]');
		expect(menu?.textContent).toContain("Export as PNG");
		expect(menu?.className).toContain("z-30");
		expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ spool: "pick" }), "*");
	});

	it("clears an element-only selection when reloading", async () => {
		const { host, canvas } = await renderCanvas();
		const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="home"]');
		expect(iframe?.contentWindow).not.toBeNull();

		const postMessage = vi.spyOn(iframe?.contentWindow as Window, "postMessage");
		postMessage.mockClear();
		await act(async () => {
			host.querySelector<HTMLButtonElement>('button[aria-label="select"]')?.click();
		});
		await act(async () => {
			canvas.dispatchEvent(
				new PointerEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: 40,
					clientY: 40,
					...ACCEL,
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
					source: iframe?.contentWindow ?? null,
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

	it("trashes the selected frame from the Delete key", async () => {
		const { host, canvas } = await renderCanvas();
		// the menu's own route to the selection, so ⌫ acts on the same frames
		await openFrameMenu(canvas);
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
		});

		expect(host.querySelector('[data-frame-label="home"]')).toBeNull();
	});

	it("leaves an entered frame alone: its keys belong to the prototype", async () => {
		const { host } = await renderCanvas();
		await act(async () =>
			host
				.querySelector<HTMLElement>('[data-frame-label="home"]')
				?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 40, clientY: 40 })),
		);
		for (const key of ["Delete", "Backspace", "r", "e", "p"]) {
			await act(async () => {
				window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
			});
		}

		expect(host.querySelector('[data-frame-label="home"]')).not.toBeNull();
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
	await until(() => host.querySelector(`[data-frame-label="${frame.name}"]`) !== null);
	const canvas = host.querySelector<HTMLElement>('[role="application"]');
	if (canvas === null) throw new Error("canvas did not render");
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 40, clientY: 40, pointerId: 1 }),
		);
	});
	await until(() => host.querySelector(`iframe[title="${frame.name}"]`) !== null);
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
	// the item's own label, never its key hint — matching the whole text would
	// break every time an item gains or loses a shortcut
	const item = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
		(candidate) => candidate.querySelector("span")?.textContent === label,
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
			return Response.json({ camera: { x: 0, y: 0, k: 1 } });
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
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
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
