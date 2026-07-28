// @vitest-environment happy-dom

import { act, createElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectedFrame } from "../api";
import type { CoverRaster } from "./capture-broker";
import type { CaptureSourceMessage } from "./protocol";

const broker = vi.hoisted(() => ({
	id: vi.fn<() => string>(),
	raster: vi.fn(),
}));

// the broker's two doors are stubbed; its budgets are the real ones, because the
// lifecycle's own timeout is defined as outlasting them
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

function source(id: string, maxEdge: number): CaptureSourceMessage {
	return {
		spool: "capture-source",
		frame: "landing",
		id,
		svg: new Blob(["<svg/>"], { type: "image/svg+xml" }),
		width: 390,
		height: 844,
		dpr: 2,
		maxEdge,
	};
}

async function mountLifecycle(onShot: (frame: string, rungs: CoverRaster[]) => void) {
	const framesRef = { current: [] } as unknown as RefObject<ProjectedFrame[]>;
	let lifecycle: Lifecycle | undefined;
	function Harness() {
		lifecycle = useFrameLifecycle({
			framesRef,
			entered: null,
			frozen: null,
			inspected: null,
			hasCover: () => false,
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
	it("correlates one raster to the current id/window and persists only the bounded ladder", async () => {
		const id1 = "11111111111111111111111111111111";
		const id2 = "22222222222222222222222222222222";
		broker.id.mockReturnValueOnce(id1).mockReturnValueOnce(id2);
		const ladder: CoverRaster[] = [
			{ url: "data:image/jpeg;base64,anBlZw==", width: 780, height: 1688 },
			{ url: "data:image/jpeg;base64,anBlZw==", width: 390, height: 844 },
			{ url: "data:image/jpeg;base64,anBlZw==", width: 195, height: 422 },
		];
		const sheet: CoverRaster[] = [{ url: "data:image/png;base64,cG5n", width: 390, height: 844 }];
		let finishLadder: ((rungs: CoverRaster[]) => void) | undefined;
		broker.raster
			.mockImplementationOnce(
				() =>
					new Promise<CoverRaster[]>((resolve) => {
						finishLadder = resolve;
					}),
			)
			.mockResolvedValueOnce(sheet);
		const onShot = vi.fn();
		const { lifecycle, sourceWindow } = await mountLifecycle(onShot);

		const cover = lifecycle.capture("landing", 4096);
		const otherWindow = {} as WindowProxy;
		lifecycle.noteCaptureSource(source("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 4096), sourceWindow);
		lifecycle.noteCaptureSource(source(id1, 4096), otherWindow);
		lifecycle.noteCaptureSource(source(id1, 0), sourceWindow);
		expect(broker.raster).not.toHaveBeenCalled();

		lifecycle.noteCaptureSource(source(id1, 4096), sourceWindow);
		lifecycle.noteCaptureSource(source(id1, 4096), sourceWindow);
		expect(broker.raster).toHaveBeenCalledOnce();
		expect(broker.raster.mock.calls[0]?.[0]).toMatchObject({ id: id1, maxEdge: 4096 });

		finishLadder?.(ladder);
		await expect(cover).resolves.toEqual(ladder);
		expect(onShot).toHaveBeenCalledWith("landing", ladder);

		const png = lifecycle.capture("landing", 0);
		lifecycle.noteCaptureSource(source(id1, 0), sourceWindow);
		expect(broker.raster).toHaveBeenCalledTimes(1);
		lifecycle.noteCaptureSource(source(id2, 0), sourceWindow);

		// an export is the caller's artifact: it comes back and is never stored
		await expect(png).resolves.toEqual(sheet);
		expect(onShot).toHaveBeenCalledOnce();
	});

	it("rejects invalid bounds and aborts raster work when its iframe is replaced", async () => {
		const id = "33333333333333333333333333333333";
		broker.id.mockReturnValue(id);
		broker.raster.mockImplementation(() => new Promise<CoverRaster[]>(() => {}));
		const { iframe, lifecycle, sourceWindow } = await mountLifecycle(vi.fn());

		await expect(lifecycle.capture("landing", -1)).resolves.toBeUndefined();
		await expect(lifecycle.capture("landing", 16385)).resolves.toBeUndefined();
		expect(broker.id).not.toHaveBeenCalled();

		const capture = lifecycle.capture("landing", 4096);
		lifecycle.noteCaptureSource(source(id, 4096), sourceWindow);
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
		const id = "44444444444444444444444444444444";
		broker.id.mockReturnValue(id);
		broker.raster.mockImplementation(() => new Promise<CoverRaster[]>(() => {}));
		const onShot = vi.fn();
		const { lifecycle, sourceWindow } = await mountLifecycle(onShot);

		const capture = lifecycle.capture("landing", 4096);
		lifecycle.noteCaptureSource(source(id, 4096), sourceWindow);
		const signal = broker.raster.mock.calls[0]?.[2] as AbortSignal | undefined;

		await act(() => vi.advanceTimersByTimeAsync(CAPTURE_REPLY_TIMEOUT_MS + CAPTURE_SETTLE_BUDGET_MS - 1));
		expect(signal?.aborted).toBe(false);
		await act(() => vi.advanceTimersByTimeAsync(1));

		await expect(capture).resolves.toBeUndefined();
		expect(signal?.aborted).toBe(true);
		expect(onShot).not.toHaveBeenCalled();
	});
});
