import { realpathSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import { appearanceProperties } from "../daemon/fixtures/property-appearance";
import { readInput } from "../daemon/retained-compile";
import { compilePropertySource } from "../daemon/source-property-compile";
import { nativePropertyEffects, propertyConsumers } from "../daemon/source-property-dependencies";
import { planPropertyValue } from "../daemon/source-property-plan";
import { propertyScopePaths } from "../daemon/source-property-scope";
import { FILTER_SET } from "../properties/families";
import type { SourcePropertyEnvironment, SourcePropertyExpectation, SourcePropertyValue } from "../source-property";
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
		scopePaths: [["@layer utilities", "$"]],
		effects: [{ owner: "opacity-50", path: ["@layer utilities", "$"], property: "opacity", value, important: false }],
		css: `@layer utilities { .opacity-50 { opacity: ${value} } }`,
	};
}
async function compiledOpacity(classes: string, scope = ""): Promise<SourcePropertyExpectation> {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const certificate = await compilePropertySource(root, new Map([[file, readInput(file)]]), classes);
	return {
		...opacity("0.5"),
		scope,
		className: scope ? `${scope}opacity-50` : "opacity-50",
		scopePaths: propertyScopePaths(
			certificate,
			certificate,
			{ kind: "property", property: "opacity", scope },
			{ direction: "ltr", writingMode: "horizontal-tb" },
		),
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

it("keeps unresolved variables and missing scope proof unverified", async () => {
	const f = await fixture('<div data-subject style="opacity:.5"></div>');
	for (const expected of [opacity("var(--authored-opacity)"), { ...opacity("0.5"), scope: "hover:", scopePaths: [] }])
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

it("uses compiled focus conditions independently for healthy and retained consumers", async () => {
	const expected = await compiledOpacity("focus:opacity-50 focus:opacity-75", "focus:");
	const f = await fixture(
		`<style>${expected.css}</style><input data-subject class="focus:opacity-50"><input data-subject class="focus:opacity-75">`,
	);
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["inactive", "inactive"]);
	await f.page.locator("input").nth(0).focus();
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "inactive"]);
	await f.page.locator("input").nth(1).focus();
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["inactive", "mismatching"]);
});

it("uses each document's native media context from the compiler path", async () => {
	const expected = await compiledOpacity("min-[700px]:opacity-50", "min-[700px]:");
	const f = await fixture(
		`<style>${expected.css}</style><section data-subject class="min-[700px]:opacity-50"></section>`,
	);
	await f.page.setViewportSize({ width: 600, height: 400 });
	expect((await f.inspect(expected))[0]?.rendered).toBe("inactive");
	await f.page.setViewportSize({ width: 800, height: 400 });
	expect((await f.inspect(expected))[0]).toEqual({ rendered: "verified", observed: "0.5" });
});

it("retains the compiled condition after removal and does not guess unknown containers", async () => {
	const compiled = await compiledOpacity("focus:opacity-50", "focus:");
	const expected = { ...compiled, className: "", absent: true, effects: [], css: "" };
	const f = await fixture("<input data-subject>");
	expect((await f.inspect(expected))[0]?.rendered).toBe("inactive");
	await f.page.locator("input").focus();
	expect((await f.inspect(expected))[0]).toEqual({ rendered: "verified", observed: "1" });
	expect((await f.inspect({ ...expected, scopePaths: [["@container (width > 1px)", "$"]] }))[0]?.rendered).toBe(
		"unverified",
	);
});

it.each(["", "<!doctype html>"])(
	"reads actual hover state in document mode %j without using retained utility values",
	async (doctype) => {
		const expected = await compiledOpacity("hover:opacity-50 hover:opacity-75", "hover:");
		const f = await fixture(
			`${doctype}<style>${expected.css}</style><button data-subject class="hover:opacity-50">Healthy</button><button data-subject class="hover:opacity-75">Retained</button>`,
		);
		await f.page.mouse.move(500, 300);
		expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["inactive", "inactive"]);
		await f.page.locator("button").nth(0).hover();
		const hoverEvidence = await f.page.evaluate(() => ({
			hover: [...document.querySelectorAll("button")].map((element) => element.matches(":hover")),
			media: matchMedia("(hover: hover)").matches,
		}));
		expect(
			(await f.inspect(expected)).map((outcome) => outcome.rendered),
			JSON.stringify({ paths: expected.scopePaths, hoverEvidence }),
		).toEqual(["verified", "inactive"]);
		await f.page.locator("button").nth(1).hover();
		expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["inactive", "mismatching"]);
	},
);

it("verifies a compiled shared color binding against each actual use independently", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "@theme { --color-brand: #123456; }");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const certificate = await compilePropertySource(root, new Map([[file, readInput(file)]]), "text-brand text-red-500");
	const operation = { kind: "property", property: "color", scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: "color",
		scope: "",
		className: "text-brand",
		absent: false,
		scopePaths: propertyScopePaths(certificate, certificate, operation, environment),
		effects: propertyConsumers(certificate, new Set(["color"]), environment),
		css: certificate.css,
	};
	const f = await fixture(
		`<!doctype html><style>${expected.css}</style><div data-subject class="text-brand">Healthy</div><div data-subject class="text-red-500">Retained</div>`,
	);
	const before = await f.page.content();
	expect(
		(await f.inspect(expected)).map((outcome) => outcome.rendered),
		JSON.stringify(expected.effects),
	).toEqual(["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element) => getComputedStyle(element).color),
	).toBe("rgb(18, 52, 86)");
	expect(await f.page.content()).toBe(before);
});

it("compares equal native colors independently of their authored color notation", async () => {
	const expected: SourcePropertyExpectation = {
		...opacity(".5"),
		property: "color",
		className: "text-red",
		effects: [
			{ owner: "text-red", path: ["@layer utilities", "$"], property: "color", value: "red", important: false },
		],
		css: "@layer utilities { .text-red { color:red } }",
	};
	const f = await fixture(
		'<!doctype html><div data-subject style="color:color(srgb 1 0 0)">Same color</div><div data-subject style="color:color(srgb 0 0 1)">Different color</div>',
	);
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
});

it.each(["color", "background-color"])("keeps overridden and conditional %s variables unverified", async (property) => {
	const expected: SourcePropertyExpectation = {
		...opacity(".5"),
		property,
		className: "brand",
		effects: [{ owner: "brand", path: ["@layer utilities", "$"], property, value: "var(--brand)", important: false }],
		css: `@layer theme, utilities; @layer theme {:root {--brand: #123456}} @layer utilities {.brand {${property}:var(--brand)}}`,
	};
	const f = await fixture(
		`<!doctype html><style>${expected.css}</style><div data-subject class="brand">Root value</div><section style="--brand: blue"><div data-subject class="brand">Overridden</div></section>`,
	);
	const before = await f.page.content();
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "unverified"]);
	expect(
		(await f.inspect({ ...expected, css: expected.css + "@media (min-width:99999px) {:root {--brand: red}}" })).map(
			(outcome) => outcome.rendered,
		),
	).toEqual(["unverified", "unverified"]);
	expect(await f.page.content()).toBe(before);
});

function custom(value: string): SourcePropertyExpectation {
	return {
		...opacity(".5"),
		property: "background-color",
		className: "custom",
		effects: [
			{ owner: "custom", path: ["@layer utilities", "$"], property: "background-color", value, important: false },
		],
		css: `@layer utilities {.custom {background-color:${value}}}`,
	};
}

it.each(["rgb(1 2 3 / .51)", "oklch(.704 .191 22.216)", "color-mix(in oklab, red 50%, transparent)"])(
	"uses native %s color precision without raster sampling",
	async (value) => {
		const f = await fixture(
			`<!doctype html><div data-subject style="background-color:${value}">Healthy</div><div data-subject style="background-color:blue">Different</div>`,
		);
		expect((await f.inspect(custom(value))).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	},
);

it("never certifies an expected color this engine cannot record distinguishably", async () => {
	// Chromium records .50001 and .5 alike, so equal pixels here would prove nothing.
	const value = "rgb(1 2 3 / .50001)";
	const f = await fixture(
		`<!doctype html><div data-subject style="background-color:${value}">Same record</div><div data-subject style="background-color:rgb(1 2 3 / .5)">Indistinguishable</div>`,
	);
	const outcomes = await f.inspect(custom(value));
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify(outcomes),
	).toEqual(["unverified", "unverified"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor)),
	).toEqual(["rgba(1, 2, 3, 0.5)", "rgba(1, 2, 3, 0.5)"]);
});

it("verifies fractional compiled type while preserving independent line height", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const certificate = await compilePropertySource(
		root,
		new Map([[file, readInput(file)]]),
		"text-[1.375rem] text-[1rem] leading-[2rem]",
	);
	const operation = { kind: "property", property: "font-size", scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: "font-size",
		scope: "",
		className: "text-[1.375rem] leading-[2rem]",
		absent: false,
		scopePaths: propertyScopePaths(certificate, certificate, operation, environment),
		effects: propertyConsumers(certificate, new Set(["font-size"]), environment),
		css: certificate.css,
	};
	const f = await fixture(
		`<!doctype html><style>${expected.css}html{font-size:20px}</style><div data-subject class="text-[1.375rem] leading-[2rem]">Healthy</div><div data-subject class="text-[1rem] leading-[2rem]">Retained</div>`,
	);
	const before = await f.page.content();
	expect(
		(await f.inspect(expected)).map((outcome) => outcome.rendered),
		JSON.stringify(expected.effects),
	).toEqual(["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.evaluateAll((elements) =>
				elements.map((element) => [getComputedStyle(element).fontSize, getComputedStyle(element).lineHeight]),
			),
	).toEqual([
		["27.5px", "40px"],
		["20px", "40px"],
	]);
	expect(await f.page.content()).toBe(before);
});

it.each(["1.375em", "125%", "1.333333rem", ".1234567px"])(
	"checks %s type size in each native parent context",
	async (value) => {
		const expected: SourcePropertyExpectation = {
			...opacity(".5"),
			property: "font-size",
			className: "size",
			effects: [{ owner: "size", path: ["@layer utilities", "$"], property: "font-size", value, important: false }],
			css: `@layer utilities {.size {font-size:${value}}}`,
		};
		const f = await fixture(
			`<!doctype html><style>${expected.css}html{font-size:20px}</style><section style="font-size:14px"><div data-subject class="size">First context</div></section><section style="font-size:20px"><div data-subject class="size">Second context</div><div data-subject style="font-size:10px">Retained</div></section>`,
		);
		expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual([
			"verified",
			"verified",
			"mismatching",
		]);
	},
);

it.each(["1.375rem", "calc(10px + 2vw)"])("does not guess an unresolved root type context for %s", async (value) => {
	const expected: SourcePropertyExpectation = {
		...opacity(".5"),
		property: "font-size",
		className: "size",
		effects: [{ owner: "size", path: ["@layer utilities", "$"], property: "font-size", value, important: false }],
		css: `@layer utilities {.size {font-size:${value}}}`,
	};
	const f = await fixture(
		`<!doctype html><html data-subject class="size"><head><style>${expected.css}</style></head><body>Root context</body></html>`,
	);
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["unverified"]);
});

