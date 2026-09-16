import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { build, preview } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { testBrowser } from "../../test-browser";

it("builds a full-resolution PDF without blocking the canvas thread", { timeout: 30_000 }, async () => {
	const outDir = mkdtempSync(join(tmpdir(), "spool-export-"));
	onTestFinished(() => rmSync(outDir, { recursive: true, force: true }));
	await build({
		configFile: false,
		logLevel: "silent",
		build: {
			outDir,
			lib: {
				entry: fileURLToPath(new URL("./frame-export.ts", import.meta.url)),
				formats: ["es"],
				fileName: "frame-export",
			},
		},
	});
	const server = await preview({
		configFile: false,
		logLevel: "silent",
		build: { outDir },
		preview: { host: "127.0.0.1", port: 0 },
	});
	onTestFinished(() => new Promise<void>((resolve) => server.httpServer.close(() => resolve())));
	const url = server.resolvedUrls?.local[0];
	if (url === undefined) throw new Error("export server did not bind");
	const browser = await testBrowser();
	const page = await browser.newPage();
	await page.goto(`${url}frame-export.js`);
	await page.addScriptTag({
		type: "module",
		content: `import { buildFramePdf } from "${url}frame-export.js"; window.buildFramePdf = buildFramePdf;`,
	});
	await page.waitForFunction(() => typeof Reflect.get(window, "buildFramePdf") === "function");
	const result = await page.evaluate(async () => {
		const buildFramePdf = Reflect.get(window, "buildFramePdf") as typeof import("./frame-export").buildFramePdf;
		const canvas = document.createElement("canvas");
		canvas.width = 2400;
		canvas.height = 1600;
		const context = canvas.getContext("2d");
		if (context === null) throw new Error("canvas unavailable");
		const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
		gradient.addColorStop(0, "#f5391a");
		gradient.addColorStop(1, "#2474ff");
		context.fillStyle = gradient;
		context.fillRect(0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG failed")))),
		);
		const png = await blob.arrayBuffer();
		const longTasks: number[] = [];
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) longTasks.push(entry.duration);
		});
		observer.observe({ type: "longtask" });
		const started = performance.now();
		const bytes = await buildFramePdf(
			Array.from({ length: 4 }, (_, index) => ({
				name: `frame-${index}`,
				width: 1200,
				height: 800,
				png: new Uint8Array(png.slice(0)),
			})),
		);
		const elapsed = performance.now() - started;
		await new Promise((resolve) => setTimeout(resolve, 50));
		for (const entry of observer.takeRecords()) longTasks.push(entry.duration);
		observer.disconnect();
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () =>
				typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("PDF read failed"));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(new Blob([Uint8Array.from(bytes)]));
		});
		return { elapsed, longTasks, dataUrl };
	});
	console.info("PDF export", { elapsed: result.elapsed, longTasks: result.longTasks });
	const pdf = await PDFDocument.load(Buffer.from(result.dataUrl.slice(result.dataUrl.indexOf(",") + 1), "base64"));
	expect(pdf.getPageCount()).toBe(4);
	expect(pdf.getPage(0).getSize()).toEqual({ width: 900, height: 600 });
	expect(result.longTasks).toEqual([]);
});
