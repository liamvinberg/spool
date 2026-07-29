// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachHotkeyLayer, dispatchHotkeyEvent, runHotkey } from "./hotkey-dispatch";

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

	it("ignores held-key repeats only where the register says so", () => {
		const enter = vi.fn();
		const nudge = vi.fn();
		attach({ scope: "canvas", handlers: { "canvas.enter": enter, "canvas.nudge": nudge } });
		dispatchHotkeyEvent(key({ key: "Enter", repeat: true }));
		expect(enter).not.toHaveBeenCalled();
		dispatchHotkeyEvent(key({ key: "ArrowRight", repeat: true }));
		expect(nudge).toHaveBeenCalledTimes(1);
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
});
