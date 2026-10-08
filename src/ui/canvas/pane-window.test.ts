// @vitest-environment happy-dom

import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { PaneBarSlots } from "./pane-bar";
import { PaneActions, type PaneDef, PaneWindow } from "./pane-window";

/**
 * The window around the canvas, with stand-in panes: what the bar's toggles do,
 * what a hidden pane keeps, what rides a toggle, the edge, the keys, and what is
 * kept across a reload. Where panes may go is `pane-layout.test.ts`; how the
 * real panes behave in it is the canvas's tests.
 */

beforeEach(() => {
	window.localStorage?.clear();
});

const icon = (host: HTMLElement, pane: string) => host.querySelector<HTMLElement>(`[data-pane-toggle="${pane}"]`);
const slot = (host: HTMLElement, pane: string) => host.querySelector<HTMLElement>(`[data-pane-slot="${pane}"]`);
const side = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`aside[data-side="${id}"]`);
const pressed = (host: HTMLElement, pane: string) => icon(host, pane)?.getAttribute("aria-pressed") === "true";

describe("the toggles", () => {
	it("starts as today's window: Pages on the left, Properties lit on the right, Agent waiting under it", async () => {
		const { host } = await mount();
		expect(pressed(host, "pages")).toBe(true);
		expect(pressed(host, "properties")).toBe(true);
		expect(pressed(host, "agent")).toBe(false);
		expect(side(host, "left")?.style.width).toBe("248px");
		expect(side(host, "right")?.style.width).toBe("300px");
	});

	it("lights a second pane under the first, and a click on the last lit one collapses the side", async () => {
		const { host } = await mount();
		await click(icon(host, "agent"));
		expect(pressed(host, "properties")).toBe(true);
		expect(pressed(host, "agent")).toBe(true);

		await click(icon(host, "properties"));
		await click(icon(host, "agent"));
		expect(side(host, "right")?.hasAttribute("data-side-open")).toBe(false);
		expect(side(host, "right")?.style.width).toBe("0px");
	});

	it("shows only the pane ⌥-clicked", async () => {
		const { host } = await mount();
		await click(icon(host, "agent"));
		await click(icon(host, "agent"), { altKey: true });
		expect(pressed(host, "properties")).toBe(false);
		expect(pressed(host, "agent")).toBe(true);
	});

	it("keeps a pane mounted while it is hidden, so what was typed in it survives", async () => {
		const { host } = await mount();
		await click(icon(host, "agent"));
		const field = host.querySelector<HTMLTextAreaElement>("textarea[data-draft]");
		if (field === null) throw new Error("no draft field");
		field.value = "half a thought";

		await click(icon(host, "agent"));
		expect(slot(host, "agent")?.hasAttribute("inert")).toBe(true);
		await click(icon(host, "agent"));
		expect(host.querySelector<HTMLTextAreaElement>("textarea[data-draft]")).toBe(field);
		expect(field.value).toBe("half a thought");
	});

	it("marks a hidden pane while its turn runs, and again once it landed unseen, until it is shown", async () => {
		const { host, render } = await mount();
		await render({ working: true });
		expect(icon(host, "agent")?.querySelector('[data-toggle-mark="working"]')).not.toBeNull();

		await render({ working: false });
		expect(icon(host, "agent")?.querySelector('[data-toggle-mark="unread"]')).not.toBeNull();

		await click(icon(host, "agent"));
		expect(icon(host, "agent")?.querySelector("[data-toggle-mark]")).toBeNull();
	});

	it("says nothing about a turn the pane was showing for", async () => {
		const { host, render } = await mount();
		await click(icon(host, "agent"));
		await render({ working: true });
		await render({ working: false });
		await click(icon(host, "agent"));
		expect(icon(host, "agent")?.querySelector("[data-toggle-mark]")).toBeNull();
	});

	it("moves a pane to the other side, or out of the bar, from its menu", async () => {
		const { host } = await mount();
		await act(async () => {
			icon(host, "agent")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		});
		await click(menuItem("Move to the left side"));
		expect(host.querySelector('[data-pane-toggles="left"] [data-pane-toggle="agent"]')).not.toBeNull();

		await act(async () => {
			icon(host, "agent")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		});
		await click(menuItem("Remove from the bar"));
		expect(icon(host, "agent")).toBeNull();
		// still mounted, waiting for its key
		expect(host.querySelector("textarea[data-draft]")).not.toBeNull();
	});
});

