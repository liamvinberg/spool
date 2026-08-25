/**
 * JSX text, both ways (#253).
 *
 * A `set-text` patch has to put a string into source and get the same string
 * back out of the running frame, so this module owns the one escaping rule the
 * write lane uses. It is written against esbuild, which is what compiles a
 * frame — not against a general HTML reader — and esbuild folds whitespace on
 * the raw text and decodes entities afterwards. That order is the whole trick:
 * an entity survives the fold, so anything the fold would eat is written as
 * one.
 *
 * Reading is the same two steps in the same order, so `read(write(text))` is
 * `text` for every string a hand can type.
 */

/** Characters JSX text cannot carry as themselves, and what they are written as. */
const ESCAPES: Readonly<Record<string, string>> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"{": "&#123;",
	"}": "&#125;",
	"\n": "&#10;",
	"\r": "&#13;",
	"\t": "&#9;",
};

/**
 * The entities a read decodes. The named set is the one an author writes by
 * hand; anything else stays as it is, because a wrong guess would read text
 * the frame does not show, and every entity a write mints is in here.
 */
const NAMED: Readonly<Record<string, string>> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

/**
 * What a frame shows for a raw run of JSX text: the whitespace fold first, the
 * entities after it.
 *
 * The fold is React's, as esbuild implements it: a line break and the indent
 * around it are layout, not text, so lines are trimmed where they meet a break
 * and joined by a single space. Whitespace inside a line is text and survives.
 */
export function readJsxText(raw: string): string {
	return decodeEntities(foldWhitespace(raw));
}

/**
 * The raw JSX text that reads back as exactly this string.
 *
 * Everything that could be folded, parsed as markup, or read as an entity is
 * written as an entity, so the result is one line that means one thing. Text
 * spliced between an element's tags is surrounded by whatever indentation the
 * author left there, which is why leading and trailing spaces are escaped too:
 * the fold would take them.
 */
export function writeJsxText(text: string): string {
	const escaped = [...text].map((char) => ESCAPES[char] ?? char).join("");
	return escaped
		.replace(/^ +/, (run) => "&#32;".repeat(run.length))
		.replace(/ +$/, (run) => "&#32;".repeat(run.length));
}

/** Whether a raw run of JSX text is nothing but layout — the fold leaves nothing. */
export function isLayoutOnly(raw: string): boolean {
	return foldWhitespace(raw) === "";
}

/**
 * The whitespace a splice must leave alone: the run at each end that carries a
 * line break. That whitespace is the author's indentation rather than the
 * element's words, so a text patch replaces what sits between the two runs and
 * the file's shape survives the edit.
 */
export function textCore(raw: string): { start: number; end: number } {
	const lead = /^[ \t]*(?:\r\n|\n|\r)[ \t\r\n]*/.exec(raw)?.[0].length ?? 0;
	const trail = /(?:\r\n|\n|\r)[ \t]*$/.exec(raw.slice(lead))?.[0].length ?? 0;
	return { start: lead, end: raw.length - trail };
}

function foldWhitespace(raw: string): string {
	return raw
		.split(/\r\n|\n|\r/)
		.map((line, index, lines) => {
			const started = index === 0 ? line : line.replace(/^[ \t]+/, "");
			return index === lines.length - 1 ? started : started.replace(/[ \t]+$/, "");
		})
		.filter((line) => line !== "")
		.join(" ");
}

function decodeEntities(text: string): string {
	return text.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
		if (body.startsWith("#")) {
			const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
			return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
		}
		return NAMED[body] ?? whole;
	});
}
