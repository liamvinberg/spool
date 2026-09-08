// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, type MockInstance, onTestFinished, vi } from "vitest";
import { CAPTURE_AFTER_READY_MS } from "./lifecycle";
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
	{ name: "a", x: 0, y: 0, w: 100, h: 100, cover: { hash: "a".repeat(32) } },
	{ name: "b", x: 160, y: 0, w: 100, h: 100, cover: { hash: "b".repeat(32) } },
];

describe("multi-frame canvas export", () => {
	it.each([false, true])("exports selected frames (delayed download: %s)", async (delayed) => {
		if (delayed)
			vi.useFakeTimers({
				toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
			});
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		const requests: string[] = [];
		const streams: AbortSignal[] = [];
		let releaseDownload: (() => void) | undefined;
		const downloadHeld = delayed
			? new Promise<void>((resolve) => {
					releaseDownload = resolve;
				})
			: Promise.resolve();
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const raw = input instanceof Request ? input.url : String(input);
				if (raw.startsWith("data:image/png;base64,")) {
					await downloadHeld;
					return new Response(PNG_BYTES, { headers: { "content-type": "image/png" } });
				}
				const url = new URL(raw, window.location.href);
				requests.push(url.pathname);
				if (url.pathname.endsWith("/events")) {
					const signal = init?.signal;
					if (!signal) throw new Error("event stream did not carry its cancellation signal");
					streams.push(signal);
					return new Response(
						new ReadableStream<Uint8Array>({
							start(controller) {
								controller.enqueue(new TextEncoder().encode(": connected\n\n"));
								signal.addEventListener("abort", () => controller.close(), { once: true });
							},
						}),
						{ headers: { "content-type": "text/event-stream" } },
					);
				}
				if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
				if (url.pathname.endsWith("/frames")) {
					return Response.json({ root: "/project", pages: [], frames, collisions: [] });
				}
				if (url.pathname.endsWith("/flows")) {
					return Response.json({ frames: ["a", "b"], links: [], edges: [], unreadable: [] });
				}
				if (url.pathname.startsWith("/covers/")) {
					return new Response(PNG_BYTES, { headers: { "content-type": "image/png" } });
				}
				return Response.json({});
			}),
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
			vi.useRealTimers();
			vi.unstubAllGlobals();
			vi.restoreAllMocks();
			expect(streams.length).toBeGreaterThan(0);
			expect(streams.every((signal) => signal.aborted)).toBe(true);
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
		await until(() => heldB.parentElement?.style.visibility === "visible");

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
		// A selected document must survive a download longer than the cover-arrival
		// window. A JSON/EOF event fixture would reconnect and replace it here.
		if (delayed) {
			await act(async () => vi.advanceTimersByTimeAsync(CAPTURE_AFTER_READY_MS + 300));
			expect(downloads).toEqual([]);
			expect(broker.raster.mock.calls.map(([source]) => source.frame)).toEqual(["a"]);
			expect(host.querySelector('iframe[title="b"]')).toBe(heldB);
			expect(heldB.contentWindow).toBe(heldBWindow);
			releaseDownload?.();
		}
		await completeMountedCapture(host, "b", "22222222222222222222222222222222", heldBPost);
		await until(() => host.textContent?.includes("Exported 2 PNG images") === true);

		expect(downloads).toEqual(["a.png", "b.png"]);
		expect(broker.id).toHaveBeenCalledTimes(2);
		expect(broker.raster.mock.calls.map(([source]) => [source.frame, source.targetWidth])).toEqual([
			["a", 0],
			["b", 0],
		]);
		expect(requests.filter((path) => path.startsWith("/covers/"))).toEqual([]);
		const restoredSelection = host.querySelector<HTMLIFrameElement>('iframe[title="b"]');
		expect(restoredSelection?.parentElement?.style.visibility).toBe("visible");
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
	expect(iframe.parentElement?.style.visibility).toBe("visible");
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
		await act(() =>
			vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(10) : new Promise((resolve) => setTimeout(resolve, 10)),
		);
	}
	throw new Error("canvas did not settle");
}