describe("the window bar", () => {
	it("draws each side's toggles at that side's end of the bar it is given, help and settings inside the right's", async () => {
		const { host, bar } = await mount({ bar: true });
		const [left, right] = bar;
		expect(host.querySelector("[data-pane-bar]")).toBeNull();
		expect(
			[...left.querySelectorAll<HTMLElement>("[data-pane-toggle]")].map((item) => item.dataset.paneToggle),
		).toEqual(["pages"]);
		const order = [...right.querySelectorAll<HTMLElement>("[data-pane-toggle], [data-bar-end]")].map(
			(item) => item.dataset.paneToggle ?? item.dataset.barEnd,
		);
		expect(order).toEqual(["help", "properties", "agent"]);
	});

	it("carries a pane's toggle to the other end of the bar when the pane changes sides", async () => {
		const { bar } = await mount({ bar: true });
		const [left, right] = bar;
		await act(async () => {
			right
				.querySelector('[data-pane-toggle="agent"]')
				?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		});
		expect(menuItem("Show Agent")).not.toBeNull();
		await click(menuItem("Move to the left side"));
		expect(right.querySelector('[data-pane-toggle="agent"]')).toBeNull();
		expect(
			[...left.querySelectorAll<HTMLElement>("[data-pane-toggle]")].map((item) => item.dataset.paneToggle),
		).toEqual(["pages", "agent"]);
	});

	it("shows no rule beside a side with no toggles", async () => {
		const { bar } = await mount({ bar: true });
		const [left] = bar;
		expect(left.querySelector("[data-pane-bar-rule]")).not.toBeNull();
		await act(async () => {
			left
				.querySelector('[data-pane-toggle="pages"]')
				?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		});
		await click(menuItem("Move to the right side"));
		expect(left.querySelector("[data-pane-toggle]")).toBeNull();
		expect(left.querySelector("[data-pane-bar-rule]")).toBeNull();
	});
});

describe("a pane's header", () => {
	it("carries the pane's own actions, and hides the pane", async () => {
		const { host } = await mount();
		const head = host.querySelector('[data-pane-head="pages"]');
		expect(head?.querySelector('button[aria-label="New page"]')).not.toBeNull();

		await click(head?.querySelector<HTMLElement>('button[aria-label="Hide Pages"]') ?? null);
		expect(pressed(host, "pages")).toBe(false);
		expect(side(host, "left")?.style.width).toBe("0px");
	});
});

describe("the side's edge", () => {
	it("resizes up to 480 and collapses when let go under 144", async () => {
		const { host } = await mount();
		const grip = host.querySelector<HTMLElement>('button[aria-label="Resize left side"]');
		await act(async () => {
			grip?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 248, pointerId: 1 }));
			grip?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 700, pointerId: 1 }));
			grip?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 700, pointerId: 1 }));
		});
		expect(side(host, "left")?.style.width).toBe("480px");

		await act(async () => {
			grip?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 480, pointerId: 2 }));
			grip?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 100, pointerId: 2 }));
			grip?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 100, pointerId: 2 }));
		});
		expect(side(host, "left")?.style.width).toBe("0px");
		expect(pressed(host, "pages")).toBe(false);
	});
});

