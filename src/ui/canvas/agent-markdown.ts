/**
 * The markdown subset an agent message is actually made of (#148, #192).
 *
 * The agent writes markdown because its own surface is a terminal that renders
 * it. The rail has to, or `**bold**` keeps its asterisks, a fence draws three
 * literal backticks mid-paragraph, and a numbered list is one grey paragraph.
 *
 * The subset was the corpus's rather than CommonMark's, measured over the
 * thirty-five messages in `fixtures/captures/` that reach a transcript: bold,
 * inline code, fenced blocks, blockquotes, ordered and unordered lists. That was
 * the right way to pick it and the wrong place to stop. The corpus is seven
 * captures of this repo's own work, so what it proves is that *those* turns wrote
 * no italic and no links — not that the model does not. Everything outside the
 * subset drew its own syntax as literal characters mid-sentence, which is a defect
 * whether or not a fixture happens to contain it.
 *
 * So the rule here is now the other one: a marker the agent can write is a marker
 * this file reads, unless drawing it costs more than the syntax does.
 *
 * **Two are deliberately still out.** A table cannot be laid out in a 200–480px
 * column without deciding what it becomes, which is a design question and not a
 * parsing one. A heading has no size in a rail whose prose is all one size. Both
 * keep their syntax visible on purpose, because a wrong drawing is worse than a
 * legible `|` — and legible is what the raw source is.
 *
 * **The streaming invariant governs every addition** (see `agent-markers.ts`):
 * what is on screen must always be a prefix of what the finished message draws.
 * That is what rules out the easy version of two of these. A link's brackets and
 * URL *leave* the drawn text the moment `](url)` completes, and a task box's
 * `[ ]` does the same, so both wait in `closedText` exactly as a nascent list
 * marker already waits for its space. Nothing here may be added without walking
 * the corpus again; the property test is the whole argument.
 *
 * Parsing lives here rather than in the renderer because it is pure: the same
 * chunks answer "what will this draw" for the streaming edge and for the settled
 * message, and nothing about them needs a document.
 */

export interface Span {
	readonly text: string;
	readonly code?: boolean;
	readonly bold?: boolean;
	readonly italic?: boolean;
	readonly strike?: boolean;
	/** the target of a link, carried by every span the link's own text produced */
	readonly href?: string;
}

export type Chunk =
	| { readonly kind: "p" | "quote"; readonly spans: readonly Span[] }
	| {
			readonly kind: "item";
			readonly marker: string;
			/** how many levels in, so a sub-list is drawn under its parent rather than beside it */
			readonly depth: number;
			/** present only on a task item, which is the one list that carries state */
			readonly done?: boolean;
			readonly spans: readonly Span[];
	  }
	| { readonly kind: "fence"; readonly text: string }
	| { readonly kind: "rule" };

/** what a marker adds to the spans inside it, which is everything a span is but its text */
type Style = Omit<Span, "text">;

/*
 * The inline markers, in the order a tie at the same index is broken.
 *
 * Position decides first and this order decides only ties, which is what keeps
 * `**bold**` from being read as an empty italic: both match, bold at the opening
 * asterisk and italic one character later, so bold wins on position alone. The
 * order still matters for code, which has to win everywhere it can — a code span
 * is verbatim, so nothing inside it is a marker at all.
 *
 * `_` is flanked, because this corpus is made of identifiers. `agent_rail_width`
 * is one word and not a word with an emphasis in the middle of it, and a rule
 * without the lookarounds says otherwise.
 */
