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

const { ARRIVE_DEADLINE_MS, CAPTURE_REPLY_TIMEOUT_MS, CAPTURE_SETTLE_BUDGET_MS, ERRANDS_IN_FLIGHT, useFrameLifecycle } =
	await import("./lifecycle");
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

function source(id: string, targetWidth: number, frame = "landing"): CaptureSourceMessage {
	return {
		spool: "capture-source",
		frame,
		id,
		svg: new Blob(["<svg/>"], { type: "image/svg+xml" }),
		width: 390,
		height: 844,
		dpr: 2,
		targetWidth,
	};
}

/** The hook over fabricated frames, read through the render that last ran. */
async function renderLifecycle(
	onShot: (frame: string, image: CoverRaster) => void,
	frames: ProjectedFrame[],
	onCaptureFailure: (frame: string, reason: string) => void,
): Promise<{ current: () => Lifecycle; host: HTMLDivElement }> {
	const framesRef = { current: frames } as unknown as RefObject<ProjectedFrame[]>;
	let lifecycle: Lifecycle | undefined;
	function Harness() {
		lifecycle = useFrameLifecycle({
			framesRef,
			// one page, and it is the whole project
			allFramesRef: framesRef,
			entered: null,
			selectionTargets: new Set(),
			selected: [],
			hovered: null,
			editing: false,
			hasCover: (frame) => frames.some((candidate) => candidate.name === frame && candidate.cover !== undefined),
			onShot,
			onCaptureFailure,
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

/** A document for the frame, booted: what the shell's iframe and its loaded report hand the hook. */
async function boot(lifecycle: () => Lifecycle, host: HTMLDivElement, frame: string) {
	const iframe = document.createElement("iframe");
	host.append(iframe);
	if (iframe.contentWindow === null) throw new Error("frame window unavailable");
	await act(() => {
		lifecycle().onIframe(frame, iframe);
		lifecycle().noteLoaded(frame);
	});
	return { iframe, sourceWindow: iframe.contentWindow };
}

async function mountLifecycle(
	onShot: (frame: string, image: CoverRaster) => void,
	frames: ProjectedFrame[] = [],
	onCaptureFailure: (frame: string, reason: string) => void = vi.fn(),
) {
	const { current, host } = await renderLifecycle(onShot, frames, onCaptureFailure);
	const { iframe, sourceWindow } = await boot(current, host, "landing");
	return { iframe, lifecycle: current(), sourceWindow };
}

describe("capture request lifecycle", () => {
	it("retires an old picture when the frame changes before its capture returns", async () => {
		const oldId = "1".repeat(32);
		const newId = "2".repeat(32);
		broker.id.mockReturnValueOnce(oldId).mockReturnValueOnce(newId);
		const image: CoverRaster = { url: "data:image/jpeg;base64,anBlZw==", width: 800, height: 800 };
		broker.raster.mockResolvedValue(image);
		const onShot = vi.fn();
		const { lifecycle, sourceWindow } = await mountLifecycle(onShot);
		const old = lifecycle.capture("landing");
		lifecycle.markStale("landing");
		lifecycle.noteCaptureSource(source(oldId, 400), sourceWindow);
		await expect(old).resolves.toBeUndefined();
		expect(onShot).not.toHaveBeenCalled();
		const fresh = lifecycle.capture("landing");
		lifecycle.noteCaptureSource(source(newId, 400), sourceWindow);
		await expect(fresh).resolves.toEqual(image);
		expect(onShot).toHaveBeenCalledExactlyOnceWith("landing", image);
	});

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

describe("capture-failure reasons (#173)", () => {
	it("reports the shim's own error reply", async () => {
		const id = "77777777777777777777777777777777";
		broker.id.mockReturnValue(id);
		const onCaptureFailure = vi.fn();
		const { lifecycle, sourceWindow } = await mountLifecycle(vi.fn(), [], onCaptureFailure);

		const capture = lifecycle.capture("landing");
		lifecycle.noteCaptureSource(
			{ spool: "capture-source", frame: "landing", id, error: "capture canvases too large" },
			sourceWindow,
		);

		await expect(capture).resolves.toBeUndefined();
		expect(broker.raster).not.toHaveBeenCalled();
		expect(onCaptureFailure).toHaveBeenCalledOnce();
		expect(onCaptureFailure).toHaveBeenCalledWith("landing", "capture canvases too large");
	});

	it("reports a reply that never came, but not a document swap that merely retires the wait", async () => {
		vi.useFakeTimers();
		const firstId = "88888888888888888888888888888888";
		const secondId = "99999999999999999999999999999999";
		broker.id.mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
		broker.raster.mockImplementation(() => new Promise<CoverRaster>(() => {}));
		const onCaptureFailure = vi.fn();
		const { iframe, lifecycle } = await mountLifecycle(vi.fn(), [], onCaptureFailure);

		const timedOut = lifecycle.capture("landing");
		await act(() => vi.advanceTimersByTimeAsync(CAPTURE_REPLY_TIMEOUT_MS + CAPTURE_SETTLE_BUDGET_MS));
		await expect(timedOut).resolves.toBeUndefined();
		expect(onCaptureFailure).toHaveBeenCalledOnce();
		expect(onCaptureFailure).toHaveBeenCalledWith("landing", "capture reply timed out");

		// a fresh request, then the document underneath it is swapped mid-flight —
		// ordinary under an edit stream, and never a reason to record
		onCaptureFailure.mockClear();
		lifecycle.capture("landing");
		const replacement = document.createElement("iframe");
		host?.append(replacement);
		await act(() => lifecycle.onIframe("landing", replacement));

		expect(onCaptureFailure).not.toHaveBeenCalled();
		iframe.remove();
	});
});

describe("errands (#94, #177)", () => {
	/** Frames with no picture yet, each one owed an errand. */
	const owed = (count: number): ProjectedFrame[] =>
		Array.from({ length: count }, (_, index) => ({ name: `f${index}`, x: index * 500, y: 0, w: 390, h: 844 }));
	const image: CoverRaster = { url: "data:image/jpeg;base64,anBlZw==", width: 800, height: 1731 };

	/** The sweep's interval and the clock it reads, both stopped until a test moves them. */
	function stopTime() {
		vi.useFakeTimers();
		let clock = 1_000;
		vi.spyOn(performance, "now").mockImplementation(() => clock);
		return (ms: number) => {
			clock += ms;
		};
	}

	/** The settle budget of every capture the frame's document was asked for. */
	function captureSettles(sourceWindow: WindowProxy) {
		const post = vi.spyOn(sourceWindow, "postMessage");
		return () =>
			post.mock.calls
				.map(([message]) => message as { spool: string; settleMs?: number })
				.filter((message) => message.spool === "capture")
				.map((message) => message.settleMs);
	}

	it("photographs a borrowed frame that went quiet arriving without settling it again", async () => {
		const tick = stopTime();
		broker.id.mockReturnValue("1".repeat(32));
		const { current, host } = await renderLifecycle(vi.fn(), owed(1), vi.fn());
		expect(current().states.f0).toBe("refreshing");

		tick(50);
		const { sourceWindow } = await boot(current, host, "f0");
		const settles = captureSettles(sourceWindow);
		await act(() => current().noteArrived("f0", true));

		expect(settles()).toEqual([0]);
	});

	it("settles a borrowed frame that arrived by running out its budget", async () => {
		// a long entrance is still mid-arrival when the arrival settle gives up
		const tick = stopTime();
		broker.id.mockReturnValue("3".repeat(32));
		const { current, host } = await renderLifecycle(vi.fn(), owed(1), vi.fn());

		tick(50);
		const { sourceWindow } = await boot(current, host, "f0");
		const settles = captureSettles(sourceWindow);
		await act(() => current().noteArrived("f0", false));

		expect(settles()).toEqual([CAPTURE_SETTLE_BUDGET_MS]);
	});

	it("settles a borrowed frame resized mid-arrival, however quiet its late report", async () => {
		// The resize reflows the document in place, after its settle began: the
		// report is of the frame before the change.
		const tick = stopTime();
		broker.id.mockReturnValue("4".repeat(32));
		const { current, host } = await renderLifecycle(vi.fn(), owed(1), vi.fn());

		tick(50);
		const { sourceWindow } = await boot(current, host, "f0");
		const settles = captureSettles(sourceWindow);
		tick(100);
		await act(() => current().markStale("f0"));
		await act(() => current().noteArrived("f0", true));

		expect(settles()).toEqual([CAPTURE_SETTLE_BUDGET_MS]);
	});

	it("settles a borrowed frame whose arrival only its deadline vouched for", async () => {
		const tick = stopTime();
		broker.id.mockReturnValue("2".repeat(32));
		const { current, host } = await renderLifecycle(vi.fn(), owed(1), vi.fn());

		tick(50);
		const { sourceWindow } = await boot(current, host, "f0");
		const settles = captureSettles(sourceWindow);
		await act(() => vi.advanceTimersByTimeAsync(ARRIVE_DEADLINE_MS));

		expect(settles()).toEqual([CAPTURE_SETTLE_BUDGET_MS]);
	});

	it("hands a slot to the next frame owed a picture the moment one lands, not a sweep later", async () => {
		// Without this, a freed slot stands empty until the next sweep, up to its
		// whole interval, every time an errand comes home.
		const tick = stopTime();
		const id = "5".repeat(32);
		broker.id.mockReturnValue(id);
		broker.raster.mockResolvedValue(image);
		const onShot = vi.fn();
		const { current, host } = await renderLifecycle(onShot, owed(ERRANDS_IN_FLIGHT + 1), vi.fn());
		const next = `f${ERRANDS_IN_FLIGHT}`;
		expect(current().states[next]).toBe("picture");

		tick(50);
		const { sourceWindow } = await boot(current, host, "f0");
		await act(() => current().noteArrived("f0", true));
		await act(async () => {
			current().noteCaptureSource(source(id, 400, "f0"), sourceWindow);
		});

		expect(onShot).toHaveBeenCalledExactlyOnceWith("f0", image);
		expect(current().states.f0).toBe("picture");
		expect(current().states[next]).toBe("refreshing");
	});
});
