import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { readInput } from "./retained-compile";
import { planPropertyValue } from "./source-property-plan";
import { propertyScopePaths } from "./source-property-scope";

it("retains the compiled hover predicate after removing its only declaration", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "@theme { --color-brand: #123456; }");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const inputs = new Map([[file, readInput(file)]]);
	const operation = { kind: "property", property: "opacity", scope: "hover:" } as const;
	const environment = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const plan = await planPropertyValue(
		root,
		inputs,
		"hover:opacity-50 focus:opacity-75",
		operation,
		{ kind: "remove" },
		environment,
	);
	const paths = propertyScopePaths(plan.original, plan.desired, operation, environment);
	expect(paths.length).toBeGreaterThan(0);
	expect(paths.some((path) => path.some((part) => part.includes(":hover")))).toBe(true);
	expect(paths.some((path) => path.some((part) => part.includes("hover: hover")))).toBe(true);
	expect(paths.some((path) => path.some((part) => part.includes(":focus")))).toBe(false);
	expect(plan.next).toBe("focus:opacity-75");
});
