import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium, type Frame, type Page } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { LIVE_MIN_CSS_PX } from "../cover";
import { assembleFrameDocument, captureWorkerCsp, captureWorkerDocument } from "./document";
import { CAPTURE_HOST, RENDER_HOST } from "./security";

/** A solid #ffcc00 pixel and a solid #7f00ff square — probes for both allowlists. */
const AMBER_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4f4bhPwAHZALLB0SopwAAAABJRU5ErkJggg==";
const VIOLET_SVG =
	"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiM3ZjAwZmYiLz48L3N2Zz4=";

interface ServedCapture {
	controlOrigin: string;
	url: string;
	externalRequests(): string[];
	close(): Promise<void>;
}

async function serveCapture(): Promise<ServedCapture> {
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
			/* A project asset, as the compiler bakes one in (#101): the src copy of
			   the allowlist carries the svg, the CSS copy carries the raster. */
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
				background-image: url(data:image/png;base64,${AMBER_PNG});
			}`,
		// If this import-only sheet survives, its important green wins visibly.
		fonts: `@import "/theme.css";
			main { background-color: #18a957 !important; }`,
		// A URL import is removed while its ordinary blue rule survives.
		bundledCss: `@import url("/theme.css");
			main { background-color: #2474ff; }`,
		importMap: { imports: {} },
		bootJs: `
			const heavyText = "x".repeat(65_535) + "😀" + "x".repeat(1_034_463);
			document.getElementById("root").innerHTML = '<main style="position: relative; width: 100%; height: 100%">capture<input value="live"><span class="capture-style-probe"></span><img class="capture-asset-probe" alt="" src="data:image/svg+xml;base64,${VIOLET_SVG}"><span class="capture-asset-css-probe"></span><canvas width="20" height="10" style="position: absolute; left: 10px; top: 10px; width: 20px; height: 10px"></canvas><canvas width="20" height="10" style="position: absolute; left: 40px; top: 10px; width: 20px; height: 10px"></canvas><span hidden>' + heavyText + '</span></main>';
			document.querySelectorAll("canvas").forEach((canvas, index) => {
				const context = canvas.getContext("2d");
				context.fillStyle = index === 0 ? "#fff" : "#000";
				context.fillRect(0, 0, canvas.width, canvas.height);
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

/** A frame with a single WebGL canvas, cleared to solid red once and never redrawn — the #174 repro shape. */
async function serveWebglCapture(): Promise<{ controlOrigin: string; url: string; close(): Promise<void> }> {
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
		project: "capture-test-webgl",
		frame: "capture",
		projectCapability: "capture-test-webgl",
		controlOrigin,
		css: "",
		importMap: { imports: {} },
		// No preserveDrawingBuffer here — the shim is what's expected to add it
		// (#174). Left to the spec, the drawing buffer clears once the browser is
		// done compositing it, so an unpatched self-capture reads this back black.
		bootJs: `
			document.getElementById("root").innerHTML = '<canvas id="gl" width="800" height="600" style="position: absolute; inset: 0; width: 100%; height: 100%"></canvas>';
			const gl = document.getElementById("gl").getContext("webgl");
			gl.clearColor(1, 0, 0, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);
		`,
	});
	controlDocument = `<!doctype html><html><body>
<iframe id="frame" width="800" height="600" sandbox="allow-scripts" src="${renderOrigin}/frame"></iframe>
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

async function startTargetPerformance(frame: Frame): Promise<void> {
	await frame.evaluate(() => {
		const longTasks: number[] = [];
		const rafGaps: number[] = [];
		const supported = PerformanceObserver.supportedEntryTypes.includes("longtask");
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) longTasks.push(entry.duration);
		});
		if (supported) observer.observe({ type: "longtask" });
		let previous = performance.now();
		let request = 0;
		const tick = (now: number) => {
			const gap = now - previous;
			if (gap > 50) rafGaps.push(gap);
			previous = now;
			request = requestAnimationFrame(tick);
		};
		request = requestAnimationFrame(tick);
		Object.defineProperty(window, "__capturePerformance", {
			configurable: true,
			value: {
				async stop() {
					await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
					cancelAnimationFrame(request);
					for (const entry of observer.takeRecords()) longTasks.push(entry.duration);
					observer.disconnect();
					return { supported, longTasks, rafGaps };
				},
			},
		});
	});
}

