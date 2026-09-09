import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import type { NativeKeywordProperty, NativeKeywordResult } from "./property-keywords";

let browser: Browser;
let runtime: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/runtime/property-keywords.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyKeywords",
	});
	runtime = result.outputFiles[0]!.text;
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(() => browser?.close(), 35_000);

const picture = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='10'%3E%3C/svg%3E";

async function fixture(markup: string) {
	const page = await browser.newPage();
	onTestFinished(() => page.close(), 35_000);
	await page.setContent(markup);
	await page.addScriptTag({ content: runtime });
	const inspect = (property: NativeKeywordProperty, expectedValue: string) =>
		page.locator("[data-subject]").evaluateAll(
			(elements, { property, expectedValue }) => {
				const evaluator = Reflect.get(window, "PropertyKeywords") as {
					nativeKeyword(
						element: Element,
						property: NativeKeywordProperty,
						expectedValue: string,
					): NativeKeywordResult;
				};
				return elements.map((element) => evaluator.nativeKeyword(element, property, expectedValue));
			},
			{ property, expectedValue },
		);
	return { page, inspect };
}

it.each([
	{ property: "text-align", before: "left", after: "right" },
	{ property: "text-transform", before: "uppercase", after: "lowercase" },
	{ property: "text-decoration-line", before: "underline", after: "line-through" },
	{ property: "font-style", before: "italic", after: "normal" },
	{ property: "white-space", before: "pre", after: "nowrap" },
	{ property: "object-fit", before: "cover", after: "contain" },
	{ property: "text-overflow", before: "ellipsis", after: "clip" },
] as const)("compares each actual $property use to an independent declaration and inverse", async (row) => {
	const subject = (value: string) =>
		row.property === "object-fit"
			? `<img data-subject src="${picture}" style="width:40px;height:40px;object-fit:${value}"/>`
			: `<div data-subject style="width:20px;overflow:hidden;${row.property === "text-overflow" ? "white-space:nowrap;" : ""}${row.property}:${value}">Long native text</div>`;
	const f = await fixture(subject(row.after) + subject(row.before));
	if (row.property === "object-fit")
		await f.page.locator("img").evaluateAll((elements) =>
			Promise.all(
				elements.map((element) => {
					if (!(element instanceof HTMLImageElement)) throw new Error("missing native image");
					return element.decode();
				}),
			),
		);
	expect(await f.inspect(row.property, row.after)).toEqual([
		{ kind: "known", matches: true, observed: row.after },
		{ kind: "known", matches: false, observed: row.before },
	]);
	expect(await f.inspect(row.property, row.before)).toEqual([
		{ kind: "known", matches: false, observed: row.after },
		{ kind: "known", matches: true, observed: row.before },
	]);
});

it.each([
	{ property: "text-align", declaration: "RIGHT", native: "right" },
	{ property: "white-space", declaration: "preserve nowrap", native: "pre" },
	{ property: "text-decoration-line", declaration: "line-through underline", native: "underline line-through" },
] as const)("normalizes native declaration spelling for $property without adopting a stylesheet", async (row) => {
	const f = await fixture(
		`<div data-subject style="${row.property}:${row.native}">Some text</div><input value="initial"/>`,
	);
	const before = await f.page.evaluate(() => {
		const input = document.querySelector("input")!;
		input.focus();
		input.value = "retained input";
		input.setSelectionRange(2, 5);
		Reflect.set(window, "keywordInput", input);
		const mutations: MutationRecord[] = [];
		new MutationObserver((records) => mutations.push(...records)).observe(document.documentElement, {
			childList: true,
			attributes: true,
			characterData: true,
			subtree: true,
		});
		Reflect.set(window, "keywordMutations", mutations);
		return {
			html: document.documentElement.outerHTML,
			styles: document.styleSheets.length,
			adopted: document.adoptedStyleSheets.length,
		};
	});
	expect(await f.inspect(row.property, row.declaration)).toEqual([
		{ kind: "known", matches: true, observed: row.native },
	]);
	expect(
		await f.page.evaluate(() => {
			const input = document.querySelector("input")!;
			return {
				html: document.documentElement.outerHTML,
				styles: document.styleSheets.length,
				adopted: document.adoptedStyleSheets.length,
				input: [
					input === Reflect.get(window, "keywordInput"),
					document.activeElement === input,
					input.value,
					input.selectionStart,
					input.selectionEnd,
				],
				mutations: Reflect.get(window, "keywordMutations").length,
			};
		}),
	).toEqual({ ...before, input: [true, true, "retained input", 2, 5], mutations: 0 });
});

