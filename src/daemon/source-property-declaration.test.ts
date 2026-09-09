import { describe, expect, it } from "vitest";
import type { SourcePropertyEffect } from "../source-property";
import {
	declarationFile,
	declarationPath,
	declarationScope,
	locateDeclaration,
	planDeclarationLiteral,
	propertySourceOwner,
	requestedDeclaration,
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
				[{ path: [".card"], active: true }],
			),
		).toEqual({ kind: "declaration", effects: [authored] });
	});

	it("leaves the element's own member above an ordinary project declaration", () => {
		expect(
			propertySourceOwner(roots, [], [member], { effects: [authored] }, ltr, [{ path: [".card"], active: true }]),
		).toEqual({
			kind: "style",
			members: ["padding"],
		});
	});

	it("leaves an important project declaration above the element's own member", () => {
		const strong = effect([".card"], "padding", "12px", true);
		expect(
			propertySourceOwner(roots, [], [member], { effects: [strong] }, ltr, [{ path: [".card"], active: true }]),
		).toEqual({
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
		expect(
			propertySourceOwner(roots, [], [], { effects: [preflight] }, ltr, [
				{ path: ["@layer base", "*"], active: true },
			]),
		).toEqual({
			kind: "class",
		});
	});

	it.each([
		["a project cascade layer", effect(["@layer project", ".card"], "padding", "12px")],
		["a container query", effect(["@container (min-width: 20rem)", ".card"], "padding", "12px")],
		["a nested selector chain", effect([".page", ".card"], "padding", "12px")],
	])("refuses %s it cannot order", (_name, held) => {
		expect(() =>
			propertySourceOwner(roots, [], [], { effects: [held] }, ltr, [{ path: held.path, active: true }]),
		).toThrow();
	});

	it("leaves a project rule that does not apply to this element out of the cascade", () => {
		expect(
			propertySourceOwner(roots, [], [], { effects: [authored] }, ltr, [{ path: [".elsewhere"], active: true }]),
		).toEqual({
			kind: "class",
		});
	});
});

describe("a project rule the compiler named after a class the element wears", () => {
	const ltr = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const named: SourcePropertyEffect = {
		owner: "card",
		path: ["$"],
		property: "color",
		value: "red",
		important: false,
	};

	it("reads its own selector back out of the compiler's subject", () => {
		expect(declarationPath(named)).toEqual([".card"]);
		expect(declarationPath({ ...named, path: ["@media (min-width: 48rem)", "$:hover"] })).toEqual([
			"@media (min-width: 48rem)",
			".card:hover",
		]);
	});

	it("finds it in the file by the selector, not by the compiler's placeholder", () => {
		const found = locateDeclaration(css, { ...named, owner: "card", path: ["$"] });
		expect(css.slice(found.start, found.end)).toBe("red");
	});

	it("owns the property over the utility it outranks, and needs the element to match it", () => {
		const utility: SourcePropertyEffect = {
			owner: "text-blue-500",
			path: ["@layer utilities", "$"],
			property: "color",
			value: "blue",
			important: false,
		};
		const roots = new Set(["color"]);
		expect(
			propertySourceOwner(roots, [named, utility], [], { effects: [utility, named] }, ltr, [
				{ path: [".card"], active: true },
			]),
		).toEqual({
			kind: "declaration",
			effects: [named],
		});
		expect(
			propertySourceOwner(roots, [named, utility], [], { effects: [utility, named] }, ltr, [
				{ path: [".elsewhere"], active: true },
			]),
		).toEqual({ kind: "class" });
	});
});

describe("a rule that is written for the element but is not applying", () => {
	const ltr = { direction: "ltr", writingMode: "horizontal-tb" } as const;
	const utility: SourcePropertyEffect = {
		owner: "opacity-75",
		path: ["@layer utilities", "$"],
		property: "opacity",
		value: "75%",
		important: false,
	};
	const roots = new Set(["opacity"]);

	it("leaves an unsatisfied condition to its own scope, and the base row to what is applying", () => {
		const conditional = effect(["@media (min-width: 5000px)", ".card"], "opacity", "0.25");
		expect(
			propertySourceOwner(roots, [utility], [], { effects: [utility, conditional] }, ltr, [
				{ path: ["@media (min-width: 5000px)", ".card"], active: false },
			]),
		).toEqual({ kind: "class" });
	});

	it("leaves a state rule to its own scope, even while the element is in that state", () => {
		const hovered = effect([".card:hover"], "opacity", "0.25");
		expect(
			propertySourceOwner(roots, [utility], [], { effects: [utility, hovered] }, ltr, [
				{ path: [".card:hover"], active: true },
			]),
		).toEqual({ kind: "class" });
	});

	it("gives the base row an unconditional rule that is applying", () => {
		const plain = effect([".card"], "opacity", "0.25");
		expect(
			propertySourceOwner(roots, [utility], [], { effects: [utility, plain] }, ltr, [
				{ path: [".card"], active: true },
			]),
		).toEqual({ kind: "declaration", effects: [plain] });
	});

	it("leaves an unconditional rule that has stopped applying out of the cascade", () => {
		const plain = effect([".card"], "opacity", "0.25");
		expect(
			propertySourceOwner(roots, [utility], [], { effects: [utility, plain] }, ltr, [
				{ path: [".card"], active: false },
			]),
		).toEqual({ kind: "class" });
	});
});

