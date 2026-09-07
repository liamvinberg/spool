import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const LANDING = `export default function Frame() {
	return <main style={{ background: "#111", color: "white" }}>
		<style>{".body { height: 200px } @media (max-width: 500px) { .body { height: 600px } }"}</style>
		<header style={{ height: 100 }}>Landing</header>
		<section className="body">Responsive content</section>
		<footer style={{ height: 100 }}>The bottom</footer>
		<aside style={{ position: "fixed", bottom: 0, height: 1000, pointerEvents: "none" }}>Overlay</aside>
	</main>;
}`;

it("resizes a tiny frame live, snaps to its content, and prepares the next picture while selected", {
	timeout: 120_000,
}, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "landing", LANDING);
	writeDesignFile(project.root, "frames/landing/frame.json", JSON.stringify({ x: 0, y: 0, w: 800, h: 800 }));
	writeDesignFile(project.root, ".spool/state.json", JSON.stringify({ camera: { x: 100, y: 120, k: 0.3 } }));
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const iframe = page.locator('iframe[title="landing"]');
	const coverHash = async (): Promise<string | undefined> => {
		const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/frames`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		const body = (await response.json()) as { frames: { name: string; cover?: { hash: string } }[] };
		return body.frames.find((frame) => frame.name === "landing")?.cover?.hash;
	};
	await expect.poll(coverHash, { timeout: 30_000 }).toBeDefined();
	await expect.poll(() => iframe.count()).toBe(0);
	await page.locator('[data-frame-label="landing"]').click();
	await expect.poll(() => iframe.count()).toBe(1);
	await expect.poll(() => page.frameLocator('iframe[title="landing"]').locator("footer").count()).toBe(1);
	await expect
		.poll(() => iframe.evaluate((el) => getComputedStyle(el.parentElement ?? el).visibility))
		.toBe("visible");

	const drag = async (
		handle: string,
		dx: number,
		dy: number,
		expected: { width: number; height: number },
	): Promise<void> => {
		const knob = await page.locator(`[data-handle="${handle}"]`).boundingBox();
		const box = await iframe.boundingBox();
		if (knob === null || box === null) throw new Error("resize handle missing");
		const from = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		// The measurement is one message hop into the live document and back.
		await page.waitForTimeout(100);
		await page.mouse.move(
			handle.includes("e") ? box.x + box.width + dx * 0.3 : from.x,
			handle.includes("s") ? box.y + box.height + dy * 0.3 : from.y,
		);
		await expect
			.poll(() => iframe.evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight })))
			.toEqual(expected);
		await expect
			.poll(() => iframe.evaluate((el) => getComputedStyle(el.parentElement ?? el).visibility))
			.toBe("visible");
		await page.mouse.up();
	};
	const before = await coverHash();
	// Five frame pixels past the footer is still inside the magnetic catch.
	await drag("s", 0, -395, { width: 800, height: 400 });
	const releasedAt = performance.now();
	await expect
		.poll(
			async () => {
				const hash = await coverHash();
				return hash !== undefined && hash !== before;
			},
			{ timeout: 5000 },
		)
		.toBe(true);
	console.info(`resize thumbnail ready after ${Math.round(performance.now() - releasedAt)} ms`);
	// It catches again when the frame already fits its content exactly.
	await drag("s", 0, 5, { width: 800, height: 400 });
	// Pulling farther breaks the catch and leaves deliberate empty space.
	await drag("s", 0, 150, { width: 800, height: 550 });
	// Width changes reflow the real page; its footer now ends at 800.
	await drag("e", -400, 0, { width: 400, height: 550 });
	await drag("s", 0, 245, { width: 400, height: 800 });
	// A cancelled gesture restores the size and drops the measurement.
	const knob = await page.locator('[data-handle="s"]').boundingBox();
	if (knob === null) throw new Error("resize handle missing");
	await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
	await page.mouse.down();
	await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2 + 100);
	await page.keyboard.press("Escape");
	await page.mouse.up();
	await expect.poll(() => iframe.evaluate((el) => el.clientHeight)).toBe(800);

	// An internal scrolling panel ends at its own box, not its hidden contents.
	const main = page.frameLocator('iframe[title="landing"]').locator("main");
	await main.evaluate((el) => {
		el.innerHTML =
			'<section style="height:300px;overflow:auto"><div style="height:1200px">Scrollable</div></section>';
	});
	await drag("s", 0, -495, { width: 400, height: 300 });
	// A viewport-filling app has no independent content bottom.
	await main.evaluate((el) => {
		el.replaceChildren();
		el.style.height = "100%";
	});
	await drag("s", 0, 5, { width: 400, height: 305 });
});
