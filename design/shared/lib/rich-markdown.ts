import { closedText } from "./say-markers";

/**
 * The markdown the rail does *not* render, parsed (#148's subset, extended).
 *
 * `agent-markdown.ts` renders six things — paragraphs, bold, inline code, fences,
 * blockquotes and list items — chosen in #148 from the thirty-five messages in
 * `fixtures/captures/`. Everything outside that draws its own syntax as literal text in
 * the middle of a sentence, and a user hit it with a table.
 *
 * This is the same parser with the gaps filled: tables, headings, italic, links, images,
 * strikethrough, horizontal rules, nested list depth, a list item that wraps, a
 * multi-line blockquote, a fence's language label, task lists, and bold that contains
 * emphasis. It lives beside `say-markers.ts` rather than inside a renderer for the same
 * reason that one does: it is pure string work, and the streaming rules below are the
 * half of the ticket that has to be reasoned about without a document in the way.
 *
 * **The corpus is one message, and saying so is the honest part.** #148 measured its
 * subset over thirty-five real messages. There is no corpus of tables: there is one
 * reported bug. So the shapes here are drawn from CommonMark and the decisions about
 * what they *look like* are made on the rail's own 420px, not on frequency.
 */

/* ---------- what a run of text is ---------- */

export interface RichSpan {
	readonly text: string;
	readonly code?: true;
	readonly bold?: true;
	readonly em?: true;
	readonly strike?: true;
	/** a link's destination, or an image's, which the rail never fetches */
	readonly href?: string;
	readonly image?: true;
}

/** the inline state a run inherits from the markers around it */
type Flags = Omit<RichSpan, "text">;

/** one row of a table: the cells, each already parsed */
export type Cells = readonly (readonly RichSpan[])[];

export type RichChunk =
	| { readonly kind: "p"; readonly spans: readonly RichSpan[] }
	| { readonly kind: "quote"; readonly spans: readonly RichSpan[] }
	| { readonly kind: "heading"; readonly level: number; readonly spans: readonly RichSpan[] }
	| {
			readonly kind: "item";
			readonly marker: string;
			readonly depth: number;
			readonly task: "none" | "open" | "done";
			readonly spans: readonly RichSpan[];
	  }
	| { readonly kind: "fence"; readonly lang: string; readonly text: string }
	| { readonly kind: "rule" }
	| { readonly kind: "table"; readonly head: Cells; readonly rows: readonly Cells[] };

/**
 * The inline markers, tried left to right at every position.
 *
 * Order is the whole of it. `**` is tried before `*`, so a bold run is never read as two
 * emphases; a link before either, so `[**a**](url)` is a link containing bold rather than
 * a bold containing brackets; and code first, because a code span is verbatim and nothing
 * inside it is a marker.
 *
 * **`**` crosses an inner `*` here and it could not before.** `agent-markdown.ts` splits on
 * `\*\*[^*]+?\*\*`, whose character class stops at the first inner asterisk, so
 * `**map's own *before* and after**` renders as literal asterisks all the way through. The
 * class is `[\s\S]` now and the nesting falls out of the recursion.
 *
 * **`_` is deliberately narrower than `*`.** An underscore only opens emphasis when it is
 * not touching a word character on the outside, because this corpus is made of
 * `RAIL_WIDTH`, `content_block_delta` and `FLOOR_MS_PER_CHAR`. CommonMark says the same
 * thing with flanking rules; this is the cheap half of them and it is the half that
 * matters here.
 */
