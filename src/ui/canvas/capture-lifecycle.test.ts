// @vitest-environment happy-dom

import { act, createElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Camera, ProjectedFrame } from "../api";
import type { CaptureSourceMessage } from "./protocol";

const broker = vi.hoisted(() => ({
	id: vi.fn<() => string>(),
	raster: vi.fn(),
}));

vi.mock("./capture-broker", () => ({
	captureRequestId: broker.id,
	rasterCaptureSource: broker.raster,
}));

const { CAPTURE_SETTLE_BUDGET_MS, useFrameLifecycle } = await import("./lifecycle");
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

async function mountLifecycle(onShot: (frame: string, dataUrl: string) => void) {
	const framesRef = { current: [] } as unknown as RefObject<ProjectedFrame[]>;
	const cameraRef = { current: null } as RefObject<Camera | null>;
	const viewportRef = { current: null } as RefObject<HTMLDivElement | null>;
	let lifecycle: Lifecycle | undefined;
	function Harness() {
		lifecycle = useFrameLifecycle({
			framesRef,
			cameraRef,
			viewportRef,
			entered: null,
			frozen: null,
			inspected: null,
			hasThumb: () => false,
			onShot,
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
	it("correlates one raster to the current id/window and persists only bounded JPEG captures", async () => {
		const id1 = "11111111111111111111111111111111";
		const id2 = "22222222222222222222222222222222";
		broker.id.mockReturnValueOnce(id1).mockReturnValueOnce(id2);
		let finishJpeg: ((url: string) => void) | undefined;
		broker.raster
			.mockImplementationOnce(
				() =>
					new Promise<string>((resolve) => {
						finishJpeg = resolve;
					}),
			)
			.mockResolvedValueOnce("data:image/png;base64,cG5n");
		const onShot = vi.fn();
		const { lifecycle, sourceWindow } = await mountLifecycle(onShot);

		const jpeg = lifecycle.capture("landing", 1200);
		const otherWindow = {} as WindowProxy;
		lifecycle.noteCaptureSource(source("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 1200), sourceWindow);
		lifecycle.noteCaptureSource(source(id1, 1200), otherWindow);
		lifecycle.noteCaptureSource(source(id1, 0), sourceWindow);
		expect(broker.raster).not.toHaveBeenCalled();

		lifecycle.noteCaptureSource(source(id1, 1200), sourceWindow);
		lifecycle.noteCaptureSource(source(id1, 1200), sourceWindow);
		expect(broker.raster).toHaveBeenCalledOnce();
		expect(broker.raster.mock.calls[0]?.[0]).toMatchObject({ id: id1, maxEdge: 1200 });

		finishJpeg?.("data:image/jpeg;base64,anBlZw==");
		await expect(jpeg).resolves.toBe("data:image/jpeg;base64,anBlZw==");
		expect(onShot).toHaveBeenCalledOnce();

		const png = lifecycle.capture("landing", 0);
		lifecycle.noteCaptureSource(source(id1, 0), sourceWindow);
		expect(broker.raster).toHaveBeenCalledTimes(1);
		lifecycle.noteCaptureSource(source(id2, 0), sourceWindow);

		await expect(png).resolves.toBe("data:image/png;base64,cG5n");
		expect(onShot).toHaveBeenCalledOnce();
	});

	it("rejects invalid bounds and aborts raster work when its iframe is replaced", async () => {
		const id = "33333333333333333333333333333333";
		broker.id.mockReturnValue(id);
		broker.raster.mockImplementation(() => new Promise<string>(() => {}));
		const { iframe, lifecycle, sourceWindow } = await mountLifecycle(vi.fn());

		await expect(lifecycle.capture("landing", -1)).resolves.toBeUndefined();
		await expect(lifecycle.capture("landing", 16385)).resolves.toBeUndefined();
		expect(broker.id).not.toHaveBeenCalled();

		const capture = lifecycle.capture("landing", 1200);
		lifecycle.noteCaptureSource(source(id, 1200), sourceWindow);
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
		broker.raster.mockImplementation(() => new Promise<string>(() => {}));
		const onShot = vi.fn();
		const { lifecycle, sourceWindow } = await mountLifecycle(onShot);

		const capture = lifecycle.capture("landing", 1200);
		lifecycle.noteCaptureSource(source(id, 1200), sourceWindow);
		const signal = broker.raster.mock.calls[0]?.[2] as AbortSignal | undefined;

		await act(() => vi.advanceTimersByTimeAsync(3000));
		expect(signal?.aborted).toBe(false);
		await act(() => vi.advanceTimersByTimeAsync(CAPTURE_SETTLE_BUDGET_MS));

		await expect(capture).resolves.toBeUndefined();
		expect(signal?.aborted).toBe(true);
		expect(onShot).not.toHaveBeenCalled();
	});
});