it("verifies a compiled corner change without losing the other authored radii", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const operation = { kind: "property", property: "border-top-left-radius", scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		"rounded-lg",
		operation,
		{ kind: "custom", value: "1.25rem" },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: operation.property,
		scope: "",
		className: plan.next,
		absent: false,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
		effects: plan.consumers,
		css: plan.desired.css,
	};
	const f = await fixture(
		`<!doctype html><style>${expected.css}</style><div data-subject class="${plan.next}">Healthy</div><div data-subject class="rounded-lg">Retained</div><div data-subject class="rounded-lg" style="border-top-left-radius:20px 4px">Different vertical radius</div><div data-subject class="${plan.next}" style="border-bottom-right-radius:99px">Independent corner</div>`,
	);
	expect(
		(await f.inspect(expected)).map((outcome) => outcome.rendered),
		JSON.stringify(expected.effects),
	).toEqual(["verified", "mismatching", "mismatching", "verified"]);
	expect(
		await f.page.locator("[data-subject]").evaluateAll((elements) =>
			elements.map((element) => {
				const style = getComputedStyle(element);
				return [
					style.borderTopLeftRadius,
					style.borderTopRightRadius,
					style.borderBottomRightRadius,
					style.borderBottomLeftRadius,
				];
			}),
		),
	).toEqual([
		["20px", "8px", "8px", "8px"],
		["8px", "8px", "8px", "8px"],
		["20px 4px", "8px", "8px", "8px"],
		["20px", "8px", "99px", "8px"],
	]);
});

it.each([
	{ property: "border-top-left-radius", radii: ["0px", "8px", "8px", "8px"] },
	{ property: "border-top-right-radius", radii: ["8px", "0px", "8px", "8px"] },
	{ property: "border-bottom-right-radius", radii: ["8px", "8px", "0px", "8px"] },
	{ property: "border-bottom-left-radius", radii: ["8px", "8px", "8px", "0px"] },
])("verifies $property removal and inverse with the other corners intact", async ({ property, radii }) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const operation = { kind: "property", property, scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		"rounded-lg",
		operation,
		{ kind: "remove" },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property,
		scope: "",
		className: plan.next,
		absent: false,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
		effects: plan.consumers,
		css: plan.desired.css,
	};
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style><div data-subject class="${plan.next}">Removed</div><div data-subject class="rounded-lg">Restored</div>`,
	);
	expect(
		(await f.inspect(expected)).map((outcome) => outcome.rendered),
		JSON.stringify(plan.consumers),
	).toEqual(["verified", "mismatching"]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: "rounded-lg",
		effects: propertyConsumers(plan.original, plan.roots, environment),
		css: plan.original.css,
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	expect(
		await f.page.locator("[data-subject]").evaluateAll((elements) =>
			elements.map((element) => {
				const style = getComputedStyle(element);
				return [
					style.borderTopLeftRadius,
					style.borderTopRightRadius,
					style.borderBottomRightRadius,
					style.borderBottomLeftRadius,
				];
			}),
		),
	).toEqual([radii, ["8px", "8px", "8px", "8px"]]);
});

it.each([
	{ property: "color", token: "text-brand", tag: "div" },
	{ property: "background-color", token: "bg-brand", tag: "div" },
	{ property: "color", token: "text-brand", tag: "button" },
	{ property: "background-color", token: "bg-brand", tag: "button" },
])(
	"verifies $property removal on $tag from independent native defaults and inheritance",
	async ({ property, token, tag }) => {
		const { root } = makeProject(makeTempDir());
		writeDesignFile(root, "shared/tokens.css", "@theme {--color-brand:#123456}");
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		const operation = { kind: "property", property, scope: "" } as const;
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		const plan = await planPropertyValue(
			root,
			new Map([[file, readInput(file)]]),
			`p-4 ${token}`,
			operation,
			{ kind: "remove" },
			environment,
		);
		const expected: SourcePropertyExpectation = {
			kind: "property",
			property,
			scope: "",
			className: plan.next,
			absent: false,
			scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
			effects: plan.consumers,
			css: plan.desired.css,
		};
		const f = await fixture(
			`<!doctype html><style>${plan.original.css}${expected.css}</style><section style="${property}:red"><${tag} data-subject class="${plan.next}">First</${tag}></section><section style="${property}:blue"><${tag} data-subject class="${plan.next}">Second</${tag}><${tag} data-subject class="${token}">Retained</${tag}><${tag} data-subject class="${plan.next}" style="${property}:#123456">Unknown inline role</${tag}></section>`,
		);
		const before = await f.page.content();
		expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual([
			"verified",
			"verified",
			"mismatching",
			"unverified",
		]);
		const inverse: SourcePropertyExpectation = {
			...expected,
			className: `p-4 ${token}`,
			effects: propertyConsumers(plan.original, plan.roots, environment),
			css: plan.original.css,
		};
		expect((await f.inspect(inverse)).slice(0, 3).map((outcome) => outcome.rendered)).toEqual([
			"mismatching",
			"mismatching",
			"verified",
		]);
		expect(await f.page.content()).toBe(before);
	},
);

it.each([undefined, "initial"])("keeps root or system color %j unverified", async (value) => {
	const expected: SourcePropertyExpectation = {
		...opacity(".5"),
		property: "color",
		className: value ? "system" : "",
		absent: !value,
		effects: value
			? [{ owner: "system", path: ["@layer utilities", "$"], property: "color", value, important: false }]
			: [],
		css: value ? `@layer utilities {.system{color:${value}}}` : "",
	};
	const f = await fixture(
		`<!doctype html><html data-subject class="system"><head><style>${expected.css}</style></head><body>Root color</body></html>`,
	);
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["unverified"]);
});

it.each(["top", "right", "bottom", "left", "all"] as const)(
	"verifies compiled %s border changes, companions and inverse",
	async (side) => {
		const { root } = makeProject(makeTempDir());
		writeDesignFile(root, "shared/tokens.css", "");
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		const operation = {
			kind: "property",
			property: side === "all" ? "border-width" : `border-${side}-width`,
			scope: "",
		} as const;
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		const plan = await planPropertyValue(
			root,
			new Map([[file, readInput(file)]]),
			"border-2",
			operation,
			{ kind: "custom", value: "4px" },
			environment,
		);
		const expected: SourcePropertyExpectation = {
			kind: "property",
			property: operation.property,
			scope: "",
			className: plan.next,
			absent: false,
			scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
			effects: plan.consumers,
			css: plan.desired.css,
		};
		const f = await fixture(
			`<!doctype html><style>${plan.original.css}${expected.css}</style><div data-subject class="${plan.next}">Healthy</div><div data-subject class="border-2">Retained</div><div data-subject class="${plan.next}" style="--tw-border-style:dashed">Independent variable</div><div data-subject class="${plan.next}" style="${side === "all" ? "border-style" : `border-${side}-style`}:dashed">Independent style</div>`,
		);
		const before = await f.page.content();
		expect(
			(await f.inspect(expected)).map((outcome) => outcome.rendered),
			JSON.stringify(expected.effects),
		).toEqual(["verified", "mismatching", "unverified", "mismatching"]);
		const widths = ["top", "right", "bottom", "left"].map((value) =>
			side === "all" || value === side ? "4px" : "2px",
		);
		expect(
			await f.page.locator("[data-subject]").evaluateAll((elements) =>
				elements.slice(0, 2).map((element) => {
					const style = getComputedStyle(element);
					return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
				}),
			),
		).toEqual([widths, ["2px", "2px", "2px", "2px"]]);
		const inverse: SourcePropertyExpectation = {
			...expected,
			className: "border-2",
			css: plan.original.css,
			effects: propertyConsumers(plan.original, plan.roots, environment),
		};
		expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual([
			"mismatching",
			"verified",
			"unverified",
			"mismatching",
		]);
		expect(await f.page.content()).toBe(before);
	},
);

it("verifies border component removal from captured native preflight while preserving other sides", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const operation = { kind: "property", property: "border-top-width", scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		"border-2",
		operation,
		{ kind: "remove" },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: operation.property,
		scope: "",
		className: plan.next,
		absent: false,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
		effects: plan.consumers,
		css: plan.desired.css,
	};
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style><div data-subject class="${plan.next}">Healthy</div><div data-subject class="border-2">Retained</div>`,
	);
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect(
		await f.page.locator("[data-subject]").evaluateAll((elements) =>
			elements.map((element) => {
				const style = getComputedStyle(element);
				return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
			}),
		),
	).toEqual([
		["0px", "2px", "2px", "2px"],
		["2px", "2px", "2px", "2px"],
	]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: "border-2",
		css: plan.original.css,
		effects: propertyConsumers(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const css = expected.css.replace(/border:\s*0 solid;/, "");
	expect(css).not.toBe(expected.css);
	expect((await f.inspect({ ...expected, css })).map((outcome) => outcome.rendered)).toEqual([
		"unverified",
		"unverified",
	]);
});

it.each(["custom", "binding"] as const)(
	"verifies compiled %s font weight independently of native size and leading",
	async (kind) => {
		const { root } = makeProject(makeTempDir());
		writeDesignFile(root, "shared/tokens.css", "");
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		const operation = { kind: "property", property: "font-weight", scope: "" } as const;
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		const plan = await planPropertyValue(
			root,
			new Map([[file, readInput(file)]]),
			"font-medium text-xl leading-10",
			operation,
			kind === "custom" ? { kind: "custom", value: "700" } : { kind: "binding", tokens: ["font-bold"] },
			environment,
		);
		const expected: SourcePropertyExpectation = {
			kind: "property",
			property: operation.property,
			scope: "",
			className: plan.next,
			absent: false,
			scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
			effects: plan.consumers,
			css: plan.desired.css,
		};
		const f = await fixture(
			`<!doctype html><style>${plan.original.css}${expected.css}</style><div data-subject class="${plan.next}">Healthy</div><div data-subject class="font-medium text-xl leading-10">Retained</div><div data-subject class="${plan.next}" style="--tw-font-weight:500">Wrong companion</div><div data-subject class="${plan.next}" style="--font-weight-bold:600">Outside reference</div>`,
		);
		expect(
			(await f.inspect(expected)).map((outcome) => outcome.rendered),
			JSON.stringify(expected.effects),
		).toEqual(["verified", "mismatching", "mismatching", kind === "binding" ? "unverified" : "verified"]);
		expect(
			await f.page.locator("[data-subject]").evaluateAll((elements) =>
				elements.slice(0, 2).map((element) => {
					const style = getComputedStyle(element);
					return [style.fontWeight, style.fontSize, style.lineHeight];
				}),
			),
		).toEqual([
			["700", "20px", "40px"],
			["500", "20px", "40px"],
		]);
		const inverse: SourcePropertyExpectation = {
			...expected,
			className: "font-medium text-xl leading-10",
			css: plan.original.css,
			effects: propertyConsumers(plan.original, plan.roots, environment),
		};
		expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual([
			"mismatching",
			"verified",
			"mismatching",
			"mismatching",
		]);
	},
);

