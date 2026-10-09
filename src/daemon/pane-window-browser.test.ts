import type { Page } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeFrame } from "../test-helpers";

/**
 * The canvas window's panes (#359), driven with a real pointer: a tab showing
 * its pane, a tab dragged onto a pane's body splitting the side, a side closing
 * to its rail and a rail icon opening it on that pane, and the window bar being
 * the same on Home and on a canvas.
 */

it("switches the pane a tab is clicked for, and keeps the side's width", { timeout: 120_000 }, async () => {
	const { page } = await openCanvas();
	const properties = page.locator('[data-pane-tab="properties"]');
	const agent = page.locator('[data-pane-tab="agent"]');
	expect(await properties.getAttribute("aria-selected")).toBe("true");
	expect(await agent.getAttribute("aria-selected")).toBe("false");
	const before = await sideWidth(page, "right");

	await agent.click();
	expect(await agent.getAttribute("aria-selected")).toBe("true");
	await expect.poll(() => page.locator("[data-agent-rail] textarea").isVisible()).toBe(true);
	expect(await page.locator("[data-properties-rail]").isVisible()).toBe(false);
	expect(await sideWidth(page, "right")).toBe(before);

	// and it is kept: a reload comes back on the Agent tab
	await expect
		.poll(() =>
			page.evaluate(
				() => JSON.parse(localStorage.getItem("spool.panes.layout") ?? "null")?.right?.groups?.[0]?.active,
			),
		)
		.toBe("agent");
	await page.reload();
	await page.locator("[data-frame-label]").first().waitFor();
	expect(await agent.getAttribute("aria-selected")).toBe("true");
});

it("splits Properties when Agent is dropped on the bottom half of its body; Esc sends a drag home", {
	timeout: 120_000,
}, async () => {
	const { page } = await openCanvas();
	const from = await page.locator('[data-pane-tab="agent"]').boundingBox();
	const body = await page.locator('[data-drop-body="right:0"]').boundingBox();
	if (from === null || body === null) throw new Error("no Agent tab or Properties body");
	const target = { x: body.x + body.width / 2, y: body.y + body.height * 0.75 };
	const mark = page.locator("[data-pane-drop]");

	// Esc mid-drag: nothing moves
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(target.x, target.y, { steps: 8 });
	await expect.poll(() => mark.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
	expect(await mark.getAttribute("data-line")).toBeNull();
	await page.keyboard.press("Escape");
	await page.mouse.up();
	expect(await groupTabs(page, "right:0")).toEqual(["properties", "agent"]);
	expect(await page.locator('[data-pane-group="right:1"]').count()).toBe(0);

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(target.x, target.y, { steps: 8 });
	await page.mouse.up();

	await expect.poll(() => groupTabs(page, "right:1")).toEqual(["agent"]);
	expect(await groupTabs(page, "right:0")).toEqual(["properties"]);
	// both stand, Properties above and Agent under it, each the side's full width
	await expect
		.poll(async () => {
			const [top, under] = await Promise.all([box(page, "properties"), box(page, "agent")]);
			return under.x === top.x && under.width === top.width && under.y >= top.y + top.height - 2;
		})
		.toBe(true);
	expect(await page.locator("[data-properties-rail]").isVisible()).toBe(true);
	expect(await page.locator("[data-agent-rail] textarea").isVisible()).toBe(true);
});

it("closes a side to its rail of icons, and an icon opens it again on that pane", { timeout: 120_000 }, async () => {
	const { page } = await openCanvas();
	const rail = page.locator('[data-side-rail="right"]');
	await page.locator('[data-side-close="right"]').click();
	await expect.poll(() => sideWidth(page, "right")).toBe(40);
	await expect.poll(() => rail.isVisible()).toBe(true);
	expect(await rail.locator("[data-rail-icon]").evaluateAll(railNames)).toEqual(["properties", "agent"]);
	expect(await page.locator("[data-properties-rail]").isVisible()).toBe(false);

	await page.locator('[data-rail-icon="agent"]').click();
	await expect.poll(() => sideWidth(page, "right")).toBe(380);
	expect(await page.locator('[data-pane-tab="agent"]').getAttribute("aria-selected")).toBe("true");
	await expect.poll(() => page.locator("[data-agent-rail] textarea").isVisible()).toBe(true);
	await expect.poll(() => rail.isVisible()).toBe(false);

	// ⌘B closes the left side the same way, and a side closed stays closed across a reload
	await page.locator("[data-canvas-camera]").click({ position: { x: 5, y: 5 }, force: true });
	await page.keyboard.press("ControlOrMeta+b");
	await expect.poll(() => sideWidth(page, "left")).toBe(40);
	await expect
		.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("spool.panes.layout") ?? "null")?.left?.open))
		.toBe(false);
	await page.reload();
	await page.locator("[data-frame-label]").first().waitFor();
	expect(await sideWidth(page, "left")).toBe(40);
	expect(await page.locator('[data-side-rail="left"] [data-rail-icon]').evaluateAll(railNames)).toEqual(["pages"]);
});

it("draws the same window bar on Home and on a canvas", { timeout: 120_000 }, async () => {
	const { page } = await openCanvas();
	const items = () =>
		page.locator("header.app-header").evaluate((header) =>
			[...header.querySelectorAll<HTMLElement>("button, a")]
				.filter((element) => element.getBoundingClientRect().width > 0)
				.map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "")
				// the project's own tab names itself; what matters is that it stands in the same place
				.map((label) => (label.startsWith("Close ") ? "Close" : label)),
		);
	const onCanvas = await items();
	expect(onCanvas).toContain("Help");
	expect(onCanvas).toContain("Settings");
	expect(await page.locator("header.app-header [data-pane-tab], header.app-header [data-rail-icon]").count()).toBe(0);

	await page.locator("header.app-header button.app-home").click();
	await expect.poll(() => page.locator("header.app-header button.app-home").getAttribute("aria-current")).toBe("page");
	expect(await items()).toEqual(onCanvas);
	const end = async () => {
		const settings = await page
			.locator("header.app-header")
			.getByRole("button", { name: "Settings", exact: true })
			.boundingBox();
		return settings === null ? null : Math.round(settings.x);
	};
	const onHome = await end();
	await page.locator(".project-tab-label").first().click();
	await page.locator("[data-frame-label]").first().waitFor();
	expect(await end()).toBe(onHome);
});

const railNames = (icons: Element[]) => icons.map((icon) => icon.getAttribute("data-rail-icon"));

const groupTabs = (page: Page, group: string) =>
	page
		.locator(`[data-pane-group="${group}"] [data-pane-tab]`)
		.evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("data-pane-tab")));

const sideWidth = (page: Page, side: "left" | "right") =>
	page.locator(`aside[data-side="${side}"]`).evaluate((el) => Math.round(el.getBoundingClientRect().width));

async function openCanvas(): Promise<{ page: Page }> {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "home", "export default () => <h1>Home</h1>");
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator("[data-frame-label]").first().waitFor();
	return { page };
}

async function box(page: Page, pane: string) {
	const found = await page.locator(`[data-pane-slot="${pane}"]`).boundingBox();
	if (found === null) throw new Error(`no ${pane} pane`);
	return found;
}
