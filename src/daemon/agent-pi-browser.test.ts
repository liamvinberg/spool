import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, makeTempDir, scriptedAgentExecutor, serveProject, writeFrame } from "../test-helpers";
import { createClaudeEngine } from "./agent-engine-claude";
import { createPiEngine } from "./agent-engine-pi";
import { writeThread } from "./agent-threads";

const LEGACY = "3c2b1a09-8f7e-4d6c-9b5a-4a3b2c1d0e0f";

/*
 * Pi in the rail (#363): its live models with the local ones marked, no mode menu because
 * pi never asks, and a thread the removed bundled engine left behind opening read-only.
 */
it("shows pi's live models with local ones marked and no mode menu, and opens an old spool thread read-only", {
	timeout: 120_000,
}, async () => {
	const pi = scriptedAgentExecutor("pi-models-local");
	const project = await serveProject({
		uiDir: await builtUi(),
		agentEngines: [
			createPiEngine({ executor: pi.executor, spoolDir: makeTempDir(), look: () => true }),
			createClaudeEngine({
				executor: () => {
					throw new Error("Claude Code is not started here");
				},
				spoolDir: makeTempDir(),
				look: () => false,
			}),
		],
	});
	writeFrame(project.root, "home", "export default () => <h1>Home</h1>");
	writeThread(project.spoolDir, project.root, {
		id: LEGACY,
		engine: "spool",
		session: { id: "4d3c2b1a-0f9e-4d7c-8b6a-5b4c3d2e1f00" },
		ask: "make the header calmer",
		life: "read",
		at: Date.now(),
		entries: [
			{ kind: "user", text: "make the header calmer" },
			{ kind: "prose", key: "say:0:0", full: "Softened the header.", settled: true },
		],
		kept: 2,
		plan: null,
		queued: [],
		draft: "",
		stopped: false,
		closed: false,
	});
	const page = await (await testBrowser()).newPage({ viewport: { width: 1400, height: 900 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const glyph = page.locator('[data-pane-toggle="agent"]');
	if ((await glyph.getAttribute("aria-pressed")) !== "true") await glyph.click();
	const rail = page.locator("[data-agent-rail]");

	// the old thread's picture is all there, with one quiet line saying it goes no further
	await rail.locator("[data-agent-legacy]").waitFor();
	expect(await rail.textContent()).toContain("Softened the header.");
	expect(await rail.locator("[data-agent-legacy]").textContent()).toContain("can’t be continued");
	// and nothing answers it, so there is no agent or mode to pick on it (#364)
	expect(await rail.getByRole("button", { name: "Choose model", exact: true }).count()).toBe(0);
	expect(await rail.locator("[data-permission-trigger]").count()).toBe(0);

	await page.locator('[data-pane-head="agent"] button[aria-label="New chat"]').click();
	const model = rail.getByRole("button", { name: "Choose model", exact: true });
	await expect.poll(() => model.textContent()).toContain("qwen3-coder:30b");
	expect(await rail.locator("[data-agent-legacy]").count()).toBe(0);
	// pi never asks, so there is no mode to pick
	expect(await rail.locator("[data-permission-trigger]").count()).toBe(0);
	await model.click();
	// pi is the one agent here, so the menu is its group alone, and Claude Code is an install line
	const menu = rail.locator("[data-agent-model-menu]:not([inert] *)");
	await expect
		.poll(() => menu.locator("[data-agent-group]").evaluateAll((all) => all.map((one) => one.dataset.agentGroup)))
		.toEqual(["pi"]);
	const rows = menu.locator('[data-agent-group="pi"] [data-agent-model-row]');
	await expect.poll(() => rows.count()).toBe(2);
	expect(await menu.locator("[data-agent-model-row] [data-agent-model-local]").count()).toBe(2);
	await menu.getByRole("button", { name: "Get more agents" }).click();
	await expect
		.poll(() => menu.locator("[data-agent-install]").evaluateAll((all) => all.map((one) => one.dataset.agentInstall)))
		.toEqual(["claude", "codex"]);
	await page.keyboard.press("Escape");
	expect(pi.spawned.every((proc) => proc.mismatches.length === 0)).toBe(true);
	expect(errors).toEqual([]);
});

/*
 * No supported agent on the machine (#363): the wall lists an install line per agent, and
 * comes down by itself when the window is focused again after one was installed.
 */
it("walls a machine with no agent and takes the wall down on focus once one is installed", {
	timeout: 120_000,
}, async () => {
	let installed = false;
	const project = await serveProject({
		uiDir: await builtUi(),
		agentEngines: [
			createClaudeEngine({
				executor: () => {
					throw new Error("Claude Code is not started here");
				},
				spoolDir: makeTempDir(),
				look: () => installed,
			}),
			createPiEngine({
				executor: () => {
					throw new Error("pi is not started here");
				},
				spoolDir: makeTempDir(),
				look: () => false,
			}),
		],
	});
	const page = await (await testBrowser()).newPage({ viewport: { width: 1400, height: 900 } });
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const glyph = page.locator('[data-pane-toggle="agent"]');
	if ((await glyph.getAttribute("aria-pressed")) !== "true") await glyph.click();
	const wall = page.locator("[data-agent-wall]");
	await wall.waitFor();
	expect(await wall.locator("[data-agent-install] code").allTextContents()).toEqual([
		"npm i -g @anthropic-ai/claude-code",
		"npm i -g @openai/codex",
		"npm i -g @earendil-works/pi-coding-agent",
	]);
	await wall.getByRole("button", { name: "Copy the Codex install line", exact: true }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npm i -g @openai/codex");
	await wall.locator("[data-agent-check]").click();
	await wall.locator("[data-agent-looked]").waitFor();

	installed = true;
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	await wall.waitFor({ state: "detached" });
	expect(await page.locator("[data-agent-rail] textarea").count()).toBe(1);
});
