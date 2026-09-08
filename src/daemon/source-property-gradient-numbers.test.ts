import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { readInput } from "./retained-compile";
import { planPropertyValue } from "./source-property-plan";
import { propertyPreviewDeclarations } from "./source-property-preview";

it.each(["bg-linear-46.5", "bg-linear-[46.5deg]"])(
	"checks actual compiler admission for fractional direction %s",
	async (token) => {
		const { root } = makeProject(makeTempDir());
		writeDesignFile(root, "shared/tokens.css", ":root{}");
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		const inputs = new Map([[file, readInput(file)]]);
		const original = "bg-linear-45 from-red-500 from-10% to-blue-500 to-90%";
		const planned = planPropertyValue(
			root,
			inputs,
			original,
			{ kind: "property", property: "background-image", scope: "" },
			{ kind: "binding", tokens: [token, "from-red-500", "from-10%", "to-blue-500", "to-90%"] },
			{ direction: "ltr", writingMode: "horizontal-tb" },
		);
		if (token === "bg-linear-46.5") {
			await expect(planned).rejects.toThrow("chosen token has no compiled effect");
			return;
		}
		const plan = await planned;
		expect(plan.next).toContain(token);
		expect(plan.desired.css).toContain("46.5deg");
		const inverse = await planPropertyValue(
			root,
			inputs,
			plan.next,
			{ kind: "property", property: "background-image", scope: "" },
			{ kind: "binding", tokens: original.split(" ") },
			{ direction: "ltr", writingMode: "horizontal-tb" },
		);
		expect(new Set(inverse.next.split(" "))).toEqual(new Set(original.split(" ")));
	},
);

it.each(["from-13.5%", "from-[13.5%]"])("checks actual compiler admission for fractional stop %s", async (token) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", ":root{}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const inputs = new Map([[file, readInput(file)]]);
	const planned = planPropertyValue(
		root,
		inputs,
		"bg-linear-45 from-red-500 from-10% to-blue-500 to-90%",
		{ kind: "property", property: "background-image", scope: "" },
		{ kind: "binding", tokens: ["bg-linear-45", "from-red-500", token, "to-blue-500", "to-90%"] },
		{ direction: "ltr", writingMode: "horizontal-tb" },
	);
	if (token === "from-13.5%") return expect(planned).rejects.toThrow("chosen token has no compiled effect");
	const plan = await planned;
	expect(plan.next).toContain(token);
	expect(plan.desired.css).toContain("13.5%");
});

it.each(["angle", "position", "alpha"])("captures the selected gradient %s marker", async (part) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", ":root{}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const marker = "var(--spool-property-input)";
	const plan = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		"bg-linear-45 from-red-500 from-10% to-blue-500 to-90%",
		{ kind: "property", property: "background-image", scope: "" },
		{
			kind: "binding",
			tokens: [
				part === "angle" ? `bg-linear-[${marker}]` : "bg-linear-45",
				part === "alpha" ? `from-red-500/[${marker}]` : "from-red-500",
				part === "position" ? `from-[percentage:${marker}]` : "from-10%",
				"to-blue-500",
				"to-90%",
			],
		},
		{ direction: "ltr", writingMode: "horizontal-tb" },
	);
	if (part === "alpha") {
		expect(
			propertyPreviewDeclarations(plan.desired.effects, marker).some(
				(declaration) =>
					declaration.property === "background-image" &&
					declaration.value.startsWith("linear-gradient(color-mix(") &&
					declaration.value.includes(marker),
			),
		).toBe(true);
		return;
	}
	expect(propertyPreviewDeclarations(plan.desired.effects, marker)).toContainEqual({
		property: "background-image",
		value: part === "angle" ? `linear-gradient(${marker}, red, blue)` : `linear-gradient(red ${marker}, blue)`,
	});
	expect(plan.desired.css).toContain(marker);
});
