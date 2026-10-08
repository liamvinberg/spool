import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeFrame } from "../test-helpers";

/**
 * The canvas window's panes (#359), driven with a real pointer: a rail icon
 * toggling its pane, and a header dragged onto another pane to split with it.
 */

it("toggles a pane from its rail icon, and remembers it across a reload", { timeout: 120_000 }, async () => {
	const page = await openCanvas();
	const width = () => page.locator('aside[data-side="left"]').evaluate((el) => el.getBoundingClientRect().width);
	const icon = page.locator('[data-rail-icon="pages"]');
	expect(await icon.getAttribute("aria-pressed")).toBe("true");
	expect(await width()).toBe(44 + 248);

	// the side's only lit pane: turning it off collapses the side to its rail
	await icon.click();
	expect(await icon.getAttribute("aria-pressed")).toBe("false");
	await expect.poll(width).toBe(44);
	// the layout is written once it settles, and a reload doesn't wait for that
	await expect
		.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("spool.panes.layout") ?? "null")?.left?.open))
		.toBe(false);

	await page.reload();
	await page.locator("[data-frame-label]").first().waitFor();
	expect(await width()).toBe(44);

	await icon.click();
	await expect.poll(width).toBe(44 + 248);
	expect(await page.locator('[data-pane-slot="pages"] [role="tree"]').isVisible()).toBe(true);
});

it("splits a pane dropped on the bottom half of another; Esc sends a drag home", { timeout: 120_000 }, async () => {
	const page = await openCanvas();
	const pages = await box(page, "pages");
	const head = page.locator('[data-pane-head="properties"]');
	const from = await head.boundingBox();
	if (from === null) throw new Error("no properties header");

	// Esc mid-drag: nothing moves
	await page.mouse.move(from.x + 40, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(pages.x + pages.width / 2, pages.y + pages.height * 0.75, { steps: 8 });
	await expect
		.poll(() => page.locator("[data-pane-outline]").evaluate((el) => getComputedStyle(el).opacity))
		.toBe("1");
	await page.keyboard.press("Escape");
	await page.mouse.up();
	expect(await page.locator('[data-side="left"] [data-pane-slot="properties"]').count()).toBe(0);

	await page.mouse.move(from.x + 40, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(pages.x + pages.width / 2, pages.y + pages.height * 0.75, { steps: 8 });
	await page.mouse.up();

	const rail = await page
		.locator('[data-rail="left"] [data-rail-icon]')
		.evaluateAll((icons) => icons.map((icon) => icon.getAttribute("data-rail-icon")));
	expect(rail).toEqual(["pages", "properties"]);
	await expect
		.poll(async () => {
			const [top, under] = await Promise.all([box(page, "pages"), box(page, "properties")]);
			return under.x === top.x && under.y >= top.y + top.height - 2 && Math.abs(under.height - top.height) < 4;
		})
		.toBe(true);
	// the right side lost its only lit pane, so it stands collapsed to its rail
	expect(await page.locator('aside[data-side="right"]').evaluate((el) => el.getBoundingClientRect().width)).toBe(44);
});

async function openCanvas(): Promise<Page> {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "home", "export default () => <h1>Home</h1>");
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator("[data-frame-label]").first().waitFor();
	return page;
}

async function box(page: Page, pane: string) {
	const found = await page.locator(`[data-pane-slot="${pane}"]`).boundingBox();
	if (found === null) throw new Error(`no ${pane} pane`);
	return found;
}
