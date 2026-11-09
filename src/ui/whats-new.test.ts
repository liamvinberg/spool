// @vitest-environment happy-dom
import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { WhatsNewAnswer } from "../daemon/whats-new-routes";

/**
 * What's new in the window (spool#526), over a daemon played by a fetch stub:
 * told to pop, the pill unfolds into the card by itself and says once that it
 * was shown; dismissed, it goes to help, whose row brings it back.
 */

const ANSWER: WhatsNewAnswer = {
	pop: true,
	content: {
		version: "0.52.0",
		highlights: [{ title: "The agent's trail", says: "The canvas names the frame your agent writes." }],
		features: [{ name: "Mirrors stay in step", says: "A mirror shows its frame at its own size." }],
		fixes: 8,
		changelog: "https://spool.page/changelog",
	},
};

afterEach(() => {
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

const until = async (check: () => boolean) => {
	for (let tries = 0; tries < 60 && !check(); tries++) {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 100));
		});
	}
	expect(check()).toBe(true);
};

it("unfolds by itself when the daemon says so, tells it once, and comes back from help after a dismissal", async () => {
	vi.resetModules();
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	Object.defineProperty(window, "__SPOOL_CONTROL__", { configurable: true, value: "control-test-token" });
	const asked: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: unknown, init?: RequestInit) => {
			asked.push(`${init?.method ?? "GET"} ${String(url)}`);
			return String(url).endsWith("/seen") ? new Response(null, { status: 204 }) : Response.json(ANSWER);
		}),
	);
	const { useWhatsNew } = await import("./whats-new");
	const { BarEnd } = await import("./bar-end");
	function Window() {
		const whatsNew = useWhatsNew({ foot: 24 });
		return createElement(
			Fragment,
			null,
			createElement(BarEnd, { onShortcuts() {}, whatsNew: whatsNew.row }),
			whatsNew.surface,
		);
	}
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => root.render(createElement(Window)));
	const card = () => document.querySelector('section[aria-label="What\'s new"]');

	await until(() => document.body.textContent?.includes("Updated to Spool") === true);
	await until(() => card()?.textContent?.includes("The agent's trail") === true);
	expect(asked.filter((line) => line.startsWith("POST"))).toEqual(["POST /api/whats-new/seen"]);

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true }));
	});
	await until(() => card()?.textContent?.includes("Mirrors stay in step") === true);

	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
	});
	await until(() => card() === null && !document.body.textContent?.includes("Updated to Spool"));

	await act(async () => document.querySelector<HTMLButtonElement>('[data-bar-end="help"]')?.click());
	const row = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) =>
		item.textContent?.includes("What's new"),
	);
	expect(row?.textContent).toContain("0.52.0");
	await act(async () => row?.click());
	await until(() => card()?.textContent?.includes("The agent's trail") === true);
	expect(asked.filter((line) => line.startsWith("GET"))).toHaveLength(1);
	await act(async () => root.unmount());
});
