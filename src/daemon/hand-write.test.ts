import { describe, expect, it } from "vitest";
import { applySpan, fingerprintOf, type HandOp, planOps, spanBetween } from "./hand-write";
import { readJsxText } from "./jsx-text";

/**
 * The lane itself (#253), over text: what each op splices, what the gate
 * refuses and why, and the promise the whole thing rests on — the file comes
 * back byte-identical outside the characters the op touched.
 */

const FRAME = `import { Card } from "../../shared/ui/card";

const ITEMS = ["latte", "bun"];

export default function Frame() {
	return (
		<main className="flex flex-col gap-2 p-4">
			<h1 className="text-lg">Cart</h1>
			<button className="rounded-md bg-thread px-3 py-2" onClick={() => pay()}>
				Pay now
			</button>
			<img src="/a.png" alt="a" />
			<p className={busy ? "opacity-50" : "opacity-100"}>state</p>
			<p style={{ padding: 8 }} className="p-2">pinned</p>
			<ul className="flex flex-col">
				{ITEMS.map((item) => (
					<li key={item} className="px-2">{item}</li>
				))}
			</ul>
			<div {...rest}>spread</div>
			<span className="tabular-nums">{count}</span>
			<Card />
		</main>
	);
}
`;

/** The stamp the compiler would mint for the element this snippet opens. */
function stamp(source: string, snippet: string): string {
	const at = source.indexOf(snippet);
	if (at === -1) throw new Error(`no ${snippet} in the fixture`);
	const before = source.slice(0, at);
	const line = before.split("\n").length;
	const column = at - (before.lastIndexOf("\n") + 1) + 1;
	return `frames/cart/frame.tsx:${line}:${column}`;
}

function plan(ops: readonly HandOp[], source = FRAME) {
	return planOps(source, ops);
}

/** What one op leaves the file saying, and nothing else about it. */
function written(ops: readonly HandOp[], source = FRAME): string {
	const planned = plan(ops, source);
	if (!planned.ok) throw new Error(`refused: ${planned.refusal.says}`);
	return planned.text;
}

function refusal(ops: readonly HandOp[], source = FRAME) {
	const planned = plan(ops, source);
	if (planned.ok) throw new Error("expected a refusal");
	return planned.refusal;
}

describe("set-class", () => {
	it("rewrites the literal and leaves every other character alone", () => {
		const text = written([{ kind: "set-class", source: stamp(FRAME, "<main"), token: "p-6", scope: "" }]);
		expect(text).toContain('<main className="flex flex-col gap-2 p-6">');
		expect(text.replace('gap-2 p-6"', 'gap-2 p-4"')).toBe(FRAME);
	});

	it("folds two ops on one element into one patch, so a corner drag is one edit", () => {
		const source = stamp(FRAME, "<button");
		const text = written([
			{ kind: "set-class", source, token: "pt-4", scope: "" },
			{ kind: "set-class", source, token: "pb-4", scope: "" },
		]);
		expect(text).toContain('className="rounded-md bg-thread py-4 px-3"');
	});

	it("touches only the token that changed, so a literal keeps the shape its author gave it", () => {
		const source = 'const x = (\n\t<div\n\t\tclassName="flex flex-col\n\t\t\titems-center gap-2"\n\t/>\n);\n';
		const text = written([{ kind: "set-class", source: stamp(source, "<div"), token: "gap-4", scope: "" }], source);
		expect(text).toBe(source.replace("gap-2", "gap-4"));
	});

	it("writes a className onto an element that has none", () => {
		const text = written([{ kind: "set-class", source: stamp(FRAME, "<ul"), token: "gap-2", scope: "" }]);
		expect(text).toContain('<ul className="flex flex-col gap-2">');
	});

	it("refuses a computed className and names the expression", () => {
		expect(
			refusal([{ kind: "set-class", source: stamp(FRAME, "<p className={busy"), token: "p-2", scope: "" }]),
		).toEqual({
			code: "computed-class",
			says: "className is an expression",
			expression: '{busy ? "opacity-50" : "opacity-100"}',
		});
	});

	it("refuses when an inline style pins the element", () => {
		expect(refusal([{ kind: "set-class", source: stamp(FRAME, "<p style"), token: "p-4", scope: "" }]).code).toBe(
			"inline-style",
		);
	});

	it("refuses spread props with no literal to write into", () => {
		expect(refusal([{ kind: "set-class", source: stamp(FRAME, "<div {...rest}"), token: "p-4", scope: "" }])).toEqual(
			{
				code: "spread-props",
				says: "spread props with no literal",
			},
		);
	});

	it("refuses a base class a screen variant would beat", () => {
		const source = `const x = <div className="w-56 md:w-96" />;\n`;
		expect(refusal([{ kind: "set-class", source: stamp(source, "<div"), token: "w-72", scope: "" }], source)).toEqual(
			{
				code: "variant-conflict",
				says: "variant-prefixed conflict",
				expression: "md:w-96",
			},
		);
	});

	it("writes a mapped row, and says that is what it did", () => {
		const planned = plan([{ kind: "set-class", source: stamp(FRAME, "<li"), token: "px-4", scope: "" }]);
		expect(planned.ok && planned.mapped).toBe(true);
		expect(planned.ok && planned.text).toContain('<li key={item} className="px-4">');
	});
});

