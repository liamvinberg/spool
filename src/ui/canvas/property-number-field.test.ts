// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { SourcePropertyReading } from "../../source-property";
import { PropertyNumberField } from "./property-number-field";

async function mount(
	reading: SourcePropertyReading = {
		tokens: ["text-body"],
		binding: { kind: "reference", name: "--text-body", value: "17.25px" },
		native: "17.25px",
	},
) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(async () => {
		await act(() => root.unmount());
		host.remove();
	});
	const begin = vi.fn(),
		preview = vi.fn(),
		apply = vi.fn(),
		finish = vi.fn();
	await act(() =>
		root.render(
			createElement(PropertyNumberField, {
				property: "font-size",
				reading,
				options: [{ name: "body", value: "17.25px", from: "project" }],
				begin,
				preview,
				apply,
				finish,
			}),
		),
	);
	const field = host.querySelector<HTMLInputElement>('input[aria-label="font-size"]');
	if (!field) throw new Error("missing numeric typography field");
	return { host, field, begin, preview, apply, finish };
}

it("previews exact fractional typography and cancels without completing a source write", async () => {
	const { field, begin, preview, apply, finish } = await mount();
	await act(() => field.focus());
	await act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "7.999");
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
	expect(preview).toHaveBeenLastCalledWith({ kind: "custom", value: "7.999px" });
	await act(() =>
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true })),
	);
	expect(field.value).toBe("8.999");
	expect(preview).toHaveBeenLastCalledWith({ kind: "custom", value: "8.999px" });
	await act(() =>
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })),
	);
	expect(begin).toHaveBeenCalledTimes(1);
	expect(apply).not.toHaveBeenCalled();
	expect(finish).toHaveBeenCalledExactlyOnceWith(false);
	expect(field.value).toBe("17.25");
});

it("scrubs fractional typography by displayed units and completes only on release", async () => {
	const { host, field, begin, preview, apply, finish } = await mount({
		tokens: ["text-[17.25px]"],
		binding: { kind: "custom" },
		authored: "17.25px",
		native: "17.25px",
	});
	const label = host.querySelector('[data-properties-row="font-size"] > span');
	if (!label) throw new Error("missing typography scrub label");
	await act(() =>
		label.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 12, button: 0, clientX: 100, bubbles: true })),
	);
	await act(() =>
		document.dispatchEvent(new PointerEvent("pointermove", { pointerId: 12, clientX: 104, bubbles: true })),
	);
	expect(field.value).toBe("18.25");
	expect(preview).toHaveBeenLastCalledWith({ kind: "custom", value: "18.25px" });
	expect(apply).not.toHaveBeenCalled();
	expect(finish).not.toHaveBeenCalled();
	await act(() =>
		document.dispatchEvent(new PointerEvent("pointerup", { pointerId: 12, clientX: 104, bubbles: true })),
	);
	expect(begin).toHaveBeenCalledTimes(1);
	expect(finish).toHaveBeenCalledExactlyOnceWith(true);
});

it("keeps a custom fractional rem unit through Shift stepping and completes once on Enter", async () => {
	const { field, preview, finish } = await mount({
		tokens: ["text-[.333rem]"],
		binding: { kind: "custom" },
		authored: ".333rem",
		native: "5.328px",
	});
	expect(field.value).toBe(".333");
	await act(() => field.focus());
	await act(() =>
		field.dispatchEvent(
			new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true, cancelable: true }),
		),
	);
	expect(field.value).toBe("10.333");
	expect(preview).toHaveBeenLastCalledWith({ kind: "custom", value: "10.333rem" });
	await act(() =>
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })),
	);
	expect(finish).toHaveBeenCalledExactlyOnceWith(true);
});

it.each([true, false])("marks only the authored typography reference in its token menu: %s", async (linked) => {
	const { host, apply } = await mount({
		tokens: linked ? ["text-body"] : ["text-[17.25px]"],
		binding: linked ? { kind: "reference", name: "--text-body", value: "17.25px" } : { kind: "custom" },
		native: "17.25px",
	});
	const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="font-size token"]');
	if (!trigger) throw new Error("missing token menu");
	await act(() => trigger.click());
	const option = document.querySelector<HTMLButtonElement>('[data-menu-option="body"]');
	if (!option) throw new Error("missing project token");
	expect(option.getAttribute("aria-selected")).toBe(String(linked));
	await act(() => option.click());
	expect(apply).toHaveBeenCalledExactlyOnceWith({ kind: "binding", tokens: ["text-body"] });
});

it("does not detach a reference through untouched keyboard or scrub stepping", async () => {
	const { host, field, preview, finish } = await mount();
	await act(() => field.focus());
	await act(() =>
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true })),
	);
	expect(field.value).toBe("17.25");
	expect(preview).not.toHaveBeenCalled();
	await act(() =>
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })),
	);
	const label = host.querySelector('[data-properties-row="font-size"] > span');
	if (!label) throw new Error("missing scrub label");
	await act(() =>
		label.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 12, button: 0, clientX: 100, bubbles: true })),
	);
	await act(() =>
		document.dispatchEvent(new PointerEvent("pointermove", { pointerId: 12, clientX: 104, bubbles: true })),
	);
	await act(() =>
		document.dispatchEvent(new PointerEvent("pointerup", { pointerId: 12, clientX: 104, bubbles: true })),
	);
	expect(field.value).toBe("17.25");
	expect(preview).not.toHaveBeenCalled();
	expect(finish.mock.calls).toEqual([[false]]);
	expect(label.getAttribute("title")).toContain("Choose a token or type a custom value");
	expect(label.classList.contains("cursor-ew-resize")).toBe(false);
});
