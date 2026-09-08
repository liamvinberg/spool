import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { NativeFontResult } from "./property-fonts";

let browser: Browser;
let runtime: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/runtime/property-fonts.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyFonts",
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
	const inspect = (property: "font-family" | "font-variant-numeric", expectedValue: string) =>
		page.locator("[data-subject]").evaluateAll(
			(elements, { property, expectedValue }) => {
				const evaluator = Reflect.get(window, "PropertyFonts") as {
					nativeFont(
						element: Element,
						property: "font-family" | "font-variant-numeric",
						expectedValue: string,
					): NativeFontResult;
				};
				return elements.map((element) => evaluator.nativeFont(element, property, expectedValue));
			},
			{ property, expectedValue },
		);
	return { page, inspect };
}

it("compares complete independent native family lists and their inverse", async () => {
	const f = await fixture(
		`<div data-subject style="font-family:Arial,sans-serif">Native 125</div><div data-subject style="font-family:Georgia,serif">Native 125</div>`,
	);
	expect(await f.inspect("font-family", "Georgia, serif")).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
	expect(await f.inspect("font-family", "Arial, sans-serif")).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it.each([
	[
		"sans",
		'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
	],
	["serif", 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif'],
	["mono", 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'],
	["project", '"Project Face", "Fallback, Face", sans-serif'],
])("compares configured %s families without claiming a loaded face", async (_name, value) => {
	const f = await fixture('<div data-subject style="font-family:fantasy">Before</div><div data-subject>After</div>');
	await f.page
		.locator("[data-subject]")
		.nth(1)
		.evaluate((element, value) => {
			if (element instanceof HTMLElement) element.style.fontFamily = value;
		}, value!);
	const actualFamily = await f.page
		.locator("[data-subject]")
		.nth(1)
		.evaluate((element) => getComputedStyle(element).fontFamily);
	const hasPlatformAlias = _name === "sans" && actualFamily.includes('"system-ui"');
	expect(await f.inspect("font-family", value!)).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
		hasPlatformAlias
			? { kind: "unknown", reason: "this font family needs a native platform alias proof" }
			: { kind: "known", matches: true, observed: expect.any(String) },
	]);
	expect(await f.inspect("font-family", "fantasy")).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it.each([
	"ordinal",
	"slashed-zero",
	"lining-nums",
	"oldstyle-nums",
	"proportional-nums",
	"tabular-nums",
	"diagonal-fractions",
	"stacked-fractions",
	"ordinal slashed-zero oldstyle-nums tabular-nums stacked-fractions",
])("compares the full configured numeric feature %s and normal reset", async (value) => {
	const f = await fixture(
		`<div data-subject style="font-variant-numeric:normal">17th 0123 1/2</div><div data-subject style="font-variant-numeric:${value}">17th 0123 1/2</div>`,
	);
	expect(await f.inspect("font-variant-numeric", value)).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
	expect(await f.inspect("font-variant-numeric", "normal")).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it.each([
	{ actual: '"Times New Roman",serif', expected: "Times New Roman, serif" },
	{ actual: "Arial,sans-serif", expected: '"Arial", sans-serif' },
	{ actual: "Arial,sans-serif", expected: "ARIAL, SANS-SERIF" },
	{ actual: '"Project Face",sans-serif', expected: '"Project\\20 Face",sans-serif' },
	{ actual: '"Project Face",sans-serif', expected: "Project\\ Face,sans-serif" },
	{ actual: '"Fallback, Face",serif', expected: "'Fallback, Face', serif" },
])("preserves family quote and escape meaning $expected", async ({ actual, expected }) => {
	const f = await fixture("<div data-subject>Native text</div>");
	await f.page.locator("[data-subject]").evaluate((element, value) => {
		if (element instanceof HTMLElement) element.style.fontFamily = value;
	}, actual);
	expect(await f.inspect("font-family", expected)).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
});

it.each([
	{ actual: "Arial,serif", expected: "serif,Arial" },
	{ actual: '"serif",sans-serif', expected: "serif,sans-serif" },
	{ actual: '"Font 1000000",serif', expected: '"Font 1000001",serif' },
	{ actual: '"Face A",serif', expected: '"Face  A",serif' },
	{ actual: '"Fallback, Face",serif', expected: "Fallback,Face,serif" },
])("distinguishes exact family list semantics $expected", async ({ actual, expected }) => {
	const f = await fixture("<div data-subject>Native text</div>");
	await f.page.locator("[data-subject]").evaluate((element, value) => {
		if (element instanceof HTMLElement) element.style.fontFamily = value;
	}, actual);
	expect(await f.inspect("font-family", expected)).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it("preserves independent numeric companions while accepting grammar order", async () => {
	const f = await fixture(
		'<div data-subject style="font-variant-numeric:oldstyle-nums tabular-nums ordinal">17th 123</div>',
	);
	expect(await f.inspect("font-variant-numeric", "ordinal tabular-nums oldstyle-nums")).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
	expect(await f.inspect("font-variant-numeric", "ordinal proportional-nums oldstyle-nums")).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
	expect(await f.inspect("font-variant-numeric", "ordinal tabular-nums")).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it("matches exact decoded non-ASCII project family names", async () => {
	const f = await fixture('<div data-subject style="font-family:Ångström,serif">Native text</div>');
	expect(await f.inspect("font-family", '"Ångström", serif')).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
});

it("keeps differing Unicode family case spellings unknown", async () => {
	const f = await fixture('<div data-subject style="font-family:Straße,serif">Native text</div>');
	expect(await f.inspect("font-family", "STRASSE, serif")).toEqual([
		{ kind: "unknown", reason: "this font family needs a Unicode name comparison proof" },
	]);
});

it.each([
	{ property: "font-family" as const, value: "inherit" },
	{ property: "font-family" as const, value: "initial" },
	{ property: "font-family" as const, value: "revert-layer" },
	{ property: "font-family" as const, value: "var(--family)" },
	{ property: "font-family" as const, value: "first-valid(serif, sans-serif)" },
	{ property: "font-family" as const, value: "Arial,,serif" },
	{ property: "font-variant-numeric" as const, value: "inherit" },
	{ property: "font-variant-numeric" as const, value: "var(--features)" },
	{ property: "font-variant-numeric" as const, value: "ordinal ordinal" },
	{ property: "font-variant-numeric" as const, value: "oldstyle-nums lining-nums" },
	{ property: "font-variant-numeric" as const, value: "normal ordinal" },
	{ property: "font-variant-numeric" as const, value: "tabular-nums 0.0000005" },
])("refuses unresolved or unsupported $property $value", async ({ property, value }) => {
	const f = await fixture('<div data-subject style="font-family:serif;font-variant-numeric:normal">17th 1/2</div>');
	expect(await f.inspect(property, value)).toEqual([
		{ kind: "unknown", reason: "this font needs a resolved supported declaration" },
	]);
});

it("retains a quoted global-keyword family name", async () => {
	const f = await fixture("<div data-subject>Native text</div>");
	await f.page.locator("[data-subject]").evaluate((element) => {
		if (element instanceof HTMLElement) element.style.fontFamily = '"inherit", serif';
	});
	expect(await f.inspect("font-family", '"inherit", serif')).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
});

it.each([
	'<div data-subject style="display:none;font-family:serif">Text</div>',
	'<div data-subject style="visibility:hidden;font-family:serif">Text</div>',
	'<div style="content-visibility:hidden"><div data-subject style="font-family:serif">Text</div></div>',
	'<div data-subject style="font-family:serif;width:100px;height:30px"></div>',
	'<div data-subject style="font-family:serif"><span>Only descendant text</span></div>',
	'<input data-subject type="checkbox" style="font-family:serif" value="not rendered">',
	'<div data-subject style="font-family:serif;font-size:0">Text</div>',
])("refuses an unavailable direct native text context", async (markup) => {
	const f = await fixture(markup);
	expect(await f.inspect("font-family", "serif")).toEqual([
		{ kind: "unknown", reason: "this font needs a rendered native text context" },
	]);
});

it("refuses a detached text host", async () => {
	const f = await fixture("<div data-subject>Native text</div>");
	const result = await f.page.locator("[data-subject]").evaluate((element) => {
		element.remove();
		const evaluator = Reflect.get(window, "PropertyFonts") as {
			nativeFont(element: Element, property: "font-family", expectedValue: string): NativeFontResult;
		};
		return evaluator.nativeFont(element, "font-family", "serif");
	});
	expect(result).toEqual({ kind: "unknown", reason: "this font needs a rendered native text context" });
});

it("refuses numeric feature overrides without rejecting the configured family", async () => {
	const f = await fixture(
		`<div data-subject style='font-family:serif;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 0'>0123</div>`,
	);
	expect(await f.inspect("font-variant-numeric", "tabular-nums")).toEqual([
		{ kind: "unknown", reason: "this numeric font needs a feature override proof" },
	]);
	expect(await f.inspect("font-family", "serif")).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
});

it("refuses a pending real native font load without starting another request", async () => {
	const f = await fixture('<div data-subject style="font-family:PendingFace,serif">Native text</div>');
	const requests: string[] = [];
	await f.page.route("https://font.test/pending.woff2", (route) => {
		requests.push(route.request().url());
	});
	const pending = f.page.waitForRequest("https://font.test/pending.woff2");
	await f.page.evaluate(() => {
		const face = new FontFace("PendingFace", "url(https://font.test/pending.woff2)");
		document.fonts.add(face);
		void face.load().catch(() => {});
	});
	await pending;
	expect(await f.page.evaluate(() => document.fonts.status)).toBe("loading");
	expect(await f.inspect("font-family", "PendingFace, serif")).toEqual([
		{ kind: "unknown", reason: "this font needs a settled native loading context" },
	]);
	expect(requests).toHaveLength(1);
});

it("keeps an unavailable native parser unknown", async () => {
	const f = await fixture('<div data-subject style="font-family:serif">Native text</div>');
	await f.page.evaluate(() => Reflect.set(window, "CSSStyleSheet", undefined));
	expect(await f.inspect("font-family", "serif")).toEqual([
		{ kind: "unknown", reason: "the native font parser is unavailable" },
	]);
});

it("compares configured fonts without changing the document or active input", async () => {
	const f = await fixture(
		'<style>input { font-family:serif; font-variant-numeric:tabular-nums }</style><input data-subject value="kept text">',
	);
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
			family: getComputedStyle(input).fontFamily,
			numeric: getComputedStyle(input).fontVariantNumeric,
		});
		const before = snapshot();
		const mutations: MutationRecord[] = [];
		const observer = new MutationObserver((records) => mutations.push(...records));
		observer.observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
		const evaluator = Reflect.get(window, "PropertyFonts") as {
			nativeFont(
				element: Element,
				property: "font-family" | "font-variant-numeric",
				expectedValue: string,
			): NativeFontResult;
		};
		const outcomes = [
			evaluator.nativeFont(input, "font-family", "serif"),
			evaluator.nativeFont(input, "font-variant-numeric", "proportional-nums"),
			evaluator.nativeFont(input, "font-family", "var(--family)"),
		];
		await Promise.resolve();
		observer.disconnect();
		return { before, after: snapshot(), mutations: mutations.length, outcomes };
	});
	expect(result.after).toEqual(result.before);
	expect(result.mutations).toBe(0);
	expect(result.outcomes).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "unknown", reason: "this font needs a resolved supported declaration" },
	]);
});
