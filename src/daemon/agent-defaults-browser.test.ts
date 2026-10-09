import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, makeProject, serveProject, writeFrame } from "../test-helpers";
import type { AgentEngine } from "./agent-engine";
import { createClaudeEngine } from "./agent-engine-claude";
import { permissionClaude } from "./fixtures/claude-permissions";

/**
 * A second engine as the menu lists it, only ever picked here, never started. Its offer keeps
 * the mode menu, so the machine's mode stays on screen while it is picked.
 */
const piStandIn: AgentEngine = {
	id: "pi",
	installed: () => true,
	account: async () => ({ signedIn: true, account: null }),
	offer: async () => ({ models: [], current: { value: null, resolved: null, name: null, effort: null, pin: null } }),
	choice: (_offer, wanted) => wanted,
	start: () => {
		throw new Error("not started in this test");
	},
	continuable: () => false,
};

/*
 * The machine's agent choice in the rail (#361): the menu shows what was saved, across a
 * reload, a new chat and another project, and never draws a value it has not loaded.
 */
it("keeps the agent and mode a person picked across a reload, a new thread and another project", {
	timeout: 120_000,
}, async () => {
	const claude = permissionClaude();
	const project = await serveProject({
		uiDir: await builtUi(),
		agentEngines: [createClaudeEngine(claude.executor, () => true), piStandIn],
	});
	const other = makeProject(project.spoolDir);
	writeFrame(project.root, "home", "export default () => <h1>Home</h1>");
	writeFrame(other.root, "other", "export default () => <h1>Other</h1>");
	const page = await (await testBrowser()).newPage({ viewport: { width: 1400, height: 900 } });
	// every agent the rail said its chat runs on and every mode it drew, from the first paint on
	await page.addInitScript(() => {
		const seen: string[] = [];
		(window as unknown as { agentLabels: string[] }).agentLabels = seen;
		new MutationObserver(() => {
			const engine = document.querySelector("[data-agent-rail]")?.getAttribute("data-agent-rail-engine");
			const mode = document.querySelector("[data-permission-trigger]")?.textContent;
			for (const text of [engine, mode]) {
				if (text && seen.at(-1) !== text && !seen.includes(text)) seen.push(text);
			}
		}).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
	});
	const labels = () => page.evaluate(() => (window as unknown as { agentLabels: string[] }).agentLabels);
	const rail = page.locator("[data-agent-rail]");
	// the agent of a new chat is picked from its group in the model menu (#364)
	const agent = async (engine: string) => {
		await rail.getByRole("button", { name: "Choose model", exact: true }).click();
		await rail.locator(`[data-agent-group="${engine}"] [data-agent-model-row]`).first().click();
	};
	const mode = rail.locator("[data-permission-trigger]");
	const open = async (name: string) => {
		await page.goto(`${project.url}/p/${encodeURIComponent(name)}`);
		const glyph = page.locator('[data-rail-icon="agent"]');
		if ((await glyph.getAttribute("aria-pressed")) !== "true") await glyph.click();
		await mode.waitFor();
	};
	const settled = async (engine: string, permissions: string) => {
		await expect.poll(() => rail.getAttribute("data-agent-rail-engine")).toBe(engine);
		await expect.poll(() => mode.textContent()).toBe(permissions);
		await expect.poll(() => mode.getAttribute("aria-busy")).toBe("false");
	};

	await open(project.name);
	// a machine with nothing saved: the first installed engine, on Auto-edit
	await settled("claude", "Auto-edit");
	await mode.click();
	await rail.locator('[data-permission-mode="bypass"]').click();
	await agent("pi");
	await settled("pi", "Full access");

	await page.reload();
	await page.locator('[data-rail-icon="agent"]').waitFor();
	const glyph = page.locator('[data-rail-icon="agent"]');
	if ((await glyph.getAttribute("aria-pressed")) !== "true") await glyph.click();
	await settled("pi", "Full access");
	expect(await labels()).toEqual(["pi", "Full access"]);

	await page.locator('[data-pane-head="agent"] button[aria-label="New chat"]').click();
	await settled("pi", "Full access");
	await open(other.name);
	await settled("pi", "Full access");
	expect(await labels()).toEqual(["pi", "Full access"]);

	// back to Claude Code, and a mode picked while its turn runs shows at once and sticks
	await agent("claude");
	await settled("claude", "Full access");
	const field = rail.locator("textarea");
	await field.fill("Permission journey");
	await field.press("Enter");
	const turn = () => claude.spawned.find((proc) => proc.inputs.some((line) => line.includes("Permission journey")));
	await expect.poll(() => turn() !== undefined).toBe(true);
	const running = turn();
	if (running === undefined) throw new Error("Claude Code never got the turn");
	expect(running.spawn.args[running.spawn.args.indexOf("--permission-mode") + 1]).toBe("bypassPermissions");
	await mode.click();
	await rail.locator('[data-permission-mode="ask"]').click();
	await expect.poll(() => mode.textContent()).toBe("Ask first");
	await expect.poll(() => mode.getAttribute("title")).toContain("from the next turn");
	expect(running.inputs.some((line) => line.includes("set_permission_mode"))).toBe(false);
	await page.reload();
	await page.locator('[data-rail-icon="agent"]').waitFor();
	if ((await glyph.getAttribute("aria-pressed")) !== "true") await glyph.click();
	await expect.poll(() => mode.textContent()).toBe("Ask first");
	expect(await labels()).not.toContain("Full access");
	running.exit(0);
});
