import { realpathSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import { readInput } from "../daemon/retained-compile";
import { compilePropertySource } from "../daemon/source-property-compile";
import { propertyConsumers } from "../daemon/source-property-dependencies";
import type { SourcePropertyExpectation } from "../source-property";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import type { PropertyOutcome } from "./property-outcome";

let browser: Browser;
let runtime: string;
beforeAll(async () => {
	const result = await build({
		entryPoints: ["src/runtime/property-outcome.ts"],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "PropertyOutcome",
	});
	runtime = result.outputFiles[0]!.text;
	browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
});
afterAll(() => browser?.close(), 35_000);

function opacity(value: string): SourcePropertyExpectation {
	return {
		kind: "property",
		property: "opacity",
		scope: "",
		className: "opacity-50",
		absent: false,
		effects: [{ owner: "opacity-50", path: ["@layer utilities", "$"], property: "opacity", value, important: false }],
		css: `@layer utilities { .opacity-50 { opacity: ${value} } }`,
	};
}
async function compiledOpacity(classes: string): Promise<SourcePropertyExpectation> {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const certificate = await compilePropertySource(root, new Map([[file, readInput(file)]]), classes);
	return {
		...opacity("0.5"),
		css: certificate.css,
		effects: propertyConsumers(certificate, new Set(["opacity"]), { direction: "ltr", writingMode: "horizontal-tb" }),
	};
}
async function fixture(markup: string) {
	const page = await browser.newPage();
	onTestFinished(() => page.close(), 35_000);
	await page.setContent(markup);
	await page.addScriptTag({ content: runtime });
	const inspect = (expected: SourcePropertyExpectation) =>
		page.locator("[data-subject]").evaluateAll((elements, expectation) => {
			const evaluator = Reflect.get(window, "PropertyOutcome") as {
				propertyOutcome(element: Element, expected: SourcePropertyExpectation): PropertyOutcome;
			};
			return elements.map((element) => evaluator.propertyOutcome(element, expectation));
		}, expected);
	return { page, inspect };
}

it("measures each native use independently and leaves authored state untouched", async () => {
	const f = await fixture(
		'<style>.healthy{opacity:.5}.memo{opacity:.75}</style><section data-subject class="healthy"><input value="initial"></section><section data-subject class="memo"><input value="initial"></section>',
	);
	await f.page.evaluate(() => {
		const input = document.querySelector("input")!;
		input.focus();
		input.value = "dirty text";
		input.setSelectionRange(2, 4);
		Reflect.set(window, "originalInput", input);
		Reflect.set(window, "mutations", []);
		new MutationObserver((records) => Reflect.get(window, "mutations").push(...records)).observe(document, {
			subtree: true,
			attributes: true,
			childList: true,
			characterData: true,
		});
	});
	const before = await f.page.content();
	expect(await f.inspect(opacity("50%"))).toEqual([
		{ rendered: "verified", observed: "0.5" },
		{ rendered: "mismatching", observed: "0.75" },
	]);
	expect(await f.page.content()).toBe(before);
	expect(
		await f.page.evaluate(() => {
			const input = document.querySelector("input")!;
			return {
				identity: input === Reflect.get(window, "originalInput"),
				focused: document.activeElement === input,
				value: input.value,
				caret: [input.selectionStart, input.selectionEnd],
				mutations: Reflect.get(window, "mutations").length,
			};
		}),
	).toEqual({ identity: true, focused: true, value: "dirty text", caret: [2, 4], mutations: 0 });
});

it("does not certify equal classes when their native opacity differs", async () => {
	const f = await fixture('<style>.opacity-50{opacity:.75}</style><div data-subject class="opacity-50"></div>');
	expect(await f.inspect(opacity("0.5"))).toEqual([{ rendered: "mismatching", observed: "0.75" }]);
});

it("verifies removed opacity against its native initial value for each use", async () => {
	const f = await fixture('<div data-subject></div><div data-subject style="opacity:.4"></div>');
	const expected = { ...opacity("0.5"), className: "", absent: true, effects: [], css: "" };
	expect(await f.inspect(expected)).toEqual([
		{ rendered: "verified", observed: "1" },
		{ rendered: "mismatching", observed: "0.4" },
	]);
});

it("keeps unresolved variables and inactive scopes unverified", async () => {
	const f = await fixture('<div data-subject style="opacity:.5"></div>');
	for (const expected of [opacity("var(--authored-opacity)"), { ...opacity("0.5"), scope: "hover:" }])
		expect((await f.inspect(expected))[0]).toMatchObject({ rendered: "unverified", reason: expect.any(String) });
});

it("uses the intended compiler candidate while preserving unrelated preflight effects", async () => {
	const expected = await compiledOpacity("opacity-50 opacity-75");
	const f = await fixture(
		`<style>${expected.css}</style><section data-subject class="opacity-50"></section><section data-subject class="opacity-75"></section><button data-subject class="opacity-50">Native control</button>`,
	);
	expect(await f.inspect(expected), JSON.stringify(expected.effects)).toEqual([
		{ rendered: "verified", observed: "0.5" },
		{ rendered: "mismatching", observed: "0.75" },
		{ rendered: "verified", observed: "0.5" },
	]);
});

it("does not certify an intended utility that an important base declaration masks", async () => {
	const expected = opacity("0.5");
	expected.css =
		"@layer base, utilities; @layer base { button {opacity:.2!important} } @layer utilities { .opacity-50 {opacity:.5} }";
	expected.effects = [
		{ owner: null, path: ["@layer base", "button"], property: "opacity", value: ".2", important: true },
		...expected.effects,
	];
	const f = await fixture(`<style>${expected.css}</style><button data-subject class="opacity-50">Masked</button>`);
	expect(await f.inspect(expected)).toEqual([
		{ rendered: "unverified", reason: "the expected utility is masked by another declaration" },
	]);
});

it("keeps a retained different token separate from its independently matching native effect", async () => {
	const expected = await compiledOpacity("opacity-50 opacity-[.5] p-4");
	const f = await fixture(`<style>${expected.css}</style><div data-subject class="opacity-[.5] p-4"></div>`);
	const before = await f.page.content();
	expect(await f.inspect(expected)).toEqual([{ rendered: "verified", observed: "0.5" }]);
	expect(await f.page.locator("[data-subject]").getAttribute("class")).toBe("opacity-[.5] p-4");
	expect(expected.className).toBe("opacity-50");
	expect(await f.page.content()).toBe(before);
});
