import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { type Browser, chromium, type Frame, type Page } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { MAX_CAPTURE_OUTPUT_PIXELS, SETTLE_BUDGET_MS } from "../cover";
import { assembleFrameDocument, captureWorkerCsp, captureWorkerDocument } from "./document";
import { CAPTURE_HOST, RENDER_HOST } from "./security";

/** A solid #ffcc00 pixel and a solid #7f00ff square — probes for both allowlists. */
const AMBER_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4f4bhPwAHZALLB0SopwAAAABJRU5ErkJggg==";
const VIOLET_SVG =
	"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiM3ZjAwZmYiLz48L3N2Zz4=";

/**
 * Both probes as a frame's imported images, at their asset URLs. The svg is an
 * original bigger than a whole still may be (#216): only what is shown of it,
 * at the size it is shown, can reach one.
 */
const VIOLET_SVG_URL = `/asset/${"a".repeat(64)}.svg`;
const AMBER_PNG_URL = `/asset/${"b".repeat(64)}.png`;
const ASSETS: Record<string, { type: string; bytes: Buffer }> = {
	[VIOLET_SVG_URL]: {
		type: "image/svg+xml",
		bytes: Buffer.from(
			Buffer.from(VIOLET_SVG, "base64")
				.toString("utf8")
				.replace("</svg>", `<!-- ${"x".repeat(17 * 1024 * 1024)} --></svg>`),
		),
	},
	[AMBER_PNG_URL]: { type: "image/png", bytes: Buffer.from(AMBER_PNG, "base64") },
};

interface ServedCapture {
	controlOrigin: string;
	url: string;
	externalRequests(): string[];
	close(): Promise<void>;
}

async function serveCapture(fonts?: string): Promise<ServedCapture> {
	let frameDocument = "";
	let controlDocument = "";
	const externalRequests: string[] = [];
	const captureFont = readFileSync(
		join(process.cwd(), "node_modules/@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2"),
	).toString("base64");
	const server = createServer((request, response) => {
		const authority = request.headers.host;
		if (authority === undefined) {
			response.writeHead(400).end("missing host");
			return;
		}
		const url = new URL(request.url ?? "/", `http://${authority}`);
		if (url.pathname.startsWith("/capture-external-")) {
			externalRequests.push(url.href);
			response.writeHead(204).end();
			return;
		}
		if (url.hostname === "127.0.0.1" && url.pathname === "/") {
			response.setHeader("content-type", "text/html; charset=utf-8");
			response.setHeader("cache-control", "no-store");
			response.end(controlDocument);
			return;
		}
		// the render host's asset route (#216), as a frame's imported images reach it
		const asset = url.hostname === RENDER_HOST ? ASSETS[url.pathname] : undefined;
		if (asset !== undefined) {
			response.setHeader("content-type", asset.type);
			response.setHeader("access-control-allow-origin", "*");
			response.end(asset.bytes);
			return;
		}
		if (url.hostname === RENDER_HOST && url.pathname === "/frame") {
			response.setHeader("content-type", "text/html; charset=utf-8");
			response.setHeader("content-security-policy", "sandbox allow-scripts");
			response.end(frameDocument);
			return;
		}
		if (url.hostname === CAPTURE_HOST && url.pathname === "/capture") {
			response.setHeader("content-type", "text/html; charset=utf-8");
			response.setHeader("cache-control", "no-store");
			response.setHeader("content-security-policy", captureWorkerCsp(controlOrigin));
			response.end(captureWorkerDocument(controlOrigin));
			return;
		}
		response.writeHead(404).end("not found");
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("capture test server did not bind");
	const controlOrigin = `http://127.0.0.1:${address.port}`;
	const renderOrigin = `http://${RENDER_HOST}:${address.port}`;
	frameDocument = assembleFrameDocument({
		project: "capture-test",
		frame: "capture",
		projectCapability: "capture-test",
		controlOrigin,
		css: `@font-face { font-family: "Capture Test"; src: url(data:font/woff2;base64,${captureFont}); }
			main {
				font-family: "Capture Test";
			}
			.capture-style-probe {
				position: absolute;
				inset: 25%;
				background-color: #f5391a;
				background-image: url(/hero.png);
			}
			/* A project asset, loaded by URL (#216): the shim inlines the svg of an
			   <img src> and the raster of a CSS url() for the src and CSS copies of the allowlist. */
			.capture-asset-probe {
				position: absolute;
				left: 100px;
				top: 20px;
				width: 80px;
				height: 80px;
			}
			.capture-asset-css-probe {
				position: absolute;
				left: 300px;
				top: 20px;
				width: 80px;
				height: 80px;
				background-image: url(${AMBER_PNG_URL});
			}`,
		// The import is discarded, but the important green must survive it.
		fonts:
			fonts ??
			`@import "/theme.css";
			main { background-color: #18a957 !important; }`,
		// A URL import is removed while its ordinary blue rule survives.
		bundledCss: `@import url("/theme.css");
			main { background-color: #2474ff; }`,
		importMap: { imports: {} },
		bootJs: `
			const heavyText = "x".repeat(65_535) + "😀" + "x".repeat(1_034_463);
			document.getElementById("root").innerHTML = '<main style="position: relative; width: 100%; height: 100%">capture<input value="live"><span class="capture-style-probe"></span><img class="capture-asset-probe" alt="" crossorigin="anonymous" src="${VIOLET_SVG_URL}"><span class="capture-asset-css-probe"></span><canvas width="20" height="10" style="position: absolute; left: 10px; top: 10px; width: 20px; height: 10px"></canvas><canvas width="20" height="10" style="position: absolute; left: 40px; top: 10px; width: 20px; height: 10px"></canvas><span hidden>' + heavyText + '</span></main>';
			// drawn again when restored, as a frame must: a busy Mac's Chrome loses canvas contexts, blank until then
			document.querySelectorAll("canvas").forEach((canvas, index) => {
				const paint = () => {
					const context = canvas.getContext("2d");
					context.fillStyle = index === 0 ? "#fff" : "#000";
					context.fillRect(0, 0, canvas.width, canvas.height);
				};
				paint();
				canvas.addEventListener("contextrestored", paint);
			});
			window.__captureIframeMutations = 0;
			new MutationObserver((records) => {
				for (const record of records) {
					for (const node of record.addedNodes) {
						if (node.nodeType === 1 && node.tagName === "IFRAME") window.__captureIframeMutations += 1;
					}
				}
			}).observe(document.documentElement, { childList: true, subtree: true });
		`,
	});
	controlDocument = `<!doctype html><html><body>
<iframe id="frame" width="800" height="600" sandbox="allow-scripts" src="${renderOrigin}/frame"></iframe>
</body></html>`;
	return {
		controlOrigin,
		url: `${controlOrigin}/`,
		externalRequests: () => [...externalRequests],
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections();
			}),
	};
}

