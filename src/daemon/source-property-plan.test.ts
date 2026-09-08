import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { appearanceProperties } from "./fixtures/property-appearance";
import { readInput } from "./retained-compile";
import { planPropertyValue } from "./source-property-plan";

function fixture() {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", ":root{font-size:20px;--space:10px 20px}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	return { root, inputs: new Map([[file, readInput(file)]]) };
}
it("plans every retained appearance source pair from actual declaration owners", async () => {
	const f = fixture();
	for (const row of appearanceProperties) {
		const before = [row.before, row.companion, "z-10"].filter(Boolean).join(" ");
		const operation = { kind: "property", property: row.property, scope: "" } as const;
		const plan = await planPropertyValue(
			f.root,
			f.inputs,
			before,
			operation,
			{ kind: "binding", tokens: row.after.split(" ") },
			{ direction: "ltr", writingMode: "horizontal-tb" },
		);
		expect(new Set(plan.next.split(" ")), row.property).toEqual(
			new Set([row.after, row.companion, "z-10"].filter(Boolean).join(" ").split(" ")),
		);
		expect(plan.roots.size, row.property).toBeGreaterThan(0);
		const inverse = await planPropertyValue(
			f.root,
			f.inputs,
			plan.next,
			operation,
			{ kind: "binding", tokens: row.before.split(" ") },
			{ direction: "ltr", writingMode: "horizontal-tb" },
		);
		expect(new Set(inverse.next.split(" ")), row.property).toEqual(new Set(before.split(" ")));
	}
});
it("keeps a size binding and independent filter inputs during focused component edits", async () => {
	const f = fixture();
	const env = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const leading = await planPropertyValue(
		f.root,
		f.inputs,
		"text-sm leading-normal marker",
		{ kind: "property", property: "line-height", scope: "" },
		{ kind: "binding", tokens: ["leading-loose"] },
		env,
	);
	expect(leading.before).toEqual(["leading-normal"]);
	expect(leading.next).toContain("text-sm");
	expect(leading.next).toContain("marker");
	const filters = await planPropertyValue(
		f.root,
		f.inputs,
		"brightness-75 grayscale",
		{ kind: "property", property: "filter", scope: "" },
		{ kind: "binding", tokens: ["invert"] },
		env,
	);
	expect(filters.before).toEqual(["grayscale"]);
	expect(filters.next).toBe("brightness-75 invert");
});
