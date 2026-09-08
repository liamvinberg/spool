import { realpathSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { type Browser, chromium } from "playwright-core";
import { afterAll, beforeAll, expect, it, onTestFinished } from "vitest";
import { readInput } from "../daemon/retained-compile";
import { compilePropertySource } from "../daemon/source-property-compile";
import { propertyConsumers } from "../daemon/source-property-dependencies";
import { planPropertyValue } from "../daemon/source-property-plan";
import { propertyScopePaths } from "../daemon/source-property-scope";
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

it.each(["rgb(1 2 3 / .50001)", "oklch(.704 .191 22.216)", "color-mix(in oklab, red 50%, transparent)"])(
	"uses native %s color precision without raster sampling",
	async (value) => {
		const expected: SourcePropertyExpectation = {
			...opacity(".5"),
			property: "background-color",
			className: "custom",
			effects: [
				{ owner: "custom", path: ["@layer utilities", "$"], property: "background-color", value, important: false },
			],
			css: `@layer utilities {.custom {background-color:${value}}}`,
		};
		const f = await fixture(
			`<!doctype html><div data-subject style="background-color:${value}">Healthy</div><div data-subject style="background-color:blue">Different</div>`,
		);
		expect((await f.inspect(expected)).map((outcome) => outcome.rendered)).toEqual(["verified", "mismatching"]);
	},
);

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
