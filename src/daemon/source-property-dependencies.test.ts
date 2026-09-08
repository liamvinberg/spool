import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { readInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import {
	changedPropertyKeys,
	externalPropertySignature,
	propertyConsumers,
	propertyDependencies,
} from "./source-property-dependencies";

const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
function fixture() {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", ":root{--chosen:1.5;--other:2}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const inputs = new Map([[file, readInput(file)]]);
	return (literal: string) => compilePropertySource(root, inputs, literal);
}
it("tracks a changed filter component without claiming its independent brightness input", async () => {
	const compile = fixture();
	const before = await compile("contrast-50 brightness-75");
	const after = await compile("contrast-100 brightness-75");
	const roots = changedPropertyKeys(
		before.effects.filter((effect) => effect.owner === "contrast-50"),
		after.effects.filter((effect) => effect.owner === "contrast-100"),
		environment,
	);
	expect([...roots]).toEqual(["--tw-contrast"]);
	expect(propertyConsumers(before, roots, environment).some((effect) => effect.property === "filter")).toBe(true);
	expect(propertyDependencies(before, roots, environment).has("--tw-brightness")).toBe(false);
	const independent = await compile("contrast-50 brightness-125");
	expect(externalPropertySignature(before, roots, ["contrast-50"], environment)).toBe(
		externalPropertySignature(independent, roots, ["contrast-50"], environment),
	);
});
it("keeps authored variable dependencies and inactive consumers in the proof", async () => {
	const compile = fixture();
	const before = await compile("contrast-(--chosen) hover:contrast-75");
	const roots = new Set(["--tw-contrast"]);
	expect(propertyDependencies(before, roots, environment).has("--chosen")).toBe(true);
	expect(
		propertyConsumers(before, roots, environment).some((effect) =>
			effect.path.some((part) => part.includes(":hover")),
		),
	).toBe(true);
	const competing = await compile("contrast-(--chosen) hover:contrast-125");
	expect(externalPropertySignature(before, roots, ["contrast-(--chosen)"], environment)).not.toBe(
		externalPropertySignature(competing, roots, ["contrast-(--chosen)"], environment),
	);
});
