import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { NativeGradientResult } from "./property-gradients";

let browser: Browser;
let runtime: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/runtime/property-gradients.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyGradients",
	});
	runtime = result.outputFiles[0]!.text;
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(() => browser?.close(), 35_000);

const red = "oklch(0.637 0.237 25.331)",
	blue = "oklch(0.623 0.214 259.815)",
	green = "oklch(0.723 0.219 149.579)";

/** The retained `bg-linear-to-r from-* to-*` utilities, as Tailwind 4.3 compiles them. */
const utilities = `
@property --tw-gradient-position { syntax: "*"; inherits: false }
@property --tw-gradient-from { syntax: "<color>"; inherits: false; initial-value: #0000 }
@property --tw-gradient-to { syntax: "<color>"; inherits: false; initial-value: #0000 }
@property --tw-gradient-stops { syntax: "*"; inherits: false }
@property --tw-gradient-via-stops { syntax: "*"; inherits: false }
@property --tw-gradient-from-position { syntax: "<length-percentage>"; inherits: false; initial-value: 0% }
@property --tw-gradient-to-position { syntax: "<length-percentage>"; inherits: false; initial-value: 100% }
.bg-linear-to-r { --tw-gradient-position: to right; background-image: linear-gradient(var(--tw-gradient-stops)) }
@supports (background-image: linear-gradient(in lab, red, red)) {
	.bg-linear-to-r.interpolated { --tw-gradient-position: to right in oklab }
}
.from-red-500 { --tw-gradient-from: ${red}; --tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position)) }
.to-blue-500 { --tw-gradient-to: ${blue}; --tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position)) }
`;

async function fixture(markup: string) {
	const page = await browser.newPage();
	onTestFinished(() => page.close(), 35_000);
	await page.setContent(markup);
	await page.addScriptTag({ content: runtime });
	const inspect = (expectedValue: string) =>
		page.locator("[data-subject]").evaluateAll((elements, expectedValue) => {
			const evaluator = Reflect.get(window, "PropertyGradients") as {
				nativeGradient(element: Element, expectedValue: string): NativeGradientResult;
			};
			return elements.map((element) => evaluator.nativeGradient(element, expectedValue));
		}, expectedValue);
	const computed = () =>
		page
			.locator("[data-subject]")
			.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundImage));
	return { page, inspect, computed };
}

const box = "width:120px;height:60px";

it("compares the compiled retained gradient against its native use and inverse", async () => {
	const f = await fixture(
		`<style>${utilities}</style><div data-subject class="bg-linear-to-r from-red-500 to-blue-500" style="${box}">Retained</div>`,
	);
	expect(await f.computed()).toEqual([`linear-gradient(to right, ${red} 0%, ${blue} 100%)`]);
	expect(await f.inspect(`linear-gradient(to right, ${red} 0%, ${blue} 100%)`)).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
	for (const different of [
		`linear-gradient(to right, ${green} 0%, ${blue} 100%)`,
		`linear-gradient(to left, ${red} 0%, ${blue} 100%)`,
		`linear-gradient(to right, ${red} 10%, ${blue} 100%)`,
		`linear-gradient(to right, ${red} 0%, ${green} 50%, ${blue} 100%)`,
	])
		expect(await f.inspect(different)).toEqual([{ kind: "known", matches: false, observed: expect.any(String) }]);
});

it("refuses the compiled interpolation-space branch this engine does not keep", async () => {
	const f = await fixture(
		`<style>${utilities}</style><div data-subject class="bg-linear-to-r interpolated from-red-500 to-blue-500" style="${box}">Interpolated</div>`,
	);
	const supported = await f.page.evaluate(() => CSS.supports("background-image", "linear-gradient(in lab, red, red)"));
	expect(supported).toBe(true);
	// The substituted computed value drops `in oklab`, so an equal reading would not be a proof.
	expect(await f.computed()).toEqual([`linear-gradient(to right, ${red} 0%, ${blue} 100%)`]);
	expect(await f.inspect(`linear-gradient(to right in oklab, ${red} 0%, ${blue} 100%)`)).toEqual([
		{ kind: "unknown", reason: "this gradient needs a native interpolation space proof" },
	]);
});

