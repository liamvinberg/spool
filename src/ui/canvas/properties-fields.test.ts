// @vitest-environment happy-dom

import { act, createElement, type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { NumField, Row } from "./properties-fields";

async function mount(content: ReactNode) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(() => root.render(content));
	let mounted = true;
	const unmount = async () => {
		if (!mounted) return;
		mounted = false;
		await act(() => root.unmount());
		host.remove();
	};
	onTestFinished(unmount);
	return { host, unmount };
}

async function type(field: HTMLInputElement, text: string) {
	await act(() => field.focus());
	await act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

async function key(field: EventTarget, key: string, shiftKey = false) {
	await act(() =>
		field.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })),
	);
}

async function number() {
	const onCommit = vi.fn(),
		onBegin = vi.fn(),
		onPreview = vi.fn(),
		onCancel = vi.fn(),
		onStep = vi.fn();
	const mounted = await mount(
		createElement(NumField, {
			value: "1.25rem",
			ok: true,
			onCommit,
			onBegin,
			onPreview,
			onCancel,
			onStep,
		}),
	);
	const field = mounted.host.querySelector("input");
	if (!field) throw new Error("missing numeric field");
	return { ...mounted, field, onCommit, onBegin, onPreview, onCancel, onStep };
}

it("begins before a preview and commits the exact fractional unit once across Enter and blur", async () => {
	const f = await number();
	await type(f.field, "-.333rem");
	expect(f.onBegin).toHaveBeenCalledTimes(1);
	expect(f.onPreview).toHaveBeenCalledExactlyOnceWith("-.333rem");
	expect(f.onBegin.mock.invocationCallOrder[0]).toBeLessThan(f.onPreview.mock.invocationCallOrder[0]!);
	await key(f.field, "Enter");
	expect(document.activeElement).not.toBe(f.field);
	expect(f.onCommit).toHaveBeenCalledExactlyOnceWith("-.333rem");
	expect(f.onCancel).not.toHaveBeenCalled();
});

it("Escape cancels the original field session before blur can commit the draft", async () => {
	const f = await number();
	await type(f.field, "7.999px");
	await key(f.field, "Escape");
	expect(f.onCommit).not.toHaveBeenCalled();
	expect(f.onCancel).toHaveBeenCalledTimes(1);
	expect(f.field.value).toBe("1.25rem");
	await act(() => f.field.blur());
	expect(f.onCancel).toHaveBeenCalledTimes(1);
});

it("completes against the original value when owned preview has already updated its rendered value", async () => {
	const onCommit = vi.fn(),
		onCancel = vi.fn();
	function Previewed() {
		const [value, setValue] = useState("1.25rem");
		return createElement(NumField, { value, ok: true, onPreview: setValue, onCommit, onCancel });
	}
	const f = await mount(createElement(Previewed));
	const field = f.host.querySelector("input");
	if (!field) throw new Error("missing field");
	await type(field, ".333rem");
	await key(field, "Enter");
	expect(onCommit).toHaveBeenCalledExactlyOnceWith(".333rem");
	expect(onCancel).not.toHaveBeenCalled();
});

it("commits normal blur once and cancels an abandoned draft on unmount", async () => {
	const f = await number();
	await type(f.field, "7.999px");
	await act(() => f.field.blur());
	expect(f.onCommit).toHaveBeenCalledExactlyOnceWith("7.999px");
	await type(f.field, "2.25em");
	await f.unmount();
	expect(f.onCommit).toHaveBeenCalledTimes(1);
	expect(f.onCancel).toHaveBeenCalledTimes(1);
});

it("arrows forward 1/10 steps without committing a stale typed draft on later blur", async () => {
	const f = await number();
	await type(f.field, ".125rem");
	await key(f.field, "ArrowUp");
	await key(f.field, "ArrowDown", true);
	await act(() => f.field.blur());
	expect(f.onStep.mock.calls).toEqual([[1], [-10]]);
	expect(f.onCommit).not.toHaveBeenCalled();
	expect(f.onCancel).not.toHaveBeenCalled();
});

async function pointer(target: EventTarget, type: string, clientX: number, pointerId = 7) {
	await act(() =>
		target.dispatchEvent(new PointerEvent(type, { clientX, pointerId, button: 0, bubbles: true, cancelable: true })),
	);
}

async function scrub() {
	const onScrub = vi.fn(),
		onScrubStart = vi.fn(),
		onScrubEnd = vi.fn(),
		onScrubCancel = vi.fn();
	const props = { name: "font-size", onScrub, onScrubStart, onScrubEnd, onScrubCancel, children: "12.5px" };
	const mounted = await mount(createElement(Row, props));
	const label = mounted.host.querySelector("span");
	if (!label) throw new Error("missing scrub label");
	// Sandboxed or synthetic pointers may reject capture; document events still complete or cancel.
	Object.defineProperty(label, "setPointerCapture", {
		value: () => {
			throw new DOMException("capture unavailable");
		},
	});
	return { ...mounted, label, onScrub, onScrubStart, onScrubEnd, onScrubCancel };
}

it("scrubs outside its label without capture and completes once for the initiating pointer", async () => {
	const f = await scrub();
	await pointer(f.label, "pointerdown", 10);
	await pointer(document, "pointermove", 18, 8);
	await pointer(document, "pointerup", 18, 8);
	expect(f.onScrub).not.toHaveBeenCalled();
	expect(f.onScrubEnd).not.toHaveBeenCalled();
	await pointer(document, "pointermove", 18);
	await pointer(document, "pointermove", 22);
	await pointer(document, "pointerup", 22);
	await pointer(document, "pointerup", 22);
	expect(f.onScrubStart).toHaveBeenCalledTimes(1);
	expect(f.onScrub.mock.calls).toEqual([[2], [1]]);
	expect(f.onScrubEnd).toHaveBeenCalledTimes(1);
	expect(f.onScrubCancel).not.toHaveBeenCalled();
});

it.each(["pointercancel", "Escape", "unmount"])(
	"cancels a scrub on %s and retires late pointer work",
	async (ending) => {
		const f = await scrub();
		await pointer(f.label, "pointerdown", 10);
		await pointer(document, "pointermove", 18);
		if (ending === "Escape") await key(document, "Escape");
		else if (ending === "unmount") await f.unmount();
		else await pointer(document, ending, 18);
		await pointer(document, "pointermove", 26);
		await pointer(document, "pointerup", 26);
		expect(f.onScrub.mock.calls).toEqual([[2]]);
		expect(f.onScrubCancel).toHaveBeenCalledTimes(1);
		expect(f.onScrubEnd).not.toHaveBeenCalled();
	},
);
