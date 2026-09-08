import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { NativeFilterResult } from "./property-filters";

let browser: Browser;
let runtime: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/runtime/property-filters.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyFilters",
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
			const evaluator = Reflect.get(window, "PropertyFilters") as {
				nativeFilter(element: Element, expectedValue: string): NativeFilterResult;
			};
			return elements.map((element) => evaluator.nativeFilter(element, expectedValue));
		}, expectedValue);
	return { page, inspect };
}

it("compares an independently supplied brightness percentage against each native use", async () => {
	const f = await fixture(
		'<div data-subject style="filter:brightness(.25)">Before</div><div data-subject style="filter:brightness(.5)">After</div>',
	);
	expect(await f.inspect("brightness(50%)")).toEqual([
		{ kind: "known", matches: false, observed: "brightness(0.25)" },
		{ kind: "known", matches: true, observed: "brightness(0.5)" },
	]);
	expect(await f.inspect("brightness(.25)")).toEqual([
		{ kind: "known", matches: true, observed: "brightness(0.25)" },
		{ kind: "known", matches: false, observed: "brightness(0.5)" },
	]);
});

it.each([
	{ row: "contrast", before: "contrast(.25)", after: "contrast(.5)" },
	{ row: "saturate", before: "saturate(.25)", after: "saturate(.5)" },
	{ row: "hue rotation", before: "hue-rotate(2deg)", after: "hue-rotate(4deg)" },
	{ row: "grayscale option", before: "none", after: "grayscale(1)" },
	{ row: "invert option", before: "none", after: "invert(1)" },
	{ row: "sepia option", before: "none", after: "sepia(1)" },
	{ row: "extra small blur", before: "none", after: "blur(4px)" },
	{ row: "small blur", before: "none", after: "blur(8px)" },
	{ row: "medium blur", before: "none", after: "blur(12px)" },
	{ row: "large blur", before: "none", after: "blur(16px)" },
	{ row: "extra large blur", before: "none", after: "blur(24px)" },
	{
		row: "ordered companions",
		before: "brightness(.25) grayscale(.75) blur(4px)",
		after: "brightness(.5) grayscale(.75) blur(4px)",
	},
])("compares original and inverse native $row values", async ({ before, after }) => {
	const f = await fixture(
		`<div data-subject style="filter:${before}">Before</div><div data-subject style="filter:${after}">After</div>`,
	);
	const original = await f.page
		.locator("[data-subject]")
		.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).filter));
	expect(original[0]).not.toBe(original[1]);
	expect(await f.inspect(after)).toEqual([
		{ kind: "known", matches: false, observed: original[0] },
		{ kind: "known", matches: true, observed: original[1] },
	]);
	expect(await f.inspect(before)).toEqual([
		{ kind: "known", matches: true, observed: original[0] },
		{ kind: "known", matches: false, observed: original[1] },
	]);
});

it.each([
	{ actual: "brightness(0) contrast(1.25) saturate(.125)", expected: "brightness(0%) contrast(125%) saturate(12.5%)" },
	{ actual: "grayscale(.25) invert(.5) sepia(.75)", expected: "grayscale(25%) invert(50%) sepia(75%)" },
	{
		actual: "brightness(1) contrast(1) saturate(1) grayscale(1) invert(1) sepia(1) hue-rotate(0deg) blur(0px)",
		expected: "brightness() contrast() saturate() grayscale() invert() sepia() hue-rotate() blur()",
	},
	{ actual: "hue-rotate(-2.5deg) blur(.125px)", expected: "hue-rotate(-2.50deg) blur(0.125px)" },
	{ actual: "grayscale(1) invert(1) sepia(1)", expected: "grayscale(150%) invert(2) sepia(200%)" },
])(
	"normalizes supported native arguments without changing function identity: $expected",
	async ({ actual, expected }) => {
		const f = await fixture(`<div data-subject style="filter:${actual}">Native value</div>`);
		expect(await f.inspect(expected)).toEqual([{ kind: "known", matches: true, observed: expect.any(String) }]);
	},
);

it.each([
	{ actual: "brightness(.5) contrast(.25)", expected: "contrast(.25) brightness(.5)" },
	{ actual: "brightness(.5) grayscale(.75)", expected: "brightness(.5) grayscale(.25)" },
	{ actual: "brightness(.5) brightness(.5)", expected: "brightness(.5)" },
	{ actual: "brightness(1)", expected: "none" },
	{ actual: "hue-rotate(360deg)", expected: "hue-rotate(0deg)" },
	{ actual: "brightness(0.0000005)", expected: "brightness(0)" },
	{ actual: "brightness(.5)", expected: "brightness(.5000005)" },
	{ actual: "hue-rotate(0.0000005deg)", expected: "hue-rotate(0deg)" },
	{ actual: "blur(0.0000005px)", expected: "blur(0px)" },
])("retains ordered, companion and native precision mismatches: $expected", async ({ actual, expected }) => {
	const f = await fixture(`<div data-subject style="filter:${actual}">Native value</div>`);
	expect(await f.inspect(expected)).toEqual([{ kind: "known", matches: false, observed: expect.any(String) }]);
});

