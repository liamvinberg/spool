// @vitest-environment happy-dom

import { act, createElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTLE_BUDGET_MS } from "../../cover";
import type { ProjectedFrame } from "../api";
import type { ExportRaster } from "./capture-broker";
import type { CaptureSourceMessage } from "./protocol";

const broker = vi.hoisted(() => ({ id: vi.fn<() => string>(), raster: vi.fn() }));

vi.mock(import("./capture-broker"), async (importOriginal) => ({
	...(await importOriginal()),
	captureRequestId: broker.id,
	rasterCaptureSource: broker.raster,
}));

const { CAPTURE_REPLY_TIMEOUT_MS, useFrameLifecycle } = await import("./lifecycle");
type Lifecycle = ReturnType<typeof useFrameLifecycle>;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
	if (root !== undefined) await act(() => root?.unmount());
	host?.remove();
	root = undefined;
	host = undefined;
	broker.id.mockReset();
	broker.raster.mockReset();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const landing: ProjectedFrame = { name: "landing", x: 0, y: 0, w: 390, h: 844, cover: { hash: "a".repeat(32) } };

function source(id: string, frame = "landing"): CaptureSourceMessage {
	return {
		spool: "capture-source",
		frame,
		id,
		svg: new Blob(["<svg/>"], { type: "image/svg+xml" }),
		width: 390,
		height: 844,
		dpr: 2,
	};
}

/** The hook over fabricated frames, read through the render that last ran. */
async function renderLifecycle(frames: ProjectedFrame[] = [landing]) {
	const framesRef = { current: frames } as unknown as RefObject<ProjectedFrame[]>;
	let lifecycle: Lifecycle | undefined;
	function Harness() {
		lifecycle = useFrameLifecycle({
			framesRef,
			entered: null,
			selectionTargets: new Set(),
			selected: [],
			hovered: null,
			editing: false,
			cameraRef: { current: null },
			viewportRef: { current: null },
		});
		return null;
	}
	const mounted = document.createElement("div");
	host = mounted;
	document.body.append(mounted);
	root = createRoot(mounted);
	await act(() => root?.render(createElement(Harness)));
	const current = () => {
		if (lifecycle === undefined) throw new Error("lifecycle did not mount");
		return lifecycle;
	};
	current();
	return { current, host: mounted };
}

/** An export asked for, the frame held for it, and its document booted and asked. */
async function exporting() {
	const { current, host: mounted } = await renderLifecycle();
	let exported: Promise<ExportRaster | undefined> | undefined;
	await act(async () => {
		exported = current().captureExport("landing");
	});
	expect(current().states.landing).toBe("held");
	// the held document mounts and reports loaded, which is what the export was waiting for
	const iframe = document.createElement("iframe");
	mounted.append(iframe);
	const sourceWindow = iframe.contentWindow;
	if (sourceWindow === null) throw new Error("frame window unavailable");
	const postMessage = vi.spyOn(sourceWindow, "postMessage");
	await act(async () => {
		current().onIframe("landing", iframe);
		current().noteLoaded("landing");
		await Promise.resolve();
	});
	if (exported === undefined) throw new Error("no export");
	return { current, exported, postMessage, iframe, sourceWindow };
}

describe("an export", () => {
	it("holds the frame for its one capture, correlates the image to its id and window, and hands it back", async () => {
		const id = "1".repeat(32);
		broker.id.mockReturnValue(id);
		const sheet: ExportRaster = { url: "data:image/png;base64,cG5n", width: 780, height: 1688 };
		let finish: ((image: ExportRaster) => void) | undefined;
		broker.raster.mockImplementation(
			() =>
				new Promise<ExportRaster>((resolve) => {
					finish = resolve;
				}),
		);
		const { current, exported, sourceWindow } = await exporting();

		// a source from another request, or from another window, is nobody's export
		current().noteCaptureSource(source("a".repeat(32)), sourceWindow);
		current().noteCaptureSource(source(id), {} as WindowProxy);
		expect(broker.raster).not.toHaveBeenCalled();

		current().noteCaptureSource(source(id), sourceWindow);
		current().noteCaptureSource(source(id), sourceWindow);
		expect(broker.raster).toHaveBeenCalledOnce();
		expect(broker.raster.mock.calls[0]?.[0]).toMatchObject({ id, width: 390, height: 844, dpr: 2 });

		await act(async () => {
			finish?.(sheet);
			await expect(exported).resolves.toEqual(sheet);
		});
		expect(current().states.landing).toBe("picture");
	});

	it("asks the frame for a full-size copy, after its own settle", async () => {
		broker.id.mockReturnValue("2".repeat(32));
		broker.raster.mockImplementation(() => new Promise<ExportRaster>(() => {}));
		const { postMessage } = await exporting();
		expect(postMessage).toHaveBeenCalledWith(
			{ spool: "capture", id: "2".repeat(32), settleMs: SETTLE_BUDGET_MS },
			"*",
		);
	});

	it("comes back empty, and aborts its raster, when the document is replaced under it", async () => {
		const id = "5".repeat(32);
		broker.id.mockReturnValue(id);
		broker.raster.mockImplementation(() => new Promise<ExportRaster>(() => {}));
		const { current, exported, iframe, sourceWindow } = await exporting();

		current().noteCaptureSource(source(id), sourceWindow);
		const signal = broker.raster.mock.calls[0]?.[2] as AbortSignal | undefined;
		expect(signal?.aborted).toBe(false);

		const replacement = document.createElement("iframe");
		host?.append(replacement);
		await act(async () => {
			current().onIframe("landing", replacement);
			await expect(exported).resolves.toBeUndefined();
		});
		expect(signal?.aborted).toBe(true);
		iframe.remove();
	});

	it("times out one unresolved raster and aborts it", async () => {
		const id = "6".repeat(32);
		broker.id.mockReturnValue(id);
		broker.raster.mockImplementation(() => new Promise<ExportRaster>(() => {}));
		vi.useFakeTimers();
		const { current, exported, sourceWindow } = await exporting();

		current().noteCaptureSource(source(id), sourceWindow);
		const signal = broker.raster.mock.calls[0]?.[2] as AbortSignal | undefined;

		await act(() => vi.advanceTimersByTimeAsync(CAPTURE_REPLY_TIMEOUT_MS + SETTLE_BUDGET_MS - 1));
		expect(signal?.aborted).toBe(false);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
			await expect(exported).resolves.toBeUndefined();
		});
		expect(signal?.aborted).toBe(true);
	});

	it("comes back empty on the shim's own error, without a raster", async () => {
		const id = "7".repeat(32);
		broker.id.mockReturnValue(id);
		const { current, exported, sourceWindow } = await exporting();

		await act(async () => {
			current().noteCaptureSource(
				{ spool: "capture-source", frame: "landing", id, error: "capture canvases too large" },
				sourceWindow,
			);
			await expect(exported).resolves.toBeUndefined();
		});
		expect(broker.raster).not.toHaveBeenCalled();
	});

	it("refuses a frame the canvas does not have, and a second export while one is held", async () => {
		const { current } = await renderLifecycle();
		await expect(current().captureExport("elsewhere")).resolves.toBeUndefined();
		let first: Promise<ExportRaster | undefined> | undefined;
		await act(async () => {
			first = current().captureExport("landing");
		});
		await expect(current().captureExport("landing")).resolves.toBeUndefined();
		expect(first).toBeDefined();
	});
});
