import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { NativeShadowResult } from "./property-shadows";

let browser: Browser;
let runtime: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/runtime/property-shadows.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyShadows",
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
	const inspect = (expectedValue: string) =>
		page.locator("[data-subject]").evaluateAll((elements, expectedValue) => {
			const evaluator = Reflect.get(window, "PropertyShadows") as {
				nativeShadow(element: Element, expectedValue: string): NativeShadowResult;
			};
			return elements.map((element) => evaluator.nativeShadow(element, expectedValue));
		}, expectedValue);
	return { page, inspect };
}

it("compares independently supplied ring width against each native use", async () => {
	const f = await fixture(
		'<div data-subject style="margin:20px;width:100px;height:40px;box-shadow:0 0 0 2px black">Before</div><div data-subject style="margin:20px;width:100px;height:40px;box-shadow:0 0 0 4px black">After</div>',
	);
	expect(await f.inspect("0 0 0 4px black")).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
	expect(await f.inspect("0 0 0 2px #000")).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it.each([
	{
		row: "ring offset with independent width",
		before: "0 0 0 2px white, 0 0 0 4px black",
		after: "0 0 0 4px white, 0 0 0 6px black",
	},
	{
		row: "shadow sm to md",
		before: "0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)",
		after: "0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1)",
	},
	{ row: "2xs", before: "none", after: "0 1px rgb(0 0 0 / .05)" },
	{ row: "xs", before: "none", after: "0 1px 2px 0 rgb(0 0 0 / .05)" },
	{ row: "lg", before: "none", after: "0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1)" },
	{ row: "xl", before: "none", after: "0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1)" },
	{ row: "2xl", before: "none", after: "0 25px 50px -12px rgb(0 0 0 / .25)" },
	{ row: "legacy inner", before: "none", after: "inset 0 2px 4px 0 rgb(0 0 0 / .05)" },
	{
		row: "project inset and negative fractional lengths",
		before: "inset -2.5px .125px 0 -1.25px blue",
		after: "inset -3.5px .125px 0 -1.25px blue",
	},
])("compares ordered original and inverse native $row shadows", async ({ before, after }) => {
	const f = await fixture(
		`<div data-subject style="margin:60px;width:100px;height:40px;box-shadow:${before}">Before</div><div data-subject style="margin:60px;width:100px;height:40px;box-shadow:${after}">After</div>`,
	);
	const native = await f.page
		.locator("[data-subject]")
		.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).boxShadow));
	expect(native[0]).not.toBe(native[1]);
	expect(await f.inspect(after)).toEqual([
		{ kind: "known", matches: false, observed: native[0] },
		{ kind: "known", matches: true, observed: native[1] },
	]);
	expect(await f.inspect(before)).toEqual([
		{ kind: "known", matches: true, observed: native[0] },
		{ kind: "known", matches: false, observed: native[1] },
	]);
});

it.each([
	{ actual: "red 0px 1px 0px 0px", expected: "0 1px hsl(0 100% 50%)" },
	{ actual: "0 1px #f00 inset", expected: "inset rgb(255,0,0) 0px 1px 0 0" },
	{ actual: "color(srgb 1 0 0) 0px 1px", expected: "red 0 1px" },
	{ actual: "-2.5px .125px 0 -1.25px blue", expected: "rgb(0 0 255) -2.50px 0.125px 0px -1.25px" },
])("normalizes native literal colors and optional shadow lengths: $expected", async ({ actual, expected }) => {
	const f = await fixture(
		`<div data-subject style="margin:40px;width:100px;height:40px;box-shadow:${actual}">Native shadow</div>`,
	);
	expect(await f.inspect(expected)).toEqual([{ kind: "known", matches: true, observed: expect.any(String) }]);
});

it.each([
	{ actual: "0 0 0 2px white,0 0 0 4px black", expected: "0 0 0 4px black,0 0 0 2px white" },
	{ actual: "0 0 0 2px white,0 0 0 4px black", expected: "0 0 0 2px white,0 0 0 5px black" },
	{ actual: "inset 0 1px black", expected: "0 1px black" },
	{ actual: "0 1px rgb(0 0 0 / .25)", expected: "0 1px rgb(0 0 0 / .5)" },
	{ actual: "0 1px red", expected: "0 1px blue" },
	{ actual: "0 0 transparent", expected: "none" },
	{ actual: ".0000005px 0 black", expected: "0 0 black" },
	{ actual: "0 0 0 .0000005px black", expected: "0 0 0 0 black" },
])("retains layer, color and native-distinguishable length mismatches: $expected", async ({ actual, expected }) => {
	const f = await fixture(
		`<div data-subject style="margin:40px;width:100px;height:40px;box-shadow:${actual}">Native shadow</div>`,
	);
	expect(await f.inspect(expected)).toEqual([{ kind: "known", matches: false, observed: expect.any(String) }]);
});

it.each([
	"0 1em red",
	"0 1cm red",
	"0 1px currentColor",
	"0 1px",
	"var(--shadow)",
	"0 1px calc(2px + 2px) red",
	"0 1px -1px red",
	"inherit",
	"0 1px CanvasText",
	"0 1px WindowText",
])("refuses an unresolved or unsupported shadow %s", async (expected) => {
	const f = await fixture(
		'<div data-subject style="margin:40px;width:100px;height:40px;box-shadow:0 1px black">Native shadow</div>',
	);
	expect(await f.inspect(expected)).toEqual([
		{ kind: "unknown", reason: "this shadow needs a resolved supported declaration" },
	]);
});

