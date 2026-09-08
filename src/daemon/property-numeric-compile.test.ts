import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { type Kind, lengthOf, lengthToken, parseTyped, stepLength } from "../properties/families";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { readInput } from "./retained-compile";
import { compilePropertySource } from "./source-property-compile";

it("compiles fractional numeric candidates with the project's real compiler", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", ":root{font-size:20px}@theme{--spacing:0.5rem}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const inputs = new Map([[file, readInput(file)]]);
	const samples: [Kind, string, string, string][] = [
		["spacing", "w", "7.999px", "width"],
		["spacing", "w", ".333rem", "width"],
		["spacing", "w", "1.25em", "width"],
		["spacing", "w", "33.333%", "width"],
		["px", "text", "15.999px", "font-size"],
		["px", "border", "1.25px", "border-width"],
		["px", "outline-offset", "-1.25px", "outline-offset"],
		["percent", "opacity", "37.5", "opacity"],
		["deg", "rotate", "12.5", "rotate"],
		["deg", "rotate", ".125turn", "rotate"],
		["ms", "duration", ".3333s", "transition-duration"],
		["ms", "duration", "150.25", "transition-duration"],
	];
	for (const [kind, family, typed, property] of samples) {
		const value = parseTyped(kind, typed);
		if (!value) throw new Error(`refused ${typed}`);
		const token = lengthToken(family, value);
		const compiled = await compilePropertySource(root, inputs, token);
		expect(
			compiled.effects.some((effect) => effect.owner === token && effect.property === property),
			token,
		).toBe(true);
	}
	const ratio = stepLength("spacing", lengthOf("w-1/3", "w"), 213.333, 1);
	if (!ratio) throw new Error("missing ratio");
	const token = lengthToken("w", ratio);
	const compiled = await compilePropertySource(root, inputs, token);
	expect(compiled.effects.find((effect) => effect.owner === token && effect.property === "width")?.value).toContain(
		"103 / 300",
	);
});
