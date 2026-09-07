import { describe, expect, it } from "vitest";
import { factoryLiteral, writeFactoryLiteral } from "./factory-literal";
import { applySpan, spanBetween } from "./hand-write";

const target = (source: string, field = "children", value = "Before") => ({
	start: 0,
	end: source.length,
	field,
	value,
});

describe("factory literal source planning", () => {
	it.each([
		['createElement("button", null, "Before")', "children", "Before"],
		['createElement(Button, { label: "Before" })', "label", "Before"],
		['cloneElement(child, { label: "Before" })', "label", "Before"],
		['cloneElement(child, null, "Before")', "children", "Before"],
		['cloneElement(child, { children: "Before" })', "children", "Before"],
		['cloneElement(child, { children: "" })', "children", ""],
		['cloneElement(child, { title: "Before" })', "title", "Before"],
	])("preserves call shape and exact inverse for %s", (source, field, value) => {
		const requested = "\"'&<>{}/\n\r\t\u2028\u2029😀";
		const result = writeFactoryLiteral(source, target(source, field, value), requested);
		expect(factoryLiteral(result, target(result, field, requested)).value).toBe(requested);
		expect(applySpan(result, spanBetween(source, result))).toBe(source);
	});

	it.each([
		"cloneElement(child, config)",
		'cloneElement(child, { ...config, children: "Before" })',
		'cloneElement(child, { ["children"]: "Before" })',
		'cloneElement(child, { get children() { return "Before" } })',
		'cloneElement(child, { children: "Before", children: "Before" })',
		'cloneElement(child, {}, ...["Before"])',
		'cloneElement(child, null, "Before", "Before")',
		'cloneElement(child, { children: String("Before") })',
		'cloneElement(child, { title: "Before" })',
	])("refuses unproved field syntax before changing %s", (source) => {
		expect(() => writeFactoryLiteral(source, target(source), "After")).toThrow();
	});

	it.each(["key", "ref", "type", "data-go", "src", "className", "style"])(
		"keeps %s in its dedicated operation",
		(field) => {
			const source = `createElement(Button, { ${JSON.stringify(field)}: "Before" })`;
			expect(() => writeFactoryLiteral(source, target(source, field), "After")).toThrow(
				"dedicated source operation",
			);
		},
	);

	it("does not borrow an equal literal from a different call range", () => {
		const source = 'cloneElement(child, { label: "Before" })';
		expect(() => writeFactoryLiteral(source, { ...target(source, "label"), start: 1 }, "After")).toThrow(
			"call changed",
		);
		expect(() => writeFactoryLiteral(source, target(source, "label", "Other"), "After")).toThrow("no longer matches");
	});
});
