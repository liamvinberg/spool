import { MAX_CAPTURE_OUTPUT_PIXELS } from "../../cover";
import {
	FORBIDDEN_ELEMENTS,
	MAX_SOURCE_BYTES,
	SAFE_IMAGE_SRC_PREFIX,
	URL_ATTRIBUTES,
	unsafeCaptureCss,
} from "./capture-safety";

/**
 * The capture worker: the one script of the isolated page that rasterizes a
 * frame's capture source off that frame's main thread
 * (`captureWorkerDocument`). It answers one bootstrap from the control origin,
 * then one raster request over the port it was handed, and closes.
 */

const BOOTSTRAP = "spool-capture-bootstrap-v1";
const RASTER = "spool-capture-raster-v1";
const RESULT = "spool-capture-result-v1";
const MAX_SVG_CHARS = 16 * 1024 * 1024;
const MAX_SOURCE_EDGE = 32 * 1024;
const MAX_SVG_NODES = 50002;
const MAX_OUTPUT_CHARS = Math.ceil((64 * 1024 * 1024) / 3) * 4 + 32;
const REQUEST_ID = /^[0-9a-f]{32}$/;
const expectedParentOrigin = document.querySelector<HTMLMetaElement>('meta[name="spool-control-origin"]')?.content;
const FORBIDDEN = new Set(FORBIDDEN_ELEMENTS);

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: object, expected: readonly string[]): boolean {
	const keys = Object.keys(value).sort();
	return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function safeRequestId(value: unknown): value is string {
	return typeof value === "string" && REQUEST_ID.test(value);
}

function validateSvg(svg: string, width: number, height: number): string {
	if (typeof svg !== "string" || svg.length === 0 || svg.length > MAX_SVG_CHARS) {
		throw new Error("invalid capture SVG");
	}
	const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
	if (parsed.querySelector("parsererror")) throw new Error("invalid capture SVG");
	const root = parsed.documentElement;
	if (
		root.localName.toLowerCase() !== "svg" ||
		root.getAttribute("width") !== String(width) ||
		root.getAttribute("height") !== String(height)
	) {
		throw new Error("invalid capture SVG");
	}
	const nodeWalker = parsed.createTreeWalker(parsed, NodeFilter.SHOW_ALL);
	let nodeCount = 0;
	while (nodeWalker.nextNode()) {
		nodeCount += 1;
		if (nodeCount > MAX_SVG_NODES) throw new Error("capture document too large");
	}
	const elements = parsed.querySelectorAll("*");
	for (const element of elements) {
		const tag = element.localName.toLowerCase();
		if (FORBIDDEN.has(tag)) throw new Error("unsafe capture SVG");
		if (tag === "style" && unsafeCaptureCss(element.textContent || "")) {
			throw new Error("unsafe capture SVG");
		}
		for (const attribute of element.attributes) {
			const name = attribute.name.toLowerCase();
			const value = attribute.value.trim();
			if (name.startsWith("on") || unsafeCaptureCss(value)) throw new Error("unsafe capture SVG");
			if (!URL_ATTRIBUTES.has(name) || value === "" || value.startsWith("#")) continue;
			// An svg reached through src is a passive image context: scripting and
			// external references are off by specification, so it joins the rasters.
			if (name === "src" && SAFE_IMAGE_SRC_PREFIX.test(value)) continue;
			throw new Error("unsafe capture SVG");
		}
	}
	return svg;
}

async function validateJob(
	value: unknown,
	requestId: string,
): Promise<{ svg: string; outputWidth: number; outputHeight: number }> {
	if (
		!record(value) ||
		!exactKeys(value, ["dpr", "height", "id", "spool", "svg", "width"]) ||
		value.spool !== RASTER ||
		value.id !== requestId
	) {
		throw new Error("invalid capture request");
	}
	const { width, height, dpr } = value;
	if (
		typeof width !== "number" ||
		!Number.isFinite(width) ||
		!Number.isSafeInteger(width) ||
		width <= 0 ||
		width > MAX_SOURCE_EDGE ||
		typeof height !== "number" ||
		!Number.isFinite(height) ||
		!Number.isSafeInteger(height) ||
		height <= 0 ||
		height > MAX_SOURCE_EDGE ||
		typeof dpr !== "number" ||
		!Number.isFinite(dpr) ||
		dpr <= 0 ||
		dpr > 2
	) {
		throw new Error("invalid capture dimensions");
	}
	if (
		!(value.svg instanceof Blob) ||
		value.svg.type !== "image/svg+xml" ||
		value.svg.size === 0 ||
		value.svg.size > MAX_SOURCE_BYTES
	) {
		throw new Error("invalid capture SVG");
	}
	let outputWidth = Math.max(1, Math.round(width * dpr));
	let outputHeight = Math.max(1, Math.round(height * dpr));
	// A long frame may fit at native size but exceed the budget at 2x.
	// Keep its whole layout and spend only the available raster pixels.
	if (width * height <= MAX_CAPTURE_OUTPUT_PIXELS && outputWidth * outputHeight > MAX_CAPTURE_OUTPUT_PIXELS) {
		const fittedScale = Math.sqrt(MAX_CAPTURE_OUTPUT_PIXELS / (width * height));
		outputWidth = Math.max(1, Math.floor(width * fittedScale));
		outputHeight = Math.max(1, Math.floor(height * fittedScale));
	}
	if (
		!Number.isSafeInteger(outputWidth) ||
		!Number.isSafeInteger(outputHeight) ||
		outputWidth * outputHeight > MAX_CAPTURE_OUTPUT_PIXELS
	) {
		throw new Error("capture output too large");
	}
	return {
		svg: validateSvg(await value.svg.text(), width, height),
		outputWidth,
		outputHeight,
	};
}

// The encode happens at once, through toDataURL(). Chromium runs toBlob(),
// and an OffscreenCanvas's convertToBlob() too, as an idle task whenever it
// is on a page's main thread, and forces it only after
// kIdleTaskStartTimeoutDelayMs, a whole second on the Mac
// (canvas_async_blob_creator.cc). This page rasters while frames run beside
// it and rarely sees an idle period, so an export's encode would often wait
// out the whole timeout before it began. Encoding at once does the same
// work without the wait, and its data URL is what the reply carries anyway.
function encode(canvas: HTMLCanvasElement, type: string): string {
	const url = canvas.toDataURL(type);
	if (!url.startsWith(`data:${type};base64,`)) throw new Error("canvas encoding failed");
	if (url.length > MAX_OUTPUT_CHARS) throw new Error("capture output too large");
	return url;
}

// One image off one parsed snapshot; the daemon stores the reported raster as-is.
async function raster(value: unknown, requestId: string): Promise<{ url: string; width: number; height: number }> {
	const canvas = document.querySelector("canvas");
	if (!canvas) throw new Error("capture canvas unavailable");
	const image = new Image();
	try {
		const job = await validateJob(value, requestId);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("capture canvas unavailable");
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(job.svg)}`;
		await image.decode();
		canvas.width = job.outputWidth;
		canvas.height = job.outputHeight;
		context.fillStyle = "#fff";
		context.fillRect(0, 0, job.outputWidth, job.outputHeight);
		context.drawImage(image, 0, 0, job.outputWidth, job.outputHeight);
		const url = encode(canvas, "image/png");
		return { url, width: job.outputWidth, height: job.outputHeight };
	} finally {
		image.src = "";
		canvas.width = 0;
		canvas.height = 0;
	}
}

let bootstrapped = false;
const onBootstrap = (event: MessageEvent): void => {
	if (bootstrapped || event.source !== parent || event.origin !== expectedParentOrigin) return;
	const value: unknown = event.data;
	if (
		!record(value) ||
		!exactKeys(value, ["id", "spool"]) ||
		value.spool !== BOOTSTRAP ||
		!safeRequestId(value.id) ||
		event.ports.length !== 1
	) {
		return;
	}
	bootstrapped = true;
	removeEventListener("message", onBootstrap);
	const requestId = value.id;
	const port = event.ports[0] as MessagePort;
	let requested = false;
	const requestTimeout = setTimeout(() => {
		port.onmessage = null;
		port.onmessageerror = null;
		port.close();
	}, 2400);
	port.onmessage = (message) => {
		if (requested) return;
		requested = true;
		clearTimeout(requestTimeout);
		port.onmessage = null;
		port.onmessageerror = null;
		void (async () => {
			let reply: object;
			try {
				const image = await raster(message.data, requestId);
				reply = { spool: RESULT, id: requestId, image };
			} catch (error) {
				const text = error instanceof Error ? error.message : String(error);
				reply = { spool: RESULT, id: requestId, error: text.slice(0, 240) };
			}
			try {
				port.postMessage(reply);
			} finally {
				port.close();
			}
		})();
	};
	port.onmessageerror = () => {
		if (requested) return;
		requested = true;
		clearTimeout(requestTimeout);
		port.onmessage = null;
		port.onmessageerror = null;
		try {
			port.postMessage({ spool: RESULT, id: requestId, error: "invalid capture request" });
		} finally {
			port.close();
		}
	};
	port.start();
};
addEventListener("message", onBootstrap);
