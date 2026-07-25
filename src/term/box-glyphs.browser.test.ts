import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
import { build } from "esbuild";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { termFontDataCss } from "../daemon/term-fonts";
import { launchHeadlessShell } from "../headless-shell";
import { gridFromBuffer } from "./buffer-grid";
import { trackCursorVisibility } from "./cursor-visibility";
import type { Grid } from "./still";
import { gridToSvg } from "./still";
import { TERM_FOREGROUND } from "./theme";

interface BrowserHarness {
	webgl: boolean;
	render(data: string, svg: string, cursor: boolean): Promise<void>;
	loseContext(): Promise<{
		contextLost: boolean;
		fallback: boolean;
		sameTerminal: boolean;
		before: string;
		after: string;
	}>;
}

interface Raster {
	width: number;
	height: number;
	pixels: Uint8Array;
}

const require = createRequire(import.meta.url);
const xtermCss = require.resolve("@xterm/xterm/css/xterm.css");
let browser: Browser | undefined;
let runtime = "";

beforeAll(async () => {
	browser = await launchHeadlessShell(() => undefined);
	const result = await build({
		stdin: {
			contents: `
				import { Terminal } from "@xterm/xterm";
				import { activateWebgl } from "./src/runtime/term-webgl.ts";
				(async () => {
					await document.fonts.load('15px "JetBrains Mono"');
					const term = new Terminal({
						cols: 20,
						rows: 3,
						fontFamily: '"JetBrains Mono", monospace',
						fontSize: 15,
						lineHeight: 1,
						letterSpacing: 0,
						customGlyphs: true,
						cursorBlink: false,
						theme: { background: "#111110", foreground: "#d8d6d0", cursor: "#f0efeb", cursorAccent: "#111110" }
					});
					const original = term;
					term.open(document.getElementById("term"));
					let contextLost = false;
					const webgl = window.__useWebgl === true ? await activateWebgl(term) : undefined;
					if (webgl) webgl.onContextLoss(() => { contextLost = true; });
					const write = data => new Promise(resolve => term.write(data, resolve));
					const painted = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
					window.__boxHarness = {
						webgl: webgl !== undefined,
						async render(data, svg, cursor) {
							document.getElementById("still").innerHTML = svg;
							if (cursor) term.focus();
							await write("\\x1b[2J\\x1b[H" + (cursor ? "\\x1b[?25h" : "\\x1b[?25l") + data);
							await painted();
						},
						async loseContext() {
							const before = term.buffer.active.getLine(0)?.translateToString(true) ?? "";
							if (!webgl) throw new Error("WebGL was not active");
							const contexts = [...document.querySelectorAll("canvas")].map(canvas => ({
								gl: canvas.getContext("webgl2") || canvas.getContext("webgl"), canvas
							}));
							const target = contexts.find(value => value.gl);
							const extension = target?.gl?.getExtension("WEBGL_lose_context");
							if (!target || !extension) throw new Error("WEBGL_lose_context was not available");
							target.canvas.addEventListener("webglcontextlost", () => { contextLost = true; }, { once: true });
							extension.loseContext();
							await new Promise(resolve => setTimeout(resolve, 3250));
							await painted();
							await write("\\x1b[2J\\x1b[H\\x1b[?25l─┼─");
							await painted();
							return {
								contextLost,
								fallback: !target.canvas.isConnected,
								sameTerminal: term === original,
								before,
								after: term.buffer.active.getLine(0)?.translateToString(true) ?? ""
							};
						}
					};
					window.__ready = true;
				})().catch(error => { window.__error = String(error?.stack ?? error); });
			`,
			resolveDir: process.cwd(),
			loader: "js",
		},
		bundle: true,
		format: "iife",
		platform: "browser",
		target: "es2022",
		write: false,
		logLevel: "silent",
	});
	runtime = result.outputFiles[0]?.text ?? "";
	if (runtime === "") throw new Error("browser glyph harness did not bundle");
}, 120_000);