/**
 * A frame with a single WebGL canvas, cleared to solid red once and never redrawn — the #174 repro shape. Out of the
 * viewport, it clears on its first animation frame instead, as a shader does, which Chrome never runs there (#275).
 */
async function serveWebglCapture(
	positioning: "inline" | "class" | "offscreen",
	authored?: { css: string; bootJs: string; iframeStyle: string },
): Promise<{ controlOrigin: string; url: string; close(): Promise<void> }> {
	let frameDocument = "";
	let controlDocument = "";
	const server = createServer((request, response) => {
		const authority = request.headers.host;
		if (authority === undefined) {
			response.writeHead(400).end("missing host");
			return;
		}
		const url = new URL(request.url ?? "/", `http://${authority}`);
		if (url.hostname === "127.0.0.1" && url.pathname === "/") {
			response.setHeader("content-type", "text/html; charset=utf-8");
			response.setHeader("cache-control", "no-store");
			response.end(controlDocument);
			return;
		}
		// the render host's asset route (#216), as a frame's imported images reach it
		const asset = url.hostname === RENDER_HOST ? ASSETS[url.pathname] : undefined;
		if (asset !== undefined) {
			response.setHeader("content-type", asset.type);
			response.setHeader("access-control-allow-origin", "*");
			response.end(asset.bytes);
			return;
		}
		if (url.hostname === RENDER_HOST && url.pathname === "/frame") {
			response.setHeader("content-type", "text/html; charset=utf-8");
			response.setHeader("content-security-policy", "sandbox allow-scripts");
			response.end(frameDocument);
			return;
		}
		if (url.hostname === CAPTURE_HOST && url.pathname === "/capture") {
			response.setHeader("content-type", "text/html; charset=utf-8");
			response.setHeader("cache-control", "no-store");
			response.setHeader("content-security-policy", captureWorkerCsp(controlOrigin));
			response.end(captureWorkerDocument(controlOrigin));
			return;
		}
		response.writeHead(404).end("not found");
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("capture test server did not bind");
	const controlOrigin = `http://127.0.0.1:${address.port}`;
	const renderOrigin = `http://${RENDER_HOST}:${address.port}`;
	const canvasStyle = "position: absolute; left: 25%; top: 25%; width: 50%; height: 50%";
	const canvasAttribute = positioning === "class" ? 'class="shader"' : `style="${canvasStyle}"`;
	const clear = "gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);";
	frameDocument = assembleFrameDocument({
		project: "capture-test-webgl",
		frame: "capture",
		projectCapability: "capture-test-webgl",
		controlOrigin,
		css: authored?.css ?? `.shader, #shader { ${canvasStyle} }`,
		importMap: { imports: {} },
		// No preserveDrawingBuffer here — the shim is what's expected to add it
		// (#174). Left to the spec, the drawing buffer clears once the browser is
		// done compositing it, so an unpatched self-capture reads this back black.
		bootJs:
			authored?.bootJs ??
			`
			document.getElementById("root").innerHTML = '<canvas width="800" height="600" ${canvasAttribute}></canvas>';
			const gl = document.querySelector("canvas").getContext("webgl");
			${positioning === "offscreen" ? `requestAnimationFrame(() => { ${clear} });` : clear}
		`,
	});
	const away =
		authored !== undefined
			? ` style="${authored.iframeStyle}"`
			: positioning === "offscreen"
				? ' style="position: absolute; left: -5000px"'
				: "";
	controlDocument = `<!doctype html><html><body>
<iframe id="frame" width="800" height="600"${away} sandbox="allow-scripts" src="${renderOrigin}/frame"></iframe>
</body></html>`;
	return {
		controlOrigin,
		url: `${controlOrigin}/`,
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections();
			}),
	};
}

