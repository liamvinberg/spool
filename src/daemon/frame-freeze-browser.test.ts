import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

// The freeze end to end (#171): a real canvas, a real sandboxed frame document,
// and a real wheel pan. The shim's rAF gate and the canvas's gesture window are
// each covered on their own; what only a browser can show is that the two meet
// across the iframe boundary — that a frame animating at speed stops counting
// while the camera moves, and picks up again once it stops.

/**
 * A loop that counts its own animation frames onto the frame's own window. The
 * lookup is `view.requestAnimationFrame` at call time on purpose: a destructured
 * reference would be the native one, which the shim's gate never sees.
 */
const spinner = `export default function Frame() {
	return (
		<p
			ref={(el) => {
				if (el === null) return;
				const view = el.ownerDocument.defaultView;
				if (view === null || view.spun !== undefined) return;
				view.spun = 0;
				const loop = () => {
					view.spun++;
					view.requestAnimationFrame(loop);
				};
				view.requestAnimationFrame(loop);
			}}
		>
			spinning
		</p>
	);
}
`;

it("holds a live frame's animation while the camera moves, and lets it go after", { timeout: 180_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });

	writeFrame(project.root, "spin", spinner);
	// wide enough to read at k=1, and it stays inside the ring across the pan
	writeDesignFile(project.root, "frames/spin/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 700 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	const spun = () =>
		page
			.frameLocator('iframe[title="spin"]')
			.locator("p")
			.evaluate((el) => (el.ownerDocument.defaultView as unknown as { spun?: number }).spun ?? -1);

	// the loop is really running before anything is asked of it
	await expect.poll(spun, { timeout: 30_000 }).toBeGreaterThan(4);

	await page.mouse.move(640, 450);
	// a wheel event every 40ms outlasts the canvas's 100ms settle, so the camera
	// is still moving for the whole window sampled below
	const panning = (async () => {
		for (let i = 0; i < 20; i++) {
			await page.mouse.wheel(0, 10);
			await page.waitForTimeout(40);
		}
	})();

	let atFreeze: number;
	let held: number;
	try {
		await page.waitForTimeout(250);
		atFreeze = await spun();
		await page.waitForTimeout(300);
		held = await spun();
	} finally {
		// the pan outlives a failed assertion; leaving it running closes the page
		// out from under it and buries the failure in an unhandled rejection
		await panning.catch(() => undefined);
	}

	expect(held, "a frame animating under a moving camera runs no frames").toBe(atFreeze);
	await expect.poll(spun, { timeout: 10_000 }).toBeGreaterThan(atFreeze + 4);
});
