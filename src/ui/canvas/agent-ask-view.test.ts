// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import type { AgentReply } from "../../daemon/agent-control";
import type { AskQuestion } from "./agent-ask";
import { AskCard, type AskEntry, optionFrames, useAsk, waitingAsk } from "./agent-ask-view";
import type { AgentTile } from "./agent-transcript";

/*
 * An ask as the rail draws it (#366): which frames a question's options name, and a card
 * that answers with a press — one pick, several ticked and sent, or an approval's three.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tile = (frame: string): AgentTile => ({
	key: frame,
	frame,
	state: "done",
	lines: 40,
	by: null,
	range: null,
	took: null,
});

const question = (labels: string[], multi = false): AskQuestion => ({
	header: "Pick",
	question: "Which one?",
	multi,
	options: labels.map((label) => ({ label, description: `${label}, described.` })),
});

const entry = (over: Partial<AskEntry> = {}): AskEntry => ({
	key: "ask:c1",
	kind: "ask",
	request: "req-1",
	question: false,
	asked: "Adding a date library for the opening hours.",
	tool: "Bash",
	detail: "npm install dayjs",
	questions: [],
	always: true,
	state: "open",
	words: null,
	...over,
});

function Card({ ask, onAnswer }: { ask: AskEntry; onAnswer: (request: string, reply: AgentReply) => void }) {
	return createElement(AskCard, { entry: ask, ask: useAsk(ask, onAnswer) });
}

function card(ask: AskEntry) {
	const answers: { request: string; reply: AgentReply }[] = [];
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => root.render(createElement(Card, { ask, onAnswer: (request, reply) => answers.push({ request, reply }) })));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	const press = (option: string) =>
		act(() => host.querySelector<HTMLButtonElement>(`[data-agent-option="${option}"]`)?.click());
	return { host, answers, press };
}

describe("optionFrames", () => {
	const tiles = [tile("home--calm"), tile("home--bold"), tile("app/cart")];

	it("names a frame by its whole name or its take", () => {
		expect(optionFrames(question(["Calm", "home--bold"]), tiles)).toEqual(["home--calm", "home--bold"]);
		expect(optionFrames(question(["Cart", "Bold"]), tiles)).toEqual(["app/cart", "home--bold"]);
	});

	it("is null for a question half about pictures, or about none", () => {
		expect(optionFrames(question(["Calm", "Neither"]), tiles)).toBeNull();
		expect(optionFrames(question(["Yes", "No"]), tiles)).toBeNull();
	});

	it("never names one frame twice, and needs two options and a frame", () => {
		expect(optionFrames(question(["Calm", "Calm"]), tiles)).toBeNull();
		expect(optionFrames(question(["Calm"]), tiles)).toBeNull();
		expect(optionFrames(question(["Calm", "Bold"]), [])).toBeNull();
	});
});

describe("waitingAsk", () => {
	it("is an ask nobody has answered yet", () => {
		expect(waitingAsk(entry())).toBe(true);
		expect(waitingAsk(entry({ state: "arriving" }))).toBe(true);
		expect(waitingAsk(entry({ state: "allowed" }))).toBe(false);
	});
});

describe("an ask's card", () => {
	it("leads an approval with the agent's reason, and answers it with one of three presses", () => {
		const { host, answers, press } = card(entry());
		expect(host.querySelector("[data-agent-ask-look]")?.getAttribute("data-agent-ask-look")).toBe("card");
		expect(host.textContent).toContain("Adding a date library");
		expect(
			[...host.querySelectorAll("[data-agent-option]")].map((one) => one.getAttribute("data-agent-option")),
		).toEqual(["Allow", "Allow for this chat", "Deny"]);
		press("Allow for this chat");
		expect(answers).toEqual([{ request: "req-1", reply: { kind: "always" } }]);
	});

	/** absent rather than dead: spool never composes a rule of its own to fill it (the wire's side is agent-transcript's) */
	it("offers no always where the request suggested no rule", () => {
		const { host } = card(entry({ always: false }));
		expect(host.querySelector('[data-agent-option="Allow for this chat"]')).toBeNull();
	});

	it("answers a question with one press", () => {
		const { answers, press } = card(
			entry({ question: true, asked: "Which one?", questions: [question(["A", "B"])] }),
		);
		press("B");
		expect(answers).toEqual([{ request: "req-1", reply: { kind: "picked", picks: { "Which one?": "B" } } }]);
	});

	it("ticks a question that takes several, and sends them as one answer", () => {
		const { host, answers, press } = card(
			entry({ question: true, asked: "Which one?", questions: [question(["A", "B", "C"], true)] }),
		);
		press("A");
		press("C");
		expect(answers).toEqual([]);
		expect(host.querySelectorAll('[data-agent-tick="on"]')).toHaveLength(2);
		const send = [...host.querySelectorAll<HTMLButtonElement>("button")].find((one) =>
			one.textContent?.startsWith("Send"),
		);
		act(() => send?.click());
		expect(answers).toEqual([{ request: "req-1", reply: { kind: "picked", picks: { "Which one?": "A, C" } } }]);
	});

	it("takes no press while its request has not landed", () => {
		const { host } = card(entry({ request: null }));
		expect(host.querySelector("[data-agent-option]")).toBeNull();
	});
});
