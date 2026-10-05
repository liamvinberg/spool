/**
 * Spool's Tailwind class scanner: which class candidates a frame's source
 * closure holds, for Tailwind's compile to build the stylesheet from.
 *
 * It stands in for Tailwind's own scanner, Oxide, which is native code and
 * cannot run in a Cloudflare Worker. The canvas and Spool Cloud scan with this
 * one, so they never disagree about which classes a frame uses. Over the 2,383
 * files of Spool's own canvas it finds every candidate Oxide finds that makes
 * Tailwind emit CSS, and one more, `--spacing`, in two files (spool-cloud
 * research 117). `class-scanner.test.ts` holds it to Oxide.
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

/** Where a candidate stops when it is not inside an arbitrary value. */
const STOP = new Set([" ", "\t", "\n", "\r", '"', "'", "`", "{", "}", "<", ">", ",", ";", "\\", "="]);
/** What Oxide accepts right before a candidate, and right after one. */
const BEFORE = new Set([" ", "\t", "\n", "\r", '"', "'", "`", "}", ">", "."]);
const AFTER = new Set([" ", "\t", "\n", "\r", '"', "'", "`", "{", "<", "=", ":", "\\", "]"]);
/** JSON takes brackets and braces on either side too. */
const BEFORE_JSON = new Set([...BEFORE, "{", "[", "]"]);
const AFTER_JSON = new Set([...AFTER, "}", "["]);
/** Punctuation a token can end in that is the code's, not the candidate's. */
const TRAILING = new Set([")", ":", ".", "?", "!"]);
/** Past this many characters an open bracket is code, not an arbitrary value. */
const LONGEST_BRACKET = 400;

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

	// The token, and each spelling inside it that starts after a "." (a
	// selector, a property access), each with its trailing punctuation peeled
	// off one character at a time. A spelling counts only where its own
	// neighbours are boundaries.
	const offer = (start: number, end: number): void => {
		const starts = [start];
		for (let at = start; at < end - 1; at++) if (text[at] === ".") starts.push(at + 1);
		for (const from of starts) {
			let to = end;
			while (to > from) {
				const opens = from === 0 || from !== start || before.has(text[from - 1] as string);
				if (opens && (to === text.length || after.has(text[to] as string))) found.add(text.slice(from, to));
				if (!TRAILING.has(text[to - 1] as string)) break;
				to--;
			}
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
		const char = text[at] as string;
		if (depth === 0 && STOP.has(char)) {
			flush(at);
			continue;
		}
		// an arbitrary value never holds whitespace: this bracket is code, not a class
		if (depth > 0 && /\s/.test(char)) {
			depth = 0;
			start = -1;
			continue;
		}
		if (start < 0) start = at;
		if (char === "[" || (char === "(" && depth > 0)) depth++;
		else if ((char === "]" || char === ")") && depth > 0) depth--;
		if (depth > 0 && (char === "\n" || at - start > LONGEST_BRACKET)) {
			depth = 0;
			flush(at);
		}
	}
	flush(text.length);

	for (const property of text.matchAll(/--[A-Za-z0-9_-]+/g)) found.add(property[0]);
}