afterAll(async () => {
	await browser?.close();
});

function activeBrowser(): Browser {
	if (browser === undefined) throw new Error("browser glyph harness did not start");
	return browser;
}

async function openHarness(deviceScaleFactor: number, zoom: number, useWebgl = true): Promise<Page> {
	const context = await activeBrowser().newContext({ deviceScaleFactor, viewport: { width: 520, height: 240 } });
	const page = await context.newPage();
	await page.setContent(`<!doctype html>
		<style>${termFontDataCss()}\n${readFileSync(xtermCss, "utf8")}
		html, body { margin: 0; background: #111110; }
		.surface { width: 180px; height: 60px; zoom: ${zoom}; }
		#still svg { display: block; }
		</style>
		<script>window.__useWebgl = ${useWebgl};</script>
		<div id="term" class="surface"></div>
		<div id="still" class="surface"></div>`);
	await page.addScriptTag({ content: runtime });
	await page.waitForFunction(
		() => (window as unknown as { __ready?: boolean; __error?: string }).__ready === true,
		undefined,
		{ timeout: 10_000 },
	);
	if (useWebgl) {
		expect(
			await page.evaluate(() => (window as unknown as { __boxHarness: BrowserHarness }).__boxHarness.webgl),
		).toBe(true);
	}
	// A newly downloaded headless shell can expose its white compositor buffer
	// on the first screenshot even though the WebGL frame is already queued.
	// Wait for a real terminal frame before making pixel-level assertions.
	await expect
		.poll(
			async () => {
				const raster = decodePng(await page.locator("#term").screenshot());
				let brightness = 0;
				for (let index = 0; index < raster.pixels.length; index += 4) {
					brightness +=
						((raster.pixels[index] as number) +
							(raster.pixels[index + 1] as number) +
							(raster.pixels[index + 2] as number)) /
						3;
				}
				return brightness / (raster.width * raster.height);
			},
			{ timeout: 10_000 },
		)
		.toBeLessThan(64);
	return page;
}

async function render(page: Page, data: string, grid: Grid, cursor = false): Promise<{ live: Raster; still: Raster }> {
	await page.evaluate(
		async ({ data, svg, cursor }) => {
			await (window as unknown as { __boxHarness: BrowserHarness }).__boxHarness.render(data, svg, cursor);
		},
		{ data, svg: gridToSvg(grid, termFontDataCss()), cursor },
	);
	return {
		live: decodePng(await page.locator("#term").screenshot()),
		still: decodePng(await page.locator("#still").screenshot()),
	};
}

async function bufferGrid(data: string): Promise<Grid> {
	const term = new HeadlessTerminal({ cols: 20, rows: 3, allowProposedApi: true });
	trackCursorVisibility(term);
	await new Promise<void>((resolve) => term.write(data, resolve));
	const grid = gridFromBuffer(term);
	term.dispose();
	return grid;
}

function cellColorError(a: Raster, b: Raster, col: number, row: number): number {
	if (a.width !== b.width || a.height !== b.height) throw new Error("surface rasters have different dimensions");
	const cellWidth = a.width / 20;
	const cellHeight = a.height / 3;
	const left = Math.round(col * cellWidth);
	const top = Math.round(row * cellHeight);
	const right = Math.round((col + 1) * cellWidth);
	const bottom = Math.round((row + 1) * cellHeight);
	let difference = 0;
	let channels = 0;
	for (let y = top; y < bottom; y++) {
		for (let x = left; x < right; x++) {
			const index = (y * a.width + x) * 4;
			for (let channel = 0; channel < 3; channel++) {
				difference += Math.abs((a.pixels[index + channel] as number) - (b.pixels[index + channel] as number));
				channels++;
			}
		}
	}
	return difference / (channels * 255);
}

