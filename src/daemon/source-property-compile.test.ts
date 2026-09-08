import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { splitClass } from "./class-write";
import { appearanceProperties } from "./fixtures/property-appearance";
import { readInput } from "./retained-compile";
import { compilePropertySource, inspectPropertyCss } from "./source-property-compile";

function fixture(tokens = "") {
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	writeDesignFile(root, "shared/tokens.css", tokens);
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	return { root, file, inputs: new Map([[file, readInput(file)]]) };
}

it("attributes every retained appearance pair to actual emitted declarations", async () => {
	const f = fixture(":root { font-size:20px; --space:10px 20px } @layer base { #subject {padding:3px} }");
	expect(appearanceProperties).toHaveLength(79);
	for (const row of appearanceProperties) {
		for (const literal of [row.before, row.after]) {
			const certificate = await compilePropertySource(f.root, f.inputs, `${literal} ${row.companion}`);
			for (const token of splitClass(literal))
				expect(
					certificate.effects.some((effect) => effect.owner === token),
					`${row.property}: ${token}`,
				).toBe(true);
		}
	}
});

it("distinguishes exact text color and size while retaining independent line height", async () => {
	const f = fixture("@theme { --color-brand:#123456; --text-brand:1.3rem; --text-brand--line-height:1.7; }");
	const color = await compilePropertySource(f.root, f.inputs, "text-brand text-[length:1.3rem] leading-[1.9]");
	expect(color.effects.filter((effect) => effect.owner === "text-brand").map((effect) => effect.property)).toEqual([
		"color",
	]);
	expect(
		color.effects.filter((effect) => effect.owner === "text-[length:1.3rem]").map((effect) => effect.property),
	).toEqual(["font-size"]);
	expect(color.effects.filter((effect) => effect.owner === "leading-[1.9]").map((effect) => effect.property)).toEqual([
		"--tw-leading",
		"line-height",
	]);
	const size = await compilePropertySource(f.root, f.inputs, "text-sm");
	expect(size.effects.filter((effect) => effect.owner === "text-sm").map((effect) => effect.property)).toEqual([
		"font-size",
		"line-height",
	]);
	expect(size.css).not.toContain("#123456");
});

it("keeps original stylesheet bytes and refuses newly discovered dependencies", async () => {
	const f = fixture("@theme { --color-brand:#123456; }");
	writeDesignFile(f.root, "shared/tokens.css", "@theme { --color-brand:#abcdef; }");
	const original = await compilePropertySource(f.root, f.inputs, "text-brand");
	expect(original.css).toContain("#123456");
	expect(original.css).not.toContain("#abcdef");
	writeDesignFile(f.root, "shared/tokens.css", '@import "./extra.css";');
	writeDesignFile(f.root, "shared/extra.css", "@theme { --color-brand:#123456; }");
	f.inputs.set(f.file, readInput(f.file));
	await expect(compilePropertySource(f.root, f.inputs, "text-brand")).rejects.toThrow("original captured");
});

it("includes captured bundled style declarations beside the utility effects", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const certificate = await compilePropertySource(
		root,
		new Map([[file, readInput(file)]]),
		"text-red-500",
		".notice {color: rebeccapurple !important} @media (min-width: 1px) {body {--chosen: 2}} ",
	);
	expect(certificate.effects).toContainEqual(
		expect.objectContaining({
			owner: null,
			property: "color",
			value: "rebeccapurple",
			important: true,
			path: expect.arrayContaining([".notice"]),
		}),
	);
	expect(certificate.effects).toContainEqual(
		expect.objectContaining({
			owner: null,
			property: "--chosen",
			value: "2",
			path: expect.arrayContaining(["@media (min-width: 1px)"]),
		}),
	);
});

it("inspects captured frame effects without inventing candidate ownership", async () => {
	const f = fixture("@theme { --color-brand:#123456; }");
	const original = await compilePropertySource(f.root, f.inputs, "text-brand border-2");
	const inspected = await inspectPropertyCss(`${original.css}\n.parent { direction:rtl; --chosen:3px }`);
	expect(inspected.effects.every((effect) => effect.owner === null)).toBe(true);
	expect(inspected.effects).toContainEqual(
		expect.objectContaining({ property: "direction", value: "rtl", path: [".parent"] }),
	);
	expect(inspected.effects).toContainEqual(expect.objectContaining({ property: "--color-brand", value: "#123456" }));
	expect(inspected.registrations["--tw-border-style"]).toBeDefined();
	await expect(inspectPropertyCss('@import "./not-captured.css";')).rejects.toThrow("uncaptured import");
});