const INLINE =
	/(`[^`]+`)|(!?\[[^\]]*\]\([^)\s]*\))|(\*\*[\s\S]+?\*\*)|(~~[\s\S]+?~~)|(\*[^*\s][\s\S]*?\*)|((?<![A-Za-z0-9_])_[^_\s][^_]*_(?![A-Za-z0-9_]))/;

function inlineSpans(text: string, base: Flags): readonly RichSpan[] {
	const out: RichSpan[] = [];
	let rest = text;
	const plain = (value: string) => {
		if (value !== "") out.push({ ...base, text: value });
	};
	while (rest !== "") {
		const hit = INLINE.exec(rest);
		if (hit === null) {
			plain(rest);
			break;
		}
		plain(rest.slice(0, hit.index));
		const token = hit[0];
		rest = rest.slice(hit.index + token.length);
		if (token.startsWith("`")) {
			out.push({ ...base, text: token.slice(1, -1), code: true });
			continue;
		}
		if (token.startsWith("[") || token.startsWith("![")) {
			const cut = token.indexOf("](");
			const picture = token.startsWith("!");
			const label = token.slice(picture ? 2 : 1, cut);
			const url = token.slice(cut + 2, -1);
			// an image is never fetched, so what is left of it is its own words: the alt text,
			// or the file it names when the agent wrote no alt
			if (picture) out.push({ ...base, text: label === "" ? url : label, href: url, image: true });
			else out.push(...inlineSpans(label, { ...base, href: url }));
			continue;
		}
		if (token.startsWith("**")) {
			out.push(...inlineSpans(token.slice(2, -2), { ...base, bold: true }));
			continue;
		}
		if (token.startsWith("~~")) {
			out.push(...inlineSpans(token.slice(2, -2), { ...base, strike: true }));
			continue;
		}
		out.push(...inlineSpans(token.slice(1, -1), { ...base, em: true }));
	}
	return out;
}

/* ---------- blocks ---------- */

