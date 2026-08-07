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

/** How long the slow frame's entrance runs, inside the shim's own settle budget. */
const ENTRY_MS = 500;
/**
 * The outer bound the never-quiet frame is held to, generously above the design
 * one — the shim's 900 ms settle cap, and ARRIVE_DEADLINE_MS in
 * `ui/canvas/lifecycle.ts` behind it. What it asserts is that the wait ends.
 */
const REVEAL_CEILING_MS = 5000;

/**
 * A frame whose content animates in over half a second, reporting the wall clock
 * at which that entrance finished. The Web Animations API rather than a keyframe
 * rule because it is the same thing `document.getAnimations()` reports to the
 * shim's settle, and it says exactly when it ended.
 */
const slowEntrance = `export default function Frame() {
	return (
		<main
			ref={(el) => {
				if (el === null) return;
				const view = el.ownerDocument.defaultView;
				if (view === null || view.entryStartedAt !== undefined) return;
				view.entryStartedAt = Date.now();
				el.animate([{ opacity: 0 }, { opacity: 1 }], ${ENTRY_MS}).finished.then(() => {
					view.entryEndedAt = Date.now();
				});
			}}
		>
			slow entrance
		</main>
	);
}
`;

/** A frame that never goes quiet: every animation frame writes the DOM again. */
const neverQuiet = `export default function Frame() {
	return (
		<p
			ref={(el) => {
				if (el === null) return;
				const view = el.ownerDocument.defaultView;
				if (view === null || view.ticks !== undefined) return;
				view.ticks = 0;
				view.bootedAt = Date.now();
				const loop = () => {
					view.ticks++;
					el.textContent = "tick " + view.ticks;
					view.requestAnimationFrame(loop);
				};
				view.requestAnimationFrame(loop);
			}}
		/>
	);
}
`;

/**
 * Records the wall clock at which each named cover starts fading — the first
 * animation frame on which it is no longer fully opaque, or is gone outright. A
 * cover it has never seen cannot have faded, so a frame still standing as its
 * own picture never reads as a reveal.
 */
const watchCovers = `(() => {
	const faded = {};
	const seen = new Set();
	window.__coverFade = faded;
	const tick = () => {
		for (const name of ["slow", "busy"]) {
			const el = document.querySelector('[data-frame-cover="' + name + '"]');
			if (el !== null) {
				seen.add(name);
				if (faded[name] === undefined && Number(getComputedStyle(el).opacity) < 1) faded[name] = Date.now();
			} else if (seen.has(name) && faded[name] === undefined) {
				faded[name] = Date.now();
			}
		}
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
})();`;

it("holds a promoted frame's cover through its entrance, and lets go at the bound", { timeout: 180_000 }, async () => {
	const browser = await launchBrowser();
	if (browser === undefined) return;
	onTestFinished(() => browser.close());

	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "slow", slowEntrance);
	writeFrame(project.root, "busy", neverQuiet);
	// large enough to read at k=1, so the camera promotes both without entering either
	writeDesignFile(project.root, "frames/slow/frame.json", '{ "x": 0, "y": 0, "w": 500, "h": 500 }\n');
	writeDesignFile(project.root, "frames/busy/frame.json", '{ "x": 560, "y": 0, "w": 500, "h": 500 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 40, y: 40, k: 1 } })}\n`);

	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	// a real still to stand in front of each frame: the seam is a settled picture
	// swapped for a booting document, not a placeholder swapped for one
	for (const frame of ["slow", "busy"]) {
		const body = new FormData();
		body.append("cover", new Blob([new Uint8Array(png(500, 500))], { type: "image/png" }));
		const stored = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/thumbs/${frame}`, {
			method: "PUT",
			headers: { "X-Spool-Control": project.controlToken },
			body,
		});
		expect(stored.status).toBe(200);
	}

	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await page.addInitScript(watchCovers);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	const fadedAt = (name: string) =>
		page.evaluate(
			(frame) => (window as unknown as { __coverFade: Record<string, number> }).__coverFade[frame] ?? 0,
			name,
		);
	const inFrame = (frame: string, selector: string, key: string) =>
		page
			.frameLocator(`iframe[title="${frame}"]`)
			.locator(selector)
			.evaluate((el, name) => (el.ownerDocument.defaultView as unknown as Record<string, number>)[name] ?? 0, key);

	// The seam (#177): the cover fades onto a frame that has finished arriving, so
	// it stays opaque for the whole of the entrance. Fading at loaded lands it a
	// full ENTRY_MS early, on the first frame of an animation whose end is what
	// the still it is replacing photographed.
	// the entrance first, then the reveal — the watcher stamped whenever the cover
	// let go, including well before this, which is the failure being ruled out
	await expect.poll(() => inFrame("slow", "main", "entryEndedAt"), { timeout: 60_000 }).toBeGreaterThan(0);
	const entryEnded = await inFrame("slow", "main", "entryEndedAt");
	await expect.poll(() => fadedAt("slow"), { timeout: 60_000 }).toBeGreaterThan(0);
	expect(await fadedAt("slow"), "the cover outlived the entrance").toBeGreaterThanOrEqual(entryEnded);

	// The bound: a frame that never goes quiet is revealed anyway. Its rAF loop
	// rewrites the DOM every frame, so no settle of any length finds it still —
	// and it is still writing when its cover lets go.
	await expect.poll(() => fadedAt("busy"), { timeout: 60_000 }).toBeGreaterThan(0);
	const booted = await inFrame("busy", "p", "bootedAt");
	expect(booted, "the loop really ran").toBeGreaterThan(0);
	expect((await fadedAt("busy")) - booted, "a frame that never settles reveals anyway").toBeLessThan(
		REVEAL_CEILING_MS,
	);
	const ticks = await inFrame("busy", "p", "ticks");
	await expect.poll(() => inFrame("busy", "p", "ticks"), { timeout: 10_000 }).toBeGreaterThan(ticks);
});
