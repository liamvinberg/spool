import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { readInput } from "./retained-compile";
import { planPropertyValue } from "./source-property-plan";

it.each([
	{ property: "scale", token: "scale-[75%]", independent: "rotate-12" },
	{ property: "column-gap, between children", token: "space-x-4", independent: "mx-2" },
	{ property: "row-gap, between children", token: "space-y-4", independent: "my-2" },
	{ property: "border-color, between children", token: "divide-blue-500", independent: "border-red-500" },
])("derives the $property control from its actual native consumer", async ({ property, token, independent }) => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const inputs = new Map([[file, readInput(file)]]);
	const operation = { kind: "property", property, scope: "" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const added = await planPropertyValue(
		root,
		inputs,
		independent,
		operation,
		{ kind: "binding", tokens: [token] },
		environment,
	);
	expect(added.next).toBe(`${independent} ${token}`);
	const removed = await planPropertyValue(root, inputs, added.next, operation, { kind: "remove" }, environment);
	expect(removed.next).toBe(independent);
});
