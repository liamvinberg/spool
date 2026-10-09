import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeFrame } from "../test-helpers";

/**
 * The canvas window's panes (#359), driven with a real pointer: a toggle in the
 * window bar showing its pane, a pane carried to the other side taking its
 * toggle to the other end of the bar, and a header dragged onto another pane to
 * split with it.
 */

it("toggles a pane from the bar, and remembers it across a reload", { timeout: 120_000 }, async () => {
	const page = await openCanvas();
	const width = () => page.locator('aside[data-side="left"]').evaluate((el) => el.getBoundingClientRect().width);
	const toggle = page.locator('header [data-pane-toggles="left"] [data-pane-toggle="pages"]');
	expect(await toggle.getAttribute("aria-pressed")).toBe("true");
	expect(await width()).toBe(248);

	// the side's only lit pane: turning it off collapses the side to nothing
	await toggle.click();
	expect(await toggle.getAttribute("aria-pressed")).toBe("false");
	await expect.poll(width).toBe(0);
	// the layout is written once it settles, and a reload doesn't wait for that
	await expect
		.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("spool.panes.layout") ?? "null")?.left?.open))
		.toBe(false);

	await page.reload();
	await page.locator("[data-frame-label]").first().waitFor();
	expect(await width()).toBe(0);

	await toggle.click();
	await expect.poll(width).toBe(248);
	expect(await page.locator('[data-pane-slot="pages"] [role="tree"]').isVisible()).toBe(true);
});

it("shows a pane from its toggle, and moves the toggle to the other end with the pane", {
	timeout: 120_000,
}, async () => {
	const page = await openCanvas();
	const toggle = page.locator('[data-pane-toggle="properties"]');
	const shown = () => page.locator('[data-pane-slot="properties"] [data-properties-rail]').isVisible();
	await toggle.click();
	expect(await toggle.getAttribute("aria-pressed")).toBe("false");
	await expect.poll(shown).toBe(false);
	await toggle.click();
	expect(await toggle.getAttribute("aria-pressed")).toBe("true");
	await expect.poll(shown).toBe(true);
	const before = await toggle.boundingBox();
	const tabs = await page.locator('nav[aria-label="Open projects"]').boundingBox();
	if (before === null || tabs === null) throw new Error("no toggle or tabs");
	expect(before.x).toBeGreaterThan(tabs.x + tabs.width);

	await toggle.click({ button: "right" });
	await page.getByRole("menuitem", { name: "Move to the left side" }).click();
	await expect
		.poll(() => page.locator('header [data-pane-toggles="left"] [data-pane-toggle]').evaluateAll(namesOf))
		.toEqual(["pages", "properties"]);
	const after = await toggle.boundingBox();
	if (after === null) throw new Error("no toggle");
	// before Home and the tabs now, and the pane itself stands on the left
	expect(after.x).toBeLessThan(tabs.x);
	expect(await page.locator('aside[data-side="left"] [data-pane-slot="properties"]').count()).toBe(1);
	expect(await toggle.getAttribute("aria-pressed")).toBe("true");
	await expect.poll(shown).toBe(true);
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

	expect(await page.locator('[data-pane-toggles="left"] [data-pane-toggle]').evaluateAll(namesOf)).toEqual([
		"pages",
		"properties",
	]);
	await expect
		.poll(async () => {
			const [top, under] = await Promise.all([box(page, "pages"), box(page, "properties")]);
			return under.x === top.x && under.y >= top.y + top.height - 2 && Math.abs(under.height - top.height) < 4;
		})
		.toBe(true);
	// the right side lost its only lit pane, so it stands collapsed
	expect(await page.locator('aside[data-side="right"]').evaluate((el) => el.getBoundingClientRect().width)).toBe(0);
});

it("moves a pane dragged onto the other side's toggles in the bar", { timeout: 120_000 }, async () => {
	const page = await openCanvas();
	const head = await page.locator('[data-pane-head="properties"]').boundingBox();
	const pages = await page.locator('[data-pane-toggle="pages"]').boundingBox();
	if (head === null || pages === null) throw new Error("no header or toggle");

	await page.mouse.move(head.x + 40, head.y + head.height / 2);
	await page.mouse.down();
	// just past Pages' toggle: after it
	await page.mouse.move(pages.x + pages.width - 2, pages.y + pages.height / 2, { steps: 10 });
	await expect.poll(() => page.locator("[data-pane-outline]").getAttribute("data-slot")).toBe("");
	await page.mouse.up();

	expect(await page.locator('[data-pane-toggles="left"] [data-pane-toggle]').evaluateAll(namesOf)).toEqual([
		"pages",
		"properties",
	]);
	expect(await page.locator('aside[data-side="left"] [data-pane-slot="properties"]').count()).toBe(1);
});

const namesOf = (toggles: Element[]) => toggles.map((toggle) => toggle.getAttribute("data-pane-toggle"));

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
