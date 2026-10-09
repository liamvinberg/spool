// @vitest-environment happy-dom

import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	CODEX_OFFERED,
	cell,
	cells,
	closed,
	drop,
	effortPill,
	effortPills,
	effortToggle,
	ended,
	field,
	footerRow,
	freshBrowser,
	live,
	modelMenu,
	modelRow,
	modelRows,
	modelTrigger,
	mount,
	newThread,
	OFFERED,
	ONE,
	openCell,
	openModelMenu,
	press,
	rail,
	reported,
	resizeRail,
	send,
	settle,
	shot,
	storedThread,
	TWO,
	threadTitle,
	type,
	until,
	usageLine,
	warned,
} from "./agent-rail-harness";

/**
 * Codex as an agent the client will name (#364).
 *
 * This branch's engine union stops at claude and spool, so the client drops any other id
 * the daemon reports, and the menu's paths for another agent — a second group, a sign-in
 * line, asking before a started chat changes agent — are only reachable with a third.
 * Only the tests that put codex on the machine ever report it.
 */
vi.mock("../../daemon/agent-engine", async (actual) => ({
	...(await actual<typeof import("../../daemon/agent-engine")>()),
	isAgentEngineId: (value: unknown) => value === "claude" || value === "pi" || value === "codex",
}));

beforeEach(freshBrowser);

