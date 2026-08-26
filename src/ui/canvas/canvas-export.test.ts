// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, type MockInstance, onTestFinished, vi } from "vitest";
import type { CaptureSourceMessage } from "./protocol";

const broker = vi.hoisted(() => ({
	id: vi.fn<() => string>(),
	raster: vi.fn<(source: CaptureSourceMessage) => Promise<{ url: string; width: number; height: number }>>(),
}));

vi.mock(import("./capture-broker"), async (importOriginal) => ({
	...(await importOriginal()),
	captureRequestId: broker.id,
	rasterCaptureSource: broker.raster,
}));

const { ProjectCanvas } = await import("./canvas");

const PNG_BYTES = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XH1dWQAAAABJRU5ErkJggg==",
		"base64",
	),
);
const PNG_URL = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`;
const frames = [
	{ name: "a", kind: "html", x: 0, y: 0, w: 100, h: 100, cover: { hash: "a".repeat(32) } },
	{ name: "b", kind: "html", x: 160, y: 0, w: 100, h: 100, cover: { hash: "b".repeat(32) } },
	{ name: "terminal", kind: "term", x: 320, y: 0, w: 100, h: 100, cover: { hash: "c".repeat(32) } },
];

describe("multi-frame canvas export", () => {
	it("mounts covered HTML frames one at a time and captures each at full resolution", async () => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		const requests: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL) => {
				const raw = input instanceof Request ? input.url : String(input);
				if (raw.startsWith("data:image/png;base64,")) {
					return new Response(PNG_BYTES, { headers: { "content-type": "image/png" } });
				}
				const url = new URL(raw, window.location.href);
				requests.push(url.pathname);
				if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
				if (url.pathname.endsWith("/frames")) {
					return Response.json({ root: "/project", pages: [], frames, collisions: [] });
				}
				if (url.pathname.endsWith("/flows")) {
					return Response.json({ frames: ["a", "b", "terminal"], links: [], edges: [], unreadable: [] });
				}
				if (url.pathname.startsWith("/covers/")) {
					return new Response(PNG_BYTES, { headers: { "content-type": "image/png" } });
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
		const nativeSetAttribute = HTMLIFrameElement.prototype.setAttribute;
		vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(function (
			this: HTMLIFrameElement,
			name,
			value,
		) {
			nativeSetAttribute.call(this, name, name === "src" ? "about:blank" : value);
		});
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 1);
		vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		const downloads: string[] = [];
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
			downloads.push(this.download);
		});
		broker.id
			.mockReturnValueOnce("11111111111111111111111111111111")
			.mockReturnValueOnce("22222222222222222222222222222222");
		broker.raster.mockResolvedValue({ url: PNG_URL, width: 200, height: 200 });

		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
			broker.id.mockReset();
			broker.raster.mockReset();
			vi.unstubAllGlobals();
			vi.restoreAllMocks();
		});

		await act(async () => {
			root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} }));
		});
		await until(() => host.querySelector('[data-frame-label="a"]') !== null);
		expect(host.querySelectorAll("iframe")).toHaveLength(0);
		const canvas = host.querySelector<HTMLElement>('[role="application"]');
		if (canvas === null) throw new Error("canvas did not render");

		await select(canvas, 40, false);
		await select(canvas, 360, true);
		await select(canvas, 200, true);
		await until(() => host.querySelector('iframe[title="b"]') !== null);
		const heldB = host.querySelector<HTMLIFrameElement>('iframe[title="b"]');
		const heldBWindow = heldB?.contentWindow;
		if (heldB === null || heldBWindow == null) throw new Error("selected frame did not mount");
		const heldBPost = vi.spyOn(heldBWindow, "postMessage");
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { spool: "loaded", frame: "b" },
					source: heldBWindow,
				}),
			);
		});
		await until(() => heldB.parentElement?.style.visibility === "hidden");

		// export lost its key to the Edit tool, so the frame's own menu opens it
		await act(async () => {
			canvas.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
			);
		});
		const exportItem = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((candidate) =>
			candidate.querySelector("span")?.textContent?.startsWith("Export"),
		);
		await act(async () => exportItem?.click());
		await until(() => host.querySelector('[role="dialog"]') !== null);
		const exportButton = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Export",
		);
		await act(async () => exportButton?.click());

		await completeMountedCapture(host, "a", "11111111111111111111111111111111");
		await completeMountedCapture(host, "b", "22222222222222222222222222222222", heldBPost);
		await until(() => host.textContent?.includes("Exported 3 PNG images") === true);

		expect(downloads).toEqual(["a.png", "b.png", "terminal.png"]);
		expect(broker.raster.mock.calls.map(([source]) => [source.frame, source.targetWidth])).toEqual([
			["a", 0],
			["b", 0],
		]);
		expect(requests.filter((path) => path.startsWith("/covers/"))).toEqual([
			`/covers/test/terminal/${"c".repeat(32)}`,
		]);
		const restoredSelection = host.querySelector<HTMLIFrameElement>('iframe[title="b"]');
		expect(restoredSelection?.parentElement?.style.visibility).toBe("hidden");
	});
});

async function select(canvas: HTMLElement, x: number, shiftKey: boolean): Promise<void> {
	await act(async () => {
		canvas.dispatchEvent(
			new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: x,
				clientY: 40,
				pointerId: x,
				shiftKey,
			}),
		);
		canvas.dispatchEvent(
			new PointerEvent("pointerup", {
				bubbles: true,
				button: 0,
				clientX: x,
				clientY: 40,
				pointerId: x,
				shiftKey,
			}),
		);
	});
}

async function completeMountedCapture(
	host: HTMLElement,
	frame: string,
	id: string,
	loadedPost?: MockInstance<Window["postMessage"]>,
): Promise<void> {
	await until(() => host.querySelector(`iframe[title="${frame}"]`) !== null);
	const iframe = host.querySelector<HTMLIFrameElement>(`iframe[title="${frame}"]`);
	const sourceWindow = iframe?.contentWindow;
	if (iframe === null || sourceWindow == null) throw new Error(`${frame} did not mount`);
	expect(iframe.parentElement?.style.visibility).toBe("hidden");
	expect(host.querySelector(`[data-frame-cover="${frame}"]`)).not.toBeNull();
	const postMessage = loadedPost ?? vi.spyOn(sourceWindow, "postMessage");

	if (loadedPost === undefined) {
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { spool: "loaded", frame },
					source: sourceWindow,
				}),
			);
		});
	}
	await until(() =>
		postMessage.mock.calls.some(
			([message]) =>
				typeof message === "object" &&
				message !== null &&
				"spool" in message &&
				message.spool === "capture" &&
				"targetWidth" in message &&
				message.targetWidth === 0,
		),
	);

	await act(async () => {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					spool: "capture-source",
					frame,
					id,
					svg: new Blob(["<svg/>"], { type: "image/svg+xml" }),
					width: 100,
					height: 100,
					dpr: 2,
					targetWidth: 0,
				},
				source: sourceWindow,
			}),
		);
	});
	await until(() => broker.raster.mock.calls.some(([source]) => source.frame === frame));
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	throw new Error("canvas did not settle");
}
