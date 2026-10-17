import { join } from "node:path";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import {
	builtUi,
	fixtureAgentExecutor,
	seedAgentWidth,
	serveProject,
	showAgent,
	writeDesignFile,
	writeFrame,
} from "../test-helpers";

/**
 * The agent at a frame on the canvas while it changes it, end to end (#366, task 164).
 *
 * The daemon's witness says the frame changed, the transcript folds that into where the agent
 * is, and the frame's name row says it is working there. What only a browser can say is that
 * they are one chain, without anybody clicking anything.
 *
 * The agent here is a fixture that writes the file itself and then says it did, which is
 * the whole of what the real one does that this cares about: the pixels change because
 * the disk changed, and the wire is how the canvas learns which lines.
 */

const BEFORE = `export default function Home() {
	return (
		<main>
			<h1>kaffe</h1>
			<p id="hours">open until six</p>
		</main>
	);
}
`;

const PROMPT = "close on sundays";

const OLD = '<p id="hours">open until six</p>';
const NEW = '<p id="hours">closed sundays</p>';

it("says on the frame's name row that the agent is working on it while a write lands", {
	timeout: 180_000,
}, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();

	let root = "";
	const id = "toolu_hand_1";
	/**
	 * The turn, at something like the pace of a real one.
	 *
	 * The beats matter and the wall-clock between them does not: a turn that opened, wrote
	 * and ended inside one animation frame would leave the canvas nothing to draw and
	 * prove nothing about a rail nobody can watch. So the call opens, the write lands, and
	 * only then does the turn end — which is the order every capture in `fixtures/` has.
	 */
	const { executor } = fixtureAgentExecutor((proc, line) => {
		// the turn, and not the probes the rail opens with: a login check spawns the same
		// binary, and a frame rewritten before anybody typed proves nothing
		if (!line.includes(PROMPT)) return;
		proc.emit(
			JSON.stringify({
				type: "system",
				subtype: "init",
				cwd: root,
				session_id: "s",
				model: "claude-opus-5",
				tools: [],
			}),
		);
		proc.emit(
			JSON.stringify({
				type: "assistant",
				message: {
					model: "claude-opus-5",
					id: "msg_1",
					type: "message",
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id,
							name: "Edit",
							input: {
								file_path: join(root, "design/frames/home/frame.tsx"),
								old_string: OLD,
								new_string: NEW,
							},
						},
					],
				},
				session_id: "s",
				parent_tool_use_id: null,
			}),
		);
		setTimeout(() => {
			// the agent's own act, in the order the real one performs it: the file first,
			// because a plate is a fact about the pixels and they change when the disk does
			writeFrame(root, "home", BEFORE.replace(OLD, NEW));
			proc.emit(
				JSON.stringify({
					type: "user",
					message: { role: "user", content: [{ tool_use_id: id, type: "tool_result", content: "ok" }] },
					session_id: "s",
					parent_tool_use_id: null,
				}),
			);
		}, 1200);
	});

	// the fixture agent is the agent this machine has, so the `which` behind the wall has
	// to say so too: left to the runner's own PATH the rail draws the install wall, whose
	// composer is dead, and nothing below can be typed into (#201)
	const project = await serveProject({
		uiDir,
		agentExecutor: executor,
		agentLook: () => true,
	});
	root = project.root;
	writeFrame(project.root, "home", BEFORE);
	// wide enough to hold a document at rest: below LIVE_MIN_CSS_PX a frame is a stored
	// photograph, and nothing located can be drawn on one
	writeDesignFile(project.root, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 600 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	// the agent alone at 420, the width these layouts are read at
	await seedAgentWidth(page, 420);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	const hours = page.frameLocator('iframe[title="home"]').locator("#hours");
	const says = () => hours.textContent().catch(() => null);

	// the frame is live before anybody types: the design it is about to change is on screen
	await expect.poll(says, { timeout: 30_000 }).toBe("open until six");

	// properties have the side until the agent's tab is pressed; here the side starts closed
	await showAgent(page);
	const field = page.locator("[data-agent-rail] textarea");
	await field.fill(PROMPT);
	await field.press("Enter");

	// the agent is at this frame, and the frame's name row says so
	const row = page.locator('[data-frame-label="home"] [data-frame-agents="home"]');
	await expect.poll(() => row.count(), { timeout: 30_000 }).toBe(1);
	expect(await row.getAttribute("data-frame-agents-state")).toBe("working");
	await expect.poll(says, { timeout: 30_000 }).toBe("closed sundays");

	// the frame really did take the write, so the mark is about something that happened
	expect(await says()).toBe("closed sundays");
});

/**
 * The rail shut, the agent stops to ask (#366): the ask stands on the canvas under the
 * frame the agent is at, its name row saying waiting and the agent's rail icon wearing the
 * waiting mark, and answering it there is answering it.
 */
