import { existsSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject } from "../test-helpers";
import { createSettingsStore } from "./settings";

it("creates only on confirmation and opens an existing codebase through the real folder flow", {
	timeout: 120_000,
}, async () => {
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	const parent = realpathSync(makeTempDir());
	const codebase = join(parent, "existing-codebase");
	mkdirSync(join(codebase, "src"), { recursive: true });
	const store = createSettingsStore(project.spoolDir);
	store.write("projects.location", parent);
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage({
		viewport: { width: 1360, height: 900 },
		reducedMotion: "reduce",
		colorScheme: "dark",
	});
	await page.goto(project.url);
	await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
	await page.locator(".pj-heading").getByRole("button", { name: "New project", exact: true }).click();
	const creation = page.getByRole("dialog", { name: "New project", exact: true });
	await creation.waitFor();
	await expect.poll(() => page.locator("input:focus").getAttribute("placeholder")).toBe("Untitled");
	expect(readdirSync(parent)).toEqual(["existing-codebase"]);
	await creation.getByLabel("Name (optional)").fill("coffee");
	await page.evaluate(() => document.fonts.ready);
	const evidence = process.env.SPOOL_ENTRY_EVIDENCE;
	if (evidence) await page.screenshot({ path: join(evidence, "new-project.png") });
	await creation.getByRole("button", { name: "Change…", exact: true }).click();
	const picker = page.getByRole("dialog", { name: "Choose a folder", exact: true });
	await picker.waitFor();
	await expect.poll(() => picker.locator(".pj-location-footer code").getAttribute("title")).toBe(parent);
	await picker.getByRole("button", { name: "Cancel", exact: true }).click();
	expect(await creation.getByLabel("Name (optional)").inputValue()).toBe("coffee");
	await creation.getByRole("button", { name: "Cancel", exact: true }).click();
	expect(existsSync(join(parent, "coffee"))).toBe(false);

	await page.getByRole("button", { name: "New project", exact: true }).first().click();
	await creation.getByLabel("Name (optional)").fill("coffee");
	await creation.getByLabel("Name (optional)").press("Enter");
	await page.getByRole("heading", { name: "Your canvas is ready.", exact: true }).waitFor();
	expect(existsSync(join(parent, "coffee", "design", "canvas.json"))).toBe(true);
	expect(await page.locator("dialog").count()).toBe(0);
	expect(await page.getByRole("button", { name: "Close coffee", exact: true }).count()).toBe(1);

	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.getByRole("button", { name: "Open…", exact: true }).click();
	const open = page.getByRole("dialog", { name: "Open a project or folder", exact: true });
	const search = open.getByRole("textbox");
	await search.fill(codebase);
	await search.press("Enter");
	await expect.poll(() => open.locator(".pj-location-footer code").getAttribute("title")).toBe(codebase);
	await open.getByRole("button", { name: "src", exact: true }).waitFor();
	if (evidence) await page.screenshot({ path: join(evidence, "open-folder.png") });
	await open.getByRole("button", { name: "Open folder", exact: true }).click();
	const setup = page.getByRole("dialog", { name: "Create project here?", exact: true });
	await setup.waitFor();
	expect(existsSync(join(codebase, "design"))).toBe(false);
	await setup.getByRole("button", { name: "Create project here", exact: true }).click();
	await page.getByRole("button", { name: "Close existing-codebase", exact: true }).waitFor();
	expect(existsSync(join(codebase, "design", "canvas.json"))).toBe(true);
	expect(store.read().entries.find((entry) => entry.key === "projects.location")?.value).toBe(parent);

	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.locator(".pj-heading").getByRole("button", { name: "New project", exact: true }).click();
	await creation.getByRole("button", { name: "Create project", exact: true }).click();
	await page.getByRole("button", { name: "Close untitled", exact: true }).waitFor();
	expect(existsSync(join(parent, "untitled", "design", "canvas.json"))).toBe(true);
	await page.getByRole("button", { name: "New project", exact: true }).click();
	await creation.getByLabel("Name (optional)").fill("coffee");
	await creation.getByRole("button", { name: "Create project", exact: true }).click();
	await creation.getByRole("alert").waitFor();
	expect(await creation.getByLabel("Name (optional)").inputValue()).toBe("coffee");
	expect(await creation.getByRole("alert").innerText()).toContain("already exists");
	await page.setViewportSize({ width: 390, height: 844 });
	await creation.getByLabel("Name (optional)").fill("a-long-project-name-that-still-fits-in-the-creation-form");
	expect(await creation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
	if (evidence) await page.screenshot({ path: join(evidence, "new-project-narrow.png") });
});
