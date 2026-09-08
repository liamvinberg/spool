import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { NativeBorderColorResult } from "./property-border-colors";

let browser: Browser;
let runtime: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/runtime/property-border-colors.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyBorderColors",
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
	const inspect = (expectedValue: readonly { side: "top" | "right" | "bottom" | "left"; color: string }[]) =>
		page.locator("[data-subject]").evaluateAll((elements, expectedValue) => {
			const evaluator = Reflect.get(window, "PropertyBorderColors") as {
				nativeBorderColors(
					element: Element,
					expectedValue: readonly { side: "top" | "right" | "bottom" | "left"; color: string }[],
				): NativeBorderColorResult;
			};
			return elements.map((element) => evaluator.nativeBorderColors(element, expectedValue));
		}, expectedValue);
	return { page, inspect };
}

it("compares an independently supplied border side against each native use and inverse", async () => {
	const f = await fixture(
		'<div data-subject style="border:4px solid red;width:100px;height:40px">Before</div><div data-subject style="border:4px solid blue;width:100px;height:40px">After</div>',
	);
	expect(await f.inspect([{ side: "top", color: "blue" }])).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
	expect(await f.inspect([{ side: "top", color: "red" }])).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it.each(["top", "right", "bottom", "left"] as const)("compares only the caller-selected %s color", async (side) => {
	const f = await fixture(
		`<div data-subject style="width:100px;height:40px;border:4px solid red;border-${side}-color:blue">Side</div>`,
	);
	expect(await f.inspect([{ side, color: "blue" }])).toEqual([
		{ kind: "known", matches: true, observed: `${side}: rgb(0, 0, 255)` },
	]);
	expect(await f.inspect([{ side, color: "red" }])).toEqual([
		{ kind: "known", matches: false, observed: `${side}: rgb(0, 0, 255)` },
	]);
	const colors = await f.page
		.locator("[data-subject]")
		.evaluate((element) =>
			["top", "right", "bottom", "left"].map((side) =>
				getComputedStyle(element).getPropertyValue(`border-${side}-color`),
			),
		);
	expect(colors.filter((color) => color === "rgb(255, 0, 0)")).toHaveLength(3);
});

it("compares all supplied sides, their distinct colors and caller order", async () => {
	const f = await fixture(
		'<div data-subject style="width:100px;height:40px;border:4px solid;border-color:red blue green transparent">Compound</div>',
	);
	const expected = [
		{ side: "left" as const, color: "transparent" },
		{ side: "bottom" as const, color: "green" },
		{ side: "right" as const, color: "blue" },
		{ side: "top" as const, color: "red" },
	];
	expect(await f.inspect(expected)).toEqual([
		{
			kind: "known",
			matches: true,
			observed: "left: rgba(0, 0, 0, 0); bottom: rgb(0, 128, 0); right: rgb(0, 0, 255); top: rgb(255, 0, 0)",
		},
	]);
	expect(await f.inspect([...expected.slice(0, 3), { side: "top", color: "blue" }])).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it.each([
	{ sides: ["left", "right"] as const, context: "direction:rtl" },
	{ sides: ["top", "bottom"] as const, context: "writing-mode:vertical-rl;direction:rtl" },
])("uses supplied physical sides without remapping $context", async ({ sides, context }) => {
	const f = await fixture(
		`<div data-subject style="width:100px;height:40px;${context};border:4px solid red;${sides.map((side) => `border-${side}-color:blue`).join(";")}">Physical sides</div>`,
	);
	expect(await f.inspect(sides.map((side) => ({ side, color: "blue" })))).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
	expect(await f.inspect(sides.map((side) => ({ side, color: "red" })))).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it("compares real retained theme palette declarations and inverse", async () => {
	const red = "oklch(63.7% 0.237 25.331)",
		blue = "oklch(62.3% 0.214 259.815)";
	const f = await fixture(
		`<div data-subject style="width:100px;height:40px;border:4px solid ${red}">Before</div><div data-subject style="width:100px;height:40px;border:4px solid ${blue}">After</div>`,
	);
	expect(await f.inspect([{ side: "top", color: blue }])).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
	expect(await f.inspect([{ side: "top", color: red }])).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it("compares caller-resolved default color without resolving currentColor itself", async () => {
	const f = await fixture(
		'<div data-subject style="width:100px;height:40px;color:red;border:4px solid">Default color</div>',
	);
	expect(await f.inspect([{ side: "top", color: "red" }])).toEqual([
		{ kind: "known", matches: true, observed: "top: rgb(255, 0, 0)" },
	]);
	expect(await f.inspect([{ side: "top", color: "currentColor" }])).toEqual([
		{ kind: "unknown", reason: "this border color needs a resolved supported literal" },
	]);
});

it.each([
	{ raw: "rgba(10,20,30,.5000005)", other: "rgba(10,20,30,.5)" },
	{ raw: "rgb(10.0000005 20 30)", other: "rgb(10 20 30)" },
	{ raw: "oklch(.5000005 .1 30)", other: "oklch(.5 .1 30)" },
	{ raw: "color(srgb .5000005 0 0)", other: "color(srgb .5 0 0)" },
	{ raw: "rgb(0 0 0/.0000005)", other: "rgb(0 0 0/0)" },
])("keeps rounded expected color precision unknown for self and other $raw", async ({ raw, other }) => {
	const f = await fixture(
		`<div data-subject style="width:100px;height:40px;border:4px solid ${raw}">Self</div><div data-subject style="width:100px;height:40px;border:4px solid ${other}">Other</div>`,
	);
	const values = await f.page
		.locator("[data-subject]")
		.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).borderTopColor));
	expect(values[0]).toBe(values[1]);
	expect(await f.inspect([{ side: "top", color: raw }])).toEqual([
		{ kind: "unknown", reason: "this border color needs observable native numeric precision" },
		{ kind: "unknown", reason: "this border color needs observable native numeric precision" },
	]);
});

it.each([
	{ actual: "color(srgb .0000005 0 0)", expected: "color(srgb 0 0 0)" },
	{ actual: "oklch(.0000005 .1 30)", expected: "oklch(0 .1 30)" },
])("retains a native-distinguishable tiny color mismatch $actual", async ({ actual, expected }) => {
	const f = await fixture(`<div data-subject style="width:100px;height:40px;border:4px solid ${actual}">Tiny</div>`);
	expect(await f.inspect([{ side: "top", color: expected }])).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it.each([
	{ context: "an unpainted border style", style: "border:4px none red" },
	{ context: "a hidden border style", style: "border:4px hidden red" },
	{ context: "a zero border width", style: "border:0 solid red" },
])("refuses $context whose color paints nothing", async ({ style }) => {
	const f = await fixture(`<div data-subject style="width:100px;height:40px;${style}">Unpainted</div>`);
	expect(await f.inspect([{ side: "top", color: "red" }])).toEqual([
		{ kind: "unknown", reason: "this border color has no painted native border side" },
	]);
});

it("refuses a selected side that paints nothing beside painted siblings", async () => {
	const f = await fixture(
		'<div data-subject style="width:100px;height:40px;border:4px solid red;border-top-style:none">Mixed</div>',
	);
	expect(await f.inspect([{ side: "left", color: "red" }])).toEqual([
		{ kind: "known", matches: true, observed: "left: rgb(255, 0, 0)" },
	]);
	expect(
		await f.inspect([
			{ side: "left", color: "red" },
			{ side: "top", color: "red" },
		]),
	).toEqual([{ kind: "unknown", reason: "this border color has no painted native border side" }]);
});

it.each([
	'<div data-subject style="display:none;border:4px solid red">Hidden</div>',
	'<div data-subject style="visibility:hidden;width:100px;height:40px;border:4px solid red">Invisible</div>',
	'<div style="content-visibility:hidden"><div data-subject style="width:100px;height:40px;border:4px solid red">Skipped</div></div>',
])("refuses a border color without a rendered host", async (markup) => {
	const f = await fixture(markup);
	expect(await f.inspect([{ side: "top", color: "red" }])).toEqual([
		{ kind: "unknown", reason: "this border color has no rendered native host" },
	]);
});

it("refuses a detached host", async () => {
	const f = await fixture('<div data-subject style="width:100px;height:40px;border:4px solid red">Detached</div>');
	const result = await f.page.locator("[data-subject]").evaluate((element) => {
		element.remove();
		const evaluator = Reflect.get(window, "PropertyBorderColors") as {
			nativeBorderColors(
				element: Element,
				expectedValue: readonly { side: "top"; color: string }[],
			): NativeBorderColorResult;
		};
		return evaluator.nativeBorderColors(element, [{ side: "top", color: "red" }]);
	});
	expect(result).toEqual({ kind: "unknown", reason: "this border color has no rendered native host" });
});

it("refuses a non-HTML border host", async () => {
	const f = await fixture(
		'<svg width="100" height="50"><rect data-subject width="80" height="40" style="border:4px solid red" /></svg>',
	);
	expect(await f.inspect([{ side: "top", color: "red" }])).toEqual([
		{ kind: "unknown", reason: "this border color needs a proven native border box context" },
	]);
});

it("refuses collapsing table border resolution", async () => {
	const f = await fixture(
		'<table style="border-collapse:collapse"><tr><td data-subject style="border:4px solid red">Cell</td></tr></table>',
	);
	expect(await f.inspect([{ side: "top", color: "red" }])).toEqual([
		{ kind: "unknown", reason: "this border color needs a proven native border box context" },
	]);
});

it("refuses fragmented inline border boxes", async () => {
	const f = await fixture(
		'<div style="width:45px"><span data-subject style="border:4px solid red">Native border across several lines</span></div>',
	);
	expect(
		await f.page.locator("[data-subject]").evaluate((element) => element.getClientRects().length),
	).toBeGreaterThan(1);
	expect(await f.inspect([{ side: "top", color: "red" }])).toEqual([
		{ kind: "unknown", reason: "this border color needs a proven native border box context" },
	]);
});

it("refuses forced border colors", async () => {
	const f = await fixture('<div data-subject style="width:100px;height:40px;border:4px solid red">Forced</div>');
	await f.page.emulateMedia({ forcedColors: "active" });
	expect(await f.inspect([{ side: "top", color: "red" }])).toEqual([
		{ kind: "unknown", reason: "this border color needs an unforced native color context" },
	]);
});

it("refuses a system border color the caller has not resolved", async () => {
	const f = await fixture(
		'<div data-subject style="width:100px;height:40px;border:4px solid ButtonBorder">System</div>',
	);
	expect(await f.inspect([{ side: "top", color: "ButtonBorder" }])).toEqual([
		{ kind: "unknown", reason: "this border color needs a resolved supported literal" },
	]);
});

it("refuses an empty side selection", async () => {
	const f = await fixture('<div data-subject style="width:100px;height:40px;border:4px solid red">Empty</div>');
	expect(await f.inspect([])).toEqual([{ kind: "unknown", reason: "this border color needs a selected native side" }]);
});

it("compares without changing document, stylesheets or the active input", async () => {
	const f = await fixture('<style>input { border:4px solid red }</style><input data-subject value="kept text">');
	await f.page.locator("input").focus();
	const result = await f.page.evaluate(async () => {
		const input = document.querySelector("input")!;
		input.setSelectionRange(2, 5);
		const snapshot = () => ({
			html: document.documentElement.outerHTML,
			sheets: [...document.styleSheets].map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText)),
			adopted: document.adoptedStyleSheets.length,
			value: input.value,
			start: input.selectionStart,
			end: input.selectionEnd,
			focused: document.activeElement === input,
			border: getComputedStyle(input).borderTopColor,
		});
		const before = snapshot();
		const mutations: MutationRecord[] = [];
		const observer = new MutationObserver((records) => mutations.push(...records));
		observer.observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
		const evaluator = Reflect.get(window, "PropertyBorderColors") as {
			nativeBorderColors(
				element: Element,
				expectedValue: readonly { side: "top"; color: string }[],
			): NativeBorderColorResult;
		};
		const outcomes = ["red", "blue", "currentColor"].map((color) =>
			evaluator.nativeBorderColors(input, [{ side: "top", color }]),
		);
		await Promise.resolve();
		observer.disconnect();
		return { before, after: snapshot(), mutations: mutations.length, outcomes };
	});
	expect(result.after).toEqual(result.before);
	expect(result.mutations).toBe(0);
	expect(result.outcomes).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "unknown", reason: "this border color needs a resolved supported literal" },
	]);
});