it("refuses an interpolation space the native use itself carries", async () => {
	const f = await fixture(
		`<div data-subject style="${box};background-image:linear-gradient(to right in oklab, red, blue)">Native space</div>`,
	);
	expect(await f.computed()).toEqual(["linear-gradient(to right in oklab, rgb(255, 0, 0), rgb(0, 0, 255))"]);
	expect(await f.inspect("linear-gradient(to right, red, blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient needs a native interpolation space proof" },
	]);
});

it("compares angles, corners and the omitted direction as the engine records them", async () => {
	const f = await fixture(
		`<div data-subject style="${box};background-image:linear-gradient(45deg, red 10%, blue 90%)">Angle</div>` +
			`<div data-subject style="${box};background-image:linear-gradient(to bottom right, red, blue)">Corner</div>` +
			`<div data-subject style="${box};background-image:linear-gradient(red, blue)">Default</div>`,
	);
	expect(await f.computed()).toEqual([
		"linear-gradient(45deg, rgb(255, 0, 0) 10%, rgb(0, 0, 255) 90%)",
		"linear-gradient(to right bottom, rgb(255, 0, 0), rgb(0, 0, 255))",
		"linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))",
	]);
	expect(await f.inspect("linear-gradient(45deg, red 10%, blue 90%)")).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
	expect(await f.inspect("linear-gradient(to bottom right, red, blue)")).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
	expect(await f.inspect("linear-gradient(to bottom, red, blue)")).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
});

it("compares stop positions in their own native unit", async () => {
	const f = await fixture(
		`<div data-subject style="${box};background-image:linear-gradient(to right, red 10px, blue 40px)">Lengths</div>`,
	);
	expect(await f.inspect("linear-gradient(to right, red 10px, blue 40px)")).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
	for (const different of [
		"linear-gradient(to right, red 10%, blue 40px)",
		"linear-gradient(to right, red 11px, blue 40px)",
		"linear-gradient(to right, red, blue 40px)",
	])
		expect(await f.inspect(different)).toEqual([{ kind: "known", matches: false, observed: expect.any(String) }]);
});

it("keeps an expected position the native record cannot distinguish unknown", async () => {
	const f = await fixture(
		`<div data-subject style="${box};background-image:linear-gradient(to right, red 10.0000005%, blue)">Self</div>` +
			`<div data-subject style="${box};background-image:linear-gradient(to right, red 10%, blue)">Other</div>`,
	);
	const native = await f.computed();
	expect(native[0]).toBe(native[1]);
	expect(await f.inspect("linear-gradient(to right, red 10.0000005%, blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient needs observable native numeric precision" },
		{ kind: "unknown", reason: "this gradient needs observable native numeric precision" },
	]);
});

it("keeps an expected stop color the native record cannot distinguish unknown", async () => {
	const f = await fixture(
		`<div data-subject style="${box};background-image:linear-gradient(to right, rgba(10,20,30,.5000005), blue)">Colors</div>`,
	);
	expect(await f.inspect("linear-gradient(to right, rgba(10,20,30,.5000005), blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient needs observable native color precision" },
	]);
});

it("refuses a stop color the caller has not resolved", async () => {
	const f = await fixture(
		`<div data-subject style="${box};color:red;background-image:linear-gradient(to right, currentColor, blue)">Current</div>`,
	);
	expect(await f.inspect("linear-gradient(to right, currentColor, blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient needs a resolved supported color" },
	]);
	expect(await f.inspect("linear-gradient(to right, red, blue)")).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
});

it.each([
	{ form: "a repeating gradient", style: "background-image:repeating-linear-gradient(to right, red, blue)" },
	{ form: "a radial gradient", style: "background-image:radial-gradient(red, blue)" },
	{ form: "no image", style: "background-color:red" },
])("refuses $form", async ({ style }) => {
	const f = await fixture(`<div data-subject style="${box};${style}">Other image</div>`);
	expect(await f.inspect("linear-gradient(to right, red, blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient needs a resolved supported linear declaration" },
	]);
});

it("refuses more than one native image layer", async () => {
	const f = await fixture(
		`<div data-subject style="${box};background-image:linear-gradient(to right, red, blue), linear-gradient(red, blue)">Layers</div>`,
	);
	expect(await f.inspect("linear-gradient(to right, red, blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient needs a single native image layer" },
	]);
	expect(await f.inspect("linear-gradient(to right, red, blue), linear-gradient(red, blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient needs a single native image layer" },
	]);
});