const INLINE = [
	{ re: /`([^`]+)`/, style: { code: true } as Style, verbatim: true },
	{ re: /\[([^\]\n]+)\]\(([^()\s]+)\)/, style: null, verbatim: false },
	{ re: /\*\*([^*]+?)\*\*/, style: { bold: true } as Style, verbatim: false },
	{ re: /~~([^~]+?)~~/, style: { strike: true } as Style, verbatim: false },
	{ re: /\*([^*]+?)\*/, style: { italic: true } as Style, verbatim: false },
	{ re: /(?<![A-Za-z0-9])_([^_]+?)_(?![A-Za-z0-9])/, style: { italic: true } as Style, verbatim: false },
] as const;

/**
 * `**bold**`, `` `code` ``, `*italic*`, `~~struck~~` and `[a link](to)`, nested.
 *
 * Recursive rather than a pass per marker, because the corpus nests them: the long
 * message's three findings are each a bold lead-in with a path inside it —
 * ``**1. Notion — no `kaffe-receipt-copy`.**`` — and a single pass over both
 * markers leaves the backticks sitting literal inside the bold run. Recursion is
 * also what makes a link a *style* rather than a fourth kind of span: the text
 * between its brackets is ordinary markdown, so a bold word inside a link stays
 * bold and every span it produces carries the same target.
 *
 * A code span is the one thing not recursed into. It is verbatim by definition, so
 * bold inside code cannot happen and must not be looked for.
 */
function spansOf(line: string, style: Style = {}): readonly Span[] {
	const spans: Span[] = [];
	const plain = (text: string) => {
		if (text !== "") spans.push({ text, ...style });
	};
	let rest = line;
	while (rest !== "") {
		const hit = INLINE.map((rule) => ({ rule, at: rest.search(rule.re) }))
			.filter((found) => found.at >= 0)
			.sort((a, b) => a.at - b.at)[0];
		if (hit === undefined) break;
		const match = hit.rule.re.exec(rest);
		if (match === null) break;
		plain(rest.slice(0, hit.at));
		const inner = match[1] ?? "";
		const href = match[2];
		if (hit.rule.verbatim) spans.push({ text: inner, ...style, ...hit.rule.style });
		else if (hit.rule.style === null)
			spans.push(...spansOf(inner, { ...style, ...(href === undefined ? {} : { href }) }));
		else spans.push(...spansOf(inner, { ...style, ...hit.rule.style }));
		rest = rest.slice(hit.at + match[0].length);
	}
	plain(rest);
	return spans;
}

/** as deep as a 200px column can hold, so a runaway indent cannot walk prose off the edge */
const DEPTH_MAX = 3;

/** a bullet or a number, its indent, and the task box a list is allowed to carry */
const ITEM = /^(\s*)(?:([-*])|(\d+)\.)\s+(?:\[([ xX])\]\s+)?(.*)$/;

/** three or more dashes alone on a line. Asterisks are not spelled here: they are bold's */
const RULE = /^\s*-{3,}\s*$/;

const QUOTE = /^\s*>\s?(.*)$/;

export function chunksOf(text: string): readonly Chunk[] {
	const chunks: Chunk[] = [];
	const lines = text.split("\n");
	let paragraph: string[] = [];
	let quote: string[] = [];
	let item: { marker: string; depth: number; done?: boolean; lines: string[] } | null = null;

	/**
	 * The indents a list has opened so far, innermost last.
	 *
	 * Dividing the indent by two was the obvious rule and it is wrong on the model's own
	 * output: a four-space list is ordinary markdown and it would draw every level twice
	 * as deep, running out of column by its second. What makes a line a *sub*-item is
	 * that it is indented further than the item above it, whatever that distance is, so
	 * the stack holds the widths actually seen and the depth is how many are still open.
	 */
	const indents: number[] = [];
	const depthOf = (indent: number): number => {
		while (indents.length > 0 && indent < (indents[indents.length - 1] ?? 0)) indents.pop();
		if (indents.length === 0 || indent > (indents[indents.length - 1] ?? 0)) indents.push(indent);
		return Math.min(indents.length - 1, DEPTH_MAX);
	};

	/*
	 * Three open blocks rather than one, and that is the whole of what changed about
	 * block structure. A wrapped list item used to end at its own newline, so its
	 * second line became a paragraph — indented under nothing, with a list gap above
	 * it. A three-line blockquote used to be three blockquotes, each with its own rule
	 * down the left. Both were the same bug: a block that continues was being closed
	 * by the line that continues it.
	 */
	const shutParagraph = () => {
		if (paragraph.length > 0) chunks.push({ kind: "p", spans: spansOf(paragraph.join(" ")) });
		paragraph = [];
	};
	const shutQuote = () => {
		if (quote.length > 0) chunks.push({ kind: "quote", spans: spansOf(quote.join(" ")) });
		quote = [];
	};
	const shutItem = () => {
		if (item !== null) {
			const { marker, depth, done, lines: body } = item;
			chunks.push({
				kind: "item",
				marker,
				depth,
				...(done === undefined ? {} : { done }),
				spans: spansOf(body.join(" ")),
			});
		}
		item = null;
	};
	/** everything open closes, the nesting included: a list ends where its lines stop */
	const shut = () => {
		shutParagraph();
		shutItem();
		shutQuote();
		indents.length = 0;
	};

	for (let at = 0; at < lines.length; at += 1) {
		const line = lines[at] ?? "";
		if (line.startsWith("```")) {
			shut();
			// the info string stays dropped, and it was never the bug it looked like: the
			// opening line is not body, so ```ts has never drawn a `ts`. What it costs is
			// syntax colour, which is a renderer this rail has not decided to have
			const body: string[] = [];
			for (at += 1; at < lines.length && !(lines[at] ?? "").startsWith("```"); at += 1) body.push(lines[at] ?? "");
			chunks.push({ kind: "fence", text: body.join("\n") });
			continue;
		}
		if (line.trim() === "") {
			shut();
			continue;
		}
		if (RULE.test(line)) {
			shut();
			chunks.push({ kind: "rule" });
			continue;
		}
		const quoted = QUOTE.exec(line);
		if (quoted !== null) {
			shutParagraph();
			shutItem();
			indents.length = 0;
			quote.push(quoted[1] ?? "");
			continue;
		}
		const listed = ITEM.exec(line);
		if (listed !== null) {
			// the one place that closes the item without closing the list: the nesting is
			// what this line is about to be measured against
			shutParagraph();
			shutItem();
			shutQuote();
			const box = listed[4];
			item = {
				marker: listed[2] === undefined ? `${listed[3]}.` : "•",
				depth: depthOf((listed[1] ?? "").length),
				...(box === undefined ? {} : { done: box.toLowerCase() === "x" }),
				lines: [listed[5] ?? ""],
			};
			continue;
		}
		// a line under an open item belongs to it: an item wraps, and its own indent is
		// the model's rather than a second block's
		if (item !== null) {
			item.lines.push(line.trim());
			continue;
		}
		shutQuote();
		paragraph.push(line.trim());
	}
	shut();
	return chunks;
}

/** every character the render will draw, in order, so a live tail can be found from the end */
export function drawnText(chunks: readonly Chunk[]): string {
	return chunks
		.map((chunk) => {
			if (chunk.kind === "rule") return "";
			if (chunk.kind === "fence") return chunk.text;
			return chunk.spans.map((span) => span.text).join("");
		})
		.join("");
}
