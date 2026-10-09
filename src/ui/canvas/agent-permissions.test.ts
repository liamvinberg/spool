// @vitest-environment happy-dom

import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { field, freshBrowser, live, modelTrigger, mount, OFFERED, press, settle, until } from "./agent-rail-harness";

beforeEach(freshBrowser);

/**
 * The machine's one mode, from the foot (#361, #364): three modes in a person's words,
 * each with what it lets the agent do, and a footnote that it is every chat's.
 */
describe("the mode menu", () => {
	const trigger = (host: HTMLElement) => host.querySelector<HTMLButtonElement>("[data-permission-trigger]");
	const menu = (host: HTMLElement) => live(host, "[data-permission-menu]")[0] ?? null;

	it("names the three modes and what each lets the agent do, and a pick saves for every chat", async () => {
		const canvas = mount();
		await canvas.render();
		await until(() => trigger(canvas.host)?.textContent === "Ask first");

		await press(trigger(canvas.host));
		expect(trigger(canvas.host)?.getAttribute("aria-expanded")).toBe("true");
		const items = [...(menu(canvas.host)?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
		expect(items.map((item) => item.getAttribute("data-permission-mode"))).toEqual(["ask", "edits", "bypass"]);
		expect(items.map((item) => item.textContent)).toEqual([
			"Ask firstAsks before it edits outside design/ or runs commands.",
			"Auto-editEdits files without asking. Asks before commands.",
			"Full accessNever asks.",
		]);
		expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
		expect(menu(canvas.host)?.querySelector("p")?.textContent).toBe("Applies to every chat.");

		await press(items[1]);
		await settle(50);
		expect(menu(canvas.host)).toBeNull();
		expect(canvas.permissions.picks).toEqual(["edits"]);
		expect(trigger(canvas.host)?.textContent).toBe("Auto-edit");
	});

	/**
	 * The menu leaves a beat after it closes, and hands focus back to its trigger as it
	 * goes. Whatever was pressed in that beat keeps the focus it took (#364).
	 */
	it("hands focus back to its trigger as it goes, but never takes it from what came next", async () => {
		const canvas = mount();
		await canvas.render();
		await until(() => trigger(canvas.host)?.textContent === "Ask first");

		await press(trigger(canvas.host));
		const checked = menu(canvas.host)?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
		expect(document.activeElement).toBe(checked);
		await act(async () => {
			checked?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		await settle(200);
		expect(document.activeElement).toBe(trigger(canvas.host));

		await press(trigger(canvas.host));
		await press(trigger(canvas.host));
		// pressed while the menu is still leaving
		field(canvas.host)?.focus();
		await settle(200);
		expect(canvas.host.querySelector("[data-permission-menu]")).toBeNull();
		expect(document.activeElement).toBe(field(canvas.host));
	});

	/** an agent that has no modes to offer is not offered a menu of them */
	it("is not drawn for an agent that reports no modes", async () => {
		const canvas = mount();
		canvas.offered.offer = { ...OFFERED, modes: false };
		await canvas.render();
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);
		await settle(50);

		expect(trigger(canvas.host)).toBeNull();
	});
});
