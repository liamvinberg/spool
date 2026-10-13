// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachHotkeyLayer, closeTopmost, dispatchHotkeyEvent, runHotkey, runMenuHotkey } from "./hotkey-dispatch";

const detachers: Array<() => void> = [];

function attach(layer: Parameters<typeof attachHotkeyLayer>[0]): void {
	detachers.push(attachHotkeyLayer(layer));
}

afterEach(() => {
	for (const detach of detachers.splice(0)) detach();
});

function key(init: KeyboardEventInit): KeyboardEvent {
	return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("hotkey dispatch", () => {
	it("routes a chord to the layer answering it", () => {
		const toggle = vi.fn();
		attach({ scope: "canvas", handlers: { "canvas.threads": toggle } });
		window.dispatchEvent(key({ key: "t" }));
		expect(toggle).toHaveBeenCalledTimes(1);
	});

	it("walks scopes most-modal first: a pending toast owns undo", () => {
		const canvasUndo = vi.fn();
		const toastUndo = vi.fn();
		let pending = true;
		attach({ scope: "canvas", handlers: { "canvas.undo": canvasUndo } });
		attach({ scope: "toast", active: () => pending, handlers: { "toast.undo": toastUndo } });
		dispatchHotkeyEvent(key({ key: "z", metaKey: true }));
		expect(toastUndo).toHaveBeenCalledTimes(1);
		expect(canvasUndo).not.toHaveBeenCalled();
		pending = false;
		dispatchHotkeyEvent(key({ key: "z", metaKey: true }));
		expect(canvasUndo).toHaveBeenCalledTimes(1);
	});

	it("lets an exclusive scope swallow what it does not answer", () => {
		const close = vi.fn();
		const toggle = vi.fn();
		let finding = true;
		attach({ scope: "finder", active: () => finding, handlers: { "finder.close": close } });
		attach({ scope: "canvas", handlers: { "canvas.threads": toggle } });
		dispatchHotkeyEvent(key({ key: "t" }));
		expect(toggle).not.toHaveBeenCalled();
		dispatchHotkeyEvent(key({ key: "Escape" }));
		expect(close).toHaveBeenCalledTimes(1);
		finding = false;
		dispatchHotkeyEvent(key({ key: "t" }));
		expect(toggle).toHaveBeenCalledTimes(1);
	});

	it("leaves keys born in a text field to the text", () => {
		const toggle = vi.fn();
		attach({ scope: "canvas", handlers: { "canvas.threads": toggle } });
		const input = document.createElement("input");
		document.body.append(input);
		input.dispatchEvent(key({ key: "t" }));
		expect(toggle).not.toHaveBeenCalled();
		input.remove();
	});

	it("lets the pane keys through a text field, so the composer is no dead end", () => {
		const left = vi.fn();
		attach({ scope: "panes", handlers: { "panes.left": left } });
		const input = document.createElement("textarea");
		document.body.append(input);
		input.dispatchEvent(key({ key: "b", code: "KeyB", metaKey: true }));
		expect(left).toHaveBeenCalledTimes(1);
		input.remove();
	});

	it("ignores held-key repeats only where the register says so", () => {
		const enter = vi.fn();
		const nudge = vi.fn();
		attach({ scope: "canvas", handlers: { "canvas.enter": enter, "canvas.nudge": nudge } });
		dispatchHotkeyEvent(key({ key: "Enter", repeat: true }));
		expect(enter).not.toHaveBeenCalled();
		dispatchHotkeyEvent(key({ key: "ArrowRight", repeat: true }));
		expect(nudge).toHaveBeenCalledTimes(1);
	});

	it("claims an ignored repeat, so a held ⌘W cannot fall through to the Mac menu once per repeat", () => {
		const close = vi.fn();
		attach({ scope: "app", handlers: { "app.close-tab": close } });
		const first = key({ key: "w", metaKey: true });
		dispatchHotkeyEvent(first);
		const repeats = [1, 2, 3].map(() => key({ key: "w", metaKey: true, repeat: true }));
		for (const repeat of repeats) dispatchHotkeyEvent(repeat);
		expect(close).toHaveBeenCalledTimes(1);
		expect(repeats.every((repeat) => repeat.defaultPrevented)).toBe(true);
		// a key nobody answers is left alone, repeat or not
		const unanswered = key({ key: "n", metaKey: true, repeat: true });
		dispatchHotkeyEvent(unanswered);
		expect(unanswered.defaultPrevented).toBe(false);
	});

	it("keeps the toast's undo reachable while the sheet is up", () => {
		const closeHelp = vi.fn();
		const toastUndo = vi.fn();
		attach({ scope: "help", handlers: { "help.close": closeHelp } });
		attach({ scope: "toast", handlers: { "toast.undo": toastUndo } });
		dispatchHotkeyEvent(key({ key: "z", metaKey: true }));
		expect(toastUndo).toHaveBeenCalledTimes(1);
		expect(closeHelp).not.toHaveBeenCalled();
	});

	it("lets ? fall through quiet scopes to the app shell", () => {
		const open = vi.fn();
		attach({ scope: "canvas", handlers: {} });
		attach({ scope: "app", handlers: { "app.help": open } });
		dispatchHotkeyEvent(key({ key: "?", shiftKey: true }));
		expect(open).toHaveBeenCalledTimes(1);
	});

	it("runs a relayed entry by name on the highest layer answering it", () => {
		const leave = vi.fn();
		attach({ scope: "canvas", handlers: { "canvas.leave": leave } });
		expect(runHotkey("canvas.leave")).toBe(true);
		expect(leave).toHaveBeenCalledWith(undefined);
		expect(runHotkey("canvas.play")).toBe(false);
	});

	it("removes the window listener with the last layer", () => {
		const toggle = vi.fn();
		const detach = attachHotkeyLayer({ scope: "canvas", handlers: { "canvas.threads": toggle } });
		detach();
		window.dispatchEvent(key({ key: "t" }));
		expect(toggle).not.toHaveBeenCalled();
	});

	it("routes menu zoom to the canvas without manufacturing a keyboard event", () => {
		const zoom = vi.fn();
		attach({ scope: "canvas", handlers: { "canvas.zoom-in": zoom } });
		expect(runMenuHotkey("canvas.zoom-in")).toBe(true);
		expect(zoom).toHaveBeenCalledExactlyOnceWith();
	});

	it("keeps native menu commands behind the same modal boundary as keyboard shortcuts", () => {
		const zoom = vi.fn();
		let exporting = true;
		attach({ scope: "dialog", active: () => exporting, handlers: {} });
		attach({ scope: "canvas", handlers: { "canvas.zoom-in": zoom } });
		expect(runMenuHotkey("canvas.zoom-in")).toBe(false);
		expect(zoom).not.toHaveBeenCalled();
		exporting = false;
		expect(runMenuHotkey("canvas.zoom-in")).toBe(true);
		expect(zoom).toHaveBeenCalledTimes(1);
	});
});

describe("closing what is on top", () => {
	it("is nothing while no modal surface is up", () => {
		attach({ scope: "canvas", handlers: {} });
		expect(closeTopmost()).toBe(false);
	});

	it("runs the most modal surface's own way out", () => {
		const help = vi.fn();
		const settings = vi.fn();
		attach({ scope: "settings", handlers: { "settings.close": settings } });
		attach({ scope: "help", handlers: { "help.close": help } });
		expect(closeTopmost()).toBe(true);
		expect(help).toHaveBeenCalledTimes(1);
		expect(settings).not.toHaveBeenCalled();
	});

	it("sends Esc to a surface that answers its own", () => {
		attach({ scope: "dialog", handlers: {} });
		const button = document.createElement("button");
		document.body.append(button);
		button.focus();
		const escaped = vi.fn();
		button.addEventListener("keydown", (event) => escaped(event.key));
		expect(closeTopmost()).toBe(true);
		expect(escaped).toHaveBeenCalledWith("Escape");
		button.remove();
	});

	it("sends a dialog holding the focus its cancel, and shuts it when nothing keeps it", () => {
		attach({ scope: "picker", handlers: {} });
		const dialog = document.createElement("dialog");
		const input = document.createElement("input");
		dialog.append(input);
		document.body.append(dialog);
		dialog.setAttribute("open", "");
		input.focus();
		const cancelled = vi.fn();
		dialog.addEventListener("cancel", cancelled);
		expect(closeTopmost()).toBe(true);
		expect(cancelled).toHaveBeenCalledTimes(1);
		expect(dialog.open).toBe(false);
		dialog.remove();
	});
});