describe("set-text", () => {
	it("replaces the words and keeps the author's indentation", () => {
		const text = written([{ kind: "set-text", source: stamp(FRAME, "<button"), text: "Pay later" }]);
		expect(text).toContain("\t\t\t\tPay later\n\t\t\t</button>");
	});

	it("writes braces, quotes and ampersands as the entities that read back", () => {
		const text = written([{ kind: "set-text", source: stamp(FRAME, "<h1"), text: 'Tom & {Jerry} say "hi"' }]);
		expect(text).toContain('<h1 className="text-lg">Tom &amp; &#123;Jerry&#125; say "hi"</h1>');
	});

	it("refuses an expression child and names it", () => {
		expect(refusal([{ kind: "set-text", source: stamp(FRAME, "<span"), text: "x" }])).toEqual({
			code: "expression-text",
			says: "the text is an expression",
			expression: "{count}",
		});
	});

	it("refuses the words of a mapped row, because they are data", () => {
		expect(refusal([{ kind: "set-text", source: stamp(FRAME, "<li"), text: "x" }])).toEqual({
			code: "mapped-text",
			says: "the words are data, not design",
		});
	});

	it("refuses an element whose content is other elements", () => {
		expect(refusal([{ kind: "set-text", source: stamp(FRAME, "<main"), text: "x" }]).code).toBe("no-text");
		expect(refusal([{ kind: "set-text", source: stamp(FRAME, "<img"), text: "x" }]).code).toBe("no-text");
	});
});

describe("delete", () => {
	it("takes the element's own lines and leaves no gap", () => {
		const text = written([{ kind: "delete", source: stamp(FRAME, "<img") }]);
		expect(text).not.toContain("<img");
		expect(text).toContain("</button>\n\t\t\t<p className={busy");
	});

	it("takes a multi-line element whole", () => {
		const text = written([{ kind: "delete", source: stamp(FRAME, "<button") }]);
		expect(text).not.toContain("Pay now");
		expect(text).toContain('<h1 className="text-lg">Cart</h1>\n\t\t\t<img');
	});

	it("refuses an element that is not a child of another", () => {
		const source = `const x = <div className="p-4" />;\n`;
		expect(refusal([{ kind: "delete", source: stamp(source, "<div") }], source)).toEqual({
			code: "not-a-child",
			says: "not a whole child of its parent",
		});
	});
});

describe("set-attribute", () => {
	it("replaces one string literal and nothing else on the tag", () => {
		const text = written([{ kind: "set-attribute", source: stamp(FRAME, "<img"), name: "alt", value: "a latte" }]);
		expect(text).toContain('<img src="/a.png" alt="a latte" />');
	});

	it("writes an attribute the element does not carry yet", () => {
		const text = written([{ kind: "set-attribute", source: stamp(FRAME, "<h1"), name: "title", value: "the cart" }]);
		expect(text).toContain('<h1 title="the cart" className="text-lg">');
	});

	it("writes a quote as the entity a JSX attribute reads back", () => {
		const text = written([
			{ kind: "set-attribute", source: stamp(FRAME, "<img"), name: "alt", value: 'a "latte" & bun' },
		]);
		expect(text).toContain('alt="a &quot;latte&quot; &amp; bun"');
	});

	it("refuses an expression value and names it", () => {
		const source = `const x = <img alt={item.name} />;\n`;
		expect(
			refusal([{ kind: "set-attribute", source: stamp(source, "<img"), name: "alt", value: "x" }], source),
		).toEqual({
			code: "expression-attribute",
			says: "alt is an expression",
			expression: "{item.name}",
		});
	});

	it("refuses style, which pins whatever a class would say", () => {
		expect(
			refusal([{ kind: "set-attribute", source: stamp(FRAME, "<h1"), name: "style", value: "color:red" }]).code,
		).toBe("inline-style");
	});
});

