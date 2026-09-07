import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { fixtureAgentExecutor, makeTempDir, readModelsReply, serveProject, writeFrame } from "../test-helpers";
import { createClaudeEngine } from "./agent-engine-claude";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { readThreads } from "./agent-threads";

it("recovers a completed real edit through renewal and rate limits in the served canvas, preserving the next draft", {
	timeout: 180_000,
}, async () => {
	const directory = join(makeTempDir(), "bundled");
	const children: ChildProcess[] = [];
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-recovery-provider-host.ts", import.meta.url)), [], {
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
	await client.request({ kind: "connect", provider: "openai", key: "old-secret" });
	await client.request({ kind: "connect", provider: "anthropic", key: "other-secret" });
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir, agentEngines: [createSpoolEngine(directory, client)] });
	writeFrame(project.root, "home", "export default () => <h1>Original title</h1>");
	await build({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await page.addInitScript(() => localStorage.setItem("spool.rail.agent.width", "420"));
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-dock-glyph="agent"]').click();
	const rail = page.locator("[data-agent-rail]");
	const field = rail.locator("textarea");
	const calls = () =>
		readFileSync(join(directory, "provider-calls.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
	const failure = (message: string) =>
		writeFileSync(join(directory, "failure.json"), JSON.stringify({ afterTool: true, afterMutation: true, message }));
	const shot = async (name: string) => {
		if (process.env.SPOOL_TEST_SHOTS) {
			mkdirSync(process.env.SPOOL_TEST_SHOTS, { recursive: true });
			await page.screenshot({ path: join(process.env.SPOOL_TEST_SHOTS, `${name}.png`), animations: "disabled" });
		}
	};
	failure("401 Invalid API key old-secret");
	const prompt =
		'file tools: [{"name":"read","arguments":{"path":"design/frames/home/frame.tsx"}},{"name":"edit","arguments":{"path":"design/frames/home/frame.tsx","edits":[{"oldText":"Original title","newText":"Updated title"}]}}]';
	await field.fill(prompt);
	await field.press("Enter");
	await rail.locator('[data-recovery="login"]').waitFor();
	expect(readFileSync(join(project.root, "design/frames/home/frame.tsx"), "utf8")).toContain("Updated title");
	expect(await rail.locator('[data-agent-jump="home"]').count()).toBe(2);
	await field.fill("Keep the total aligned with the items.");
	await field.press("Enter");
	expect(await field.inputValue()).toBe("Keep the total aligned with the items.");
	const stored = async () => readThreads(project.spoolDir, project.root);
	await expect.poll(async () => JSON.stringify(await stored()), { timeout: 5000 }).toContain("Keep the total aligned");
	const before = await stored();
	const firstHost = children[0];
	if (!firstHost) throw new Error("Missing host");
	const exited = once(firstHost, "exit");
	firstHost.kill();
	await exited;
	await client.request({ kind: "account" });
	expect(calls()).toHaveLength(2);
	await page.reload();
	await rail.locator('[data-recovery="login"]').waitFor();
	expect(await field.inputValue()).toBe("Keep the total aligned with the items.");
	expect(await rail.locator('[data-agent-jump="home"]').count()).toBe(2);
	await rail.getByRole("button", { name: "sign in again", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Connect an account", exact: true });
	await shot("login-list-renew");
	await dialog.getByRole("button", { name: "Sign in again", exact: true }).click();
	await dialog.locator("input").fill("still-invalid-secret");
	await dialog.locator("input").press("Enter");
	await expect.poll(() => dialog.textContent()).toContain("connected");
	await dialog.getByRole("button", { name: "Done", exact: true }).click();
	await rail.locator('[data-recovery="login"]').waitFor();
	expect(calls()).toHaveLength(2);
	failure('429 {"error":{"scope":"account","resets_at":2000000000,"message":"old-secret"}}');
	await rail.getByRole("button", { name: "sign in again", exact: true }).click();
	await dialog.getByRole("button", { name: "Sign in again", exact: true }).click();
	await dialog.locator("input").fill("renewed-secret");
	await dialog.locator("input").press("Enter");
	await expect.poll(() => dialog.textContent()).toContain("connected");
	await dialog.getByRole("button", { name: "Done", exact: true }).click();
	await rail.locator('[data-recovery="limit"]').waitFor();
	await shot("limits-rail-known");
	expect(await rail.locator('[data-recovery="limit"]').textContent()).toContain("Try again at");
	await rail.getByRole("button", { name: "choose model", exact: true }).click();
	const modelMenu = rail.locator("[data-agent-model-menu]:not([inert] *)");
	await modelMenu.waitFor({ state: "visible" });
	const usage = modelMenu.locator("[data-agent-usage]");
	await expect.poll(() => usage.textContent()).toContain("OpenAI API key limit reached · resets");
	const usageBox = await usage.boundingBox();
	const connectBox = await modelMenu.getByRole("button", { name: "Connect account…", exact: true }).boundingBox();
	expect(usageBox?.y).toBeGreaterThanOrEqual((connectBox?.y ?? Infinity) + (connectBox?.height ?? 0));
	await shot("limits-rail-models");
	// Recovery and permission controls share one footer menu without consuming
	// the held request or changing the independently saved next draft.
	await rail.locator("[data-permission-trigger]").click();
	await modelMenu.waitFor({ state: "hidden" });
	const permissionMenu = rail.getByRole("menu", { name: "Agent permissions", exact: true });
	await permissionMenu.waitFor({ state: "visible" });
	expect(await field.inputValue()).toBe("Keep the total aligned with the items.");
	expect(calls()).toHaveLength(2);
	await permissionMenu.press("Escape");
	await permissionMenu.waitFor({ state: "hidden" });
	await rail.getByRole("button", { name: "choose model", exact: true }).click();
	await modelMenu.waitFor({ state: "visible" });
	await expect.poll(() => usage.textContent()).toContain("OpenAI API key limit reached · resets");
	expect(await permissionMenu.count()).toBe(0);
	await modelMenu.press("Escape");
	await modelMenu.getByRole("button", { name: "Find a model…", exact: true }).waitFor();
	await modelMenu.press("Escape");
	await modelMenu.waitFor({ state: "hidden" });
	failure("429 Rate limit reached");
	await rail.getByRole("button", { name: "retry", exact: true }).click();
	await expect.poll(() => rail.locator('[data-recovery="limit"]').textContent()).not.toContain("Try again at");
	await shot("limits-rail-unknown");
	await rail.getByRole("button", { name: "choose model", exact: true }).click();
	await modelMenu.waitFor({ state: "visible" });
	await expect.poll(() => usage.textContent()).toBe("OpenAI API key limit reached");
	await rail
		.locator("[data-agent-model-menu] button")
		.filter({ hasText: "Second image model" })
		.filter({ hasText: "OpenAI API key" })
		.first()
		.click();
	await rail.locator('[data-recovery="limit"]').waitFor();
	expect(await rail.getByRole("button", { name: "continue with this model", exact: true }).count()).toBe(0);
	await rail.getByRole("button", { name: "retry", exact: true }).click();
	await rail.locator('[data-recovery="limit"]').waitFor();
	expect(calls()).toHaveLength(2);
	await rail.getByRole("button", { name: "choose model", exact: true }).click();
	await rail
		.locator("[data-agent-model-menu] button")
		.filter({ hasText: "Test image model" })
		.filter({ hasText: "Anthropic API key" })
		.first()
		.click();
	await rail.getByRole("button", { name: "continue with this model", exact: true }).waitFor({ state: "visible" });
	await modelMenu.waitFor({ state: "hidden" });
	await expect.poll(() => rail.locator("[data-agent-model]").textContent()).toContain("Test image model");
	expect(await field.inputValue()).toBe("Keep the total aligned with the items.");
	expect(calls()).toHaveLength(2);
	await shot("limits-rail-continue");
	await rail.getByRole("button", { name: "continue with this model", exact: true }).click();
	await expect.poll(() => rail.textContent()).toContain("Saved reply 1.");
	expect(await field.inputValue()).toBe("Keep the total aligned with the items.");
	const final = calls().at(-1);
	expect(final.messages.filter((message: { role: string }) => message.role === "user")).toHaveLength(1);
	expect(final.messages.filter((message: { role: string }) => message.role === "toolResult")).toHaveLength(2);
	expect(JSON.stringify(final)).not.toContain("Keep the total aligned");
	expect(readFileSync(join(project.root, "design/frames/home/frame.tsx"), "utf8")).toContain("Updated title");
	const after = await stored();
	expect(JSON.stringify(after)).toContain("Keep the total aligned");
	for (const secret of ["old-secret", "other-secret", "still-invalid-secret", "renewed-secret"]) {
		expect(JSON.stringify(after)).not.toContain(secret);
		expect(await rail.textContent()).not.toContain(secret);
	}
	expect(after[0]?.id).toBe(before[0]?.id);
	expect(after[0]?.engine).toBe("spool");
	expect(after[0]?.session).toEqual(before[0]?.session);

	await rail.getByRole("button", { name: "Choose model", exact: true }).click();
	await rail.getByRole("button", { name: "Find a model…", exact: true }).click();
	await rail.locator('[data-model-offer="spool/openai/api_key/spool-test"] [data-agent-model-row]').click();
	failure("401 Unauthorized renewed-secret");
	await field.press("Enter");
	await rail.locator('[data-recovery="login"]').waitFor();
	await field.fill("The separate next draft after renewal.");
	rmSync(join(directory, "failure.json"));
	await rail.getByRole("button", { name: "sign in again", exact: true }).click();
	await dialog.getByRole("button", { name: "Sign in again", exact: true }).click();
	await dialog.locator("input").fill("working-secret");
	await dialog.locator("input").press("Enter");
	await expect.poll(() => dialog.textContent()).toContain("connected");
	await dialog.getByRole("button", { name: "Done", exact: true }).click();
	await expect.poll(() => rail.textContent()).toContain("Saved reply 2.");
	expect(await field.inputValue()).toBe("The separate next draft after renewal.");
	expect(calls()).toHaveLength(4);
	expect(
		calls()
			.at(-1)
			.messages.filter((message: { role: string }) => message.role === "toolResult"),
	).toHaveLength(2);
	expect(
		calls()
			.at(-1)
			.messages.filter((message: { role: string }) => message.role === "user"),
	).toHaveLength(2);
	expect(JSON.stringify(await stored())).not.toContain("working-secret");
});

it("keeps Claude setup and login in its own thread through failed checks and explicit recovery", {
	timeout: 180_000,
}, async () => {
	let installed = false;
	let signedIn = false;
	const prompts: string[] = [];
	const fixture = fixtureAgentExecutor(
		(proc, line) => {
			const wire = JSON.parse(line);
			if (wire.type === "control_request") {
				proc.emit(
					JSON.stringify({
						type: "control_response",
						response: { subtype: "success", request_id: wire.request_id, response: readModelsReply() },
					}),
				);
				return;
			}
			if (wire.type !== "user") return;
			const text = wire.message.content.map((block: { text?: string }) => block.text ?? "").join("");
			if (text.startsWith("/")) {
				proc.emit(
					JSON.stringify({ type: "system", subtype: "init", model: "claude-fable-5", session_id: "fixture" }),
				);
				proc.emit(
					JSON.stringify({
						type: "result",
						subtype: "success",
						result: text.startsWith("/model")
							? "Current model: Default (recommended)"
							: "Current effort level: high",
					}),
				);
				return;
			}
			prompts.push(text);
			if (!signedIn) {
				proc.exit(1, "Not logged in · Please run /login");
				return;
			}
			proc.emit(
				JSON.stringify({
					type: "assistant",
					message: {
						role: "assistant",
						content: [{ type: "text", text: "The receipt has more breathing room." }],
					},
				}),
			);
			proc.emit(JSON.stringify({ type: "result", subtype: "success" }));
		},
		(proc) => {
			if (proc.spawn.args.includes("status"))
				proc.emit(JSON.stringify({ loggedIn: signedIn, email: signedIn ? "fixture@example.test" : undefined }));
			proc.exit(0);
		},
	);
	const directory = join(makeTempDir(), "bundled");
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({
		uiDir,
		agentEngines: [createClaudeEngine(fixture.executor, () => installed), createSpoolEngine(directory)],
	});
	writeFrame(project.root, "home", "export default () => <h1>Receipt</h1>");
	await build({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await page.addInitScript(() => localStorage.setItem("spool.rail.agent.width", "420"));
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-dock-glyph="agent"]').click();
	const rail = page.locator("[data-agent-rail]");
	const field = rail.locator("textarea");
	const trigger = rail.getByRole("button", { name: "Choose agent for this new chat", exact: true });
	const shot = async (name: string) => {
		if (process.env.SPOOL_TEST_SHOTS) {
			mkdirSync(process.env.SPOOL_TEST_SHOTS, { recursive: true });
			await page.screenshot({ path: join(process.env.SPOOL_TEST_SHOTS, `${name}.png`), animations: "disabled" });
		}
	};
	await trigger.click();
	await expect.poll(() => rail.locator('[data-agent-engine="claude"]').textContent()).toContain("Not installed");
	await shot("claude-rail-choice");
	await rail.locator('[data-agent-engine="claude"]').click();
	await rail.locator('[data-recovery="claude"]').waitFor();
	await shot("claude-rail-missing");
	expect(await rail.getByRole("link", { name: "Install Claude Code" }).getAttribute("href")).toBe(
		"https://code.claude.com/docs/en/quickstart",
	);
	await field.fill("Make the receipt a little more spacious.");
	await field.press("Enter");
	expect(prompts).toHaveLength(0);
	await rail.getByRole("button", { name: "check again", exact: true }).click();
	await expect.poll(() => rail.textContent()).toContain("Claude Code is still not installed.");
	installed = true;
	await rail.getByRole("button", { name: "check again", exact: true }).click();
	await expect.poll(() => rail.locator('[data-recovery="claude"]').count()).toBe(0);
	await shot("claude-rail-first-send");
	await field.press("Enter");
	await rail.locator('[data-recovery="claude"]').waitFor();
	await field.fill("Keep the total aligned with the items.");
	await rail.getByRole("button", { name: "check again", exact: true }).click();
	await expect.poll(() => rail.textContent()).toContain("still signed out");
	await shot("claude-rail-login");
	await rail.getByRole("button", { name: "check again", exact: true }).click();
	expect(prompts).toHaveLength(1);
	await expect
		.poll(() => readThreads(project.spoolDir, project.root)[0]?.draft, { timeout: 5000 })
		.toBe("Keep the total aligned with the items.");
	const thread = readThreads(project.spoolDir, project.root)[0];
	await page.reload();
	await rail.locator('[data-recovery="claude"]').waitFor();
	expect(await field.inputValue()).toBe("Keep the total aligned with the items.");
	signedIn = true;
	await rail.getByRole("button", { name: "check again", exact: true }).dblclick();
	await expect.poll(() => rail.textContent()).toContain("The receipt has more breathing room.");
	expect(prompts).toHaveLength(2);
	expect(prompts[1]).toBe(prompts[0]);
	expect(await field.inputValue()).toBe("Keep the total aligned with the items.");
	await shot("claude-rail-ready");
	installed = false;
	await page.reload();
	await rail.locator('[data-recovery="claude"]').waitFor();
	expect(await rail.textContent()).toContain("The receipt has more breathing room.");
	await rail.getByRole("button", { name: "new thread with spool", exact: true }).click();
	await expect.poll(() => trigger.textContent()).toContain("spool");
	expect(await rail.locator('[data-recovery="claude"]').count()).toBe(0);
	expect(readThreads(project.spoolDir, project.root).find((entry) => entry.id === thread?.id)?.engine).toBe("claude");
});
