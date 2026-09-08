import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { NativeTransitionProperty, NativeTransitionResult } from "./property-transitions";

let browser: Browser;
let runtime: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/runtime/property-transitions.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyTransitions",
	});
	runtime = result.outputFiles[0]!.text;
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(() => browser?.close(), 35_000);

async function fixture(markup: string) {
	const page = await browser.newPage();
	onTestFinished(() => page.close(), 35_000);
	await page.setContent(markup);
	await page.addScriptTag({ content: runtime });
	const inspect = (property: NativeTransitionProperty, expectedValue: string) =>
		page.locator("[data-subject]").evaluateAll(
			(elements, { property, expectedValue }) => {
				const evaluator = Reflect.get(window, "PropertyTransitions") as {
					nativeTransition(
						element: Element,
						property: NativeTransitionProperty,
						expectedValue: string,
					): NativeTransitionResult;
				};
				return elements.map((element) => evaluator.nativeTransition(element, property, expectedValue));
			},
			{ property, expectedValue },
		);
	return { page, inspect };
}

it("compares an independently supplied duration against each configured native use", async () => {
	const f = await fixture(
		'<div data-subject style="transition-duration:2ms">Before</div><div data-subject style="transition-duration:4ms">After</div>',
	);
	expect(await f.inspect("transition-duration", "4ms")).toEqual([
		{ kind: "known", matches: false, observed: "0.002s" },
		{ kind: "known", matches: true, observed: "0.004s" },
	]);
	expect(await f.inspect("transition-duration", ".002s")).toEqual([
		{ kind: "known", matches: true, observed: "0.002s" },
		{ kind: "known", matches: false, observed: "0.004s" },
	]);
});

it.each([
	{ row: "delay", property: "transition-delay", before: "2ms", after: "4ms" },
	{ row: "signed delay", property: "transition-delay", before: "-.125s", after: "0s" },
	{ row: "zero duration", property: "transition-duration", before: "0s", after: ".125s" },
	{
		row: "theme in to out",
		property: "transition-timing-function",
		before: "cubic-bezier(.4,0,1,1)",
		after: "cubic-bezier(0,0,.2,1)",
	},
	{
		row: "theme in-out",
		property: "transition-timing-function",
		before: "cubic-bezier(0,0,.2,1)",
		after: "cubic-bezier(.4,0,.2,1)",
	},
	{
		row: "project overshoot curve",
		property: "transition-timing-function",
		before: "linear",
		after: "cubic-bezier(.2,-.4,.8,1.5)",
	},
	{
		row: "project steps",
		property: "transition-timing-function",
		before: "steps(4,jump-none)",
		after: "steps(4,jump-both)",
	},
	{ row: "ordered duration list", property: "transition-duration", before: "2ms, .125s, 0s", after: "4ms, .125s, 0s" },
	{
		row: "ordered easing list",
		property: "transition-timing-function",
		before: "ease-in, cubic-bezier(.2,0,.8,1), steps(4,start)",
		after: "ease-out, cubic-bezier(.2,0,.8,1), steps(4,start)",
	},
] as const)("compares configured original and inverse native $row values", async ({ property, before, after }) => {
	const f = await fixture(
		`<div data-subject style="${property}:${before}">Before</div><div data-subject style="${property}:${after}">After</div>`,
	);
	const native = await f.page
		.locator("[data-subject]")
		.evaluateAll(
			(elements, property) => elements.map((element) => getComputedStyle(element).getPropertyValue(property)),
			property,
		);
	expect(native[0]).not.toBe(native[1]);
	expect(await f.inspect(property, after)).toEqual([
		{ kind: "known", matches: false, observed: native[0] },
		{ kind: "known", matches: true, observed: native[1] },
	]);
	expect(await f.inspect(property, before)).toEqual([
		{ kind: "known", matches: true, observed: native[0] },
		{ kind: "known", matches: false, observed: native[1] },
	]);
});

