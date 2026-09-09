import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
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
		{ property, value },
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
		{ property, value },
		members,
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
			undefined,
			padding,
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
			{ property: "opacity", value: "0.75" },
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
