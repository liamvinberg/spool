import { fork } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeFrame } from "../test-helpers";
import { createClaudeEngine } from "./agent-engine-claude";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { readThreads } from "./agent-threads";
import { askOrder } from "./fixtures/bundled-question";
import { permissionClaude } from "./fixtures/claude-permissions";

it("uses both engine footers in the served canvas, waits for acknowledged modes and leaves design questions waiting", {
	timeout: 180_000,
}, async () => {
	const directory = makeTempDir();
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-permission-host.ts", import.meta.url)), [], {
			cwd: state,
			env: bundledEnvironment(state),
			execArgv: ["--import", import.meta.resolve("tsx")],
			stdio: ["ignore", "ignore", "ignore", "ipc"],
		});
		onTestFinished(async () => {
			if (child.exitCode !== null || child.signalCode !== null) return;
			const exited = once(child, "exit");
			child.kill();
			await exited;
		});
		return child;
	});
	await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const claude = permissionClaude();
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({
		uiDir,
		agentEngines: [createSpoolEngine(directory, client), createClaudeEngine(claude.executor, () => true)],
	});
	writeFrame(project.root, "receipt", "export default () => <main><h1>Order confirmed</h1><p>Order 1042</p></main>");
	await build({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await page.addInitScript(() => {
		if (localStorage.getItem("spool.rail.agent.width") === null)
			localStorage.setItem("spool.rail.agent.width", "420");
	});
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-dock-glyph="agent"]').click();
	const rail = page.locator("[data-agent-rail]");
	const field = rail.locator("textarea");
	const trigger = rail.locator("[data-permission-trigger]");
	const model = rail.getByRole("button", { name: "Choose model", exact: true });
	const menu = rail.getByRole("menu", { name: "Agent permissions", exact: true });
	const open = rail.locator('[data-agent-ask="open"]');
	const stop = rail.getByRole("button", { name: /stop.*⎋/ });
	const stored = () => readThreads(project.spoolDir, project.root);
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
	const choose = async (mode: "ask" | "edits" | "bypass") => {
		await trigger.click();
		await menu.getByRole("menuitemradio", { name: mode, exact: true }).click();
	};
	const says = async (mode: string) => {
		await expect.poll(() => trigger.textContent()).toBe(mode);
		await expect.poll(() => trigger.getAttribute("aria-busy")).toBe("false");
	};
	const bounds = async (width: number) => {
		const boxes = await Promise.all([
			rail.boundingBox(),
			menu.boundingBox(),
			trigger.boundingBox(),
			model.boundingBox(),
		]);
		const [r, m, t, e] = boxes;
		if (!r || !m || !t || !e) throw new Error("Missing footer bounds");
		expect(Math.round(r.width)).toBe(width);
		expect(Math.round(m.width)).toBe(250);
		expect(m.x).toBeGreaterThanOrEqual(r.x);
		expect(m.x + m.width).toBeLessThanOrEqual(r.x + r.width);
		expect(m.y + m.height).toBeLessThan(t.y);
		expect(Math.abs(t.x + t.width - (r.x + r.width - 14))).toBeLessThan(2);
		expect(e.x + e.width).toBeLessThan(t.x);
		// The rotating chevron temporarily extends beyond its settled 8px box.
		await expect.poll(() => trigger.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
		expect(await model.getAttribute("title")).toContain((await model.textContent()) ?? "");
	};
	// Switching the agent before sending preserves the draft and refreshes account-scoped offers.
	await expect.poll(() => model.textContent()).toContain("Test image model");
	await field.fill("Unsent draft follows the agent choice.");
	const agent = rail.getByRole("button", { name: "Choose agent for this new chat", exact: true });
	await agent.click();
	await rail.locator('[data-agent-engine="claude"]').click();
	await expect.poll(() => model.textContent()).toContain("Default (recommended)");
	await model.click();
	await rail.locator('[data-agent-model-row="Default (recommended)"]:not([inert] *)').click();
	await agent.click();
	await rail.locator('[data-agent-engine="spool"]').click();
	await expect.poll(() => model.textContent()).toContain("Test image model");
	await model.click();
	const models = rail.getByRole("dialog", { name: "Model picker", exact: true });
	await expect.poll(() => models.textContent()).toContain("OpenAI API key");
	expect(await models.textContent()).not.toContain("Default (recommended)");
	expect(await field.inputValue()).toBe("Unsent draft follows the agent choice.");
	await page.keyboard.press("Escape");

	await says("ask");
	// An unrelated file grant must survive the project mode changes below.
	await send(
		`file tools: ${JSON.stringify([{ name: "write", arguments: { path: "granted/first", content: "first" } }])}`,
	);
	await open.waitFor();
	await open.getByRole("button", { name: "for this thread", exact: true }).click();
	await expect.poll(() => stop.count()).toBe(0);
	const thread = stored()[0]?.id;
	const session = stored()[0]?.session;
	await send(
		`file tools: ${JSON.stringify([{ name: "write", arguments: { path: "src/ui/receipt.css", content: "receipt" } }, { name: "bash", arguments: { command: "printf command > outside", unsandboxed: true } }, askOrder])}`,
	);
	await expect.poll(() => open.textContent()).toContain("Allow edits in src/ui/?");
	await field.fill("Next draft stays here.");
	await open.getByRole("button", { name: "change permissions…" }).click();
	await bounds(420);
	await shot("access-footer-open-420");
	await menu.getByRole("menuitemradio", { name: "bypass", exact: true }).hover();
	expect(existsSync(join(project.root, "src/ui/receipt.css"))).toBe(false);
	await page.keyboard.press("Escape");
	expect(await trigger.evaluate((node) => node === document.activeElement)).toBe(true);
	await model.click();
	await trigger.click();
	expect(await rail.locator("[data-agent-model-menu]:not([inert] *)").count()).toBe(0);
	await model.click();
	expect(await menu.count()).toBe(0);
	await page.keyboard.press("Escape");
	await trigger.focus();
	await page.keyboard.press("ArrowDown");
	expect(
		await menu
			.getByRole("menuitemradio", { name: "ask", exact: true })
			.evaluate((node) => node === document.activeElement),
	).toBe(true);
	await page.keyboard.press("End");
	expect(
		await menu
			.getByRole("menuitemradio", { name: "bypass", exact: true })
			.evaluate((node) => node === document.activeElement),
	).toBe(true);
	await page.keyboard.press("Home");
	await page.keyboard.press("ArrowDown");
	writeFileSync(join(directory, "reject-permissions"), "reject");
	await page.keyboard.press("Enter");
	await expect
		.poll(() => rail.getByRole("status").textContent())
		.toContain("The bundled engine could not complete this operation.");
	await says("ask");
	expect(existsSync(join(project.root, "src/ui/receipt.css"))).toBe(false);
	expect(await field.inputValue()).toBe("Next draft stays here.");
	rmSync(join(directory, "reject-permissions"));
	await choose("edits");
	await says("edits");
	expect(await trigger.evaluate((node) => node === document.activeElement)).toBe(true);
	await expect.poll(() => existsSync(join(project.root, "src/ui/receipt.css"))).toBe(true);
	await expect.poll(() => open.textContent()).toContain("Allow commands");
	expect(existsSync(join(project.root, "outside"))).toBe(false);
	await shot("access-footer-edits-command");
	await choose("bypass");
	await says("bypass");
	await expect.poll(() => open.textContent()).toContain("Where should the order number go?");
	expect(readFileSync(join(project.root, "outside"), "utf8")).toBe("command");
	await shot("access-footer-bypass-question");
	await choose("ask");
	await says("ask");
	expect(await open.textContent()).toContain("Where should the order number go?");
	expect(stored()[0]?.id).toBe(thread);
	expect(stored()[0]?.session).toEqual(session);
	expect(await field.inputValue()).toBe("Next draft stays here.");
	await page.evaluate(() => localStorage.setItem("spool.rail.agent.width", "280"));
	await page.reload();
	await open.waitFor();
	await trigger.click();
	await bounds(280);
	await shot("access-footer-narrow-question-open");
	await page
		.getByRole("button", { name: "close the permission menu", exact: true })
		.click({ position: { x: 100, y: 100 } });
	expect(await menu.count()).toBe(0);
	expect(await trigger.evaluate((node) => node === document.activeElement)).toBe(true);
	await open.getByRole("button", { name: /Under the confirmation/ }).click();
	await expect.poll(() => stop.count()).toBe(0);
	await send(
		`file tools: ${JSON.stringify([{ name: "write", arguments: { path: "granted/second", content: "second" } }])}`,
	);
	await expect.poll(() => existsSync(join(project.root, "granted/second"))).toBe(true);
	await expect.poll(() => stop.count()).toBe(0);
	expect(await open.count()).toBe(0);
	// Claude follows the same UI through its real adapter and deterministic wire peer.
	await rail.getByRole("button", { name: "New chat", exact: true }).click();
	await rail.getByRole("button", { name: "New chat with Claude Code", exact: false }).click();
	await expect.poll(() => model.getAttribute("title")).toContain("Default (recommended)");
	await send("Permission journey");
	await expect.poll(() => open.count()).toBe(3);
	await field.fill("Claude next draft.");
	await open.first().getByRole("button", { name: "change permissions…" }).click();
	await bounds(280);
	await shot("access-footer-claude-narrow-open");
	await page.keyboard.press("Escape");
	claude.reject(true);
	await choose("edits");
	await expect.poll(() => rail.getByRole("status").textContent()).toContain("Claude Code refused");
	await says("ask");
	expect(claude.answers).toEqual([]);
	claude.reject(false);
	await choose("edits");
	await says("edits");
	await expect.poll(() => open.count()).toBe(2);
	expect(claude.answers).toEqual(["file"]);
	await choose("bypass");
	await says("bypass");
	await expect.poll(() => open.count()).toBe(1);
	expect(claude.answers).toEqual(["file", "command"]);
	expect(await open.textContent()).toContain("Where should the order number go?");
	expect(await field.inputValue()).toBe("Claude next draft.");
	await shot("access-footer-claude-narrow-bypass");
	await page.evaluate(() => localStorage.setItem("spool.rail.agent.width", "420"));
	await page.reload();
	await open.waitFor();
	await trigger.click();
	await bounds(420);
	await shot("access-footer-claude-open-420");
	await page.keyboard.press("Escape");
	await stop.click();
	await expect.poll(() => stop.count()).toBe(0);
	await page.keyboard.press("Meta+,");
	const settings = page.getByRole("dialog", { name: "Settings", exact: true });
	await settings.waitFor();
	expect(await settings.textContent()).not.toContain("Agent permissions");
	expect(await settings.textContent()).toContain("Save projects in");
	await shot("access-design-settings");
});