describe("the model menu", () => {
	/**
	 * A blank chat follows the machine's agent, and a chat that has an agent keeps it: the
	 * row of one on another agent says which, because the list leaves the usual one unsaid.
	 */
	it("starts a new chat on the machine's agent and keeps the older chat's draft and agent", async () => {
		const canvas = mount();
		canvas.stored.served = [storedThread({ id: ONE, ask: "original chat", engine: "pi", draft: "original draft" })];
		await canvas.render();
		await settle();
		await newThread(canvas.host);
		await settle(50);
		expect(field(canvas.host)?.value).toBe("");
		expect(document.activeElement).toBe(field(canvas.host));
		// Claude is the usual agent, so the trigger names the model alone
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);
		expect(modelTrigger(canvas.host)?.querySelector("[data-agent-trigger-engine]")).toBeNull();

		const original = await cell(canvas.host, "original chat");
		expect(original?.querySelector("[data-agent-thread-engine]")?.textContent).toBe("pi");
		expect((await cell(canvas.host, "new thread"))?.querySelector("[data-agent-thread-engine]")).toBeNull();

		await openCell(canvas.host, "original chat");
		await settle(50);
		expect(field(canvas.host)?.value).toBe("original draft");
	});

	it("marks pi's local models and waits for the accepted model before changing the footer", async () => {
		const canvas = mount();
		canvas.stored.served = [storedThread({ id: ONE, ask: "saved thread", engine: "pi", draft: "keep my draft" })];
		canvas.offered.offer = {
			models: [
				{
					value: "openai-codex/gpt-5.6-luna",
					resolvedModel: "openai-codex/gpt-5.6-luna",
					displayName: "GPT-5.6 Luna",
					description: "openai-codex",
					supportsEffort: true,
					supportedEffortLevels: ["off", "minimal", "low", "medium", "high", "xhigh"],
				},
				{
					value: "ollama/qwen3:8b",
					resolvedModel: "ollama/qwen3:8b",
					displayName: "Qwen3 8B",
					description: "ollama",
					local: true,
				},
			],
			current: {
				value: "openai-codex/gpt-5.6-luna",
				resolved: "openai-codex/gpt-5.6-luna",
				name: "GPT-5.6 Luna",
				effort: "high",
				pin: null,
			},
			modes: false,
		};
		// before pi has said it has no modes, there is no mode menu to flash in and out: on a
		// page that has not heard from pi yet, which every test's page is
		let answer: (() => void) | undefined;
		canvas.offered.reading = new Promise<void>((resolve) => {
			answer = resolve;
		});
		await canvas.render();
		await until(() => canvas.offered.asked.length > 0);
		await settle(50);
		expect(canvas.host.querySelector("[data-permission-trigger]")).toBeNull();
		canvas.offered.reading = null;
		await act(async () => answer?.());
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("GPT-5.6 Luna") === true);
		await act(async () => modelTrigger(canvas.host)?.click());
		await settle(50);
		expect(modelRows(canvas.host)).toEqual(["GPT-5.6 Luna", "Qwen3 8B"]);
		// the model on this machine says so after its name, and only that one (#363)
		const local = ["GPT-5.6 Luna", "Qwen3 8B"].map(
			(name) => modelRow(canvas.host, name)?.querySelector("[data-agent-model-local]") !== null,
		);
		expect(local).toEqual([false, true]);
		expect(modelRow(canvas.host, "Qwen3 8B")?.querySelector("[data-agent-model-local]")?.textContent).toBe("local");
		// pi never asks, so this chat has no mode menu once it has said so either
		expect(canvas.host.querySelector("[data-permission-trigger]")).toBeNull();
		let release: (() => void) | undefined;
		canvas.offered.hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		await act(async () => modelRow(canvas.host, "Qwen3 8B")?.click());
		expect(modelMenu(canvas.host)).toBeNull();
		expect(canvas.host.querySelector("[data-agent-model]")?.getAttribute("data-agent-model")).toBe("Qwen3 8B");
		await act(async () => release?.());
		expect(field(canvas.host)?.value).toBe("keep my draft");
		expect(canvas.offered.chose).toEqual([{ thread: ONE, value: "ollama/qwen3:8b" }]);
	});

	it("is populated by the binary rather than by a table spool ships", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);

		// five rows came back and none of them is `Opus`: the reply is what names them
		expect(modelRows(canvas.host)).toEqual([
			"Default (recommended)",
			"Opus (1M context)",
			"Fable",
			"Sonnet",
			"Haiku",
		]);
		// and it asks again on the way open, because the answer is the installed CLI's
		expect(modelMenu(canvas.host)).not.toBeNull();
		// one menu for the agent and its model, the agent a group over its models, and the
		// chosen row checked as the one that is current (#364)
		expect(modelMenu(canvas.host)?.getAttribute("role")).toBe("menu");
		expect(modelMenu(canvas.host)?.getAttribute("aria-label")).toBe("Agent and model");
		expect(live(canvas.host, "[data-agent-group]").map((group) => group.getAttribute("data-agent-group"))).toEqual([
			"claude",
		]);
		const chosen = modelRow(canvas.host, "Opus (1M context)");
		expect(chosen?.getAttribute("role")).toBe("menuitemradio");
		expect(chosen?.getAttribute("aria-checked")).toBe("true");
		expect(chosen?.getAttribute("aria-current")).toBe("true");
		expect(chosen?.getAttribute("data-agent-model-engine")).toBe("claude");
		expect(modelRow(canvas.host, "Sonnet")?.getAttribute("aria-checked")).toBe("false");
		// five models is too few to need finding
		expect(modelMenu(canvas.host)?.querySelector('input[aria-label="Find a model"]')).toBeNull();
	});

	/** past twelve models a field to find one stands at the top, and narrows every group */
	it("offers a find field past twelve models, and narrows the rows to what it holds", async () => {
		const canvas = mount();
		const many = Array.from({ length: 13 }, (_, at) => ({
			value: `model-${at}`,
			resolvedModel: `model-${at}`,
			displayName: at === 7 ? "Sonnet" : at === 8 ? "Opus 5.5" : `Model ${at}`,
			description: "",
		}));
		canvas.offered.offer = { models: many, current: { ...OFFERED.current, value: "model-0", effort: null } };
		await canvas.render();
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Model 0") === true);
		await act(async () => modelTrigger(canvas.host)?.click());
		await settle(50);

		expect(modelRows(canvas.host)).toHaveLength(13);
		const find = modelMenu(canvas.host)?.querySelector<HTMLInputElement>('input[aria-label="Find a model"]');
		expect(find).not.toBeNull();
		// the field is where the keys go first
		expect(document.activeElement).toBe(find);
		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			setter?.call(find, "sonn");
			find?.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(modelRows(canvas.host)).toEqual(["Sonnet"]);

		// a found version keeps its legible period, inside the mark of what was found (#364)
		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			setter?.call(find, "5.5");
			find?.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(modelRows(canvas.host)).toEqual(["Opus 5.5"]);
		const found = modelRow(canvas.host, "Opus 5.5");
		expect(found?.querySelector("mark")?.textContent).toBe("5.5");
		expect(found?.querySelector("mark [data-version-period]")).not.toBeNull();

		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			setter?.call(find, "nothing like it");
			find?.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(modelRows(canvas.host)).toEqual([]);
		expect(modelMenu(canvas.host)?.textContent).toContain("No models match “nothing like it”.");
	});

	it("keeps model descriptions available without repeating them in the list", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);
		const row = modelRow(canvas.host, "Sonnet");
		expect(row?.title).toBe("Sonnet 5 · Efficient for routine tasks");
		expect(row?.textContent).not.toContain("Efficient for routine tasks");
	});

	/**
	 * Effort is a property of the chosen model, so it opens in place under that row rather
	 * than on a page of its own (#364): the models stay where they were, and the level held
	 * is the one pressed.
	 */
	it("opens supported effort levels in place under the chosen model", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);

		const toggle = effortToggle(canvas.host);
		expect(toggle?.getAttribute("aria-label")).toBe("Effort, high");
		expect(toggle?.getAttribute("aria-expanded")).toBe("false");
		expect(effortPills(canvas.host)).toEqual([]);
		// only the chosen row carries one
		expect(live(canvas.host, "[data-agent-effort-toggle]")).toHaveLength(1);

		await act(async () => toggle?.click());
		expect(toggle?.getAttribute("aria-expanded")).toBe("true");
		expect(effortPills(canvas.host).map((pill) => pill.getAttribute("data-agent-effort"))).toEqual([
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
		]);
		expect(effortPill(canvas.host, "high")?.getAttribute("aria-pressed")).toBe("true");
		expect(effortPill(canvas.host, "low")?.getAttribute("aria-pressed")).toBe("false");
		// and the models are still the list it opened under
		expect(modelRows(canvas.host)).toContain("Sonnet");
		expect(modelMenu(canvas.host)?.textContent).not.toContain("Change effort");
		expect(modelMenu(canvas.host)?.textContent).not.toContain("Back to models");

		await act(async () => toggle?.click());
		expect(effortPills(canvas.host)).toEqual([]);
	});

	it("shows no effort control at all on a model that reports no levels", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);

		await act(async () => modelRow(canvas.host, "Haiku")?.click());
		await settle(50);
		await act(async () => modelTrigger(canvas.host)?.click());
		await settle(50);

		// haiku carries no `supportedEffortLevels` at all, so the control is absent rather
		// than present and inert — which makes it a fact rather than a judgement
		expect(modelRows(canvas.host)).toEqual([
			"Default (recommended)",
			"Opus (1M context)",
			"Fable",
			"Sonnet",
			"Haiku",
		]);
		expect(modelMenu(canvas.host)?.textContent).not.toContain("effort");
		expect(effortToggle(canvas.host)).toBeNull();
		// the level held was not carried to a model that has none to take it
		expect(canvas.offered.chose).toEqual([{ thread: canvas.offered.asked[0], value: "haiku" }]);
		// and the readout drops the level with it, because the model says it has none
		expect(modelTrigger(canvas.host)?.textContent).toContain("Haiku");
		expect(modelTrigger(canvas.host)?.textContent).not.toContain("high");
	});

	/**
	 * Story 16: another model of the same agent keeps the effort where it has that level,
	 * and otherwise goes to the model's own default, which is the agent's to say.
	 */
	it("carries the effort to a model that has the level, and leaves it to the default where not", async () => {
		const canvas = mount();
		const levels = (value: string, displayName: string, supportedEffortLevels: string[]) => ({
			value,
			resolvedModel: value,
			displayName,
			description: "",
			supportsEffort: true,
			supportedEffortLevels,
		});
		canvas.offered.offer = {
			models: [
				levels("deep", "Deep", ["low", "medium", "high", "max"]),
				levels("broad", "Broad", ["low", "medium", "high", "max"]),
				levels("quick", "Quick", ["low", "medium", "high"]),
			],
			current: { value: "deep", resolved: "deep", name: null, effort: "max", pin: null },
		};
		// the agent answers a model picked with no level on its own default for that model
		canvas.offered.reply = (offer, wanted) => {
			const next = reported(offer, wanted);
			return wanted.effort === undefined && wanted.value !== undefined
				? { ...next, current: { ...next.current, effort: "medium" } }
				: next;
		};
		await canvas.render();
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Deep") === true);

		await act(async () => modelTrigger(canvas.host)?.click());
		await settle(50);
		await act(async () => modelRow(canvas.host, "Broad")?.click());
		await settle(50);
		expect(canvas.offered.chose.at(-1)).toEqual({ thread: canvas.offered.asked[0], value: "broad", effort: "max" });
		await until(() => modelTrigger(canvas.host)?.title === "Claude Code · Broad · max");

		await act(async () => modelTrigger(canvas.host)?.click());
		await settle(50);
		await act(async () => modelRow(canvas.host, "Quick")?.click());
		await settle(50);
		// quick has no max, so nothing is asked of it: the model's default answers
		expect(canvas.offered.chose.at(-1)).toEqual({ thread: canvas.offered.asked[0], value: "quick" });
		await until(() => modelTrigger(canvas.host)?.title !== "Claude Code · Quick · max", 400).catch(() => {});
		expect(modelTrigger(canvas.host)?.title).toBe("Claude Code · Quick · medium");
	});

	it("sends the message, and lets the reply move the readout", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);

		await act(async () => modelRow(canvas.host, "Sonnet")?.click());
		await settle(50);

		expect(canvas.offered.chose.map((one) => one.value)).toEqual(["sonnet"]);
		expect(modelTrigger(canvas.host)?.textContent).toContain("Sonnet");
		// the menu closes on a model, because that was the decision, and is gone once its
		// exit has played
		expect(modelMenu(canvas.host)).toBeNull();
		await settle(200);
		expect(canvas.host.querySelector("[data-agent-model-menu]")).toBeNull();
		// and it went to the thread that is open, because that is what the answer is about
		expect(canvas.offered.chose[0]?.thread).toBe(canvas.offered.asked[0]);
	});

	it("is asked again per thread, because which machine is answering is one thread's fact", async () => {
		const canvas = mount();
		canvas.stored.served = [
			storedThread({ id: ONE, ask: "tighten the header", frame: "home", at: 20 }),
			storedThread({ id: TWO, ask: "write the copy deck", frame: "copy-deck", at: 10 }),
		];
		await canvas.render();
		await until(() => canvas.offered.asked.length > 0);

		await openCell(canvas.host, "write the copy deck");
		await until(() => canvas.offered.asked.length > 1);

		// a project runs one thread on Opus and another on Haiku, so switching re-asks
		// rather than carrying the last thread's model across
		expect(canvas.offered.asked).toEqual([ONE, TWO]);
	});

	it("moves under the finger, a whole spawn before the binary has answered", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);
		let answer = () => {};
		canvas.offered.hold = new Promise<void>((done) => {
			answer = done;
		});

		await act(async () => modelRow(canvas.host, "Sonnet")?.click());
		await settle(50);

		// the reply is a spawn away — about a second on a cold binary — and nothing on
		// screen waits for it. The level rides across because sonnet offers it
		expect(canvas.offered.chose.map((one) => one.value)).toEqual(["sonnet"]);
		expect(canvas.offered.chose[0]?.effort).toBe("high");
		expect(modelTrigger(canvas.host)?.textContent).toContain("Sonnet");

		canvas.offered.hold = null;
		answer();
		await settle(50);
		// and what stays is the report, which here says the same thing the finger did
		expect(modelTrigger(canvas.host)?.textContent).toContain("Sonnet");
	});

	it("takes the effort with it the moment a model reporting none is pressed", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);
		let answer = () => {};
		canvas.offered.hold = new Promise<void>((done) => {
			answer = done;
		});

		await act(async () => modelRow(canvas.host, "Haiku")?.click());
		await settle(50);
		await act(async () => modelTrigger(canvas.host)?.click());
		await settle(50);

		// `Haiku · high` for the second the door is shut would be a level on a model that
		// reports no levels at all, so the press asserts the name and drops the rest
		expect(modelTrigger(canvas.host)?.textContent).toContain("Haiku");
		expect(modelTrigger(canvas.host)?.textContent).not.toContain("high");
		expect(modelRows(canvas.host)).not.toContain("max");

		canvas.offered.hold = null;
		answer();
		await settle(50);
	});

	it("puts the readout back when the binary does not take the choice", async () => {
		const canvas = mount();
		await canvas.render();
		// the report comes back unchanged, which is what an alias `list_models` never
		// offered does: the press is a claim with an expiry and never the authority
		canvas.offered.reply = (offer) => offer;
		await openModelMenu(canvas);
		let answer = () => {};
		canvas.offered.hold = new Promise<void>((done) => {
			answer = done;
		});

		await act(async () => modelRow(canvas.host, "Sonnet")?.click());
		await settle(50);
		expect(modelTrigger(canvas.host)?.textContent).toContain("Sonnet");

		canvas.offered.hold = null;
		answer();
		await settle(50);

		expect(canvas.offered.chose.map((one) => one.value)).toEqual(["sonnet"]);
		expect(modelTrigger(canvas.host)?.textContent).toContain("Opus (1M context)");
	});

	it("keeps the menu open on an effort level, because it refines the model above it", async () => {
		const canvas = mount();
		await canvas.render();
		await openModelMenu(canvas);

		await act(async () => effortToggle(canvas.host)?.click());
		await act(async () => effortPill(canvas.host, "xhigh")?.click());
		await settle(50);

		// the level alone, set in place: the model above it is not sent again
		expect(canvas.offered.chose).toEqual([{ thread: canvas.offered.asked[0], effort: "xhigh" }]);
		expect(modelMenu(canvas.host)).not.toBeNull();
		expect(effortPill(canvas.host, "xhigh")?.getAttribute("aria-pressed")).toBe("true");
		expect(effortToggle(canvas.host)?.getAttribute("aria-label")).toBe("Effort, xhigh");
		expect(modelTrigger(canvas.host)?.textContent).toContain("Opus (1M context)");
	});

	it("says which variable holds the effort, and offers no level it cannot move", async () => {
		const canvas = mount();
		canvas.offered.offer = {
			models: OFFERED.models,
			current: { ...OFFERED.current, effort: "max", pin: "max" },
		};
		await canvas.render();
		await openModelMenu(canvas);

		await act(async () => effortToggle(canvas.host)?.click());
		expect(modelMenu(canvas.host)?.querySelector('[role="status"]')?.textContent).toBe(
			"CLAUDE_CODE_EFFORT_LEVEL=max is set in the environment.",
		);
		expect(effortPill(canvas.host, "low")?.disabled).toBe(true);
		expect(effortPill(canvas.host, "max")?.disabled).toBe(false);
		expect(modelTrigger(canvas.host)?.textContent).toContain("Opus (1M context)");
	});
});

