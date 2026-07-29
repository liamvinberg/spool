// @vitest-environment happy-dom

import { act, createElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectedFrame } from "../api";
import type { CoverRaster } from "./capture-broker";
import type { CaptureSourceMessage } from "./protocol";

const broker = vi.hoisted(() => ({ id: vi.fn<() => string>(), raster: vi.fn() }));

vi.mock(import("./capture-broker"), async (importOriginal) => ({
	...(await importOriginal()),
	captureRequestId: broker.id,
	rasterCaptureSource: broker.raster,
}));

const { CAPTURE_REPLY_TIMEOUT_MS, CAPTURE_SETTLE_BUDGET_MS, useFrameLifecycle } = await import("./lifecycle");
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
});

function source(id: string, targetWidth: number): CaptureSourceMessage {
	return {
		spool: "capture-source",
		frame: "landing",
		id,
		svg: new Blob(["<svg/>"], { type: "image/svg+xml" }),
		width: 390,
		height: 844,
		dpr: 2,
		targetWidth,
	};
}

async function mountLifecycle(onShot: (frame: string, image: CoverRaster) => void, frames: ProjectedFrame[] = []) {
	const framesRef = { current: frames } as unknown as RefObject<ProjectedFrame[]>;
	let lifecycle: Lifecycle | undefined;
	function Harness() {
		lifecycle = useFrameLifecycle({
			framesRef,
			entered: null,
			selectionTargets: new Set(),
			hasCover: (frame) => frames.some((candidate) => candidate.name === frame && candidate.cover !== undefined),
			onShot,
			cameraRef: { current: null },
			viewportRef: { current: null },
		});
		return null;
	}
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(() => root?.render(createElement(Harness)));
	if (lifecycle === undefined) throw new Error("lifecycle did not mount");

	const iframe = document.createElement("iframe");
	host.append(iframe);
	if (iframe.contentWindow === null) throw new Error("frame window unavailable");
	await act(() => {
		lifecycle?.onIframe("landing", iframe);
		lifecycle?.noteLoaded("landing");
	});
	if (lifecycle === undefined) throw new Error("lifecycle did not update");
	return { iframe, lifecycle, sourceWindow: iframe.contentWindow };
}

