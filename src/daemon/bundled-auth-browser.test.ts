import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { readThreads } from "./agent-threads";

it("renders every generic provider interaction through the shared host and keeps credentials out of rail history", {
	timeout: 180_000,
}, async () => {
	const directory = makeTempDir();
	const children: ChildProcess[] = [];
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-auth-provider-host.ts", import.meta.url)), [], {
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
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, agentEngines: [createSpoolEngine(directory, client)] });
	writeFrame(project.root, "home", "export default function Home() { return <h1>Reference frame</h1>; }");
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":600,"h":400}');
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	const shots = process.env.SPOOL_TEST_SHOTS;
	const shot = async (name: string) => {
		if (shots !== undefined) {
			mkdirSync(shots, { recursive: true });
			await page.screenshot({ path: join(shots, `${name}.png`), animations: "disabled" });
		}
	};
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-dock-glyph="agent"]').click();
	const field = page.locator("[data-agent-rail] textarea");
	await expect
		.poll(() => page.getByRole("button", { name: "Choose agent for this new chat" }).textContent())
		.toContain("spool");

	await field.fill("keep my model and draft");
	const connect = page.getByRole("button", { name: "Connect account", exact: true });
	await connect.click();
	const dialog = page.getByRole("dialog", { name: "Connect an account" });
	await dialog.waitFor();
	expect(await page.locator("[data-agent-model-menu]").count()).toBe(0);
	expect(await connect.getAttribute("aria-expanded")).toBeNull();
	expect(await connect.locator("svg").count()).toBe(0);
	await dialog.press("Escape");
	expect(await connect.evaluate((element) => element === document.activeElement)).toBe(true);
	await field.press("Enter");
	await dialog.waitFor();
	expect(Math.round((await dialog.boundingBox())?.width ?? 0)).toBe(380);
	await shot("login-list-idle");
	await dialog.getByRole("menuitem", { name: "Sign in with ChatGPT", exact: true }).click();
	await dialog.getByRole("button", { name: "Browser login", exact: true }).waitFor();
	await shot("login-list-select");
	await dialog.getByRole("button", { name: "Browser login", exact: true }).click();
	await dialog.getByRole("button", { name: "Open browser", exact: true }).waitFor();
	await shot("login-list-browser");
	await page
		.context()
		.route("https://example.invalid/**", (route) => route.fulfill({ body: "Provider sign-in fixture" }));
	const popupOpened = page.waitForEvent("popup");
	await dialog.getByRole("button", { name: "Open browser", exact: true }).click();
	const popup = await popupOpened;
	await popup.waitForLoadState();
	expect(popup.url()).toBe("https://example.invalid/login");
	await popup.close();
	await dialog.locator("input").waitFor();
	expect(await dialog.getByRole("button", { name: "Paste a code instead" }).count()).toBe(0);
	await dialog.locator("input").waitFor();
	await shot("login-list-manual");
	expect(await dialog.getByRole("button", { name: "Back to browser sign-in" }).count()).toBe(0);
	await dialog.getByRole("button", { name: "Back", exact: true }).click();
	await dialog.getByRole("button", { name: "Open browser again", exact: true }).waitFor();
	await shot("login-list-browser-opened");
	const reopened = page.waitForEvent("popup");
	await dialog.getByRole("button", { name: "Open browser again", exact: true }).click();
	await (await reopened).close();
	await dialog.locator("input").waitFor();
	await dialog.locator("input").fill("private-authorization-code");
	await dialog.getByRole("button", { name: "Continue", exact: true }).click();
	await dialog.getByLabel("Account name", { exact: true }).waitFor();
	await shot("login-list-text");
	await dialog.getByLabel("Account name", { exact: true }).fill("My account");
	await dialog.getByRole("button", { name: "Continue", exact: true }).click();
	await dialog.getByLabel("Verification secret", { exact: true }).waitFor();
	expect(await dialog.locator("input").getAttribute("type")).toBe("password");
	await shot("login-list-secret");
	await dialog.locator("input").fill("private-verification-secret");
	await dialog.getByRole("button", { name: "Connect", exact: true }).click();
	await dialog.getByRole("status").filter({ hasText: "finishing sign-in" }).waitFor();
	await shot("login-list-progress");
	await expect.poll(() => dialog.textContent(), { timeout: 15_000 }).toContain("ChatGPT connected");
	await shot("login-list-connected");
	await dialog.getByRole("button", { name: "Done", exact: true }).click();
	expect(await field.inputValue()).toBe("keep my model and draft");
	await field.fill("hello through ChatGPT");
	await field.press("Enter");
	await expect
		.poll(() => page.locator("[data-agent-rail]").textContent(), { timeout: 15_000 })
		.toContain("Saved reply 1.");
	const thread = readThreads(project.spoolDir, project.root)[0];
	if (!thread) throw new Error("Missing thread");
	const history = readFileSync(join(directory, "sessions", `${thread.session.id}.jsonl`), "utf8");
	expect(history).not.toMatch(
		/private-authorization-code|private-verification-secret|fixture-access-secret|fixture-refresh-secret/,
	);
	expect(JSON.stringify(thread)).not.toMatch(
		/private-authorization-code|private-verification-secret|fixture-access-secret|fixture-refresh-secret/,
	);
	await field.fill("retain this next draft");
	await page.getByRole("button", { name: "Choose model" }).click();
	await page.getByRole("button", { name: "Find a model…", exact: true }).click();
	await page.getByRole("button", { name: "Connect account…", exact: true }).click();
	await dialog.getByRole("menuitem", { name: "Sign in with Grok", exact: true }).click();
	await dialog.getByRole("button", { name: "Device code", exact: true }).click();
	await dialog.getByText("SPOOL-4826", { exact: true }).waitFor();
	await shot("login-list-device");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect.poll(() => dialog.textContent()).toContain("Sign-in canceled");
	await new Promise((resolve) => setTimeout(resolve, 1600));
	expect(readFileSync(join(directory, "credentials.json"), "utf8")).not.toContain('"xai"');
	await dialog.getByRole("button", { name: "Try again", exact: true }).click();
	await dialog.getByRole("button", { name: "Device code", exact: true }).click();
	await dialog.getByLabel("Account name", { exact: true }).fill("Other account");
	await dialog.getByRole("button", { name: "Continue", exact: true }).click();
	await dialog.getByLabel("Verification secret", { exact: true }).fill("second-private-secret");
	await dialog.getByRole("button", { name: "Connect", exact: true }).click();
	await expect.poll(() => dialog.textContent(), { timeout: 15_000 }).toContain("Grok connected");
	await dialog.getByRole("button", { name: "Disconnect", exact: true }).click();
	await dialog.getByRole("menuitem", { name: "Sign in with Grok", exact: true }).waitFor();
	expect(readFileSync(join(directory, "credentials.json"), "utf8")).not.toContain('"xai"');
	const buttons = dialog.locator("button:not(:disabled)");
	await buttons.last().focus();
	await page.keyboard.press("Tab");
	expect(await buttons.first().evaluate((element) => document.activeElement === element)).toBe(true);
	await page.keyboard.press("Shift+Tab");
	expect(await buttons.last().evaluate((element) => document.activeElement === element)).toBe(true);
	await page.keyboard.press("Escape");
	await expect.poll(() => dialog.count()).toBe(0);
	expect(
		await page
			.getByRole("button", { name: "Choose model" })
			.evaluate((element) => element === document.activeElement),
	).toBe(true);
	expect(await field.inputValue()).toBe("retain this next draft");
	expect(readThreads(project.spoolDir, project.root)[0]?.id).toBe(thread.id);
	expect(readThreads(project.spoolDir, project.root)[0]?.ask).toEqual(thread.ask);
});