it.each([
	{ property: "overflow", value: "hidden" },
	{ property: "clip-path", value: "inset(0)" },
	{ property: "mask-image", value: "linear-gradient(black,black)" },
	{ property: "contain", value: "paint" },
])("refuses an ancestor $property clipping context", async ({ property, value }) => {
	const f = await fixture(
		`<div style="${property}:${value}"><div data-subject style="margin:40px;width:100px;height:40px;box-shadow:0 0 0 4px black">Native shadow</div></div>`,
	);
	expect(await f.inspect("0 0 0 4px black")).toEqual([
		{ kind: "unknown", reason: "this shadow needs an unclipped native box context" },
	]);
});

it("does not mistake the host's content overflow for clipping its own outset shadow", async () => {
	const f = await fixture(
		'<div data-subject style="overflow:hidden;margin:40px;width:100px;height:40px;box-shadow:0 0 0 4px black">Native shadow</div>',
	);
	expect(await f.inspect("0 0 0 4px black")).toEqual([{ kind: "known", matches: true, observed: expect.any(String) }]);
});

it.each([
	'<div data-subject style="display:none;box-shadow:0 1px black">Hidden</div>',
	'<div style="content-visibility:hidden"><div data-subject style="width:100px;height:40px;box-shadow:0 1px black">Skipped</div></div>',
])("refuses a shadow without a rendered host", async (markup) => {
	const f = await fixture(markup);
	expect(await f.inspect("0 1px black")).toEqual([
		{ kind: "unknown", reason: "this shadow has no rendered native host" },
	]);
});

it("refuses collapsing internal table shadow applicability", async () => {
	const f = await fixture(
		'<table style="border-collapse:collapse"><tr><td data-subject style="box-shadow:0 1px black">Cell shadow</td></tr></table>',
	);
	expect(await f.inspect("0 1px black")).toEqual([
		{ kind: "unknown", reason: "this shadow needs a proven native box applicability context" },
	]);
});

it("refuses fragmented shadow boxes", async () => {
	const f = await fixture(
		'<div style="width:45px"><span data-subject style="box-shadow:0 1px black">Native shadow across several lines</span></div>',
	);
	expect(
		await f.page.locator("[data-subject]").evaluate((element) => element.getClientRects().length),
	).toBeGreaterThan(1);
	expect(await f.inspect("0 1px black")).toEqual([
		{ kind: "unknown", reason: "this shadow needs a proven native box applicability context" },
	]);
});

it("refuses forced-color shadow suppression", async () => {
	const f = await fixture(
		'<div data-subject style="width:100px;height:40px;box-shadow:0 1px black">Native shadow</div>',
	);
	await f.page.emulateMedia({ forcedColors: "active" });
	expect(await f.inspect("0 1px black")).toEqual([
		{ kind: "unknown", reason: "this shadow needs an unforced native color context" },
	]);
});

it("keeps indistinguishable expected shadow length precision unknown", async () => {
	const expected = ".5000005px 0 black";
	const f = await fixture(
		`<div data-subject style="margin:40px;width:100px;height:40px;box-shadow:${expected}">Self</div><div data-subject style="margin:40px;width:100px;height:40px;box-shadow:.5px 0 black">Other</div>`,
	);
	const native = await f.page
		.locator("[data-subject]")
		.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).boxShadow));
	expect(native[0]).toBe(native[1]);
	expect(await f.inspect(expected)).toEqual([
		{ kind: "unknown", reason: "this shadow needs observable native numeric precision" },
		{ kind: "unknown", reason: "this shadow needs observable native numeric precision" },
	]);
});

it("refuses a detached host", async () => {
	const f = await fixture('<div data-subject style="box-shadow:0 1px black">Shadow</div>');
	const result = await f.page.locator("[data-subject]").evaluate((element) => {
		element.remove();
		const evaluator = Reflect.get(window, "PropertyShadows") as {
			nativeShadow(element: Element, expectedValue: string): NativeShadowResult;
		};
		return evaluator.nativeShadow(element, "0 1px black");
	});
	expect(result).toEqual({ kind: "unknown", reason: "this shadow has no rendered native host" });
});

it("compares without changing document, stylesheets or the active input", async () => {
	const f = await fixture('<style>input { box-shadow:0 1px red }</style><input data-subject value="kept text">');
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
			shadow: getComputedStyle(input).boxShadow,
		});
		const before = snapshot();
		const mutations: MutationRecord[] = [];
		const observer = new MutationObserver((records) => mutations.push(...records));
		observer.observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
		const evaluator = Reflect.get(window, "PropertyShadows") as {
			nativeShadow(element: Element, expectedValue: string): NativeShadowResult;
		};
		const outcomes = ["0 1px red", "0 2px red", "0 1em red"].map((value) => evaluator.nativeShadow(input, value));
		await Promise.resolve();
		observer.disconnect();
		return { before, after: snapshot(), mutations: mutations.length, outcomes };
	});
	expect(result.after).toEqual(result.before);
	expect(result.mutations).toBe(0);
	expect(result.outcomes).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "unknown", reason: "this shadow needs a resolved supported declaration" },
	]);
});

it("refuses a non-HTML shadow host", async () => {
	const f = await fixture(
		'<svg width="100" height="50"><rect data-subject width="80" height="40" style="box-shadow:0 1px red" /></svg>',
	);
	expect(await f.inspect("0 1px red")).toEqual([
		{ kind: "unknown", reason: "this shadow needs a proven native box applicability context" },
	]);
});

it("keeps unavailable native precision access unknown", async () => {
	const f = await fixture('<div data-subject style="box-shadow:0 1px red">Shadow</div>');
	await f.page.evaluate(() => Reflect.set(window, "CSSStyleSheet", undefined));
	expect(await f.inspect("0 1px red")).toEqual([
		{ kind: "unknown", reason: "this shadow needs native declaration precision access" },
	]);
});