it("stands an ask under its frame while the rail is shut, and answers from there", { timeout: 180_000 }, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();

	let root = "";
	const PROMPT_ASK = "check the hours";
	const answers: string[] = [];
	const { executor } = fixtureAgentExecutor((proc, line) => {
		if (line.includes('"control_response"')) {
			answers.push(line);
			return;
		}
		if (!line.includes(PROMPT_ASK)) return;
		const say = (content: unknown[], id: string) =>
			proc.emit(
				JSON.stringify({
					type: "assistant",
					message: { model: "claude-opus-5", id, type: "message", role: "assistant", content },
					session_id: "s",
					parent_tool_use_id: null,
				}),
			);
		proc.emit(
			JSON.stringify({
				type: "system",
				subtype: "init",
				cwd: root,
				session_id: "s",
				model: "claude-opus-5",
				tools: [],
			}),
		);
		say(
			[
				{
					type: "tool_use",
					id: "toolu_edit",
					name: "Edit",
					input: { file_path: join(root, "design/frames/home/frame.tsx"), old_string: OLD, new_string: NEW },
				},
			],
			"msg_1",
		);
		setTimeout(() => {
			writeFrame(root, "home", BEFORE.replace(OLD, NEW));
			proc.emit(
				JSON.stringify({
					type: "user",
					message: { role: "user", content: [{ tool_use_id: "toolu_edit", type: "tool_result", content: "ok" }] },
					session_id: "s",
					parent_tool_use_id: null,
				}),
			);
			say([{ type: "tool_use", id: "toolu_npm", name: "Bash", input: { command: "npm install dayjs" } }], "msg_2");
			proc.emit(
				JSON.stringify({
					type: "control_request",
					request_id: "req-npm",
					request: {
						subtype: "can_use_tool",
						tool_name: "Bash",
						input: { command: "npm install dayjs" },
						description: "Adding a date library so the hours read in the visitor's own time.",
						tool_use_id: "toolu_npm",
						permission_suggestions: [],
					},
				}),
			);
		}, 800);
	});

	const project = await serveProject({ uiDir, agentExecutor: executor, agentLook: () => true });
	root = project.root;
	writeFrame(project.root, "home", BEFORE);
	writeDesignFile(project.root, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 600 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 0.5 } })}\n`);

	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await seedAgentWidth(page, 420);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await expect
		.poll(
			() =>
				page
					.frameLocator('iframe[title="home"]')
					.locator("#hours")
					.textContent()
					.catch(() => null),
			{
				timeout: 30_000,
			},
		)
		.toBe("open until six");

	await showAgent(page);
	const field = page.locator("[data-agent-rail] textarea");
	await field.fill(PROMPT_ASK);
	await field.press("Enter");
	// close the side while the turn runs, to its rail
	await page.locator('[data-frame-agents="home"]').waitFor({ state: "attached", timeout: 30_000 });
	await page.locator('[data-side-close="right"]').click();
	await expect.poll(() => page.locator("[data-agent-rail]").isVisible()).toBe(false);

	const card = page.locator("[data-agent-canvas-ask]");
	await card.waitFor({ timeout: 30_000 });
	expect(await card.textContent()).toContain("Adding a date library");
	await expect
		.poll(() => page.locator('[data-frame-agents="home"]').getAttribute("data-frame-agents-state"))
		.toBe("waiting");
	expect(await page.locator('[data-rail-icon="agent"] [data-pane-mark="waiting"]').count()).toBe(1);
	// it stands under the frame it is about
	const frame = await page.locator('iframe[title="home"]').boundingBox();
	const stands = await card.boundingBox();
	expect(stands?.y ?? 0).toBeGreaterThan((frame?.y ?? 0) + (frame?.height ?? 0));
	expect(Math.abs((stands?.x ?? 0) - (frame?.x ?? 0))).toBeLessThan(4);

	const shots = process.env.SPOOL_TEST_SHOTS;
	if (shots) {
		await page.waitForTimeout(600);
		await page.screenshot({ path: join(shots, "ask-on-canvas.png") });
		await showAgent(page);
		await page.waitForTimeout(600);
		await page.screenshot({ path: join(shots, "ask-in-rail.png") });
		await page.locator("[data-agent-rail] [data-agent-ask-detail]").click();
		await page.waitForTimeout(300);
		await page.screenshot({ path: join(shots, "ask-in-rail-open.png") });
		await page.locator('[data-side-close="right"]').click();
		await card.waitFor();
	}
	await card.locator('[data-agent-option="Allow"]').click();
	await expect.poll(() => answers.length, { timeout: 10_000 }).toBe(1);
	expect(answers[0]).toContain('"behavior":"allow"');
	await expect.poll(() => card.count()).toBe(0);
});
