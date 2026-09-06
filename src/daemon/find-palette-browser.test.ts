import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

it("scrolls the finder without moving the canvas underneath", { timeout: 180_000 }, async () => {
	const { page, finder, camera } = await openFinder();
	const list = finder.locator(".overflow-y-auto");
	const resting = await camera();
	expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

	await list.hover();
	await page.mouse.wheel(0, 180);
	await expect.poll(() => list.evaluate((el) => el.scrollTop), { timeout: 1000 }).toBeGreaterThan(0);
	expect(await camera()).toBe(resting);
});

it("lands on a finder row when clicked and still accepts keyboard navigation", { timeout: 180_000 }, async () => {
	const { page, finder } = await openFinder();
	const input = finder.getByRole("textbox", { name: "Find a frame" });
	await input.fill("frame-10");
	await finder.locator("[data-at]").click();
	await expect.poll(() => finder.count(), { timeout: 1000 }).toBe(0);
	expect(await page.locator('[role="treeitem"][aria-selected="true"]').innerText()).toContain("frame-10");

	await page.keyboard.press("/");
	await input.fill("frame-0");
	await input.press("ArrowDown");
	const picked = await finder.locator("[data-at].bg-raised").innerText();
	await input.press("Enter");
	await expect.poll(() => finder.count()).toBe(0);
	const selected = await page.locator('[role="treeitem"][aria-selected="true"]').innerText();
	expect(picked).toContain(selected.trim());
});

it("keeps drags and backdrop scrolling out of the canvas until the finder closes", { timeout: 180_000 }, async () => {
	const { page, finder, camera } = await openFinder();
	const resting = await camera();
	await finder.locator('[data-at="3"]').hover();
	await page.mouse.down({ button: "middle" });
	await page.mouse.move(700, 400, { steps: 4 });
	await page.mouse.up({ button: "middle" });
	expect(await camera()).toBe(resting);

	const backdrop = page.getByRole("button", { name: "Close the finder" });
	await backdrop.hover({ position: { x: 20, y: 20 } });
	// Wait for the wheel to be delivered before checking that it did nothing.
	await Promise.all([
		page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					window.addEventListener("wheel", () => requestAnimationFrame(() => resolve()), { once: true }),
				),
		),
		page.mouse.wheel(0, 180),
	]);
	expect(await camera()).toBe(resting);
	await backdrop.click({ position: { x: 20, y: 20 } });
	await expect.poll(() => finder.count()).toBe(0);
	await page.mouse.wheel(0, 180);
	await expect.poll(camera).not.toBe(resting);
});

async function openFinder() {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	for (let index = 0; index < 11; index++) {
		const name = `frame-${String(index).padStart(2, "0")}`;
		writeFrame(project.root, name, "export default function Frame() { return <div />; }\n");
		writeDesignFile(
			project.root,
			`frames/${name}/frame.json`,
			JSON.stringify({ x: index * 400, y: 0, w: 320, h: 200 }),
		);
	}
	writeDesignFile(project.root, ".spool/state.json", JSON.stringify({ camera: { x: 60, y: 60, k: 1 } }));
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const canvas = page.getByRole("application");
	await page.locator("[data-frame-label]").first().waitFor();
	await canvas.focus();
	await page.keyboard.press("/");
	const finder = page.getByRole("dialog", { name: "Find a frame" });
	await finder.waitFor();
	const camera = () => page.locator("[data-canvas-camera]").evaluate((el) => el.getAttribute("style"));
	return { page, finder, camera };
}
