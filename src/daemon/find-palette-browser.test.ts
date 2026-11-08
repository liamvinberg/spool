import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

it("opens from its door, lands on a row when clicked and still accepts keyboard navigation", {
	timeout: 180_000,
}, async () => {
	const { page, finder } = await openFinder();
	const input = finder.getByRole("textbox", { name: "Find a frame" });
	await input.fill("frame-10");
	await finder.locator("[data-at]").click();
	await expect.poll(() => finder.count(), { timeout: 1000 }).toBe(0);
	expect(await page.locator('[role="treeitem"][aria-selected="true"]').innerText()).toContain("frame-10");

	// the door at the end of the path, which comes up as the pointer nears the top edge, opens it too
	const path = await page.locator("[data-page-path]").boundingBox();
	await page.mouse.move((path?.x ?? 0) + 20, (path?.y ?? 0) + 60);
	await page.locator("[data-find-door]").click();
	await input.fill("frame-0");
	await input.press("ArrowDown");
	const picked = await finder.locator("[data-at].bg-state-selected-strong").innerText();
	await input.press("Enter");
	await expect.poll(() => finder.count()).toBe(0);
	const selected = await page.locator('[role="treeitem"][aria-selected="true"]').innerText();
	expect(picked).toContain(selected.trim());
});

it("scrolls the finder, and keeps wheels, drags and backdrop scrolling out of the canvas until it closes", {
	timeout: 180_000,
}, async () => {
	const { page, finder, camera } = await openFinder();
	const list = finder.locator(".overflow-y-auto");
	const resting = await camera();
	expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

	await list.hover();
	await page.mouse.wheel(0, 180);
	await expect.poll(() => list.evaluate((el) => el.scrollTop), { timeout: 1000 }).toBeGreaterThan(0);
	expect(await camera()).toBe(resting);

	await finder.locator('[data-at="3"]').hover();
	await page.mouse.down({ button: "middle" });
	await page.mouse.move(700, 400, { steps: 4 });
	await page.mouse.up({ button: "middle" });
	expect(await camera()).toBe(resting);

	const backdrop = page.getByRole("button", { name: "Close the finder" });
	// the finder stands at the top left, under the path, so the backdrop's own corner is the bottom left
	const area = await backdrop.boundingBox();
	const corner = { x: 20, y: (area?.height ?? 0) - 120 };
	await backdrop.hover({ position: corner });
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
	await backdrop.click({ position: corner });
	await expect.poll(() => finder.count()).toBe(0);
	await page.mouse.wheel(0, 180);
	await expect.poll(camera).not.toBe(resting);
});

async function openFinder() {
	const browser = await testBrowser();
	const uiDir = await builtUi();
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
