// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MenuItem, Palette, Scrim } from "./overlays";

/**
 * The overlay primitives draw boxes; what they do is small: a menu item acts
 * unless it is disabled, says whether it is checked, and goes somewhere when
 * it is a link; a scrim with a label is a door out; the palette's field is the
 * caller's.
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

const press = (node: Element | null | undefined) => act(() => (node as HTMLElement | null)?.click());

it("a menu item acts when pressed, and a disabled one stays in the list without acting", () => {
	const onClick = vi.fn();
	const host = render(
		createElement("div", { role: "menu" }, [
			createElement(MenuItem, { key: "a", label: "Reload frame", shortcut: "R", onClick }),
			createElement(MenuItem, { key: "b", label: "Set as thumbnail", disabled: true, onClick }),
		]),
	);
	const [reload, thumbnail] = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
	press(reload);
	expect(onClick).toHaveBeenCalledTimes(1);
	expect(reload?.querySelector("kbd")?.textContent).toBe("R");
	expect(thumbnail?.disabled).toBe(true);
	press(thumbnail);
	expect(onClick).toHaveBeenCalledTimes(1);
});

it("a checkable item says whether it is checked", () => {
	const host = render(
		createElement("div", { role: "menu" }, [
			createElement(MenuItem, { key: "a", label: "Admin", checked: true, onClick: () => {} }),
			createElement(MenuItem, { key: "b", label: "Editor", checked: false, onClick: () => {} }),
		]),
	);
	const items = [...host.querySelectorAll('[role="menuitemcheckbox"]')];
	expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "false"]);
});

it("an item with an address is a link that goes there", () => {
	const host = render(
		createElement(MenuItem, { label: "Harbour Bank", href: "https://spool.page/harbour-bank", target: "_blank" }),
	);
	const link = host.querySelector("a");
	expect(link?.getAttribute("role")).toBe("menuitem");
	expect(link?.getAttribute("href")).toBe("https://spool.page/harbour-bank");
});

it("a scrim with a label is a door out no key lands on, and one without is hidden", () => {
	const onMouseDown = vi.fn();
	const host = render(
		createElement("div", null, [
			createElement(Scrim, { key: "a", label: "Close the finder", onMouseDown }),
			createElement(Scrim, { key: "b" }),
		]),
	);
	const door = host.querySelector<HTMLButtonElement>('button[aria-label="Close the finder"]');
	expect(door?.tabIndex).toBe(-1);
	act(() => door?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
	expect(onMouseDown).toHaveBeenCalledTimes(1);
	expect(host.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
});

it("the palette's field is the caller's: its value and its keys", () => {
	const onKeyDown = vi.fn();
	const host = render(
		createElement(Palette, {
			"aria-label": "Find a frame",
			input: { value: "cart", onChange: () => {}, onKeyDown, "aria-label": "Find a frame" },
			hints: ["↑↓ moves", "esc closes"],
		}),
	);
	const input = host.querySelector("input");
	expect(input?.value).toBe("cart");
	act(() => input?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
	expect(onKeyDown).toHaveBeenCalledTimes(1);
	expect(host.textContent).toContain("esc closes");
});
