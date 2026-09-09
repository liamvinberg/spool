import { parseExpression } from "@babel/parser";
import { expect, it } from "vitest";
import type { Target } from "./source-origins";
import { applySourcePatches } from "./source-patches";
import { planPropertyLiteral } from "./source-property-literal";

function target(source: string, expected: string | null): Target {
	const node = parseExpression(source, { plugins: ["jsx", "typescript"] });
	return {
		address: { file: "frame.tsx", start: node.start!, end: node.end! },
		source: "frame.tsx:1:1",
		role: "definition",
		slot: "class",
		expected,
		scope: "",
		repeated: false,
	};
}

it.each([
	[
		'<div className="text-red-500  px-4 opacity-50"/>',
		"text-red-500  px-4 opacity-50",
		"text-red-500",
		"text-blue-500",
	],
	['<div className="text-&#114;ed-500 px-4"/>', "text-red-500 px-4", "text-red-500", "text-blue-500"],
	[String.raw`<div className={'text-\u0072ed-500 px-4'}/>`, "text-red-500 px-4", "text-red-500", "text-blue-500"],
	[
		'React.createElement("div", {className:"text-red-500 px-4"})',
		"text-red-500 px-4",
		"text-red-500",
		"text-blue-500",
	],
])("round trips the exact authored class encoding: %s", (source, before, remove, add) => {
	const patches = planPropertyLiteral(source, target(source, before), [remove], [add]);
	const saved = applySourcePatches(source, patches);
	expect(saved.text).toContain(add);
	expect(saved.text).toContain("px-4");
	expect(applySourcePatches(saved.text, saved.inverse).text).toBe(source);
});

it("keeps unrelated authored tokens between independently replaced components", () => {
	const source = '<div className="scale-x-50 px-4 scale-y-75"/>';
	const patches = planPropertyLiteral(
		source,
		target(source, "scale-x-50 px-4 scale-y-75"),
		["scale-x-50", "scale-y-75"],
		["scale-100"],
	);
	expect(patches).toHaveLength(2);
	const saved = applySourcePatches(source, patches);
	expect(saved.text).toBe('<div className=" px-4 scale-100"/>');
	expect(applySourcePatches(saved.text, saved.inverse).text).toBe(source);
});

it("creates and removes an absent JSX class while preserving every other byte", () => {
	const source = '<div title="Keep" />';
	const saved = applySourcePatches(source, planPropertyLiteral(source, target(source, null), [], ["opacity-50"]));
	expect(saved.text).toBe('<div title="Keep"  className="opacity-50"/>');
	expect(applySourcePatches(saved.text, saved.inverse).text).toBe(source);
	const removed = applySourcePatches(
		saved.text,
		planPropertyLiteral(saved.text, target(saved.text, "opacity-50"), ["opacity-50"], []),
	);
	expect(removed.text).toBe('<div title="Keep"  />');
	expect(applySourcePatches(removed.text, removed.inverse).text).toBe(saved.text);
});

it("refuses duplicate tokens and executable fields instead of guessing token ownership", () => {
	const duplicated = '<div className="opacity-50 opacity-50"/>';
	expect(() =>
		planPropertyLiteral(duplicated, target(duplicated, "opacity-50 opacity-50"), ["opacity-50"], ["opacity-75"]),
	).toThrow("duplicate");
	const expression = "<div className={classes}/>";
	expect(() =>
		planPropertyLiteral(expression, target(expression, "opacity-50"), ["opacity-50"], ["opacity-75"]),
	).toThrow("expression");
});