it("verifies font weight removal from each native parent and retains its inverse companion", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const operation = { kind: "property", property: "font-weight", scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		"font-medium",
		operation,
		{ kind: "remove" },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: operation.property,
		scope: "",
		className: plan.next,
		absent: !plan.next,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
		effects: plan.consumers,
		css: plan.desired.css,
	};
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style><section style="font-weight:300"><div data-subject class="${plan.next}">First</div></section><section style="font-weight:600"><h1 data-subject class="${plan.next}">Second</h1><div data-subject class="font-medium">Retained</div></section>`,
	);
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual([
		"verified",
		"verified",
		"mismatching",
	]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: "font-medium",
		absent: false,
		css: plan.original.css,
		effects: propertyConsumers(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual([
		"mismatching",
		"mismatching",
		"verified",
	]);
});

it.each(["1.5", "32px", "1.333333"])(
	"verifies compiled line height %s with unchanged type size and owned companion",
	async (value) => {
		const { root } = makeProject(makeTempDir());
		writeDesignFile(root, "shared/tokens.css", "");
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		const operation = { kind: "property", property: "line-height", scope: "" } as const;
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		const plan = await planPropertyValue(
			root,
			new Map([[file, readInput(file)]]),
			"text-xl leading-10",
			operation,
			{ kind: "custom", value },
			environment,
		);
		const expected: SourcePropertyExpectation = {
			kind: "property",
			property: operation.property,
			scope: "",
			className: plan.next,
			absent: false,
			scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
			effects: plan.consumers,
			css: plan.desired.css,
		};
		const f = await fixture(
			`<!doctype html><style>${plan.original.css}${expected.css}</style><div data-subject class="${plan.next}">Healthy</div><div data-subject class="text-xl leading-10">Retained</div>`,
		);
		expect(
			(await f.inspect(expected)).map((outcome) => outcome.rendered),
			JSON.stringify(expected.effects),
		).toEqual(["verified", "mismatching"]);
		expect(
			await f.page.locator("[data-subject]").evaluateAll((elements) =>
				elements.map((element) => {
					const style = getComputedStyle(element);
					return [style.fontSize, style.lineHeight];
				}),
			),
		).toEqual([
			["20px", value === "1.5" ? "30px" : value === "1.333333" ? "26.6667px" : "32px"],
			["20px", "40px"],
		]);
		const inverse: SourcePropertyExpectation = {
			...expected,
			className: "text-xl leading-10",
			css: plan.original.css,
			effects: propertyConsumers(plan.original, plan.roots, environment),
		};
		expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	},
);

it("keeps inherited leading unit ambiguity separate from a known parent context", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const operation = { kind: "property", property: "line-height", scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		"leading-10",
		operation,
		{ kind: "remove" },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: operation.property,
		scope: "",
		className: plan.next,
		absent: !plan.next,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
		effects: plan.consumers,
		css: plan.desired.css,
	};
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}.foreign{font-size:40px;line-height:30px}</style><section style="font-size:20px;line-height:1.5"><div data-subject>Healthy</div><div data-subject class="leading-10">Retained</div><div data-subject style="font-size:40px">Unknown unit inheritance</div><div data-subject class="foreign">Same pixels, wrong context</div></section>`,
	);
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual([
		"verified",
		"mismatching",
		"unverified",
		"unverified",
	]);
	expect(
		await f.page
			.locator("[data-subject]")
			.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).lineHeight)),
	).toEqual(["30px", "40px", "60px", "30px"]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: "leading-10",
		absent: false,
		css: plan.original.css,
		effects: propertyConsumers(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual([
		"mismatching",
		"verified",
		"mismatching",
		"mismatching",
	]);
});

it.each([
	{ property: "text-align", before: "text-left", after: "text-right", old: "left", value: "right" },
	{ property: "text-transform", before: "uppercase", after: "lowercase", old: "uppercase", value: "lowercase" },
	{
		property: "text-decoration-line",
		before: "underline",
		after: "line-through",
		old: "underline",
		value: "line-through",
	},
	{ property: "font-style", before: "italic", after: "not-italic", old: "italic", value: "normal" },
	{ property: "white-space", before: "whitespace-pre", after: "whitespace-nowrap", old: "pre", value: "nowrap" },
	{ property: "object-fit", before: "object-cover", after: "object-contain", old: "cover", value: "contain" },
	{ property: "text-overflow", before: "text-ellipsis", after: "text-clip", old: "ellipsis", value: "clip" },
])("verifies compiled $property choices and inverse against ordinary native declarations", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		row.before,
		operation,
		{ kind: "binding", tokens: [row.after] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: row.property,
		scope: "",
		className: plan.next,
		absent: false,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
		effects: plan.consumers,
		css: plan.desired.css,
	};
	const subject = (classes: string) =>
		row.property === "object-fit"
			? `<img data-subject class="${classes}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='10'%3E%3C/svg%3E" style="width:40px;height:40px"/>`
			: `<div data-subject class="${classes}" style="width:20px;overflow:hidden;${row.property === "text-overflow" ? "white-space:nowrap;" : ""}">Long native text</div>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${subject(plan.next)}${subject(row.before)}`,
	);
	if (row.property === "object-fit")
		await f.page.locator("img").evaluateAll((elements) =>
			Promise.all(
				elements.map((element) => {
					if (!(element instanceof HTMLImageElement)) throw new Error("missing native image");
					return element.decode();
				}),
			),
		);
	expect(
		(await f.inspect(expected)).map((outcome) => outcome.rendered),
		JSON.stringify(expected.effects),
	).toEqual(["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.evaluateAll(
				(elements, property) => elements.map((element) => getComputedStyle(element).getPropertyValue(property)),
				row.property,
			),
	).toEqual([row.value, row.old]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: row.before,
		css: plan.original.css,
		effects: propertyConsumers(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		row.before,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const defaults: Record<string, string> = {
		"text-align": "center",
		"text-transform": "none",
		"text-decoration-line": "none",
		"font-style": "normal",
		"white-space": "normal",
		"object-fit": "fill",
		"text-overflow": "clip",
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style><section style="text-align:center">${subject(removal.next)}${subject(row.before)}</section>`,
	);
	if (row.property === "object-fit")
		await empty.page.locator("img").evaluateAll((elements) =>
			Promise.all(
				elements.map((element) => {
					if (!(element instanceof HTMLImageElement)) throw new Error("missing native image");
					return element.decode();
				}),
			),
		);
	expect((await empty.inspect(removed)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect(
		await empty.page
			.locator("[data-subject]")
			.evaluateAll(
				(elements, property) => elements.map((element) => getComputedStyle(element).getPropertyValue(property)),
				row.property,
			),
	).toEqual([defaults[row.property], row.old]);
	expect((await empty.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it("resolves keyword variables before native comparison without accepting outside context", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", ":root {--case:lowercase}.mask{text-transform:uppercase}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const classes = "[text-transform:var(--case)]";
	const certificate = await compilePropertySource(root, new Map([[file, readInput(file)]]), classes);
	const operation = { kind: "property", property: "text-transform", scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: operation.property,
		scope: "",
		className: classes,
		absent: false,
		scopePaths: propertyScopePaths(certificate, certificate, operation, environment),
		effects: propertyConsumers(certificate, new Set(["text-transform"]), environment),
		css: certificate.css,
	};
	const f = await fixture(
		`<!doctype html><style>${expected.css}</style><div data-subject class="${classes}">Healthy</div><div data-subject class="${classes}" style="--case:uppercase">Outside variable</div><div data-subject class="${classes} mask">Independent cascade</div>`,
	);
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual([
		"verified",
		"unverified",
		"unverified",
	]);
});

it.each([
	{ property: "outline-color", before: "outline-red-500", companion: "outline-2", tag: "div" },
	{ property: "text-decoration-color", before: "decoration-red-500", companion: "underline", tag: "div" },
	{ property: "caret-color", before: "caret-red-500", companion: "", tag: "input" },
	{ property: "accent-color", before: "accent-red-500", companion: "", tag: "input" },
	{ property: "fill", before: "fill-red-500", companion: "", tag: "rect" },
	{ property: "stroke", before: "stroke-red-500", companion: "stroke-2", tag: "rect" },
])("verifies compiled $property custom color and original binding inverse", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const original = [row.before, row.companion].filter(Boolean).join(" ");
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "custom", value: "#123456" },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: row.property,
		scope: "",
		className: plan.next,
		absent: false,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
		effects: plan.consumers,
		css: plan.desired.css,
	};
	const subject = (classes: string) =>
		row.tag === "rect"
			? `<svg width="40" height="40"><rect data-subject class="${classes}" x="2" y="2" width="30" height="30"/></svg>`
			: row.tag === "input"
				? `<input data-subject type="${row.property === "accent-color" ? "checkbox" : "text"}" checked value="native" class="${classes}"/>`
				: `<div data-subject class="${classes}">Native text</div>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${subject(plan.next)}${subject(original)}`,
	);
	if (row.property === "caret-color") await f.page.locator("[data-subject]").first().focus();
	expect(
		(await f.inspect(expected)).map((outcome) => outcome.rendered),
		JSON.stringify(expected.effects),
	).toEqual(row.property === "caret-color" ? ["verified", "unverified"] : ["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), row.property),
	).toBe("rgb(18, 52, 86)");
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: original,
		css: plan.original.css,
		effects: propertyConsumers(plan.original, plan.roots, environment),
	};
	if (row.property === "caret-color") {
		await f.page.locator("[data-subject]").nth(1).focus();
		expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["unverified", "mismatching"]);
	}
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(
		row.property === "caret-color" ? ["unverified", "verified"] : ["mismatching", "verified"],
	);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style><section style="color:#345678;fill:#345678;stroke:#345678">${subject(removal.next)}${subject(original)}</section>`,
	);
	if (row.property === "caret-color") await empty.page.locator("[data-subject]").first().focus();
	const emptyOutcomes = (await empty.inspect(removed)).map((outcome) => outcome.rendered);
	if (["caret-color", "accent-color"].includes(row.property)) {
		expect(emptyOutcomes[0]).toBe("unverified"); // Native auto/system paint has no independent lexical color.
	} else {
		expect(emptyOutcomes).toEqual(["verified", "mismatching"]);
		expect(
			await empty.page
				.locator("[data-subject]")
				.first()
				.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), row.property),
		).toBe("rgb(52, 86, 120)");
		expect((await empty.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	}
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element, property) => {
			if (!(element instanceof HTMLElement || element instanceof SVGElement)) throw new Error("missing native host");
			if (property === "outline-color") element.style.outlineStyle = "none";
			if (property === "text-decoration-color") element.style.textDecorationLine = "none";
			if (property === "caret-color" && element instanceof HTMLInputElement) {
				element.readOnly = true;
				element.focus();
			}
			if (property === "accent-color") element.style.appearance = "none";
			if (property === "fill") element.setAttribute("width", "0");
			if (property === "stroke") element.style.strokeWidth = "0";
		}, row.property);
	expect((await f.inspect(expected))[0]?.rendered).toBe("unverified");
});

