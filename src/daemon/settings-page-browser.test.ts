import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeFrame } from "../test-helpers";

/**
 * Settings as a page (#282) in the served canvas: ⌘, puts it in place of the
 * project's canvas under the window bar, its sections lead with the project,
 * a project setting lands in the project's file, and esc gives back the very
 * canvas it stood in for, where it was; from Home there is no project section.
 */
it("stands in for the tab and gives it back as it was", { timeout: 120_000 }, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "home", "export default () => <h1>Home</h1>");
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const canvas = page.getByRole("application", { name: `${project.name} canvas`, exact: true });
	const label = page.locator("[data-frame-label]").first();
	await label.waitFor();
	await canvas.evaluate((element) => {
		(element as HTMLElement & { kept?: boolean }).kept = true;
	});
	const was = await label.boundingBox();

	const settings = page.getByRole("region", { name: "Settings", exact: true });
	const sections = () =>
		settings.locator("[data-section]").evaluateAll((items) => items.map((item) => item.getAttribute("data-section")));
	await page.keyboard.press("ControlOrMeta+Comma");
	await settings.waitFor();
	expect(await sections()).toEqual(["project", "machine", "appearance", "colours"]);
	const behind = () => canvas.evaluate((element) => element.closest("[inert]") !== null);
	expect(await behind()).toBe(true);
	// under the real window bar, not over it
	const bar = await page.getByRole("button", { name: "Settings", exact: true }).boundingBox();
	const region = await settings.boundingBox();
	expect(bar).not.toBeNull();
	expect(region?.y).toBeGreaterThanOrEqual((bar?.y ?? 0) + (bar?.height ?? 0));

	await settings.locator('[data-section="project"]').click();
	const history = settings.getByRole("switch", { name: "History" });
	await history.click({ force: true });
	await expect.poll(() => history.getAttribute("aria-checked")).toBe("true");
	await expect
		.poll(() => readFileSync(join(project.root, "design", "canvas.json"), "utf8"))
		.toContain('"history": true');

	await page.keyboard.press("Escape");
	await expect.poll(() => settings.count()).toBe(0);
	expect(await behind()).toBe(false);
	expect(await canvas.evaluate((element) => (element as HTMLElement & { kept?: boolean }).kept)).toBe(true);
	expect(await label.boundingBox()).toEqual(was);
	expect(new URL(page.url()).pathname).toBe(`/p/${encodeURIComponent(project.name)}`);

	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.getByRole("navigation", { name: "Home actions" }).getByRole("button", { name: "Settings" }).click();
	await settings.waitFor();
	expect(await sections()).toEqual(["machine", "appearance", "colours"]);
	await settings.getByRole("button", { name: "Back to Home" }).click();
	await expect.poll(() => settings.count()).toBe(0);
	await page.getByRole("heading", { name: "Projects" }).waitFor();
});
