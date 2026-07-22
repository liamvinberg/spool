import { describe, expect, it } from "vitest";
import { extractJsxSpan } from "./jsx-span";

/**
 * The span extractor behind element selection (#23): a compile-time stamp
 * gives the exact start of a JSX element (#6, Onlook pattern); this walks the
 * source text to the element's end so the payload can carry lines + excerpt.
 * The file compiled (it was served), so tags balance — the scanner only has
 * to survive JS expressions, strings and comments, and degrade honestly when
 * it cannot.
 */

const lines = (...text: string[]) => text.join("\n");

describe("extractJsxSpan", () => {
	it("spans a one-line element, excerpt verbatim", () => {
		const source = lines(
			"export default function Frame() {",
			"\treturn (",
			"\t\t<main>",
			'\t\t\t<button className="pay">Pay now</button>',
			"\t\t</main>",
			"\t);",
			"}",
		);
		expect(extractJsxSpan(source, 4, 4)).toEqual({
			lines: [4, 4],
			excerpt: '<button className="pay">Pay now</button>',
		});
	});

	it("spans a multi-line element through nested same-name children", () => {
		const source = lines("const x = (", "\t<div>", "\t\t<div>inner</div>", "\t</div>", ");");
		expect(extractJsxSpan(source, 2, 2)).toEqual({
			lines: [2, 4],
			excerpt: "<div>\n\t\t<div>inner</div>\n\t</div>",
		});
	});

	it("ends a self-closing element at its own tag", () => {
		const source = lines("const x = (", '\t<input type="text" />', ");");
		expect(extractJsxSpan(source, 2, 2)).toEqual({
			lines: [2, 2],
			excerpt: '<input type="text" />',
		});
	});

	it("survives attribute expressions holding arrows, comparisons and tag-like strings", () => {
		const source = lines(
			"const x = (",
			'\t<button onClick={() => go(a > b ? "x" : "</button>")} title={"{"}>',
			"\t\tGo",
			"\t</button>",
			");",
		);
		expect(extractJsxSpan(source, 2, 2)).toEqual({
			lines: [2, 4],
			excerpt: '<button onClick={() => go(a > b ? "x" : "</button>")} title={"{"}>\n\t\tGo\n\t</button>',
		});
	});

	it("skips child expressions wholesale, nested JSX and all", () => {
		const source = lines(
			"const x = (",
			"\t<ul>",
			"\t\t{items.map((i) => (",
			"\t\t\t<li key={i}>{i}</li>",
			"\t\t))}",
			"\t</ul>",
			");",
		);
		expect(extractJsxSpan(source, 2, 2)).toEqual({
			lines: [2, 6],
			excerpt: "<ul>\n\t\t{items.map((i) => (\n\t\t\t<li key={i}>{i}</li>\n\t\t))}\n\t</ul>",
		});
	});

	it("survives template literals with nested expressions in attributes", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture IS template syntax inside a plain string
		const source = lines("const x = (", '\t<div className={`a ${x > 2 ? "b" : `${y}`} c`}>ok</div>', ");");
		expect(extractJsxSpan(source, 2, 2)).toEqual({
			lines: [2, 2],
			// biome-ignore lint/suspicious/noTemplateCurlyInString: same fixture, expected verbatim
			excerpt: '<div className={`a ${x > 2 ? "b" : `${y}`} c`}>ok</div>',
		});
	});

	it("survives JSX comments and fragments in content", () => {
		const source = lines(
			"const x = (",
			"\t<section>",
			"\t\t{/* a <fake> tag } */}",
			"\t\t<>",
			"\t\t\t<i>a</i>",
			"\t\t</>",
			"\t</section>",
			");",
		);
		expect(extractJsxSpan(source, 2, 2)).toEqual({
			lines: [2, 7],
			excerpt: "<section>\n\t\t{/* a <fake> tag } */}\n\t\t<>\n\t\t\t<i>a</i>\n\t\t</>\n\t</section>",
		});
	});

	it("falls back to the opening tag as excerpt when the span runs long, lines still whole", () => {
		const filler = Array.from({ length: 20 }, (_, i) => `\t\t<p>row ${i} with some padding text</p>`);
		const source = lines("const x = (", '\t<main className="screen">', ...filler, "\t</main>", ");");
		expect(extractJsxSpan(source, 2, 2)).toEqual({
			lines: [2, 23],
			excerpt: '<main className="screen">',
		});
	});

	it("spans a multi-line opening tag, self-closing", () => {
		const source = lines("const x = (", "\t<img", '\t\tsrc="/a.png"', '\t\talt="a"', "\t/>", ");");
		expect(extractJsxSpan(source, 2, 2)).toEqual({
			lines: [2, 5],
			excerpt: '<img\n\t\tsrc="/a.png"\n\t\talt="a"\n\t/>',
		});
	});

	it("returns undefined when the position does not point at a tag", () => {
		const source = lines("const x = 1;", "const y = 2;");
		expect(extractJsxSpan(source, 1, 7)).toBeUndefined();
		expect(extractJsxSpan(source, 99, 1)).toBeUndefined();
		expect(extractJsxSpan(source, 1, 99)).toBeUndefined();
	});

	it("degrades to the opening tag when the close never comes (source edited since serve)", () => {
		const source = lines("const x = (", '\t<button className="pay">Pay now', ");");
		expect(extractJsxSpan(source, 2, 2)).toEqual({
			lines: [2, 2],
			excerpt: '<button className="pay">',
		});
	});

	it("returns undefined when even the opening tag never closes", () => {
		const source = lines("const x = (", "\t<button className={");
		expect(extractJsxSpan(source, 2, 2)).toBeUndefined();
	});

	it("caps a giant opening tag's excerpt without losing the span", () => {
		const source = lines("const x = (", `\t<div className="${"very-long-utility ".repeat(30)}">ok</div>`, ");");
		const span = extractJsxSpan(source, 2, 2);
		expect(span?.lines).toEqual([2, 2]);
		expect(span?.excerpt.length).toBeLessThanOrEqual(240);
		expect(span?.excerpt.endsWith("…")).toBe(true);
	});
});