async function readImage(url: string, page: Page) {
	return page.evaluate(async (url) => {
		const response = await fetch(url);
		const bytes = new Uint8Array(await response.arrayBuffer());
		const image = new Image();
		image.src = url;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext("2d");
		if (context === null) throw new Error("image canvas unavailable");
		context.drawImage(image, 0, 0);
		// Probes are read as fractions of the sheet so every rung samples the same
		// spot on the frame, whatever resolution it came out at. The frame is
		// 800×600, so the two 80px squares at (100,20) and (300,20) have their
		// centres at (140,60) and (340,60) — 0.175/0.425 across and 0.1 down.
		const at = (fx: number, fy: number) =>
			Array.from(
				context.getImageData(Math.floor(image.naturalWidth * fx), Math.floor(image.naturalHeight * fy), 1, 1).data,
			);
		return {
			type: response.headers.get("content-type"),
			width: image.naturalWidth,
			height: image.naturalHeight,
			magic: Array.from(bytes.slice(0, 8)),
			center: at(0.5, 0.5),
			bottomRight: Array.from(context.getImageData(image.naturalWidth - 20, image.naturalHeight - 20, 1, 1).data),
			assetSrc: at(0.175, 0.1),
			assetCss: at(0.425, 0.1),
		};
	}, url);
}

/**
 * The authored frame's long tasks while it runs, judged by the thread time the
 * trace records for each rather than by the wall clock. The Long Tasks API
 * picks out the authored frame's own tasks, but it times them by the wall, and
 * on a loaded machine the scheduler parks a renderer mid-task for longer than
 * any budget, so a task of a few milliseconds reads as 80 there. A mark puts
 * the frame's clock on the trace's, and each long task's window is then priced
 * at what its run and the microtask checkpoint after it cost the thread.
 */
async function startTargetPerformance(browser: Browser, frame: Frame): Promise<void> {
	await browser.startTracing(undefined, { categories: ["toplevel", "blink.user_timing", "__metadata"] });
	await frame.evaluate(() => {
		const longTasks: { start: number; duration: number }[] = [];
		const supported = PerformanceObserver.supportedEntryTypes.includes("longtask");
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration });
		});
		if (supported) observer.observe({ type: "longtask" });
		const clock = performance.mark("spool-capture-clock").startTime;
		Object.defineProperty(window, "__capturePerformance", {
			configurable: true,
			value: {
				async stop() {
					await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
					for (const entry of observer.takeRecords()) {
						longTasks.push({ start: entry.startTime, duration: entry.duration });
					}
					observer.disconnect();
					return { supported, clock, longTasks };
				},
			},
		});
	});
}

interface TraceEvent {
	name: string;
	cat: string;
	ph: string;
	pid: number;
	tid: number;
	ts: number;
	dur?: number;
	tdur?: number;
}

async function stopTargetPerformance(browser: Browser, frame: Frame) {
	const { supported, clock, longTasks } = await frame.evaluate(() =>
		(
			window as unknown as {
				__capturePerformance: {
					stop(): Promise<{
						supported: boolean;
						clock: number;
						longTasks: { start: number; duration: number }[];
					}>;
				};
			}
		).__capturePerformance.stop(),
	);
	const { traceEvents } = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: TraceEvent[] };
	const mark = traceEvents.find((event) => event.name === "spool-capture-clock");
	if (mark === undefined) throw new Error("the authored frame's clock mark is missing from the trace");
	// Trace time in microseconds, frame time in milliseconds.
	const offset = mark.ts / 1000 - clock;
	const slices: TraceEvent[] = [];
	let enclosingEnd = 0;
	for (const event of traceEvents
		.filter(
			(event) =>
				event.ph === "X" &&
				event.pid === mark.pid &&
				event.tid === mark.tid &&
				event.cat.split(",").includes("toplevel"),
		)
		.sort((left, right) => left.ts - right.ts)) {
		// A nested slice is already inside its parent's time.
		if (event.ts < enclosingEnd) continue;
		enclosingEnd = event.ts + (event.dur ?? 0);
		slices.push(event);
	}
	const longTaskThreadTimes = longTasks.map(({ start, duration }) => {
		// The API rounds its times to the millisecond.
		const from = (start + offset - 1) * 1000;
		const to = (start + duration + offset + 1) * 1000;
		const within = slices.filter((slice) => slice.ts >= from && slice.ts < to);
		if (within.length === 0) throw new Error("a long task has no slice on the authored frame's thread");
		// A slice too brief for the thread clock carries no thread time; its wall
		// time is just as brief.
		return within.reduce((sum, slice) => sum + (slice.tdur ?? slice.dur ?? 0), 0) / 1000;
	});
	return { supported, longTaskThreadTimes, longTaskWallTimes: longTasks.map(({ duration }) => duration) };
}

