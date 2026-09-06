import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { readThreads } from "./agent-threads";

it("connects through the rendered canvas, preserves image and queued selection, stops and resumes the exact host session", {
	timeout: 180_000,
}, async () => {
	const directory = makeTempDir();
	const children: ChildProcess[] = [];
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-provider-host.ts", import.meta.url)), [], {
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
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir, agentEngines: [createSpoolEngine(directory, client)] });
	writeFrame(project.root, "home", "export default function Home() { return <h1>Reference frame</h1>; }");
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":600,"h":400}');
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	await build({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
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
	await field.fill("keep this draft");
	await field.press("Enter");
	const dialog = page.getByRole("dialog", { name: "Connect an account" });
	await expect.poll(() => dialog.count()).toBe(1);
	expect(Math.round((await dialog.boundingBox())?.width ?? 0)).toBe(380);
	await shot("login-list-idle");
	await dialog.getByRole("menuitem", { name: "OpenAI API key", exact: true }).click();
	await dialog.locator("input").fill("discard-me");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect.poll(() => dialog.textContent(), { timeout: 15_000 }).toContain("Sign-in canceled");
	await shot("login-list-canceled");
	await dialog.getByRole("button", { name: "Try again" }).click();
	await dialog.locator("input").waitFor();
	await shot("login-list-key");
	await dialog.locator("input").fill("fixture-key");
	await dialog.getByRole("button", { name: "Connect", exact: true }).click();
	await expect.poll(() => dialog.textContent(), { timeout: 15_000 }).toContain("OpenAI connected");
	await shot("login-list-connected");
	await dialog.getByRole("button", { name: "Done", exact: true }).click();
	expect(await field.inputValue()).toBe("keep this draft");
	await page.getByRole("button", { name: "Choose model" }).click();
	await page.getByRole("button", { name: "Find a model…", exact: true }).click();
	await expect
		.poll(() => page.locator("[data-combined-menu]:not([inert] *)").textContent())
		.toContain("Test image model");
	await shot("engine-combined-choosing");
	await page.locator('[data-agent-model-row="Test image model"]:not([inert] *)').click();
	const frameBox = await page.locator('iframe[title="home"]').boundingBox();
	if (frameBox === null) throw new Error("Missing frame");
	await page.mouse.click(frameBox.x + 30, frameBox.y + 30);
	await page.locator('[data-agent-chip="home"]').waitFor();
	const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
	await field.evaluate((element, data) => {
		const transfer = new DataTransfer();
		transfer.items.add(
			new File([Uint8Array.from(atob(data), (character) => character.charCodeAt(0))], "reference.png", {
				type: "image/png",
			}),
		);
		element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer }));
	}, png);
	await field.fill("hold this turn");
	await field.press("Enter");
	const calls = () =>
		existsSync(join(directory, "provider-calls.jsonl"))
			? readFileSync(join(directory, "provider-calls.jsonl"), "utf8").trim().split("\n")
			: [];
	await expect.poll(() => calls().length, { timeout: 15_000 }).toBe(1);
	expect(calls()[0]).toContain(png);
	expect(calls()[0]).toContain("<selection>");
	expect(calls()[0]).toContain("home");
	await field.fill("queued with this selection");
	await field.press("Enter");
	await expect.poll(() => readThreads(project.spoolDir, project.root)[0]?.queued.length).toBe(1);
	const stored = readThreads(project.spoolDir, project.root)[0];
	if (stored === undefined) throw new Error("Missing thread");
	expect(stored.engine).toBe("spool");
	expect(stored.session.id).not.toBe(stored.id);
	expect(JSON.stringify(stored.queued)).toContain("home");
	const replay = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/agent/turn/${stored.id}`, {
		headers: { "X-Spool-Control": project.controlToken },
	});
	const reader = replay.body?.getReader();
	if (reader === undefined) throw new Error("Missing replay");
	let wire = "";
	while (!wire.includes('"kind":"say"')) {
		const chunk = await reader.read();
		if (chunk.done) break;
		wire += new TextDecoder().decode(chunk.value);
	}
	await reader.cancel();
	expect(wire).toContain("Saved reply 1.");
	await page.reload();
	await expect
		.poll(() => page.locator("[data-agent-rail]").textContent(), { timeout: 15_000 })
		.toContain("Saved reply 1.");
	expect(calls()).toHaveLength(1);
	await page.getByRole("button", { name: /stop.*⎋/ }).click();
	await expect.poll(() => page.getByRole("button", { name: /stop.*⎋/ }).count()).toBe(0);
	await expect.poll(() => readThreads(project.spoolDir, project.root)[0]?.queued.length).toBe(0);
	await field.fill("continue the same thread");
	await field.press("Enter");
	await expect.poll(() => calls().length).toBe(2);
	await expect.poll(() => page.locator("[data-agent-rail]").textContent()).toContain("Saved reply 2.");
	expect(calls()[1]).toContain(png);
	expect(readThreads(project.spoolDir, project.root)[0]?.session).toEqual(stored.session);
	await shot("engine-combined-thread");
	expect(await page.locator("[data-agent-rail]").textContent()).not.toContain("fixture-key");
	await page.getByRole("button", { name: "New chat", exact: true }).click();
	await shot("engine-new-chat-choosing");
	await page.getByRole("button", { name: "New chat with Claude Code" }).click();
	await expect
		.poll(() => page.getByRole("button", { name: "Choose agent for this new chat" }).textContent())
		.toContain("Claude Code");
	expect(readThreads(project.spoolDir, project.root)[0]?.session).toEqual(stored.session);
	await page.reload();
	await expect.poll(() => page.locator("[data-agent-rail]").textContent()).toContain("Saved reply 2.");
	await page.getByRole("button", { name: "New chat", exact: true }).click();
	await page.getByRole("button", { name: "New chat with Claude Code" }).click();
	await expect
		.poll(() => page.getByRole("button", { name: "Choose agent for this new chat" }).textContent())
		.toContain("Claude Code");
	expect(calls()).toHaveLength(2);
});
