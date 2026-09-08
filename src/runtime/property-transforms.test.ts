import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { NativeTransformProperty, NativeTransformResult } from "./property-transforms";

let browser: Browser;
let runtime: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/runtime/property-transforms.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyTransforms",
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
	const inspect = (property: NativeTransformProperty, expectedValue: string) =>
		page.locator("[data-subject]").evaluateAll(
			(elements, { property, expectedValue }) => {
				const evaluator = Reflect.get(window, "PropertyTransforms") as {
					nativeTransform(
						element: Element,
						property: NativeTransformProperty,
						expectedValue: string,
					): NativeTransformResult;
				};
				return elements.map((element) => evaluator.nativeTransform(element, property, expectedValue));
			},
			{ property, expectedValue },
		);
	return { page, inspect };
}

it.each([
	{ row: "scale", property: "scale", before: ".25", after: ".5" },
	{ row: "scale-x", property: "scale", before: ".25 .75 1.25", after: ".5 .75 1.25" },
	{ row: "scale-y", property: "scale", before: ".75 .25 1.25", after: ".75 .5 1.25" },
	{ row: "rotate", property: "rotate", before: "2deg", after: "4deg" },
	{
		row: "rotate-x",
		property: "transform",
		before: "rotateX(2deg) rotateY(13deg) skewX(3deg)",
		after: "rotateX(4deg) rotateY(13deg) skewX(3deg)",
	},
	{
		row: "rotate-y",
		property: "transform",
		before: "rotateX(13deg) rotateY(2deg) skewX(3deg)",
		after: "rotateX(13deg) rotateY(4deg) skewX(3deg)",
	},
	{
		row: "skew",
		property: "transform",
		before: "rotateX(3deg) skewX(2deg) skewY(2deg)",
		after: "rotateX(3deg) skewX(4deg) skewY(4deg)",
	},
	{ row: "skew-x", property: "transform", before: "skewX(2deg) skewY(7deg)", after: "skewX(4deg) skewY(7deg)" },
	{ row: "skew-y", property: "transform", before: "skewX(7deg) skewY(2deg)", after: "skewX(7deg) skewY(4deg)" },
	{ row: "translate", property: "translate", before: "8px 8px", after: "16px 16px" },
	{ row: "translate-x", property: "translate", before: "8px -3px 2px", after: "16px -3px 2px" },
	{ row: "translate-y", property: "translate", before: "-3px 8px 2px", after: "-3px 16px 2px" },
] as const)("compares $row with independently supplied preserved axes and inverse", async (row) => {
	const subject = (value: string) =>
		`<div data-subject style="width:100px;height:40px;${row.property}:${value}">Native transform</div>`;
	const f = await fixture(subject(row.after) + subject(row.before));
	const before = await f.page
		.locator("[data-subject]")
		.evaluateAll(
			(elements, property) => elements.map((element) => getComputedStyle(element).getPropertyValue(property)),
			row.property,
		);
	expect(before[0]).not.toBe(before[1]);
	expect(await f.inspect(row.property, row.after)).toEqual([
		{ kind: "known", matches: true, observed: before[0] },
		{ kind: "known", matches: false, observed: before[1] },
	]);
	expect(await f.inspect(row.property, row.before)).toEqual([
		{ kind: "known", matches: false, observed: before[0] },
		{ kind: "known", matches: true, observed: before[1] },
	]);
});

it.each([
	{ property: "scale", expected: "0 -25% 150%", actual: "0 -.25 1.5" },
	{ property: "scale", expected: "none", actual: "1 1 1" },
	{ property: "rotate", expected: "-.125turn", actual: "-45deg" },
	{ property: "rotate", expected: "x 90deg", actual: "2 0 0 100grad" },
	{ property: "rotate", expected: "none", actual: "0deg" },
	{ property: "translate", expected: "-0.125in 2.5px 0px", actual: "-12px 2.5px" },
	{ property: "translate", expected: "none", actual: "0px 0px 0px" },
	{
		property: "transform",
		expected: "rotate(90deg) translateX(-2.5px) scale(-.25,0)",
		actual: "matrix(0, -.25, 0, 0, 0, -2.5)",
	},
	{ property: "transform", expected: "none", actual: "matrix(1,0,0,1,0,0)" },
] as const)("normalizes equivalent absolute $property syntax including zero and negative values", async (row) => {
	const f = await fixture(
		`<div data-subject style="width:100px;height:40px;${row.property}:${row.actual}">Native value</div>`,
	);
	expect(await f.inspect(row.property, row.expected)).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
	]);
});