async function requestCapture(page: Page, captureOrigin: string, settleMs = 0) {
	return page.evaluate(
		async ({ captureOrigin, settleMs }) => {
			const frame = document.querySelector<HTMLIFrameElement>("#frame");
			const sourceWindow = frame?.contentWindow;
			if (sourceWindow === null || sourceWindow === undefined) throw new Error("frame unavailable");
			const id = Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) =>
				part.toString(16).padStart(8, "0"),
			).join("");
			const worker = document.createElement("iframe");
			const channel = new MessageChannel();
			let resultReplies = 0;
			let timeoutId: number | undefined;
			let sourceListener: ((event: MessageEvent) => void) | undefined;
			const cleanup = () => {
				if (timeoutId !== undefined) window.clearTimeout(timeoutId);
				if (sourceListener !== undefined) window.removeEventListener("message", sourceListener);
				channel.port1.onmessage = null;
				channel.port1.onmessageerror = null;
				channel.port1.close();
				channel.port2.close();
				worker.src = "about:blank";
				worker.remove();
			};
			try {
				const source = await new Promise<{
					svg: Blob;
					width: number;
					height: number;
					dpr: number;
				}>((resolve, reject) => {
					timeoutId = window.setTimeout(() => reject(new Error("source timed out")), 2400);
					sourceListener = (event) => {
						const value = event.data as {
							spool?: unknown;
							frame?: unknown;
							id?: unknown;
							svg?: unknown;
							width?: unknown;
							height?: unknown;
							dpr?: unknown;
							error?: unknown;
						};
						if (
							event.source !== sourceWindow ||
							event.origin !== "null" ||
							value.spool !== "capture-source" ||
							value.frame !== "capture" ||
							value.id !== id
						) {
							return;
						}
						if (typeof value.error === "string") {
							reject(new Error(value.error));
							return;
						}
						if (
							!(value.svg instanceof Blob) ||
							value.svg.type !== "image/svg+xml" ||
							value.svg.size === 0 ||
							value.svg.size > 16 * 1024 * 1024 ||
							typeof value.width !== "number" ||
							typeof value.height !== "number" ||
							typeof value.dpr !== "number"
						) {
							reject(new Error("invalid capture source"));
							return;
						}
						resolve({
							svg: value.svg,
							width: value.width,
							height: value.height,
							dpr: value.dpr,
						});
					};
					window.addEventListener("message", sourceListener);
					sourceWindow.postMessage({ spool: "capture", id, settleMs }, "*");
				});
				if (timeoutId !== undefined) window.clearTimeout(timeoutId);
				if (sourceListener !== undefined) window.removeEventListener("message", sourceListener);
				const image = await new Promise<{ url: string; width: number; height: number }>((resolve, reject) => {
					timeoutId = window.setTimeout(() => reject(new Error("worker timed out")), 2400);
					worker.hidden = true;
					worker.setAttribute("sandbox", "allow-scripts allow-same-origin");
					worker.src = `${captureOrigin}/capture`;
					worker.onerror = () => reject(new Error("worker failed to load"));
					worker.onload = () => {
						channel.port1.onmessage = (event) => {
							const value = event.data as {
								spool?: unknown;
								id?: unknown;
								image?: unknown;
								error?: unknown;
							};
							if (value.spool !== "spool-capture-result-v1" || value.id !== id) return;
							resultReplies += 1;
							if (typeof value.image === "object" && value.image !== null)
								resolve(value.image as { url: string; width: number; height: number });
							else reject(new Error(String(value.error)));
						};
						channel.port1.onmessageerror = () => reject(new Error("invalid worker reply"));
						channel.port1.start();
						worker.contentWindow?.postMessage({ spool: "spool-capture-bootstrap-v1", id }, captureOrigin, [
							channel.port2,
						]);
						channel.port1.postMessage({
							spool: "spool-capture-raster-v1",
							id,
							...source,
						});
					};
					document.body.append(worker);
				});
				return { image, resultReplies };
			} finally {
				cleanup();
			}
		},
		{ captureOrigin, settleMs },
	);
}

it("exports a long frame within the raster budget instead of rejecting its 2x size", { timeout: 30_000 }, async () => {
	const served = await serveCapture();
	onTestFinished(() => served.close());
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage({ deviceScaleFactor: 2 });
	await page.goto(served.url);
	await page.locator("#frame").evaluate((element) => {
		element.setAttribute("width", "1440");
		element.setAttribute("height", "7900");
	});
	const origin = new URL(served.controlOrigin);
	origin.hostname = CAPTURE_HOST;
	const exported = await requestCapture(page, origin.origin);
	expect(exported.image.width).toBeGreaterThan(1440);
	expect(exported.image.height).toBeGreaterThan(7900);
	expect(exported.image.width * exported.image.height).toBeLessThanOrEqual(MAX_CAPTURE_OUTPUT_PIXELS);
	const image = await readImage(exported.image.url, page);
	expect(image.type).toBe("image/png");
	expect(image.center).toEqual([245, 57, 26, 255]);
});

