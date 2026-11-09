import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { serveDaemon } from "../../daemon/server";
import { testBrowser } from "../../test-browser";
import { builtUi, closeAfterTest, machineAgents, makeTempDir } from "../../test-helpers";

/**
 * The first run's wiring (spool#250), in the served app on a machine with no project: it
 * opens ahead of Home, sets an agent up through the daemon (a stand-in installer and
 * sign-in, real processes), passes Spool Cloud by, lands on Home, and is not shown again.
 */
it("sets an agent up, passes Spool Cloud by, and lands on Home once", { timeout: 120_000 }, async () => {
	const browser = await testBrowser();
	const spoolDir = join(makeTempDir(), ".spool");
	const machine = machineAgents();
	const daemon = await serveDaemon({
		spoolDir,
		version: "0.0.0-test",
		host: "127.0.0.1",
		port: 0,
		uiDir: await builtUi(),
		firstRun: true,
		agentEngines: machine.engines,
		agentSetup: { plans: machine.plans, piDir: join(machine.dir, "pi") },
	});
	closeAfterTest(daemon);
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
	await page.goto(daemon.url);

	const setup = page.getByRole("dialog", { name: "Set up spool" });
	// reduced motion: the open's end at once
	await setup.getByRole("button", { name: "Continue" }).click();
	await setup.getByRole("heading", { name: "Connect your agent." }).waitFor();

	// Claude Code is selected first: return installs it, and its own sign-in follows
	await page.keyboard.press("Enter");
	const code = setup.getByRole("textbox", { name: "Code from the browser" });
	await code.waitFor();
	await expect
		.poll(() => setup.getByRole("link", { name: "Open the sign-in page" }).getAttribute("href"))
		.toBe("https://example.com/claude/login");
	await code.fill("good-code");
	await page.keyboard.press("Enter");
	await setup.getByRole("heading", { name: "Claude Code is ready." }).waitFor();
	await expect.poll(() => setup.locator('[data-first-run-row="claude"]').textContent()).toContain("ada@kaffe.se");

	await setup.getByRole("button", { name: /Continue with Claude Code/ }).click();
	await setup.getByRole("heading", { name: "Try Spool Cloud with your team." }).waitFor();
	await setup.getByRole("button", { name: /Not now/ }).click();

	await expect.poll(() => setup.count()).toBe(0);
	await page.getByRole("heading", { name: "Start with an idea." }).waitFor();
	expect(JSON.parse(readFileSync(join(spoolDir, "config.json"), "utf8")).onboarding).toEqual({ done: true });

	const asked = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/first-run");
	await page.reload();
	expect(await (await asked).json()).toEqual({ due: false });
	await page.getByRole("heading", { name: "Start with an idea." }).waitFor();
	expect(await setup.count()).toBe(0);
});