it.each([
	{ property: "transition-duration", actual: ".00029s, 0s, .125s", expected: ".29ms, 0ms, 125ms" },
	{ property: "transition-delay", actual: "-.00029s, 0s, 1.25s", expected: "-.29ms, 0ms, 1250ms" },
	{ property: "transition-duration", actual: "5e-10s", expected: ".0000005ms" },
	{ property: "transition-timing-function", actual: "ease", expected: "cubic-bezier(.25,.1,.25,1)" },
	{ property: "transition-timing-function", actual: "ease-in", expected: "cubic-bezier(.42,0,1,1)" },
	{ property: "transition-timing-function", actual: "ease-out", expected: "cubic-bezier(0,0,.58,1)" },
	{ property: "transition-timing-function", actual: "ease-in-out", expected: "cubic-bezier(.42,0,.58,1)" },
	{ property: "transition-timing-function", actual: "linear", expected: "cubic-bezier(0,0,1,1)" },
	{
		property: "transition-timing-function",
		actual: "step-start,step-end",
		expected: "steps(1,jump-start),steps(1,jump-end)",
	},
	{
		property: "transition-timing-function",
		actual: "steps(4),steps(5,start)",
		expected: "steps(4,jump-end),steps(5,jump-start)",
	},
] as const)("normalizes exact native units and easing aliases: $expected", async ({ property, actual, expected }) => {
	const f = await fixture(`<div data-subject style="${property}:${actual}">Native value</div>`);
	expect(await f.inspect(property, expected)).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
});

it.each([
	{ property: "transition-duration", actual: "1s,2s", expected: "2s,1s" },
	{ property: "transition-duration", actual: "1s,1s", expected: "1s" },
	{ property: "transition-delay", actual: "-.125s", expected: ".125s" },
	{ property: "transition-duration", actual: "5e-7s", expected: "0s" },
	{ property: "transition-delay", actual: "-5e-7s", expected: "0s" },
	{ property: "transition-timing-function", actual: "ease-in", expected: "cubic-bezier(.4,0,1,1)" },
	{ property: "transition-timing-function", actual: "ease,steps(4)", expected: "steps(4),ease" },

	{
		property: "transition-timing-function",
		actual: "cubic-bezier(.0000005,0,1,1)",
		expected: "cubic-bezier(0,0,1,1)",
	},
] as const)(
	"preserves configured list, sign and precision mismatches: $expected",
	async ({ property, actual, expected }) => {
		const f = await fixture(`<div data-subject style="${property}:${actual}">Native value</div>`);
		expect(await f.inspect(property, expected)).toEqual([
			{ kind: "known", matches: false, observed: expect.any(String) },
		]);
	},
);

it.each([
	{ property: "transition-duration", expected: "-1ms" },
	{ property: "transition-duration", expected: "1e999s" },
	{ property: "transition-duration", expected: "0" },
	{ property: "transition-duration", expected: "calc(100ms + 25ms)" },
	{ property: "transition-delay", expected: "var(--delay)" },
	{ property: "transition-delay", expected: "inherit" },
	{ property: "transition-timing-function", expected: "linear(0, .5 25%, 1)" },
	{ property: "transition-timing-function", expected: "cubic-bezier(2,0,1,1)" },
	{ property: "transition-timing-function", expected: "steps(1,jump-none)" },
	{ property: "transition-timing-function", expected: "steps(9007199254740992)" },
	{ property: "transition-timing-function", expected: "revert" },
] as const)("refuses unresolved or unsupported configured transition $expected", async ({ property, expected }) => {
	const f = await fixture("<div data-subject>Native value</div>");
	expect(await f.inspect(property, expected)).toEqual([
		{ kind: "unknown", reason: "this transition needs a resolved supported declaration" },
	]);
});

it("refuses an unsupported actual project linear stop function", async () => {
	const f = await fixture(
		'<div data-subject style="transition-timing-function:linear(0, .5 25%, 1)">Project easing</div>',
	);
	expect(await f.inspect("transition-timing-function", "linear")).toEqual([
		{ kind: "unknown", reason: "this transition needs a resolved supported declaration" },
	]);
});

it.each([
	'<div data-subject style="display:none;transition-duration:1s">Hidden</div>',
	'<div data-subject style="visibility:hidden;transition-duration:1s">Hidden</div>',
	'<div style="content-visibility:hidden"><div data-subject style="transition-duration:1s">Skipped</div></div>',
])("refuses a configured transition without a rendered host", async (markup) => {
	const f = await fixture(markup);
	expect(await f.inspect("transition-duration", "1s")).toEqual([
		{ kind: "unknown", reason: "this transition has no rendered native host" },
	]);
});

