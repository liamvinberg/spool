import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * Inline play in a real browser (#210). Two things only a real one can show:
 * where the keyboard went, and what the flight actually covers.
 *
 * The chord that leaves is forwarded from inside the player's own document, so
 * it only ever arrives if focus really moved there — and `focus()` on an inert
 * element is silently a no-op, which no fake DOM reproduces. The flight has to
 * cross the top bar and the rails, which means the canvas leaving its own box,
 * which is a layout fact and not a state one.
 */

const plain = (label: string) => `export default function Frame() {
	return <div>${label}</div>;
}
`;

/** A canvas with one frame, served and built, ready to be played. */
async function canvasWithOneFrame() {
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "one", plain("one"));
	writeDesignFile(project.root, "frames/one/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 700 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	return project;
}

it("hands the keyboard to the player, and takes the chord that leaves", { timeout: 180_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await canvasWithOneFrame();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	await page.locator('[role="application"]').click({ position: { x: 300, y: 300 } });
	await page.keyboard.press("p");

	const player = page.locator('iframe[src*="handoff"]');
	await expect.poll(() => player.evaluate((el) => el.hasAttribute("inert")), { timeout: 30_000 }).toBe(false);

	// The stage is up, so the player holds focus — every plain key a prototype
	// takes now reaches it, and the chord it does not take is forwarded back.
	await expect.poll(() => page.evaluate(() => document.activeElement?.tagName), { timeout: 5_000 }).toBe("IFRAME");

	await page.keyboard.press(process.platform === "darwin" ? "Meta+Escape" : "Control+Escape");
	await expect.poll(() => player.count(), { timeout: 10_000 }).toBe(0);
});

it("flies across the top bar and the rails rather than under them", { timeout: 180_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const project = await canvasWithOneFrame();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	const canvas = page.locator('[role="application"]');
	const boxed = await canvas.boundingBox();
	// it starts inset by the chrome around it, which is the whole problem
	expect(boxed?.x).toBeGreaterThan(0);
	expect(boxed?.y).toBeGreaterThan(0);

	await canvas.click({ position: { x: 300, y: 300 } });
	await page.keyboard.press("p");

	// and gives that inset up for the flight, so the zoom has the window to grow
	// into and the furniture fades off it rather than clipping it
	await expect.poll(async () => (await canvas.boundingBox())?.x, { timeout: 5_000 }).toBe(0);
	const spanning = await canvas.boundingBox();
	expect(spanning).toMatchObject({ x: 0, y: 0, width: 1280, height: 900 });
	await expect
		.poll(() => page.locator("header").evaluate((el) => getComputedStyle(el).opacity), { timeout: 5_000 })
		.toBe("0");

	// and takes it back once it is home again
	await page.keyboard.press(process.platform === "darwin" ? "Meta+Escape" : "Control+Escape");
	await expect.poll(async () => (await canvas.boundingBox())?.x, { timeout: 10_000 }).toBe(boxed?.x);
	await expect
		.poll(() => page.locator("header").evaluate((el) => getComputedStyle(el).opacity), { timeout: 5_000 })
		.toBe("1");
});
