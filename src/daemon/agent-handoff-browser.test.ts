import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, fixtureAgentExecutor, serveProject } from "../test-helpers";

it("hands off from the empty canvas and the Help menu without losing the chat", {
	timeout: 120_000,
}, async () => {
	const project = await serveProject({
		uiDir: await builtUi(),
		agentExecutor: fixtureAgentExecutor().executor,
		agentLook: () => true,
	});
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
	await page.locator('[data-pane-toggle="agent"]').click();
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
	await page.locator('[data-pane-toggle="agent"]').waitFor();
	if ((await page.locator('[data-pane-toggle="agent"]').getAttribute("aria-pressed")) === "false")
		await page.locator('[data-pane-toggle="agent"]').click();
	await page.locator("[data-agent-rail] textarea").waitFor();
	expect(await page.locator("[data-agent-rail] textarea").inputValue()).toBe("Keep my draft");
	expect(await page.getByRole("button", { name: "Open in my agent", exact: false }).count()).toBe(0);
	expect(errors).toEqual([]);
});