function cursorFillRatio(raster: Raster, col: number, row: number): number {
	const cellWidth = raster.width / 20;
	const cellHeight = raster.height / 3;
	const left = Math.round(col * cellWidth);
	const top = Math.round(row * cellHeight);
	const right = Math.round((col + 1) * cellWidth);
	const bottom = Math.round((row + 1) * cellHeight);
	let cursorPixels = 0;
	let pixels = 0;
	for (let y = top; y < bottom; y++) {
		for (let x = left; x < right; x++) {
			const index = (y * raster.width + x) * 4;
			if (
				(raster.pixels[index] as number) >= 230 &&
				(raster.pixels[index + 1] as number) >= 230 &&
				(raster.pixels[index + 2] as number) >= 230
			)
				cursorPixels++;
			pixels++;
		}
	}
	return cursorPixels / pixels;
}

/** Minimal PNG decoder for Playwright's opaque screenshots (RGB/RGBA, 8-bit). */
function decodePng(png: Buffer): Raster {
	const signature = "89504e470d0a1a0a";
	if (png.subarray(0, 8).toString("hex") !== signature) throw new Error("expected a PNG screenshot");
	let offset = 8;
	let width = 0;
	let height = 0;
	let colorType = 0;
	const chunks: Buffer[] = [];
	while (offset < png.length) {
		const length = png.readUInt32BE(offset);
		const type = png.subarray(offset + 4, offset + 8).toString("ascii");
		const data = png.subarray(offset + 8, offset + 8 + length);
		offset += length + 12;
		if (type === "IHDR") {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			if (data[8] !== 8) throw new Error("expected an 8-bit PNG screenshot");
			colorType = data[9] as number;
		}
		if (type === "IDAT") chunks.push(data);
		if (type === "IEND") break;
	}
	const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
	if (width === 0 || height === 0 || channels === 0) throw new Error("expected an RGB(A) PNG screenshot");
	const rowBytes = width * channels;
	const compressed = inflateSync(Buffer.concat(chunks));
	const decoded = new Uint8Array(rowBytes * height);
	let source = 0;
	for (let row = 0; row < height; row++) {
		const filter = compressed[source++] as number;
		const rowStart = row * rowBytes;
		for (let column = 0; column < rowBytes; column++) {
			const raw = compressed[source++] as number;
			const left = column >= channels ? (decoded[rowStart + column - channels] as number) : 0;
			const above = row > 0 ? (decoded[rowStart + column - rowBytes] as number) : 0;
			const upperLeft =
				row > 0 && column >= channels ? (decoded[rowStart + column - rowBytes - channels] as number) : 0;
			decoded[rowStart + column] = unfilter(filter, raw, left, above, upperLeft);
		}
	}
	if (channels === 4) return { width, height, pixels: decoded };
	const pixels = new Uint8Array(width * height * 4);
	for (let index = 0; index < width * height; index++) {
		pixels[index * 4] = decoded[index * 3] as number;
		pixels[index * 4 + 1] = decoded[index * 3 + 1] as number;
		pixels[index * 4 + 2] = decoded[index * 3 + 2] as number;
		pixels[index * 4 + 3] = 255;
	}
	return { width, height, pixels };
}

function unfilter(filter: number, raw: number, left: number, above: number, upperLeft: number): number {
	if (filter === 0) return raw;
	if (filter === 1) return (raw + left) & 0xff;
	if (filter === 2) return (raw + above) & 0xff;
	if (filter === 3) return (raw + Math.floor((left + above) / 2)) & 0xff;
	if (filter === 4) {
		const p = left + above - upperLeft;
		const pa = Math.abs(p - left);
		const pb = Math.abs(p - above);
		const pc = Math.abs(p - upperLeft);
		return (raw + (pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft)) & 0xff;
	}
	throw new Error(`unsupported PNG filter ${filter}`);
}

type Edge = "B" | "L" | "R" | "T";