it.each([
	{ property: "scale", expected: ".5 .75", actual: ".5 .25" },
	{ property: "rotate", expected: "x 4deg", actual: "y 4deg" },
	{ property: "translate", expected: "16px -3px 2px", actual: "16px -3px 7px" },
	{ property: "transform", expected: "rotateX(4deg) rotateY(13deg)", actual: "rotateX(4deg) rotateY(3deg)" },
	{ property: "transform", expected: "translateX(10px) scale(2)", actual: "scale(2) translateX(10px)" },
	{ property: "scale", expected: ".5001", actual: ".5" },
	{ property: "transform", expected: "translateX(0.0000005px)", actual: "none" },
	{ property: "translate", expected: "0.0000005px", actual: "0px" },
	{ property: "transform", expected: "rotate(0.00001deg)", actual: "rotate(0.00002deg)" },
	{ property: "rotate", expected: "0.00001deg", actual: "0.00002deg" },
] as const)("does not ignore independent axes, function order or a real $property mismatch", async (row) => {
	const f = await fixture(
		`<div data-subject style="width:100px;height:40px;${row.property}:${row.actual}">Native value</div>`,
	);
	expect(await f.inspect(row.property, row.expected)).toEqual([
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});

it.each([
	{ property: "scale", expected: "var(--factor)" },
	{ property: "rotate", expected: "inherit" },
	{ property: "translate", expected: "initial" },
	{ property: "transform", expected: "revert" },
	{ property: "translate", expected: "50% 0px" },
	{ property: "translate", expected: "1em 0px" },
	{ property: "transform", expected: "translateX(50%)" },
	{ property: "transform", expected: "translateX(1em)" },
	{ property: "transform", expected: "var(--transform)" },
] as const)("keeps unresolved or relative-box $property expectations unknown: $expected", async (row) => {
	const f = await fixture(
		'<div data-subject style="width:100px;height:40px;--factor:1;--transform:none">Native value</div>',
	);
	expect(await f.inspect(row.property, row.expected)).toEqual([
		{ kind: "unknown", reason: "this transform needs a resolved absolute declaration" },
	]);
});

it("does not resolve a native percentage translation by borrowing the current box", async () => {
	const f = await fixture('<div data-subject style="width:100px;height:40px;translate:50%">Native value</div>');
	expect(await f.inspect("translate", "50px")).toEqual([
		{ kind: "unknown", reason: "this native transform needs a resolved absolute value" },
	]);
});

it.each([
	{ ancestor: "zoom:2", reason: "this transform needs a zoom context proof" },
	{ ancestor: "perspective:500px", reason: "this transform needs a perspective context proof" },
	{ ancestor: "transform:perspective(500px)", reason: "this transform needs a finite affine native context proof" },
] as const)("keeps unproved ancestor context unknown: $ancestor", async (row) => {
	const f = await fixture(
		`<section style="${row.ancestor}"><div data-subject style="width:100px;height:40px;scale:.5">Native value</div></section>`,
	);
	expect(await f.inspect("scale", ".5")).toEqual([{ kind: "unknown", reason: row.reason }]);
});

it("does not compare a perspective expectation as an affine transform", async () => {
	const f = await fixture('<div data-subject style="width:100px;height:40px">Native value</div>');
	expect(await f.inspect("transform", "perspective(500px)")).toEqual([
		{ kind: "unknown", reason: "this transform needs a finite affine matrix proof" },
	]);
});

it.each([
	{
		markup: '<span data-subject style="transform:rotate(4deg)">Inline</span>',
		reason: "this native box is not a proven transformable host",
	},
	{
		markup: '<div data-subject style="display:none;transform:rotate(4deg)">Hidden</div>',
		reason: "this transform has no rendered native host",
	},
	{
		markup: '<svg width="100" height="40"><rect data-subject width="40" height="20"/></svg>',
		reason: "this transform needs an HTML reference-box proof",
	},
] as const)("requires an applicable rendered HTML box: $markup", async (row) => {
	const f = await fixture(row.markup);
	expect(await f.inspect("transform", "rotate(4deg)")).toEqual([{ kind: "unknown", reason: row.reason }]);
});

it("leaves the live document, native input and other transform properties untouched", async () => {
	const f = await fixture(
		'<div data-subject style="width:100px;height:40px;scale:.5 .75;rotate:13deg;translate:-2.5px 3px;transform:skewX(4deg)"><input value="initial"/></div>',
	);
	const before = await f.page.evaluate(() => {
		const input = document.querySelector("input")!;
		input.focus();
		input.value = "retained transform input";
		input.setSelectionRange(2, 5);
		Reflect.set(window, "transformInput", input);
		const mutations: MutationRecord[] = [];
		new MutationObserver((records) => mutations.push(...records)).observe(document.documentElement, {
			childList: true,
			attributes: true,
			characterData: true,
			subtree: true,
		});
		Reflect.set(window, "transformMutations", mutations);
		const element = document.querySelector("[data-subject]")!;
		const style = getComputedStyle(element);
		return {
			html: document.documentElement.outerHTML,
			sheets: document.styleSheets.length,
			adopted: document.adoptedStyleSheets.length,
			values: [style.scale, style.rotate, style.translate, style.transform],
		};
	});
	for (const [property, value] of [
		["scale", ".5 .75"],
		["rotate", "13deg"],
		["translate", "-2.5px 3px"],
		["transform", "skewX(4deg)"],
	] as const)
		expect(await f.inspect(property, value)).toEqual([
			{ kind: "known", matches: true, observed: expect.any(String) },
		]);
	expect(
		await f.page.evaluate(() => {
			const input = document.querySelector("input")!;
			const style = getComputedStyle(document.querySelector("[data-subject]")!);
			return {
				html: document.documentElement.outerHTML,
				sheets: document.styleSheets.length,
				adopted: document.adoptedStyleSheets.length,
				values: [style.scale, style.rotate, style.translate, style.transform],
				input: [
					input === Reflect.get(window, "transformInput"),
					document.activeElement === input,
					input.value,
					input.selectionStart,
					input.selectionEnd,
				],
				mutations: Reflect.get(window, "transformMutations").length,
			};
		}),
	).toEqual({ ...before, input: [true, true, "retained transform input", 2, 5], mutations: 0 });
});

it("does not borrow rounded matrix text when Typed OM access is unavailable", async () => {
	const f = await fixture(
		'<div data-subject style="width:100px;height:40px;transform:rotate(4deg)">Native value</div>',
	);
	await f.page.locator("[data-subject]").evaluate((element) => {
		// Only this instance loses the optional API; its real computed CSS remains available.
		Object.defineProperty(element, "computedStyleMap", { value: undefined });
	});
	expect(await f.inspect("transform", "rotate(4deg)")).toEqual([
		{ kind: "unknown", reason: "this native transform needs Typed OM matrix access" },
	]);
});

it("requires actual Typed OM conversion for a box-relative transform", async () => {
	const f = await fixture(
		'<div data-subject style="width:100px;height:40px;transform:translateX(50%)">Native value</div>',
	);
	expect(await f.inspect("transform", "translateX(50px)")).toEqual([
		{ kind: "unknown", reason: "this native transform needs an absolute Typed OM matrix proof" },
	]);
});

it.each([
	{ property: "rotate", value: "1rad" },
	{ property: "translate", value: "1cm" },
] as const)("keeps imprecise native cross-unit $property readings unknown", async (row) => {
	const f = await fixture(
		`<div data-subject style="width:100px;height:40px;${row.property}:${row.value}">Native value</div>`,
	);
	expect(await f.inspect(row.property, row.value)).toEqual([
		{ kind: "unknown", reason: "this absolute unit conversion needs a more precise native longhand value" },
	]);
});

it.each([
	{ property: "scale", expected: ".5000005", other: ".5" },
	{ property: "rotate", expected: ".5000005deg", other: ".5deg" },
	{ property: "translate", expected: ".5000005px", other: ".5px" },
] as const)(
	"keeps indistinguishable native $property precision unknown for self and other",
	async ({ property, expected, other }) => {
		const f = await fixture(
			`<div data-subject style="width:100px;height:40px;${property}:${expected}">Self</div><div data-subject style="width:100px;height:40px;${property}:${other}">Other</div>`,
		);
		const observed = await f.page
			.locator("[data-subject]")
			.evaluateAll(
				(elements, property) => elements.map((element) => getComputedStyle(element).getPropertyValue(property)),
				property,
			);
		expect(observed[0]).toBe(observed[1]);
		expect(await f.inspect(property, expected)).toEqual([
			{ kind: "unknown", reason: "this transform needs observable native longhand precision" },
			{ kind: "unknown", reason: "this transform needs observable native longhand precision" },
		]);
	},
);

it("preserves full matrix precision when Typed OM distinguishes an identical declaration from another use", async () => {
	const f = await fixture(
		'<div data-subject style="width:100px;height:40px;transform:scale(.5000005)">Self</div><div data-subject style="width:100px;height:40px;transform:scale(.5)">Other</div>',
	);
	expect(await f.inspect("transform", "scale(.5000005)")).toEqual([
		{ kind: "known", matches: true, observed: expect.any(String) },
		{ kind: "known", matches: false, observed: expect.any(String) },
	]);
});
