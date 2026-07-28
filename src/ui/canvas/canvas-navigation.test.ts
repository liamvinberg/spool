// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

const frames = [
	{ name: "origin", x: 0, y: 0, w: 100, h: 100 },
	{ name: "right", x: 180, y: 0, w: 100, h: 100 },
];

describe("canvas keyboard navigation", () => {
	it("returns from an entered frame, moves spatially, and enters the target without walking", async () => {
		const requests: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const raw = input instanceof Request ? input.url : String(input);
				const url = new URL(raw, window.location.href);
				requests.push(url.pathname);
				if (url.pathname.endsWith("/state")) {
					return Response.json({ camera: { x: 0, y: 0, k: 1 } });
				}
				if (url.pathname.endsWith("/frames")) {
					return Response.json({ root: "/project", pages: [], frames, collisions: [] });
				}
				if (url.pathname.endsWith("/flows"))
					return Response.json({ frames: frames.map(({ name }) => name), links: [], edges: [], unreadable: [] });
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
		await until(() => host.querySelector('[data-frame-label="origin"]') !== null);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');
		expect(canvas).not.toBeNull();

		await act(async () => {
			canvas?.dispatchEvent(
				new PointerEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: 50,
					clientY: 50,
					pointerId: 1,
				}),
			);
			canvas?.dispatchEvent(
				new PointerEvent("pointerup", {
					bubbles: true,
					button: 0,
					clientX: 50,
					clientY: 50,
					pointerId: 1,
				}),
			);
			canvas?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 50, clientY: 50 }));
		});
		expect(labelText(host, "origin")).toContain("live · esc exits");
		const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="origin"]');

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { spool: "key", frame: "origin", key: "Escape" },
					source: iframe?.contentWindow ?? null,
				}),
			);
		});
		expect(document.activeElement).toBe(canvas);
		expect(labelClass(host, "origin")).toContain("text-thread");

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true }));
		});
		expect(labelClass(host, "right")).toContain("text-thread");

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		});
		expect(labelText(host, "right")).toContain("live · esc exits");
		expect(requests.some((path) => path.endsWith("/walked"))).toBe(false);
	});

	it("ctrl+o returns to the walk's departure and ctrl+i retraces it", async () => {
		const cover = { hash: "c".repeat(32) };
		const walkFrames = [
			{ name: "origin", x: 0, y: 0, w: 100, h: 100, kind: "html", cover },
			{ name: "right", x: 180, y: 0, w: 100, h: 100, kind: "html", cover },
		];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const raw = input instanceof Request ? input.url : String(input);
				const url = new URL(raw, window.location.href);
				if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
				if (url.pathname.endsWith("/frames")) {
					return Response.json({ root: "/project", pages: [], frames: walkFrames, collisions: [] });
				}
				if (url.pathname.endsWith("/flows")) {
					return Response.json({
						frames: walkFrames.map(({ name }) => name),
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
		// happy-dom lays nothing out, and the canvas reads the viewport's own box
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);

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
		await until(() => host.querySelector('[data-frame-label="origin"]') !== null);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');

		await act(async () => {
			canvas?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 50, clientY: 50 }));
		});
		expect(labelText(host, "origin")).toContain("live · esc exits");
		await until(() => host.querySelector('iframe[title="origin"]') !== null);
		const source = host.querySelector<HTMLIFrameElement>('iframe[title="origin"]')?.contentWindow ?? null;
		const departed = cameraTransform(host);

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						spool: "go",
						frame: "origin",
						target: "right",
						session: { scenario: "default", state: {}, stack: [] },
						id: 1,
					},
					source,
				}),
			);
		});
		expect(labelText(host, "right")).toContain("live · esc exits");
		const arrived = cameraTransform(host);
		expect(arrived).not.toBe(departed);

		// back arrives as a relayed chord: mid-walk, the entered frame owns the
		// keyboard, and the shim hands the canvas what it must never lose
		await until(() => host.querySelector('iframe[title="right"]') !== null);
		const walked = host.querySelector<HTMLIFrameElement>('iframe[title="right"]')?.contentWindow ?? null;
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", { data: { spool: "key", frame: "right", key: "ctrl+o" }, source: walked }),
			);
		});
		expect(labelText(host, "right")).not.toContain("live");
		expect(cameraTransform(host)).toBe(departed);

		// forward is the canvas's own key once focus is back on it
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", ctrlKey: true }));
		});
		expect(cameraTransform(host)).toBe(arrived);
		expect(labelText(host, "right")).not.toContain("live");
	});
});

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}

function labelText(host: HTMLElement, name: string): string {
	return host.querySelector(`[data-frame-label="${name}"]`)?.textContent ?? "";
}

/** The field's transform is the camera made visible — one string per resting spot. */
function cameraTransform(host: HTMLElement): string {
	const field = [...host.querySelectorAll<HTMLElement>("div")].find((el) => el.style.transformOrigin === "0 0");
	return field?.style.transform ?? "";
}

function labelClass(host: HTMLElement, name: string): string {
	return (
		[...(host.querySelector(`[data-frame-label="${name}"]`)?.querySelectorAll("span") ?? [])]
			.find((span) => span.textContent === name)
			?.getAttribute("class") ?? ""
	);
}
