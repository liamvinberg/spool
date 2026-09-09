import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { MatchedRuleChain } from "../source-edit";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { readInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import { propertyReading } from "./source-property-reading";
import type { StyleMember } from "./source-property-style";

async function reading(literal: string, property: string, value: string) {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "@theme { --color-brand: #123456; --text-body: 17.25px; }");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const certificate = await compilePropertySource(root, new Map([[file, readInput(file)]]), literal);
	return propertyReading(
		certificate,
		{ kind: "property", property, scope: "" },
		{ direction: "ltr", writingMode: "horizontal-tb" },
		{ native: { property, value } },
	);
}

it("reports the exact compiled reference separately from its original native value", async () => {
	expect(await reading("text-brand", "color", "rgb(18, 52, 86)")).toEqual({
		tokens: ["text-brand"],
		source: "class",
		binding: { kind: "reference", name: "--color-brand", value: "#123456" },
		native: "rgb(18, 52, 86)",
	});
});
it("does not invent a theme binding from equal native pixels", async () => {
	expect(await reading("text-[#123456]", "color", "rgb(18, 52, 86)")).toEqual({
		tokens: ["text-[#123456]"],
		source: "class",
		binding: { kind: "custom" },
		authored: "#123456",
		native: "rgb(18, 52, 86)",
	});
});
it("keeps a fractional size reference while identifying a missing authored color", async () => {
	const size = await reading("text-body", "font-size", "17.25px");
	expect(size.binding).toEqual({ kind: "reference", name: "--text-body", value: "17.25px" });
	expect(size.native).toBe("17.25px");
	expect(await reading("opacity-75", "color", "rgb(18, 52, 86)")).toEqual({
		tokens: [],
		source: "class",
		binding: { kind: "page" },
		native: "rgb(18, 52, 86)",
	});
});

it("retains the compiled color reference when an authored alpha wraps it", async () => {
	const color = await reading("text-brand/50", "color", "rgba(18, 52, 86, 0.5)");
	expect(color.binding).toEqual({ kind: "reference", name: "--color-brand", value: "#123456" });
	expect(color.native).toBe("rgba(18, 52, 86, 0.5)");
});

it("keeps the authored fractional unit separate from native pixels for numeric editing", async () => {
	const size = await reading("text-[length:.333rem]", "font-size", "5.328px");
	expect(size).toMatchObject({
		binding: { kind: "custom" },
		authored: ".333rem",
		native: "5.328px",
	});
});

async function inlineReading(literal: string, property: string, members: StyleMember[], value = "") {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "@theme { --color-brand: #123456; }");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const certificate = await compilePropertySource(root, new Map([[file, readInput(file)]]), literal);
	return propertyReading(
		certificate,
		{ kind: "property", property, scope: "" },
		{ direction: "ltr", writingMode: "horizontal-tb" },
		{ native: { property, value }, style: members },
	);
}

const padding: StyleMember[] = [{ key: "padding", value: 4, enumerable: true }];

it("reads an inline member's own value as the property's source, not the class it also has", async () => {
	expect(await inlineReading("p-6 opacity-75", "padding", padding, "4px")).toEqual({
		tokens: [],
		source: "style",
		binding: { kind: "custom" },
		authored: "4px",
		native: "4px",
	});
});

it("reads one side out of the shorthand the inline member spells", async () => {
	expect(await inlineReading("p-6", "padding-left", padding, "4px")).toMatchObject({
		source: "style",
		binding: { kind: "custom" },
		authored: "4px",
	});
});

it("leaves a property no inline member declares to its class binding", async () => {
	expect(await inlineReading("p-6 opacity-75", "opacity", padding, "0.75")).toMatchObject({
		source: "class",
		tokens: ["opacity-75"],
	});
});

it("claims no value for a control whose sides two sources own", async () => {
	expect(await inlineReading("pt-8! p-6", "padding", padding, "4px")).toEqual({
		tokens: [],
		source: "mixed",
		reason: "this property's declarations are owned by different sources",
		binding: { kind: "mixed" },
		native: "4px",
	});
});