const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^ {0,5}(#{1,6})\s+(.*)$/;
const ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
/** a table's second row: pipes, dashes, colons and space, and at least one dash */
const DELIM = /^[\s|:-]+$/;

interface RawText {
	k: "p" | "quote";
	text: string;
}
interface RawHeading {
	k: "heading";
	level: number;
	text: string;
}
interface RawItem {
	k: "item";
	indent: number;
	marker: string;
	ordered: boolean;
	text: string;
}
interface RawFence {
	k: "fence";
	lang: string;
	text: string;
}
interface RawRule {
	k: "rule";
}
interface RawTable {
	k: "table";
	lines: string[];
}
type Raw = RawText | RawHeading | RawItem | RawFence | RawRule | RawTable;

/**
 * A table row, split.
 *
 * Leading and trailing pipes come off and the rest splits, so `| | before | after |` is
 * three cells with the first one empty, which is exactly what the reported message opens
 * with. Nothing is trimmed away: an empty header cell keeps its column, because the column
 * under it is the one holding the row labels.
 */
function cellsOf(line: string): Cells {
	let body = line.trim();
	if (body.startsWith("|")) body = body.slice(1);
	if (body.endsWith("|")) body = body.slice(0, -1);
	return body.split("|").map((cell) => inlineSpans(cell.trim(), {}));
}

export function richChunks(text: string): readonly RichChunk[] {
	const raws: Raw[] = [];
	const lines = text.split("\n");
	/** the block a following line without its own marker belongs to, or nothing */
	let open: Raw | undefined;
	const push = (raw: Raw) => {
		raws.push(raw);
		open = raw;
	};

	for (let at = 0; at < lines.length; at += 1) {
		const line = lines[at] ?? "";
		if (line.trimStart().startsWith("```")) {
			const body: string[] = [];
			const lang = line.trim().slice(3).trim();
			for (at += 1; at < lines.length && !(lines[at] ?? "").trimStart().startsWith("```"); at += 1)
				body.push(lines[at] ?? "");
			push({ k: "fence", lang, text: body.join("\n") });
			open = undefined;
			continue;
		}
		if (line.trim() === "") {
			open = undefined;
			continue;
		}
		if (RULE.test(line)) {
			push({ k: "rule" });
			open = undefined;
			continue;
		}
		const heading = HEADING.exec(line);
		if (heading !== null) {
			push({ k: "heading", level: (heading[1] ?? "#").length, text: heading[2] ?? "" });
			open = undefined;
			continue;
		}
		if (line.trimStart().startsWith("|")) {
			if (open?.k === "table") open.lines.push(line.trim());
			else push({ k: "table", lines: [line.trim()] });
			continue;
		}
		const item = ITEM.exec(line);
		if (item !== null) {
			push({
				k: "item",
				indent: (item[1] ?? "").length,
				marker: item[2] ?? item[3] ?? "-",
				ordered: item[3] !== undefined,
				text: item[4] ?? "",
			});
			continue;
		}
		if (line.trimStart().startsWith(">")) {
			const body = line.replace(/^\s*>\s?/, "");
			// **a multi-line blockquote is one quote.** Every `>` line drew its own bordered
			// block before, so a three-line quote was three stacked rules with a gap between
			// each: the agent wrote one quotation and the rail drew three
			if (open?.k === "quote") open.text += ` ${body}`;
			else push({ k: "quote", text: body });
			continue;
		}
		/*
		 * A line with no marker of its own continues whatever is open.
		 *
		 * This is the wrapped list item, and it is the smallest of the gaps and the most
		 * common: `^\s*` in the item pattern strips the indent, so a continuation line was a
		 * new paragraph starting under the bullet, at the bullet's own left edge, with a
		 * paragraph gap above it. The item read as two items, one of which had lost its dot.
		 */
		if (open?.k === "item" || open?.k === "quote" || open?.k === "p") {
			open.text += ` ${line.trim()}`;
			continue;
		}
		push({ k: "p", text: line.trim() });
	}

	const chunks: RichChunk[] = [];
	/** the indents currently open, ascending: a list's depth is where its indent sits in it */
	const stack: number[] = [];
	for (const raw of raws) {
		if (raw.k !== "item") stack.length = 0;
		if (raw.k === "p" || raw.k === "quote") {
			chunks.push({ kind: raw.k, spans: inlineSpans(raw.text, {}) });
			continue;
		}
		if (raw.k === "rule") {
			chunks.push({ kind: "rule" });
			continue;
		}
		if (raw.k === "heading") {
			chunks.push({ kind: "heading", level: raw.level, spans: inlineSpans(raw.text, {}) });
			continue;
		}
		if (raw.k === "fence") {
			chunks.push({ kind: "fence", lang: raw.lang, text: raw.text });
			continue;
		}
		if (raw.k === "table") {
			// the delimiter row is structure rather than content, and it is dropped here as well
			// as by `closedRich`, so a half-arrived one never spends a frame as a body row
			const rows = raw.lines.filter((line) => !(DELIM.test(line.replace(/\|/g, "")) && line.includes("-")));
			const head = rows[0];
			if (head === undefined) continue;
			const cells = cellsOf(head);
			/*
			 * Every row is padded to the header's own width, and that is a streaming rule
			 * rather than a tidiness one: a row arriving one character at a time gains a cell
			 * each time a `|` lands, so an unpadded table would change its column count four
			 * times per row while it is being written.
			 */
			const wide = (row: Cells): Cells =>
				cells.map((_, at) => row[at] ?? ([] as readonly RichSpan[])).slice(0, cells.length);
			chunks.push({ kind: "table", head: cells, rows: rows.slice(1).map((line) => wide(cellsOf(line))) });
			continue;
		}
		if (raw.k !== "item") continue;
		while (stack.length > 0 && raw.indent < (stack[stack.length - 1] ?? 0)) stack.pop();
		if (stack.length === 0 || raw.indent > (stack[stack.length - 1] ?? 0)) stack.push(raw.indent);
		const task = TASK.exec(raw.text);
		chunks.push({
			kind: "item",
			marker: raw.ordered ? `${raw.marker}.` : "•",
			// **depth comes off a stack rather than off the indent.** A nested list is written
			// with two spaces by one agent and four by another, so an indent read as a number
			// puts the same list at different depths; read as a position in the open indents it
			// is the same list either way
			depth: Math.min(3, stack.length - 1),
			task: task === null ? "none" : (task[1] ?? " ").toLowerCase() === "x" ? "done" : "open",
			spans: inlineSpans(task === null ? raw.text : (task[2] ?? ""), {}),
		});
	}
	return chunks;
}

/** every character the render will draw, so a live tail can be measured from the end */
export function richDrawn(chunks: readonly RichChunk[]): number {
	const run = (spans: readonly RichSpan[]) => spans.reduce((sum, span) => sum + span.text.length, 0);
	return chunks.reduce((total, chunk) => {
		if (chunk.kind === "fence") return total + chunk.text.length;
		if (chunk.kind === "rule") return total;
		if (chunk.kind === "table")
			return (
				total +
				chunk.head.reduce((sum, cell) => sum + run(cell), 0) +
				chunk.rows.reduce((sum, row) => sum + row.reduce((cells, cell) => cells + run(cell), 0), 0)
			);
		return total + run(chunk.spans);
	}, 0);
}

/* ---------- the arriving edge ---------- */

/**
 * Closing the markers this parser adds, on top of the ones `say-markers.ts` already closes.
 *
 * The invariant is #148's and it is not negotiable: **what is on screen must be a prefix of
 * what will be drawn.** `closedText` already earns that for `**`, `` ` ``, fences and a
 * nascent list marker, measured at zero height decreases across 5,808 streamed characters.
 * Everything below is the same rule applied to a shape it did not know about.
 *
 * **The table is the one that matters, and it has two halves.**
 *
 * The first is that a table has to be a table from its first pipe. A run of lines starting
 * with `|` is read as a table here whether or not the delimiter row has arrived, so
 * `| | before` draws a one-row grid that grows. The alternative — waiting for `|---|` the
 * way a strict parser does — spends the whole header row and part of the delimiter row
 * drawing a paragraph of literal pipes, then deletes it. That is the reported bug happening
 * on purpose for half a second.
 *
 * The second is the delimiter row itself, which is the nascent list marker again in a new
 * costume. `|--` is a body row holding one cell of two dashes; `|---|---|` is a body row of
 * three. Both are 24px of table that *leaves* the drawn text the moment the row completes.
 * So a trailing line that is nothing but pipes, dashes, colons and space waits, exactly as
 * a nascent fence waits for its third backtick.
 *
 * **A link is the other interesting one, and it is closed by unwrapping rather than by
 * closing.** `[the map]` is seven drawn characters wearing two brackets that vanish when
 * `(url)` lands. Dropping the brackets while they are the whole of what has arrived means
 * the label is drawn as its own words from its first character and only its styling changes
 * when the destination shows up. Nothing moves, because nothing was ever there that had to
 * leave.
 */
export function closedRich(text: string): string {
	const base = closedText(text);
	const cut = base.lastIndexOf("\n") + 1;
	const head = base.slice(0, cut);
	let tail = base.slice(cut);
	// a fence delimiter reaches the tail exactly once, the frame its closing ``` completes,
	// and it is a real marker: `closedText` guards it and so does this
	if (tail.trimStart().startsWith("```")) return base;

	// a heading, a rule and a table's delimiter row are each a block whose one or two
	// characters leave the drawn text the moment the next character promotes them
	if (/^\s*#{1,6}$/.test(tail)) return head;
	if (/^\s*(?:-{2,}|_{1,}|\*{1,2})$/.test(tail)) return head;
	if (tail.trimStart().startsWith("|") && DELIM.test(tail.replace(/\|/g, "")) && tail.includes("-")) return head;
	// a lone pipe is a table of one empty cell, which is a border with nothing in it
	if (tail.trim() === "|") return head;
	// a lone `!` is a nascent image: one character that draws a whole paragraph and then
	// leaves it the moment the `[` after it arrives. It waits, like every other opener here
	if (/^\s*!$/.test(tail)) return head;

	/*
	 * A link, unwrapped or closed depending on how far it got.
	 *
	 * Three states and each one is drawn as the text it will end up being: an open `[`,
	 * a closed label with no destination yet, and a destination still being typed.
	 */
	const label = /!?\[([^\]]*)\]$/.exec(tail);
	if (label !== null) tail = `${tail.slice(0, label.index)}${label[1] ?? ""}`;
	else {
		const opened = tail.lastIndexOf("[");
		if (opened !== -1 && !tail.slice(opened).includes("]")) {
			const bang = opened > 0 && tail[opened - 1] === "!" ? 1 : 0;
			tail = tail.slice(0, opened - bang) + tail.slice(opened + 1);
		}
	}
	const link = tail.lastIndexOf("](");
	if (link !== -1 && !tail.slice(link + 2).includes(")")) tail = `${tail})`;

	// strikethrough and emphasis close the way bold already does: an open marker is given
	// its partner, so the run is struck or slanted from its first character and simply grows
	if ((tail.match(/~~/g) ?? []).length % 2 === 1) tail = tail.endsWith("~~") ? tail.slice(0, -2) : `${tail}~~`;
	const stars = (tail.replace(/\*\*/g, "").match(/\*/g) ?? []).length;
	if (stars % 2 === 1 && !tail.endsWith("*")) tail = `${tail}*`;

	return head + tail;
}
