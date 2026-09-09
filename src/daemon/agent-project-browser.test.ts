import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, fixtureAgentExecutor, makeProject, readModelsReply, serveProject, writeFrame } from "../test-helpers";
import { readThreads } from "./agent-threads";

it("keeps working across projects and restores a reply completed while away", { timeout: 90_000 }, async () => {
	const agent = fixtureAgentExecutor((proc, line) => {
		const input = JSON.parse(line);
		if (input.type === "control_request") {
			proc.emit(
				JSON.stringify({
					type: "control_response",
					response: { subtype: "success", request_id: input.request_id, response: readModelsReply() },
				}),
			);
		} else if (input.type === "user") {
			proc.emit(JSON.stringify({ type: "system", subtype: "init", session_id: "fixture", model: "claude-fable-5" }));
			const text = input.message.content.map((block: { text?: string }) => block.text ?? "").join("");
			if (text.startsWith("/")) {
				proc.emit(
					JSON.stringify({
						type: "result",
						subtype: "success",
						result: text.startsWith("/model")
							? "Current model: Default (recommended)"
							: "Current effort level: high",
					}),
				);
			} else proc.emit(JSON.stringify({ type: "system", subtype: "status", status: "requesting" }));
		}
	});
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, agentExecutor: agent.executor, agentLook: () => true });
	const other = makeProject(project.spoolDir);
	writeFrame(project.root, "home", "export default () => <h1>Home</h1>");
	writeFrame(other.root, "other", "export default () => <h1>Other project</h1>");
	const browser = await testBrowser();
	const page = await browser.newPage();
	const url = `${project.url}/p/${encodeURIComponent(project.name)}`;
	await page.goto(url);
	await page.locator('[data-dock-glyph="agent"]').click();
	const rail = page.locator("[data-agent-rail]");
	const field = rail.locator("textarea");
	await field.fill("Finish this while I look at another project.");
	await field.press("Enter");
	await rail.locator('[data-agent-wait="running"]').waitFor();
	const working = agent.spawned.find((proc) => proc.inputs.some((line) => line.includes("Finish this")));
	if (!working) throw new Error("Missing working agent");
	await field.fill("Keep this next draft.");
	await page.goto(`${project.url}/p/${encodeURIComponent(other.name)}`);
	await page.locator('[data-frame-label="other"]').waitFor();
	expect(working.killed).toBe(false);
	await page.locator(`[data-tab="${project.root}"] .project-tab-label`).click();
	await page.locator('[data-frame-label="home"]').waitFor();
	const glyph = page.locator('[data-dock-glyph="agent"]');
	if ((await glyph.getAttribute("aria-pressed")) !== "true") await glyph.click();
	await rail.locator('[data-agent-wait="running"]').waitFor();
	expect(await rail.locator('[data-agent-wait="running"]').textContent()).not.toContain("1440:");
	expect(await field.inputValue()).toBe("Keep this next draft.");
	expect(agent.spawned.filter((proc) => proc.inputs.some((line) => line.includes("Finish this")))).toHaveLength(1);
	await page.locator(`[data-tab="${other.root}"] .project-tab-label`).click();
	await page.locator('[data-frame-label="other"]').waitFor();
	working.emit(
		JSON.stringify({
			type: "assistant",
			message: { content: [{ type: "text", text: "Completed in the original project." }] },
		}),
	);
	working.emit(JSON.stringify({ type: "result", subtype: "success" }));
	working.exit(0);
	await expect
		.poll(() => JSON.stringify(readThreads(project.spoolDir, project.root)))
		.toContain("Completed in the original project.");
	await page.locator(`[data-tab="${project.root}"] .project-tab-label`).click();
	await page.locator('[data-frame-label="home"]').waitFor();
	if ((await glyph.getAttribute("aria-pressed")) !== "true") await glyph.click();
	await expect.poll(() => rail.textContent()).toContain("Completed in the original project.");
	expect(await rail.locator('[data-agent-wait="running"]').count()).toBe(0);
	expect(await rail.getByText("Completed in the original project.", { exact: true }).count()).toBe(1);
	expect(await field.inputValue()).toBe("Keep this next draft.");
});
