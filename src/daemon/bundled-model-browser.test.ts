import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { readThreads } from "./agent-threads";

it("chooses account-scoped favorites through the served canvas and keeps the exact thread, history and draft", {
	timeout: 180_000,
}, async () => {
	const directory = makeTempDir();
	const children: ChildProcess[] = [];
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-model-provider-host.ts", import.meta.url)), [], {
			cwd: state,
			env: bundledEnvironment(state),
			execArgv: ["--import", import.meta.resolve("tsx")],
			stdio: ["ignore", "ignore", "ignore", "ipc"],
		});
		children.push(child);
		return child;
	});
	onTestFinished(async () => {
		await Promise.all(
			children
				.filter((child) => child.exitCode === null && child.signalCode === null)
				.map(async (child) => {
					const exited = once(child, "exit");
					child.kill();
					await exited;
				}),
		);
	});
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir, agentEngines: [createSpoolEngine(directory, client)] });
	writeFrame(project.root, "home", "export default function Home() { return <h1>Reference frame</h1>; }");
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":600,"h":400}');
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	await build({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	const shots = process.env.SPOOL_TEST_SHOTS;
	const shot = async (name: string) => {
		if (shots !== undefined) {
			mkdirSync(shots, { recursive: true });
			await page.waitForTimeout(800);
			await page.screenshot({ path: join(shots, `${name}.png`), animations: "disabled" });
		}
	};
	await page.addInitScript(() => {
		if (localStorage.getItem("spool.rail.agent.width") === null)
			localStorage.setItem("spool.rail.agent.width", "420");
	});
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-dock-glyph="agent"]').click();
	const field = page.locator("[data-agent-rail] textarea");
	const trigger = page.getByRole("button", { name: "Choose engine and model" });
	await expect.poll(() => trigger.textContent(), { timeout: 15_000 }).toContain("Test image model");
	await field.fill("first completed turn");
	await field.press("Enter");
	await expect
		.poll(() => page.locator("[data-agent-rail]").textContent(), { timeout: 15_000 })
		.toContain("Saved reply 1.");
	const thread = readThreads(project.spoolDir, project.root)[0];
	if (!thread) throw new Error("Missing thread");
	await field.fill("keep my next draft");
	await trigger.click();
	const menu = page.locator("[data-combined-menu]");
	const offers = menu.locator("[data-model-offer]");
	const openai = menu.locator('[data-model-offer="spool/openai/api_key/spool-test"]');
	const google = menu.locator('[data-model-offer="spool/google/api_key/spool-test"]');
	await expect.poll(() => offers.count()).toBe(1);
	await openai.getByRole("button", { name: "Favorite Test image model through OpenAI API key", exact: true }).click();
	await shot("models-favorites-420");
	await menu.getByRole("button", { name: "All models", exact: true }).click();
	await expect.poll(() => offers.count()).toBe(4);
	expect(await menu.textContent()).not.toContain("Text only model");
	await google.getByRole("button", { name: "Favorite Test image model through Google API key", exact: true }).click();
	await shot("models-favorites-all-420");
	await menu.getByRole("button", { name: "Favorites", exact: true }).click();
	await expect.poll(() => offers.count()).toBe(2);
	const search = menu.getByRole("searchbox");
	await search.fill("quick");
	await expect.poll(() => offers.count()).toBe(0);
	expect(await menu.textContent()).toContain("No matching favorites.");
	expect(await menu.locator('[data-agent-model-row="high"]').count()).toBe(0);
	await shot("models-favorites-search-420");
	await menu.getByRole("menuitem", { name: "Search all models…", exact: true }).click();
	expect(await search.inputValue()).toBe("quick");
	await expect.poll(() => offers.count()).toBe(2);
	await search.fill("google");
	await expect.poll(() => offers.count()).toBe(2);
	await search.fill("");
	await menu.getByRole("button", { name: "Favorites", exact: true }).click();
	await openai
		.getByRole("button", { name: "Unfavorite Test image model through OpenAI API key", exact: true })
		.click();
	await expect.poll(() => offers.count()).toBe(2);
	expect(await openai.locator("[data-agent-model-row]").getAttribute("aria-current")).toBe("true");
	expect(await trigger.getAttribute("aria-expanded")).toBe("true");
	await google.locator("[data-agent-model-row]").click();
	await expect.poll(() => menu.count()).toBe(0);
	await trigger.click();
	await expect.poll(() => offers.count()).toBe(1);
	expect(await google.locator("[data-agent-model-row]").getAttribute("aria-current")).toBe("true");
	await menu.locator('[data-agent-model-row="low"]').click();
	await expect.poll(() => menu.locator('[data-agent-model-row="low"]').getAttribute("aria-current")).toBe("true");
	expect(await menu.locator('[data-agent-model-row="max"]').count()).toBe(0);
	await menu.getByRole("button", { name: "All models", exact: true }).click();
	await menu.locator('[data-model-offer="spool/google/api_key/quick-image"] [data-agent-model-row]').click();
	await expect.poll(() => trigger.textContent()).toContain("Quick image model");
	await trigger.click();
	expect(await menu.locator('[data-agent-model-row="low"]').count()).toBe(0);
	await menu.getByRole("menuitem", { name: "Connect account…", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Connect an account" });
	await dialog.waitFor();
	await dialog.getByRole("menuitem", { name: "Google API key · connected", exact: true }).click();
	await dialog.getByRole("button", { name: "Disconnect", exact: true }).click();
	await expect.poll(() => dialog.textContent()).not.toContain("Google API key · connected");
	await dialog.press("Escape");
	await trigger.click();
	await menu.getByRole("button", { name: "All models", exact: true }).click();
	await expect.poll(() => offers.count()).toBe(2);
	expect(await offers.allTextContents()).not.toEqual(
		expect.arrayContaining([expect.stringContaining("Google API key")]),
	);
	expect(await field.inputValue()).toBe("keep my next draft");
	await menu.locator('[data-model-offer="spool/openai/api_key/spool-test"] [data-agent-model-row]').click();
	await field.fill("continue after explicit choice");
	await field.press("Enter");
	await expect.poll(() => page.locator("[data-agent-rail]").textContent()).toContain("Saved reply 2.");
	const calls = readFileSync(join(directory, "provider-calls.jsonl"), "utf8").trim().split("\n");
	expect(calls).toHaveLength(2);
	expect(calls[1]).toContain("first completed turn");
	expect(readThreads(project.spoolDir, project.root)[0]?.session).toEqual(thread.session);
	expect(readThreads(project.spoolDir, project.root)[0]?.engine).toBe("spool");
	await field.fill("retained after reload");
	await page.reload();
	await expect.poll(() => field.inputValue()).toBe("retained after reload");
	await trigger.click();
	await expect
		.poll(() =>
			menu
				.locator('[data-model-offer="spool/openai/api_key/spool-test"] [data-agent-model-row]')
				.getAttribute("aria-current"),
		)
		.toBe("true");
	await menu.getByRole("button", { name: "All models", exact: true }).click();
	await openai.getByRole("button", { name: "Favorite Test image model through OpenAI API key", exact: true }).click();
	await menu.getByRole("button", { name: "Favorites", exact: true }).click();
	await page.evaluate(() => localStorage.setItem("spool.rail.agent.width", "280"));
	await page.reload();
	await trigger.click();
	await openai
		.getByRole("button", { name: "Unfavorite Test image model through OpenAI API key", exact: true })
		.waitFor();
	await shot("models-favorites-280");
	const railBox = await page.locator("[data-agent-rail]").boundingBox();
	const menuBox = await menu.boundingBox();
	if (!railBox || !menuBox) throw new Error("Missing geometry");
	expect(Math.round(railBox.width)).toBe(280);
	expect(menuBox.x).toBeGreaterThanOrEqual(railBox.x);
	expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(railBox.x + railBox.width);
	await menu.getByRole("searchbox").focus();
	await page.keyboard.press("ArrowDown");
	expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BUTTON");
	await page.keyboard.press("Escape");
	expect(await trigger.evaluate((node) => node === document.activeElement)).toBe(true);
});
