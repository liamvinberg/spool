import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initProject } from "../init";
import { readRegistry } from "../registry";
import { testBrowser } from "../test-browser";
import {
	builtUi,
	type FakeAgentProc,
	fixtureAgentExecutor,
	makeTempDir,
	readModelsReply,
	serveProject,
} from "../test-helpers";
import { createSettingsStore } from "./settings";

it("starts a project at once with the Agent pane out, names it from the first ask, and opens existing work from Open… and a paste", {
	timeout: 120_000,
}, async () => {
	// the naming question is answered when the test says; the turn after it answers the model probes and works on
	const naming: FakeAgentProc[] = [];
	const agent = fixtureAgentExecutor(
		(proc, line) => {
			const input = JSON.parse(line);
			if (input.type === "control_request")
				proc.emit(
					JSON.stringify({
						type: "control_response",
						response: { subtype: "success", request_id: input.request_id, response: readModelsReply() },
					}),
				);
			else if (input.type === "user") {
				proc.emit(
					JSON.stringify({ type: "system", subtype: "init", session_id: "fixture", model: "claude-fable-5" }),
				);
				proc.emit(JSON.stringify({ type: "system", subtype: "status", status: "requesting" }));
			}
		},
		(proc) => {
			if (proc.spawn.args.includes("-p")) naming.push(proc);
		},
	);
	const uiDir = await builtUi();
	const trashed: string[] = [];
	const project = await serveProject({
		uiDir,
		agentExecutor: agent.executor,
		agentLook: () => true,
		moveToTrash: async (paths) => {
			for (const path of paths) rmSync(path, { recursive: true });
			trashed.push(...paths);
		},
	});
	const parent = realpathSync(makeTempDir());
	const codebase = join(parent, "existing-codebase");
	mkdirSync(join(codebase, "src"), { recursive: true });
	for (let i = 0; i < 20; i++) mkdirSync(join(codebase, `folder-${i}`));
	writeFileSync(join(codebase, "src", "index.ts"), "export const keep = true;\n");
	execFileSync("git", ["init", "-q", "-b", "main", codebase]);
	const shared = join(parent, "shared-project");
	mkdirSync(shared);
	initProject(shared, makeTempDir());
	const sharedCanvas = readFileSync(join(shared, "design", "canvas.json"), "utf8");
	createSettingsStore(project.spoolDir).write("projects.location", parent);
	const browser = await testBrowser();
	const page = await browser.newPage({
		viewport: { width: 1360, height: 900 },
		reducedMotion: "reduce",
		colorScheme: "dark",
	});
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(project.url);
	await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();

	await page.locator(".pj-heading").getByRole("button", { name: "New project", exact: true }).click();
	await page.getByRole("heading", { name: "Your canvas is ready.", exact: true }).waitFor();
	expect(await page.locator("dialog").count()).toBe(0);
	expect(existsSync(join(parent, "untitled", "design", "canvas.json"))).toBe(true);
	// the composer stands ready in the Agent pane, and the person's focus is still theirs
	const rail = page.locator("[data-agent-rail]");
	const composer = rail.locator("textarea");
	await composer.waitFor();
	expect(await composer.evaluate((element) => element === document.activeElement)).toBe(false);

	// the first ask names the project before its turn starts, and the pane stays out through the rename
	await composer.fill("A tide planner for sea kayakers");
	await composer.press("Enter");
	await rail.getByText("Naming the project", { exact: true }).waitFor();
	await expect.poll(() => naming.length).toBe(1);
	naming[0]?.emit("tide-planner");
	naming[0]?.exit(0);
	await page.getByRole("button", { name: "Close tide-planner", exact: true }).waitFor();
	expect(existsSync(join(parent, "tide-planner", "design", "canvas.json"))).toBe(true);
	await rail.locator('[data-agent-turn-line="running"]').waitFor();
	expect(await rail.getByText("Naming the project", { exact: true }).count()).toBe(0);
	expect(new URL(page.url()).pathname).toBe("/p/tide-planner");

	// one closed untitled and empty goes to the Trash behind an Undo, which brings it back
	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.locator(".pj-heading").getByRole("button", { name: "New project", exact: true }).click();
	await page.getByRole("button", { name: "Close untitled", exact: true }).click();
	await page.getByText("Moved untitled to Trash", { exact: true }).waitFor();
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	await page.getByRole("button", { name: "Close untitled", exact: true }).click();
	await page.getByText("Moved untitled to Trash", { exact: true }).waitFor();
	await expect.poll(() => trashed, { timeout: 10_000 }).toEqual([join(parent, "untitled")]);
	expect(readRegistry(project.spoolDir).projects.some((item) => item.root === join(parent, "untitled"))).toBe(false);

	// Open… reads what it is given: a code folder asks first, and nothing is made until it is asked
	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.locator(".pj-heading").getByRole("button", { name: "Open…", exact: true }).click();
	const chooser = page.getByRole("dialog", { name: "Open", exact: true });
	await chooser.getByRole("textbox").fill(join(codebase, "src"));
	await chooser.getByRole("button", { name: "Open", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "existing-codebase", exact: true });
	await sheet.getByText("No designs here yet, so its canvas starts empty.").waitFor();
	expect(existsSync(join(codebase, "design"))).toBe(false);
	await sheet.getByRole("button", { name: "Design in this folder", exact: true }).click();
	await page.getByRole("button", { name: "Close existing-codebase", exact: true }).waitFor();
	expect(existsSync(join(codebase, "design", "canvas.json"))).toBe(true);
	expect(readFileSync(join(codebase, "src", "index.ts"), "utf8")).toBe("export const keep = true;\n");

	// a path pasted on Home opens a project that has designs at once, with no sheet
	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.locator(".pj-heading").waitFor();
	await page.evaluate((path) => {
		const clipboardData = new DataTransfer();
		clipboardData.setData("text/plain", path);
		document.body.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
	}, shared);
	await page.getByRole("button", { name: "Close shared-project", exact: true }).waitFor();
	expect(await page.locator("dialog").count()).toBe(0);
	expect(readRegistry(project.spoolDir).projects.some((item) => item.root === shared)).toBe(true);
	expect(readFileSync(join(shared, "design", "canvas.json"), "utf8")).toBe(sharedCanvas);
	expect(errors).toEqual([]);
});
