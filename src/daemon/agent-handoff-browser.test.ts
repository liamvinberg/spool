import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, fixtureAgentExecutor, serveProject } from "../test-helpers";
import { createSettingsStore } from "./settings";

it("hands off from the empty canvas, first recommendation, and Help menu without losing the chat", {
	timeout: 120_000,
}, async () => {
	const project = await serveProject({
		uiDir: await builtUi(),
		agentExecutor: fixtureAgentExecutor().executor,
		agentLook: () => true,
	});
	const store = createSettingsStore(project.spoolDir);
	store.write("agent.engine", "spool", project.root);
	store.write("agent.introductionSeen", false);
	const browser = await testBrowser();
	const page = await browser.newPage({
		viewport: { width: 1440, height: 900 },
		colorScheme: "dark",
		reducedMotion: "reduce",
	});
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const shots = process.env.SPOOL_AGENT_EVIDENCE;
	const shot = async (name: string) => {
		if (shots) {
			mkdirSync(shots, { recursive: true });
			await page.screenshot({ path: join(shots, `${name}.png`) });
		}
	};
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.getByRole("heading", { name: "Your canvas is ready." }).waitFor();
	await shot("empty");
	await page.getByRole("button", { name: "Use my agent", exact: true }).click();
	const picker = page.getByRole("dialog", { name: `Open ${project.name} in your agent`, exact: true });
	await picker.waitFor();
	await shot("picker");
	expect(await picker.locator("details").getAttribute("open")).toBeNull();
	await picker.getByRole("button", { name: "Copy project path", exact: true }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(project.root);
	await picker.press("Escape");
	await page.locator('[data-dock-glyph="agent"]').click();
	const notice = page.getByRole("dialog", { name: "Use your usual agent.", exact: true });
	await notice.waitFor();
	await shot("notice");
	const box = await notice.boundingBox();
	expect(box?.width).toBe(536);
	if (!box) throw new Error("Missing recommendation");
	expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThanOrEqual(1);
	expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThanOrEqual(1);
	await notice.getByRole("button", { name: "Use my agent", exact: true }).click();
	await expect
		.poll(() => store.read().entries.find((entry) => entry.key === "agent.introductionSeen")?.value)
		.toBe(true);
	await picker.waitFor();
	await picker.getByRole("button", { name: "Back to canvas" }).click();
	await page.locator('[data-dock-glyph="agent"]').click();
	await page.locator("[data-agent-rail] textarea").fill("Keep my draft");
	expect(await page.getByRole("button", { name: "Open in my agent", exact: false }).count()).toBe(0);
	const help = page.getByRole("button", { name: "Help", exact: true });
	const menu = page.getByRole("menu", { name: "Help", exact: true });
	const handoff = menu.getByRole("menuitem", { name: "Open in your agent", exact: false });
	await help.click();
	await menu.waitFor();
	await shot("help");
	expect(await handoff.evaluate((element) => element === document.activeElement)).toBe(true);
	await handoff.press("Escape");
	expect(await menu.count()).toBe(0);
	expect(await help.evaluate((element) => element === document.activeElement)).toBe(true);
	await help.press("ArrowDown");
	await handoff.press("Enter");
	await picker.waitFor();
	await picker.getByRole("button", { name: "Back to canvas" }).click();
	expect(await page.locator("[data-agent-rail] textarea").inputValue()).toBe("Keep my draft");
	expect(await help.evaluate((element) => element === document.activeElement)).toBe(true);
	await help.click();
	await handoff.press("Tab");
	expect(await menu.count()).toBe(0);
	expect(
		await page
			.getByRole("button", { name: "Settings", exact: true })
			.evaluate((element) => element === document.activeElement),
	).toBe(true);
	await help.click();
	await page
		.getByRole("application", { name: `${project.name} canvas`, exact: true })
		.click({ position: { x: 30, y: 100 } });
	expect(await menu.count()).toBe(0);
	await page.reload();
	await page.locator('[data-dock-glyph="agent"]').waitFor();
	if ((await page.locator('[data-dock-glyph="agent"]').getAttribute("aria-pressed")) === "false")
		await page.locator('[data-dock-glyph="agent"]').click();
	await page.locator("[data-agent-rail] textarea").waitFor();
	expect(await notice.count()).toBe(0);
	expect(await page.locator("[data-agent-rail] textarea").inputValue()).toBe("Keep my draft");
	expect(await page.getByRole("button", { name: "Open in my agent", exact: false }).count()).toBe(0);
	expect(errors).toEqual([]);
});

it("skips Claude Code chats, then starts a Claude chat from the spool recommendation", {
	timeout: 120_000,
}, async () => {
	const project = await serveProject({
		uiDir: await builtUi(),
		agentExecutor: fixtureAgentExecutor().executor,
		agentLook: () => true,
	});
	const store = createSettingsStore(project.spoolDir);
	store.write("agent.introductionSeen", false);
	const page = await (await testBrowser()).newPage({ viewport: { width: 1440, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-dock-glyph="agent"]').click();
	const choice = page.getByRole("button", { name: "Choose agent for this new chat", exact: true });
	await expect.poll(() => choice.textContent()).toContain("Claude Code");
	expect(await page.locator("dialog").count()).toBe(0);
	await choice.click();
	await page.locator('[data-agent-engine="spool"]').click();
	const notice = page.getByRole("dialog", { name: "Use your usual agent.", exact: true });
	await notice.waitFor();
	await notice.getByRole("button", { name: "Use Claude Code here", exact: true }).click();
	await expect.poll(() => choice.textContent()).toContain("Claude Code");
	expect(await notice.count()).toBe(0);
});
