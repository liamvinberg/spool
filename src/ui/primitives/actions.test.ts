// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Button, IconButton, SplitButton, ToggleButton } from "./actions";

/**
 * The action primitives are native buttons: a toggle asks for the other value
 * and shows the caller's, a disabled one stays put, and a button in a form
 * submits only when it says so.
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

it("a toggle asks for the other value and shows the caller's", () => {
	const onPressedChange = vi.fn();
	const host = render(createElement(ToggleButton, { pressed: false, onPressedChange }, "Paste"));
	const toggle = host.querySelector("button");
	expect(toggle?.getAttribute("aria-pressed")).toBe("false");
	press(toggle);
	expect(onPressedChange).toHaveBeenCalledWith(true);
	// controlled: it waits for the caller to say so
	expect(toggle?.getAttribute("aria-pressed")).toBe("false");
});

it("a toggle's own click handler can keep it where it is", () => {
	const onPressedChange = vi.fn();
	const host = render(
		createElement(
			ToggleButton,
			{ pressed: true, onPressedChange, onClick: (event) => event.preventDefault() },
			"Paste",
		),
	);
	press(host.querySelector("button"));
	expect(onPressedChange).not.toHaveBeenCalled();
});

it("a disabled toggle stays put", () => {
	const onPressedChange = vi.fn();
	const host = render(createElement(ToggleButton, { pressed: false, disabled: true, onPressedChange }, "Paste"));
	press(host.querySelector("button"));
	expect(onPressedChange).not.toHaveBeenCalled();
});

it("a button submits its form only when it says so", () => {
	const onSubmit = vi.fn((event: Event) => event.preventDefault());
	const host = render(
		createElement(
			"form",
			{ onSubmit },
			createElement(Button, null, "Cancel"),
			createElement(Button, { type: "submit", variant: "primary" }, "Save"),
		),
	);
	const [cancel, save] = host.querySelectorAll("button");
	press(cancel);
	expect(onSubmit).not.toHaveBeenCalled();
	press(save);
	expect(onSubmit).toHaveBeenCalledTimes(1);
});

it("an icon button is named by its label and lit while pressed", () => {
	const onClick = vi.fn();
	const host = render(createElement(IconButton, { icon: "+", label: "New page", pressed: true, onClick }));
	const button = host.querySelector('button[aria-label="New page"]');
	expect(button?.getAttribute("title")).toBe("New page");
	expect(button?.getAttribute("aria-pressed")).toBe("true");
	press(button);
	expect(onClick).toHaveBeenCalledTimes(1);
});

it("a split button acts on its left and opens its menu from the chevron", () => {
	const onClick = vi.fn();
	const onMenu = vi.fn();
	const host = render(
		createElement(SplitButton, { onClick, onMenu, menuLabel: "More ways", menuOpen: true }, "New project…"),
	);
	const [main, chevron] = host.querySelectorAll("button");
	press(main);
	expect(onClick).toHaveBeenCalledOnce();
	expect(onMenu).not.toHaveBeenCalled();
	press(chevron);
	expect(onMenu).toHaveBeenCalledOnce();
	expect(chevron?.getAttribute("aria-label")).toBe("More ways");
	expect(chevron?.getAttribute("aria-haspopup")).toBe("menu");
	expect(chevron?.getAttribute("aria-expanded")).toBe("true");
});