it.each(appearanceProperties.filter((row) => row.index >= 50 && row.index <= 61))(
	"verifies compiled transform $property with preserved axes and exact inverse",
	async (row) => {
		const { root } = makeProject(makeTempDir());
		writeDesignFile(root, "shared/tokens.css", "");
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		const operation = { kind: "property", property: row.property, scope: "" } as const;
		const companions: Record<string, string> = {
			"scale-x": "scale-y-75",
			"scale-y": "scale-x-75",
			"rotate-x": "rotate-y-6 skew-x-8",
			"rotate-y": "rotate-x-6 skew-y-8",
			"skew-x": "rotate-x-6 skew-y-8",
			"skew-y": "rotate-y-6 skew-x-8",
			skew: "rotate-x-6",
			"translate-x": "translate-y-6",
			"translate-y": "translate-x-6",
		};
		const original = [row.before, companions[row.property]].filter(Boolean).join(" ");
		const plan = await planPropertyValue(
			root,
			new Map([[file, readInput(file)]]),
			original,
			operation,
			{ kind: "binding", tokens: [row.after] },
			environment,
		);
		const expected: SourcePropertyExpectation = {
			kind: "property",
			property: row.property,
			scope: "",
			className: plan.next,
			absent: false,
			css: plan.desired.css,
			effects: plan.consumers,
			scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
		};
		const subject = (classes: string) =>
			`<div data-subject class="${classes}" style="width:80px;height:40px">Native transform</div>`;
		const f = await fixture(
			`<!doctype html><style>${plan.original.css}${expected.css}</style>${subject(plan.next)}${subject(original)}`,
		);
		expect(
			(await f.inspect(expected)).map((outcome) => outcome.rendered),
			JSON.stringify(expected.effects),
		).toEqual(["verified", "mismatching"]);
		if (companions[row.property]) {
			const companion = expected.effects.find(
				(effect) => effect.owner !== null && effect.owner !== row.after && effect.property.startsWith("--tw-"),
			);
			expect(companion, "the native expectation retains independently owned axis inputs").toBeDefined();
			if (!companion) throw new Error("missing native companion");
			expect(
				(await f.inspect({ ...expected, effects: expected.effects.filter((effect) => effect !== companion) })).map(
					(outcome) => outcome.rendered,
				),
			).toEqual(["unverified", "unverified"]);
			await f.page
				.locator("[data-subject]")
				.first()
				.evaluate((element, effect) => {
					if (!(element instanceof HTMLElement)) throw new Error("missing native transform host");
					element.style.setProperty(effect.property, effect.value.replace(/\d+/, "31"));
				}, companion);
			expect((await f.inspect(expected))[0]?.rendered).toBe("mismatching");
			await f.page
				.locator("[data-subject]")
				.first()
				.evaluate((element, property) => {
					if (!(element instanceof HTMLElement)) throw new Error("missing native transform host");
					element.style.removeProperty(property);
				}, companion.property);
		}
		const inverse: SourcePropertyExpectation = {
			...expected,
			className: original,
			css: plan.original.css,
			effects: nativePropertyEffects(plan.original, plan.roots, environment),
		};
		expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
		const removal = await planPropertyValue(
			root,
			new Map([[file, readInput(file)]]),
			original,
			operation,
			{ kind: "remove" },
			environment,
		);
		const removed: SourcePropertyExpectation = {
			...expected,
			className: removal.next,
			absent: !removal.next,
			css: removal.desired.css,
			effects: removal.consumers,
		};
		const empty = await fixture(
			`<!doctype html><style>${removal.original.css}${removed.css}</style>${subject(removal.next)}${subject(original)}`,
		);
		expect((await empty.inspect(removed)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
		expect((await empty.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	},
);

it.each([
	...appearanceProperties.filter((row) => row.index >= 62 && row.index <= 65),
	...FILTER_SET.groups.flat().map((token) => ({ property: "filter", before: "filter-none", after: token })),
])("verifies compiled filter $property $after with native companions and inverse", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const original = row.property === "filter" ? row.before : `${row.before} grayscale`;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "binding", tokens: [row.after] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: row.property,
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	const subject = (classes: string) =>
		`<div data-subject class="${classes}" style="width:80px;height:40px;background:#123456">Native filter</div>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${subject(plan.next)}${subject(original)}`,
	);
	expect(
		(await f.inspect(expected)).map((outcome) => outcome.rendered),
		JSON.stringify(expected.effects),
	).toEqual(["verified", "mismatching"]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: original,
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		plan.next,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style>${subject(removal.next)}${subject(plan.next)}`,
	);
	expect((await empty.inspect(removed)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect((await empty.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it.each(["filter", "blur-xs"])("checks compiled %s default and outside variable context", async (classes) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: classes === "filter" ? "brightness" : "filter", scope: "" } as const;
	const removal =
		classes === "filter"
			? await planPropertyValue(
					root,
					new Map([[file, readInput(file)]]),
					"filter brightness-50",
					operation,
					{ kind: "remove" },
					environment,
				)
			: undefined;
	const certificate =
		removal?.desired ?? (await compilePropertySource(root, new Map([[file, readInput(file)]]), classes));
	if (removal) expect(removal.next).toBe("filter");
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: operation.property,
		scope: "",
		className: classes,
		absent: false,
		css: certificate.css,
		effects: removal?.consumers ?? nativePropertyEffects(certificate, new Set(["filter"]), environment),
		scopePaths: propertyScopePaths(removal?.original ?? certificate, certificate, operation, environment),
	};
	const outside = classes === "filter" ? "--tw-brightness:brightness(.25)" : "--blur-xs:8px";
	const f = await fixture(
		`<!doctype html><style>${expected.css}</style><div data-subject class="${classes}">Default</div><div data-subject class="${classes}" style="${outside}">Outside variable</div>`,
	);
	const outcomes = await f.inspect(expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify(outcomes),
	).toEqual(["verified", classes === "filter" ? "mismatching" : "unverified"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).filter)),
	).toEqual(classes === "filter" ? ["none", "brightness(0.25)"] : ["blur(4px)", "blur(8px)"]);
});

it.each(
	appearanceProperties
		.filter((row) => [66, 67, 131].includes(row.index))
		.flatMap((row) => [
			{ ...row, companion: "" },
			{ ...row, companion: "transition-opacity" },
		]),
)("verifies compiled $property with $companion and original default inverse", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const original = [row.before, row.companion].filter(Boolean).join(" ");
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "binding", tokens: [row.after] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: row.property,
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	const subject = (classes: string) => `<div data-subject class="${classes}">Configured native transition</div>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${subject(plan.next)}${subject(original)}`,
	);
	expect(
		(await f.inspect(expected)).map((outcome) => outcome.rendered),
		JSON.stringify(expected.effects),
	).toEqual(["verified", "mismatching"]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: original,
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style>${subject(removal.next)}${subject(original)}`,
	);
	expect((await empty.inspect(removed)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect((await empty.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	if (row.companion) {
		expect(removal.next, "removal must preserve the independently authored transition property").not.toBe("");
		expect(
			await empty.page
				.locator("[data-subject]")
				.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transitionProperty)),
		).toEqual(["opacity", "opacity"]);
		const companions = [
			"transition-property",
			"transition-duration",
			"transition-delay",
			"transition-timing-function",
		].filter((property) => property !== row.property);
		for (const native of [f, empty]) {
			const values = await native.page
				.locator("[data-subject]")
				.evaluateAll(
					(elements, properties) =>
						elements.map((element) =>
							properties.map((property) => getComputedStyle(element).getPropertyValue(property)),
						),
					companions,
				);
			expect(values[0]).toEqual(values[1]);
		}
	}
	if (row.companion && row.property !== "transition-delay") {
		const variable =
			row.property === "transition-duration"
				? "--default-transition-duration"
				: "--default-transition-timing-function";
		const value = row.property === "transition-duration" ? "3s" : "linear";
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate(
				(element, context) => {
					if (!(element instanceof HTMLElement)) throw new Error("missing native host");
					element.style.setProperty(context.variable, context.value);
				},
				{ variable, value },
			);
		// The owned input wins before the nested default; its unused fallback grants no authority.
		expect((await f.inspect(expected))[0]?.rendered).toBe("verified");
	}
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native host");
			element.style.transitionProperty = "none";
		});
	expect((await f.inspect(expected))[0]?.rendered).toBe("unverified");
});

it.each([
	{ property: "transition-duration", before: "duration-2", after: "duration-[2.5ms]", native: "0.0025s" },
	{ property: "transition-delay", before: "delay-2", after: "delay-[2.5ms]", native: "0.0025s" },
	{ property: "transition-timing-function", before: "ease-in", after: "ease-project", native: "steps(4, jump-none)" },
])("verifies compiled transition option $after without adopting changed theme context", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "@theme { --ease-project: steps(4, jump-none); }");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		row.before,
		operation,
		{ kind: "binding", tokens: [row.after] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: row.property,
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style><div data-subject class="${plan.next}">Desired</div><div data-subject class="${row.before}">Original</div>`,
	);
	expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), row.property),
	).toBe(row.native);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: row.before,
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	if (row.after === "ease-project") {
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element) => {
				if (!(element instanceof HTMLElement)) throw new Error("missing native host");
				element.style.setProperty("--ease-project", "linear");
			});
		expect((await f.inspect(expected))[0]?.rendered).toBe("unverified");
	}
});

it.each(["transition-duration", "transition-timing-function"])(
	"guards actual compiled nested %s default context",
	async (property) => {
		const { root } = makeProject(makeTempDir());
		writeDesignFile(root, "shared/tokens.css", "");
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		const operation = { kind: "property", property, scope: "" } as const;
		const certificate = await compilePropertySource(root, new Map([[file, readInput(file)]]), "transition-opacity");
		const expected: SourcePropertyExpectation = {
			kind: "property",
			property,
			scope: "",
			className: "transition-opacity",
			absent: false,
			css: certificate.css,
			effects: nativePropertyEffects(certificate, new Set([property]), environment),
			scopePaths: propertyScopePaths(certificate, certificate, operation, environment),
		};
		const variable =
			property === "transition-duration" ? "--default-transition-duration" : "--default-transition-timing-function";
		const value = property === "transition-duration" ? "3s" : "linear";
		const f = await fixture(
			`<!doctype html><style>${expected.css}</style><div data-subject class="transition-opacity">Original default</div><div data-subject class="transition-opacity" style="${variable}:${value}">Changed context</div><div data-subject class="transition-opacity" style="${property === "transition-duration" ? "--tw-duration:2s" : "--tw-ease:linear"}">Outside optional input</div>`,
		);
		const outcomes = await f.inspect(expected);
		expect(
			outcomes.map((outcome) => outcome.rendered),
			JSON.stringify({ outcomes, effects: expected.effects, scopePaths: expected.scopePaths }),
		).toEqual(["verified", "unverified", "unverified"]);
	},
);

it.each([
	{ property: "box-shadow", before: "shadow-sm", after: "shadow-md", companion: "" },
	{ property: "ring-width", before: "ring-2", after: "ring-4", companion: "" },
	{ property: "ring-offset-width", before: "ring-offset-2", after: "ring-offset-4", companion: "ring-2" },
	{ property: "ring-color", before: "ring-red-500", after: "ring-blue-500", companion: "ring-2" },
	{ property: "box-shadow color", before: "shadow-red-500", after: "shadow-blue-500", companion: "shadow-sm" },
])("verifies compiled shadow $property against its captured native box shadow", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const original = [row.before, row.companion].filter(Boolean).join(" ");
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "binding", tokens: [row.after] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: row.property,
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	const subject = (classes: string) =>
		`<div data-subject class="${classes}" style="width:80px;height:40px;color:#123456">Native shadow</div>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${subject(plan.next)}${subject(original)}`,
	);
	expect(
		(await f.inspect(expected)).map((outcome) => outcome.rendered),
		JSON.stringify(expected.effects),
	).toEqual(["verified", "mismatching"]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: original,
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style>${subject(removal.next)}${subject(original)}`,
	);
	const cleared = await empty.inspect(removed);
	expect(
		cleared.map((outcome) => outcome.rendered),
		JSON.stringify({ cleared, effects: removed.effects }),
	).toEqual(["verified", "mismatching"]);
	expect((await empty.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	// An outside change to any captured native input is a mismatch, never a silent pass.
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native shadow host");
			element.style.setProperty("--tw-inset-shadow", "0 0 0 3px #ff0000");
		});
	expect((await f.inspect(expected))[0]?.rendered).toBe("mismatching");
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native shadow host");
			element.style.removeProperty("--tw-inset-shadow");
			element.style.boxShadow = "none";
		});
	expect((await f.inspect(expected))[0]?.rendered).toBe("mismatching");
});

