// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ListRow, TreeRow } from "./structure";

/**
 * The rows are where structure meets a hand: a branch's chevron opens it
 * without taking the row's own click, alt opens every level under it, and a
 * disabled row takes nothing.
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

const click = (node: Element | null | undefined, init: MouseEventInit = {}) =>
	act(() => {
		node?.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
	});

it("a branch's chevron toggles it and leaves the row's click alone", () => {
	const onToggle = vi.fn();
	const onClick = vi.fn();
	const host = render(
		createElement(TreeRow, { label: "shop", branch: { open: false, label: "shop", onToggle }, onClick }),
	);
	const row = host.querySelector('[role="treeitem"]');
	expect(row?.getAttribute("aria-expanded")).toBe("false");
	click(host.querySelector('button[aria-label="Expand shop"]'));
	expect(onToggle).toHaveBeenCalledWith(false);
	expect(onClick).not.toHaveBeenCalled();
	click(row);
	expect(onClick).toHaveBeenCalledTimes(1);
});

it("alt on the chevron asks for every level under it", () => {
	const onToggle = vi.fn();
	const host = render(createElement(TreeRow, { label: "shop", branch: { open: true, label: "shop", onToggle } }));
	click(host.querySelector('button[aria-label="Collapse shop"]'), { altKey: true });
	expect(onToggle).toHaveBeenCalledWith(true);
});

it("a press on the chevron is not the start of a drag of its row", () => {
	const onPointerDown = vi.fn();
	const host = render(
		createElement(TreeRow, { label: "shop", branch: { open: false, label: "shop" }, onPointerDown }),
	);
	act(() => {
		host
			.querySelector('button[aria-label="Expand shop"]')
			?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
	});
	expect(onPointerDown).not.toHaveBeenCalled();
});

it("a disabled row that is one action takes no click", () => {
	const onClick = vi.fn();
	const host = render(createElement(ListRow, { as: "button", label: "menu", disabled: true, onClick }));
	const row = host.querySelector("button");
	expect(row?.disabled).toBe(true);
	act(() => row?.click());
	expect(onClick).not.toHaveBeenCalled();
});
