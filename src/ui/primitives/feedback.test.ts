// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TextAction, Toast } from "./feedback";

/**
 * A toast says its line as a status, or as an alert when something failed; its
 * action and its close are the caller's, and a toast nobody may close has none.
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

it("a toast's action and its close each answer once", () => {
	const onUndo = vi.fn();
	const onDismiss = vi.fn();
	const host = render(
		createElement(Toast, {
			message: "Moved menu to Trash",
			action: createElement(TextAction, { onClick: onUndo }, "Undo"),
			onDismiss,
		}),
	);
	expect(host.querySelector('[role="status"]')?.textContent).toContain("Moved menu to Trash");
	press([...host.querySelectorAll("button")].find((button) => button.textContent === "Undo"));
	expect(onUndo).toHaveBeenCalledOnce();
	expect(onDismiss).not.toHaveBeenCalled();
	press(host.querySelector('button[aria-label="Dismiss"]'));
	expect(onDismiss).toHaveBeenCalledOnce();
});

it("a toast without onDismiss has no close, and a failure is an alert", () => {
	const host = render(createElement(Toast, { message: "Update failed", tone: "error" }));
	expect(host.querySelector('[role="alert"]')?.textContent).toBe("Update failed");
	expect(host.querySelector("button")).toBeNull();
});

it("a text action with an href is a link that leaves the app", () => {
	const host = render(createElement(TextAction, { href: "https://spool.page/download" }, "Download Spool.dmg"));
	const link = host.querySelector("a");
	expect(link?.getAttribute("href")).toBe("https://spool.page/download");
	expect(link?.getAttribute("target")).toBe("_blank");
	expect(host.querySelector("button")).toBeNull();
});
