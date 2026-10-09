// @vitest-environment happy-dom

import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { PaneActions, type PaneDef, PaneWindow } from "./pane-window";

/**
 * The window around the canvas, with stand-in panes: what a tab does, what a
 * pane behind another tab keeps, what rides a tab or a rail icon, the close and
 * the rail, the tab's menu, the edge, the keys, and what is kept across a
 * reload. Where panes may go is `pane-layout.test.ts`; dragging a tab with a
 * real pointer is `pane-window-browser.test.ts`.
 */

beforeEach(() => {
	window.localStorage?.clear();
});

const tab = (host: HTMLElement, pane: string) => host.querySelector<HTMLElement>(`[data-pane-tab="${pane}"]`);
const railIcon = (host: HTMLElement, pane: string) => host.querySelector<HTMLElement>(`[data-rail-icon="${pane}"]`);
const slot = (host: HTMLElement, pane: string) => host.querySelector<HTMLElement>(`[data-pane-slot="${pane}"]`);
const side = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`aside[data-side="${id}"]`);
const lit = (host: HTMLElement, pane: string) => tab(host, pane)?.getAttribute("aria-selected") === "true";
const shown = (host: HTMLElement, pane: string) => slot(host, pane)?.hasAttribute("inert") === false;
const tabsIn = (host: HTMLElement, group: string) =>
	[...host.querySelectorAll<HTMLElement>(`[data-pane-group="${group}"] [data-pane-tab]`)].map(
		(item) => item.dataset.paneTab,
	);

describe("the tabs", () => {
	it("starts with Pages on the left and Properties and Agent as tabs on the right, Properties showing", async () => {
		const { host } = await mount();
		expect(tabsIn(host, "left:0")).toEqual(["pages"]);
		expect(tabsIn(host, "right:0")).toEqual(["properties", "agent"]);
		expect(lit(host, "properties")).toBe(true);
		expect(lit(host, "agent")).toBe(false);
		expect(shown(host, "properties")).toBe(true);
		expect(shown(host, "agent")).toBe(false);
		expect(side(host, "left")?.style.width).toBe("248px");
		expect(side(host, "right")?.style.width).toBe("380px");
	});

	it("switches the pane a click on its tab, and the side keeps its width", async () => {
		const { host } = await mount();
		await click(tab(host, "agent"));
		expect(lit(host, "agent")).toBe(true);
		expect(lit(host, "properties")).toBe(false);
		expect(shown(host, "agent")).toBe(true);
		expect(shown(host, "properties")).toBe(false);
		expect(side(host, "right")?.style.width).toBe("380px");
	});

	it("keeps a pane mounted behind another tab, so what was typed in it survives", async () => {
		const { host } = await mount();
		await click(tab(host, "agent"));
		const field = host.querySelector<HTMLTextAreaElement>("textarea[data-draft]");
		if (field === null) throw new Error("no draft field");
		field.value = "half a thought";

		await click(tab(host, "properties"));
		expect(slot(host, "agent")?.hasAttribute("inert")).toBe(true);
		await click(tab(host, "agent"));
		expect(host.querySelector<HTMLTextAreaElement>("textarea[data-draft]")).toBe(field);
		expect(field.value).toBe("half a thought");
	});

	it("marks the Agent tab while its turn runs behind another tab, and once it landed unseen, until it shows", async () => {
		const { host, render } = await mount();
		await render({ working: true });
		expect(tab(host, "agent")?.querySelector('[data-pane-mark="working"]')).not.toBeNull();

		await render({ working: false });
		expect(tab(host, "agent")?.querySelector('[data-pane-mark="unread"]')).not.toBeNull();

		await click(tab(host, "agent"));
		expect(tab(host, "agent")?.querySelector('[data-pane-mark="unread"][data-pane-mark-state="open"]')).toBeNull();
	});

	it("says nothing about a turn the pane was showing for", async () => {
		const { host, render } = await mount();
		await click(tab(host, "agent"));
		await render({ working: true });
		await render({ working: false });
		await click(tab(host, "properties"));
		expect(tab(host, "agent")?.querySelector("[data-pane-mark]")).toBeNull();
	});

	it("draws a pane's own verbs in its tab row while it is the lit tab", async () => {
		const { host } = await mount();
		const row = host.querySelector('[data-pane-group="left:0"]');
		expect(row?.querySelector('[data-pane-verbs="pages"] button[aria-label="New page"]')).not.toBeNull();
		const agentVerbs = host.querySelector<HTMLElement>('[data-pane-verbs="agent"]');
		expect(agentVerbs?.className).toContain("hidden");
		await click(tab(host, "agent"));
		expect(host.querySelector<HTMLElement>('[data-pane-verbs="agent"]')?.className).not.toContain("hidden");
	});
});

