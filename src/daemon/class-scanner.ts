/**
 * Spool's Tailwind class scanner: which class candidates a frame's source
 * closure holds, for Tailwind's compile to build the stylesheet from.
 *
 * It stands in for Tailwind's own scanner, Oxide, which is native code and
 * cannot run in a Cloudflare Worker. The canvas and Spool Cloud scan with this
 * one, so they never disagree about which classes a frame uses. It finds
 * every candidate Oxide finds that makes Tailwind emit CSS, and one more,
 * `--spacing` (spool-cloud research 117). `class-scanner.test.ts` holds it to
 * Oxide over the committed canvases and UI, and `pnpm test:canvas` over Spool's
 * own live canvas.
 *
 * A candidate is a run of text between boundaries, offered whole and with
 * trailing punctuation peeled off, and kept only where the characters on
 * either side are ones Oxide accepts around a candidate: `display: inline-flex;`
 * in a stylesheet offers no `inline-flex`, because `;` after it refuses it.
 * Custom properties (`--name`) are offered wherever they appear, as Oxide does.
 */

/** One file of a frame's closure, as text, by the extension it is scanned as. */
export interface ScannedFile {
	content: string;
	extension: string;
}

/** Which class candidates some files hold: scanCandidates, or Oxide in the parity test. */
export type ClassScanner = (files: readonly ScannedFile[]) => string[];

/** A table of characters, by code: whether each ASCII one is among these. */
function characters(...members: string[]): Uint8Array {
	const table = new Uint8Array(128);
	for (const member of members) table[member.charCodeAt(0)] = 1;
	return table;
}

/** Where a candidate stops when it is not inside an arbitrary value. */
const STOP = characters(" ", "\t", "\n", "\r", '"', "'", "`", "{", "}", "<", ">", ",", ";", "\\", "=");
/** What Oxide accepts right before a candidate, and right after one. */
const BEFORE = characters(" ", "\t", "\n", "\r", '"', "'", "`", "}", ">", ".");
const AFTER = characters(" ", "\t", "\n", "\r", '"', "'", "`", "{", "<", "=", ":", "\\", "]");
/** JSON takes brackets and braces on either side too. */
const BEFORE_JSON = characters(" ", "\t", "\n", "\r", '"', "'", "`", "}", ">", ".", "{", "[", "]");
const AFTER_JSON = characters(" ", "\t", "\n", "\r", '"', "'", "`", "{", "<", "=", ":", "\\", "]", "}", "[");
/** Punctuation a token can end in that is the code's, not the candidate's. */
const TRAILING = characters(")", ":", ".", "?", "!");
/** What a key's candidate is spelled with, outside its brackets. */
const KEY = /[A-Za-z0-9_./-]/;
/** What Oxide refuses right before a key's candidate. */
const NOT_BEFORE_KEY = new Set(["!", "*", "@", "<"]);
/** Past this many characters an open bracket is code, not an arbitrary value. */
const LONGEST_BRACKET = 400;

const OPEN_SQUARE = 91;
const CLOSE_SQUARE = 93;
const OPEN_ROUND = 40;
const CLOSE_ROUND = 41;
const NEWLINE = 10;

/** Whether a character code is in a table; nothing past ASCII is. */
function within(table: Uint8Array, code: number): boolean {
	return code < 128 && table[code] === 1;
}

/** Whether a character code is whitespace as `\s` takes it. */
function isSpace(code: number): boolean {
	if (code < 128) return code === 32 || (code >= 9 && code <= 13);
	return (
		code === 0xa0 ||
		code === 0x1680 ||
		(code >= 0x2000 && code <= 0x200a) ||
		code === 0x2028 ||
		code === 0x2029 ||
		code === 0x202f ||
		code === 0x205f ||
		code === 0x3000 ||
		code === 0xfeff
	);
}

/** Every class candidate in these files, each once. */
export function scanCandidates(files: readonly ScannedFile[]): string[] {
	const found = new Set<string>();
	for (const file of files) scan(file.content, file.extension, found);
	return [...found];
}

