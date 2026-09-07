import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeFrame } from "../test-helpers";
import { BundledHostClient, bundledEnvironment, createSpoolEngine } from "./agent-engine-spool";
import { readThreads } from "./agent-threads";
import { orderQuestion } from "./fixtures/bundled-question";

it("answers the accepted question in the served rail, preserves draft/history on reconnect and returns the queue on Stop", {
	timeout: 180_000,
}, async () => {
	const directory = join(makeTempDir(), "bundled");
	const client = new BundledHostClient(directory, (state) => {
		const child = fork(fileURLToPath(new URL("./fixtures/bundled-provider-host.ts", import.meta.url)), [], {
			env: bundledEnvironment(state),
			execArgv: ["--import", import.meta.resolve("tsx")],
			stdio: ["ignore", "ignore", "ignore", "ipc"],
		});
		onTestFinished(async () => {
			if (child.exitCode !== null || child.signalCode !== null) return;
			const exited = once(child, "exit");
			child.kill();
			await exited;
		});
		return child;
	});
	await client.request({ kind: "connect", provider: "openai", key: "fixture-key" });
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir, agentEngines: [createSpoolEngine(directory, client)] });
	writeFrame(project.root, "receipt", "export default () => <main><h1>Order confirmed</h1><p>Order 1042</p></main>");
	await build({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.locator('[data-dock-glyph="agent"]').click();
	const rail = page.locator("[data-agent-rail]");
	const field = rail.locator("textarea");
	const open = page.locator('[data-agent-ask="open"]');
	const stop = page.getByRole("button", { name: "stop", exact: true });
	const send = async (text: string) => {
		await field.fill(text);
		await field.press("Enter");
	};
	const settled = async () => {
		await expect.poll(() => stop.count()).toBe(0);
	};
	const calls = () => readFileSync(join(directory, "provider-calls.jsonl"), "utf8").trim().split("\n");
	const stored = () => readThreads(project.spoolDir, project.root)[0];
	const shot = async (name: string) => {
		const shots = process.env.SPOOL_TEST_SHOTS;
		if (!shots) return;
		mkdirSync(shots, { recursive: true });
		await page.screenshot({ path: join(shots, `${name}.png`), animations: "disabled" });
	};
	await send("Center the confirmation.");
	await expect.poll(() => rail.textContent()).toContain("Saved reply 1.");
	await settled();
	const session = stored()?.session;
	await send("Ask about the order number");
	await open.waitFor();
	expect(await open.textContent()).toContain(orderQuestion.question);
	for (const option of orderQuestion.options) {
		const button = open.getByRole("button", { name: `${option.label} ${option.description}`, exact: true });
		expect(await button.count()).toBe(1);
		expect(await button.locator("span").last().textContent()).toBe(option.description);
	}
	expect(await open.getByRole("button", { name: "allow once", exact: true }).count()).toBe(0);
	await field.fill("Keep the total aligned with the items.");
	await shot("access-design-question");
	await open.getByRole("button", { name: /Under the confirmation/ }).click();
	await settled();
	expect(await field.inputValue()).toBe("Keep the total aligned with the items.");
	expect(calls().at(-1)).toContain('\\"answers\\"');
	await send("Ask about the order number");
	await open.waitFor();
	await field.fill("Above the items, with room for a long number.");
	await field.press("Enter");
	await settled();
	expect(calls().at(-1)).toContain("Above the items, with room for a long number.");
	expect(await field.inputValue()).toBe("");
	await send("Ask about the order number");
	await open.waitFor();
	await field.fill("Next draft stays here.");
	await open.getByRole("button", { name: "dismiss", exact: true }).click();
	await settled();
	expect(await field.inputValue()).toBe("Next draft stays here.");
	expect(calls().at(-1)).toContain("dismissed the question without answering it");
	expect(calls().at(-1)).not.toContain("Next draft stays here.");
	const mode = await fetch(`${project.url}/api/settings`, {
		method: "PUT",
		headers: { "Content-Type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ key: "agent.permissions", value: "bypass", project: project.name }),
	});
	expect(mode.ok).toBe(true);
	await send("Ask about the order number");
	await open.waitFor();
	await field.fill("Next draft while waiting under bypass.");
	// Persistence is throttled for two seconds; include its flush and local I/O.
	await expect.poll(() => stored()?.draft, { timeout: 5_000 }).toBe("Next draft while waiting under bypass.");
	const before = calls().length;
	await shot("access-design-bypass");
	await page.reload();
	await open.waitFor();
	expect(await field.inputValue()).toBe("Next draft while waiting under bypass.");
	expect(await rail.textContent()).toContain("Saved reply 1.");
	expect(calls()).toHaveLength(before);
	expect(stored()?.session).toEqual(session);
	await stop.click();
	await settled();
	expect(await open.count()).toBe(0);
	expect(await field.inputValue()).toBe("Next draft while waiting under bypass.");
	const description =
		"Keep the order number beside the total so both details can be found together when someone needs to look up a purchase. Leave enough space for long order numbers without moving the confirmation heading.";
	const detailed = {
		...orderQuestion,
		options: [orderQuestion.options[0], { label: "Beside the total", description }],
	};
	const secondQuestion = { ...orderQuestion, question: "Where should the next receipt place it?" };
	await send(
		`file tools: ${JSON.stringify([{ name: "ask_person", arguments: { questions: [detailed, secondQuestion] } }])}`,
	);
	await open.waitFor();
	const longOption = open.getByRole("button", { name: `Beside the total ${description}`, exact: true });
	expect(await longOption.locator("span").last().textContent()).toBe(description);
	const paragraph = await longOption
		.locator("span")
		.last()
		.evaluate((element) => ({
			height: element.clientHeight,
			scroll: element.scrollHeight,
			clamp: getComputedStyle(element).webkitLineClamp,
		}));
	expect(paragraph.height).toBe(paragraph.scroll);
	expect(paragraph.clamp).toBe("none");
	const beforePartial = calls().length;
	await longOption.click();
	expect(await open.textContent()).toContain(secondQuestion.question);
	expect(calls()).toHaveLength(beforePartial);
	await open.getByRole("button", { name: /Under the confirmation/ }).click();
	await settled();
	expect(calls().at(-1)).toContain("Where should the next receipt place it?");
	const beforeQueued = calls().length;
	await send("Ask about the order number after queued");
	await expect.poll(() => calls().length).toBe(beforeQueued + 1);
	await send("Queued next message.");
	await expect.poll(() => stored()?.queued.length).toBe(1);
	await field.fill("Unsent next draft.");
	writeFileSync(join(directory, "question-ready"), "ready");
	await open.waitFor();
	expect(stored()?.queued).toHaveLength(1);
	await stop.click();
	await settled();
	await expect.poll(() => stored()?.queued.length).toBe(0);
	expect(await field.inputValue()).toBe("Queued next message.\n\nUnsent next draft.");
	expect(calls()).toHaveLength(beforeQueued + 1);
	expect(stored()?.session).toEqual(session);
	expect(await rail.textContent()).toContain("Saved reply 1.");
});