it.each([
	"url(#outside)",
	"drop-shadow(1px 1px black)",
	"opacity(.5)",
	"blur(1em)",
	"blur(1cm)",
	"blur(20%)",
	"hue-rotate(1rad)",
	"hue-rotate(.25turn)",
	"brightness(var(--brightness))",
	"brightness(calc(.25 + .25))",
	"inherit",
	"revert",
	"initial",
	"brightness(-1)",
	"blur(-1px)",
])("refuses unresolved or unsupported expected filter %s", async (expected) => {
	const f = await fixture('<div data-subject style="filter:brightness(.5)">Native value</div>');
	expect(await f.inspect(expected)).toEqual([
		{ kind: "unknown", reason: "this filter needs a resolved supported declaration" },
	]);
});

it("refuses an unsupported actual filter companion", async () => {
	const f = await fixture('<div data-subject style="filter:brightness(.5) url(#missing)">Native value</div>');
	expect(await f.inspect("brightness(.5)")).toEqual([
		{ kind: "unknown", reason: "this filter needs a resolved supported declaration" },
	]);
});

it.each([
	'<div data-subject style="display:none;filter:brightness(.5)">Hidden</div>',
	'<div data-subject style="visibility:hidden;filter:brightness(.5)">Hidden</div>',
	'<div style="content-visibility:hidden"><div data-subject style="filter:brightness(.5)">Skipped</div></div>',
])("refuses a filter with no rendered native host", async (markup) => {
	const f = await fixture(markup);
	expect(await f.inspect("brightness(.5)")).toEqual([
		{ kind: "unknown", reason: "this filter has no rendered native host" },
	]);
});

it("refuses a blur without a zoom context proof", async () => {
	const f = await fixture('<div style="zoom:2"><div data-subject style="filter:blur(4px)">Zoomed blur</div></div>');
	expect(await f.inspect("blur(4px)")).toEqual([
		{ kind: "unknown", reason: "this blur needs an unscaled native length context" },
	]);
});

it("does not impose blur length context on dimensionless brightness", async () => {
	const f = await fixture(
		'<div style="zoom:2"><div data-subject style="filter:brightness(.5)">Zoomed brightness</div></div>',
	);
	expect(await f.inspect("brightness(.5)")).toEqual([{ kind: "known", matches: true, observed: "brightness(0.5)" }]);
});

it("refuses an SVG filter host without applicability proof", async () => {
	const f = await fixture('<svg><rect data-subject width="40" height="40" style="filter:brightness(.5)"/></svg>');
	expect(await f.inspect("brightness(.5)")).toEqual([
		{ kind: "unknown", reason: "this filter needs an HTML native host proof" },
	]);
});

it("refuses a detached element even when its retained style declares a matching filter", async () => {
	const f = await fixture('<div data-subject style="filter:brightness(.5)">Detached value</div>');
	const result = await f.page.locator("[data-subject]").evaluate((element) => {
		element.remove();
		const evaluator = Reflect.get(window, "PropertyFilters") as {
			nativeFilter(element: Element, expectedValue: string): NativeFilterResult;
		};
		return evaluator.nativeFilter(element, "brightness(.5)");
	});
	expect(result).toEqual({ kind: "unknown", reason: "this filter needs a connected native document context" });
});

it("preserves DOM, native filters, stylesheets and live input state across matches and refusals", async () => {
	const f = await fixture(
		'<style>.filtered {filter:brightness(.5) grayscale(.75) blur(4px)}</style><div data-subject class="filtered"><input value="initial"/></div>',
	);
	const before = await f.page.evaluate(() => {
		const input = document.querySelector("input")!;
		input.focus();
		input.value = "retained filter input";
		input.setSelectionRange(2, 5);
		Reflect.set(window, "filterInput", input);
		const mutations: MutationRecord[] = [];
		new MutationObserver((records) => mutations.push(...records)).observe(document.documentElement, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true,
		});
		Reflect.set(window, "filterMutations", mutations);
		return {
			html: document.documentElement.outerHTML,
			sheets: document.styleSheets.length,
			adopted: document.adoptedStyleSheets.length,
			filter: getComputedStyle(document.querySelector("[data-subject]")!).filter,
		};
	});
	expect(await f.inspect("brightness(50%) grayscale(75%) blur(4px)")).toEqual([
		{ kind: "known", matches: true, observed: before.filter },
	]);
	expect(await f.inspect("brightness(.25) grayscale(.75) blur(4px)")).toEqual([
		{ kind: "known", matches: false, observed: before.filter },
	]);
	expect(await f.inspect("brightness(var(--outside))")).toEqual([
		{ kind: "unknown", reason: "this filter needs a resolved supported declaration" },
	]);
	expect(
		await f.page.evaluate(() => {
			const input = document.querySelector("input")!;
			return {
				html: document.documentElement.outerHTML,
				sheets: document.styleSheets.length,
				adopted: document.adoptedStyleSheets.length,
				filter: getComputedStyle(document.querySelector("[data-subject]")!).filter,
				input: [
					input === Reflect.get(window, "filterInput"),
					document.activeElement === input,
					input.value,
					input.selectionStart,
					input.selectionEnd,
				],
				mutations: Reflect.get(window, "filterMutations").length,
			};
		}),
	).toEqual({ ...before, input: [true, true, "retained filter input", 2, 5], mutations: 0 });
});