function scan(text: string, extension: string, found: Set<string>): void {
	const json = extension === "json";
	const before = json ? BEFORE_JSON : BEFORE;
	const after = json ? AFTER_JSON : AFTER;
	// the two passes below mostly find the same runs: each is offered once
	const runs = new Set<number>();

	// The token, and each spelling inside it that starts after a "." (a
	// selector, a property access).
	const offer = (start: number, end: number): void => {
		const run = start * (text.length + 1) + end;
		if (runs.has(run)) return;
		runs.add(run);
		spell(start, start, end);
		for (let dot = text.indexOf(".", start); dot !== -1 && dot < end - 1; dot = text.indexOf(".", dot + 1)) {
			spell(dot + 1, start, end);
		}
	};

	// One spelling with its trailing punctuation peeled off one character at a
	// time, a "]" too where it closes nothing the spelling opened
	// (`[open, block]`). A spelling counts only where its own neighbours are
	// boundaries.
	const spell = (from: number, start: number, end: number): void => {
		const opens = from === 0 || from !== start || within(before, text.charCodeAt(from - 1));
		let unclosed: number | undefined;
		let to = end;
		while (to > from) {
			if (opens && (to === text.length || within(after, text.charCodeAt(to)))) offered(found, text.slice(from, to));
			const last = text.charCodeAt(to - 1);
			if (last === CLOSE_SQUARE) {
				unclosed ??= bracketBalance(text, from, to);
				if (unclosed >= 0) break;
				unclosed++;
			} else if (!within(TRAILING, last)) break;
			to--;
		}
	};

	// Runs between whitespace, quotes and code delimiters, so a class in
	// ["-left-[3px]", ...] is seen even where the bracket-aware pass below
	// swallows it into one token.
	for (const run of text.matchAll(/[^\s"'`<>{}\\,;]+/g)) offer(run.index, run.index + run[0].length);

	// Bracket-aware runs: an arbitrary value such as `grid-cols-[1fr_auto]` or
	// `bg-(--brand)` is one candidate whatever it holds, short of whitespace.
	let depth = 0;
	let start = -1;
	const flush = (end: number): void => {
		if (start >= 0 && end > start) offer(start, end);
		start = -1;
	};
	for (let at = 0; at < text.length; at++) {
		const code = text.charCodeAt(at);
		if (depth === 0 && within(STOP, code)) {
			flush(at);
			continue;
		}
		// an arbitrary value never holds whitespace: this bracket is code, not a class
		if (depth > 0 && isSpace(code)) {
			depth = 0;
			start = -1;
			continue;
		}
		if (start < 0) start = at;
		if (code === OPEN_SQUARE || (code === OPEN_ROUND && depth > 0)) depth++;
		else if ((code === CLOSE_SQUARE || code === CLOSE_ROUND) && depth > 0) depth--;
		if (depth > 0 && (code === NEWLINE || at - start > LONGEST_BRACKET)) {
			depth = 0;
			flush(at);
		}
	}
	flush(text.length);

	for (const property of text.matchAll(/--[A-Za-z0-9_-]+/g)) found.add(property[0]);

	// A key, `{ block: open }` or `(visible: boolean)`: a candidate followed by
	// ":" and whitespace counts whatever stands before it, as Oxide takes it.
	for (const colon of text.matchAll(/:(?=\s|$)/g)) {
		const key = keyBefore(text, colon.index);
		if (key !== undefined) offered(found, key);
	}
}

/** How many more "[" than "]" a stretch of text holds. */
function bracketBalance(text: string, from: number, to: number): number {
	let balance = 0;
	for (let at = from; at < to; at++) {
		const code = text.charCodeAt(at);
		if (code === OPEN_SQUARE) balance++;
		else if (code === CLOSE_SQUARE) balance--;
	}
	return balance;
}

/**
 * A candidate kept, unless it spells a custom property shorthand Oxide refuses:
 * `z-(--layer-*)` is no candidate, `z-(--layer)` and `bg-(color:--ink)/50` are.
 */
function offered(found: Set<string>, candidate: string): void {
	if (candidate.includes("[") && !propertyNamed(candidate)) return;
	const shorthand = candidate.includes("-(") ? shorthandAt(candidate) : -1;
	if (shorthand === -1 || SHORTHAND.test(candidate.slice(shorthand + 1))) found.add(candidate);
}

/**
 * Whether a candidate that ends in an arbitrary property, `[mask-type:alpha]`,
 * names one as Oxide takes it: lowercase and dashes, or a custom property. A
 * selector in code, `'[data-part="token:screen"]'`, is none. A candidate that
 * ends in no arbitrary property passes.
 */
function propertyNamed(candidate: string): boolean {
	// the utility is what follows the last ":" outside brackets, its variants before it
	let depth = 0;
	let utility = 0;
	for (let at = 0; at < candidate.length; at++) {
		const char = candidate[at];
		if (char === "[" || char === "(") depth++;
		else if (char === "]" || char === ")") depth--;
		else if (depth === 0 && char === ":") utility = at + 1;
	}
	if (candidate[utility] !== "[") return true;
	const colon = candidate.indexOf(":", utility);
	if (colon === -1) return true;
	return PROPERTY.test(candidate.slice(utility + 1, colon));
}

/** An arbitrary property's name as Oxide takes one. */
const PROPERTY = /^(?:[a-z-]+|--[A-Za-z0-9_-]+)$/;

/** Where a candidate's `-(` shorthand starts, outside any arbitrary value in brackets; -1 when it has none. */
function shorthandAt(candidate: string): number {
	let depth = 0;
	for (let at = 0; at < candidate.length - 1; at++) {
		const char = candidate[at];
		if (char === "[") depth++;
		else if (char === "]") depth--;
		else if (depth === 0 && char === "-" && candidate[at + 1] === "(") return at;
	}
	return -1;
}

/** A custom property shorthand as Oxide takes one: a property, a fallback, then a modifier or `!` at most. */
const SHORTHAND = /^\((?:[a-z-]+:)?--[A-Za-z0-9_-]+(?:,[^)]*)?\)(?:\/\S*|!)?$/;

/** The candidate that ends where a key's ":" stands, or undefined when none does. */
function keyBefore(text: string, end: number): string | undefined {
	let start = end;
	// an arbitrary value it ends in, whole: `w-[3px]: `
	const close = text[start - 1];
	if (close === "]" || close === ")") {
		let depth = 0;
		do {
			const char = text[--start] as string;
			if (char === "]" || char === ")") depth++;
			else if (char === "[" || char === "(") depth--;
			else if (/\s/.test(char)) return undefined;
		} while (depth > 0 && start > 0);
		if (depth > 0) return undefined;
	}
	while (start > 0 && KEY.test(text[start - 1] as string)) start--;
	// a candidate starts at a letter, a digit or a dash
	while (start < end && "_./".includes(text[start] as string)) start++;
	if (start === end || text[start] === "-" || NOT_BEFORE_KEY.has(text[start - 1] as string)) return undefined;
	return text.slice(start, end);
}