async function stopTargetPerformance(frame: Frame) {
	return frame.evaluate(() =>
		(
			window as unknown as {
				__capturePerformance: {
					stop(): Promise<{ supported: boolean; longTasks: number[]; rafGaps: number[] }>;
				};
			}
		).__capturePerformance.stop(),
	);
}

async function requestCapture(page: Page, captureOrigin: string, targetWidth: number) {
	return page.evaluate(
		async ({ captureOrigin, targetWidth }) => {
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
					targetWidth: number;
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
							targetWidth?: unknown;
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
							typeof value.dpr !== "number" ||
							typeof value.targetWidth !== "number"
						) {
							reject(new Error("invalid capture source"));
							return;
						}
						resolve({
							svg: value.svg,
							width: value.width,
							height: value.height,
							dpr: value.dpr,
							targetWidth: value.targetWidth,
						});
					};
					window.addEventListener("message", sourceListener);
					sourceWindow.postMessage({ spool: "capture", id, targetWidth, settleMs: 0 }, "*");
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
		{ captureOrigin, targetWidth },
	);
}

async function directWorkerRequest(
	page: Page,
	captureOrigin: string,
	svg: string,
	dimensions: { width: number; height: number; dpr: number; targetWidth: number } = {
		width: 20,
		height: 10,
		dpr: 2,
		targetWidth: 400,
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

	// One reply, one image: 400 CSS px at 2× for the 800×600 source.
	const cover = await requestCapture(page, captureOrigin.origin, LIVE_MIN_CSS_PX);
	expect(cover.resultReplies).toBe(1);
	const coverImage = await readImage(cover.image.url, page);
	expect([coverImage.type, coverImage.width, coverImage.height]).toEqual(["image/jpeg", 800, 600]);
	expect(coverImage.magic).toEqual([255, 216, 255, 224, 0, 16, 74, 70]);
	expect(coverImage.center[0]).toBeGreaterThanOrEqual(240);
	expect(coverImage.center[1]).toBeGreaterThanOrEqual(52);
	expect(coverImage.center[1]).toBeLessThanOrEqual(62);
	expect(coverImage.center[2]).toBeGreaterThanOrEqual(20);
	expect(coverImage.center[2]).toBeLessThanOrEqual(32);
	expect(coverImage.center[3]).toBe(255);
	expect(coverImage.bottomRight[0]).toBeGreaterThanOrEqual(28);
	expect(coverImage.bottomRight[0]).toBeLessThanOrEqual(44);
	expect(coverImage.bottomRight[1]).toBeGreaterThanOrEqual(108);
	expect(coverImage.bottomRight[1]).toBeLessThanOrEqual(124);
	expect(coverImage.bottomRight[2]).toBeGreaterThanOrEqual(247);
	expect(coverImage.bottomRight[3]).toBe(255);
	// The two project-asset routes (#101): an svg through <img src>, a raster
	// through a CSS background. Both must be in the picture, not stripped out.
	expect(coverImage.assetSrc[0]).toBeGreaterThanOrEqual(112);
	expect(coverImage.assetSrc[0]).toBeLessThanOrEqual(142);
	expect(coverImage.assetSrc[1]).toBeLessThanOrEqual(16);
	expect(coverImage.assetSrc[2]).toBeGreaterThanOrEqual(240);
	expect(coverImage.assetCss[0]).toBeGreaterThanOrEqual(240);
	expect(coverImage.assetCss[1]).toBeGreaterThanOrEqual(190);
	expect(coverImage.assetCss[1]).toBeLessThanOrEqual(218);
	expect(coverImage.assetCss[2]).toBeLessThanOrEqual(16);
	expect(await page.locator(`iframe[src^="${captureOrigin.origin}"]`).count()).toBe(0);
	expect(
		await authored.evaluate(() =>
			(
				window as unknown as {
					__captureCanvasStats: { read(): { toBlobCalls: number; callsAtFirstCallback: number | null } };
				}
			).__captureCanvasStats.read(),
		),
	).toEqual({ toBlobCalls: 2, callsAtFirstCallback: 2 });
	expect(
		await authored.evaluate(
			() => (window as unknown as { __captureIframeMutations: number }).__captureIframeMutations,
		),
	).toBe(0);

	await startTargetPerformance(authored);
	const exported = await requestCapture(page, captureOrigin.origin, 0);
	expect(exported.resultReplies).toBe(1);
	// An export is one full-resolution lossless sheet.
	expect(await readImage(exported.image.url, page)).toEqual({
		type: "image/png",
		width: 1600,
		height: 1200,
		magic: [137, 80, 78, 71, 13, 10, 26, 10],
		center: [245, 57, 26, 255],
		bottomRight: [36, 116, 255, 255],
		assetSrc: [127, 0, 255, 255],
		assetCss: [255, 204, 0, 255],
	});
	expect(await stopTargetPerformance(authored)).toEqual({ supported: true, longTasks: [], rafGaps: [] });
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
	expect((retried.reply.image as { url: string } | undefined)?.url).toMatch(/^data:image\/jpeg;base64,/);
	const retriedWorker = page.frames().find((frame) => frame.url() === `${captureOrigin.origin}/capture`);
	if (retriedWorker === undefined) throw new Error("retried worker disappeared before cleanup inspection");
	expect(
		await retriedWorker.locator("canvas").evaluate((element) => {
			const canvas = element as HTMLCanvasElement;
			return [canvas.width, canvas.height];
		}),
	).toEqual([0, 0]);
	await page.locator("#direct-worker").evaluate((iframe: HTMLIFrameElement) => {
		iframe.src = "about:blank";
		iframe.remove();
	});
	expect(await page.locator(`iframe[src^="${captureOrigin.origin}"]`).count()).toBe(0);

	const tall = await directWorkerRequest(
		page,
		captureOrigin.origin,
		'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="1000"><rect width="40" height="1000" fill="#f5391a"/></svg>',
		{ width: 40, height: 1000, dpr: 2, targetWidth: 400 },
	);
	expect(tall.reply).toMatchObject({
		spool: "spool-capture-result-v1",
		id: "0123456789abcdef0123456789abcdef",
		image: { width: 800, height: 20_000 },
	});
	await page.locator("#direct-worker").evaluate((iframe: HTMLIFrameElement) => {
		iframe.src = "about:blank";
		iframe.remove();
	});

	const oversized = await directWorkerRequest(
		page,
		captureOrigin.origin,
		'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="10000"><rect width="40" height="10000" fill="#f5391a"/></svg>',
		{ width: 40, height: 10_000, dpr: 2, targetWidth: 400 },
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

it("captures a WebGL canvas as its cleared color, not black (#174)", {
	timeout: 30_000,
}, async () => {
	const served = await serveWebglCapture();
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
	// otherwise this races the paint independently of the shim's fix.
	await authored.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

	const cover = await requestCapture(page, captureOrigin.origin, LIVE_MIN_CSS_PX);
	expect(cover.resultReplies).toBe(1);
	const coverImage = await readImage(cover.image.url, page);
	expect(coverImage.type).toBe("image/jpeg");
	// The shim's getContext wrap (#174) forces preserveDrawingBuffer on webgl
	// contexts, so the self-capture reads back the red gl.clear() rather than
	// whatever the drawing buffer holds once the browser is done compositing —
	// nominally black. JPEG's lossy encoding gets an approximate assertion.
	expect(coverImage.center[0]).toBeGreaterThanOrEqual(230);
	expect(coverImage.center[1]).toBeLessThanOrEqual(25);
	expect(coverImage.center[2]).toBeLessThanOrEqual(25);
	expect(coverImage.center[3]).toBe(255);
});
