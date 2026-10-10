// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Checkbox, RadioCard, RadioGroup, Segment, SegmentedControl, Switch } from "./selection";

/**
 * The selection primitives are native inputs under their drawing: a press on the
 * words reaches the input, the caller's value is what shows, and a disabled one
 * stays put.
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

const press = (node: Element | null | undefined) => act(() => (node as HTMLElement | null)?.click());

it("a checkbox asks for the other value from its words and shows the caller's", () => {
	const onCheckedChange = vi.fn();
	const host = render(createElement(Checkbox, { checked: false, onCheckedChange, label: "Use for future projects" }));
	const input = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
	press(host.querySelector("label span.type-control"));
	expect(onCheckedChange).toHaveBeenCalledWith(true);
	// controlled: it waits for the caller to say so
	expect(input?.checked).toBe(false);
});

it("a disabled checkbox stays put", () => {
	const onCheckedChange = vi.fn();
	const host = render(createElement(Checkbox, { checked: true, disabled: true, onCheckedChange, label: "Later" }));
	press(host.querySelector("input"));
	expect(onCheckedChange).not.toHaveBeenCalled();
	expect(host.querySelector("input")?.checked).toBe(true);
});

it("a switch is a named switch that flips", () => {
	const onCheckedChange = vi.fn();
	const host = render(createElement(Switch, { checked: true, onCheckedChange, "aria-label": "Show threads" }));
	const input = host.querySelector<HTMLInputElement>('[role="switch"][aria-label="Show threads"]');
	expect(input?.checked).toBe(true);
	press(input);
	expect(onCheckedChange).toHaveBeenCalledWith(false);
});

it("radio cards are one named choice and a press picks the card's value", () => {
	const onSelect = vi.fn();
	const card = (value: string, checked: boolean) =>
		createElement(RadioCard, { key: value, name: "format", value, checked, onSelect, label: value.toUpperCase() });
	const host = render(createElement(RadioGroup, { label: "Export format" }, card("png", true), card("pdf", false)));
	expect(host.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe("Export format");
	const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"][name="format"]')];
	expect(radios.map((radio) => radio.checked)).toEqual([true, false]);
	press(host.querySelectorAll("label")[1]);
	expect(onSelect).toHaveBeenCalledWith("pdf");
});

it("a segmented control picks a segment's value and skips a disabled one", () => {
	const onValueChange = vi.fn();
	const host = render(
		createElement(
			SegmentedControl,
			{ label: "Effort levels", size: "sm", value: "high", onValueChange },
			createElement(Segment, { value: "low", disabled: true }, "low"),
			createElement(Segment, { value: "high" }, "high"),
			createElement(Segment, { value: "max" }, "max"),
		),
	);
	const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
	expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
	expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
	press(radios[2]);
	expect(onValueChange).toHaveBeenCalledWith("max");
	press(radios[0]);
	expect(onValueChange).toHaveBeenCalledTimes(1);
});
