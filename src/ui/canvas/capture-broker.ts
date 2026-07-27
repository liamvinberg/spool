import { COVER_RUNGS } from "../../cover";
import type { CaptureSourceMessage } from "./protocol";

const BOOTSTRAP = "spool-capture-bootstrap-v1";
const RASTER = "spool-capture-raster-v1";
const RESULT = "spool-capture-result-v1";
/**
 * How long the isolated worker may hold one capture. The budget is per rung,
 * because a cover is a ladder (#111): the source is parsed and decoded once, but
 * each rung is its own encode, and the whole of it — iframe, bootstrap, rasters
 * — happens inside this window.
 */
const CAPTURE_RUNG_TIMEOUT_MS = 2400;
export const CAPTURE_WORKER_TIMEOUT_MS = CAPTURE_RUNG_TIMEOUT_MS * COVER_RUNGS;
const MAX_CAPTURE_DATA_URL_CHARS = Math.ceil((64 * 1024 * 1024) / 3) * 4 + 32;

/** One rung as the capture host actually rasterized it — the width both stores name it by. */
export interface CoverRaster {
	url: string;
	width: number;
	height: number;
}

type CaptureResult =
	| { spool: typeof RESULT; id: string; rungs: CoverRaster[] }
	| { spool: typeof RESULT; id: string; error: string };

export interface CaptureBrokerPlatform {
	createIframe: () => HTMLIFrameElement;
	createChannel: () => MessageChannel;
	append: (iframe: HTMLIFrameElement) => void;
	setTimeout: (callback: () => void, delay: number) => number;
	clearTimeout: (id: number) => void;
}

const browserPlatform: CaptureBrokerPlatform = {
	createIframe: () => document.createElement("iframe"),
	createChannel: () => new MessageChannel(),
	append: (iframe) => (document.body ?? document.documentElement).append(iframe),
	setTimeout: (callback, delay) => window.setTimeout(callback, delay),
	clearTimeout: (id) => window.clearTimeout(id),
};

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
	const keys = Object.keys(value).sort();
	return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function coverRaster(value: unknown, maxEdge: number): value is CoverRaster {
	return (
		record(value) &&
		exactKeys(value, ["height", "url", "width"]) &&
		typeof value.url === "string" &&
		value.url.length <= MAX_CAPTURE_DATA_URL_CHARS &&
		value.url.startsWith(maxEdge > 0 ? "data:image/jpeg;base64," : "data:image/png;base64,") &&
		bounded(value.width) &&
		bounded(value.height)
	);
}

// a cover rung stays under COVER_MAX_EDGE, but an export is the frame at full
// device resolution, so the bound here is the worker's own output edge
const MAX_RASTER_EDGE = 16 * 1024;

function bounded(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_RASTER_EDGE;
}

function captureResult(value: unknown, id: string, maxEdge: number): CaptureResult | undefined {
	if (!record(value) || value.spool !== RESULT || value.id !== id) return undefined;
	if (
		exactKeys(value, ["id", "rungs", "spool"]) &&
		Array.isArray(value.rungs) &&
		value.rungs.length >= 1 &&
		value.rungs.length <= (maxEdge > 0 ? COVER_RUNGS : 1) &&
		value.rungs.every((rung) => coverRaster(rung, maxEdge))
	) {
		return value as CaptureResult;
	}
	if (
		exactKeys(value, ["error", "id", "spool"]) &&
		typeof value.error === "string" &&
		value.error.length > 0 &&
		value.error.length <= 240
	) {
		return value as CaptureResult;
	}
	return undefined;
}

export function captureRequestId(): string {
	return Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, "0")).join("");
}

/**
 * Rasterize one already-validated frame source in the isolated capture host,
 * answering the whole ladder it produced off that one snapshot. The iframe and
 * both ports have one settlement path, so success, malformed replies, load
 * errors, and timeout all retire the same temporary resources.
 */
export function rasterCaptureSource(
	source: CaptureSourceMessage,
	configuredOrigin: string,
	signal?: AbortSignal,
	platform: CaptureBrokerPlatform = browserPlatform,
): Promise<CoverRaster[]> {
	return new Promise((resolve, reject) => {
		const captureOrigin = new URL(configuredOrigin).origin;
		const iframe = platform.createIframe();
		const channel = platform.createChannel();
		let timeoutId: number | undefined;
		let settled = false;
		let loaded = false;

		const cleanup = () => {
			if (timeoutId !== undefined) platform.clearTimeout(timeoutId);
			signal?.removeEventListener("abort", onAbort);
			iframe.removeEventListener("load", onLoad);
			iframe.removeEventListener("error", onError);
			channel.port1.onmessage = null;
			channel.port1.onmessageerror = null;
			try {
				channel.port1.close();
			} catch {}
			try {
				channel.port2.close();
			} catch {}
			try {
				iframe.src = "about:blank";
			} catch {}
			iframe.remove();
		};
		const finish = (result: { rungs: CoverRaster[] } | { error: Error }) => {
			if (settled) return;
			settled = true;
			cleanup();
			if ("rungs" in result) resolve(result.rungs);
			else reject(result.error);
		};
		const onError = () => finish({ error: new Error("capture worker failed to load") });
		const onAbort = () => finish({ error: new DOMException("Capture interrupted", "AbortError") });
		const onLoad = () => {
			if (loaded) return;
			loaded = true;
			const target = iframe.contentWindow;
			if (target === null) {
				finish({ error: new Error("capture worker unavailable") });
				return;
			}
			channel.port1.onmessage = (event) => {
				const result = captureResult(event.data, source.id, source.maxEdge);
				if (result === undefined) {
					finish({ error: new Error("invalid capture worker reply") });
					return;
				}
				if ("rungs" in result) finish({ rungs: result.rungs });
				else finish({ error: new Error(result.error) });
			};
			channel.port1.onmessageerror = () => finish({ error: new Error("invalid capture worker reply") });
			channel.port1.start();
			try {
				target.postMessage({ spool: BOOTSTRAP, id: source.id }, captureOrigin, [channel.port2]);
				channel.port1.postMessage({
					spool: RASTER,
					id: source.id,
					svg: source.svg,
					width: source.width,
					height: source.height,
					dpr: source.dpr,
					maxEdge: source.maxEdge,
				});
			} catch (error) {
				finish({ error: error instanceof Error ? error : new Error("capture worker unavailable") });
			}
		};

		try {
			iframe.tabIndex = -1;
			iframe.setAttribute("aria-hidden", "true");
			iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
			Object.assign(iframe.style, {
				position: "fixed",
				left: "-10000px",
				top: "0",
				width: "1px",
				height: "1px",
				border: "0",
				pointerEvents: "none",
			});
			iframe.src = `${captureOrigin}/capture`;
			iframe.addEventListener("load", onLoad);
			iframe.addEventListener("error", onError);
			if (signal?.aborted === true) {
				onAbort();
				return;
			}
			signal?.addEventListener("abort", onAbort, { once: true });
			timeoutId = platform.setTimeout(
				() => finish({ error: new Error("capture worker timed out") }),
				CAPTURE_WORKER_TIMEOUT_MS,
			);
			platform.append(iframe);
		} catch (error) {
			finish({ error: error instanceof Error ? error : new Error("capture worker unavailable") });
		}
	});
}