describe("the usage window", () => {
	it("is absent until the binary warns, and draws no gauge below that", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		// at `allowed` the payload carries no utilization at all, so there is nothing to
		// draw a gauge from and nothing to say
		canvas.turn.push({
			kind: "limit",
			limit: { status: "allowed", window: "seven_day", resetsAt: 1785308400, usingOverage: false },
			parent: null,
		});
		await settle(150);
		await openModelMenu(canvas);

		expect(usageLine(canvas.host)).toBeNull();
		expect(modelMenu(canvas.host)?.textContent).not.toContain("%");
		// and nothing on the trigger hints at a line the menu does not have
		expect(modelTrigger(canvas.host)?.querySelector("[data-agent-limit-dot]")).toBeNull();

		// and nothing about overage at any status: billing spool has no relationship to
		// narrate, and it is moot anyway, since overage being on means the limit is not
		// stopping you
		canvas.turn.push({ kind: "limit", limit: { ...warned.limit, usingOverage: true }, parent: null });
		await settle(150);
		expect(usageLine(canvas.host)).toMatch(/^weekly limit 92% · resets [a-z]{3}$/);
		// once there is a line, one quiet dot on the trigger says the menu has it (#364)
		expect(modelTrigger(canvas.host)?.querySelector("[data-agent-limit-dot]")).not.toBeNull();
		expect(modelMenu(canvas.host)?.textContent).not.toMatch(/overage|credit/i);
		expect(rail(canvas.host)?.textContent).not.toMatch(/overage/i);
	});

	it("renders whole inside the menu, at every rail width", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		canvas.turn.push(warned);
		await settle(150);
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);

		for (const width of [380, 420, 480, 560]) {
			await resizeRail(canvas.host, width);
			await act(async () => modelTrigger(canvas.host)?.click());
			// the reset time is half of what the readout is for: ninety-two per cent of a
			// week is a different fact depending on whether it comes back Wednesday or in
			// an hour. In the footer at 420 it clipped to `resets…`
			expect(usageLine(canvas.host)).toMatch(/^weekly limit 92% · resets [a-z]{3}$/);
			// inside this agent's own group, under its name
			expect(modelMenu(canvas.host)?.querySelector('[data-agent-group="claude"] [data-agent-usage]')).not.toBeNull();
			const panel = modelMenu(canvas.host)?.closest<HTMLElement>("[data-float]");
			expect(panel?.className).toContain("w-[384px]");
			expect(panel?.className).toContain("max-w-full");
			expect(footerRow(canvas.host)?.contains(panel ?? null)).toBe(true);
			await act(async () => modelTrigger(canvas.host)?.click());
			await settle(200);
		}
	});

	it("outlives the turn that saw it, because the window does", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		canvas.turn.push(warned);
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle(150);
		await send(canvas.host, "and again");
		await settle(50);
		await openModelMenu(canvas);

		// it came back on the message before this one and it will still be true tomorrow,
		// so a new turn does not clear it
		expect(usageLine(canvas.host)).toContain("weekly limit 92%");
	});

	it("draws the wind-down across the log, because it is why the work stops early", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		canvas.turn.push(warned);
		await settle(150);
		expect(rail(canvas.host)?.textContent).not.toContain("winding down");

		canvas.turn.push({
			kind: "limit",
			limit: { ...warned.limit, status: "rejected", graceActive: true },
			parent: null,
		});
		await settle(150);

		// the agent has been told to finish or checkpoint and start nothing new, and
		// without a line saying so the delegation it announced and never made reads as the
		// agent losing the thread
		expect(rail(canvas.host)?.textContent).toContain("usage limit reached · winding down");
		await openModelMenu(canvas);
		expect(usageLine(canvas.host)).toContain("weekly limit hit");
	});
});

