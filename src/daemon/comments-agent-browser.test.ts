import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { encodeFrame, PROTOCOL_VERSION } from "../team-sync-protocol";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { testBrowser } from "../test-browser";
import {
	builtUi,
	chooseAgent,
	closeAfterTest,
	fixtureAgentExecutor,
	makeTempDir,
	writeDesignFile,
	writeFrame,
} from "../test-helpers";
import { serveDaemon } from "./server";
import { syncUrl } from "./team-sync";

/**
 * "Send to agent" on a comment's card (spool#172), in the real canvas: the comment lands in the agent composer as a
 * chip on the open thread, through the same door as Ask the agent, and nothing runs until the person sends; then
 * Enter alone hands it over, and the agent reads it as its `<comment>` block.
 */
it("puts a comment in the agent composer as a chip, and runs nothing until Enter sends it", {
	timeout: 120_000,
}, async () => {
	const cloud = fakeTeam();
	const ana = cloud.machine("ana");
	const ben = cloud.machine("ben");
	const spoolDir = join(makeTempDir(), ".spool");
	const checkout = join(makeTempDir(), "checkout");
	mkdirSync(checkout);
	execFileSync("git", ["init", "--quiet", "."], { cwd: checkout });
	const { root, link } = await initTeamProject(realpathSync(checkout), spoolDir, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	writeFrame(
		root,
		"home",
		"export default function Home() { return <main style={{ padding: 40 }}><h1>home</h1></main>; }\n",
	);
	writeDesignFile(root, "frames/home/frame.json", `${JSON.stringify({ x: 0, y: 0, w: 640, h: 400 })}\n`);
	writeDesignFile(root, ".spool/state.json", `${JSON.stringify({ camera: { x: 100, y: 200, k: 0.75 } })}\n`);
	chooseAgent(spoolDir, { engine: "claude" });
	const agent = fixtureAgentExecutor();
	const daemon = await serveDaemon({
		spoolDir,
		version: "0.0.0-test",
		host: "127.0.0.1",
		port: 0,
		uiDir: await builtUi(),
		cloud: ana.cloud,
		teamNotice: () => {},
		agentExecutor: agent.executor,
		agentLook: () => true,
	});
	closeAfterTest(daemon);

	// Ben comments on the home frame from his own Mac
	const token = await ben.cloud.vault.read();
	const socket = ben.openSocket(syncUrl(link), token, {
		open: () => {
			socket.send(encodeFrame({ type: "hello", protocol: PROTOCOL_VERSION, format: 2, since: 0 }));
			socket.send(
				encodeFrame({
					type: "comment-post",
					ref: "b1",
					page: "",
					frame: "home",
					at: { x: 40, y: 40 },
					element: null,
					revision: null,
					body: "The heading is too quiet.",
				}),
			);
		},
		message: () => {},
		close: () => {},
	});

	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await page.goto(`${daemon.url}/p/checkout`);
	await page.locator('[data-frame-label="home"]').waitFor({ timeout: 30_000 });
	await expect.poll(() => cloud.comments("checkout").length, { timeout: 10_000 }).toBe(1);
	const id = cloud.comments("checkout")[0]?.id ?? "";
	const pin = page.locator(`[data-comment-pin="${id}"]`);
	await pin.waitFor({ timeout: 10_000 });
	await pin.click();
	const card = page.locator(`[data-comment-card="${id}"]`);
	await card.waitFor();
	const spawnedBefore = agent.spawned.length;

	await card.getByRole("button", { name: "Send to agent" }).click();
	const chip = page.locator('[data-agent-rail] [data-agent-comments] [data-agent-chip="comment · ben · home"]');
	await chip.waitFor({ timeout: 10_000 });
	const field = page.locator("[data-agent-rail] textarea");
	expect(await field.inputValue()).toBe("");
	expect(await field.evaluate((element) => element === document.activeElement)).toBe(true);
	// sent twice, it is still one chip; and nothing ran
	await card.getByRole("button", { name: "Send to agent" }).click();
	expect(await page.locator("[data-agent-rail] [data-agent-comments] [data-agent-chip]").count()).toBe(1);
	await page.waitForTimeout(500);
	expect(agent.spawned.slice(spawnedBefore).filter((proc) => proc.inputs.length > 0)).toEqual([]);

	// Enter alone means deal with this
	await field.press("Enter");
	await expect
		.poll(() => agent.spawned.flatMap((proc) => proc.inputs).find((line) => line.includes("<comment")), {
			timeout: 15_000,
		})
		.toBeDefined();
	const line = agent.spawned.flatMap((proc) => proc.inputs).find((one) => one.includes("<comment")) ?? "{}";
	const text = (JSON.parse(line) as { message: { content: { type: string; text?: string }[] } }).message.content.find(
		(block) => block.type === "text",
	)?.text;
	expect(text).toBe(
		[
			`<comment id="${id}">`,
			"ben, to the team, open",
			"on home — design/frames/home/frame.tsx",
			"ben: The heading is too quiet.",
			"</comment>",
			"",
			"Deal with this comment.",
		].join("\n"),
	);
	// the chip went with the words
	await page.locator("[data-agent-rail] [data-agent-comments]").waitFor({ state: "detached" });
});
