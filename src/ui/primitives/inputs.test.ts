// @vitest-environment happy-dom
import { act, createElement, type ReactElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
	ColourField,
	Field,
	fitNumber,
	NumberField,
	readNumber,
	SearchField,
	scrubNumber,
	TextField,
	type TunePhase,
} from "./inputs";

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

it("a typed number takes maths, units and a step relative to the value it had", () => {
	const ms = { unit: "ms", units: { s: 1000 } };
	expect(readNumber("300ms", 520, ms)).toBe(300);
	expect(readNumber("0,3s", 520, ms)).toBe(300);
	expect(readNumber("78*2", 0, {})).toBe(156);
	expect(readNumber("(1+2)*-2", 0, {})).toBe(-6);
	expect(readNumber("+4", 20, {})).toBe(24);
	expect(readNumber("*2", 20, {})).toBe(40);
	expect(readNumber("-4", 20, {})).toBe(-4);
	expect(readNumber("3em", 0, ms)).toBeNull();
	expect(readNumber("78*", 0, {})).toBeNull();
});

it("a number is clamped to its bounds, or comes round when it wraps", () => {
	expect(fitNumber(52, { min: 0, max: 40 })).toBe(40);
	expect(fitNumber(-30, { min: 0, max: 360, wrap: true })).toBe(330);
	expect(fitNumber(360, { min: 0, max: 360, wrap: true })).toBe(0);
	expect(fitNumber(0.1 + 0.2, {})).toBe(0.3);
});

it("a scrub slows as the pointer strays, steps by shift and alt, and sticks where it set out", () => {
	const plain = { dy: 0, shift: false, alt: false };
	expect(scrubNumber(10, { ...plain, mx: 8 }, 0.5, 10, {}).value).toBe(14);
	expect(scrubNumber(10, { ...plain, mx: 8, dy: 60 }, 0.5, 10, {}).value).toBe(12);
	expect(scrubNumber(10, { ...plain, mx: 8, dy: 200 }, 0.5, 0, {}).value).toBe(11);
	expect(scrubNumber(10, { ...plain, mx: 8, shift: true }, 0.5, 10, { max: 40 }).value).toBe(40);
	expect(scrubNumber(10, { ...plain, mx: 4, alt: true }, 0.5, 0, {}).value).toBe(10.2);
	// back within a few pixels of where it began, it holds there, as on any detent
	expect(scrubNumber(11, { ...plain, mx: -1 }, 0.5, 10, {}).value).toBe(10);
	expect(scrubNumber(23, { ...plain, mx: 1 }, 0.5, 10, { detents: [24] })).toEqual({ raw: 23.5, value: 24 });
});

it("a knob's number reports a scrub and a held arrow live and commits each once; Escape puts back the start", () => {
	const onTune = vi.fn<(next: number, phase: TunePhase) => void>();
	const host = render(createElement(NumberField, { value: 20, onTune, prefix: "r", label: "radius" }));
	const handle = host.querySelector("span") as HTMLElement;
	const pointer = (type: string, clientX: number) =>
		act(() => {
			const event = new PointerEvent(type, { clientX, clientY: 0, button: 0, pointerId: 1, bubbles: true });
			(type === "pointerdown" ? handle : document).dispatchEvent(event);
		});
	pointer("pointerdown", 0);
	pointer("pointermove", 6);
	pointer("pointermove", 12);
	pointer("pointerup", 12);
	expect(onTune.mock.calls).toEqual([
		[23, "live"],
		[26, "live"],
		[26, "commit"],
	]);

	onTune.mockClear();
	pointer("pointerdown", 0);
	pointer("pointermove", 10);
	key(document, "Escape");
	pointer("pointerup", 10);
	expect(onTune.mock.calls).toEqual([
		[25, "live"],
		[20, "cancel"],
	]);

	onTune.mockClear();
	const field = input(host, "radius");
	key(field, "ArrowUp");
	key(field, "ArrowUp", true);
	act(() => field.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true })));
	expect(onTune.mock.calls).toEqual([
		[21, "live"],
		[31, "live"],
		[31, "commit"],
	]);
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