describe("closing a side", () => {
	it("leaves a 40px rail of its panes' icons, and an icon opens the side on that pane", async () => {
		const { host } = await mount();
		await click(host.querySelector('[data-side-close="right"]'));
		expect(side(host, "right")?.hasAttribute("data-side-open")).toBe(false);
		expect(side(host, "right")?.style.width).toBe("40px");
		const rail = host.querySelector<HTMLElement>('[data-side-rail="right"]');
		expect(
			[...(rail?.querySelectorAll<HTMLElement>("[data-rail-icon]") ?? [])].map((item) => item.dataset.railIcon),
		).toEqual(["properties", "agent"]);
		expect(rail?.hasAttribute("inert")).toBe(false);

		await click(railIcon(host, "agent"));
		expect(side(host, "right")?.hasAttribute("data-side-open")).toBe(true);
		expect(lit(host, "agent")).toBe(true);
		expect(shown(host, "agent")).toBe(true);
		expect(host.querySelector('[data-side-rail="right"]')?.hasAttribute("inert")).toBe(true);
	});

	it("carries the agent's marks on its rail icon while the side is closed", async () => {
		const { host, render } = await mount();
		await click(tab(host, "agent"));
		await click(host.querySelector('[data-side-close="right"]'));
		await render({ working: true });
		expect(railIcon(host, "agent")?.querySelector('[data-pane-mark="working"]')).not.toBeNull();
		await render({ working: false });
		expect(railIcon(host, "agent")?.querySelector('[data-pane-mark="unread"]')).not.toBeNull();
	});
});

describe("a tab's menu", () => {
	it("splits a tab below, merges it back into the group above, and moves it to the other side", async () => {
		const { host } = await mount();
		await menu(tab(host, "agent"));
		await click(menuItem("Split below"));
		expect(tabsIn(host, "right:0")).toEqual(["properties"]);
		expect(tabsIn(host, "right:1")).toEqual(["agent"]);
		expect(shown(host, "properties")).toBe(true);
		expect(shown(host, "agent")).toBe(true);

		await menu(tab(host, "agent"));
		expect(menuItem("Split below")).toBeNull();
		await click(menuItem("Merge into the group above"));
		expect(tabsIn(host, "right:0")).toEqual(["properties", "agent"]);

		await menu(tab(host, "agent"));
		await click(menuItem("Move to the left side"));
		expect(tabsIn(host, "left:0")).toEqual(["pages", "agent"]);
		expect(lit(host, "agent")).toBe(true);
		// still the same mounted pane
		expect(host.querySelector('aside[data-side="left"] textarea[data-draft]')).not.toBeNull();
	});
});

describe("the side's edge", () => {
	it("resizes up to 480 and closes to the rail when let go under 144", async () => {
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
		expect(side(host, "left")?.style.width).toBe("40px");
		expect(railIcon(host, "pages")).not.toBeNull();
	});
});

describe("the keys", () => {
	it("closes and opens the left side with ⌘B and the right with ⌘⌥B", async () => {
		const { host } = await mount();
		await key({ key: "b", code: "KeyB", metaKey: true });
		expect(side(host, "left")?.style.width).toBe("40px");
		await key({ key: "∫", code: "KeyB", metaKey: true, altKey: true });
		expect(side(host, "right")?.style.width).toBe("40px");
		await key({ key: "b", code: "KeyB", metaKey: true });
		expect(side(host, "left")?.hasAttribute("data-side-open")).toBe(true);
	});

	it("opens a pane's side by its key and lights its tab", async () => {
		const { host } = await mount();
		await key({ key: "∫", code: "KeyB", metaKey: true, altKey: true });
		await key({ key: "K", code: "KeyK", metaKey: true, shiftKey: true });
		expect(side(host, "right")?.hasAttribute("data-side-open")).toBe(true);
		expect(lit(host, "agent")).toBe(true);
	});
});

describe("what is kept", () => {
	it("comes back as it was left", async () => {
		vi.useFakeTimers();
		onTestFinished(() => {
			vi.useRealTimers();
		});
		const first = await mount();
		await click(tab(first.host, "agent"));
		await act(async () => {
			vi.advanceTimersByTime(1000);
		});
		first.unmount();

		const again = await mount();
		expect(lit(again.host, "agent")).toBe(true);
	});

	it("throws away a stored layout that is not today's shape", async () => {
		const toggles = { panes: ["pages"], lit: ["pages"], width: 248, open: true, touched: 1 };
		window.localStorage.setItem(
			"spool.panes.layout",
			JSON.stringify({ v: 2, clock: 2, left: toggles, right: toggles, weights: {}, removed: {} }),
		);
		const { host } = await mount();
		expect(lit(host, "properties")).toBe(true);
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
			render: text(
				"the agent",
				createElement(
					"div",
					null,
					createElement("textarea", { "data-draft": "" }),
					createElement(
						PaneActions,
						null,
						createElement("button", { type: "button", "aria-label": "New chat" }, "+"),
					),
				),
			),
		},
	];
}

function menuItem(label: string): HTMLElement | null {
	return (
		[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === label) ??
		null
	);
}

async function click(target: HTMLElement | Element | null, init: MouseEventInit = {}) {
	if (target === null) throw new Error("nothing to click");
	await act(async () => {
		target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 9 }));
		window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 9 }));
		target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
	});
}

async function menu(target: HTMLElement | null) {
	if (target === null) throw new Error("nothing to right-click");
	await act(async () => {
		target.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
		);
	});
}

async function key(init: KeyboardEventInit) {
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
	});
}

async function mount(): Promise<{
	host: HTMLDivElement;
	render: (props: { working?: boolean }) => Promise<void>;
	unmount: () => void;
}> {
	const host = document.createElement("div");
	document.body.append(host);
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
	};
	onTestFinished(unmount);
	const render = async (props: { working?: boolean }) => {
		await act(async () => {
			root.render(createElement(PaneWindow, { panes: panes(props) }, createElement("main", null, "canvas")));
		});
	};
	await render({});
	return { host, render, unmount };
}