describe("the declaration forms the readers can prove, and the ones they cannot", () => {
	const attributes = `.card[data-state="open"] { padding: 12px }
[data-theme="dark"] .card { color: var(--color-brand) }
.card:not(.plain) { margin: 4px }
`;

	it("finds a declaration under an attribute selector by its own spelling", () => {
		const found = locateDeclaration(attributes, effect(['.card[data-state="open"]'], "padding", "12px"));
		expect(attributes.slice(found.start, found.end)).toBe("12px");
	});

	it("finds one whose subject is a captured state on an ancestor", () => {
		const found = locateDeclaration(attributes, effect(['[data-theme="dark"] .card'], "color", "var(--color-brand)"));
		expect(attributes.slice(found.start, found.end)).toBe("var(--color-brand)");
	});

	it("keeps a theme reference as the value it is written as", () => {
		const patches = planDeclarationLiteral(
			attributes,
			effect(['[data-theme="dark"] .card'], "color", "var(--color-brand)"),
			"var(--color-raised)",
		);
		expect(patches).toEqual([{ start: expect.any(Number), end: expect.any(Number), text: "var(--color-raised)" }]);
	});

	it("reads an attribute condition as part of what the row is written under", () => {
		expect(declarationScope(effect(['.card[data-state="open"]'], "padding", "12px"))).toEqual([]);
		expect(declarationScope(effect(["@media (min-width: 48rem)", ".card"], "padding", "12px"))).toEqual([
			"@media (min-width: 48rem)",
		]);
		expect(declarationScope(effect([".card:hover"], "padding", "12px"))).toEqual([".card:hover"]);
	});

	it("refuses a declaration whose own scope this reader cannot order", () => {
		expect(() =>
			locateDeclaration(attributes, effect(["@container (min-width: 20rem)", ".card"], "padding", "12px")),
		).toThrow(/cascade order/);
	});
});

describe("the refusals a write meets before it saves", () => {
	const inputs = (files: Record<string, string>) =>
		Object.entries(files).map(([file, text]) => [file, { bytes: Buffer.from(text) }] as [string, { bytes: Buffer }]);

	it("refuses a declaration two stylesheets both carry", () => {
		expect(() =>
			declarationFile(
				effect([".card"], "color", "red"),
				inputs({ "a.css": ".card { color: red }", "b.css": ".card { color: red }" }),
			),
		).toThrow(/single authored stylesheet range/);
	});

	it("refuses a declaration no stylesheet carries", () => {
		expect(() =>
			declarationFile(effect([".card"], "color", "red"), inputs({ "a.css": ".other { color: red }" })),
		).toThrow(/single authored stylesheet range/);
	});

	it("names the stylesheet that does carry it", () => {
		expect(
			declarationFile(
				effect([".card"], "color", "red"),
				inputs({ "a.css": ".other { color: blue }", "b.css": ".card { color: red }", "c.tsx": ".card{color:red}" }),
			),
		).toBe("b.css");
	});

	it("refuses a removal, which an authored declaration has no operation for", async () => {
		await expect(requestedDeclaration("color", { kind: "remove" }, async () => ({ effects: [] }))).resolves.toBe(
			null,
		);
	});

	it("refuses a binding that spells more than one value for the property", async () => {
		await expect(
			requestedDeclaration("color", { kind: "binding", tokens: ["text-a", "text-b"] }, async () => ({
				effects: [
					{ owner: "text-a", path: [], property: "color", value: "red", important: false },
					{ owner: "text-b", path: [], property: "color", value: "blue", important: false },
				],
			})),
		).rejects.toThrow(/one declaration for this property/);
	});

	it("gives a binding the declaration the compiler spells for it", async () => {
		await expect(
			requestedDeclaration("color", { kind: "binding", tokens: ["text-brand"] }, async () => ({
				effects: [
					{ owner: "text-brand", path: [], property: "color", value: "var(--color-brand)", important: false },
				],
			})),
		).resolves.toBe("var(--color-brand)");
	});
});
