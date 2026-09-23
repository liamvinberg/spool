import { describe, expect, it } from "vitest";
import {
	applySpan,
	fingerprintOf,
	type HandOp,
	mappedArrayAt,
	planItemRemoval,
	planOps,
	readElements,
	shiftsOf,
	spanBetween,
	textOwner,
} from "./hand-write";
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

const text = (words: string) => [{ text: words }];

describe("set-text", () => {
	it("replaces the words and keeps the author's indentation", () => {
		const after = written([{ kind: "set-text", source: stamp(FRAME, "<button"), nodes: text("Pay later") }]);
		expect(after).toContain("\t\t\t\tPay later\n\t\t\t</button>");
	});

	it("writes braces, quotes and ampersands as the entities that read back", () => {
		const after = written([{ kind: "set-text", source: stamp(FRAME, "<h1"), nodes: text('Tom & {Jerry} say "hi"') }]);
		expect(after).toContain('<h1 className="text-lg">Tom &amp; &#123;Jerry&#125; say "hi"</h1>');
	});

	it("refuses an expression child and names it", () => {
		expect(refusal([{ kind: "set-text", source: stamp(FRAME, "<span"), nodes: text("x") }])).toEqual({
			code: "expression-text",
			says: "{count} is an expression; edit it in code or ask the agent",
			expression: "{count}",
		});
	});

	it("writes literal words inside a map, which every rendered row then says", () => {
		const source = `const rows = items.map((item) => <li key={item} className="px-2">Row</li>);\n`;
		const planned = plan([{ kind: "set-text", source: stamp(source, "<li"), nodes: text("Line") }], source);
		expect(planned.ok && planned.text).toContain('className="px-2">Line</li>');
		expect(planned.ok && planned.mapped).toBe(true);
	});

	it("refuses an element whose content is block elements, and one with no inside", () => {
		expect(refusal([{ kind: "set-text", source: stamp(FRAME, "<main"), nodes: text("x") }]).code).toBe("no-text");
		expect(refusal([{ kind: "set-text", source: stamp(FRAME, "<img"), nodes: text("x") }]).code).toBe("no-text");
	});
});

/**
 * The rule the words live by (#314): every child is text, a line break, a
 * string in braces or an inline element passing the same rule; and the map
 * from the frame's child nodes to the file's children, index for index.
 */