it.each(["css", "pseudo", "canvas"])("exports the visible state of a %s animation", async (kind) => {
	const served = await serveCapture(`
		main { background: #18a957; }
		${kind === "css" ? "main { animation: enter 100ms both; }" : ""}
		${kind === "pseudo" ? "main::after { content: ''; position: absolute; inset: 0; z-index: 2; background: #f5391a; animation: enter 100ms both; } .capture-style-probe { display: none; }" : ""}
		${kind === "canvas" ? "canvas { animation: enter 100ms both; }" : ""}
		@keyframes enter { from { opacity: 0; transform: translateY(50px); } to { opacity: 1; transform: translateY(0); } }
	`);
	onTestFinished(() => served.close());
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage();
	await page.goto(served.url);
	const authored = page.frames().find((frame) => new URL(frame.url()).hostname === RENDER_HOST);
	if (authored === undefined) throw new Error("frame missing");
	await authored.locator("main").waitFor();
	await authored.evaluate(async () => {
		await Promise.all(document.getAnimations().map((animation) => animation.finished));
	});
	// a capture of a canvas whose context is lost is as blank as the canvas: wait out a loss
	await authored.waitForFunction(() =>
		Array.from(document.querySelectorAll("canvas")).every(
			(canvas) => canvas.getContext("2d")?.isContextLost() === false,
		),
	);
	const origin = new URL(served.controlOrigin);
	origin.hostname = CAPTURE_HOST;
	const exported = await requestCapture(page, origin.origin);
	expect((await readImage(exported.image.url, page)).center).toEqual([245, 57, 26, 255]);
	if (kind === "canvas") {
		const pixel = await page.evaluate(async (url) => {
			const image = new Image();
			image.src = url;
			await image.decode();
			const canvas = document.createElement("canvas");
			canvas.width = 800;
			canvas.height = 600;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("context missing");
			context.drawImage(image, 0, 0, 800, 600);
			return Array.from(context.getImageData(55, 23, 1, 1).data);
		}, exported.image.url);
		expect(pixel).toEqual([0, 0, 0, 255]);
	}
});

async function directWorkerRequest(
	page: Page,
	captureOrigin: string,
	svg: string,
	dimensions: { width: number; height: number; dpr: number } = {
		width: 20,
		height: 10,
		dpr: 2,
	},
) {
	return page.evaluate(
		async ({ captureOrigin, svg, dimensions }) => {
			const id = "0123456789abcdef0123456789abcdef";
			const iframe = document.createElement("iframe");
			iframe.id = "direct-worker";
			iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
			iframe.src = `${captureOrigin}/capture`;
			await new Promise<void>((resolve, reject) => {
				iframe.onload = () => resolve();
				iframe.onerror = () => reject(new Error("worker failed to load"));
				document.body.append(iframe);
			});
			const channel = new MessageChannel();
			let replies = 0;
			const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
				const timeout = window.setTimeout(() => reject(new Error("worker timed out")), 2400);
				channel.port1.onmessage = (event) => {
					replies += 1;
					window.clearTimeout(timeout);
					resolve(event.data as Record<string, unknown>);
				};
				channel.port1.start();
				iframe.contentWindow?.postMessage({ spool: "spool-capture-bootstrap-v1", id }, captureOrigin, [
					channel.port2,
				]);
				channel.port1.postMessage({
					spool: "spool-capture-raster-v1",
					id,
					svg: new Blob([svg], { type: "image/svg+xml" }),
					...dimensions,
				});
			});
			channel.port1.close();
			channel.port2.close();
			return { reply, replies };
		},
		{ captureOrigin, svg, dimensions },
	);
}

it.each(['url("/theme.css")'])("preserves layout beside @import %s in a still", async (importValue) => {
	const served = await serveCapture(`@import ${importValue};
		main { background-color: #281c15 !important; }
		.capture-style-probe { display: none; }`);
	onTestFinished(() => served.close());
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage();
	await page.goto(served.url);
	const authored = page.frames().find((frame) => new URL(frame.url()).hostname === RENDER_HOST);
	if (authored === undefined) throw new Error("authored frame did not load");
	await authored.locator("main").waitFor();
	expect(await authored.locator("main").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
		"rgb(40, 28, 21)",
	);
	const captureOrigin = new URL(served.controlOrigin);
	captureOrigin.hostname = CAPTURE_HOST;
	const exported = await requestCapture(page, captureOrigin.origin);
	const pixels = await readImage(exported.image.url, page);
	for (const [channel, expected] of [40, 28, 21].entries()) {
		expect(Math.abs((pixels.center[channel] ?? 0) - expected)).toBeLessThanOrEqual(2);
	}
});

