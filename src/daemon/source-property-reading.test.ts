import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { readInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";
import { propertyReading } from "./source-property-reading";

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
		binding: { kind: "reference", name: "--color-brand", value: "#123456" },
		native: "rgb(18, 52, 86)",
	});
});
it("does not invent a theme binding from equal native pixels", async () => {
	expect(await reading("text-[#123456]", "color", "rgb(18, 52, 86)")).toEqual({
		tokens: ["text-[#123456]"],
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