it.each([
	{ form: "an expression position", value: "linear-gradient(to right, red calc(10% + 2px), blue)" },
	{ form: "a color hint", value: "linear-gradient(to right, red, 30%, blue)" },
	{ form: "a double position stop", value: "linear-gradient(to right, red 10% 40%, blue)" },
	{ form: "a turn angle", value: "linear-gradient(0.25turn, red, blue)" },
])("refuses $form this comparison does not represent", async ({ value }) => {
	const f = await fixture(`<div data-subject style="${box};background-image:${value}">Unrepresented</div>`);
	expect(await f.inspect(value)).toEqual([
		{ kind: "unknown", reason: "this gradient needs a resolved supported linear declaration" },
	]);
});

it.each([
	`<div data-subject style="display:none;background-image:linear-gradient(to right, red, blue)">Hidden</div>`,
	`<div data-subject style="${box};visibility:hidden;background-image:linear-gradient(to right, red, blue)">Invisible</div>`,
	`<div style="content-visibility:hidden"><div data-subject style="${box};background-image:linear-gradient(to right, red, blue)">Skipped</div></div>`,
])("refuses a gradient without a rendered host", async (markup) => {
	const f = await fixture(markup);
	expect(await f.inspect("linear-gradient(to right, red, blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient has no rendered native host" },
	]);
});

it("refuses a detached host", async () => {
	const f = await fixture(
		`<div data-subject style="${box};background-image:linear-gradient(to right, red, blue)">Detached</div>`,
	);
	const result = await f.page.locator("[data-subject]").evaluate((element) => {
		element.remove();
		const evaluator = Reflect.get(window, "PropertyGradients") as {
			nativeGradient(element: Element, expectedValue: string): NativeGradientResult;
		};
		return evaluator.nativeGradient(element, "linear-gradient(to right, red, blue)");
	});
	expect(result).toEqual({ kind: "unknown", reason: "this gradient has no rendered native host" });
});

it("refuses a non-HTML gradient host", async () => {
	const f = await fixture(
		'<svg width="120" height="60"><rect data-subject width="100" height="40" style="background-image:linear-gradient(to right, red, blue)" /></svg>',
	);
	expect(await f.inspect("linear-gradient(to right, red, blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient needs a proven native paint context" },
	]);
});

it("refuses forced gradient colors", async () => {
	const f = await fixture(
		`<div data-subject style="${box};background-image:linear-gradient(to right, red, blue)">Forced</div>`,
	);
	await f.page.emulateMedia({ forcedColors: "active" });
	expect(await f.inspect("linear-gradient(to right, red, blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient needs an unforced native color context" },
	]);
});

it("compares without changing document, stylesheets or the active input", async () => {
	const f = await fixture(
		'<style>input { background-image: linear-gradient(to right, red, blue) }</style><input data-subject value="kept text">',
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
			image: getComputedStyle(input).backgroundImage,
		});
		const before = snapshot();
		const mutations: MutationRecord[] = [];
		const observer = new MutationObserver((records) => mutations.push(...records));
		observer.observe(document, { subtree: true, attributes: true, childList: true, characterData: true });
		const evaluator = Reflect.get(window, "PropertyGradients") as {
			nativeGradient(element: Element, expectedValue: string): NativeGradientResult;
		};
		const outcomes = [
			"linear-gradient(to right, red, blue)",
			"linear-gradient(to left, red, blue)",
			"linear-gradient(to right in oklab, red, blue)",
		].map((value) => evaluator.nativeGradient(input, value));
		await Promise.resolve();
		observer.disconnect();
		return { before, after: snapshot(), mutations: mutations.length, outcomes };
	});
	expect(result.after).toEqual(result.before);
	expect(result.mutations).toBe(0);
	expect(result.outcomes).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
		{ kind: "unknown", reason: "this gradient needs a native interpolation space proof" },
	]);
});

it("names a mixed stop color, not an interpolation space, when the spaces cannot be compared", async () => {
	const f = await fixture(
		`<div data-subject style="${box};background-image:linear-gradient(to right, color-mix(in oklab, red 50%, blue), blue)">Mixed stop</div>`,
	);
	expect(await f.inspect("linear-gradient(to right, color-mix(in oklab, red 50%, blue), blue)")).toEqual([
		{ kind: "unknown", reason: "this gradient needs an exact native color-space comparison" },
	]);
});
