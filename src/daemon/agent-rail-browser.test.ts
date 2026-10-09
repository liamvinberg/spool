import type { Page } from "playwright-core";
import { describe, expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import {
	builtUi,
	type FakeAgentProc,
	fixtureAgentExecutor,
	makeTempDir,
	seedAgentWidth,
	serveProject,
	showAgent,
	writeFrame,
} from "../test-helpers";
import type { AgentEngine } from "./agent-engine";
import { createClaudeEngine } from "./agent-engine-claude";
import type { AgentModel, AgentOffer } from "./agent-offer";

/*
 * The rebuilt rail (#364), in a real browser against a served daemon: the switcher in the
 * header and the dot on the dock, the composer's Send and Stop and the queue at the end of
 * the log, the context ring and the limit dot, the agent menu with effort in place, a find
 * field and other agents, the log following its live edge, and the side's width.
 *
 * Nothing real answers. Claude Code is a scripted binary that speaks its wire, and the
 * other agent is pi as a stand-in that lists models and is never started: the menu's
 * second group is whichever else is installed.
 */

const WINDOW = 200_000;

/** what the scripted binary lists, the way `list_models` answers */
const CLAUDE_MODELS = [
	{
		value: "default",
		resolvedModel: "claude-opus-5",
		displayName: "Default (recommended)",
		description: "Opus, for most work",
		supportsEffort: true,
		supportedEffortLevels: ["low", "medium", "high"],
	},
	{
		value: "haiku",
		resolvedModel: "claude-haiku-4-5",
		displayName: "Haiku",
		description: "Fastest for quick answers",
	},
];

/**
 * Claude Code as a script: the probe the menu asks (`list_models`, `/model`, `/effort`),
 * and turns that do what their prompt says.
 *
 * - `hold …` writes a line and stays running until the test ends it or Stop interrupts it
 * - `context N` ends with a result whose last iteration fills N% of the window
 * - `limit` warns that the week is 92% used, then ends
 * - anything else answers in one line and ends
 *
 * The model and effort are one state for the whole machine, which is what the binary's
 * own settings are.
 */
function scriptedClaude() {
	const state = { model: "default", effort: "high" };
	const held: FakeAgentProc[] = [];
	const resolved = () => CLAUDE_MODELS.find((model) => model.value === state.model)?.resolvedModel ?? state.model;
	const named = () => CLAUDE_MODELS.find((model) => model.value === state.model)?.displayName ?? state.model;
	const init = (proc: FakeAgentProc) =>
		proc.emit(JSON.stringify({ type: "system", subtype: "init", model: resolved(), session_id: "s" }));
	const result = (proc: FakeAgentProc, text: string, extra: Record<string, unknown> = {}) =>
		proc.emit(JSON.stringify({ type: "result", subtype: "success", result: text, num_turns: 1, ...extra }));
	const fixture = fixtureAgentExecutor(
		(proc, line) => {
			const wire = JSON.parse(line) as {
				type?: string;
				request_id?: string;
				request?: { subtype?: string };
				message?: { content?: { text?: string }[] };
			};
			if (wire.type === "control_request") {
				if (wire.request?.subtype === "list_models")
					proc.emit(
						JSON.stringify({
							type: "control_response",
							response: {
								subtype: "success",
								request_id: wire.request_id,
								response: { models: CLAUDE_MODELS },
							},
						}),
					);
				else if (wire.request?.subtype === "interrupt") result(proc, "Stopped");
				return;
			}
			if (wire.type !== "user") return;
			const text = wire.message?.content?.map((block) => block.text ?? "").join(" ") ?? "";
			const at = (flag: string) => proc.spawn.args[proc.spawn.args.indexOf(flag) + 1];
			if (proc.spawn.args.includes("--model")) state.model = at("--model") ?? state.model;
			if (proc.spawn.args.includes("--effort")) state.effort = at("--effort") ?? state.effort;
			init(proc);
			if (text.startsWith("/model ")) {
				state.model = text.slice("/model ".length).trim();
				return result(proc, `Set model to ${named()}`);
			}
			if (text === "/model") {
				const levels = CLAUDE_MODELS.find((model) => model.value === state.model)?.supportedEffortLevels;
				return result(proc, `Current model: ${named()}${levels ? ` (effort: ${state.effort})` : ""}`);
			}
			if (text.startsWith("/effort ")) {
				state.effort = text.slice("/effort ".length).trim();
				return result(proc, `Set effort level to ${state.effort}`);
			}
			if (text.includes("hold")) {
				say(proc, `Working on: ${text}`);
				held.push(proc);
				return;
			}
			const context = /context (\d+)/.exec(text);
			if (context) {
				say(proc, "Measured.");
				const used = (Number(context[1]) / 100) * WINDOW;
				return result(proc, "Measured.", {
					usage: { iterations: [{ input_tokens: 10, cache_read_input_tokens: used - 10 }] },
					modelUsage: { [resolved()]: { contextWindow: WINDOW } },
				});
			}
			if (text.includes("limit")) {
				proc.emit(
					JSON.stringify({
						type: "rate_limit_event",
						rate_limit_info: {
							status: "allowed_warning",
							resetsAt: Math.floor(Date.now() / 1000) + 86_400,
							rateLimitType: "seven_day",
							utilization: 0.92,
							isUsingOverage: false,
							surpassedThreshold: 0.75,
						},
					}),
				);
			}
			say(proc, `Done: ${text}`);
			result(proc, `Done: ${text}`);
		},
		(proc) => {
			// asked `claude auth status --json`, as the agent menu asks of an agent it is not on (#364)
			if (proc.spawn.args[0] === "auth") proc.emit(JSON.stringify({ loggedIn: true }));
			proc.exit(0);
		},
	);
	return {
		...fixture,
		state,
		held,
		/** the turn holding open on a prompt, which a test ends or writes more into */
		holding: (prompt: string) => held.find((proc) => proc.inputs.some((line) => line.includes(prompt))),
	};
}

function say(proc: FakeAgentProc, text: string) {
	proc.emit(
		JSON.stringify({
			type: "assistant",
			message: { id: `m-${Math.random()}`, role: "assistant", content: [{ type: "text", text }] },
			parent_tool_use_id: null,
		}),
	);
}

/**
 * pi as the menu's other agent: it lists `count` models, the last of them on this machine,
 * offers no modes, as pi never asks (#363), and is never started
 */
function otherAgent(count: number): AgentEngine {
	const models: AgentModel[] = Array.from({ length: count }, (_, at) => ({
		value: `other-${at}`,
		resolvedModel: `other-${at}`,
		displayName: at === 0 ? "Atlas" : `Model ${String.fromCharCode(65 + at)}`,
		description: "",
		...(at === count - 1 ? { local: true } : {}),
	}));
	let chosen: string | null = null;
	const offer = (value: string | null): AgentOffer => ({
		models,
		current: { value, resolved: value, name: null, effort: null, pin: null },
		modes: false,
	});
	return {
		id: "pi",
		installed: () => true,
		account: async () => ({ signedIn: true, account: null }),
		offer: async ({ ask, choose }) => {
			chosen = choose?.value ?? ask?.value ?? chosen;
			return offer(chosen);
		},
		choice: (_offer, wanted) => wanted,
		start: () => {
			throw new Error("the other agent is never started here");
		},
		continuable: () => false,
	};
}

async function opened(others = 0) {
	const claude = scriptedClaude();
	const project = await serveProject({
		uiDir: await builtUi(),
		agentEngines: [
			createClaudeEngine({ executor: claude.executor, spoolDir: makeTempDir(), look: () => true }),
			...(others > 0 ? [otherAgent(others)] : []),
		],
	});
	writeFrame(project.root, "home", "export default () => <h1>Home</h1>");
	const page = await (await testBrowser()).newPage({ viewport: { width: 1400, height: 900 } });
	await seedAgentWidth(page, 420);
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await showAgent(page);
	return { claude, project, page, ...parts(page) };
}

function parts(page: Page) {
	const rail = page.locator("[data-agent-rail]");
	const head = page.locator("[data-agent-plate]");
	const field = rail.locator("textarea");
	return {
		rail,
		head,
		field,
		title: head.locator("[data-agent-thread-title]"),
		newChat: page.locator('[data-pane-verbs="agent"] button[aria-label="New chat"]'),
		chats: page.getByRole("dialog", { name: "Chats", exact: true }),
		sendButton: rail.getByRole("button", { name: "Send", exact: true }),
		stop: rail.getByRole("button", { name: "Stop", exact: true }),
		trigger: rail.getByRole("button", { name: "Choose model", exact: true }),
		menu: rail.locator("[data-agent-model-menu]:not([inert] *)"),
		engine: () => rail.getAttribute("data-agent-rail-engine"),
		dot: page.locator('[data-pane-tab="agent"] [data-pane-mark="elsewhere"]'),
		send: async (text: string) => {
			await field.fill(text);
			await field.press("Enter");
		},
	};
}

describe("the agent rail in a browser", () => {
	it("switches chats from the title, dots the Agent tab for another thread's news, and queues, takes back and stops", {
		timeout: 120_000,
	}, async () => {
		const { claude, page, rail, title, newChat, chats, field, send, sendButton, stop, dot } = await opened();

		// Send is the round button at rest, and nothing to send leaves it unpressable
		expect(await sendButton.isDisabled()).toBe(true);
		await field.fill("hold the first chat");
		expect(await sendButton.isDisabled()).toBe(false);
		await sendButton.click();
		await expect.poll(() => claude.holding("hold the first chat") !== undefined).toBe(true);
		// while the turn runs the same place is Stop, and the box says what comes next
		await stop.waitFor();
		expect(await sendButton.count()).toBe(0);
		expect(await field.getAttribute("placeholder")).toBe("Say what comes next");

		// Enter during the turn queues the words at the end of the log
		await send("and then tighten the header");
		const queued = rail.locator("[data-agent-log] [data-agent-queued]");
		await expect.poll(() => queued.count()).toBe(1);
		expect(await queued.textContent()).toContain("and then tighten the header");
		expect(await field.inputValue()).toBe("");
		// after everything the log holds
		expect(
			await rail.locator("[data-agent-log]").evaluate((log) => {
				const all = [...log.querySelectorAll("[data-agent-arrive], [data-agent-queued]")];
				return all.at(-1)?.hasAttribute("data-agent-queued");
			}),
		).toBe(true);
		// and Take back hands them to the box again
		await queued.locator("button", { hasText: "Take back" }).click();
		await expect.poll(() => field.inputValue()).toBe("and then tighten the header");
		await expect.poll(() => queued.count()).toBe(0);
		await field.fill("");

		// a second chat; the first is still running elsewhere, which is the dock's one dot
		expect(await dot.count()).toBe(0);
		await newChat.click();
		await expect.poll(() => title.textContent()).toBe("New chat");
		await expect.poll(() => dot.count()).toBe(1);
		await expect
			.poll(() => page.locator('[data-pane-tab="agent"]').getAttribute("aria-label"))
			.toBe("Agent, another chat has news");

		// the title opens the chats; Escape closes them
		await title.click();
		await chats.waitFor();
		expect(await chats.locator("[data-agent-thread]").allTextContents()).toEqual([
			expect.stringContaining("New chat"),
			expect.stringContaining("hold the first chat"),
		]);
		await page.keyboard.press("Escape");
		await expect.poll(() => chats.count()).toBe(0);

		// the first chat finishes out of sight: still news, now unread
		const first = claude.holding("hold the first chat");
		if (first === undefined) throw new Error("the first turn never ran");
		say(first, "The first chat is done.");
		first.emit(JSON.stringify({ type: "result", subtype: "success", result: "done", num_turns: 1 }));
		await title.click();
		await expect
			.poll(() => chats.locator('[data-agent-thread="hold the first chat"]').getAttribute("data-agent-thread-life"))
			.toBe("unread");
		// a press anywhere else closes it too
		await page.getByRole("button", { name: "close the threads", exact: true }).click({ position: { x: 20, y: 400 } });
		await expect.poll(() => chats.count()).toBe(0);
		expect(await dot.count()).toBe(1);

		// picking its row switches to it, and its news is read
		await title.click();
		await chats.locator('[data-agent-thread="hold the first chat"]').click();
		await expect.poll(() => title.textContent()).toBe("hold the first chat");
		await expect.poll(() => rail.textContent()).toContain("The first chat is done.");
		await expect.poll(() => chats.count()).toBe(0);
		await expect.poll(() => dot.count()).toBe(0);

		// Stop ends a running turn and Send comes back
		await send("hold the second turn");
		await stop.waitFor();
		await stop.click();
		await expect.poll(() => stop.count()).toBe(0);
		await sendButton.waitFor();
		expect(claude.holding("hold the second turn")?.inputs.some((line) => line.includes("interrupt"))).toBe(true);
	});

	it("draws the context ring only past 60% of the window, and dots the trigger for a limit", {
		timeout: 120_000,
	}, async () => {
		const { rail, send, stop, trigger, menu } = await opened();
		const ring = rail.locator("[data-agent-context-ring]");

		await send("context 30");
		await expect.poll(() => rail.textContent()).toContain("Measured.");
		await expect.poll(() => stop.count()).toBe(0);
		await rail.page().waitForTimeout(300);
		expect(await ring.count()).toBe(0);

		await send("context 72");
		await expect.poll(() => ring.getAttribute("data-agent-context-ring")).toBe("72");
		await ring.click();
		const note = rail.getByRole("dialog", { name: "Context", exact: true });
		await expect.poll(() => note.textContent()).toContain("72% of context used.");
		expect(await note.textContent()).toContain("A new chat starts fresh.");
		await ring.click();
		await expect.poll(() => note.count()).toBe(0);

		expect(await trigger.locator("[data-agent-limit-dot]").count()).toBe(0);
		await send("limit");
		await expect.poll(() => trigger.locator("[data-agent-limit-dot]").count()).toBe(1);
		await trigger.click();
		await expect.poll(() => menu.locator("[data-agent-usage]").textContent()).toContain("92%");
	});

	it("sets effort in place, finds past twelve models, and changes agent in place or in a new chat", {
		timeout: 150_000,
	}, async () => {
		const { claude, page, rail, title, chats, send, stop, trigger, menu, engine } = await opened(13);
		const row = (name: string) => menu.locator(`[data-agent-model-row="${name}"]`);
		await expect.poll(engine).toBe("claude");
		await expect.poll(() => trigger.textContent()).toContain("Default (recommended)");

		// effort opens under the chosen model and changes there, the menu staying open
		await trigger.click();
		const toggle = menu.locator("[data-agent-effort-toggle]");
		await expect.poll(() => toggle.getAttribute("aria-label")).toBe("Effort, high");
		await toggle.click();
		await menu.locator('[data-agent-effort="low"]').click();
		await expect.poll(() => toggle.getAttribute("aria-label")).toBe("Effort, low");
		expect(await menu.locator('[data-agent-effort="low"]').getAttribute("aria-pressed")).toBe("true");
		expect(await menu.count()).toBe(1);
		expect(claude.state.effort).toBe("low");

		// fifteen models in all, so a find field, which narrows every group
		const groups = () =>
			menu
				.locator("[data-agent-group]")
				.evaluateAll((all) => all.map((one) => one.getAttribute("data-agent-group")));
		await expect.poll(groups).toEqual(["claude", "pi"]);
		await expect.poll(() => menu.locator("[data-agent-model-row]").count()).toBe(15);
		const find = menu.getByRole("searchbox", { name: "Find a model", exact: true });
		await find.fill("atlas");
		await expect.poll(() => menu.locator("[data-agent-model-row]").count()).toBe(1);
		await expect.poll(groups).toEqual(["pi"]);
		await find.fill("zzz");
		await expect.poll(() => menu.textContent()).toContain("No models match “zzz”.");
		await find.fill("");
		// a model on this machine says so, and only that one (#363)
		await expect.poll(() => menu.locator("[data-agent-model-local]").count()).toBe(1);
		expect(
			await menu
				.locator(`[data-agent-model-row="Model ${String.fromCharCode(65 + 12)}"] [data-agent-model-local]`)
				.count(),
		).toBe(1);

		// an empty chat changes agent in place: the same chat, now on the other agent
		const draft = "keep this draft";
		await rail.locator("textarea").fill(draft);
		await row("Atlas").click();
		await expect.poll(engine).toBe("pi");
		await expect.poll(() => title.textContent()).toBe("New chat");
		expect(await rail.locator("textarea").inputValue()).toBe(draft);
		await title.click();
		await expect.poll(() => chats.locator("[data-agent-thread]").count()).toBe(1);
		await page.keyboard.press("Escape");

		// pi never asks, so its chat has no mode menu (#363)
		await expect.poll(() => rail.locator("[data-permission-trigger]").count()).toBe(0);

		// back to Claude Code from its group in pi's menu, in place again: the chat is still empty
		await trigger.click();
		await menu.locator('[data-agent-group="claude"] [data-agent-model-row]').first().click();
		await expect.poll(engine).toBe("claude");
		await expect.poll(() => rail.locator("[data-permission-trigger]").count()).toBe(1);
		await rail.locator("textarea").fill("");
		await send("start this chat");
		await expect.poll(() => rail.textContent()).toContain("Done: start this chat");
		await expect.poll(() => stop.count()).toBe(0);
		// Claude Code is the usual agent, so the trigger names the model alone
		expect(await trigger.locator("[data-agent-trigger-engine]").count()).toBe(0);

		// a started chat asks before it changes agent
		await trigger.click();
		await expect.poll(() => menu.locator('[data-agent-group="pi"]').textContent()).toContain("new chat");
		await row("Atlas").click();
		const asking = menu.locator('[data-agent-new-thread="pi"]:not([inert] *)');
		await expect.poll(() => asking.textContent()).toContain("Starts a new chat on pi. This one stays in your chats.");
		await expect.poll(engine).toBe("claude");
		await asking.getByRole("button", { name: "New chat", exact: true }).click();
		await expect.poll(engine).toBe("pi");
		await expect.poll(() => title.textContent()).toBe("New chat");

		// the Claude chat is still there, and on the way back to it the trigger says whose
		// it is, because pi is the usual agent now
		await title.click();
		const older = chats.locator('[data-agent-thread="start this chat"]');
		expect(await older.locator('[data-agent-thread-engine="claude"]').textContent()).toBe("Claude Code");
		await older.click();
		await expect.poll(engine).toBe("claude");
		await expect.poll(() => trigger.locator("[data-agent-trigger-engine]").textContent()).toBe("Claude Code");
	});

	it("follows the log's live edge until the reader scrolls up, and the chip takes it back", {
		timeout: 120_000,
	}, async () => {
		const { claude, page, rail, send } = await opened();
		const log = rail.locator("[data-agent-log]");
		const chip = rail.locator("[data-agent-live]");
		const gap = () => log.evaluate((box) => box.scrollHeight - box.clientHeight - box.scrollTop);
		await send("hold and write a long answer");
		await expect.poll(() => claude.holding("hold and write a long answer") !== undefined).toBe(true);
		const turn = claude.holding("hold and write a long answer");
		if (turn === undefined) throw new Error("the turn never ran");
		const write = async (from: number, count: number) => {
			for (let at = from; at < from + count; at += 1)
				say(turn, `Paragraph ${at}. ${"The receipt grows. ".repeat(12)}`);
			await expect.poll(() => rail.textContent()).toContain(`Paragraph ${from + count - 1}.`);
		};

		// new output keeps the end in view
		await write(0, 30);
		await expect.poll(gap).toBeLessThan(2);
		expect(await chip.count()).toBe(0);

		// a wheel up is the reader leaving the edge: the chip appears, and output no longer moves the log
		const box = await log.boundingBox();
		if (box === null) throw new Error("no log");
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		// a wheel the compositor takes before it has hit-tested the pointer scrolls nothing,
		// so the hand turns it until the log has moved
		await expect
			.poll(async () => {
				await page.mouse.wheel(0, -300);
				return chip.count();
			})
			.toBe(1);
		await chip.waitFor();
		expect(await chip.textContent()).toContain("live");
		// the last turn of the wheel may still be landing: read where the reader came to rest
		const top = () => log.evaluate((box) => box.scrollTop);
		let read = await top();
		await expect
			.poll(async () => {
				await page.waitForTimeout(250);
				const was = read;
				read = await top();
				return read === was;
			})
			.toBe(true);
		await write(30, 10);
		await page.waitForTimeout(200);
		expect(await log.evaluate((box) => box.scrollTop)).toBe(read);
		expect(await gap()).toBeGreaterThan(100);

		// the chip returns to the end and follows from there
		await chip.click();
		await expect.poll(gap).toBeLessThan(2);
		await expect.poll(() => chip.count()).toBe(0);
		await write(40, 10);
		await expect.poll(gap).toBeLessThan(2);
	});

	it("keeps the side's width across a reload, between 380 and 560 while the agent shows", {
		timeout: 120_000,
	}, async () => {
		const { page, rail } = await opened();
		const handle = page.getByRole("button", { name: "Resize right side", exact: true });
		const width = async () => Math.round((await rail.boundingBox())?.width ?? 0);
		const drag = async (by: number) => {
			const box = await handle.boundingBox();
			if (box === null) throw new Error("no resize handle");
			const x = box.x + box.width / 2;
			const y = box.y + box.height / 2;
			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(x + by / 2, y, { steps: 4 });
			await page.mouse.move(x + by, y, { steps: 4 });
			await page.waitForTimeout(50);
			await page.mouse.up();
		};
		/**
		 * Drags the edge toward `wanted` until the side stands at `expected`. Under load a
		 * drag can land short of where the hand let go, so it is taken up again from wherever
		 * it stopped, never past `wanted`.
		 */
		const resize = async (wanted: number, expected: number) => {
			for (let attempt = 0; attempt < 4; attempt += 1) {
				const now = await width();
				if (now === expected) return;
				await drag(now - wanted);
				await page.waitForTimeout(300);
			}
			expect(await width()).toBe(expected);
		};
		const stored = () =>
			page.evaluate(() => JSON.parse(localStorage.getItem("spool.panes.layout") ?? "null")?.right?.width);
		expect(await width()).toBe(420);
		// the side slides open, and a drag that starts while it still moves lands short: it has
		// arrived once its edge stands where the rail begins
		const settled = async () => {
			const [edge, body] = await Promise.all([handle.boundingBox(), rail.boundingBox()]);
			return edge !== null && body !== null && Math.abs(edge.x - body.x) < 1;
		};
		await expect.poll(settled).toBe(true);

		// the right side grows to the left
		await resize(480, 480);
		await expect.poll(stored).toBe(480);
		await page.reload();
		await showAgent(page);
		await expect.poll(width).toBe(480);
		await expect.poll(settled).toBe(true);

		await resize(700, 560);
		await resize(330, 380);
		await expect.poll(stored).toBe(380);
		await page.reload();
		await showAgent(page);
		await expect.poll(width).toBe(380);
	});
});
