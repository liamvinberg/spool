/**
 * Walks source text from a compile-time JSX stamp (#6: serve-time stamping,
 * Onlook pattern) to the element's end, yielding the selection payload's
 * lines + excerpt. The stamped file compiled — it was served — so tags
 * balance; the scanner's real job is stepping over JS expressions, strings,
 * templates and comments without being fooled. Anything it cannot resolve
 * degrades honestly: opening tag only, or undefined when the position does
 * not point at a tag at all (the file changed since the stamp was minted).
 */

export interface JsxSpan {
	/** 1-based inclusive line range of the whole element. */
	lines: [number, number];
	excerpt: string;
}

const EXCERPT_CAP = 240;

export function extractJsxSpan(source: string, line: number, column: number): JsxSpan | undefined {
	const start = offsetOf(source, line, column);
	if (start === undefined || source[start] !== "<") return undefined;

	const openEnd = scanOpeningTag(source, start);
	if (openEnd === undefined) return undefined;

	// self-closing: the opening tag is the whole element
	const end = lastMeaningfulBefore(source, start + 1, openEnd) === "/" ? openEnd : scanContent(source, openEnd + 1);

	// close never found (edited since serve): the opening tag is still honest
	const spanEnd = end ?? openEnd;
	return {
		lines: [line, line + countLines(source, start, spanEnd)],
		excerpt: excerptOf(source, start, spanEnd, openEnd),
	};
}

/** 1-based line/column to string offset; undefined when out of range. */
function offsetOf(source: string, line: number, column: number): number | undefined {
	let lineStart = 0;
	for (let n = 1; n < line; n++) {
		const next = source.indexOf("\n", lineStart);
		if (next === -1) return undefined;
		lineStart = next + 1;
	}
	const offset = lineStart + column - 1;
	const lineEnd = source.indexOf("\n", lineStart);
	if (offset >= source.length || (lineEnd !== -1 && offset >= lineEnd)) return undefined;
	return offset;
}

/** From `<`, the offset of the `>` ending the opening tag; undefined on EOF. */
function scanOpeningTag(source: string, start: number): number | undefined {
	let i = start + 1;
	while (i < source.length) {
		const c = source[i];
		if (c === ">") return i;
		if (c === '"' || c === "'") {
			// JSX attribute strings are HTML-like: no escapes, the next quote ends
			const close = source.indexOf(c, i + 1);
			if (close === -1) return undefined;
			i = close + 1;
		} else if (c === "{") {
			const after = skipExpression(source, i);
			if (after === undefined) return undefined;
			i = after;
		} else {
			i++;
		}
	}
	return undefined;
}

/** From just past the opening tag, the offset of the `>` closing the element. */
function scanContent(source: string, from: number): number | undefined {
	let i = from;
	let depth = 1;
	while (i < source.length) {
		const c = source[i];
		if (c === "{") {
			const after = skipExpression(source, i);
			if (after === undefined) return undefined;
			i = after;
		} else if (c === "<") {
			if (source[i + 1] === "/") {
				const close = source.indexOf(">", i);
				if (close === -1) return undefined;
				depth--;
				if (depth === 0) return close;
				i = close + 1;
			} else {
				const openEnd = scanOpeningTag(source, i);
				if (openEnd === undefined) return undefined;
				if (lastMeaningfulBefore(source, i + 1, openEnd) !== "/") depth++;
				i = openEnd + 1;
			}
		} else {
			i++; // JSX text: quotes and everything else are literal
		}
	}
	return undefined;
}

/**
 * Skip a braced JS expression, `{` through its matching `}`. Tracks strings,
 * templates, comments and nested braces; `<` needs no tracking — it cannot
 * shift brace depth. Regex literals holding braces are the one blind spot,
 * and mis-balancing there lands on the opening-tag degrade.
 */
function skipExpression(source: string, start: number): number | undefined {
	let i = start;
	let depth = 0;
	while (i < source.length) {
		const c = source[i];
		if (c === "{") {
			depth++;
			i++;
		} else if (c === "}") {
			depth--;
			i++;
			if (depth === 0) return i;
		} else if (c === '"' || c === "'") {
			const after = skipJsString(source, i);
			if (after === undefined) return undefined;
			i = after;
		} else if (c === "`") {
			const after = skipTemplate(source, i);
			if (after === undefined) return undefined;
			i = after;
		} else if (c === "/" && source[i + 1] === "/") {
			const eol = source.indexOf("\n", i);
			if (eol === -1) return undefined;
			i = eol + 1;
		} else if (c === "/" && source[i + 1] === "*") {
			const close = source.indexOf("*/", i + 2);
			if (close === -1) return undefined;
			i = close + 2;
		} else {
			i++;
		}
	}
	return undefined;
}

function skipJsString(source: string, start: number): number | undefined {
	const quote = source[start];
	let i = start + 1;
	while (i < source.length) {
		if (source[i] === "\\") i += 2;
		else if (source[i] === quote) return i + 1;
		else i++;
	}
	return undefined;
}

function skipTemplate(source: string, start: number): number | undefined {
	let i = start + 1;
	while (i < source.length) {
		if (source[i] === "\\") {
			i += 2;
		} else if (source[i] === "`") {
			return i + 1;
		} else if (source[i] === "$" && source[i + 1] === "{") {
			const after = skipExpression(source, i + 1);
			if (after === undefined) return undefined;
			i = after;
		} else {
			i++;
		}
	}
	return undefined;
}

/** The last non-whitespace char in [from, before) — `/` marks self-closing. */
function lastMeaningfulBefore(source: string, from: number, before: number): string | undefined {
	for (let i = before - 1; i >= from; i--) {
		const c = source[i];
		if (c !== undefined && !/\s/.test(c)) return c;
	}
	return undefined;
}

function countLines(source: string, from: number, to: number): number {
	let count = 0;
	for (let i = from; i <= to; i++) if (source[i] === "\n") count++;
	return count;
}

/** The whole element when it fits; the opening tag when it runs long. */
function excerptOf(source: string, start: number, end: number, openEnd: number): string {
	const full = source.slice(start, end + 1);
	if (full.length <= EXCERPT_CAP) return full;
	const opening = source.slice(start, openEnd + 1);
	return opening.length <= EXCERPT_CAP ? opening : `${opening.slice(0, EXCERPT_CAP - 1)}…`;
}