describe("the stamp", () => {
	it("refuses a stamp that hits nothing", () => {
		expect(refusal([{ kind: "set-class", source: "frames/cart/frame.tsx:99:3", token: "p-4", scope: "" }])).toEqual({
			code: "stale-stamp",
			says: "the stamp hits nothing",
		});
		expect(refusal([{ kind: "set-class", source: "frames/cart/frame.tsx:3:1", token: "p-4", scope: "" }]).code).toBe(
			"stale-stamp",
		);
	});

	it("refuses a file that does not parse rather than guessing at it", () => {
		expect(refusal([{ kind: "delete", source: "frames/cart/frame.tsx:1:1" }], "const x = <div").code).toBe(
			"unparsable",
		);
	});
});

describe("all of them or none", () => {
	it("writes nothing when the second op refuses", () => {
		const planned = plan([
			{ kind: "set-class", source: stamp(FRAME, "<main"), token: "p-6", scope: "" },
			{ kind: "set-class", source: stamp(FRAME, "<p className={busy"), token: "p-2", scope: "" },
		]);
		expect(planned.ok).toBe(false);
	});

	it("applies two ops on two elements against the offsets the canvas read", () => {
		const text = written([
			{ kind: "set-text", source: stamp(FRAME, "<h1"), text: "Basket" },
			{ kind: "set-class", source: stamp(FRAME, "<main"), token: "p-8", scope: "" },
		]);
		expect(text).toContain(">Basket</h1>");
		expect(text).toContain("gap-2 p-8");
	});
});

describe("the patch a gesture stores", () => {
	it("is the run between the common ends, and puts the file back", () => {
		const before = FRAME;
		const text = written([{ kind: "set-class", source: stamp(FRAME, "<main"), token: "p-6", scope: "" }]);
		const undo = spanBetween(before, text);
		// the run between the common ends and no wider: one character changed
		expect(undo).toEqual({ start: before.indexOf("p-4") + 2, end: before.indexOf("p-4") + 3, text: "4" });
		expect(applySpan(text, undo)).toBe(before);
	});

	it("hashes the bytes it was taken of", () => {
		expect(fingerprintOf(FRAME)).toBe(fingerprintOf(FRAME));
		expect(fingerprintOf(FRAME)).not.toBe(fingerprintOf(`${FRAME}\n`));
	});
});

/**
 * The edit in place, end to end (#255).
 *
 * A hand types words into the element itself and what the frame draws next has
 * to be exactly those words, whatever is in them. The escaping rule is #253's
 * and settled; what is proved here is the trip a gesture actually makes —
 * through the file, out of the file, and back again on undo.
 */
describe("the round trip an edit makes", () => {
	const typed = [
		"Pay now",
		"Tom & Jerry",
		"{total} items",
		"a < b and b > c",
		'she said "hi" and it\'s fine',
		"&amp; stays literal",
		"  padded  ",
		"emoji 🧵",
	];

	/**
	 * The words between the button's tags, as the frame draws them. A written
	 * `>` is an entity, so the last one before the closing tag opens it — which
	 * is the only reading that survives an arrow function in an attribute.
	 */
	function drawn(source: string): string {
		const closing = source.indexOf("</button>");
		return readJsxText(source.slice(source.lastIndexOf(">", closing) + 1, closing));
	}

	it.each(typed)("puts %j into the file and reads it back out of the frame", (text) => {
		const source = stamp(FRAME, "<button");
		const after = written([{ kind: "set-text", source, text }]);
		expect(drawn(after)).toBe(text);
		// and the file is the file everywhere the words are not, down to the
		// author's indentation on the lines either side of them
		const span = spanBetween(FRAME, after);
		expect(FRAME.slice(0, span.start)).toBe(after.slice(0, span.start));
		expect(after.slice(span.end)).toBe(FRAME.slice(FRAME.length - (after.length - span.end)));
	});

	it("puts the words back byte for byte when the edit is undone", () => {
		const source = stamp(FRAME, "<button");
		const after = written([{ kind: "set-text", source, text: '{a} & "b"' }]);
		expect(after).not.toBe(FRAME);
		expect(applySpan(after, spanBetween(FRAME, after))).toBe(FRAME);
	});

	it("takes an element's lines and puts them back byte for byte", () => {
		const source = stamp(FRAME, "<img");
		const after = written([{ kind: "delete", source }]);
		expect(after).not.toContain("<img");
		expect(applySpan(after, spanBetween(FRAME, after))).toBe(FRAME);
	});
});