it.each(["var(--alignment)", "inherit", "initial", "unset", "revert", "revert-layer", "made-up", "right !important"])(
	"does not derive unresolved expected %s from a matching native value",
	async (expected) => {
		const f = await fixture('<div data-subject style="--alignment:right;text-align:right">Text</div>');
		expect(await f.inspect("text-align", expected)).toEqual([
			{ kind: "unknown", reason: "this keyword needs a resolved supported declaration" },
		]);
	},
);

it("does not claim alignment applies to an inline host", async () => {
	const f = await fixture('<span data-subject style="text-align:right">Inline text</span>');
	expect(await f.inspect("text-align", "right")).toEqual([
		{ kind: "unknown", reason: "text alignment needs a native block container" },
	]);
});

it("keeps ancestor decoration distinct from a child's undecorated native value", async () => {
	const f = await fixture(
		'<div style="text-decoration:underline"><span data-subject style="text-decoration:none">Still underlined</span></div>',
	);
	expect(
		await f.page.locator("[data-subject]").evaluate((element) => getComputedStyle(element).textDecorationLine),
	).toBe("none");
	expect(await f.inspect("text-decoration-line", "none")).toEqual([
		{ kind: "unknown", reason: "ancestor text decoration needs a propagation proof" },
	]);
});

it.each([
	'<div data-subject style="object-fit:contain">Not an image</div>',
	'<img data-subject style="width:40px;height:40px;object-fit:contain"/>',
	'<img data-subject src="data:image/png,broken" style="width:40px;height:40px;object-fit:contain"/>',
])("requires loaded native image content for object fit: %s", async (markup) => {
	const f = await fixture(markup);
	expect(await f.inspect("object-fit", "contain")).toEqual([
		{ kind: "unknown", reason: "object fit needs a decoded native image" },
	]);
});

it.each([
	'<div data-subject style="width:20px;white-space:nowrap;text-overflow:ellipsis">Long unclipped text</div>',
	'<div data-subject style="width:2000px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Fits</div>',
	'<div data-subject style="width:20px;overflow:hidden;white-space:normal;text-overflow:ellipsis">Wrapping text</div>',
	'<div data-subject style="width:20px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;writing-mode:vertical-rl">Vertical overflow</div>',
	'<div data-subject style="width:20px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis"><div style="width:200px">Nested block</div></div>',
])("does not treat computed ellipsis as proof of clipped text: %s", async (markup) => {
	const f = await fixture(markup);
	expect(await f.inspect("text-overflow", "ellipsis")).toEqual([
		{
			kind: "unknown",
			reason: "text overflow needs actual clipped single-line text in a horizontal block container",
		},
	]);
});

it("does not verify hidden or detached hosts from their computed keyword", async () => {
	const f = await fixture('<div data-subject style="display:none;text-align:right">Hidden</div>');
	expect(await f.inspect("text-align", "right")).toEqual([
		{ kind: "unknown", reason: "this keyword has no rendered native host" },
	]);
	expect(
		await f.page.locator("[data-subject]").evaluate((element) => {
			element.remove();
			return Reflect.get(window, "PropertyKeywords").nativeKeyword(element, "text-align", "right");
		}),
	).toEqual({ kind: "unknown", reason: "this keyword needs a connected native document context" });
});

it("keeps a decoded image with no content box unverified", async () => {
	const f = await fixture(`<img data-subject src="${picture}" style="width:0;height:40px;object-fit:contain"/>`);
	await f.page.locator("img").evaluate((element) => {
		if (!(element instanceof HTMLImageElement)) throw new Error("missing native image");
		return element.decode();
	});
	expect(await f.inspect("object-fit", "contain")).toEqual([
		{ kind: "unknown", reason: "object fit needs visible native image dimensions" },
	]);
});

it("requires a separate applicability proof for text keywords on replaced hosts", async () => {
	const f = await fixture('<input data-subject value="Native control" style="text-transform:uppercase"/>');
	expect(await f.inspect("text-transform", "uppercase")).toEqual([
		{ kind: "unknown", reason: "this text keyword needs a replaced-host applicability proof" },
	]);
});
