import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium, type Frame, type Page } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { COVER_MAX_EDGE } from "../cover";
import { assembleFrameDocument, captureWorkerCsp, captureWorkerDocument } from "./document";
import { CAPTURE_HOST, RENDER_HOST } from "./security";

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
			main { font-family: "Capture Test"; }`,
		importMap: { imports: {} },
		bootJs: `
			const heavyText = "x".repeat(65_535) + "😀" + "x".repeat(1_034_463);
			document.getElementById("root").innerHTML = '<main style="position: relative; width: 100%; height: 100%; background: #f5391a">capture<input value="live"><canvas width="20" height="10" style="position: absolute; left: 10px; top: 10px; width: 20px; height: 10px"></canvas><canvas width="20" height="10" style="position: absolute; left: 40px; top: 10px; width: 20px; height: 10px"></canvas><span hidden>' + heavyText + '</span></main>';
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
		return {
			type: response.headers.get("content-type"),
			width: image.naturalWidth,
			height: image.naturalHeight,
			magic: Array.from(bytes.slice(0, 8)),
			center: Array.from(
				context.getImageData(Math.floor(image.naturalWidth / 2), Math.floor(image.naturalHeight / 2), 1, 1).data,
			),
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

async function requestCapture(page: Page, captureOrigin: string, maxEdge: number) {
	return page.evaluate(
		async ({ captureOrigin, maxEdge }) => {
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
					maxEdge: number;
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
							maxEdge?: unknown;
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
							typeof value.maxEdge !== "number"
						) {
							reject(new Error("invalid capture source"));
							return;
						}
						resolve({
							svg: value.svg,
							width: value.width,
							height: value.height,
							dpr: value.dpr,
							maxEdge: value.maxEdge,
						});
					};
					window.addEventListener("message", sourceListener);
					sourceWindow.postMessage({ spool: "capture", id, maxEdge, settleMs: 0 }, "*");
				});
				if (timeoutId !== undefined) window.clearTimeout(timeoutId);
				if (sourceListener !== undefined) window.removeEventListener("message", sourceListener);
				const rungs = await new Promise<{ url: string; width: number; height: number }[]>((resolve, reject) => {
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
								rungs?: unknown;
								error?: unknown;
							};
							if (value.spool !== "spool-capture-result-v1" || value.id !== id) return;
							resultReplies += 1;
							if (Array.isArray(value.rungs))
								resolve(value.rungs as { url: string; width: number; height: number }[]);
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
				return { rungs, resultReplies };
			} finally {
				cleanup();
			}
		},
		{ captureOrigin, maxEdge },
	);
}

async function directWorkerRequest(page: Page, captureOrigin: string, svg: string) {
	return page.evaluate(
		async ({ captureOrigin, svg }) => {
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
					width: 20,
					height: 10,
					dpr: 2,
					maxEdge: 40,
				});
			});
			channel.port1.close();
			channel.port2.close();
			return { reply, replies };
		},
		{ captureOrigin, svg },
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

	// one reply, the whole ladder: the top rung is the 800×600 frame's long edge
	// at 2×, then half, then quarter — all off one parse and one decode
	const cover = await requestCapture(page, captureOrigin.origin, COVER_MAX_EDGE);
	expect(cover.resultReplies).toBe(1);
	expect(cover.rungs.map((rung) => [rung.width, rung.height])).toEqual([
		[1600, 1200],
		[800, 600],
		[400, 300],
	]);
	const rungImages = [];
	for (const rung of cover.rungs) rungImages.push(await readImage(rung.url, page));
	expect(rungImages.map((image) => [image.type, image.width, image.height])).toEqual([
		["image/jpeg", 1600, 1200],
		["image/jpeg", 800, 600],
		["image/jpeg", 400, 300],
	]);
	const coverImage = rungImages[1] as (typeof rungImages)[number];
	expect(coverImage.magic).toEqual([255, 216, 255, 224, 0, 16, 74, 70]);
	expect(coverImage.center[0]).toBeGreaterThanOrEqual(240);
	expect(coverImage.center[1]).toBeGreaterThanOrEqual(52);
	expect(coverImage.center[1]).toBeLessThanOrEqual(62);
	expect(coverImage.center[2]).toBeGreaterThanOrEqual(20);
	expect(coverImage.center[2]).toBeLessThanOrEqual(32);
	expect(coverImage.center[3]).toBe(255);
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
	// an export is one lossless sheet, never a ladder
	expect(exported.rungs).toHaveLength(1);
	expect(await readImage(exported.rungs[0]?.url ?? "", page)).toEqual({
		type: "image/png",
		width: 1600,
		height: 1200,
		magic: [137, 80, 78, 71, 13, 10, 26, 10],
		center: [245, 57, 26, 255],
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
	expect((retried.reply.rungs as { url: string }[])[0]?.url).toMatch(/^data:image\/jpeg;base64,/);
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
});
