import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, fixtureAgentExecutor, serveProject } from "../test-helpers";
import { createSettingsStore } from "./settings";

it("shows the first spool recommendation, hands off from both entry points, and remembers the choice after reload", {
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
	await notice.getByRole("button", { name: "Continue in spool", exact: true }).click();
	await expect
		.poll(() => store.read().entries.find((entry) => entry.key === "agent.introductionSeen")?.value)
		.toBe(true);
	await page.locator("[data-agent-rail] textarea").fill("Keep my draft");
	await page.getByRole("button", { name: "Open in my agent", exact: false }).click();
	await picker.waitFor();
	await picker.getByRole("button", { name: "Back to canvas" }).click();
	await page.locator('[data-dock-glyph="agent"]').click();
	expect(await page.locator("[data-agent-rail] textarea").inputValue()).toBe("Keep my draft");
	await page.reload();
	await page.locator('[data-dock-glyph="agent"]').waitFor();
	if ((await page.locator('[data-dock-glyph="agent"]').getAttribute("aria-pressed")) === "false")
		await page.locator('[data-dock-glyph="agent"]').click();
	await page.locator("[data-agent-rail] textarea").waitFor();
	expect(await notice.count()).toBe(0);
	expect(await page.locator("[data-agent-rail] textarea").inputValue()).toBe("Keep my draft");
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
