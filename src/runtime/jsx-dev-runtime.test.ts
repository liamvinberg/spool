import { describe, expect, it } from "vitest";
import { Fragment, itemSiteOf, jsxDEV } from "./jsx-dev-runtime";

/**
 * The stamping runtime (#23): intrinsic elements pick up their compile-time
 * source triple as data-spool-source; components and unstamped calls pass
 * through untouched. Elements land as real React elements — the pinned
 * production jsx runtime does the creating.
 */

const source = { fileName: "frames/cart/frame.tsx", lineNumber: 4, columnNumber: 4 };

interface ElementLike {
	type: unknown;
	props: Record<string, unknown>;
}

describe("jsxDEV", () => {
	it("stamps intrinsic elements with fileName:line:column", () => {
		const el = jsxDEV("button", { className: "pay", children: "Pay now" }, undefined, false, source) as ElementLike;
		expect(el.type).toBe("button");
		expect(el.props["data-spool-source"]).toBe("frames/cart/frame.tsx:4:4");
		expect(el.props.className).toBe("pay");
	});

	it("never stamps components — their own DOM stamps where it is authored", () => {
		const Card = () => null;
		const el = jsxDEV(Card, { children: "x" }, undefined, false, source) as ElementLike;
		expect(el.props["data-spool-source"]).toBeUndefined();
	});

	it("passes through without a source triple", () => {
		const el = jsxDEV("div", { children: "x" }, undefined, false, undefined) as ElementLike;
		expect(el.props["data-spool-source"]).toBeUndefined();
	});

	it("handles static children and fragments", () => {
		const el = jsxDEV(
			"ul",
			{ children: [jsxDEV("li", { children: "a" }, "a", false, source)] },
			undefined,
			true,
			source,
		) as ElementLike;
		expect(el.props["data-spool-source"]).toBe("frames/cart/frame.tsx:4:4");
		const frag = jsxDEV(Fragment, { children: "x" }, undefined, false, source) as ElementLike;
		expect(frag.props["data-spool-source"]).toBeUndefined();
	});
});

/**
 * Which row a rendered element is (#324): one JSX literal inside a `.map()`
 * is drawn once per entry, so the stamp alone cannot say which of them a hand
 * is standing on. The call that receives the array is the one place the array
 * is still an array, so each child is noted with its place in it there.
 */
describe("the row a mapped element is", () => {
	const row = (index: number) =>
		jsxDEV("li", { children: `row ${index}` }, `k${index}`, false, {
			fileName: "shared/ui/rows.tsx",
			lineNumber: 9,
			columnNumber: 20,
		}) as ElementLike;

	it("notes each entry of a lone mapped array with its place in it", () => {
		const rows = [row(0), row(1), row(2)];
		jsxDEV("ul", { children: rows }, undefined, false, source);
		expect(itemSiteOf(rows[1]?.props ?? {})).toEqual({ stamp: "shared/ui/rows.tsx:9:20", index: 1 });
		expect(itemSiteOf(rows[0]?.props ?? {})).toEqual({ stamp: "shared/ui/rows.tsx:9:20", index: 0 });
	});

	it("counts inside the array rather than among the children beside it", () => {
		const rows = [row(0), row(1)];
		const heading = jsxDEV("h2", { children: "Rows" }, undefined, false, source) as ElementLike;
		jsxDEV("section", { children: [heading, rows] }, undefined, true, source);
		expect(itemSiteOf(rows[1]?.props ?? {})).toEqual({ stamp: "shared/ui/rows.tsx:9:20", index: 1 });
	});

	// children an author wrote out are the file's own punctuation, not data: the
	// compiler hands them over as a static array, and no one of them is a row
	it("says nothing about the several children a tag was written with", () => {
		const heading = jsxDEV("h2", { children: "Rows" }, undefined, false, source) as ElementLike;
		const note = jsxDEV("p", { children: "beside it" }, undefined, false, source) as ElementLike;
		jsxDEV("section", { children: [heading, note] }, undefined, true, source);
		expect(itemSiteOf(heading.props)).toBeUndefined();
		expect(itemSiteOf(note.props)).toBeUndefined();
	});

	it("says nothing about an element that stands on its own", () => {
		const only = jsxDEV("p", { children: "alone" }, undefined, false, source) as ElementLike;
		jsxDEV("div", { children: only }, undefined, false, source);
		expect(itemSiteOf(only.props)).toBeUndefined();
	});

	it("notes a component row by the stamp of the call that renders it", () => {
		const Row = () => null;
		const rows = [
			jsxDEV(Row, { label: "a" }, "a", false, { fileName: "frames/x/frame.tsx", lineNumber: 3, columnNumber: 7 }),
			jsxDEV(Row, { label: "b" }, "b", false, { fileName: "frames/x/frame.tsx", lineNumber: 3, columnNumber: 7 }),
		] as ElementLike[];
		jsxDEV("ul", { children: rows }, undefined, false, source);
		expect(itemSiteOf(rows[1]?.props ?? {})).toEqual({ stamp: "frames/x/frame.tsx:3:7", index: 1 });
	});
});
