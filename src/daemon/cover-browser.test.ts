import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { type Browser, chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const FRAME_W = 390;
const FRAME_H = 844;
const DEVICE_WIDTH = 800;
const DEVICE_HEIGHT = Math.round((FRAME_H / FRAME_W) * DEVICE_WIDTH);

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function png(width: number, height: number): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const header = Buffer.alloc(8);
		header.writeUInt32BE(data.length, 0);
		header.write(type, 4);
		const checksum = Buffer.alloc(4);
		checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 0);
		return Buffer.concat([header, data, checksum]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 2;
	const rows = Buffer.alloc((width * 3 + 1) * height);
	for (let row = 0; row < height; row += 1) rows[row * (width * 3 + 1)] = 0;
	return Buffer.concat([
		Buffer.from("89504e470d0a1a0a", "hex"),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(rows)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

async function launchBrowser(): Promise<Browser | undefined> {
	try {
		return await chromium.launch({ channel: "chromium", headless: true });
	} catch {
		try {
			return await chromium.launch({ headless: true });
		} catch {
			return undefined;
		}
	}
}

it("draws one 2× portrait image below the live threshold", { timeout: 120_000 }, async () => {
	const browser = await launchBrowser();
	if (browser === undefined) return;
	onTestFinished(() => browser.close());

	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "covered", "export default function Frame() { return <main>cover me</main>; }");
	writeDesignFile(
		project.root,
		"frames/covered/frame.json",
		`${JSON.stringify({ x: 0, y: 0, w: FRAME_W, h: FRAME_H })}\n`,
	);
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const control = { "content-type": "application/json", "X-Spool-Control": project.controlToken };
	const body = new FormData();
	body.append("cover", new Blob([new Uint8Array(png(DEVICE_WIDTH, DEVICE_HEIGHT))], { type: "image/png" }));
	const stored = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/thumbs/covered`, {
		method: "PUT",
		headers: { "X-Spool-Control": project.controlToken },
		body,
	});
	expect(stored.status).toBe(200);
	const cover = (await stored.json()) as { hash: string };
	const state = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/state`, {
		method: "PUT",
		headers: control,
		body: JSON.stringify({ camera: { x: 40, y: 40, k: 1 } }),
	});
	expect(state.status).toBe(204);

	const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
	onTestFinished(() => context.close());
	const page = await context.newPage();
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const image = page.locator('[data-frame-cover="covered"] img');
	await image.waitFor({ state: "visible", timeout: 30_000 });
	await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(DEVICE_WIDTH);
	expect(await image.getAttribute("src")).toBe(`/covers/${project.name}/covered/${cover.hash}`);
	expect(await image.getAttribute("srcset")).toBeNull();
	expect(await image.getAttribute("sizes")).toBeNull();
	expect(await image.evaluate((node) => node.getBoundingClientRect().width)).toBe(FRAME_W);
	expect(DEVICE_WIDTH).toBeGreaterThanOrEqual(FRAME_W * 2);
});
