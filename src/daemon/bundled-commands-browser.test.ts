import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { serveDaemon } from "./server";

it.each([false, true])(
	"renders compact real host command approvals and results (isolation unavailable: %s)",
	{ timeout: 120_000 },
	async (unavailable) => {
		const spoolDir = makeTempDir();
		const directory = join(spoolDir, "bundled");
		const children: ChildProcess[] = [];
		const client = new BundledHostClient(directory, (state) => {
			const child = fork(
				fileURLToPath(
					new URL(
						unavailable ? "./fixtures/bundled-unavailable-host.ts" : "./fixtures/bundled-provider-host.ts",
						import.meta.url,
					),
				),
				[],
				{
					cwd: state,
					env: bundledEnvironment(state),
					execArgv: ["--import", import.meta.resolve("tsx")],
					stdio: ["ignore", "ignore", "ignore", "ipc"],
				},
			);
			children.push(child);
			return child;
		});
		onTestFinished(async () => {
			for (const child of children) {
				if (child.exitCode !== null || child.signalCode !== null) continue;
				const exited = once(child, "exit");
				client.close();
				await exited;
			}
		});
		await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "home", "export default () => <h1>Command fixture</h1>");
		writeDesignFile(root, "frames/home/frame.json", '{"w":600,"h":2600}');
		const uiDir = await builtUi();
		const daemon = await serveDaemon({
			spoolDir,
			version: "0.0.0-test",
			host: "127.0.0.1",
			port: 0,
			uiDir,
			agentEngines: [createSpoolEngine(directory, client)],
		});
		onTestFinished(() => daemon.close());
		const browser = await testBrowser();
		const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
		await page.goto(`${daemon.url}/p/${encodeURIComponent(name)}`);
		await page.locator('[data-dock-glyph="agent"]').click();
		const field = page.locator("[data-agent-rail] textarea");
		const rail = page.locator("[data-agent-rail]");
		const send = async (command: string, extra: Record<string, unknown> = {}) => {
			await field.fill(
				`file tools: ${JSON.stringify([{ name: "bash", arguments: { command, description: "Run browser check", ...extra } }])}`,
			);
			await field.press("Enter");
		};
		const settled = async () => {
			await expect
				.poll(() => page.getByRole("button", { name: "stop", exact: true }).count(), { timeout: 30_000 })
				.toBe(0);
		};
		const shot = async (name: string) => {
			if (!process.env.SPOOL_TEST_SHOTS) return;
			mkdirSync(process.env.SPOOL_TEST_SHOTS, { recursive: true });
			await page.screenshot({ path: join(process.env.SPOOL_TEST_SHOTS, `${name}.png`), animations: "disabled" });
		};
		if (!unavailable) {
			await send("spool shot home");
			await expect
				.poll(() => rail.locator('img[src^="data:image/png"]').count(), { timeout: 30_000 })
				.toBeGreaterThan(1);
			await settled();
			expect(await page.locator("[data-agent-ask]").count()).toBe(0);
			await shot("command-shot-slices");
		}
		await send("printf once > outside-once", unavailable ? {} : { unsandboxed: true });
		const open = page.locator('[data-agent-ask="open"]');
		await open.waitFor();
		expect(await open.textContent()).toContain("Allow commands to read and change files your account can access?");
		expect(await open.locator("code").textContent()).toBe("printf once > outside-once");
		expect(await open.textContent()).toContain(
			unavailable ? "spool can’t restrict commands to design/ on this computer." : "Allow commands",
		);
		const tops = await open
			.locator("[data-agent-option]")
			.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
		expect(new Set(tops).size).toBe(1);
		await shot(unavailable ? "access-command-unavailable" : "access-command");
		await open.getByRole("button", { name: "change permissions…" }).click();
		expect(existsSync(join(root, "outside-once"))).toBe(false);
		await page.keyboard.press("Escape");
		await open.getByRole("button", { name: "allow once", exact: true }).click();
		await settled();
		expect(readFileSync(join(root, "outside-once"), "utf8")).toBe("once");
		expect(await rail.textContent()).toContain("allowed once");
		await send("printf grant > outside-grant", unavailable ? {} : { unsandboxed: true });
		await open.waitFor();
		await open.getByRole("button", { name: "for this thread", exact: true }).click();
		await settled();
		expect(await rail.textContent()).toContain("commands allowed for this thread");
		await shot("access-command-granted");
		await send("printf reused > outside-reused");
		await expect.poll(() => existsSync(join(root, "outside-reused"))).toBe(true);
		await settled();
		expect(await open.count()).toBe(0);
	},
);
