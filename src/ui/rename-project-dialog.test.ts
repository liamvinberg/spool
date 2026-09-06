// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { RenameProjectDialog } from "./rename-project-dialog";

function mount(onRename: (name: string) => Promise<void>, initialName = "coffee") {
	const host = document.createElement("div");
	document.body.append(host);
	const trigger = document.createElement("button");
	host.append(trigger);
	trigger.focus();
	const container = document.createElement("div");
	host.append(container);
	const root = createRoot(container);
	const close = vi.fn(() => root.render(null));
	act(() =>
		root.render(
			createElement(RenameProjectDialog, {
				project: { root: "/tmp/untitled", name: "untitled" },
				initialName,
				onRename,
				onClose: close,
			}),
		),
	);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	const submit = () =>
		host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
	return { host, close, trigger, submit };
}

it("explains the actual folder change and cancels without renaming", () => {
	const rename = vi.fn();
	const { host, trigger, close } = mount(rename);
	expect(host.textContent).toContain("This also renames the folder on your Mac.");
	expect(host.querySelector("code")?.textContent).toBe("/tmp/coffee");
	expect(document.activeElement).toBe(host.querySelector("input"));
	act(() => host.querySelector("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true })));
	expect(rename).not.toHaveBeenCalled();
	expect(close).toHaveBeenCalledOnce();
	expect(document.activeElement).toBe(trigger);
});

it("rejects unchanged names without calling the action", async () => {
	const rename = vi.fn();
	const { host, submit } = mount(rename, " untitled ");
	expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
	await act(async () => submit());
	expect(rename).not.toHaveBeenCalled();
});

it("keeps a failed rename editable, then waits for a single confirmed retry", async () => {
	let finish: (() => void) | undefined;
	const rename = vi
		.fn<(name: string) => Promise<void>>()
		.mockRejectedValueOnce(new Error("That folder already exists."))
		.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
	const { host, submit, close } = mount(rename);
	await act(async () => submit());
	expect(host.querySelector('[role="alert"]')?.textContent).toBe("That folder already exists.");
	expect(close).not.toHaveBeenCalled();
	act(() => {
		submit();
		submit();
	});
	expect(rename).toHaveBeenCalledTimes(2);
	expect(rename).toHaveBeenLastCalledWith("coffee");
	expect(host.querySelector("fieldset")?.disabled).toBe(true);
	act(() => host.querySelector("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true })));
	expect(close).not.toHaveBeenCalled();
	await act(async () => finish?.());
	expect(close).toHaveBeenCalledOnce();
});