/* ---------- another agent in the menu (#364) ----------
 * Every installed agent is a group in the one menu, this chat's own first. A model on
 * another agent changes an empty chat in place, and in a started chat says first that it
 * starts a new one, because a conversation keeps the agent it was had with.
 *
 * Last in the file on purpose: the machine's agent choice is one value for the page, and
 * these tests leave it on codex, so nothing that expects Claude comes after them. */

describe("another agent in the menu", () => {
	/** codex on the machine beside Claude, installed or not */
	const withCodex = (canvas: ReturnType<typeof mount>, installed = true) => {
		canvas.engines.listed = [
			{ id: "claude", installed: true },
			{ id: "codex", installed },
		];
	};
	const groups = (host: HTMLElement) =>
		live(host, "[data-agent-group]").map((group) => group.getAttribute("data-agent-group"));
	/** the menu, open, with the other agents' doors answered */
	const openWithOthers = async (canvas: ReturnType<typeof mount>) => {
		await openModelMenu(canvas);
		await until(
			() => modelRow(canvas.host, "GPT-5.5") !== null || live(canvas.host, "[data-agent-signed-out]").length > 0,
		);
	};

	it("groups each installed agent's models under its name, this chat's own first", async () => {
		const canvas = mount();
		withCodex(canvas);
		await canvas.render();
		await openWithOthers(canvas);

		expect(groups(canvas.host)).toEqual(["claude", "codex"]);
		const codex = live(canvas.host, '[data-agent-group="codex"]')[0];
		expect(codex?.textContent).toContain("Codex");
		expect(
			live(codex ?? canvas.host, "[data-agent-model-row]").map((row) => row.getAttribute("data-agent-model-engine")),
		).toEqual(["codex", "codex"]);
		// the chosen model is this chat's, so nothing on the other agent is checked
		expect(modelRow(canvas.host, "GPT-5.5")?.getAttribute("aria-checked")).toBe("false");
		expect(modelRow(canvas.host, "Opus (1M context)")?.getAttribute("aria-checked")).toBe("true");
		// an empty chat changes agent in place, so the other group asks nothing first
		expect(codex?.textContent).not.toContain("new chat");
		// and the find field stays away while seven models are all there are
		expect(modelMenu(canvas.host)?.querySelector('input[aria-label="Find a model"]')).toBeNull();
	});

	/** the field counts every agent's models, and finds by the agent's name as well */
	it("offers the find field once every agent's models together pass twelve", async () => {
		const canvas = mount();
		withCodex(canvas);
		canvas.engines.codex.offer = {
			...CODEX_OFFERED,
			models: [
				...CODEX_OFFERED.models,
				...Array.from({ length: 6 }, (_, at) => ({
					value: `gpt-old-${at}`,
					resolvedModel: `gpt-old-${at}`,
					displayName: `Old ${at}`,
					description: "",
				})),
			],
		};
		await canvas.render();
		await openWithOthers(canvas);

		// five and eight, which is thirteen: past twelve, in all and never in one group
		expect(modelRows(canvas.host)).toHaveLength(13);
		const find = modelMenu(canvas.host)?.querySelector<HTMLInputElement>('input[aria-label="Find a model"]');
		expect(find).not.toBeNull();
		await act(async () => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(find, "codex");
			find?.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(groups(canvas.host)).toEqual(["codex"]);
		expect(modelRows(canvas.host)).toHaveLength(8);
	});

	it("changes an empty chat's agent in place, keeping its draft, image and thread", async () => {
		const canvas = mount();
		withCodex(canvas);
		await canvas.render();
		await until(() => canvas.offered.asked.length > 0);
		const thread = canvas.offered.asked[0];
		await act(async () => type(field(canvas.host) as HTMLTextAreaElement, "keep this draft"));
		await drop(canvas.host, shot());
		await settle(50);
		await openWithOthers(canvas);

		await act(async () => modelRow(canvas.host, "GPT-5.5 mini")?.click());
		await settle(100);

		// nothing asked first: the model is chosen for codex, and then codex is saved as the
		// machine's agent, which is what the blank chat follows
		expect(live(canvas.host, "[data-agent-new-thread]")).toEqual([]);
		expect(canvas.engines.codex.chose).toEqual([{ value: "gpt-5.5-mini" }]);
		expect(canvas.engines.calls).toEqual(["POST codex model", "PUT engines codex"]);
		expect(canvas.machine.preferred).toBe("codex");
		expect(modelMenu(canvas.host)).toBeNull();
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("GPT-5.5") === true);
		// codex is the usual agent now, so the trigger names the model alone
		expect(modelTrigger(canvas.host)?.querySelector("[data-agent-trigger-engine]")).toBeNull();

		// and the chat is the same chat, with everything that was in its box
		expect(field(canvas.host)?.value).toBe("keep this draft");
		expect(canvas.host.querySelectorAll("[data-agent-attached]")).toHaveLength(1);
		expect(await cells(canvas.host)).toEqual(["new thread"]);
		await send(canvas.host, "keep this draft");
		await settle(50);
		expect(canvas.turn.streams[0]?.thread).toBe(thread);
		expect(canvas.turn.attachments[0]?.[0]?.media).toBe("image/png");
	});

	/** story 11: the next chat really uses the agent, because the menu waits for the save */
	it("stays open until the agent is saved and confirmed, and closes only then", async () => {
		const canvas = mount();
		withCodex(canvas);
		let release = () => {};
		canvas.machine.saving = new Promise<void>((resolve) => {
			release = resolve;
		});
		await canvas.render();
		await openWithOthers(canvas);

		await act(async () => modelRow(canvas.host, "GPT-5.5 mini")?.click());
		await settle(100);
		// the save is out and not answered: the menu is still up, and says it is busy
		expect(canvas.engines.calls).toEqual(["POST codex model", "PUT engines codex"]);
		expect(modelMenu(canvas.host)).not.toBeNull();
		expect(modelMenu(canvas.host)?.getAttribute("aria-busy")).toBe("true");
		expect(canvas.machine.preferred).toBe("claude");

		await act(async () => release());
		await settle(200);
		expect(canvas.machine.preferred).toBe("codex");
		expect(modelMenu(canvas.host)).toBeNull();
	});

	it("keeps the menu open and says so when the daemon does not take the agent", async () => {
		const canvas = mount();
		withCodex(canvas);
		canvas.machine.refuses = true;
		await canvas.render();
		await openWithOthers(canvas);

		await act(async () => modelRow(canvas.host, "GPT-5.5 mini")?.click());
		await settle(200);
		expect(canvas.engines.calls).toEqual(["POST codex model", "PUT engines codex"]);
		expect(modelMenu(canvas.host)).not.toBeNull();
		expect(modelMenu(canvas.host)?.getAttribute("aria-busy")).toBeNull();
		expect(live(canvas.host, "[data-agent-switch-failed]")[0]?.textContent).toBe(
			"Spool could not save Codex as your agent. Try again.",
		);
		expect(canvas.machine.preferred).toBe("claude");
	});

	/** the agent is the choice; its models are only how it is chosen, so a list it cannot give is no bar */
	it("still offers an agent whose models could not be read, as one row named after it", async () => {
		const canvas = mount();
		withCodex(canvas);
		canvas.engines.codex.offer = null;
		await canvas.render();
		await until(() => canvas.offered.asked.length > 0);
		const thread = canvas.offered.asked[0];
		await openModelMenu(canvas);
		await until(() => modelRow(canvas.host, "Codex") !== null);

		expect(live(canvas.host, '[data-agent-group="codex"] [data-agent-model-row]')).toHaveLength(1);
		await act(async () => modelRow(canvas.host, "Codex")?.click());
		await settle(100);

		// nothing to choose a model from, so nothing is chosen: the empty chat moves in place
		expect(canvas.engines.codex.chose).toEqual([]);
		expect(canvas.engines.calls).toEqual(["PUT engines codex"]);
		expect(canvas.machine.preferred).toBe("codex");
		expect(await cells(canvas.host)).toEqual(["new thread"]);
		await send(canvas.host, "on codex");
		await settle(50);
		expect(canvas.turn.streams[0]?.thread).toBe(thread);
	});

	/**
	 * A conversation keeps the agent it was had with, so a model on another agent in a
	 * started chat is a new chat, and the menu says so before anything changes.
	 */
	it("asks before a started chat changes agent, and starts a new chat on a yes", async () => {
		const canvas = mount();
		withCodex(canvas);
		canvas.stored.served = [storedThread({ id: ONE, ask: "tighten the header" })];
		await canvas.render();
		await settle();
		await openWithOthers(canvas);
		const asking = () => live(canvas.host, '[data-agent-new-thread="codex"]')[0] ?? null;

		expect(live(canvas.host, '[data-agent-group="codex"]')[0]?.textContent).toContain("new chat");
		expect(asking()).toBeNull();

		await act(async () => modelRow(canvas.host, "GPT-5.5")?.click());
		// asked, and nothing sent: the press is a question until it is answered
		expect(asking()?.textContent).toContain("Starts a new chat on Codex. This one stays in your chats.");
		expect(canvas.engines.calls).toEqual([]);
		expect(modelMenu(canvas.host)).not.toBeNull();
		expect(modelRow(canvas.host, "Opus (1M context)")?.getAttribute("aria-checked")).toBe("true");
		// the same press again takes the question back
		await act(async () => modelRow(canvas.host, "GPT-5.5")?.click());
		expect(asking()).toBeNull();
		await act(async () => modelRow(canvas.host, "GPT-5.5")?.click());

		await press([...(asking()?.querySelectorAll("button") ?? [])].find((one) => one.textContent === "New chat"));
		await settle(100);

		expect(canvas.engines.codex.chose).toEqual([{ value: "gpt-5.5" }]);
		expect(canvas.engines.calls).toEqual(["POST codex model", "PUT engines codex"]);
		expect(canvas.machine.preferred).toBe("codex");
		// a new chat, on codex, and the one that was open is still in the list, named by its
		// agent now that its agent is not the usual one
		expect(threadTitle(canvas.host)).toBe("New chat");
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("GPT-5.5") === true);
		expect(await cells(canvas.host)).toEqual(["new thread", "tighten the header"]);
		expect(
			(await cell(canvas.host, "tighten the header"))?.querySelector("[data-agent-thread-engine]")?.textContent,
		).toBe("Claude Code");
		expect(canvas.offered.chose).toEqual([]);
	});

	/** the trigger says who answers only when it is not who usually does */
	it("names the chat's agent on the trigger only when it is not the machine's usual one", async () => {
		const canvas = mount();
		withCodex(canvas);
		canvas.machine.preferred = "codex";
		canvas.stored.served = [storedThread({ id: ONE, ask: "tighten the header" })];
		await canvas.render();
		await settle();
		await until(() => modelTrigger(canvas.host)?.querySelector("[data-agent-trigger-engine]") !== null);

		expect(modelTrigger(canvas.host)?.querySelector("[data-agent-trigger-engine]")?.textContent).toBe("Claude Code");
		expect(modelTrigger(canvas.host)?.textContent).toBe("Claude Code·Opus (1M context)");
	});

	it("shows a signed-out agent's login line in place of its models, and looks again", async () => {
		const canvas = mount();
		withCodex(canvas);
		canvas.engines.codex.signedIn = false;
		await canvas.render();
		await openWithOthers(canvas);

		const out = live(canvas.host, '[data-agent-signed-out="codex"]')[0];
		expect(out?.textContent).toContain("Codex is signed out. Sign in from a terminal and its models show up here.");
		expect(out?.querySelector('[data-agent-command="codex login"]')).not.toBeNull();
		expect(modelRow(canvas.host, "GPT-5.5")).toBeNull();
		expect(live(canvas.host, '[data-agent-group="codex"]')[0]?.textContent).toContain("signed out");

		canvas.engines.codex.signedIn = true;
		await press([...(out?.querySelectorAll("button") ?? [])].find((one) => one.textContent === "Check again"));
		await until(() => modelRow(canvas.host, "GPT-5.5") !== null);
		expect(live(canvas.host, "[data-agent-signed-out]")).toEqual([]);
	});

	it("keeps an agent the machine lacks to one quiet line that opens to its install line", async () => {
		const canvas = mount();
		withCodex(canvas, false);
		await canvas.render();
		await openModelMenu(canvas);
		const more = () =>
			live<HTMLButtonElement>(canvas.host, "[data-agent-model-menu] button").find(
				(one) => one.textContent === "Get more agents",
			);
		await until(() => more() !== undefined);

		expect(groups(canvas.host)).toEqual(["claude"]);
		expect(more()?.getAttribute("aria-expanded")).toBe("false");
		expect(live(canvas.host, '[data-agent-install="codex"]')).toEqual([]);

		await press(more());
		expect(more()?.getAttribute("aria-expanded")).toBe("true");
		const install = live(canvas.host, '[data-agent-install="codex"]')[0];
		expect(install?.textContent).toContain("Codex");
		expect(install?.querySelector('[data-agent-command="npm i -g @openai/codex"]')).not.toBeNull();
	});
});