describe("mixed content", () => {
	const VEIL = `export default function Veil() {
  return <section className="veil-intro"><h1>Make something<br/><span className="serif"><i>worth feeling.</i></span></h1><p>Independent design.<br/>Made with instinct.<br/>Built with intention.</p><h2>Ideas that stay<br/>with you.</h2><p className="note">Hello {"there"} <b>friend</b>{title}</p></section>;
}
`;
	const at = (snippet: string) => stamp(VEIL, snippet);
	const br = { tag: "br", nodes: [] };

	it("maps each text node to the child at the same index, through an inline element", () => {
		const after = written(
			[
				{
					kind: "set-text",
					source: at("<h1"),
					nodes: [
						{ text: "Make something & more" },
						br,
						{ tag: "span", nodes: [{ tag: "i", nodes: text("worth it.") }] },
					],
				},
			],
			VEIL,
		);
		expect(after).toContain('<h1>Make something &amp; more<br/><span className="serif"><i>worth it.</i></span></h1>');
		// and nothing else moved
		expect(spanBetween(VEIL, after).start).toBe(VEIL.indexOf("Make something") + "Make something".length);
	});

	it("writes only the nodes that changed, so untouched spelling stays", () => {
		const after = written(
			[{ kind: "set-text", source: at("<h2"), nodes: [{ text: "Ideas that stay" }, br, { text: "with us." }] }],
			VEIL,
		);
		expect(after).toContain("<h2>Ideas that stay<br/>with us.</h2>");
		expect(after.length - VEIL.length).toBe(-1);
	});

	it("writes a run whole once the browser merged across a line break", () => {
		const after = written(
			[
				{
					kind: "set-text",
					source: at("<p>Independent"),
					nodes: [{ text: "Independent design. Made with instinct." }, br, { text: "Built well." }],
				},
			],
			VEIL,
		);
		expect(after).toContain("<p>Independent design. Made with instinct.<br/>Built well.</p>");
	});

	it("adds a line break the hand typed and drops words it deleted", () => {
		const after = written(
			[
				{
					kind: "set-text",
					source: at("<h2"),
					nodes: [{ text: "Ideas" }, br, { text: "that" }, br, { text: "stay" }],
				},
			],
			VEIL,
		);
		expect(after).toContain("<h2>Ideas<br/>that<br/>stay</h2>");
	});

	it("refuses when an inline element went missing, and names the expression it finds", () => {
		expect(refusal([{ kind: "set-text", source: at("<h1"), nodes: [{ text: "Make" }, br] }], VEIL).code).toBe(
			"text-shape",
		);
		expect(refusal([{ kind: "set-text", source: at('<p className="note"'), nodes: text("x") }], VEIL)).toEqual({
			code: "expression-text",
			says: "{title} is an expression; edit it in code or ask the agent",
			expression: "{title}",
		});
	});

	it("rewrites a string in braces as one, and a no-break space as a space", () => {
		const source = VEIL.replace("{title}", "");
		const after = written(
			[
				{
					kind: "set-text",
					source: stamp(source, '<p className="note"'),
					nodes: [{ text: "Hi\u00a0" }, { text: 'th"ere' }, { text: " " }, { tag: "b", nodes: text("friend") }],
				},
			],
			source,
		);
		expect(after).toContain('<p className="note">Hi&#32;{"th\\"ere"} <b>friend</b></p>');
	});

	it("says whose words an element carries", () => {
		const PARTS = `export function Footer({ name, note }: { name: string; note: string }) {
  return <footer className="page-footer"><a href="#top">{name}</a><span>{note}</span><a href="#top">Back to top</a></footer>;
}
export function Link({ children }: { children: ReactNode }) {
  return <a>{children}</a>;
}
`;
		const owner = (snippet: string) => {
			const [, line, column] = stamp(PARTS, snippet).split(":");
			return textOwner(PARTS, Number(line), Number(column));
		};
		expect(owner("<span>")).toEqual({ kind: "supplied", prop: "note" });
		expect(owner("<a>{children}")).toEqual({ kind: "supplied", prop: "children" });
		expect(owner('<a href="#top">Back')).toEqual({ kind: "own" });
		expect(owner("<footer")).toEqual({ kind: "own" });
		expect(textOwner(PARTS, 99, 1)).toBeUndefined();
	});

	it("writes supplied words at the call site, as an attribute or as children", () => {
		const CALLS = `export default function Page() {
  return <main><Link className="bordered" href="#work">Explore the studio</Link><Footer name="veil" note="Independent by nature."/><Card title={heading}/></main>;
}
`;
		const after = written(
			[
				{ kind: "set-supplied", source: stamp(CALLS, "<Footer"), prop: "note", text: 'Curious & "bold"\nalways' },
				{ kind: "set-supplied", source: stamp(CALLS, "<Link"), prop: "children", text: "Explore <us>" },
			],
			CALLS,
		);
		expect(after).toContain('<Footer name="veil" note="Curious &amp; &quot;bold&quot;&#10;always"/>');
		expect(after).toContain('href="#work">Explore &lt;us&gt;</Link>');
		expect(
			refusal([{ kind: "set-supplied", source: stamp(CALLS, "<Card"), prop: "title", text: "x" }], CALLS),
		).toEqual({
			code: "supplied-text",
			says: "title is computed at the call site",
		});
		expect(
			refusal([{ kind: "set-supplied", source: stamp(CALLS, "<Card"), prop: "note", text: "x" }], CALLS).code,
		).toBe("supplied-text");
	});

	it("says how a write moved the stamps on its line", () => {
		const planned = plan(
			[
				{
					kind: "set-text",
					source: at("<h1"),
					nodes: [{ text: "Make" }, br, { tag: "span", nodes: [{ tag: "i", nodes: text("worth feeling.") }] }],
				},
			],
			VEIL,
		);
		if (!planned.ok) throw new Error(planned.refusal.says);
		const column = VEIL.indexOf("Make something") - VEIL.lastIndexOf("\n", VEIL.indexOf("Make something"));
		expect(shiftsOf(VEIL, planned.patches)).toEqual([
			{ line: 2, column, delta: -"something ".length, taken: "Make something".length },
		]);
		// a patch across a line break moves the lines under it, and only a reload can say where
		expect(shiftsOf("a\nb", [{ start: 0, end: 2, text: "" }])).toBeNull();
	});
});