it.each([
	{ property: "transition-duration", expected: "100.0000005ms", other: "100ms" },
	{
		property: "transition-timing-function",
		expected: "cubic-bezier(.5000005,0,1,1)",
		other: "cubic-bezier(.5,0,1,1)",
	},
] as const)(
	"keeps indistinguishable $property precision unknown for self and other uses",
	async ({ property, expected, other }) => {
		const f = await fixture(
			`<div data-subject style="${property}:${expected}">Self</div><div data-subject style="${property}:${other}">Other</div>`,
		);
		const observed = await f.page
			.locator("[data-subject]")
			.evaluateAll(
				(elements, property) => elements.map((element) => getComputedStyle(element).getPropertyValue(property)),
				property,
			);
		expect(observed[0]).toBe(observed[1]);
		expect(await f.inspect(property, expected)).toEqual([
			{ kind: "unknown", reason: "this transition needs observable native numeric precision" },
			{ kind: "unknown", reason: "this transition needs observable native numeric precision" },
		]);
	},
);

it("refuses a detached transition host", async () => {
	const f = await fixture('<div data-subject style="transition-duration:1s">Detached</div>');
	expect(
		await f.page.locator("[data-subject]").evaluate((element) => {
			element.remove();
			const evaluator = Reflect.get(window, "PropertyTransitions") as {
				nativeTransition(
					element: Element,
					property: NativeTransitionProperty,
					expectedValue: string,
				): NativeTransitionResult;
			};
			return evaluator.nativeTransition(element, "transition-duration", "1s");
		}),
	).toEqual({ kind: "unknown", reason: "this transition needs a connected native document context" });
});

it("preserves the document, configured transitions and input state without starting transitions", async () => {
	const f = await fixture(
		'<style>.configured{transition-property:opacity,color;transition-duration:125ms,250ms;transition-delay:-20ms,0s;transition-timing-function:cubic-bezier(.4,0,.2,1),steps(4)}</style><div data-subject class="configured"><input value="initial"/></div>',
	);
	const before = await f.page.evaluate(() => {
		const input = document.querySelector("input")!;
		input.focus();
		input.value = "retained transition input";
		input.setSelectionRange(2, 5);
		Reflect.set(window, "transitionInput", input);
		const mutations: MutationRecord[] = [];
		new MutationObserver((records) => mutations.push(...records)).observe(document.documentElement, {
			attributes: true,
			characterData: true,
			childList: true,
			subtree: true,
		});
		Reflect.set(window, "transitionMutations", mutations);
		const style = getComputedStyle(document.querySelector("[data-subject]")!);
		return {
			html: document.documentElement.outerHTML,
			sheets: document.styleSheets.length,
			adopted: document.adoptedStyleSheets.length,
			configured: [
				style.transitionProperty,
				style.transitionDuration,
				style.transitionDelay,
				style.transitionTimingFunction,
			],
			animations: document.getAnimations().length,
		};
	});
	for (const [property, value] of [
		["transition-duration", ".125s,.25s"],
		["transition-delay", "-.02s,0ms"],
		["transition-timing-function", "cubic-bezier(.4,0,.2,1),steps(4,jump-end)"],
	] as const)
		expect(await f.inspect(property, value)).toEqual([
			{ kind: "known", matches: true, observed: expect.any(String) },
		]);
	expect(await f.inspect("transition-duration", ".25s,.125s")).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
	expect(await f.inspect("transition-delay", "var(--outside)")).toEqual([
		{ kind: "unknown", reason: "this transition needs a resolved supported declaration" },
	]);
	expect(
		await f.page.evaluate(() => {
			const input = document.querySelector("input")!;
			const style = getComputedStyle(document.querySelector("[data-subject]")!);
			return {
				html: document.documentElement.outerHTML,
				sheets: document.styleSheets.length,
				adopted: document.adoptedStyleSheets.length,
				configured: [
					style.transitionProperty,
					style.transitionDuration,
					style.transitionDelay,
					style.transitionTimingFunction,
				],
				animations: document.getAnimations().length,
				input: [
					input === Reflect.get(window, "transitionInput"),
					document.activeElement === input,
					input.value,
					input.selectionStart,
					input.selectionEnd,
				],
				mutations: Reflect.get(window, "transitionMutations").length,
			};
		}),
	).toEqual({ ...before, input: [true, true, "retained transition input", 2, 5], mutations: 0 });
});
