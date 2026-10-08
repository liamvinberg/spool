import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, seedAgentWidth, serveProject, storeRightWidth, writeFrame } from "../test-helpers";
import { createClaudeEngine } from "./agent-engine-claude";
import { permissionClaude } from "./fixtures/claude-permissions";

it("uses the engine footer in the served canvas, saves modes at once and leaves design questions waiting", {
	timeout: 180_000,
}, async () => {
	const claude = permissionClaude();
	const uiDir = await builtUi();
	const project = await serveProject({
		uiDir,
		agentEngines: [createClaudeEngine(claude.executor, () => true)],
	});
	writeFrame(project.root, "receipt", "export default () => <main><h1>Order confirmed</h1><p>Order 1042</p></main>");
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await seedAgentWidth(page, 420);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-rail-icon="agent"]').click();
	const rail = page.locator("[data-agent-rail]");
	const field = rail.locator("textarea");
	const trigger = rail.locator("[data-permission-trigger]");
	const model = rail.getByRole("button", { name: "Choose model", exact: true });
	const menu = rail.getByRole("menu", { name: "Agent permissions", exact: true });
	const open = rail.locator('[data-agent-ask="open"]');
	const stop = rail.getByRole("button", { name: "Stop", exact: true });
	const shot = async (name: string) => {
		const shots = process.env.SPOOL_TEST_SHOTS;
		if (shots) {
			mkdirSync(shots, { recursive: true });
			await page.screenshot({ path: join(shots, `${name}.png`), animations: "disabled" });
		}
	};
	const send = async (text: string) => {
		await field.fill(text);
		await field.press("Enter");
	};
	// a mode is named as a person reads it, and found by the mode it is (#364)
	const item = (mode: "ask" | "edits" | "bypass") => menu.locator(`[data-permission-mode="${mode}"]`);
	const NAMES = { ask: "Ask first", edits: "Auto-edit", bypass: "Full access" } as const;
	const choose = async (mode: "ask" | "edits" | "bypass") => {
		await trigger.click();
		await item(mode).click();
	};
	const says = async (mode: "ask" | "edits" | "bypass") => {
		await expect.poll(() => trigger.textContent()).toBe(NAMES[mode]);
		await expect.poll(() => trigger.getAttribute("aria-busy")).toBe("false");
	};
	const bounds = async (width: number) => {
		// the menu grows out of its trigger, so it is measured once it has arrived: 300 wide,
		// inside a 1px border
		await expect.poll(async () => Math.round((await menu.boundingBox())?.width ?? 0)).toBe(298);
		const boxes = await Promise.all([
			rail.boundingBox(),
			menu.boundingBox(),
			trigger.boundingBox(),
			model.boundingBox(),
		]);
		const [r, m, t, e] = boxes;
		if (!r || !m || !t || !e) throw new Error("Missing footer bounds");
		expect(Math.round(r.width)).toBe(width);
		expect(m.x).toBeGreaterThanOrEqual(r.x);
		expect(m.x + m.width).toBeLessThanOrEqual(r.x + r.width);
		expect(m.y + m.height).toBeLessThan(t.y);
		expect(t.x + t.width).toBeLessThanOrEqual(r.x + r.width - 14);
		expect(e.x + e.width).toBeLessThan(t.x);
		// The rotating chevron temporarily extends beyond its settled 8px box.
		await expect.poll(() => trigger.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
		expect(await model.getAttribute("title")).toContain((await model.textContent()) ?? "");
	};
	await expect.poll(() => model.getAttribute("title")).toContain("Default (recommended)");
	// a machine with nothing saved starts on Auto-edit (#361)
	await says("edits");
	await trigger.focus();
	await page.keyboard.press("ArrowDown");
	await expect.poll(() => item("edits").evaluate((node) => node === document.activeElement)).toBe(true);
	await page.keyboard.press("Home");
	await page.keyboard.press("Enter");
	await says("ask");
	await expect.poll(() => trigger.evaluate((node) => node === document.activeElement)).toBe(true);
	await send("Permission journey");
	await expect.poll(() => open.count()).toBe(3);
	const journey = claude.spawned.at(-1);
	if (journey === undefined) throw new Error("Claude Code never got the turn");
	// the machine's mode, the one picked before the turn
	expect(journey.spawn.args[journey.spawn.args.indexOf("--permission-mode") + 1]).toBe("default");
	await storeRightWidth(page, 380);
	await page.reload();
	await open.first().waitFor();
	await field.fill("Claude next draft.");
	await open.first().getByRole("button", { name: "change permissions…" }).click();
	await bounds(380);
	await shot("access-footer-claude-narrow-open");
	await page.keyboard.press("Escape");
	// Claude Code is never asked to change mid-turn, so it can never refuse (#361)
	claude.reject(true);
	await choose("edits");
	await says("edits");
	await expect.poll(() => trigger.getAttribute("title")).toContain("from the next turn");
	await choose("bypass");
	await says("bypass");
	expect(await rail.getByRole("status").count()).toBe(0);
	expect(claude.changes).toEqual([]);
	expect(claude.answers).toEqual([]);
	expect(await open.count()).toBe(3);
	expect(await field.inputValue()).toBe("Claude next draft.");
	await shot("access-footer-claude-narrow-bypass");
	await storeRightWidth(page, 420);
	await page.reload();
	await open.first().waitFor();
	await says("bypass");
	await trigger.click();
	await bounds(420);
	await shot("access-footer-claude-open-420");
	await page.keyboard.press("Escape");
	await stop.click();
	await expect.poll(() => stop.count()).toBe(0);
	// and the next turn starts on the pick
	const spawned = claude.spawned.length;
	await send("Permission journey, again");
	await expect.poll(() => claude.spawned.length).toBeGreaterThan(spawned);
	const next = claude.spawned.at(-1);
	expect(next?.spawn.args[(next?.spawn.args.indexOf("--permission-mode") ?? 0) + 1]).toBe("bypassPermissions");
	expect(await trigger.getAttribute("title")).not.toContain("from the next turn");
	await stop.click();
	await expect.poll(() => stop.count()).toBe(0);
	await page.keyboard.press("Meta+,");
	const settings = page.getByRole("dialog", { name: "Settings", exact: true });
	await settings.waitFor();
	expect(await settings.textContent()).not.toContain("Agent permissions");
	expect(await settings.textContent()).toContain("Default project location");
	await shot("access-design-settings");
});
