// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectEmpty } from "./project-empty";

describe("empty project title", () => {
	it("commits once on Enter, trims the name, and cancels Escape without a rename", async () => {
		const rename = vi.fn<(name: string) => Promise<void>>().mockResolvedValue();
		const input = mount(rename);
		await act(async () => {
			input.focus();
			input.value = "  coffee  ";
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(rename).toHaveBeenCalledExactlyOnceWith("coffee");
		await act(async () => {
			input.focus();
			input.value = "cancelled";
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		expect(rename).toHaveBeenCalledTimes(1);
		expect(input.value).toBe("untitled");
	});

	it("keeps the current name and explains a refused folder rename", async () => {
		const rename = vi
			.fn<(name: string) => Promise<void>>()
			.mockRejectedValue(new Error("That folder already exists."));
		const input = mount(rename);
		await act(async () => {
			input.focus();
			input.value = "taken";
			input.blur();
		});
		expect(input.value).toBe("untitled");
		expect(document.querySelector('[role="alert"]')?.textContent).toBe("That folder already exists.");
	});
});

function mount(onRename: (name: string) => Promise<void>): HTMLInputElement {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	act(() => root.render(createElement(ProjectEmpty, { project: "untitled", root: "/tmp/untitled", onRename })));
	const input = host.querySelector("input");
	if (!input) throw new Error("Missing project name");
	return input;
}
