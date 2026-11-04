import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initProject } from "../init";
import { readRegistry } from "../registry";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { testBrowser } from "../test-browser";
import {
	builtUi,
	closeAfterTest,
	type FakeAgentProc,
	fixtureAgentExecutor,
	makeTempDir,
	readModelsReply,
	serveProject,
} from "../test-helpers";
import { serveDaemon } from "./server";
import { createSettingsStore } from "./settings";

it("starts a project at once with the Agent pane out, names it from its tab or the first ask, and opens existing work from Open… and a paste", {
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
	// the composer stands ready in the Agent pane, and the focus is in the tab's name, a field with "untitled" chosen
	const rail = page.locator("[data-agent-rail]");
	const composer = rail.locator("textarea");
	await composer.waitFor();
	expect(await composer.evaluate((element) => element === document.activeElement)).toBe(false);
	const tabName = page.getByRole("navigation", { name: "Open projects" }).getByRole("textbox");
	expect(
		await tabName.evaluate(
			(field: HTMLInputElement) =>
				field === document.activeElement && field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0),
		),
	).toBe("untitled");

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

	// a name typed in a new project's tab and taken by Enter moves its folder
	await page.getByRole("button", { name: "Home", exact: true }).click();
	await page.locator(".pj-heading").getByRole("button", { name: "New project", exact: true }).click();
	await tabName.waitFor();
	await page.keyboard.type("kelp-map");
	await page.keyboard.press("Enter");
	await page.getByRole("button", { name: "Close kelp-map", exact: true }).waitFor();
	expect(existsSync(join(parent, "kelp-map", "design", "canvas.json"))).toBe(true);
	expect(existsSync(join(parent, "untitled"))).toBe(false);
	// Rename… in the tab's menu makes the name a field again, and Esc leaves it as it was
	await page.getByRole("button", { name: "kelp-map", exact: true }).click({ button: "right" });
	await page.getByRole("menuitem", { name: "Rename…", exact: true }).click();
	await tabName.waitFor();
	await page.keyboard.type("kelp-chart");
	await page.keyboard.press("Escape");
	await tabName.waitFor({ state: "detached" });
	await page.getByRole("button", { name: "Close kelp-map", exact: true }).waitFor();
	expect(existsSync(join(parent, "kelp-chart"))).toBe(false);

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

it("starts a team project with its name ready to type, deletes an unused one by itself, and deletes one from the team", {
	timeout: 120_000,
}, async () => {
	const cloud = fakeTeam("devosurf", "Devosurf");
	const ada = cloud.machine("ada", "admin");
	const state = join(makeTempDir(), ".spool");
	const parent = realpathSync(makeTempDir());
	mkdirSync(state, { recursive: true });
	createSettingsStore(state).write("projects.location", parent);
	const trashed: string[] = [];
	const daemon = await serveDaemon({
		spoolDir: state,
		version: "0.0.0-test",
		host: "127.0.0.1",
		port: 0,
		uiDir: await builtUi(),
		cloud: ada.cloud,
		teamNotice: () => {},
		moveToTrash: async (paths) => {
			for (const path of paths) rmSync(path, { recursive: true });
			trashed.push(...paths);
		},
		// signed in as ada, so Home has her team to show
		cloudAccountServices: {
			origin: () => TEAM_ORIGIN,
			account: async () => ({
				accountId: "ada",
				email: "ada@example.test",
				name: "ada",
				sessionId: "s",
				expiresAt: Date.now() + 3_600_000,
			}),
			login: () => new Promise(() => {}),
			logout: async () => {},
			open: () => {},
		},
	});
	closeAfterTest(daemon);
	const page = await (await testBrowser()).newPage({
		viewport: { width: 1360, height: 900 },
		reducedMotion: "reduce",
	});
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${daemon.url}/devosurf`);
	const newProject = page.getByRole("main").getByRole("button", { name: "New project", exact: true });

	// a team's New opens with its name a field, as a local one does, and Enter renames it in the team
	await newProject.click();
	const tabName = page.getByRole("navigation", { name: "Open projects" }).getByRole("textbox");
	await tabName.waitFor();
	await page.keyboard.type("kelp-team");
	await page.keyboard.press("Enter");
	await page.getByRole("button", { name: "Close kelp-team", exact: true }).waitFor();
	expect(cloud.renames).toEqual([{ from: "devosurf/untitled", to: "devosurf/kelp-team", by: "ada" }]);
	expect(existsSync(join(parent, "devosurf", "kelp-team", "design", "canvas.json"))).toBe(true);

	// one closed untitled and empty is deleted from the team by itself once its toast drains
	await page.getByRole("button", { name: "Home", exact: true }).click();
	await newProject.click();
	await page.getByRole("button", { name: "Close untitled", exact: true }).click();
	await page.getByText("Deleted untitled", { exact: true }).waitFor();
	await expect.poll(() => trashed, { timeout: 10_000 }).toEqual([join(parent, "devosurf", "untitled")]);
	expect(cloud.has("untitled")).toBe(false);

	// Delete from the team, on its cover, asks first and takes it to the team's trash
	await page.getByRole("button", { name: "Close kelp-team", exact: true }).click();
	await page.getByRole("button", { name: "Manage kelp-team", exact: true }).click();
	await page.getByRole("menuitem", { name: "Delete from Devosurf…", exact: true }).click();
	const confirm = page.getByRole("dialog", { name: "Delete “kelp-team” from Devosurf?", exact: true });
	await confirm.getByRole("button", { name: "Delete from Devosurf", exact: true }).click();
	await expect.poll(() => cloud.inTrash("kelp-team"), { timeout: 10_000 }).toBe(true);
	expect(trashed).toContain(join(parent, "devosurf", "kelp-team"));
	expect(errors).toEqual([]);
});
