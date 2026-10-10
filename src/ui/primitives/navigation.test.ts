// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { IconRail, IconRailItem, NavItem, Tab, Tabs } from "./navigation";

/**
 * Navigation says where you are in attributes, and the app and its tests read
 * them: the chosen tab is `aria-selected`, the place you are is `aria-current`.
 * A click goes to the caller, who decides what is chosen.
 */

let unmount: (() => void) | undefined;

function render(element: ReactElement) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => root.render(element));
	unmount = () => {
		act(() => root.unmount());
		host.remove();
	};
	return host;
}

afterEach(() => {
	unmount?.();
	unmount = undefined;
	vi.unstubAllGlobals();
});

const click = (node: Element | null | undefined) =>
	act(() => {
		node?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});

it("tabs say which one is chosen and hand a click to the caller", () => {
	const onClick = vi.fn();
	const host = render(
		createElement(
			Tabs,
			{ "aria-label": "Settings" },
			createElement(Tab, { selected: true }, "General"),
			createElement(Tab, { onClick }, "Appearance"),
		),
	);
	const tabs = [...host.querySelectorAll('[role="tablist"] [role="tab"]')];
	expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);
	click(tabs[1]);
	expect(onClick).toHaveBeenCalledTimes(1);
	expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
});

it("a nav item marks where you are, and its count rides after the label", () => {
	const host = render(
		createElement(
			"nav",
			null,
			createElement(NavItem, { label: "Projects", current: true }),
			createElement(NavItem, { label: "People", meta: 4 }),
		),
	);
	const [here, there] = host.querySelectorAll("button");
	expect(here?.getAttribute("aria-current")).toBe("page");
	expect(there?.hasAttribute("aria-current")).toBe(false);
	expect(there?.textContent).toBe("People4");
});

it("a rail item is named by its label, and what rides it stands inside", () => {
	const onClick = vi.fn();
	const host = render(
		createElement(
			IconRail,
			null,
			createElement(IconRailItem, { icon: null, label: "Agent", onClick }, createElement("i", { id: "mark" })),
		),
	);
	const item = host.querySelector('nav button[aria-label="Agent"]');
	expect(item?.querySelector("#mark")).not.toBeNull();
	click(item);
	expect(onClick).toHaveBeenCalledTimes(1);
});
