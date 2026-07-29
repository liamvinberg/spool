// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { HotkeySheet } from "./hotkey-sheet";

async function renderSheet(onClose: () => void): Promise<HTMLElement> {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => root.render(createElement(HotkeySheet, { onClose })));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	return host;
}

it("tells the whole register, grouped and in order", async () => {
	const host = await renderSheet(() => {});
	const dialog = host.querySelector('[role="dialog"][aria-label="Shortcuts"]');
	expect(dialog).not.toBeNull();
	const text = dialog?.textContent ?? "";
	for (const group of ["Frames", "Selection", "Camera", "Tools", "Find and jump", "Threads", "Undo", "Home", "Help"]) {
		expect(text).toContain(group);
	}
	expect(text).toContain("Enter the selected frame");
	expect(text).toContain("double-click");
	expect(text).toContain("Search your projects");
	// happy-dom is a non-Apple platform, so the accel face reads ctrl+ here
	expect(text).toContain("ctrl+Z");
	// dispatch-only plumbing never becomes a row
	expect(host.querySelectorAll('[role="dialog"] kbd').length).toBeGreaterThan(10);
});

it("closes on esc and on the summon key, and from the scrim", async () => {
	const onClose = vi.fn();
	const host = await renderSheet(onClose);
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
	});
	expect(onClose).toHaveBeenCalledTimes(1);
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true, cancelable: true }));
	});
	expect(onClose).toHaveBeenCalledTimes(2);
	const scrim = host.querySelector<HTMLButtonElement>('button[aria-label="Close the shortcut sheet"]');
	await act(async () => {
		scrim?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
	});
	expect(onClose).toHaveBeenCalledTimes(3);
});
