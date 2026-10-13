// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";
import { openEventStream } from "./test-event-stream";

const frames = [{ name: "a", x: 0, y: 0, w: 400, h: 400 }];

it("keeps the camera a canvas is closed on before it settled, for the tab that comes back", async () => {
	const puts: unknown[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request =
				input instanceof Request ? input : new Request(new URL(String(input), window.location.href), init);
			const url = new URL(request.url);
			if (url.pathname.endsWith("/events")) return openEventStream();
			if (url.pathname.endsWith("/state")) {
				if (request.method === "PUT") {
					puts.push(await request.json());
					return new Response(null, { status: 204 });
				}
				return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			}
			if (url.pathname.endsWith("/frames")) return Response.json({ root: "/project", pages: [], frames });
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["a"], links: [], edges: [], unreadable: [] });
			}
			return Response.json({});
		}),
	);
	const setAttribute = HTMLIFrameElement.prototype.setAttribute;
	vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(function (
		this: HTMLIFrameElement,
		name,
		value,
	) {
		setAttribute.call(this, name, name === "src" ? "about:blank" : value);
	});
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
		callback(performance.now() + 1000);
		return 1;
	});
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
	vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	let mounted = true;
	onTestFinished(() => {
		if (mounted) act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	await act(async () => root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} })));
	await until(() => host.querySelector('[data-frame-label="a"]') !== null);
	expect(cameraTransform(host)).toBe("translate(0px, 0px) scale(1)");
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", code: "Minus", bubbles: true }));
	});
	await until(() => !cameraTransform(host).endsWith("scale(1)"));
	expect(puts).toEqual([]);

	act(() => root.unmount());
	mounted = false;
	await until(() => puts.length > 0);
	const kept = puts[0] as { camera?: { k: number } };
	expect(kept.camera?.k).toBeLessThan(1);
});

function cameraTransform(host: HTMLElement): string {
	const field = [...host.querySelectorAll<HTMLElement>("div")].find((el) => el.style.transformOrigin === "0 0");
	return field?.style.transform ?? "";
}

async function until(check: () => boolean): Promise<void> {
	for (let i = 0; i < 50; i++) {
		if (check()) return;
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
	throw new Error("canvas did not settle");
}
