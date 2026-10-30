// @vitest-environment happy-dom
import { act, createElement, type ReactElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ColourField, Field, NumberField, SearchField, TextField } from "./inputs";

/**
 * The input primitives hold a draft of their own where a half-typed value must
 * never be written: Enter and blur commit it once, Escape puts the value back.
 * A search clears from its tail, and a trigger says whether its menu is open.
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

function type(field: HTMLInputElement, text: string) {
	act(() => field.focus());
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
		field.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

const key = (field: EventTarget, key: string, shiftKey = false) =>
	act(() => field.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })));

const input = (host: Element, label: string) => {
	const found = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
	if (found === null) throw new Error(`missing ${label}`);
	return found;
};

it("a number field commits what was typed once across Enter and blur", () => {
	const onValueChange = vi.fn();
	const host = render(createElement(NumberField, { value: 990, onValueChange, label: "w" }));
	const field = input(host, "w");
	type(field, "640");
	key(field, "Enter");
	expect(onValueChange).toHaveBeenCalledExactlyOnceWith(640);
	act(() => field.blur());
	expect(onValueChange).toHaveBeenCalledTimes(1);
});

it("Escape puts the number back before its blur can commit the draft", () => {
	const onValueChange = vi.fn();
	const host = render(createElement(NumberField, { value: 990, onValueChange, label: "w" }));
	const field = input(host, "w");
	type(field, "7");
	key(field, "Escape");
	expect(field.value).toBe("990");
	act(() => field.blur());
	expect(onValueChange).not.toHaveBeenCalled();
});

it("a number field's arrows step by its step, ten under shift, or hand the units to onStep", () => {
	const onValueChange = vi.fn();
	const host = render(createElement(NumberField, { value: 10, step: 2, onValueChange, label: "x" }));
	key(input(host, "x"), "ArrowUp");
	key(input(host, "x"), "ArrowDown", true);
	expect(onValueChange.mock.calls).toEqual([[12], [-10]]);
	unmount?.();

	const onStep = vi.fn();
	const stepped = render(createElement(NumberField, { value: 10, onValueChange, onStep, label: "y" }));
	key(input(stepped, "y"), "ArrowDown", true);
	expect(onStep).toHaveBeenCalledExactlyOnceWith(-10);
});

it("a search shows its key while empty and a clear once there is something to clear", () => {
	const host = render(createElement(SearchField, { placeholder: "Search projects" }));
	const field = input(host, "Search projects");
	expect(host.querySelector("kbd")?.textContent).toBe("/");
	type(field, "kaffe");
	expect(host.querySelector("kbd")).toBeNull();
	act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Clear"]')?.click());
	expect(field.value).toBe("");
	expect(host.querySelector('button[aria-label="Clear"]')).toBeNull();
});

it("a controlled text field shows the caller's value", () => {
	function Held() {
		const [text, setText] = useState("");
		return createElement(TextField, {
			label: "Name",
			value: text,
			onValueChange: (next) => setText(next.toUpperCase()),
		});
	}
	const host = render(createElement(Held));
	type(input(host, "Name"), "kim");
	expect(input(host, "Name").value).toBe("KIM");
});

it("a colour field hands a typed hex over on Enter, and Escape hands nothing", () => {
	const onType = vi.fn();
	const host = render(createElement(ColourField, { value: "#f5391a", label: "thread", onPick: vi.fn(), onType }));
	const hex = input(host, "thread");
	type(hex, "#2f6fe0");
	key(hex, "Enter");
	expect(onType).toHaveBeenCalledExactlyOnceWith("#2f6fe0");
	type(hex, "#000000");
	key(hex, "Escape");
	expect(onType).toHaveBeenCalledTimes(1);
	expect(hex.value).toBe("#f5391a");
});

it("a field's label points at its control, and an error takes the hint's place", () => {
	const host = render(
		createElement(Field, {
			label: "Project name",
			hint: "The folder is renamed with it.",
			error: "Already taken.",
			// biome-ignore lint/correctness/noChildrenProp: a render prop, which createElement's rest children can't type
			children: (id: string) => createElement(TextField, { inputProps: { id } }),
		}),
	);
	const label = host.querySelector("label[for]");
	expect(host.querySelector(`#${CSS.escape(label?.getAttribute("for") ?? "")}`)?.tagName).toBe("INPUT");
	expect(host.querySelector('[role="alert"]')?.textContent).toBe("Already taken.");
	expect(host.textContent).not.toContain("The folder is renamed");
});
