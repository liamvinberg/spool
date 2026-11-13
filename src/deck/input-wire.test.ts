import { expect, it } from "vitest";
import { PATH_DEEPEST, parseSlideInputs, type SlideInputs, VALUE_LONGEST } from "./input-wire";
import { parseTalkMessage } from "./present-wire";

it("carries what the presenter did in a live slide, and refuses a word of it that is not well formed whole", () => {
	const inputs: SlideInputs = {
		frame: "talk/proto",
		take: 0,
		input: [
			{
				kind: "hand",
				type: "pointermove",
				path: [0, 3],
				x: 0.5,
				y: 0.25,
				button: -1,
				buttons: 0,
				mods: 0,
				detail: 0,
			},
			{ kind: "hand", type: "click", path: [0, 3], x: 0.5, y: 0.25, button: 0, buttons: 0, mods: 1, detail: 1 },
			{
				kind: "hand",
				type: "mouseover",
				path: [1],
				x: 0,
				y: 1,
				button: 0,
				buttons: 0,
				mods: 0,
				detail: 0,
				related: [0],
			},
			{ kind: "wheel", path: [2], x: 0.1, y: 0.9, dx: 0, dy: 120, mode: 0, mods: 0 },
			{ kind: "key", type: "keydown", path: null, key: "a", code: "KeyA", mods: 0, repeat: false },
			{ kind: "scroll", path: [2], top: 340, left: 0 },
			{ kind: "value", path: [4], event: "input", value: "hello" },
			{ kind: "value", path: [5], event: "change", value: "on", checked: true },
			{ kind: "focus", path: [4], visible: true },
			{ kind: "focus", path: null, visible: false },
			{ kind: "afresh" },
		],
	};
	expect(parseTalkMessage({ kind: "input", inputs })).toEqual({ kind: "input", inputs });

	const one = (input: unknown) => parseSlideInputs({ frame: "talk/proto", take: 0, input: [input] });
	const click = inputs.input[1];
	for (const bad of [
		{ ...click, type: "submit" },
		{ ...click, x: 1.5 },
		{ ...click, path: [-1] },
		{ ...click, path: Array.from({ length: PATH_DEEPEST + 1 }, () => 0) },
		{ ...click, related: "body" },
		{ kind: "value", path: [4], event: "input", value: "x".repeat(VALUE_LONGEST + 1) },
		{ kind: "scroll", path: [2], top: Number.NaN, left: 0 },
		{ kind: "key", type: "keypress", path: null, key: "a", code: "KeyA", mods: 0, repeat: false },
		{ kind: "navigate", to: "https://example.com" },
	])
		expect(one(bad)).toBeUndefined();
	expect(parseSlideInputs({ ...inputs, take: -1 })).toBeUndefined();
	expect(
		parseSlideInputs({ ...inputs, input: Array.from({ length: 65 }, () => ({ kind: "afresh" })) }),
	).toBeUndefined();
});