describe("the stamp", () => {
	it("refuses a stamp that hits nothing", () => {
		expect(refusal([{ kind: "delete", source: "frames/cart/frame.tsx:99:3" }])).toEqual({
			code: "stale-stamp",
			says: "the stamp hits nothing",
		});
		expect(refusal([{ kind: "delete", source: "frames/cart/frame.tsx:3:1" }]).code).toBe("stale-stamp");
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
			{ kind: "set-text", source: stamp(FRAME, "<h1"), nodes: text("Basket") },
			{ kind: "set-text", source: stamp(FRAME, '<span className="tabular-nums"'), nodes: text("3") },
		]);
		expect(planned.ok).toBe(false);
	});

	it("applies two ops on two elements against the offsets the canvas read", () => {
		const after = written([
			{ kind: "set-text", source: stamp(FRAME, "<h1"), nodes: text("Basket") },
			{ kind: "delete", source: stamp(FRAME, "<img") },
		]);
		expect(after).toContain(">Basket</h1>");
		expect(after).not.toContain("<img");
	});
});

describe("the patch a gesture stores", () => {
	it("is the run between the common ends, and puts the file back", () => {
		const before = FRAME;
		const after = written([{ kind: "set-text", source: stamp(FRAME, "<h1"), nodes: text("Card") }]);
		const undo = spanBetween(before, after);
		// the run between the common ends and no wider: one character changed
		const at = before.indexOf("Cart</h1>") + 3;
		expect(undo).toEqual({ start: at, end: at + 1, text: "t" });
		expect(applySpan(after, undo)).toBe(before);
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

	it.each(typed)("puts %j into the file and reads it back out of the frame", (words) => {
		const source = stamp(FRAME, "<button");
		const text = words;
		const after = written([{ kind: "set-text", source, nodes: [{ text }] }]);
		expect(drawn(after)).toBe(text);
		// and the file is the file everywhere the words are not, down to the
		// author's indentation on the lines either side of them
		const span = spanBetween(FRAME, after);
		expect(FRAME.slice(0, span.start)).toBe(after.slice(0, span.start));
		expect(after.slice(span.end)).toBe(FRAME.slice(FRAME.length - (after.length - span.end)));
	});

	it("puts the words back byte for byte when the edit is undone", () => {
		const source = stamp(FRAME, "<button");
		const after = written([{ kind: "set-text", source, nodes: text('{a} & "b"') }]);
		expect(after).not.toBe(FRAME);
		expect(applySpan(after, spanBetween(FRAME, after))).toBe(FRAME);
	});

	it("takes an element's lines and puts them back byte for byte", () => {
		const after = FRAME.replace(/\n\t+<img[^>]+\/>/, "");
		expect(after).not.toContain("<img");
		expect(applySpan(after, spanBetween(FRAME, after))).toBe(FRAME);
	});
});

/**
 * The read half (#256): what the properties rail draws before anything is
 * touched.
 *
 * It is the same parse the write runs, asked a different question, and that is
 * the whole point of it — a crumb says the name the author wrote.
 */
describe("readElements", () => {
	/** The reads for a snippet's element, in the order they were asked for. */
	function read(...snippets: readonly string[]) {
		const at = snippets.map((snippet) => {
			const [, line, column] = stamp(FRAME, snippet).split(":");
			return { line: Number(line), column: Number(column) };
		});
		return readElements(FRAME, at);
	}

	it("names an element the way its author wrote it, tag or component", () => {
		expect(read("<main", "<Card").map((one) => one?.name)).toEqual(["main", "Card"]);
	});

	it("answers with nothing where the stamp hits nothing", () => {
		expect(readElements(FRAME, [{ line: 2, column: 1 }])).toEqual([undefined]);
		expect(readElements("const x = (", [{ line: 1, column: 1 }])).toEqual([undefined]);
	});
});

describe("delete", () => {
	const PAGE = `export default function Still() {
	return (
		<section>
			<h3>Start with one breath.</h3><p>Let your shoulders fall.</p>
			<Shader effect="pearl" />
		</section>
	);
}
`;

	it("takes an element out from between its siblings and leaves the line", () => {
		const text = written([{ kind: "delete", source: stamp(PAGE, "<p>") }], PAGE);
		expect(text).toContain("\t\t\t<h3>Start with one breath.</h3>\n");
		expect(text).not.toContain("<p>");
	});

	it("takes the line with it when the element stands alone on one", () => {
		const text = written([{ kind: "delete", source: stamp(PAGE, "<Shader") }], PAGE);
		expect(text).toBe(PAGE.replace('\t\t\t<Shader effect="pearl" />\n', ""));
	});

	it("asks for no key on the siblings it leaves behind", () => {
		const source = `const x = (\n\t<ul>\n\t\t<li>one</li>\n\t\t<li>two</li>\n\t</ul>\n);\n`;
		const text = written([{ kind: "delete", source: stamp(source, "<li>one") }], source);
		expect(text).toBe(source.replace("\t\t<li>one</li>\n", ""));
	});

	it("refuses the whole return of a component and names it, so the surface can offer the call", () => {
		const shared = `export function Shader({ effect }: { effect: string }) {\n\treturn <div className="shader-surface" data-effect={effect} />;\n}\n`;
		expect(refusal([{ kind: "delete", source: stamp(shared, "<div") }], shared)).toEqual({
			code: "whole-return",
			says: "it is all of Shader; the call that renders it is what a hand can take out",
			line: 2,
		});
	});

	it("refuses an element written inside an expression", () => {
		const source = `const x = <a>{arrow && <Arrow />}</a>;\n`;
		expect(refusal([{ kind: "delete", source: stamp(source, "<Arrow") }], source).code).toBe("expression-child");
	});

	// a multi-pick deletes as one write (#323): the ops are addressed by the
	// file as it stands, and the plan orders its patches itself, so an earlier
	// deletion never shifts a later stamp out from under its own op
	it("takes several elements out in one plan, whatever order they were named in", () => {
		const source = `const x = (\n\t<ul>\n\t\t<li>one</li>\n\t\t<li>two</li>\n\t\t<li>three</li>\n\t</ul>\n);\n`;
		const ops: HandOp[] = [
			{ kind: "delete", source: stamp(source, "<li>three") },
			{ kind: "delete", source: stamp(source, "<li>one") },
		];
		const text = written(ops, source);
		expect(text).toBe(source.replace("\t\t<li>one</li>\n", "").replace("\t\t<li>three</li>\n", ""));
		// two deletions come to one span either way round, which is what makes
		// the gesture one write and one press of undo
		expect(applySpan(source, spanBetween(text, source))).toBe(text);
		expect(applySpan(text, spanBetween(source, text))).toBe(source);
	});

	it("refuses the whole gesture when one of several cannot go", () => {
		const source = `const x = (\n\t<ul>\n\t\t<li>one</li>\n\t\t<a>{arrow && <Arrow />}</a>\n\t</ul>\n);\n`;
		expect(
			refusal(
				[
					{ kind: "delete", source: stamp(source, "<li>one") },
					{ kind: "delete", source: stamp(source, "<Arrow") },
				],
				source,
			).code,
		).toBe("expression-child");
	});
});

/**
 * One row of a list (#324).
 *
 * The stamp under a hand inside a `.map()` names one JSX literal the document
 * drew once per entry, so the honest thing to take out is the array entry, not
 * the characters. These are the two halves of that, both pure over text: which
 * array the rows come from, and the entry out of its literal.
 */
describe("the array one row of a list comes from", () => {
	const BESIDE = `const experience = [
	{ brand: 'UNIQLO' },
	{ brand: 'Rodebjer' },
	{ brand: 'Eton' },
];

export function Experience() {
	return <div>{experience.map((item) => <h3 key={item.brand}>{item.brand}</h3>)}</div>;
}
`;
	const IMPORTS = `import { experience } from '../../shared/ui/experience';

export default function Frame() {
	return <ul>{experience.map((item) => <li key={item.brand}>{item.brand}</li>)}</ul>;
}
`;

	/** The stamp, as the lane takes it: a line and a column rather than a ref. */
	function at(source: string, snippet: string) {
		const ref = stamp(source, snippet);
		const [, line, column] = /:(\d+):(\d+)$/.exec(ref) ?? [];
		return { line: Number(line), column: Number(column) };
	}

	it("names the array a map runs over when it is written beside it", () => {
		expect(mappedArrayAt(BESIDE, at(BESIDE, "<h3 key"))).toEqual({
			kind: "here",
			name: "experience",
			callee: "experience",
		});
	});

	it("follows the import when the array is written in another file", () => {
		expect(mappedArrayAt(IMPORTS, at(IMPORTS, "<li key"))).toEqual({
			kind: "imported",
			name: "experience",
			callee: "experience",
			specifier: "../../shared/ui/experience",
		});
	});

	it("names the expression and refuses when the rows are computed", () => {
		const computed = `export default function Frame() {
	return <ul>{rows().map((item) => <li key={item.id}>{item.id}</li>)}</ul>;
}
`;
		expect(mappedArrayAt(computed, at(computed, "<li key"))).toEqual({
			kind: "refusal",
			refusal: {
				code: "mapped-expression",
				says: "these rows come from `rows()`, an expression; ask the agent",
				expression: "rows()",
			},
		});
	});

	it("names a prop the same way, because a prop has no literal here to take an entry out of", () => {
		const prop = `export function List({ rows }: { rows: string[] }) {
	return <ul>{rows.map((row) => <li key={row}>{row}</li>)}</ul>;
}
`;
		const held = mappedArrayAt(prop, at(prop, "<li key"));
		expect(held.kind === "refusal" && held.refusal.says).toBe(
			"these rows come from `rows`, an expression; ask the agent",
		);
	});

	it("says a stamp outside any map is one plain element, not a row", () => {
		expect(mappedArrayAt(BESIDE, at(BESIDE, "<div>")).kind).toBe("plain");
	});

	it("takes the entry out with its comma and its own line", () => {
		const plan = planItemRemoval(BESIDE, "experience", 1);
		if ("refusal" in plan) throw new Error(plan.refusal.says);
		const text = applySpan(BESIDE, plan.patches[0] ?? { start: 0, end: 0, text: "" });
		expect(text).toBe(BESIDE.replace("\t{ brand: 'Rodebjer' },\n", ""));
		// the patch carries the one that puts it back, which is what makes the
		// row one press of undo
		expect(applySpan(text, spanBetween(BESIDE, text))).toBe(BESIDE);
	});

	it("takes the comma before it when the last entry carries none of its own", () => {
		const source = `const rows = [\n\t{ a: 1 },\n\t{ a: 2 }\n];\n`;
		const plan = planItemRemoval(source, "rows", 1);
		if ("refusal" in plan) throw new Error(plan.refusal.says);
		expect(applySpan(source, plan.patches[0] ?? { start: 0, end: 0, text: "" })).toBe(
			`const rows = [\n\t{ a: 1 }\n];\n`,
		);
	});

	it("takes an entry out of a list written on one line and leaves one space between the rest", () => {
		const source = `const rows = ["a", "b", "c"];\n`;
		const plan = planItemRemoval(source, "rows", 1);
		if ("refusal" in plan) throw new Error(plan.refusal.says);
		expect(applySpan(source, plan.patches[0] ?? { start: 0, end: 0, text: "" })).toBe(`const rows = ["a", "c"];\n`);
	});

	it("refuses an index the array does not have, so a stale pick re-picks", () => {
		const plan = planItemRemoval(BESIDE, "experience", 9);
		expect("refusal" in plan && plan.refusal.code).toBe("stale-stamp");
	});

	it("refuses a name that is not an array literal", () => {
		const source = `const rows = await load();\n`;
		const plan = planItemRemoval(source, "rows", 0);
		expect("refusal" in plan && plan.refusal.code).toBe("mapped-expression");
	});

	// never silently edit a template that renders more than once (#324)
	it("refuses the plain delete of anything inside a map, and names what the rows come from", () => {
		expect(refusal([{ kind: "delete", source: stamp(BESIDE, "<h3 key") }], BESIDE)).toEqual({
			code: "mapped-template",
			says: "these rows come from `experience`; delete one item, or ask the agent",
			expression: "experience",
			line: 8,
		});
	});
});