it("captures through the isolated worker while preserving output and cleanup", {
	timeout: 30_000,
}, async () => {
	const served = await serveCapture();
	onTestFinished(() => served.close());
	const captureOrigin = new URL(served.controlOrigin);
	captureOrigin.hostname = CAPTURE_HOST;

	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });
	onTestFinished(() => context.close());
	await context.addInitScript(() => {
		let toBlobCalls = 0;
		let callsAtFirstCallback: number | null = null;
		const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
		HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
			toBlobCalls += 1;
			Reflect.apply(nativeToBlob, this, [
				(blob: Blob | null) => {
					callsAtFirstCallback ??= toBlobCalls;
					callback(blob);
				},
				type,
				quality,
			]);
		};
		Object.defineProperty(window, "__captureCanvasStats", {
			value: { read: () => ({ toBlobCalls, callsAtFirstCallback }) },
		});
	});
	const page = await context.newPage();
	await page.goto(served.url);
	const authored = page.frames().find((frame) => new URL(frame.url()).hostname === RENDER_HOST);
	if (authored === undefined) throw new Error("authored frame did not load");
	await authored.locator("main").waitFor();
	await authored.evaluate(() => document.fonts.ready);

	// One reply, one image: an export is one full-resolution lossless sheet, 2× for the 800×600 source.
	const first = await requestCapture(page, captureOrigin.origin);
	expect(first.resultReplies).toBe(1);
	// The two project-asset routes (#101, #216): an svg through <img src>, a raster
	// through a CSS background. Both must be in the picture, not stripped out.
	expect(await readImage(first.image.url, page)).toEqual({
		type: "image/png",
		width: 1600,
		height: 1200,
		magic: [137, 80, 78, 71, 13, 10, 26, 10],
		center: [245, 57, 26, 255],
		bottomRight: [24, 169, 87, 255],
		assetSrc: [127, 0, 255, 255],
		assetCss: [255, 204, 0, 255],
	});
	expect(await page.locator(`iframe[src^="${captureOrigin.origin}"]`).count()).toBe(0);
	expect(
		await authored.evaluate(() =>
			(
				window as unknown as {
					__captureCanvasStats: { read(): { toBlobCalls: number; callsAtFirstCallback: number | null } };
				}
			).__captureCanvasStats.read(),
		),
		// both canvases and the shown svg, all drawn before any one is encoded
	).toEqual({ toBlobCalls: 3, callsAtFirstCallback: 3 });
	expect(
		await authored.evaluate(
			() => (window as unknown as { __captureIframeMutations: number }).__captureIframeMutations,
		),
	).toBe(0);

	await startTargetPerformance(browser, authored);
	const exported = await requestCapture(page, captureOrigin.origin);
	expect(exported.resultReplies).toBe(1);
	// An export is one full-resolution lossless sheet.
	expect(await readImage(exported.image.url, page)).toEqual({
		type: "image/png",
		width: 1600,
		height: 1200,
		magic: [137, 80, 78, 71, 13, 10, 26, 10],
		center: [245, 57, 26, 255],
		bottomRight: [24, 169, 87, 255],
		assetSrc: [127, 0, 255, 255],
		assetCss: [255, 204, 0, 255],
	});
	// The isolation claim is that the authored frame's thread never stalls while
	// the worker captures: no long task, exactly, where long is 50ms of the
	// thread's own work. A saturated runner stretches idle tasks and frame gaps
	// past that on the wall clock, and that is the scheduler, not the capture.
	const performance = await stopTargetPerformance(browser, authored);
	expect(performance.supported).toBe(true);
	expect(performance.longTaskThreadTimes.filter((milliseconds) => milliseconds > 50)).toEqual([]);
	// Thread time misses a thread blocked waiting, as on a synchronous readback:
	// a loose wall-clock bound still catches that, far above what load stretches.
	expect(performance.longTaskWallTimes.filter((milliseconds) => milliseconds > 1000)).toEqual([]);
	expect(await page.locator(`iframe[src^="${captureOrigin.origin}"]`).count()).toBe(0);

	const unsafe = await directWorkerRequest(
		page,
		captureOrigin.origin,
		`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><image href="${served.controlOrigin}/capture-external-image"/></svg>`,
	);
	expect(unsafe.replies).toBe(1);
	expect(unsafe.reply).toMatchObject({
		spool: "spool-capture-result-v1",
		id: "0123456789abcdef0123456789abcdef",
		error: "unsafe capture SVG",
	});
	const directWorker = page.frames().find((frame) => frame.url() === `${captureOrigin.origin}/capture`);
	if (directWorker === undefined) throw new Error("direct worker disappeared before cleanup inspection");
	expect(
		await directWorker.locator("canvas").evaluate((element) => {
			const canvas = element as HTMLCanvasElement;
			return [canvas.width, canvas.height];
		}),
	).toEqual([0, 0]);
	await page.locator("#direct-worker").evaluate((iframe: HTMLIFrameElement) => {
		iframe.src = "about:blank";
		iframe.remove();
	});
	expect(await page.locator("#direct-worker").count()).toBe(0);

	const unsafeCss = await directWorkerRequest(
		page,
		captureOrigin.origin,
		`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" filter="u\\72l(${served.controlOrigin}/capture-external-filter#x)"/></svg>`,
	);
	expect(unsafeCss.replies).toBe(1);
	expect(unsafeCss.reply).toMatchObject({
		spool: "spool-capture-result-v1",
		id: "0123456789abcdef0123456789abcdef",
		error: "unsafe capture SVG",
	});
	const unsafeCssWorker = page.frames().find((frame) => frame.url() === `${captureOrigin.origin}/capture`);
	if (unsafeCssWorker === undefined) throw new Error("unsafe CSS worker disappeared before cleanup inspection");
	expect(
		await unsafeCssWorker.locator("canvas").evaluate((element) => {
			const canvas = element as HTMLCanvasElement;
			return [canvas.width, canvas.height];
		}),
	).toEqual([0, 0]);
	await page.locator("#direct-worker").evaluate((iframe: HTMLIFrameElement) => {
		iframe.src = "about:blank";
		iframe.remove();
	});
	expect(served.externalRequests()).toEqual([]);

	const retried = await directWorkerRequest(
		page,
		captureOrigin.origin,
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#f5391a"/></svg>',
	);
	expect(retried.replies).toBe(1);
	expect(retried.reply).toMatchObject({
		spool: "spool-capture-result-v1",
		id: "0123456789abcdef0123456789abcdef",
	});
	expect((retried.reply.image as { url: string } | undefined)?.url).toMatch(/^data:image\/png;base64,/);
	const retriedWorker = page.frames().find((frame) => frame.url() === `${captureOrigin.origin}/capture`);
	if (retriedWorker === undefined) throw new Error("retried worker disappeared before cleanup inspection");
	expect(
		await retriedWorker.locator("canvas").evaluate((element) => {
			const canvas = element as HTMLCanvasElement;
			return [canvas.width, canvas.height];
		}),
	).toEqual([0, 0]);
	// The worker encodes at once: Chromium holds a toBlob() on a page's main
	// thread for an idle period, up to a second, and this page rarely gets one.
	expect(
		await retriedWorker.evaluate(
			() =>
				(
					window as unknown as { __captureCanvasStats: { read(): { toBlobCalls: number } } }
				).__captureCanvasStats.read().toBlobCalls,
		),
	).toBe(0);
	await page.locator("#direct-worker").evaluate((iframe: HTMLIFrameElement) => {
		iframe.src = "about:blank";
		iframe.remove();
	});
	expect(await page.locator(`iframe[src^="${captureOrigin.origin}"]`).count()).toBe(0);

	const tall = await directWorkerRequest(
		page,
		captureOrigin.origin,
		'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="1000"><rect width="40" height="1000" fill="#f5391a"/></svg>',
		{ width: 40, height: 1000, dpr: 2 },
	);
	expect(tall.reply).toMatchObject({
		spool: "spool-capture-result-v1",
		id: "0123456789abcdef0123456789abcdef",
		image: { width: 80, height: 2000 },
	});
	await page.locator("#direct-worker").evaluate((iframe: HTMLIFrameElement) => {
		iframe.src = "about:blank";
		iframe.remove();
	});

	const oversized = await directWorkerRequest(
		page,
		captureOrigin.origin,
		'<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="6000"><rect width="6000" height="6000" fill="#f5391a"/></svg>',
		// past the raster budget even at one device pixel per CSS pixel, so no fit can save it
		{ width: 6000, height: 6000, dpr: 1 },
	);
	expect(oversized.reply).toMatchObject({
		spool: "spool-capture-result-v1",
		id: "0123456789abcdef0123456789abcdef",
		error: "capture output too large",
	});
	await page.locator("#direct-worker").evaluate((iframe: HTMLIFrameElement) => {
		iframe.src = "about:blank";
		iframe.remove();
	});
});

