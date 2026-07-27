// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptureBrokerPlatform } from "./capture-broker";
import type { CaptureSourceMessage } from "./protocol";

class FakePort {
	onmessage: ((event: MessageEvent) => void) | null = null;
	onmessageerror: (() => void) | null = null;
	postMessage = vi.fn();
	start = vi.fn();
	close = vi.fn();
}

class FakeMessageChannel {
	readonly port1 = new FakePort();
	readonly port2 = new FakePort();
}

const captureOrigin = "http://capture-spool.localhost:7766";
const source: CaptureSourceMessage = {
	spool: "capture-source",
	frame: "landing",
	id: "0123456789abcdef0123456789abcdef",
	svg: new Blob(["<svg/>"], { type: "image/svg+xml" }),
	width: 390,
	height: 844,
	dpr: 2,
	maxEdge: 4096,
};

const rung = (width: number, height: number) => ({ url: "data:image/jpeg;base64,eA==", width, height });

afterEach(() => {
	vi.restoreAllMocks();
});

function harness() {
	const channel = new FakeMessageChannel();
	const iframe = document.createElement("iframe");
	const workerPost = vi.fn();
	Object.defineProperty(iframe, "contentWindow", { configurable: true, value: { postMessage: workerPost } });
	const remove = vi.spyOn(iframe, "remove");
	const append = vi.fn();
	const platform: CaptureBrokerPlatform = {
		createIframe: () => iframe,
		createChannel: () => channel as unknown as MessageChannel,
		append,
		setTimeout: (callback, delay) => window.setTimeout(callback, delay),
		clearTimeout: (id) => window.clearTimeout(id),
	};
	return { append, channel, iframe, platform, remove, workerPost };
}

describe("trusted capture broker", () => {
	it("uses one offscreen isolated worker, exact origin, and cleans every resource after its exact result", async () => {
		const { rasterCaptureSource } = await import("./capture-broker");
		const { append, channel, iframe, platform, remove, workerPost } = harness();

		const capture = rasterCaptureSource(source, captureOrigin, undefined, platform);

		expect(iframe.hidden).toBe(false);
		expect(iframe.style.left).toBe("-10000px");
		expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
		expect(iframe.src).toBe(`${captureOrigin}/capture`);
		expect(append).toHaveBeenCalledWith(iframe);

		iframe.dispatchEvent(new Event("load"));

		expect(workerPost).toHaveBeenCalledWith({ spool: "spool-capture-bootstrap-v1", id: source.id }, captureOrigin, [
			channel.port2,
		]);
		expect(channel.port1.postMessage).toHaveBeenCalledWith({
			spool: "spool-capture-raster-v1",
			id: source.id,
			svg: source.svg,
			width: source.width,
			height: source.height,
			dpr: source.dpr,
			maxEdge: source.maxEdge,
		});

		const rungs = [rung(780, 1688), rung(390, 844), rung(195, 422)];
		channel.port1.onmessage?.({
			data: { spool: "spool-capture-result-v1", id: source.id, rungs },
		} as MessageEvent);

		// the whole ladder off one snapshot, each rung carrying the size it came out
		await expect(capture).resolves.toEqual(rungs);
		expect(iframe.src).toBe("about:blank");
		expect(remove).toHaveBeenCalledOnce();
		expect(channel.port1.close).toHaveBeenCalledOnce();
		expect(channel.port2.close).toHaveBeenCalledOnce();
	});

	it("rejects a result with any field outside its exact shape", async () => {
		const { rasterCaptureSource } = await import("./capture-broker");
		const { channel, iframe, platform, remove } = harness();
		const capture = rasterCaptureSource(source, captureOrigin, undefined, platform);
		iframe.dispatchEvent(new Event("load"));

		channel.port1.onmessage?.({
			data: {
				spool: "spool-capture-result-v1",
				id: source.id,
				rungs: [{ ...rung(780, 1688), extra: true }],
			},
		} as MessageEvent);

		await expect(capture).rejects.toThrow("invalid capture worker reply");
		expect(remove).toHaveBeenCalledOnce();
		expect(channel.port1.close).toHaveBeenCalledOnce();
		expect(channel.port2.close).toHaveBeenCalledOnce();
	});

	it("aborts with immediate complete cleanup", async () => {
		const { rasterCaptureSource } = await import("./capture-broker");
		const controller = new AbortController();
		const { channel, iframe, platform, remove } = harness();
		const capture = rasterCaptureSource({ ...source, maxEdge: 0 }, captureOrigin, controller.signal, platform);
		iframe.dispatchEvent(new Event("load"));

		controller.abort();

		await expect(capture).rejects.toMatchObject({ name: "AbortError" });
		expect(remove).toHaveBeenCalledOnce();
		expect(channel.port1.onmessage).toBeNull();
		expect(channel.port1.close).toHaveBeenCalledOnce();
		expect(channel.port2.close).toHaveBeenCalledOnce();
	});
});
