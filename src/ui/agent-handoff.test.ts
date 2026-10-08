// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { AgentHandoff, agentAppCommand } from "./agent-handoff";
import { fetchAgentAppAvailable, openAgentApp } from "./api";

vi.mock("./api", () => ({ fetchAgentAppAvailable: vi.fn(), openAgentApp: vi.fn() }));
beforeEach(() => {
	vi.mocked(fetchAgentAppAvailable).mockResolvedValue(false);
	vi.mocked(openAgentApp).mockReset().mockResolvedValue();
});

function mount() {
	const host = document.createElement("div");
	document.body.append(host);
	const trigger = document.createElement("button");
	document.body.append(trigger);
	trigger.focus();
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		trigger.remove();
		vi.restoreAllMocks();
	});
	return { root, trigger };
}
function button(name: string) {
	const found = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === name);
	if (!found) throw new Error(`Missing button ${name}`);
	return found;
}

it("offers exactly three apps, copies the actual folder, and keeps instructions optional", async () => {
	const { root } = mount();
	const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
	await act(async () =>
		root.render(createElement(AgentHandoff, { project: "coffee", root: "/work/coffee", onClose: vi.fn() })),
	);
	expect(document.querySelectorAll("nav button")).toHaveLength(3);
	expect(document.querySelector("details")?.open).toBe(false);
	await act(async () => button("Copy project path").click());
	expect(copy).toHaveBeenCalledExactlyOnceWith("/work/coffee");
	expect(button("Copied")).toBeTruthy();
	act(() => document.querySelectorAll<HTMLButtonElement>("nav button")[2]?.click());
	expect(document.querySelector("h3")?.textContent).toBe("Open in Antigravity");
	expect(button("Copy project path")).toBeTruthy();
	expect(document.querySelector("details")?.open).toBe(false);
	copy.mockRejectedValue(new Error("Denied"));
	await act(async () => button("Copy project path").click());
	expect(document.querySelector('[role="alert"]')?.textContent).toContain("Select the text");
});

it("offers direct opening only when available, waits for it, and leaves a failed launch retryable", async () => {
	const { root } = mount();
	vi.mocked(fetchAgentAppAvailable).mockResolvedValue(true);
	vi.mocked(openAgentApp).mockRejectedValueOnce(new Error("missing"));
	await act(async () =>
		root.render(createElement(AgentHandoff, { project: "coffee", root: "/work/coffee", onClose: vi.fn() })),
	);
	act(() => document.querySelectorAll<HTMLButtonElement>("nav button")[1]?.click());
	await act(async () => {
		button("Open project ↗").click();
		button("Open project ↗").click();
	});
	expect(openAgentApp).toHaveBeenCalledExactlyOnceWith("coffee");
	expect(document.querySelector('[role="status"]')?.textContent).toContain("Copy the project path");
	await act(async () => button("Open project ↗").click());
	expect(document.querySelector('[role="status"]')?.textContent).toBe("Project opened in ChatGPT.");
});

it("quotes shell metacharacters and apostrophes in the optional command", () => {
	expect(agentAppCommand("/work/it's $HOME `whoami` $(pwd)")).toBe("codex app '/work/it'\\''s $HOME `whoami` $(pwd)'");
});