it.each([
	{
		property: "font-family",
		before: "font-sans",
		after: "font-serif",
		outside: "--font-serif",
		verdict: "unverified",
	},
	{
		property: "font-variant-numeric",
		before: "normal-nums",
		after: "ordinal",
		outside: "--tw-slashed-zero",
		verdict: "mismatching",
	},
	{
		property: "letter-spacing",
		before: "tracking-normal",
		after: "tracking-wide",
		outside: "--tw-tracking",
		verdict: "mismatching",
	},
])("verifies compiled typography $property against each native use", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		row.before,
		operation,
		{ kind: "binding", tokens: [row.after] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: row.property,
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	// An alias-free inherited family keeps the removal context independently provable.
	const subject = (first: string, second: string) =>
		`<section style="font-family:Georgia,serif"><p data-subject class="${first}">Native 1234 typography</p><p data-subject class="${second}">Native 1234 typography</p></section>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${subject(plan.next, row.before)}`,
	);
	await f.page.evaluate(() => document.fonts.ready.then(() => undefined));
	const outcomes = await f.inspect(expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify({ outcomes, effects: expected.effects }),
	).toEqual(["verified", "mismatching"]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: row.before,
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	const original = await f.inspect(inverse);
	// The retained sans list names a platform alias. Engines differ on whether they keep that
	// name through serialization, so read which this one did instead of assuming either.
	let aliasSurvives = true;
	if (row.property === "font-family") {
		const observed = await f.page
			.locator("[data-subject]")
			.nth(1)
			.evaluate((element) => getComputedStyle(element).fontFamily);
		expect(observed.startsWith("-apple-system"), observed).toBe(true);
		// The replacement name may come back quoted, so read the entry rather than a bare token.
		expect(/(?:^|[\s,])"?(?:BlinkMacSystemFont|system-ui)"?(?:[\s,]|$)/.test(observed), observed).toBe(true);
		// Kept, and the lists compare; collapsed to another name, and the comparator has no proof.
		aliasSurvives = observed.includes("BlinkMacSystemFont");
	}
	expect(
		original.map((outcome) => outcome.rendered),
		JSON.stringify(original),
	).toEqual(["mismatching", aliasSurvives ? "verified" : "unverified"]);
	// Removing the authored value must read against the compiled initial or inherited context.
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		plan.next,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style>${subject(removal.next, plan.next)}`,
	);
	await empty.page.evaluate(() => document.fonts.ready.then(() => undefined));
	const cleared = await empty.inspect(removed);
	expect(
		cleared.map((outcome) => outcome.rendered),
		JSON.stringify({ cleared, effects: removed.effects }),
	).toEqual(["verified", "mismatching"]);
	expect((await empty.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	// An outside change to a captured input is never a silent pass.
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element, outside) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native typography host");
			element.style.setProperty(
				outside,
				outside === "--tw-tracking" ? "1px" : outside === "--tw-slashed-zero" ? "slashed-zero" : "Verdana",
			);
		}, row.outside);
	expect((await f.inspect(expected))[0]?.rendered).toBe(row.verdict);
});

it.each([
	{ property: "border-inline-width", before: "border-x-2", after: "border-x-4", companion: "", side: "" },
	{ property: "border-block-width", before: "border-y-2", after: "border-y-4", companion: "", side: "" },
	{ property: "border-inline-start-width", before: "border-s-2", after: "border-s-4", companion: "", side: "right" },
	{ property: "border-inline-end-width", before: "border-e-2", after: "border-e-4", companion: "", side: "left" },
	{ property: "outline-width", before: "outline-2", after: "outline-4", companion: "outline-solid", side: "" },
	{
		property: "outline-offset",
		before: "outline-offset-2",
		after: "outline-offset-4",
		companion: "outline-2 outline-solid",
		side: "",
	},
	{ property: "stroke-width", before: "stroke-2", after: "stroke-4", companion: "stroke-red-500", side: "" },
])("verifies compiled width $property against its own native side", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const original = [row.before, row.companion].filter(Boolean).join(" ");
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "binding", tokens: [row.after] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: row.property,
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	const host = (classes: string) =>
		row.property === "stroke-width"
			? `<svg width="60" height="60"><rect data-subject class="${classes}" x="6" y="6" width="40" height="40"/></svg>`
			: `<div data-subject class="${classes}" style="width:60px;height:40px">Native width</div>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${host(plan.next)}${host(original)}`,
	);
	const outcomes = await f.inspect(expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify({ outcomes, effects: expected.effects }),
	).toEqual(["verified", "mismatching"]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: original,
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		plan.next,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style>${host(removal.next)}${host(plan.next)}`,
	);
	const cleared = await empty.inspect(removed);
	// Only the outline width has no native length for its initial keyword; it stays unverified.
	expect(
		cleared.map((outcome) => outcome.rendered),
		JSON.stringify({ cleared, effects: removed.effects }),
	).toEqual(row.property === "outline-width" ? ["unverified", "unverified"] : ["verified", "mismatching"]);
	if (row.property === "outline-width")
		expect(cleared[0]?.reason, JSON.stringify({ cleared, effects: removed.effects })).toContain("initial");
	expect((await empty.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	if (row.side) {
		// A right-to-left use must read the physical side its own native context selects.
		const side = (extra: string) =>
			`<div data-subject dir="rtl" class="${plan.next}" style="width:60px;height:40px;${extra}">Native width</div>`;
		const rtl = await fixture(
			`<!doctype html><style>${expected.css}</style>${side("")}${side(`border-${row.side}-width:9px;border-${row.side}-style:solid`)}`,
		);
		expect((await rtl.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	}
});

it.each([
	{ property: "text-indent", before: "indent-2", after: "indent-4", companion: "", native: "16px", box: "" },
	{
		property: "text-decoration-thickness",
		before: "decoration-2",
		after: "decoration-4",
		companion: "underline",
		native: "4px",
		box: "",
	},
	{
		property: "text-underline-offset",
		before: "underline-offset-2",
		after: "underline-offset-4",
		companion: "underline",
		native: "4px",
		box: "",
	},
	{
		property: "-webkit-line-clamp",
		before: "line-clamp-2",
		after: "line-clamp-4",
		companion: "",
		native: "4",
		box: "display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;",
	},
])("verifies compiled type length $property against its applicable native use", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const original = [row.before, row.companion].filter(Boolean).join(" ");
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "binding", tokens: [row.after] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: row.property,
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	const host = (classes: string) =>
		`<p data-subject class="${classes}" style="${row.box}width:120px">Native retained type length</p>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${host(plan.next)}${host(original)}`,
	);
	const outcomes = await f.inspect(expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify({ outcomes, effects: expected.effects }),
	).toEqual(["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), row.property),
	).toBe(row.native);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: original,
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		plan.next,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style>${host(removal.next)}${host(plan.next)}`,
	);
	const cleared = await empty.inspect(removed);
	expect(
		cleared.map((outcome) => outcome.rendered),
		JSON.stringify({ cleared, effects: removed.effects }),
	).toEqual(["verified", "mismatching"]);
	expect((await empty.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	// A native override outside the compiled closure is a mismatch, and losing the applicable
	// native surface is unverified rather than a silent pass.
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element, context) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native type length host");
			element.style.setProperty(context.property, context.property === "-webkit-line-clamp" ? "9" : "9px");
		}, row);
	expect((await f.inspect(expected))[0]?.rendered).toBe("mismatching");
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element, context) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native type length host");
			element.style.removeProperty(context.property);
			if (["-webkit-line-clamp", "text-indent"].includes(context.property)) element.style.display = "inline";
			else element.style.textDecorationLine = "none";
		}, row);
	expect((await f.inspect(expected))[0]?.rendered).toBe("unverified");
});

it("verifies the compiled all-corner radius against every native corner", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: "border-radius", scope: "" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		"rounded-[4px]",
		operation,
		{ kind: "binding", tokens: ["rounded-[8px]"] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: "border-radius",
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	const host = (classes: string) => `<div data-subject class="${classes}" style="width:60px;height:40px">Radius</div>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${host(plan.next)}${host("rounded-[4px]")}`,
	);
	const outcomes = await f.inspect(expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify({ outcomes, effects: expected.effects }),
	).toEqual(["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element) => getComputedStyle(element).borderRadius),
	).toBe("8px");
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: "rounded-[4px]",
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		plan.next,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style>${host(removal.next)}${host(plan.next)}`,
	);
	const cleared = await empty.inspect(removed);
	expect(
		cleared.map((outcome) => outcome.rendered),
		JSON.stringify({ cleared, effects: removed.effects }),
	).toEqual(["verified", "mismatching"]);
	expect((await empty.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	// A single outside corner is enough to refuse the whole row.
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native radius host");
			element.style.borderTopLeftRadius = "9px";
		});
	expect((await f.inspect(expected))[0]?.rendered).toBe("mismatching");
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native radius host");
			element.style.borderTopLeftRadius = "20% 30%";
		});
	expect((await f.inspect(expected))[0]?.rendered).toBe("unverified");
});

it("verifies the compiled placeholder color on its own native pseudo-element", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: "placeholder color", scope: "" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		"placeholder-red-500",
		operation,
		{ kind: "binding", tokens: ["placeholder-blue-500"] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: "placeholder color",
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	const host = (classes: string) =>
		`<input data-subject class="${classes}" placeholder="hint" style="color:rgb(20,30,40)">`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${host(plan.next)}${host("placeholder-red-500")}`,
	);
	const outcomes = await f.inspect(expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify({ outcomes, effects: expected.effects }),
	).toEqual(["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element) => getComputedStyle(element, "::placeholder").color),
	).toBe("oklch(0.623 0.214 259.815)");
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: "placeholder-red-500",
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		plan.next,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style>${host(removal.next)}${host(plan.next)}`,
	);
	const cleared = await empty.inspect(removed);
	expect(
		cleared.map((outcome) => outcome.rendered),
		JSON.stringify({ cleared, effects: removed.effects }),
	).toEqual(["verified", "mismatching"]);
	expect((await empty.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	// The pseudo-element is only readable while its native placeholder is shown.
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element) => {
			if (!(element instanceof HTMLInputElement)) throw new Error("missing native placeholder host");
			element.value = "typed";
		});
	expect((await f.inspect(expected))[0]?.rendered).toBe("unverified");
});