describe("the keys", () => {
	it("toggles the left side with ⌘B and the right with ⌘⌥B", async () => {
		const { host } = await mount();
		await key({ key: "b", code: "KeyB", metaKey: true });
		expect(side(host, "left")?.style.width).toBe("0px");
		await key({ key: "∫", code: "KeyB", metaKey: true, altKey: true });
		expect(side(host, "right")?.style.width).toBe("0px");
		await key({ key: "b", code: "KeyB", metaKey: true });
		expect(pressed(host, "pages")).toBe(true);
	});

	it("shows a pane by its key, even one removed from the bar, back where it stood", async () => {
		const { host } = await mount();
		await act(async () => {
			icon(host, "properties")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		});
		await click(menuItem("Remove from the bar"));
		expect(icon(host, "properties")).toBeNull();

		await key({ key: "I", code: "KeyI", metaKey: true, shiftKey: true });
		const right = [...host.querySelectorAll<HTMLElement>('[data-pane-toggles="right"] [data-pane-toggle]')];
		expect(right.map((item) => item.dataset.paneToggle)).toEqual(["properties", "agent"]);
		expect(pressed(host, "properties")).toBe(true);
	});
});

describe("what is kept", () => {
	it("comes back as it was left", async () => {
		vi.useFakeTimers();
		onTestFinished(() => {
			vi.useRealTimers();
		});
		const first = await mount();
		await click(icon(first.host, "agent"));
		await act(async () => {
			vi.advanceTimersByTime(1000);
		});
		first.unmount();

		const again = await mount();
		expect(pressed(again.host, "agent")).toBe(true);
	});

	it("throws away a stored layout that is not today's shape", async () => {
		window.localStorage.setItem("spool.panes.layout", JSON.stringify({ v: 1, left: { rail: ["pages"] } }));
		const { host } = await mount();
		expect(pressed(host, "properties")).toBe(true);
		expect(window.localStorage.getItem("spool.panes.layout")).toBeNull();
	});
});

/* ── the stand-in window ─────────────────────────────────────────────── */

function panes(props: { working?: boolean }): PaneDef[] {
	const text =
		(words: string, extra: ReactNode = null) =>
		() =>
			createElement("div", null, createElement("p", null, words), extra);
	return [
		{
			id: "pages",
			title: "Pages",
			icon: "P",
			hotkey: "panes.pages",
			render: text(
				"the tree",
				createElement(
					PaneActions,
					null,
					createElement("button", { type: "button", "aria-label": "New page" }, "+"),
				),
			),
		},
		{ id: "properties", title: "Properties", icon: "R", hotkey: "panes.properties", render: text("the fields") },
		{
			id: "agent",
			title: "Agent",
			icon: "A",
			hotkey: "panes.agent",
			working: props.working,
			render: text("the agent", createElement("textarea", { "data-draft": "" })),
		},
	];
}

function menuItem(label: string): HTMLElement | null {
	return (
		[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === label) ??
		null
	);
}

async function click(target: HTMLElement | null, init: MouseEventInit = {}) {
	if (target === null) throw new Error("nothing to click");
	await act(async () => {
		target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 9 }));
		window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 9 }));
		target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
	});
}

async function key(init: KeyboardEventInit) {
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
	});
}

async function mount(options: { bar?: boolean } = {}): Promise<{
	host: HTMLDivElement;
	/** the shell's bar, left end and right end, when the window was given one */
	bar: [HTMLDivElement, HTMLDivElement];
	render: (props: { working?: boolean }) => Promise<void>;
	unmount: () => void;
}> {
	const host = document.createElement("div");
	const bar: [HTMLDivElement, HTMLDivElement] = [document.createElement("div"), document.createElement("div")];
	document.body.append(...bar, host);
	const root = createRoot(host);
	// the dispatcher listens only while some layer is attached, as it does under the canvas
	const detach = attachHotkeyLayer({ scope: "app", handlers: {} });
	let gone = false;
	const unmount = () => {
		if (gone) return;
		gone = true;
		act(() => root.unmount());
		detach();
		host.remove();
		for (const end of bar) end.remove();
	};
	onTestFinished(unmount);
	const render = async (props: { working?: boolean }) => {
		const help = createElement("button", { type: "button", "data-bar-end": "help" }, "?");
		const tree = createElement(
			PaneWindow,
			{ panes: panes(props), barEnd: help },
			createElement("main", null, "canvas"),
		);
		await act(async () => {
			root.render(
				options.bar === true
					? createElement(PaneBarSlots.Provider, { value: { left: bar[0], right: bar[1] } }, tree)
					: tree,
			);
		});
	};
	await render({});
	return { host, bar, render, unmount };
}
