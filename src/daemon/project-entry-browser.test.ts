import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initProject } from "../init";
import { readRegistry } from "../registry";
import { testBrowser } from "../test-browser";
import { builtUi, makeTempDir, serveProject } from "../test-helpers";
import { createSettingsStore } from "./settings";

it("starts a project at once with the Agent pane out, and opens existing work from Open…", {
	timeout: 120_000,
}, async () => {
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	const parent = realpathSync(makeTempDir());
	const shared = join(parent, "shared-project");
	mkdirSync(shared);
	initProject(shared, makeTempDir());
	const sharedCanvas = readFileSync(join(shared, "design", "canvas.json"), "utf8");
	createSettingsStore(project.spoolDir).write("projects.location", parent);
	const browser = await testBrowser();
	const page = await browser.newPage({
		viewport: { width: 1360, height: 900 },
		reducedMotion: "reduce",
		colorScheme: "dark",
	});
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(project.url);
	await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();

	await page.locator(".pj-heading").getByRole("button", { name: "New project", exact: true }).click();
	await page.getByRole("heading", { name: "Your canvas is ready.", exact: true }).waitFor();
	expect(await page.locator("dialog").count()).toBe(0);
	expect(existsSync(join(parent, "untitled", "design", "canvas.json"))).toBe(true);
	// the composer stands ready in the Agent pane, and the person's focus is still theirs
	const composer = page.locator("textarea").first();
	await composer.waitFor();
	expect(await composer.evaluate((element) => element === document.activeElement)).toBe(false);

	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.locator(".pj-heading").getByRole("button", { name: "Open…", exact: true }).click();
	const picker = page.getByRole("dialog", { name: "Choose a project folder", exact: true });
	const search = picker.getByRole("textbox");
	await search.fill(shared);
	await picker.getByRole("button", { name: "Open project", exact: true }).waitFor();
	await search.press("Enter");
	await page.getByRole("button", { name: "Close shared-project", exact: true }).waitFor();
	expect(readRegistry(project.spoolDir).projects.some((item) => item.root === shared)).toBe(true);
	expect(readFileSync(join(shared, "design", "canvas.json"), "utf8")).toBe(sharedCanvas);
	expect(errors).toEqual([]);
});
