import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { appearanceProperties } from "./fixtures/property-appearance";
import { readInput } from "./retained-compile";
import { planPropertyValue } from "./source-property-plan";

it.each([
	["border-2", "border-top-width", ["border-right-width", "border-bottom-width", "border-left-width"]],
	[
		"rounded-lg",
		"border-top-left-radius",
		["border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
	],
	["scale-50", "scale-x", ["--tw-scale-y", "--tw-scale-z"]],
])("retains the other compiled components when removing from %s", async (literal, property, kept) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const result = await planPropertyValue(
		root,
		new Map([[file, readInput(file)]]),
		literal,
		{ kind: "property", property, scope: "" },
		{ kind: "remove" },
		{ direction: "ltr", writingMode: "horizontal-tb" },
	);
	expect(result.before).toEqual([literal]);
	for (const name of kept)
		expect(
			result.desired.effects.some((effect) => effect.owner !== null && effect.property === name),
			name,
		).toBe(true);
	expect(result.next).not.toBe("");
	if (property === "border-top-left-radius") expect(result.next).toContain("var(--radius-lg)");
});

it.each(appearanceProperties)(
	"creates and removes the retained $property effect without losing its companion",
	async (row) => {
		const { root } = makeProject(makeTempDir());
		writeDesignFile(root, "shared/tokens.css", ":root{font-size:20px;--space:10px 20px}");
		const file = realpathSync(join(root, "design/shared/tokens.css"));
		const inputs = new Map([[file, readInput(file)]]);
		const operation = { kind: "property", property: row.property, scope: "" } as const;
		const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
		const baseline = [row.companion, "z-10"].filter(Boolean).join(" ");
		const created = await planPropertyValue(
			root,
			inputs,
			baseline,
			operation,
			{ kind: "binding", tokens: row.before.split(" ") },
			environment,
		);
		expect(new Set(created.next.split(" "))).toEqual(new Set([baseline, row.before].join(" ").split(" ")));
		const removed = await planPropertyValue(root, inputs, created.next, operation, { kind: "remove" }, environment);
		expect(removed.next).toBe(baseline);
	},
);
