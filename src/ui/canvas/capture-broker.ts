import { captureRasterSize } from "../../cover";
import type { CaptureSourceMessage } from "./protocol";

const BOOTSTRAP = "spool-capture-bootstrap-v1";
const RASTER = "spool-capture-raster-v1";
const RESULT = "spool-capture-result-v1";
/**
 * How long the isolated worker may hold one raster.
 */
export const CAPTURE_WORKER_TIMEOUT_MS = 2400;
const MAX_CAPTURE_DATA_URL_CHARS = Math.ceil((64 * 1024 * 1024) / 3) * 4 + 32;

/** The one image as the capture host actually rasterized it. */
export interface CoverRaster {
	url: string;
	width: number;
	height: number;
}

type CaptureResult =
	| { spool: typeof RESULT; id: string; image: CoverRaster }
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

function coverRaster(value: unknown, targetWidth: number): value is CoverRaster {
	return (
		record(value) &&
		exactKeys(value, ["height", "url", "width"]) &&
		typeof value.url === "string" &&
		value.url.length <= MAX_CAPTURE_DATA_URL_CHARS &&
		value.url.startsWith(targetWidth > 0 ? "data:image/jpeg;base64," : "data:image/png;base64,") &&
		typeof value.width === "number" &&
		typeof value.height === "number" &&
		captureRasterSize(value.width, value.height, 1) !== undefined
	);
}

function captureResult(value: unknown, id: string, targetWidth: number): CaptureResult | undefined {
	if (!record(value) || value.spool !== RESULT || value.id !== id) return undefined;
	if (exactKeys(value, ["id", "image", "spool"]) && coverRaster(value.image, targetWidth)) {
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
 * answering the one image it produced. The iframe and
 * both ports have one settlement path, so success, malformed replies, load
 * errors, and timeout all retire the same temporary resources.
 */
export function rasterCaptureSource(
	source: CaptureSourceMessage,
	configuredOrigin: string,
	signal?: AbortSignal,
	platform: CaptureBrokerPlatform = browserPlatform,
): Promise<CoverRaster> {
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
		const finish = (result: { image: CoverRaster } | { error: Error }) => {
			if (settled) return;
			settled = true;
			cleanup();
			if ("image" in result) resolve(result.image);
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
				const result = captureResult(event.data, source.id, source.targetWidth);
				if (result === undefined) {
					finish({ error: new Error("invalid capture worker reply") });
					return;
				}
				if ("image" in result) finish({ image: result.image });
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
					targetWidth: source.targetWidth,
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
