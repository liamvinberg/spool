// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { PropertyColorField } from "./property-color-field";

async function mount(custom = false) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(async () => {
		await act(() => root.unmount());
		host.remove();
	});
	const apply = vi.fn(),
		begin = vi.fn(),
		preview = vi.fn(),
		finish = vi.fn();
	await act(() =>
		root.render(
			createElement(PropertyColorField, {
				property: "color",
				ok: true,
				reading: {
					tokens: ["text-brand"],
					binding: custom ? { kind: "custom" } : { kind: "reference", name: "--color-brand", value: "#123456" },
					native: "rgb(18, 52, 86)",
				},
				options: [
					{ name: "brand", value: "#123456", from: "project", reference: "--color-brand" },
					{ name: "red-500", value: "#ef4444", from: "default", reference: "--color-red-500" },
				],
				begin,
				preview,
				apply,
				finish,
			}),
		),
	);
	const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Choose color"]');
	if (!trigger) throw new Error("missing color trigger");
	await act(() => trigger.click());
	return { host, trigger, apply, begin, preview, finish };
}

it("shows the authored reference and actual native value in the approved color menu", async () => {
	const f = await mount();
	expect(f.trigger.title).toBe("Linked to --color-brand");
	expect(f.trigger.textContent).toContain("brand");
	expect(f.host.querySelector(".ei-color-heading")?.textContent).toContain("#123456");
	const option = f.host.querySelector<HTMLButtonElement>('[aria-label="Apply --color-red-500"]');
	if (!option) throw new Error("missing default token");
	await act(() => option.click());
	expect(f.apply).toHaveBeenCalledExactlyOnceWith({ kind: "binding", name: "red-500" });
	expect(document.activeElement).toBe(f.trigger);
});

it("detaches explicitly to the actual native value without guessing an equal token", async () => {
	const f = await mount();
	const unlink = f.host.querySelector<HTMLButtonElement>(".ep-unlink");
	if (!unlink) throw new Error("missing explicit detachment");
	await act(() => unlink.click());
	expect(f.apply).toHaveBeenCalledExactlyOnceWith({ kind: "custom", value: "rgb(18, 52, 86)" });
});

it("Escape closes the menu and restores trigger focus without a source completion", async () => {
	const f = await mount();
	await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
	expect(f.trigger.getAttribute("aria-expanded")).toBe("false");
	expect(document.activeElement).toBe(f.trigger);
	expect(f.apply).not.toHaveBeenCalled();
	expect(f.finish).not.toHaveBeenCalledWith(true);
});

it("keeps option activation inside the color menu instead of invoking a canvas shortcut", async () => {
	const f = await mount();
	const shortcut = vi.fn();
	window.addEventListener("keydown", shortcut);
	onTestFinished(() => window.removeEventListener("keydown", shortcut));
	const option = f.host.querySelector<HTMLButtonElement>('[aria-label="Apply --color-red-500"]');
	if (!option) throw new Error("missing token option");
	await act(() =>
		option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })),
	);
	expect(shortcut).not.toHaveBeenCalled();
});

it("completes a valid custom blur once when a pointer leaves the menu", async () => {
	const f = await mount(true);
	const field = f.host.querySelector<HTMLInputElement>('input[aria-label="color"]');
	if (!field) throw new Error("missing custom field");
	await act(() => field.focus());
	await act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "#abcdef");
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await act(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
	expect(f.begin).toHaveBeenCalledTimes(1);
	expect(f.preview).toHaveBeenCalledExactlyOnceWith("#abcdef");
	expect(f.finish).toHaveBeenCalledExactlyOnceWith(true);
});
