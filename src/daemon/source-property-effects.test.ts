import { realpathSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { appearanceProperties } from "./fixtures/property-appearance";
import { readInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import { propertyKeys, readPropertyEffects } from "./source-property-effects";

const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
function fixture() {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", ":root{font-size:20px;--space:10px 20px}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	return { root, inputs: new Map([[file, readInput(file)]]) };
}

it("finds actual compiled effect owners for all 79 appearance controls", async () => {
	const f = fixture();
	for (const row of appearanceProperties) {
		const certificate = await compilePropertySource(f.root, f.inputs, `${row.after} ${row.companion}`);
		const selected = readPropertyEffects(certificate, row.property, "", environment);
		expect(selected.owners, row.property).toEqual(expect.arrayContaining(row.after.split(" ")));
		if (row.companion) expect(selected.owners, row.property).not.toContain(row.companion);
	}
});

it("checks every emitted appearance declaration's affected keys against the native CSSOM", async () => {
	const f = fixture();
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage();
	const declarations = [];
	for (const row of appearanceProperties) {
		const certificate = await compilePropertySource(f.root, f.inputs, `${row.before} ${row.after} ${row.companion}`);
		declarations.push(...certificate.effects.filter((effect) => effect.owner));
	}
	const native = await page.evaluate(
		(effects) =>
			effects.map((effect) => {
				const style = document.createElement("div").style;
				style.setProperty(effect.property, effect.value);
				return Array.from(style);
			}),
		declarations,
	);
	for (const [index, effect] of declarations.entries()) {
		const expected = [...new Set(native[index]?.flatMap((name) => propertyKeys(name, environment)))].sort();
		expect(
			propertyKeys(effect.property, environment).sort(),
			`${effect.owner}: ${effect.property}=${effect.value}`,
		).toEqual(expected);
	}
});

it("keeps regular text color, placeholder color, and scoped color as distinct compiled paths", async () => {
	const f = fixture();
	const certificate = await compilePropertySource(
		f.root,
		f.inputs,
		"text-red-500 placeholder-blue-500 hover:text-green-500",
	);
	expect(readPropertyEffects(certificate, "color", "", environment).owners).toEqual(["text-red-500"]);
	expect(readPropertyEffects(certificate, "placeholder color", "", environment).owners).toEqual([
		"placeholder-blue-500",
	]);
	expect(readPropertyEffects(certificate, "color", "hover:", environment).owners).toEqual(["hover:text-green-500"]);
});
