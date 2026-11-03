import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
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

it("starts a project at once with the Agent pane out, names it from the first ask, and opens existing work from Open…", {
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
	const project = await serveProject({ uiDir, agentExecutor: agent.executor, agentLook: () => true });
	const parent = realpathSync(makeTempDir());
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

	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.locator(".pj-heading").getByRole("button", { name: "Open…", exact: true }).click();
	const picker = page.getByRole("dialog", { name: "Choose a project folder", exact: true });
	const search = picker.getByRole("textbox");
	await search.fill(shared);
	await picker.getByRole("button", { name: "Open project", exact: true }).waitFor();
	await search.press("Enter");
	await page.getByRole("button", { name: "Close shared-project", exact: true }).waitFor();
	expect(readRegistry(project.spoolDir).projects.some((item) => item.root === shared)).toBe(true);
	expect(readFileSync(join(shared, "design", "canvas.json"), "utf8")).toBe(sharedCanvas);
	expect(errors).toEqual([]);
});
