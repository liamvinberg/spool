import { describe, expect, it } from "vitest";
import type { SourcePropertyEffect } from "../source-property";
import {
	authoredCandidates,
	locateDeclaration,
	planDeclarationLiteral,
	propertySourceOwner,
} from "./source-property-declaration";

const css = `/* project rules */
.card {
	padding: 12px;
	color: red;
}
@media (min-width: 48rem) {
	.card { font-size: 20px }
}
.card:hover { padding-top: 3px !important }
.other { padding: 12px }
`;

const effect = (path: readonly string[], property: string, value: string, important = false): SourcePropertyEffect => ({
	owner: null,
	path,
	property,
	value,
	important,
});

describe("finding an authored declaration in its own file", () => {
	it("gives the value span of the declaration its predicate names", () => {
		const found = locateDeclaration(css, effect([".card"], "color", "red"));
		expect(css.slice(found.start, found.end)).toBe("red");
	});

	it("keeps a conditional declaration apart from the unconditional one", () => {
		const found = locateDeclaration(css, effect(["@media (min-width: 48rem)", ".card"], "font-size", "20px"));
		expect(css.slice(found.start, found.end)).toBe("20px");
	});

	it("keeps the important marker outside the value it replaces", () => {
		const found = locateDeclaration(css, effect([".card:hover"], "padding-top", "3px", true));
		expect(css.slice(found.start, found.end)).toBe("3px");
		expect(found.important).toBe(true);
	});

	it("refuses a declaration another selector also spells the same way", () => {
		expect(() => locateDeclaration(css, effect([".card", ".other"], "padding", "12px"))).toThrow();
	});

	it.each([
		["a predicate the file does not carry", effect(["@media print", ".card"], "color", "red")],
		["a value the file does not carry", effect([".card"], "color", "blue")],
		["a priority the file does not carry", effect([".card"], "color", "red", true)],
	])("refuses %s", (_name, held) => {
		expect(() => locateDeclaration(css, held)).toThrow();
	});
});

describe("which authored declarations can own a property here", () => {
	const certificate = {
		effects: [
			effect(["@layer base", "*"], "padding", "0"),
			effect([".card"], "padding", "12px"),
			effect(["@container (min-width: 20rem)", ".card"], "padding", "8px"),
			effect(["@media (min-width: 48rem)", ".card"], "padding", "16px"),
			{ ...effect(["@layer utilities", "$"], "padding", "1.5rem"), owner: "p-6" },
		],
	};

	it("takes the project's own unlayered rules and leaves the compiler's layers alone", () => {
		expect(
			authoredCandidates(certificate, new Set(["padding-left"]), { direction: "ltr", writingMode: "horizontal-tb" }),
		).toEqual([certificate.effects[1], certificate.effects[3]]);
	});
});

describe("writing one authored declaration", () => {
	it("replaces the value and nothing around it", () => {
		const patches = planDeclarationLiteral(css, effect([".card"], "padding", "12px"), "20px");
		let text = css;
		for (const patch of patches) text = text.slice(0, patch.start) + patch.text + text.slice(patch.end);
		expect(text).toBe(css.replace("padding: 12px", "padding: 20px"));
	});
});

describe("which source owns the winning effect", () => {
	const ltr = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const utility = (property: string, value: string, important = false): SourcePropertyEffect => ({
		owner: important ? "p-6!" : "p-6",
		path: ["@layer utilities", "$"],
		property,
		value,
		important,
	});
	const member: SourcePropertyEffect = {
		owner: "padding",
		path: [],
		property: "padding",
		value: "40px",
		important: false,
	};
	const authored = effect([".card"], "padding", "12px");
	const roots = new Set(["padding-left"]);

	it("gives an unlayered project declaration the property an ordinary utility also sets", () => {
		expect(
			propertySourceOwner(
				roots,
				[utility("padding", "1.5rem")],
				[],
				{ effects: [utility("padding", "1.5rem"), authored] },
				ltr,
			),
		).toEqual({ kind: "declaration", effects: [authored] });
	});

	it("leaves the element's own member above an ordinary project declaration", () => {
		expect(propertySourceOwner(roots, [], [member], { effects: [authored] }, ltr)).toEqual({
			kind: "style",
			members: ["padding"],
		});
	});

	it("leaves an important project declaration above the element's own member", () => {
		const strong = effect([".card"], "padding", "12px", true);
		expect(propertySourceOwner(roots, [], [member], { effects: [strong] }, ltr)).toEqual({
			kind: "declaration",
			effects: [strong],
		});
	});

	it("leaves an important utility above an important project declaration", () => {
		const strong = effect([".card"], "padding", "12px", true);
		expect(propertySourceOwner(roots, [utility("padding", "1.5rem", true)], [], { effects: [strong] }, ltr)).toEqual({
			kind: "class",
		});
	});

	it("ignores the compiler's own layers, which an unlayered rule already outranks", () => {
		const preflight = effect(["@layer base", "*"], "padding", "0");
		expect(propertySourceOwner(roots, [], [], { effects: [preflight] }, ltr)).toEqual({ kind: "class" });
	});

	it.each([
		["a project cascade layer", effect(["@layer project", ".card"], "padding", "12px")],
		["a container query", effect(["@container (min-width: 20rem)", ".card"], "padding", "12px")],
		["a nested selector chain", effect([".page", ".card"], "padding", "12px")],
	])("refuses %s it cannot order", (_name, held) => {
		expect(() => propertySourceOwner(roots, [], [], { effects: [held] }, ltr)).toThrow();
	});
});