describe("capture request lifecycle", () => {
	it("correlates one image to its id and window, and never persists an export", async () => {
		const id1 = "11111111111111111111111111111111";
		const id2 = "22222222222222222222222222222222";
		broker.id.mockReturnValueOnce(id1).mockReturnValueOnce(id2);
		const image: CoverRaster = { url: "data:image/jpeg;base64,anBlZw==", width: 800, height: 1731 };
		const sheet: CoverRaster = { url: "data:image/png;base64,cG5n", width: 390, height: 844 };
		let finishImage: ((image: CoverRaster) => void) | undefined;
		broker.raster
			.mockImplementationOnce(
				() =>
					new Promise<CoverRaster>((resolve) => {
						finishImage = resolve;
					}),
			)
			.mockResolvedValueOnce(sheet);
		const onShot = vi.fn();
		const { lifecycle, sourceWindow } = await mountLifecycle(onShot);

		const cover = lifecycle.capture("landing");
		const otherWindow = {} as WindowProxy;
		lifecycle.noteCaptureSource(source("a".repeat(32), 400), sourceWindow);
		lifecycle.noteCaptureSource(source(id1, 400), otherWindow);
		lifecycle.noteCaptureSource(source(id1, 0), sourceWindow);
		expect(broker.raster).not.toHaveBeenCalled();

		lifecycle.noteCaptureSource(source(id1, 400), sourceWindow);
		lifecycle.noteCaptureSource(source(id1, 400), sourceWindow);
		expect(broker.raster).toHaveBeenCalledOnce();
		expect(broker.raster.mock.calls[0]?.[0]).toMatchObject({ id: id1, targetWidth: 400 });

		finishImage?.(image);
		await expect(cover).resolves.toEqual(image);
		expect(onShot).toHaveBeenCalledWith("landing", image);

		const png = lifecycle.capture("landing", 0);
		lifecycle.noteCaptureSource(source(id1, 0), sourceWindow);
		expect(broker.raster).toHaveBeenCalledTimes(1);
		lifecycle.noteCaptureSource(source(id2, 0), sourceWindow);

		await expect(png).resolves.toEqual(sheet);
		expect(onShot).toHaveBeenCalledOnce();
	});

	it("waits for an ambient cover source before export supersedes its host raster", async () => {
		const coverId = "33333333333333333333333333333333";
		const exportId = "44444444444444444444444444444444";
		broker.id.mockReturnValueOnce(coverId).mockReturnValueOnce(exportId);
		const sheet: CoverRaster = { url: "data:image/png;base64,cG5n", width: 390, height: 844 };
		broker.raster.mockImplementationOnce(() => new Promise<CoverRaster>(() => {})).mockResolvedValueOnce(sheet);
		const frame: ProjectedFrame = {
			name: "landing",
			kind: "html",
			x: 0,
			y: 0,
			w: 390,
			h: 844,
			cover: { hash: "a".repeat(32) },
		};
		const { lifecycle, sourceWindow } = await mountLifecycle(vi.fn(), [frame]);
		const postMessage = vi.spyOn(sourceWindow, "postMessage");

		const cover = lifecycle.capture("landing");
		let exported: Promise<CoverRaster | undefined> | undefined;
		await act(async () => {
			exported = lifecycle.captureExport("landing");
		});

		expect(postMessage).toHaveBeenCalledOnce();
		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({ spool: "capture", id: coverId, targetWidth: 400 }),
			"*",
		);
		expect(broker.raster).not.toHaveBeenCalled();

		await act(async () => {
			lifecycle.noteCaptureSource(source(coverId, 400), sourceWindow);
			await Promise.resolve();
		});
		const coverSignal = broker.raster.mock.calls[0]?.[2] as AbortSignal | undefined;
		await expect(cover).resolves.toBeUndefined();
		expect(coverSignal?.aborted).toBe(true);
		expect(postMessage).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ spool: "capture", id: exportId, targetWidth: 0 }),
			"*",
		);

		await act(async () => {
			lifecycle.noteCaptureSource(source(exportId, 0), sourceWindow);
			await expect(exported).resolves.toEqual(sheet);
		});
	});

	it("rejects an invalid target and aborts raster work when the iframe is replaced", async () => {
		const id = "55555555555555555555555555555555";
		broker.id.mockReturnValue(id);
		broker.raster.mockImplementation(() => new Promise<CoverRaster>(() => {}));
		const { iframe, lifecycle, sourceWindow } = await mountLifecycle(vi.fn());

		await expect(lifecycle.capture("landing", -1)).resolves.toBeUndefined();
		await expect(lifecycle.capture("landing", 401)).resolves.toBeUndefined();
		expect(broker.id).not.toHaveBeenCalled();

		const capture = lifecycle.capture("landing");
		lifecycle.noteCaptureSource(source(id, 400), sourceWindow);
		const signal = broker.raster.mock.calls[0]?.[2] as AbortSignal | undefined;
		expect(signal?.aborted).toBe(false);

		const replacement = document.createElement("iframe");
		host?.append(replacement);
		await act(() => lifecycle.onIframe("landing", replacement));

		await expect(capture).resolves.toBeUndefined();
		expect(signal?.aborted).toBe(true);
		iframe.remove();
	});

	it("times out one unresolved raster, aborts it, and persists nothing", async () => {
		vi.useFakeTimers();
		const id = "66666666666666666666666666666666";
		broker.id.mockReturnValue(id);
		broker.raster.mockImplementation(() => new Promise<CoverRaster>(() => {}));
		const onShot = vi.fn();
		const { lifecycle, sourceWindow } = await mountLifecycle(onShot);

		const capture = lifecycle.capture("landing");
		lifecycle.noteCaptureSource(source(id, 400), sourceWindow);
		const signal = broker.raster.mock.calls[0]?.[2] as AbortSignal | undefined;

		await act(() => vi.advanceTimersByTimeAsync(CAPTURE_REPLY_TIMEOUT_MS + CAPTURE_SETTLE_BUDGET_MS - 1));
		expect(signal?.aborted).toBe(false);
		await act(() => vi.advanceTimersByTimeAsync(1));

		await expect(capture).resolves.toBeUndefined();
		expect(signal?.aborted).toBe(true);
		expect(onShot).not.toHaveBeenCalled();
	});
});
