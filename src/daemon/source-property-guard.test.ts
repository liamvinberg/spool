import { realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { readInput } from "./retained-compile";
import { compilePropertySource, inspectPropertyCss } from "./source-property-compile";
import { guardPropertyEffects, propertyReadKeys } from "./source-property-guard";

it("guards the chosen token definition as well as the original binding", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/tokens.css", "@theme {--color-old:#123456;--color-chosen:#abcdef;--spacing:3px}");
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const inputs = new Map([[file, readInput(file)]]);
	const before = await compilePropertySource(root, inputs, "text-old");
	const desired = await compilePropertySource(root, inputs, "text-chosen");
	const env = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const keys = propertyReadKeys(before, desired, new Set(["color"]), env);
	expect(keys.has("--color-chosen")).toBe(true);
	writeDesignFile(root, "shared/tokens.css", "@theme {--color-old:#123456;--color-chosen:#999999;--spacing:3px}");
	const changed = await compilePropertySource(root, new Map([[file, readInput(file)]]), "text-old");
	expect(() => guardPropertyEffects(before, changed, keys, env, [], [])).toThrow(
		"binding, consumer or revealed default",
	);
	writeDesignFile(root, "shared/tokens.css", "@theme {--color-old:#123456;--color-chosen:#abcdef;--spacing:7px}");
	const unrelated = await compilePropertySource(root, new Map([[file, readInput(file)]]), "text-old z-10");
	expect(() => guardPropertyEffects(before, unrelated, keys, env, [], [])).not.toThrow();
	const frameBefore = await inspectPropertyCss(".parent {direction:ltr; z-index:1}");
	const frameAfter = await inspectPropertyCss(".parent {direction:rtl; z-index:1}");
	expect(() => guardPropertyEffects(before, before, keys, env, frameBefore.effects, frameAfter.effects)).toThrow(
		"native context",
	);
	const frameIndependent = await inspectPropertyCss(".parent {direction:ltr; z-index:2}");
	expect(() =>
		guardPropertyEffects(before, before, keys, env, frameBefore.effects, frameIndependent.effects),
	).not.toThrow();
});

it.each([".host", ".alternate"])("refuses reversed competing declaration order beside %s", async (second) => {
	const { root } = makeProject(makeTempDir());
	const source = `.host{color:red}${second}{color:blue}.host{z-index:1}`;
	writeDesignFile(root, "shared/tokens.css", source);
	const file = realpathSync(join(root, "design/shared/tokens.css"));
	const before = await compilePropertySource(root, new Map([[file, readInput(file)]]), "host");
	const env = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const keys = propertyReadKeys(before, before, new Set(["color"]), env);
	writeDesignFile(root, "shared/tokens.css", `${second}{color:blue}.host{color:red}.host{z-index:1}`);
	const reversed = await compilePropertySource(root, new Map([[file, readInput(file)]]), "host");
	expect(() => guardPropertyEffects(before, reversed, keys, env, [], [])).toThrow();
	const frameBefore = await inspectPropertyCss(source);
	const frameAfter = await inspectPropertyCss(`${second}{color:blue}.host{color:red}.host{z-index:1}`);
	expect(() => guardPropertyEffects(before, before, keys, env, frameBefore.effects, frameAfter.effects)).toThrow();
	writeDesignFile(root, "shared/tokens.css", `.host{color:red}${second}{color:blue}.host{z-index:2}`);
	const independent = await compilePropertySource(root, new Map([[file, readInput(file)]]), "host");
	expect(() => guardPropertyEffects(before, independent, keys, env, [], [])).not.toThrow();
});
