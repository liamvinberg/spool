import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { readInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import {
	changedPropertyKeys,
	externalPropertySignature,
	nativePropertyEffects,
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

it("guards reached theme definitions independently of candidate emission and unrelated tokens", async () => {
	const { root } = makeProject(makeTempDir());
	const snapshot = (color: string, space: string) => {
		writeDesignFile(root, "shared/tokens.css", `@theme {--color-chosen:${color};--spacing-unused:${space};}`);
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		return new Map([[file, readInput(file)]]);
	};
	const originalInputs = snapshot("#123456", "4px");
	const unrelatedInputs = snapshot("#123456", "12px");
	const changedInputs = snapshot("#abcdef", "12px");
	const original = await compilePropertySource(root, originalInputs, "text-chosen");
	const unrelated = await compilePropertySource(root, unrelatedInputs, "text-chosen");
	const changed = await compilePropertySource(root, changedInputs, "text-chosen");
	const roots = new Set(["color"]);
	const signature = (certificate: typeof original) =>
		externalPropertySignature(certificate, roots, ["text-chosen"], environment);
	expect(signature(unrelated)).toBe(signature(original));
	expect(signature(changed)).not.toBe(signature(original));
	expect(original.theme["--color-chosen"]?.value).toBe("#123456");
});

it("retains the native style companion of a width change without claiming its source ownership", async () => {
	const compile = fixture();
	const before = await compile("border-2");
	const after = await compile("border-[4px]");
	const roots = changedPropertyKeys(
		before.effects.filter((effect) => effect.owner === "border-2"),
		after.effects.filter((effect) => effect.owner === "border-[4px]"),
		environment,
	);
	expect([...roots]).not.toContain("border-top-style");
	expect(propertyConsumers(after, roots, environment)).toContainEqual(
		expect.objectContaining({ owner: "border-[4px]", property: "border-style", value: "var(--tw-border-style)" }),
	);
	const outside = await compile("border-[4px] border-dashed");
	expect(externalPropertySignature(after, roots, ["border-[4px]"], environment)).not.toBe(
		externalPropertySignature(outside, roots, ["border-[4px]"], environment),
	);
});

it.each([
	["scale-x-50 scale-y-75", "--tw-scale-x", "--tw-scale-y", "75%"],
	["rotate-x-4 rotate-y-6 skew-x-8", "--tw-rotate-x", "--tw-rotate-y", "rotateY(6deg)"],
	["contrast-50 brightness-75", "--tw-contrast", "--tw-brightness", "brightness(75%)"],
])(
	"captures carried native inputs while preserving independent source roots: %s",
	async (literal, root, property, value) => {
		const compile = fixture();
		const certificate = await compile(literal);
		const roots = new Set([root]);
		expect(nativePropertyEffects(certificate, roots, environment)).toContainEqual(
			expect.objectContaining({ property, value }),
		);
		expect([...roots]).toEqual([root]);
		expect(propertyDependencies(certificate, roots, environment).has(property)).toBe(false);
	},
);

it.each([
	["ring-4 ring-offset-2 shadow-sm", "--tw-ring-shadow", "shadow-sm", "--tw-shadow"],
	["ring-2 ring-offset-4 shadow-sm", "--tw-ring-offset-width", "shadow-sm", "--tw-shadow"],
	["ring-2 ring-offset-2 shadow-md", "--tw-shadow", "ring-offset-2", "--tw-ring-offset-width"],
])(
	"captures independent shadow inputs without expanding source ownership: %s",
	async (literal, root, owner, property) => {
		const certificate = await fixture()(literal);
		const roots = new Set([root]);
		const originalConsumers = propertyConsumers(certificate, roots, environment);
		const signature = externalPropertySignature(certificate, roots, [], environment);
		expect(nativePropertyEffects(certificate, roots, environment)).toContainEqual(
			expect.objectContaining({ owner, property }),
		);
		expect(propertyConsumers(certificate, roots, environment)).toEqual(originalConsumers);
		expect(propertyDependencies(certificate, roots, environment).has(property)).toBe(false);
		expect(externalPropertySignature(certificate, roots, [], environment)).toBe(signature);
		expect([...roots]).toEqual([root]);
	},
);

it.each([
	["--tw-gradient-position", "bg-linear-to-r"],
	["--tw-gradient-to", "to-blue-500"],
])("captures the gradient stop list a native image reads: %s", async (property, owner) => {
	const certificate = await fixture()("bg-linear-to-r from-green-500 to-blue-500");
	const roots = new Set(["--tw-gradient-from"]);
	const originalConsumers = propertyConsumers(certificate, roots, environment);
	const signature = externalPropertySignature(certificate, roots, [], environment);
	expect(nativePropertyEffects(certificate, roots, environment)).toContainEqual(
		expect.objectContaining({ owner, property }),
	);
	expect(propertyConsumers(certificate, roots, environment)).toEqual(originalConsumers);
	expect(propertyDependencies(certificate, roots, environment).has(property)).toBe(false);
	expect(externalPropertySignature(certificate, roots, [], environment)).toBe(signature);
	expect([...roots]).toEqual(["--tw-gradient-from"]);
});