it.each([
	{ property: "border-color", before: "border-red-500", after: "border-blue-500", side: "" },
	{ property: "border-top-color", before: "border-t-red-500", after: "border-t-blue-500", side: "" },
	{ property: "border-right-color", before: "border-r-red-500", after: "border-r-blue-500", side: "" },
	{ property: "border-bottom-color", before: "border-b-red-500", after: "border-b-blue-500", side: "" },
	{ property: "border-left-color", before: "border-l-red-500", after: "border-l-blue-500", side: "" },
	{ property: "border-inline-color", before: "border-x-red-500", after: "border-x-blue-500", side: "" },
	{ property: "border-block-color", before: "border-y-red-500", after: "border-y-blue-500", side: "" },
	{ property: "border-inline-start-color", before: "border-s-red-500", after: "border-s-blue-500", side: "right" },
	{ property: "border-inline-end-color", before: "border-e-red-500", after: "border-e-blue-500", side: "left" },
])("verifies compiled $property against its own native border side", async (row) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: row.property, scope: "" } as const;
	const original = `${row.before} border-2`;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "binding", tokens: [row.after] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: row.property,
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	const host = (classes: string, extra = "", direction = "ltr") =>
		`<div data-subject dir="${direction}" class="${classes}" style="width:60px;height:40px;color:rgb(20,30,40);${extra}">Border</div>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${host(plan.next)}${host(original)}`,
	);
	const outcomes = await f.inspect(expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify({ outcomes, effects: expected.effects }),
	).toEqual(["verified", "mismatching"]);
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: original,
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		plan.next,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style>${host(removal.next)}${host(plan.next)}`,
	);
	// A cleared side falls back to the preflight current color, which is this element's own color.
	const cleared = await empty.inspect(removed);
	expect(
		cleared.map((outcome) => outcome.rendered),
		JSON.stringify({ cleared, effects: removed.effects }),
	).toEqual(["verified", "mismatching"]);
	expect((await empty.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	if (row.side) {
		// A right-to-left use must read the physical side its own native context selects.
		const rtl = await fixture(
			`<!doctype html><style>${expected.css}</style>${host(plan.next, "", "rtl")}${host(plan.next, `border-${row.side}-color:rgb(9,9,9)`, "rtl")}`,
		);
		expect((await rtl.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	}
	// A side with no painted native border is unverified, never a silent pass.
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native border host");
			element.style.borderStyle = "none";
		});
	expect((await f.inspect(expected))[0]?.rendered).toBe("unverified");
});

it("reports the compiled gradient's captured evidence and interpolation space honestly", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: "background-image", scope: "" } as const;
	const original = "bg-linear-to-r from-red-500 to-blue-500";
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "binding", tokens: ["bg-linear-to-r", "from-green-500", "to-blue-500"] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: "background-image",
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: nativePropertyEffects(plan.desired, plan.roots, environment),
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	// The captured closure carries the direction and the closing stop the native consumer reads.
	for (const input of ["--tw-gradient-position", "--tw-gradient-to", "--tw-gradient-stops"])
		expect(
			expected.effects.some((effect) => effect.owner !== null && effect.property === input),
			input,
		).toBe(true);
	const host = (classes: string) => `<div data-subject class="${classes}" style="width:80px;height:40px"></div>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${host(plan.next)}${host(original)}`,
	);
	const outcomes = await f.inspect(expected);
	const interpolating = await f.page.evaluate(() =>
		CSS.supports("background-image: linear-gradient(in lab, red, red)"),
	);
	if (interpolating) {
		// This engine keeps the compiler's oklab branch but does not expose the space it used,
		// so the comparator refuses instead of comparing with the space dropped.
		expect(
			outcomes.map((outcome) => outcome.rendered),
			JSON.stringify(outcomes),
		).toEqual(["unverified", "unverified"]);
		expect(outcomes[0]?.reason).toContain("interpolation space");
	} else {
		expect(
			outcomes.map((outcome) => outcome.rendered),
			JSON.stringify(outcomes),
		).toEqual(["verified", "mismatching"]);
	}
	// Losing any one captured companion is refused, never compared on partial evidence.
	const closing = expected.effects.find((effect) => effect.owner !== null && effect.property === "--tw-gradient-to");
	if (!closing) throw new Error("missing captured native gradient companion");
	const partial = await f.inspect({
		...expected,
		effects: expected.effects.filter((effect) => effect !== closing),
	});
	expect(
		partial.map((outcome) => outcome.rendered),
		JSON.stringify(partial),
	).toEqual(["unverified", "unverified"]);
	expect(partial[0]?.reason).toContain("complete captured variable and companion evidence");
});

it("compares a compiled gradient whose own branch carries no interpolation space", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const operation = { kind: "property", property: "background-image", scope: "" } as const;
	const original = "bg-[linear-gradient(to_right,#00ff00_0%,#0000ff_100%)]";
	const desired = "bg-[linear-gradient(to_right,#ff0000_0%,#0000ff_100%)]";
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		original,
		operation,
		{ kind: "binding", tokens: [desired] },
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property: "background-image",
		scope: "",
		className: plan.next,
		absent: false,
		css: plan.desired.css,
		effects: plan.consumers,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
	};
	const host = (classes: string) => `<div data-subject class="${classes}" style="width:80px;height:40px"></div>`;
	const f = await fixture(
		`<!doctype html><style>${plan.original.css}${expected.css}</style>${host(plan.next)}${host(original)}`,
	);
	const outcomes = await f.inspect(expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify({ outcomes, effects: expected.effects }),
	).toEqual(["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element) => getComputedStyle(element).backgroundImage),
	).toBe("linear-gradient(to right, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)");
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: original,
		css: plan.original.css,
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	expect((await f.inspect(inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	const removal = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		plan.next,
		operation,
		{ kind: "remove" },
		environment,
	);
	const removed: SourcePropertyExpectation = {
		...expected,
		className: removal.next,
		absent: !removal.next,
		css: removal.desired.css,
		effects: removal.consumers,
	};
	const empty = await fixture(
		`<!doctype html><style>${removal.original.css}${removed.css}</style>${host(removal.next)}${host(plan.next)}`,
	);
	// A cleared gradient computes to `none`, which the comparator reads as a value of its own.
	const cleared = await empty.inspect(removed);
	expect(
		cleared.map((outcome) => outcome.rendered),
		JSON.stringify({ cleared, effects: removed.effects }),
	).toEqual(["verified", "mismatching"]);
	expect(cleared[0]?.observed).toBe("none");
	expect((await empty.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
	// An outside native image is a mismatch, and losing the paint surface is unverified.
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native gradient host");
			element.style.backgroundImage = "linear-gradient(to right, #ff0000 0%, #00ff00 100%)";
		});
	expect((await f.inspect(expected))[0]?.rendered).toBe("mismatching");
	await f.page
		.locator("[data-subject]")
		.first()
		.evaluate((element) => {
			if (!(element instanceof HTMLElement)) throw new Error("missing native gradient host");
			element.style.removeProperty("background-image");
			element.style.visibility = "hidden";
		});
	expect((await f.inspect(expected))[0]?.rendered).toBe("unverified");
});

/** Plan one retained row from the real compiler, then read it back as this use's expectation. */
async function planned(
	literal: string,
	property: string,
	value: SourcePropertyValue,
	environment: SourcePropertyEnvironment = { direction: "ltr", writingMode: "horizontal-tb" },
) {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const operation = { kind: "property", property, scope: "" } as const;
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		literal,
		operation,
		value,
		environment,
	);
	const expected: SourcePropertyExpectation = {
		kind: "property",
		property,
		scope: "",
		className: plan.next,
		absent: false,
		scopePaths: propertyScopePaths(plan.original, plan.desired, operation, environment),
		effects: plan.consumers,
		css: plan.desired.css,
	};
	const inverse: SourcePropertyExpectation = {
		...expected,
		className: literal,
		css: plan.original.css,
		// The inverse is read exactly as the daemon sends it, carried variable inputs included.
		effects: nativePropertyEffects(plan.original, plan.roots, environment),
	};
	return { plan, expected, inverse, style: `${plan.original.css}${plan.desired.css}` };
}

it.each([
	{ property: "flex-direction", before: "flex flex-row", after: "flex-col", host: "" },
	{ property: "flex-wrap", before: "flex flex-wrap", after: "flex-nowrap", host: "" },
	{ property: "align-items", before: "flex items-start", after: "items-center", host: "" },
	{ property: "justify-content", before: "flex justify-start", after: "justify-center", host: "" },
	{ property: "align-self", before: "self-auto", after: "self-start", host: "display:flex" },
	{ property: "position", before: "static", after: "relative", host: "" },
	{ property: "overflow-x", before: "overflow-x-visible", after: "overflow-x-hidden", host: "" },
	{ property: "overflow-y", before: "overflow-y-visible", after: "overflow-y-hidden", host: "" },
	{ property: "display", before: "flex", after: "grid", host: "" },
])("verifies each compiled $property use against its own native keyword", async (row) => {
	const p = await planned(row.before, row.property, { kind: "binding", tokens: [row.after] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="${row.host}"><div data-subject class="${p.plan.next}">Changed</div><div data-subject class="${row.before}">Retained</div></div>`,
	);
	expect(
		(await f.inspect(p.expected)).map((outcome) => outcome.rendered),
		JSON.stringify(p.expected),
	).toEqual(["verified", "mismatching"]);
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it("verifies a hidden display against a use the engine never rendered", async () => {
	const p = await planned("flex", "display", { kind: "binding", tokens: ["hidden"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}">Hidden</div><div data-subject class="flex">Shown</div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect((await f.inspect(p.expected))[0]?.observed).toBe("none");
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it("refuses a removed display rather than guessing this host's native default", async () => {
	const p = await planned("flex", "display", { kind: "remove" });
	const f = await fixture(`<!doctype html><style>${p.style}</style><div data-subject>Default</div>`);
	expect(await f.inspect(p.expected)).toEqual([
		{ rendered: "unverified", reason: "this display has no independent native default declaration" },
	]);
});

it("verifies removed layout keywords from their initial value and refuses declaring hosts", async () => {
	const p = await planned("flex justify-center", "justify-content", { kind: "remove" });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}">Cleared</div><div data-subject class="flex justify-center">Retained</div><select data-subject class="${p.plan.next}"><option>One</option></select>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual([
		"verified",
		"mismatching",
		"unverified",
	]);
});

it("needs a native flexible or grid box before reading its alignment", async () => {
	const p = await planned("flex items-start", "align-items", { kind: "binding", tokens: ["items-center"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="items-center">Block</div><div data-subject class="${p.plan.next}">Flex</div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual(["unverified", "verified"]);
});

it("verifies both native overflow axes for the whole compiled row", async () => {
	const p = await planned("overflow-visible", "overflow", { kind: "binding", tokens: ["overflow-hidden"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}">Both</div><div data-subject class="overflow-visible">Retained</div><div data-subject class="${p.plan.next}" style="overflow-y:scroll">One axis</div>`,
	);
	// The third use really scrolls on one axis, so the whole row is a mismatch, not a refusal.
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual([
		"verified",
		"mismatching",
		"mismatching",
	]);
});

it("refuses a visible overflow the other native axis has already coupled", async () => {
	const p = await planned("overflow-x-hidden", "overflow-y", { kind: "binding", tokens: ["overflow-y-visible"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}">Coupled</div>`,
	);
	expect(await f.inspect(p.expected)).toEqual([
		{ rendered: "unverified", reason: "this visible overflow is coupled to the other native axis" },
	]);
});

it.each([
	{ property: "padding", before: "p-2", after: "p-4", sides: ["16px", "16px", "16px", "16px"] },
	{ property: "padding-inline", before: "px-2", after: "px-4", sides: ["8px", "16px", "8px", "16px"] },
	{ property: "padding-block", before: "py-2", after: "py-4", sides: ["16px", "8px", "16px", "8px"] },
	{ property: "padding-top", before: "pt-2", after: "pt-4", sides: ["16px", "8px", "8px", "8px"] },
	{ property: "padding-inline-start", before: "ps-2", after: "ps-4", sides: ["8px", "8px", "8px", "16px"] },
	{ property: "margin", before: "m-2", after: "m-4", sides: ["16px", "16px", "16px", "16px"] },
	{ property: "margin-inline", before: "mx-2", after: "mx-4", sides: ["8px", "16px", "8px", "16px"] },
	{ property: "margin-bottom", before: "mb-2", after: "mb-4", sides: ["8px", "8px", "16px", "8px"] },
	{ property: "margin-inline-end", before: "me-2", after: "me-4", sides: ["8px", "16px", "8px", "8px"] },
])("verifies the compiled $property side independently of the retained ones", async (row) => {
	// Every use starts from all four sides, so a change must move exactly the row's own sides.
	const whole = row.before.startsWith("p") ? "p-2" : "m-2";
	const start = row.before === whole ? whole : `${whole} ${row.before}`;
	const p = await planned(start, row.property, { kind: "binding", tokens: [row.after] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}">Changed</div><div data-subject class="${start}">Retained</div>`,
	);
	expect(
		(await f.inspect(p.expected)).map((outcome) => outcome.rendered),
		JSON.stringify(p.expected),
	).toEqual(["verified", "mismatching"]);
	const box = row.before.startsWith("p") ? "padding" : "margin";
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate(
				(element, name) =>
					["top", "right", "bottom", "left"].map((side) =>
						getComputedStyle(element).getPropertyValue(`${name}-${side}`),
					),
				box,
			),
	).toEqual(row.sides);
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it.each([
	{ mode: "horizontal-tb", direction: "rtl", side: "padding-right" },
	{ mode: "vertical-rl", direction: "ltr", side: "padding-top" },
	{ mode: "vertical-lr", direction: "rtl", side: "padding-bottom" },
])("reads a logical spacing in the $mode $direction context this use actually resolves", async (row) => {
	const p = await planned(
		"p-2",
		"padding-inline-start",
		{ kind: "binding", tokens: ["ps-4"] },
		{
			direction: row.direction as "ltr" | "rtl",
			writingMode: row.mode,
		},
	);
	const style = `writing-mode:${row.mode};direction:${row.direction}`;
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}" style="${style}">Logical</div><div data-subject class="p-2" style="${style}">Retained</div><div data-subject class="${p.plan.next}" style="writing-mode:sideways-rl">Unknown mode</div>`,
	);
	expect(
		(await f.inspect(p.expected)).map((outcome) => outcome.rendered),
		JSON.stringify(p.expected),
	).toEqual(["verified", "mismatching", "unverified"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element, side) => getComputedStyle(element).getPropertyValue(side), row.side),
	).toBe("16px");
});

it("verifies removed spacing against the compiler's own zero declaration", async () => {
	const p = await planned("p-4 m-4", "padding", { kind: "remove" });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}">Cleared</div><div data-subject class="p-4 m-4">Retained</div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect(p.plan.next).toContain("m-4");
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element) => [getComputedStyle(element).paddingTop, getComputedStyle(element).marginTop]),
	).toEqual(["0px", "16px"]);
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it("verifies a negative compiled margin and an authored zero", async () => {
	const p = await planned("mt-4", "margin-top", { kind: "binding", tokens: ["-mt-4"] });
	const zero = await planned("mt-4", "margin-top", { kind: "binding", tokens: ["mt-0"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}${zero.plan.desired.css}</style><div data-subject class="${p.plan.next}">Negative</div><div data-subject class="${zero.plan.next}">Zero</div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect((await f.inspect(p.expected))[0]?.observed).toBe("-16px");
	expect((await f.inspect(zero.expected)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it("refuses an automatic margin and a percentage this use resolves against its own box", async () => {
	const auto = await planned("mx-4", "margin-inline", { kind: "binding", tokens: ["mx-auto"] });
	const percent = await planned("p-4", "padding", { kind: "custom", value: "10%" });
	const f = await fixture(
		`<!doctype html><style>${auto.style}${percent.plan.desired.css}</style><div data-subject class="${auto.plan.next} ${percent.plan.next}">Both</div>`,
	);
	expect(await f.inspect(auto.expected)).toEqual([
		{ rendered: "unverified", reason: "this box spacing has no independent native length" },
	]);
	expect(await f.inspect(percent.expected)).toEqual([
		{ rendered: "unverified", reason: "this box spacing has no independent native length" },
	]);
});

it("needs a rendered native box before reading its spacing", async () => {
	const p = await planned("p-2", "padding", { kind: "binding", tokens: ["p-4"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}" style="display:none">Hidden</div><div data-subject class="${p.plan.next}" style="display:contents">Contents</div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual(["unverified", "unverified"]);
});

it.each([
	{ property: "gap", before: "gap-2", after: "gap-4", axes: ["16px", "16px"] },
	{ property: "column-gap", before: "gap-x-2", after: "gap-x-4", axes: ["8px", "16px"] },
	{ property: "row-gap", before: "gap-y-2", after: "gap-y-4", axes: ["16px", "8px"] },
])("verifies the compiled $property axis of a native gap container", async (row) => {
	const start = row.before === "gap-2" ? "flex gap-2" : `flex gap-2 ${row.before}`;
	const p = await planned(start, row.property, { kind: "binding", tokens: [row.after] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}"><span>One</span><span>Two</span></div><div data-subject class="${start}"><span>One</span><span>Two</span></div>`,
	);
	expect(
		(await f.inspect(p.expected)).map((outcome) => outcome.rendered),
		JSON.stringify(p.expected),
	).toEqual(["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element) => [getComputedStyle(element).rowGap, getComputedStyle(element).columnGap]),
	).toEqual(row.axes);
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it("verifies a removed gap against the native normal spacing of its own container", async () => {
	const p = await planned("flex gap-4", "gap", { kind: "remove" });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}"><span>One</span></div><div data-subject class="flex gap-4"><span>One</span></div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect((await f.inspect(p.expected))[0]?.observed).toBe("normal normal");
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it("needs a native gap container, and reads a multi-column gap on its own axis", async () => {
	const p = await planned("gap-2", "column-gap", { kind: "binding", tokens: ["gap-x-4"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}">Block</div><div data-subject class="${p.plan.next}" style="columns:2">Columns</div><div data-subject class="${p.plan.next}" style="display:grid">Grid</div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual([
		"unverified",
		"verified",
		"verified",
	]);
});

it("mismatches the whole gap row when only one native axis carries the change", async () => {
	const p = await planned("flex gap-2", "gap", { kind: "binding", tokens: ["gap-4"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}" style="row-gap:8px"><span>One</span></div>`,
	);
	expect((await f.inspect(p.expected))[0]?.rendered).toBe("mismatching");
});

it.each([
	{ property: "top", before: "top-2", after: "top-4", sides: ["16px", "8px", "8px", "8px"] },
	{ property: "right", before: "right-2", after: "right-4", sides: ["8px", "16px", "8px", "8px"] },
	{ property: "bottom", before: "bottom-2", after: "bottom-4", sides: ["8px", "8px", "16px", "8px"] },
	{ property: "left", before: "left-2", after: "left-4", sides: ["8px", "8px", "8px", "16px"] },
	{ property: "inset", before: "inset-2", after: "inset-4", sides: ["16px", "16px", "16px", "16px"] },
	{ property: "inset-inline", before: "inset-x-2", after: "inset-x-4", sides: ["8px", "16px", "8px", "16px"] },
	{ property: "inset-block", before: "inset-y-2", after: "inset-y-4", sides: ["16px", "8px", "16px", "8px"] },
	{ property: "inset-inline-start", before: "start-2", after: "start-4", sides: ["8px", "8px", "8px", "16px"] },
	{ property: "inset-inline-end", before: "end-2", after: "end-4", sides: ["8px", "16px", "8px", "8px"] },
])("verifies the compiled $property offset of a positioned native box", async (row) => {
	const start = row.before === "inset-2" ? "absolute inset-2" : `absolute inset-2 ${row.before}`;
	const p = await planned(start, row.property, { kind: "binding", tokens: [row.after] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="position:relative;width:300px;height:200px"><div data-subject class="${p.plan.next}">Changed</div><div data-subject class="${start}">Retained</div><div data-subject class="${p.plan.next.replace("absolute", "static")}">Static</div></div>`,
	);
	expect(
		(await f.inspect(p.expected)).map((outcome) => outcome.rendered),
		JSON.stringify(p.expected),
	).toEqual(["verified", "mismatching", "unverified"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element) => {
				const style = getComputedStyle(element);
				return [style.top, style.right, style.bottom, style.left];
			}),
	).toEqual(row.sides);
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual([
		"mismatching",
		"verified",
		"unverified",
	]);
});

it.each([
	{ mode: "horizontal-tb", direction: "rtl", side: "right" },
	{ mode: "vertical-rl", direction: "ltr", side: "top" },
])("reads a logical offset in the $mode $direction context this use actually resolves", async (row) => {
	const p = await planned(
		"absolute inset-2",
		"inset-inline-start",
		{ kind: "binding", tokens: ["start-4"] },
		{
			direction: row.direction as "ltr" | "rtl",
			writingMode: row.mode,
		},
	);
	const style = `writing-mode:${row.mode};direction:${row.direction}`;
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="position:relative;width:300px;height:200px"><div data-subject class="${p.plan.next}" style="${style}">Logical</div><div data-subject class="absolute inset-2" style="${style}">Retained</div></div>`,
	);
	expect(
		(await f.inspect(p.expected)).map((outcome) => outcome.rendered),
		JSON.stringify(p.expected),
	).toEqual(["verified", "mismatching"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element, side) => getComputedStyle(element).getPropertyValue(side), row.side),
	).toBe("16px");
});

it("verifies a removed offset only where a native box still reports it as automatic", async () => {
	const p = await planned("sticky top-4", "top", { kind: "remove" });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="height:200px;overflow:auto"><div data-subject class="${p.plan.next}">Sticky</div><div data-subject class="sticky top-4">Retained</div><div data-subject class="${p.plan.next.replace("sticky", "relative")}">Relative</div></div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual([
		"verified",
		"mismatching",
		"unverified",
	]);
	expect((await f.inspect(p.expected))[0]?.observed).toBe("auto");
});

it.each([
	{ property: "z-index", before: "relative z-2", after: "z-4", host: "", observed: "4" },
	{ property: "order", before: "order-2", after: "order-4", host: "display:flex", observed: "4" },
	{ property: "flex", before: "flex-1", after: "flex-auto", host: "display:flex", observed: "1 1 auto" },
	{
		property: "grid-column",
		before: "col-span-2",
		after: "col-span-4",
		host: "display:grid",
		observed: "span 4 span 4",
	},
	{ property: "grid-row", before: "row-span-2", after: "row-span-4", host: "display:grid", observed: "span 4 span 4" },
	{ property: "grid-column-start", before: "col-start-2", after: "col-start-4", host: "display:grid", observed: "4" },
	{ property: "grid-row-start", before: "row-start-2", after: "row-start-4", host: "display:grid", observed: "4" },
	{ property: "columns", before: "columns-2", after: "columns-4", host: "", observed: "4 auto" },
	{ property: "scroll-snap-type", before: "snap-none", after: "snap-x", host: "", observed: "x" },
])("verifies the whole compiled $property declaration against its own native box", async (row) => {
	const p = await planned(row.before, row.property, { kind: "binding", tokens: [row.after] });
	const scroll = row.property === "scroll-snap-type" ? "overflow:auto;" : "";
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="${row.host}"><div data-subject class="${p.plan.next}" style="${scroll}">Changed</div><div data-subject class="${row.before}" style="${scroll}">Retained</div></div>`,
	);
	expect(
		(await f.inspect(p.expected)).map((outcome) => outcome.rendered),
		JSON.stringify(p.expected),
	).toEqual(["verified", "mismatching"]);
	expect((await f.inspect(p.expected))[0]?.observed).toBe(row.observed);
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it.each(["z-index", "order", "grid-column-start", "columns", "scroll-snap-type"])(
	"refuses a %s the native box it sits in never applies",
	async (property) => {
		const rows: Record<string, { before: string; after: string }> = {
			"z-index": { before: "relative z-2", after: "z-4" },
			order: { before: "order-2", after: "order-4" },
			"grid-column-start": { before: "col-start-2", after: "col-start-4" },
			columns: { before: "columns-2", after: "columns-4" },
			"scroll-snap-type": { before: "snap-none", after: "snap-x" },
		};
		const row = rows[property]!;
		const p = await planned(row.before, property, { kind: "binding", tokens: [row.after] });
		// Each case puts the row on a native box that never applies it: an unpositioned box, a
		// block parent for an item row, a flexible box for a column count, an unscrollable box.
		const style = property === "z-index" ? "position:static" : property === "columns" ? "display:flex" : "";
		const f = await fixture(
			`<!doctype html><style>${p.style}</style><div><div data-subject class="${p.plan.next.replace("relative", "")}" style="${style}">Outside</div></div>`,
		);
		expect((await f.inspect(p.expected))[0]?.rendered).toBe("unverified");
	},
);

it("verifies a compiled track list by the number of tracks the grid actually made", async () => {
	const p = await planned("grid grid-cols-2", "grid-template-columns", { kind: "binding", tokens: ["grid-cols-4"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}" style="width:400px"><i>a</i></div><div data-subject class="grid grid-cols-2" style="width:400px"><i>a</i></div><div data-subject class="${p.plan.next.replace("grid ", "")}" style="width:400px"><i>a</i></div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual([
		"verified",
		"mismatching",
		"unverified",
	]);
});

it("verifies removed declarations against the initial value each row stands at", async () => {
	const p = await planned("flex-1", "flex", { kind: "remove" });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="display:flex"><div data-subject class="${p.plan.next}">Cleared</div><div data-subject class="flex-1">Retained</div></div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect((await f.inspect(p.expected))[0]?.observed).toBe("0 1 auto");
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it.each([
	{ property: "width", before: "w-2", after: "w-4", host: "", observed: "16px" },
	{ property: "height", before: "h-2", after: "h-4", host: "", observed: "16px" },
	{ property: "min-width", before: "min-w-2", after: "min-w-4", host: "", observed: "16px" },
	{ property: "max-width", before: "max-w-2", after: "max-w-4", host: "", observed: "16px" },
	{ property: "min-height", before: "min-h-2", after: "min-h-4", host: "", observed: "16px" },
	{ property: "max-height", before: "max-h-2", after: "max-h-4", host: "", observed: "16px" },
	{ property: "flex-basis", before: "basis-2", after: "basis-4", host: "display:flex", observed: "16px" },
])("verifies the compiled $property against the box this use actually has", async (row) => {
	const p = await planned(row.before, row.property, { kind: "binding", tokens: [row.after] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="width:300px;${row.host}"><div data-subject class="${p.plan.next}">A</div><div data-subject class="${row.before}">B</div></div>`,
	);
	expect(
		(await f.inspect(p.expected)).map((outcome) => outcome.rendered),
		JSON.stringify(p.expected),
	).toEqual(["verified", "mismatching"]);
	expect((await f.inspect(p.expected))[0]?.observed).toBe(row.observed);
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it("verifies a compiled percentage width against its own native containing block", async () => {
	const p = await planned("w-2", "width", { kind: "binding", tokens: ["w-full"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="width:300px;padding:0 20px"><div data-subject class="${p.plan.next}">Full</div><div data-subject class="w-2">Retained</div></div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	expect((await f.inspect(p.expected))[0]?.observed).toBe("260px");
});

it("refuses an automatic sizing mode rather than reading a box it did not compute", async () => {
	const p = await planned("w-4", "width", { kind: "binding", tokens: ["w-auto"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="width:300px"><div data-subject class="${p.plan.next}">Auto</div></div>`,
	);
	expect(await f.inspect(p.expected)).toEqual([
		{ rendered: "unverified", reason: "this sizing mode has no native used-box proof" },
	]);
});

it("reports a definite constraint on the used box separately from a mismatch", async () => {
	const p = await planned("w-2", "width", { kind: "binding", tokens: ["w-96"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="width:300px"><div data-subject class="${p.plan.next}" style="max-width:100px">Clamped</div><div data-subject class="${p.plan.next}" style="min-width:600px">Floored</div><div data-subject class="${p.plan.next}">Free</div></div>`,
	);
	const outcomes = await f.inspect(p.expected);
	expect(outcomes.map((outcome) => outcome.rendered)).toEqual(["constrained", "constrained", "verified"]);
	expect(outcomes[0]?.reason).toBe("this used box is held by a definite native max-width");
	expect(outcomes[1]?.reason).toBe("this used box is held by a definite native min-width");
	expect(outcomes[0]?.observed).toBe("100px");
});

it("names the flexible box that decided a main size instead of reporting a mismatch", async () => {
	const p = await planned("w-2", "width", { kind: "binding", tokens: ["w-24"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="width:300px;display:flex"><div data-subject class="${p.plan.next}" style="flex-grow:1">Grown</div><div data-subject class="${p.plan.next}" style="flex-basis:50px">Based</div></div>`,
	);
	const outcomes = await f.inspect(p.expected);
	expect(outcomes.map((outcome) => outcome.rendered)).toEqual(["constrained", "constrained"]);
	expect(outcomes[0]?.reason).toBe("this used size is under a native flexible box constraint");
	expect(outcomes[1]?.reason).toBe("this main size comes from a native flex basis");
});

it("changes only the width of a use, leaving its padding and height rules alone", async () => {
	const p = await planned("w-2 h-8 p-2 min-w-1", "width", { kind: "binding", tokens: ["w-24"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="width:300px"><div data-subject class="${p.plan.next}">Wide</div></div>`,
	);
	expect((await f.inspect(p.expected)).map((outcome) => outcome.rendered)).toEqual(["verified"]);
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate((element) => {
				const style = getComputedStyle(element);
				return [style.width, style.height, style.paddingLeft, style.minWidth];
			}),
	).toEqual(["96px", "32px", "8px", "4px"]);
});

it("verifies a compiled between-children color on every native child the row separates", async () => {
	const p = await planned("divide-red-500 divide-x-2", "border-color, between children", {
		kind: "binding",
		tokens: ["divide-blue-500"],
	});
	// The row paints all four sides through the child's own border box; only the color is the row's.
	const cell = 'style="display:block;width:40px;height:20px;border-style:solid;border-width:2px"';
	const children = `<i ${cell}>One</i><i ${cell}>Two</i><i ${cell}>Three</i>`;
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}">${children}</div><div data-subject class="divide-red-500 divide-x-2">${children}</div><div data-subject class="${p.plan.next}"><i ${cell}>Only</i></div>`,
	);
	const outcomes = await f.inspect(p.expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify(outcomes),
	).toEqual(["verified", "mismatching", "unverified"]);
	expect(outcomes[2]?.reason).toBe("this use has no native child this row separates");
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual([
		"mismatching",
		"verified",
		"unverified",
	]);
});

it.each([
	{ property: "column-gap, between children", token: "space-x", side: "margin-inline-end" },
	{ property: "row-gap, between children", token: "space-y", side: "margin-block-end" },
])("verifies the compiled $property on the native children it separates", async (row) => {
	const p = await planned(`${row.token}-2`, row.property, { kind: "binding", tokens: [`${row.token}-4`] });
	const children = "<i>One</i><i>Two</i><i>Three</i>";
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}">${children}</div><div data-subject class="${row.token}-2">${children}</div><div data-subject class="${p.plan.next}"><i>Only</i></div>`,
	);
	const outcomes = await f.inspect(p.expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify(outcomes),
	).toEqual(["verified", "mismatching", "unverified"]);
	expect(outcomes[2]?.reason).toBe("this use has no native child this row separates");
	// The row spaces every child but the last, and leaves the last one alone.
	expect(
		await f.page
			.locator("[data-subject]")
			.first()
			.evaluate(
				(element, side) => [...element.children].map((child) => getComputedStyle(child).getPropertyValue(side)),
				row.side,
			),
	).toEqual(["16px", "16px", "0px"]);
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual([
		"mismatching",
		"verified",
		"unverified",
	]);
});

it.each(["column-gap, between children", "row-gap, between children"])(
	"verifies a removed %s and a custom one against each native child",
	async (property) => {
		const token = property.startsWith("column") ? "space-x" : "space-y";
		const side = property.startsWith("column") ? "margin-inline-end" : "margin-block-end";
		const removed = await planned(`${token}-4`, property, { kind: "remove" });
		const custom = await planned(`${token}-4`, property, { kind: "custom", value: "3.5px" });
		const children = "<i>One</i><i>Two</i>";
		const f = await fixture(
			`<!doctype html><style>${removed.style}${custom.plan.desired.css}</style><div data-subject class="${removed.plan.next || "space-none"}">${children}</div><div data-subject class="${custom.plan.next}">${children}</div>`,
		);
		expect((await f.inspect(removed.expected)).map((outcome) => outcome.rendered)).toEqual([
			"verified",
			"mismatching",
		]);
		expect((await f.inspect(custom.expected)).map((outcome) => outcome.rendered)).toEqual([
			"mismatching",
			"verified",
		]);
		expect(custom.plan.next).toBe(`${token}-[3.5px]`);
		expect(
			await f.page
				.locator("[data-subject]")
				.last()
				.evaluate((element, name) => getComputedStyle(element.children[0]!).getPropertyValue(name), side),
		).toBe("3.5px");
	},
);

it("does not certify a between-children spacing one native child no longer carries", async () => {
	const p = await planned("space-x-2", "column-gap, between children", { kind: "binding", tokens: ["space-x-4"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}"><i>One</i><i style="margin-inline-end:2px">Two</i><i>Three</i></div>`,
	);
	expect((await f.inspect(p.expected))[0]?.rendered).toBe("mismatching");
});

it("does not certify a between-children row one native child no longer carries", async () => {
	const p = await planned("divide-red-500 divide-x-2", "border-color, between children", {
		kind: "binding",
		tokens: ["divide-blue-500"],
	});
	const cell = 'style="display:block;width:40px;height:20px;border-style:solid;border-width:2px"';
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div data-subject class="${p.plan.next}"><i ${cell}>One</i><i ${cell} data-outside>Two</i><i ${cell}>Three</i></div>`,
	);
	await f.page.locator("[data-outside]").evaluate((element) => {
		if (element instanceof HTMLElement) element.style.borderColor = "#ff0000";
	});
	expect((await f.inspect(p.expected))[0]?.rendered).toBe("mismatching");
});

it.each([
	{ property: "padding", literal: "flex items-center p-2", token: "p-4" },
	{ property: "width", literal: "flex items-center w-2", token: "w-24" },
	{ property: "padding", literal: "flex gap-2 p-6 w-40", token: "p-8" },
	{ property: "width", literal: "flex gap-2 p-6 w-40", token: "w-48" },
])("verifies a compiled $property on a use wearing other layout utilities: $literal", async (row) => {
	const p = await planned(row.literal, row.property, { kind: "binding", tokens: [row.token] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="width:300px"><div data-subject class="${p.plan.next}">Changed</div><div data-subject class="${row.literal}">Retained</div></div>`,
	);
	const outcomes = await f.inspect(p.expected);
	expect(
		outcomes.map((outcome) => outcome.rendered),
		JSON.stringify(outcomes),
	).toEqual(["verified", "mismatching"]);
	expect((await f.inspect(p.inverse)).map((outcome) => outcome.rendered)).toEqual(["mismatching", "verified"]);
});

it("ignores a sibling declaration that shares a theme variable, and refuses a competing one", async () => {
	const p = await planned("flex gap-2 p-6 w-40", "padding", { kind: "binding", tokens: ["p-8"] });
	const f = await fixture(
		`<!doctype html><style>${p.style}</style><div style="width:300px"><div data-subject class="${p.plan.next}">Padded</div></div>`,
	);
	const sibling = { owner: "w-40", path: ["@layer utilities", "$"], important: false };
	// `w-40` reaches the padding row's effects because both utilities read --spacing. It writes no
	// padding longhand, so it is context for this row, not competition for it.
	expect(
		await f.inspect({
			...p.expected,
			effects: [...p.expected.effects, { ...sibling, property: "width", value: "calc(var(--spacing) * 40)" }],
		}),
	).toEqual([{ rendered: "verified", observed: "32px 32px 32px 32px" }]);
	// A legacy alias for the same longhand does compete, and is refused rather than ignored.
	expect(
		(
			await f.inspect({
				...p.expected,
				effects: [...p.expected.effects, { ...sibling, property: "-webkit-padding-start", value: "3px" }],
			})
		)[0],
	).toEqual({ rendered: "unverified", reason: "this box spacing has a competing declaration requiring proof" });
});