it.each(["inline", "class", "offscreen"] as const)(
	"captures a WebGL canvas with %s positioning and its cleared color",
	{
		timeout: 30_000,
	},
	async (positioning) => {
		const served = await serveWebglCapture(positioning);
		onTestFinished(() => served.close());
		const captureOrigin = new URL(served.controlOrigin);
		captureOrigin.hostname = CAPTURE_HOST;

		// The one test here that needs a GL context rather than a 2D one, so it is the one
		// that says which GL: left to the runner, a headless shell with no usable backend
		// hands back a null context, the clear never happens, and the capture comes back the
		// page's own white — which reads as the shim failing and is nothing of the sort.
		// SwiftShader is software, so the answer is the same on every machine.
		const browser = await chromium.launch({
			channel: "chromium-headless-shell",
			headless: true,
			args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
		});
		onTestFinished(() => browser.close());
		const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });
		onTestFinished(() => context.close());
		const page = await context.newPage();
		await page.goto(served.url);
		const authored = page.frames().find((frame) => new URL(frame.url()).hostname === RENDER_HOST);
		if (authored === undefined) throw new Error("authored frame did not load");
		await authored.locator("canvas").waitFor();
		// and it says so before reading pixels: a missing context is a fact about the runner,
		// and it must not arrive dressed as a colour assertion about the shim
		expect(
			await authored
				.locator("canvas")
				.evaluate((element) => (element as HTMLCanvasElement).getContext("webgl") !== null),
		).toBe(true);
		// The clear happens synchronously in the boot module, but the compositor
		// paints it asynchronously; wait out a couple of frames so the drawing
		// buffer has actually been presented at least once before capturing it,
		// otherwise this races the paint independently of the shim's fix. Out of
		// the viewport no frame comes: the capture's settle has to draw it.
		if (positioning !== "offscreen") {
			await authored.evaluate(
				() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
			);
		}

		const exported = await requestCapture(
			page,
			captureOrigin.origin,
			positioning === "offscreen" ? SETTLE_BUDGET_MS : 0,
		);
		expect(exported.resultReplies).toBe(1);
		const exportImage = await readImage(exported.image.url, page);
		expect(exportImage.type).toBe("image/png");
		// The shim's getContext wrap (#174) forces preserveDrawingBuffer on webgl
		// contexts, so the export reads back the red gl.clear() rather than
		// whatever the drawing buffer holds once the browser is done compositing —
		// nominally black.
		expect(exportImage.center[0]).toBeGreaterThanOrEqual(230);
		expect(exportImage.center[1]).toBeLessThanOrEqual(25);
		expect(exportImage.center[2]).toBeLessThanOrEqual(25);
		expect(exportImage.center[3]).toBe(255);
		// The live canvas sits in the middle half of the frame. Dropping its class
		// or id moves the replacement image into normal flow at the top left.
		expect(exportImage.assetSrc.slice(0, 3)).toEqual([255, 255, 255]);
	},
);