function hasInk(raster: Raster, left: number, top: number, right: number, bottom: number): boolean {
	for (let y = Math.max(0, Math.floor(top)); y <= Math.min(raster.height - 1, Math.ceil(bottom)); y++) {
		for (let x = Math.max(0, Math.floor(left)); x <= Math.min(raster.width - 1, Math.ceil(right)); x++) {
			const index = (y * raster.width + x) * 4;
			// Screenshots are RGBA. The line's pinned foreground is #d8d6d0;
			// this leaves ample room for antialiasing while excluding #111110.
			if ((raster.pixels[index] as number) >= 80) return true;
		}
	}
	return false;
}

function displayedEdges(raster: Raster): Edge[] {
	const cellWidth = raster.width / 20;
	const cellHeight = raster.height / 3;
	const sideRadius = 1;
	const capRadius = 2;
	const edges: Edge[] = [];
	if (hasInk(raster, -sideRadius, cellHeight * 0.2, sideRadius, cellHeight * 0.8)) edges.push("L");
	if (hasInk(raster, cellWidth - sideRadius, cellHeight * 0.2, cellWidth + sideRadius, cellHeight * 0.8))
		edges.push("R");
	if (hasInk(raster, cellWidth * 0.2, -capRadius, cellWidth * 0.8, capRadius)) edges.push("T");
	if (hasInk(raster, cellWidth * 0.2, cellHeight - capRadius, cellWidth * 0.8, cellHeight + capRadius))
		edges.push("B");
	return edges.sort();
}

function boxGrid(lines: string[][]): Grid {
	return {
		cols: 20,
		rows: 3,
		lines: lines.map((line) => line.map((text) => ({ text, width: 1, fg: TERM_FOREGROUND, box: true }))),
	};
}

const representatives = [
	{ char: "─", edges: ["L", "R"] },
	{ char: "━", edges: ["L", "R"] },
	{ char: "│", edges: ["B", "T"] },
	{ char: "┃", edges: ["B", "T"] },
	{ char: "┌", edges: ["B", "R"] },
	{ char: "┏", edges: ["B", "R"] },
	{ char: "├", edges: ["B", "R", "T"] },
	{ char: "┣", edges: ["B", "R", "T"] },
	{ char: "┼", edges: ["B", "L", "R", "T"] },
	{ char: "╋", edges: ["B", "L", "R", "T"] },
	{ char: "═", edges: ["L", "R"] },
	{ char: "║", edges: ["B", "T"] },
	{ char: "╔", edges: ["B", "R"] },
	{ char: "╦", edges: ["B", "L", "R"] },
	{ char: "╬", edges: ["B", "L", "R", "T"] },
	{ char: "╭", edges: ["B", "R"] },
] satisfies Array<{ char: string; edges: Edge[] }>;

function hasJoin(raster: Raster, x: number, y: number): boolean {
	const radius = 1;
	return hasInk(raster, x - radius, y - radius, x + radius, y + radius);
}

function glyphMask(raster: Raster, col = 0, row = 0): number[] {
	const cellWidth = raster.width / 20;
	const cellHeight = raster.height / 3;
	const left = Math.round(col * cellWidth);
	const top = Math.round(row * cellHeight);
	const right = Math.round((col + 1) * cellWidth);
	const bottom = Math.round((row + 1) * cellHeight);
	const mask: number[] = [];
	for (let y = top; y < bottom; y++) {
		for (let x = left; x < right; x++) {
			const index = (y * raster.width + x) * 4;
			const r = raster.pixels[index] as number;
			const g = raster.pixels[index + 1] as number;
			const b = raster.pixels[index + 2] as number;
			const coverage = ((r - 17) / 199 + (g - 17) / 197 + (b - 16) / 192) / 3;
			mask.push(Math.max(0, Math.min(1, coverage)));
		}
	}
	return mask;
}

