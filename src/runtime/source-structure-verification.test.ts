// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import type { SourceStructuralExpectation } from "../source-structure";
import { captureStructure, retainVerifiedRestorations, verifyStructure } from "./source-structure-verification";

const site = "parent";
const locations = Object.fromEntries(["a", "b", "c"].map((key) => [`${site}/children:${JSON.stringify(key)}`, key]));
function expected(keys: string[]): SourceStructuralExpectation {
	return { kind: "structure", site, state: { lists: { [site]: keys }, optional: {}, factories: {} } };
}
function fixture() {
	vi.stubGlobal("__SPOOL_OBSERVER__", {
		observe: (element: HTMLElement) => ({ source: element.dataset.spoolSource, chain: [] }),
	});
	const parent = document.createElement("main");
	const units = ["a", "b", "c"].map((key) => {
		const element = document.createElement("input");
		element.dataset.spoolSource = key;
		element.value = key;
		parent.append(element);
		return element;
	});
	document.body.append(parent);
	return { parent, a: units[0]!, b: units[1]!, c: units[2]! };
}
afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

it("retains only verified restoration roots for a preceding delete's later inverse", () => {
	const { parent, a, b, c } = fixture();
	const first = captureStructure(expected(["a", "b", "c"]), locations);
	a.remove();
	const second = captureStructure(expected(["b", "c"]), locations);
	b.remove();
	const restoredB = b.cloneNode() as HTMLInputElement;
	parent.prepend(restoredB);
	const restored = expected(["b", "c"]);
	const outcomes = verifyStructure(
		second,
		restored,
		expected(["c"]).state,
		locations,
		() => false,
		() => false,
	);
	expect(outcomes.map((outcome) => outcome.rendered)).toEqual(["verified"]);
	retainVerifiedRestorations(first, restored, expected(["c"]).state, locations, new Set([parent]));
	const restoredA = a.cloneNode() as HTMLInputElement;
	parent.prepend(restoredA);
	expect(
		verifyStructure(
			first,
			expected(["a", "b", "c"]),
			restored.state,
			locations,
			() => false,
			() => false,
		).map((outcome) => outcome.rendered),
	).toEqual(["verified"]);
	expect(parent.children[1]).toBe(restoredB);
	expect(parent.children[2]).toBe(c);
});

it.each(["unverified restoration", "outside replacement"])("keeps strict survivor identity for an %s", (change) => {
	const { parent, a, b } = fixture();
	const first = captureStructure(expected(["a", "b", "c"]), locations);
	a.remove();
	b.replaceWith(b.cloneNode());
	retainVerifiedRestorations(
		first,
		expected(["b", "c"]),
		expected(change === "outside replacement" ? ["b", "c"] : ["c"]).state,
		locations,
		new Set(change === "outside replacement" ? [parent] : []),
	);
	parent.prepend(a.cloneNode());
	expect(
		verifyStructure(
			first,
			expected(["a", "b", "c"]),
			expected(["b", "c"]).state,
			locations,
			() => false,
			() => false,
		)[0],
	).toMatchObject({ rendered: "mismatching", reason: "a surviving structural unit changed native identity" });
});

it.each([
	["missing neighbor", "a canonical structural member is absent"],
	["wrong order", "the original parent has different membership or neighboring output"],
	["native reset", "a surviving native field or scroll position changed"],
] as const)("does not prove a delete from absence alone: %s", (change, reason) => {
	const { parent, a, b, c } = fixture();
	b.value = "dirty";
	b.setSelectionRange(1, 3);
	const basis = captureStructure(expected(["a", "b", "c"]), locations);
	a.remove();
	if (change === "missing neighbor") b.remove();
	if (change === "wrong order") parent.prepend(c);
	if (change === "native reset") b.value = "reset";
	expect(
		verifyStructure(
			basis,
			expected(["b", "c"]),
			expected(["a", "b", "c"]).state,
			locations,
			() => false,
			() => false,
		)[0],
	).toMatchObject({ rendered: "mismatching", reason });
});

it.each(["pending", "failed", "unmounted"] as const)("reports original parent %s after deletion", (rendered) => {
	const { parent, a } = fixture();
	const basis = captureStructure(expected(["a", "b", "c"]), locations);
	a.remove();
	if (rendered === "unmounted") parent.remove();
	expect(
		verifyStructure(
			basis,
			expected(["b", "c"]),
			expected(["a", "b", "c"]).state,
			locations,
			(element) => rendered === "pending" && element === parent,
			(element) => rendered === "failed" && element === parent,
		)[0],
	).toMatchObject({ parent, rendered });
});

it("keeps an incomplete original multi-root group unverified even after all target roots disappear", () => {
	const { parent, a } = fixture();
	const duplicate = a.cloneNode();
	parent.prepend(duplicate);
	const basis = captureStructure(expected(["a", "b", "c"]), locations);
	a.remove();
	parent.removeChild(duplicate);
	expect(
		verifyStructure(
			basis,
			expected(["b", "c"]),
			expected(["a", "b", "c"]).state,
			locations,
			() => false,
			() => false,
		)[0],
	).toMatchObject({
		rendered: "unverified",
		reason: "the original structural unit has ambiguous or incomplete native roots",
	});
});

it("does not verify a delete that moves focus away from an unchanged surviving input", () => {
	const { a, b, c } = fixture();
	b.focus();
	const basis = captureStructure(expected(["a", "b", "c"]), locations);
	a.remove();
	c.focus();
	expect(
		verifyStructure(
			basis,
			expected(["b", "c"]),
			expected(["a", "b", "c"]).state,
			locations,
			() => false,
			() => false,
		)[0],
	).toMatchObject({ rendered: "mismatching", reason: "a surviving native field lost focus" });
});

it("does not apply another source parent's canonical expectation to the original native parent", () => {
	const { a } = fixture();
	const basis = captureStructure(expected(["a", "b", "c"]), locations);
	a.remove();
	const other: SourceStructuralExpectation = {
		kind: "structure",
		site: "other-parent",
		state: { lists: { "other-parent": ["b", "c"] }, optional: {}, factories: {} },
	};
	expect(
		verifyStructure(
			basis,
			other,
			expected(["a", "b", "c"]).state,
			locations,
			() => false,
			() => false,
		)[0],
	).toMatchObject({ rendered: "unverified", reason: "the expectation belongs to another structural parent" });
});
