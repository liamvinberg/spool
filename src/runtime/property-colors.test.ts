import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { NativeColorComparison } from "./property-colors";

let browser: Browser;
let runtime: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/runtime/property-colors.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyColors",
	});
	runtime = result.outputFiles[0]!.text;
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(() => browser?.close(), 35_000);

type ColorEvaluator = {
	nativeColor(value: string): string | undefined;
	nativeColorComparison(expected: string, observed: string): NativeColorComparison;
};

async function fixture() {
	const page = await browser.newPage();
	onTestFinished(() => page.close(), 35_000);
	await page.setContent("<div data-subject>Colors</div>");
	await page.addScriptTag({ content: runtime });
	const admitted = (values: readonly string[]) =>
		page.evaluate((values) => {
			const evaluator = Reflect.get(window, "PropertyColors") as ColorEvaluator;
			return values.map((value) => evaluator.nativeColor(value));
		}, values);
	const compare = (pairs: readonly (readonly [string, string])[]) =>
		page.evaluate((pairs) => {
			const evaluator = Reflect.get(window, "PropertyColors") as ColorEvaluator;
			return pairs.map(([expected, observed]) => evaluator.nativeColorComparison(expected, observed));
		}, pairs);
	/** The native record of a declaration, read independently of the module under test. */
	const declared = (values: readonly string[]) =>
		page.evaluate((values) => {
			const probe = document.querySelector("[data-subject]") as HTMLElement;
			return values.map((value) => {
				probe.style.removeProperty("color");
				probe.style.setProperty("color", value);
				return probe.style.getPropertyValue("color");
			});
		}, values);
	return { page, admitted, compare, declared };
}

it.each([
	{ raw: "rgba(10,20,30,.5000005)", other: "rgba(10,20,30,.5)" },
	{ raw: "rgb(10.0000005 20 30)", other: "rgb(10 20 30)" },
	{ raw: "oklch(.5000005 .1 30)", other: "oklch(.5 .1 30)" },
	{ raw: "color(srgb .5000005 0 0)", other: "color(srgb .5 0 0)" },
	{ raw: "rgb(0 0 0/.0000005)", other: "rgb(0 0 0/0)" },
])("refuses an expected color the native record cannot distinguish $raw", async ({ raw, other }) => {
	const f = await fixture();
	const records = await f.declared([raw, other]);
	expect(records[0]).toBe(records[1]);
	expect(await f.admitted([raw, other])).toEqual([undefined, expect.any(String)]);
});

it("admits colors the native record keeps exactly", async () => {
	const f = await fixture();
	const values = [
		"red",
		"#0f8",
		"transparent",
		"rgb(18 52 86 / 25%)",
		"rgba(10, 20, 30, 0.5)",
		"oklch(63.7% 0.237 25.331)",
		"color(srgb 0 0 1)",
		"hsl(0 100% 50%)",
		"color-mix(in oklab, red 50%, transparent)",
	];
	expect(await f.admitted(values)).toEqual(values.map(() => expect.any(String)));
});

it("keeps unresolved and unsupported colors unadmitted", async () => {
	const f = await fixture();
	expect(await f.admitted(["currentColor", "inherit", "var(--brand)", "not-a-color"])).toEqual([
		undefined,
		undefined,
		undefined,
		undefined,
	]);
});

it("compares an independently supplied color against a native observed value", async () => {
	const f = await fixture();
	expect(
		await f.compare([
			["red", "rgb(255, 0, 0)"],
			["blue", "rgb(255, 0, 0)"],
			["#ff0000", "rgb(255, 0, 0)"],
			["transparent", "rgba(0, 0, 0, 0)"],
			["hsl(0 100% 50%)", "rgb(255, 0, 0)"],
			["rgb(18 52 86 / 25%)", "rgba(18, 52, 86, 0.25)"],
			["oklch(63.7% 0.237 25.331)", "oklch(0.637 0.237 25.331)"],
			["oklch(63.7% 0.237 25.331)", "oklch(0.623 0.214 259.815)"],
		]),
	).toEqual([
		{ kind: "known", matches: true },
		{ kind: "known", matches: false },
		{ kind: "known", matches: true },
		{ kind: "known", matches: true },
		{ kind: "known", matches: true },
		{ kind: "known", matches: true },
		{ kind: "known", matches: true },
		{ kind: "known", matches: false },
	]);
});

it("names why a comparison stays unknown", async () => {
	const f = await fixture();
	expect(
		await f.compare([
			["rgba(10,20,30,.5000005)", "rgba(10, 20, 30, 0.5)"],
			["currentColor", "rgb(255, 0, 0)"],
			["red", "currentcolor"],
			["color(srgb 1 0 0)", "rgb(255, 0, 0)"],
		]),
	).toEqual([
		{ kind: "unknown", reason: "imprecise" },
		{ kind: "unknown", reason: "unsupported" },
		{ kind: "unknown", reason: "unsupported" },
		{ kind: "unknown", reason: "space" },
	]);
});

it("compares without changing the document, its stylesheets or the active input", async () => {
	const f = await fixture();
	await f.page.setContent('<style>input { color: red }</style><input data-subject value="kept text">');
	await f.page.addScriptTag({ content: runtime });
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
			color: getComputedStyle(input).color,
		});
		const before = snapshot();
		const mutations: MutationRecord[] = [];
		const observer = new MutationObserver((records) => mutations.push(...records));
		observer.observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
		const evaluator = Reflect.get(window, "PropertyColors") as ColorEvaluator;
		const outcomes = [
			evaluator.nativeColorComparison("red", getComputedStyle(input).color),
			evaluator.nativeColorComparison("blue", getComputedStyle(input).color),
			evaluator.nativeColorComparison("rgb(255 0 0/.0000005)", getComputedStyle(input).color),
		];
		await Promise.resolve();
		observer.disconnect();
		return { before, after: snapshot(), mutations: mutations.length, outcomes };
	});
	expect(result.after).toEqual(result.before);
	expect(result.mutations).toBe(0);
	expect(result.outcomes).toEqual([
		{ kind: "known", matches: true },
		{ kind: "known", matches: false },
		{ kind: "unknown", reason: "imprecise" },
	]);
});
