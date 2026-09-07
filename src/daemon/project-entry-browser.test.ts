import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { initProject } from "../init";
import { readRegistry } from "../registry";
import { makeTempDir, serveProject } from "../test-helpers";
import { createSettingsStore } from "./settings";

it("walks all three project jobs through the compact picker with one explicit confirmation", {
	timeout: 120_000,
}, async () => {
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	const parent = realpathSync(makeTempDir());
	const codebase = join(parent, "existing-codebase");
	mkdirSync(join(codebase, "src"), { recursive: true });
	writeFileSync(join(codebase, "src", "index.ts"), "export const keep = true;\n");
	const shared = join(parent, "shared-project");
	mkdirSync(shared);
	initProject(shared, makeTempDir());
	const sharedCanvas = readFileSync(join(shared, "design", "canvas.json"), "utf8");
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
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(project.url);
	await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
	await page.locator(".pj-heading").getByRole("button", { name: "New project…", exact: true }).click();
	const creation = page.getByRole("dialog", { name: "New project", exact: true });
	const projectName = creation.getByLabel("Project name (optional)");
	await expect.poll(() => page.locator("input:focus").getAttribute("aria-label")).toBe("Project name (optional)");
	expect(readdirSync(parent)).toEqual(["existing-codebase", "shared-project"]);
	await projectName.fill("coffee");
	await page.evaluate(() => document.fonts.ready);
	const evidence = process.env.SPOOL_ENTRY_EVIDENCE;
	if (evidence) await page.screenshot({ path: join(evidence, "new-project.png") });
	await creation.getByRole("button", { name: "Choose project location" }).click();
	const location = page.getByRole("dialog", { name: "Choose a save location", exact: true });
	await expect.poll(() => location.locator(".picker-footer code").getAttribute("title")).toBe(parent);
	await location.press("Escape");
	expect(await projectName.inputValue()).toBe("coffee");
	await creation.press("Escape");
	expect(existsSync(join(parent, "coffee"))).toBe(false);

	await page.getByRole("button", { name: "New project", exact: true }).click();
	await projectName.fill("coffee");
	await projectName.press("Enter");
	await page.getByRole("heading", { name: "Your canvas is ready.", exact: true }).waitFor();
	expect(existsSync(join(parent, "coffee", "design", "canvas.json"))).toBe(true);
	expect(await page.locator("dialog").count()).toBe(0);

	await page.getByRole("button", { name: "New project", exact: true }).click();
	await creation.getByRole("button", { name: "Add spool to a folder", exact: false }).click();
	const picker = page.getByRole("dialog", { name: "Choose a project folder", exact: true });
	const search = picker.getByRole("textbox");
	await search.fill(codebase);
	await expect.poll(() => picker.getByRole("button", { name: "Add spool here", exact: true }).isEnabled()).toBe(true);
	expect(existsSync(join(codebase, "design"))).toBe(false);
	if (evidence) await page.screenshot({ path: join(evidence, "setup-codebase.png") });
	await search.press("Enter");
	await page.getByRole("button", { name: "Close existing-codebase", exact: true }).waitFor();
	expect(existsSync(join(codebase, "design", "canvas.json"))).toBe(true);
	expect(existsSync(join(codebase, "existing-codebase"))).toBe(false);
	expect(readFileSync(join(codebase, "src", "index.ts"), "utf8")).toBe("export const keep = true;\n");

	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.getByRole("button", { name: "Open…", exact: true }).click();
	await search.fill(shared);
	await picker.getByRole("button", { name: "Open project", exact: true }).waitFor();
	await search.press("Enter");
	await page.getByRole("button", { name: "Close shared-project", exact: true }).waitFor();
	expect(readRegistry(project.spoolDir).projects.some((item) => item.root === shared)).toBe(true);
	expect(readFileSync(join(shared, "design", "canvas.json"), "utf8")).toBe(sharedCanvas);

	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.getByRole("button", { name: "Open…", exact: true }).click();
	await search.fill(parent);
	await picker.getByRole("button", { name: `Browse ${parent.split("/").at(-1)}` }).click();
	await picker.getByRole("button", { name: "Browse existing-codebase", exact: true }).click();
	await expect.poll(() => picker.locator(".picker-footer code").getAttribute("title")).toBe(codebase);
	await picker.getByRole("button", { name: "Parent folder", exact: true }).click();
	await expect.poll(() => picker.locator(".picker-footer code").getAttribute("title")).toBe(parent);
	await picker.getByRole("button", { name: "Browse existing-codebase", exact: true }).click();
	if (evidence) await page.screenshot({ path: join(evidence, "browse-codebase.png") });
	await picker.getByRole("button", { name: "New project inside this folder", exact: true }).click();
	await projectName.fill("workshop");
	await projectName.press("Enter");
	await page.getByRole("button", { name: "Close workshop", exact: true }).waitFor();
	expect(existsSync(join(codebase, "workshop", "design", "canvas.json"))).toBe(true);
	expect(store.read().entries.find((entry) => entry.key === "projects.location")?.value).toBe(parent);

	await page.getByRole("button", { name: "New project", exact: true }).click();
	await creation.getByRole("button", { name: "Create project", exact: true }).click();
	await page.getByRole("button", { name: "Close untitled", exact: true }).waitFor();
	expect(existsSync(join(parent, "untitled", "design", "canvas.json"))).toBe(true);
	await page.getByRole("button", { name: "New project", exact: true }).click();
	await projectName.fill("coffee");
	await creation.getByRole("button", { name: "Create project", exact: true }).click();
	await creation.getByRole("alert").waitFor();
	expect(await projectName.inputValue()).toBe("coffee");
	expect(await creation.getByRole("alert").innerText()).toContain("already exists");

	await creation.getByRole("button", { name: "Choose project location" }).click();
	await location.getByRole("button", { name: "New folder here" }).click();
	const directory = page.getByRole("dialog", { name: "New folder", exact: true });
	await directory.getByLabel("Folder name").fill("ideas");
	await directory.getByLabel("Folder name").press("Enter");
	await expect.poll(() => location.locator(".picker-footer code").getAttribute("title")).toBe(join(parent, "ideas"));
	expect(readdirSync(join(parent, "ideas"))).toEqual([]);
	await location.getByLabel("Use for future projects").check();
	if (evidence) await page.screenshot({ path: join(evidence, "save-location.png") });
	await location.getByRole("button", { name: "Choose location", exact: true }).click();
	await expect
		.poll(() => store.read().entries.find((entry) => entry.key === "projects.location")?.value)
		.toBe(join(parent, "ideas"));
	expect(await projectName.inputValue()).toBe("coffee");
	await page.setViewportSize({ width: 390, height: 844 });
	await projectName.fill("a-long-project-name-that-still-fits-in-the-creation-form");
	expect(await creation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
	if (evidence) await page.screenshot({ path: join(evidence, "new-project-narrow.png") });
	expect(errors).toEqual([]);
});