function maskIoU(a: number[], b: number[]): number {
	if (a.length !== b.length) throw new Error("glyph masks have different dimensions");
	let intersection = 0;
	let union = 0;
	for (let index = 0; index < a.length; index++) {
		intersection += Math.min(a[index] as number, b[index] as number);
		union += Math.max(a[index] as number, b[index] as number);
	}
	return union === 0 ? 1 : intersection / union;
}

function ink(mask: number[]): number {
	return mask.reduce((sum, coverage) => sum + coverage, 0);
}

function maskSummary(mask: number[], width: number): string {
	let minX = width;
	let minY = Math.ceil(mask.length / width);
	let maxX = -1;
	let maxY = -1;
	for (let index = 0; index < mask.length; index++) {
		if ((mask[index] as number) < 0.05) continue;
		const x = index % width;
		const y = Math.floor(index / width);
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	return `${ink(mask).toFixed(2)}@${minX},${minY}-${maxX},${maxY}`;
}

function strokeClusters(mask: number[], width: number, height: number, axis: "horizontal" | "vertical"): number {
	const profile: number[] = [];
	const outer = axis === "horizontal" ? height : width;
	const inner = axis === "horizontal" ? width : height;
	for (let a = 0; a < outer; a++) {
		let value = 0;
		for (let b = 0; b < inner; b++) {
			const x = axis === "horizontal" ? b : a;
			const y = axis === "horizontal" ? a : b;
			value += mask[y * width + x] as number;
		}
		profile.push(value);
	}
	const threshold = Math.max(...profile) * 0.6;
	let clusters = 0;
	let active = false;
	for (const value of profile) {
		if (value >= threshold && !active) clusters++;
		active = value >= threshold;
	}
	return clusters;
}

describe("box glyphs in Chromium", () => {
	it("keeps representative live and still glyph pixels aligned across DPR and CSS zoom", async () => {
		for (const deviceScaleFactor of [1, 2]) {
			for (const zoom of [0.75, 1, 1.25]) {
				const page = await openHarness(deviceScaleFactor, zoom);
				const masks = new Map<string, { width: number; height: number; live: number[]; still: number[] }>();
				for (const representative of representatives) {
					const pixels = await render(page, representative.char, boxGrid([[representative.char], [], []]));
					const label = `${representative.char} at DPR ${deviceScaleFactor}, zoom ${zoom}`;
					const liveMask = glyphMask(pixels.live);
					const stillMask = glyphMask(pixels.still);
					masks.set(representative.char, {
						width: Math.round(pixels.live.width / 20),
						height: Math.round(pixels.live.height / 3),
						live: liveMask,
						still: stillMask,
					});
					expect(
						liveMask.reduce((sum, coverage) => sum + coverage, 0),
						`${label} WebGL output`,
					).toBeGreaterThan(1);
					expect(
						maskIoU(liveMask, stillMask),
						`${label} mask parity live=${maskSummary(liveMask, Math.round(pixels.live.width / 20))} still=${maskSummary(stillMask, Math.round(pixels.still.width / 20))}`,
					).toBeGreaterThanOrEqual(0.5);
					expect(displayedEdges(pixels.live), label).toEqual(representative.edges);
					expect(displayedEdges(pixels.still), label).toEqual(representative.edges);
					expect(displayedEdges(pixels.live), `${label} live/still parity`).toEqual(displayedEdges(pixels.still));
				}
				for (const [actual, impostor] of [
					["─", "━"],
					["━", "─"],
					["═", "─"],
					["│", "┃"],
					["┃", "│"],
					["║", "│"],
					["┌", "╭"],
					["╭", "┌"],
					["├", "┣"],
					["┣", "├"],
					["┼", "╋"],
					["╋", "┼"],
					["╔", "┌"],
					["╦", "├"],
				] as const) {
					const actualMasks = masks.get(actual);
					const impostorMask = masks.get(impostor)?.still;
					if (actualMasks === undefined || impostorMask === undefined) throw new Error("missing glyph mask");
					const own = maskIoU(actualMasks.live, actualMasks.still);
					const wrong = maskIoU(actualMasks.live, impostorMask);
					expect(
						own - wrong,
						`${actual} rejects ${impostor} at DPR ${deviceScaleFactor}, zoom ${zoom}`,
					).toBeGreaterThan(0.05);
				}
				for (const surface of ["live", "still"] as const) {
					const lightHorizontal = masks.get("─");
					const heavyHorizontal = masks.get("━");
					const doubleHorizontal = masks.get("═");
					const lightVertical = masks.get("│");
					const heavyVertical = masks.get("┃");
					const doubleVertical = masks.get("║");
					if (
						lightHorizontal === undefined ||
						heavyHorizontal === undefined ||
						doubleHorizontal === undefined ||
						lightVertical === undefined ||
						heavyVertical === undefined ||
						doubleVertical === undefined
					)
						throw new Error("missing stroke mask");
					const label = `${surface} at DPR ${deviceScaleFactor}, zoom ${zoom}`;
					expect(
						ink(heavyHorizontal[surface]) / ink(lightHorizontal[surface]),
						`${label} horizontal weight`,
					).toBeGreaterThan(1.6);
					expect(
						ink(heavyVertical[surface]) / ink(lightVertical[surface]),
						`${label} vertical weight`,
					).toBeGreaterThan(1.6);
					expect(
						strokeClusters(lightHorizontal[surface], lightHorizontal.width, lightHorizontal.height, "horizontal"),
						`${label} light horizontal profile`,
					).toBe(1);
					expect(
						strokeClusters(heavyHorizontal[surface], heavyHorizontal.width, heavyHorizontal.height, "horizontal"),
						`${label} heavy horizontal profile`,
					).toBe(1);
					expect(
						strokeClusters(
							doubleHorizontal[surface],
							doubleHorizontal.width,
							doubleHorizontal.height,
							"horizontal",
						),
						`${label} double horizontal profile`,
					).toBe(2);
					expect(
						strokeClusters(lightVertical[surface], lightVertical.width, lightVertical.height, "vertical"),
						`${label} light vertical profile`,
					).toBe(1);
					expect(
						strokeClusters(heavyVertical[surface], heavyVertical.width, heavyVertical.height, "vertical"),
						`${label} heavy vertical profile`,
					).toBe(1);
					expect(
						strokeClusters(doubleVertical[surface], doubleVertical.width, doubleVertical.height, "vertical"),
						`${label} double vertical profile`,
					).toBe(2);
				}
				const underlinedGrid = boxGrid([["─"], [], []]);
				const underlinedRun = underlinedGrid.lines[0]?.[0];
				if (underlinedRun === undefined) throw new Error("missing underlined glyph run");
				underlinedRun.underline = true;
				const underlined = await render(page, "\x1b[0;4m─", underlinedGrid);
				const liveUnderline = glyphMask(underlined.live);
				const stillUnderline = glyphMask(underlined.still);
				const cellWidth = underlined.live.width / 20;
				const cellHeight = underlined.live.height / 3;
				expect(
					hasInk(underlined.live, 0, cellHeight * 0.75, cellWidth, cellHeight - 1),
					`live underline at DPR ${deviceScaleFactor}, zoom ${zoom}`,
				).toBe(true);
				expect(
					hasInk(underlined.still, 0, cellHeight * 0.75, cellWidth, cellHeight - 1),
					`still underline at DPR ${deviceScaleFactor}, zoom ${zoom}`,
				).toBe(true);
				expect(
					maskIoU(liveUnderline, stillUnderline),
					`underline parity at DPR ${deviceScaleFactor}, zoom ${zoom}`,
				).toBeGreaterThanOrEqual(0.5);
				await page.context().close();
			}
		}
	}, 60_000);

	it("keeps joined horizontal and vertical strokes continuous in displayed live and still pixels", async () => {
		for (const deviceScaleFactor of [1, 2]) {
			for (const zoom of [0.75, 1, 1.25]) {
				const page = await openHarness(deviceScaleFactor, zoom);
				const horizontal = await render(page, "─┼─", boxGrid([["─", "┼", "─"], [], []]));
				for (const pixels of [horizontal.live, horizontal.still]) {
					const y = pixels.height / 6;
					expect(hasJoin(pixels, pixels.width / 20, y)).toBe(true);
					expect(hasJoin(pixels, (pixels.width / 20) * 2, y)).toBe(true);
				}
				const vertical = await render(page, "│\r\n┼\r\n│", boxGrid([["│"], ["┼"], ["│"]]));
				for (const pixels of [vertical.live, vertical.still]) {
					const x = pixels.width / 40;
					expect(hasJoin(pixels, x, pixels.height / 3)).toBe(true);
					expect(hasJoin(pixels, x, (pixels.height / 3) * 2)).toBe(true);
				}
				await page.context().close();
			}
		}
	}, 60_000);

	it("matches focused WebGL and still cursors across ordinary, box, wrap, wide, and styled cells", async () => {
		for (const deviceScaleFactor of [1, 2]) {
			for (const zoom of [0.75, 1, 1.25]) {
				const page = await openHarness(deviceScaleFactor, zoom);
				const cases = [
					{
						name: "ordinary",
						data: "x\b",
						col: 0,
					},
					{
						name: "box",
						data: "─\b",
						col: 0,
					},
					{
						name: "wrap-pending",
						data: "abcdefghijklmnopqrst",
						col: 19,
					},
					{
						name: "wide continuation",
						data: "你\b",
						col: 1,
						visible: false,
					},
					{
						name: "styled",
						data: "\x1b[1;2;3;4m x\b",
						col: 1,
					},
				] satisfies Array<{ name: string; data: string; col: number; visible?: boolean }>;
				for (const cursorCase of cases) {
					const pixels = await render(page, cursorCase.data, await bufferGrid(cursorCase.data), true);
					if (cursorCase.visible === false) {
						const liveFill = cursorFillRatio(pixels.live, cursorCase.col, 0);
						const stillFill = cursorFillRatio(pixels.still, cursorCase.col, 0);
						expect(liveFill, `${cursorCase.name} live at DPR ${deviceScaleFactor}, zoom ${zoom}`).toBeLessThan(
							0.1,
						);
						expect(stillFill, `${cursorCase.name} still at DPR ${deviceScaleFactor}, zoom ${zoom}`).toBeLessThan(
							0.1,
						);
						expect(
							Math.abs(liveFill - stillFill),
							`${cursorCase.name} parity at DPR ${deviceScaleFactor}, zoom ${zoom}`,
						).toBeLessThan(0.02);
						continue;
					}
					expect(
						cellColorError(pixels.live, pixels.still, cursorCase.col, 0),
						`${cursorCase.name} at DPR ${deviceScaleFactor}, zoom ${zoom}`,
					).toBeLessThan(0.08);
				}
				await page.context().close();
			}
		}
	}, 60_000);

	it("renders joined glyphs from the DOM fallback after a required WebGL context loss", async () => {
		const page = await openHarness(1, 1);
		const result = await page.evaluate(async () => {
			const harness = (window as unknown as { __boxHarness: BrowserHarness }).__boxHarness;
			await harness.render("keep", "", false);
			return await harness.loseContext();
		});
		const fallback = decodePng(await page.locator("#term").screenshot());
		await page.context().close();
		expect(result).toMatchObject({ contextLost: true, fallback: true, sameTerminal: true, before: "keep" });
		expect(result.after).toContain("─┼─");
		expect(glyphMask(fallback).reduce((sum, coverage) => sum + coverage, 0)).toBeGreaterThan(1);
		const y = fallback.height / 6;
		expect(hasJoin(fallback, fallback.width / 20, y)).toBe(true);
		expect(hasJoin(fallback, (fallback.width / 20) * 2, y)).toBe(true);
	}, 30_000);
});