// a slide's words rising in as it boots, as the deck starter's do: in a frame held out of view a headed Chrome never
// moves the animation's clock, so the settle waits in vain and a talk's PDF got the words at their first, invisible
// keyframe. A clock still at its start stands in for that here: the export copies an entrance at its end.
it("copies an entrance still under way at its end", { timeout: 30_000 }, async () => {
	const served = await serveWebglCapture("offscreen", {
		css: "@keyframes rise { from { opacity: 0 } } #fade { position: absolute; inset: 0; background: #ff0000; animation: rise 60s both; }",
		bootJs: `document.getElementById("root").innerHTML = '<div id="fade"></div>';`,
		iframeStyle: "visibility: hidden",
	});
	onTestFinished(() => served.close());
	const captureOrigin = new URL(served.controlOrigin);
	captureOrigin.hostname = CAPTURE_HOST;
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.goto(served.url);
	const authored = page.frames().find((frame) => new URL(frame.url()).hostname === RENDER_HOST);
	if (authored === undefined) throw new Error("authored frame did not load");
	await authored.locator("#fade").waitFor({ state: "attached" });

	const exported = await requestCapture(page, captureOrigin.origin, 0);
	expect(exported.resultReplies).toBe(1);
	const exportImage = await readImage(exported.image.url, page);
	expect(exportImage.center.slice(0, 3)).toEqual([255, 0, 0]);
	// and the frame's own animation goes on from where it was
	expect(await authored.locator("#fade").evaluate((element) => element.getAnimations()[0]?.currentTime)).toBeLessThan(
		30_000,
	);
});

it("draws a still's text in the faces it carries on the first raster", { timeout: 30_000 }, async () => {
	const served = await serveCapture();
	onTestFinished(() => served.close());
	const captureOrigin = new URL(served.controlOrigin);
	captureOrigin.hostname = CAPTURE_HOST;
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage();
	await page.goto(served.url);
	// as a capture source inlines the faces a text needs: data URLs, each its subset, held invisible until it loads
	const face = (subset: string, range: string) =>
		`@font-face{font-family:Probe;font-style:normal;font-weight:400;font-display:block;src:url(data:font/woff2;base64,${readFileSync(
			join(process.cwd(), `node_modules/@fontsource/fragment-mono/files/fragment-mono-${subset}-400-normal.woff2`),
		).toString("base64")});unicode-range:${range}}`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><foreignObject x="0" y="0" width="400" height="200"><div xmlns="http://www.w3.org/1999/xhtml"><style>${face("latin", "U+0-FF")}${face("latin-ext", "U+100-24F")}</style><div style="font-family:Probe;font-size:160px;line-height:200px;color:#000">MMŁ</div></div></foreignObject></svg>`;
	const { reply } = await directWorkerRequest(page, captureOrigin.origin, svg, { width: 400, height: 200, dpr: 1 });
	const url = (reply.image as { url: string } | undefined)?.url;
	if (url === undefined) throw new Error(String(reply.error));
	const darkest = await page.evaluate(async (url) => {
		const image = new Image();
		image.src = url;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = 400;
		canvas.height = 200;
		const context = canvas.getContext("2d");
		if (context === null) throw new Error("image canvas unavailable");
		context.drawImage(image, 0, 0);
		const data = context.getImageData(0, 0, 400, 200).data;
		let least = 255;
		for (let i = 0; i < data.length; i += 4) least = Math.min(least, data[i] ?? 255);
		return least;
	}, url);
	expect(darkest).toBeLessThan(64);
});
