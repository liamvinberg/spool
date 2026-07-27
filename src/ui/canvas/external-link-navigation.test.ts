// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

const frames = [{ name: "origin", x: 0, y: 0, w: 1200, h: 760 }];

describe("external links from an entered frame", () => {
	it("confirms above the untouched frame and Escape stays in the prototype", async () => {
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
		await until(() => host.querySelector('[data-frame-label="origin"]') !== null);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');
		expect(canvas).not.toBeNull();

		await act(async () => {
			canvas?.dispatchEvent(
				new PointerEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: 600,
					clientY: 380,
					pointerId: 1,
				}),
			);
			canvas?.dispatchEvent(
				new PointerEvent("pointerup", {
					bubbles: true,
					button: 0,
					clientX: 600,
					clientY: 380,
					pointerId: 1,
				}),
			);
			canvas?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 600, clientY: 380 }));
		});
		expect(labelText(host)).toContain("live · esc exits");
		const iframe = host.querySelector<HTMLIFrameElement>('iframe[title="origin"]');

		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						spool: "external",
						frame: "origin",
						href: "https://github.com/liamvinberg/spool",
					},
					source: iframe?.contentWindow ?? null,
				}),
			);
		});

		const dialog = host.querySelector('[role="dialog"]');
		expect(dialog?.textContent).toContain("Open external link?");
		const open = dialog?.querySelector<HTMLAnchorElement>('a[href="https://github.com/liamvinberg/spool"]');
		expect(open?.target).toBe("_blank");
		expect(open?.rel).toBe("noopener noreferrer");
		expect(labelText(host)).toContain("live · esc exits");
		expect(document.activeElement?.textContent).toBe("Stay here");

		await act(async () => {
			document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }));
		});
		expect(host.querySelector('[role="dialog"]')).not.toBeNull();
		expect(labelText(host)).toContain("live · esc exits");

		const field = host.querySelector<HTMLElement>('[style*="transform-origin"]');
		const transform = field?.style.transform;
		await act(async () => {
			host
				.querySelector(".spool-external-backdrop")
				?.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 }));
		});
		expect(field?.style.transform).toBe(transform);

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		});

		expect(host.querySelector('[role="dialog"]')).toBeNull();
		expect(labelText(host)).toContain("live · esc exits");
	});
});

function stubCanvasApis(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const raw = input instanceof Request ? input.url : String(input);
			const url = new URL(raw, window.location.href);
			if (url.pathname.endsWith("/state")) {
				return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			}
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: [], frames, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["origin"], links: [], edges: [], unreadable: [] });
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
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}

function labelText(host: HTMLElement): string {
	return host.querySelector('[data-frame-label="origin"]')?.textContent ?? "";
}