it("leaves a scoped row to its class literal, which is the only source a scope has", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "@theme {}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const certificate = await compilePropertySource(root, new Map([[file, readInput(file)]]), "hover:p-8");
	expect(
		propertyReading(
			certificate,
			{ kind: "property", property: "padding", scope: "hover:" },
			{ direction: "ltr", writingMode: "horizontal-tb" },
			{ style: padding },
		),
	).toMatchObject({ source: "class", tokens: ["hover:p-8"] });
});

it("reports the scope's own written value apart from what the viewport is applying", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "@theme {}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const certificate = await compilePropertySource(
		root,
		new Map([[file, readInput(file)]]),
		"opacity-75 md:opacity-25",
	);
	const at = (scope: string) =>
		propertyReading(
			certificate,
			{ kind: "property", property: "opacity", scope },
			{ direction: "ltr", writingMode: "horizontal-tb" },
			// the frame is narrow, so the breakpoint rule is written but not applied
			{ native: { property: "opacity", value: "0.75" } },
		);
	expect(at("md:")).toEqual({
		tokens: ["md:opacity-25"],
		source: "class",
		binding: { kind: "custom" },
		authored: "25%",
		native: "0.75",
	});
	expect(at("")).toMatchObject({ tokens: ["opacity-75"], native: "0.75" });
});

async function authoredReading(
	literal: string,
	css: string,
	property: string,
	value: string,
	matched: readonly MatchedRuleChain[] | undefined = [{ path: [".card"], active: true }],
) {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", `@theme {}\n${css}`);
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const certificate = await compilePropertySource(root, new Map([[file, readInput(file)]]), literal);
	return propertyReading(
		certificate,
		{ kind: "property", property, scope: "" },
		{ direction: "ltr", writingMode: "horizontal-tb" },
		{ native: { property, value }, matched },
	);
}

it("says what a conditional rule is written under, apart from what the viewport is doing", async () => {
	expect(
		await authoredReading("p-6", "@media (min-width: 48rem) { .card { padding: 12px } }", "padding", "24px", [
			{ path: ["@media (min-width: 48rem)", ".card"], active: true },
		]),
	).toMatchObject({ source: "class", written: ["@media (min-width: 48rem)"], tokens: ["p-6"] });
});

it("reads the project's own declaration as the source, over the utility it outranks", async () => {
	expect(await authoredReading("p-6", ".card { padding: 12px }", "padding", "12px")).toEqual({
		tokens: [],
		source: "declaration",
		binding: { kind: "custom" },
		authored: "12px",
		native: "12px",
	});
});

it("leaves a project rule this element does not match out of its own reading", async () => {
	expect(
		await authoredReading("p-6", ".card { padding: 12px }", "padding", "24px", [
			{ path: [".elsewhere"], active: true },
		]),
	).toMatchObject({
		source: "class",
		tokens: ["p-6"],
	});
});

it("leaves the property to the utility when an important utility outranks the declaration", async () => {
	expect(await authoredReading("p-6!", ".card { padding: 12px }", "padding", "24px")).toMatchObject({
		source: "class",
		tokens: ["p-6!"],
	});
});

it("says nothing about project rules for a use that reported no matched chains", async () => {
	// no evidence is not evidence about every rule in the project
	expect(
		await authoredReading(
			"p-6",
			"@media (min-width: 48rem) { .card { padding: 12px } }",
			"padding",
			"24px",
			undefined,
		),
	).toEqual({
		tokens: ["p-6"],
		source: "class",
		binding: { kind: "reference", name: "--spacing", value: "0.25rem" },
		native: "24px",
	});
});

it("gives a control two sources own the refusal's own words", async () => {
	const reading = await authoredReading("pt-8!", ".card { padding: 12px }", "padding", "12px", [
		{ path: [".card"], active: true },
	]);
	expect(reading).toMatchObject({ source: "mixed", reason: expect.stringContaining("different sources") });
});
