import { transform } from "esbuild";
import { describe, expect, it } from "vitest";
import { isLayoutOnly, readJsxText, textCore, writeJsxText } from "./jsx-text";

/**
 * The write lane's escaping rule (#253), checked against the compiler that
 * actually reads it. `renders` runs a written string through esbuild the way a
 * frame is built and reports the string React would be handed, so a round trip
 * is proved rather than asserted.
 */

async function renders(source: string): Promise<string> {
	const built = await transform(source, { loader: "tsx", jsx: "transform", jsxFactory: "h", jsxFragment: "f" });
	const children: unknown[] = [];
	const h = (_tag: string, _props: unknown, ...kids: unknown[]) => void children.push(...kids);
	new Function("h", built.code)(h);
	if (children.length !== 1 || typeof children[0] !== "string") {
		throw new Error(`not one text child: ${JSON.stringify(children)}`);
	}
	return children[0];
}

const inTags = (raw: string) => `<p>${raw}</p>;`;

describe("readJsxText", () => {
	it("folds a line break and its indentation away, keeping whitespace inside a line", () => {
		expect(readJsxText("\n\t\t\tPay now\n\t\t")).toBe("Pay now");
		expect(readJsxText("\n\t\t\tone\n\t\t\ttwo\n\t\t")).toBe("one two");
		expect(readJsxText(" spaced  out ")).toBe(" spaced  out ");
	});

	it("decodes the entities an author writes, and leaves what it does not know", () => {
		expect(readJsxText("a &amp; b &lt;c&gt; &quot;d&quot; &#123;e&#125;")).toBe('a & b <c> "d" {e}');
		expect(readJsxText("&#x41;&#66;")).toBe("AB");
		expect(readJsxText("&hellip;")).toBe("&hellip;");
	});

	it("decodes after folding, so an entity survives what a raw character would not", () => {
		expect(readJsxText("\n\t\t\tline&#10;break\n\t\t")).toBe("line\nbreak");
	});
});

describe("writeJsxText", () => {
	const cases = [
		"Pay now",
		"Tom & Jerry",
		"a < b > c",
		"{braces} and }{",
		'she said "hi" and it\'s fine',
		"&amp; stays literal",
		"  padded  ",
		"line\nbreak",
		"tab\there",
		"emoji 🧵 and accents é",
	];

	it.each(cases)("round-trips %j through the real compiler", async (text) => {
		const raw = writeJsxText(text);
		expect(readJsxText(raw)).toBe(text);
		expect(await renders(inTags(raw))).toBe(text);
	});

	it("round-trips when the splice sits inside an author's indentation", async () => {
		const raw = writeJsxText("  padded  ");
		expect(await renders(`<p>\n\t\t${raw}\n\t</p>;`)).toBe("  padded  ");
	});

	it("writes nothing for nothing", () => {
		expect(writeJsxText("")).toBe("");
	});
});

describe("textCore", () => {
	it("keeps the line breaks and indentation at each end out of the splice", () => {
		const raw = "\n\t\t\tPay now\n\t\t";
		const { start, end } = textCore(raw);
		expect(raw.slice(start, end)).toBe("Pay now");
		expect(raw.slice(0, start)).toBe("\n\t\t\t");
		expect(raw.slice(end)).toBe("\n\t\t");
	});

	it("treats same-line whitespace as text, because the fold does", () => {
		expect(textCore(" Pay now ")).toEqual({ start: 0, end: 9 });
	});

	it("calls a run that folds to nothing layout", () => {
		expect(isLayoutOnly("\n\t\t")).toBe(true);
		expect(isLayoutOnly(" ")).toBe(false);
		expect(isLayoutOnly("x")).toBe(false);
	});
});
