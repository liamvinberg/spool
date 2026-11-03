// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { formatColour, formatGradient, PictureGrid, parseColour, parseGradient } from "./pickers";

/**
 * A colour knob writes in the format the picker shows, so every format reads
 * back as the colour it wrote; a gradient is read with every stop placed and
 * written back as CSS; a choice is tried on by hover and written by a press.
 */

afterEach(() => vi.unstubAllGlobals());

it("a colour written in each format reads back as the same colour, alpha included", () => {
	for (const hex of ["#2f5d50", "#f4efe6", "#000000", "#ffffff", "#c52a18", "#2f5d5080"]) {
		const colour = parseColour(hex)?.colour;
		if (colour === undefined) throw new Error(`unread ${hex}`);
		for (const format of ["hex", "rgb", "hsl", "oklch"] as const) {
			const written = formatColour(colour, format);
			const read = parseColour(written);
			expect(read?.format, written).toBe(format);
			expect(read && formatColour(read.colour, "hex"), written).toBe(hex);
		}
	}
});

it("a colour reads from the other ways CSS writes it", () => {
	const hex = (text: string) => {
		const read = parseColour(text);
		return read && formatColour(read.colour, "hex");
	};
	expect(hex("#ABC")).toBe("#aabbcc");
	expect(hex("rgba(47, 93, 80, 0.5)")).toBe("#2f5d5080");
	expect(hex("rgb(100% 0% 0% / 50%)")).toBe("#ff000080");
	expect(hex("hsl(0deg 100% 50%)")).toBe("#ff0000");
	expect(hex("oklch(0.628 0.2577 29.23)")).toBe("#ff0000");
	expect(parseColour("tomato")).toBeUndefined();
});

it("a gradient reads its angle and places every stop, and writes back as CSS", () => {
	const gradient = parseGradient("linear-gradient(160deg, #f4efe6, rgb(232 220 203 / 0.5) 60%, #e8dccb, #000)");
	expect(gradient).toEqual({
		angle: 160,
		stops: [
			{ colour: "#f4efe6", at: 0 },
			{ colour: "rgb(232 220 203 / 0.5)", at: 60 },
			{ colour: "#e8dccb", at: 80 },
			{ colour: "#000", at: 100 },
		],
	});
	expect(gradient && formatGradient(gradient)).toBe(
		"linear-gradient(160deg, #f4efe6 0%, rgb(232 220 203 / 0.5) 60%, #e8dccb 80%, #000 100%)",
	);
	expect(parseGradient("linear-gradient(to top left, red, blue)")?.angle).toBe(315);
	expect(parseGradient("linear-gradient(red, blue)")?.angle).toBe(180);
	expect(parseGradient("radial-gradient(red, blue)")).toBeUndefined();
});

it("hovering a choice tries it on, leaving puts the value back, and a press commits it once", () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const onTune = vi.fn();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const options = [
		{ value: "bag", image: "/bag.webp" },
		{ value: "beans", image: "/beans.webp" },
	];
	act(() => root.render(createElement(PictureGrid, { value: "bag", onTune, options })));
	const [, beans] = host.querySelectorAll("button");
	const grid = host.firstElementChild as HTMLElement;
	const pointer = (target: Element, type: string, relatedTarget: Element | null) =>
		act(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, relatedTarget })));
	pointer(beans!, "pointerover", document.body);
	pointer(beans!, "pointerout", document.body);
	expect(onTune.mock.calls).toEqual([
		["beans", "live"],
		["bag", "cancel"],
	]);
	onTune.mockClear();
	pointer(beans!, "pointerover", document.body);
	act(() => beans!.click());
	pointer(grid, "pointerout", document.body);
	expect(onTune.mock.calls).toEqual([
		["beans", "live"],
		["beans", "commit"],
	]);
	act(() => root.unmount());
	host.remove();
});
