/**
 * Tailwind classes a frame names that its stylesheet has no rule for: a colour
 * the project's tokens reset (`bg-white` under `--color-*: initial`), a token
 * since renamed (`text-subtle`). Tailwind drops a class it cannot build without
 * a word, so the element renders unstyled and the console stays clean; a shot
 * reports these instead (`spool shot`, `spool logs`).
 *
 * Only what is plainly a class is read: the strings of a `className`, and of a
 * `cn`, `clsx`, `cva`, `cx`, `twMerge` or `tv` call. Of those, only a class of
 * a utility that takes its value from the theme is held to the stylesheet, so
 * a class kept for a script or a test (`card`, `is-open`) is never reported.
 */

/** The utilities whose values are theme tokens, as a class spells them before its value. */
const THEMED = new Set([
	"bg",
	"text",
	"border",
	"border-x",
	"border-y",
	"border-t",
	"border-r",
	"border-b",
	"border-l",
	"border-s",
	"border-e",
	"ring",
	"ring-offset",
	"inset-ring",
	"outline",
	"fill",
	"stroke",
	"from",
	"via",
	"to",
	"shadow",
	"inset-shadow",
	"drop-shadow",
	"text-shadow",
	"decoration",
	"divide",
	"accent",
	"caret",
	"placeholder",
	"font",
	"rounded",
	"rounded-t",
	"rounded-r",
	"rounded-b",
	"rounded-l",
	"rounded-tl",
	"rounded-tr",
	"rounded-br",
	"rounded-bl",
	"leading",
	"tracking",
	"ease",
	"animate",
]);

const CALLS = /\b(?:cn|clsx|cva|cx|twMerge|tv)\s*\(/g;
const CLASS_NAME = /\bclassName\s*=\s*/g;
const SOURCE = /\.(?:tsx|jsx|ts|js|mts|mjs)$/;

/** The text from an opening bracket at `start` to its match, or to the end. */
function balanced(text: string, start: number, open: string, close: string): string {
	let depth = 0;
	for (let i = start; i < text.length; i++) {
		const char = text[i];
		if (char === open) depth++;
		else if (char === close && --depth === 0) return text.slice(start, i + 1);
	}
	return text.slice(start);
}

/** The static text of every string literal in some code; a template's `${}` parts are left out. */
function literals(code: string): string[] {
	const found: string[] = [];
	const pattern = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
	for (const match of code.matchAll(pattern)) {
		const text = match[1] ?? match[2] ?? match[3] ?? "";
		found.push(match[3] === undefined ? text : text.replace(/\$\{[^}]*\}/g, " "));
	}
	return found;
}

/** Every class a source file plainly names. */
export function namedClasses(source: string): string[] {
	const strings: string[] = [];
	for (const match of source.matchAll(CLASS_NAME)) {
		const at = (match.index ?? 0) + match[0].length;
		const first = source[at];
		if (first === '"' || first === "'")
			strings.push(...literals(source.slice(at, source.indexOf(first, at + 1) + 1)));
		else if (first === "{") strings.push(...literals(balanced(source, at, "{", "}")));
	}
	for (const match of source.matchAll(CALLS)) {
		const at = (match.index ?? 0) + match[0].length - 1;
		strings.push(...literals(balanced(source, at, "(", ")")));
	}
	return strings.flatMap((text) => text.split(/\s+/)).filter((name) => name !== "");
}

/**
 * The classes each source file named when last read, by path: a shared
 * component is a source of every frame that draws it, and a save that
 * recompiles those frames would read its classes again for each.
 */
const namedByFile = new Map<string, { text: string; names: string[] }>();
/** Past this many files the memory starts over, so a daemon serving many projects holds no more than this. */
const NAMED_FILES = 4000;

function namedClassesOf(file: string, text: string): string[] {
	const known = namedByFile.get(file);
	if (known !== undefined && known.text === text) return known.names;
	const names = namedClasses(text);
	if (known === undefined && namedByFile.size >= NAMED_FILES) namedByFile.clear();
	namedByFile.set(file, { text, names });
	return names;
}

/** The utility a class is of, past its variants and modifiers, when it is one held to the theme. */
function themedUtility(name: string): boolean {
	if (/[[\](){}$'"`]/.test(name)) return false;
	const base = (name.split(":").pop() ?? "").replace(/^!|!$/g, "").replace(/^-/, "");
	const value = base.split("/")[0] ?? "";
	for (let cut = value.lastIndexOf("-"); cut > 0; cut = value.lastIndexOf("-", cut - 1)) {
		if (THEMED.has(value.slice(0, cut))) return true;
	}
	return false;
}

/** A class name as a stylesheet's selector spells it, the way Tailwind escapes it. */
export function escapeClass(name: string): string {
	let escaped = "";
	for (let i = 0; i < name.length; i++) {
		const char = name[i] as string;
		const code = char.charCodeAt(0);
		if (i === 0 && code >= 48 && code <= 57) escaped += `\\${code.toString(16)} `;
		else if (/[A-Za-z0-9_-]/.test(char) || code >= 128) escaped += char;
		else escaped += `\\${char}`;
	}
	return escaped;
}

/** Whether a stylesheet has a rule for a class: its selector, not followed by more of a name. */
function styledIn(css: string, name: string): boolean {
	const selector = `.${escapeClass(name)}`;
	for (let at = css.indexOf(selector); at !== -1; at = css.indexOf(selector, at + 1)) {
		const next = css[at + selector.length];
		if (next === undefined || !/[A-Za-z0-9_\\-]/.test(next)) return true;
	}
	return false;
}

/** A character `styledIn` takes for more of a name after a selector. */
function continuesName(code: number): boolean {
	return (
		(code >= 48 && code <= 57) ||
		(code >= 65 && code <= 90) ||
		(code >= 97 && code <= 122) ||
		code === 95 ||
		code === 92 ||
		code === 45
	);
}

/**
 * `styledIn` for many names over one stylesheet, from one pass over it: every
 * `.`-run an escaped class could spell, cut wherever `styledIn` would find no
 * more of a name, so a lookup answers what its scan would. A frame names
 * hundreds of classes and its stylesheet runs to megabytes, and one scan per
 * class held the daemon's loop for tens of milliseconds a compile. A name
 * whose escape opens with a digit carries a space inside its selector, which
 * the runs never cross, so it is still scanned.
 */
function styledIndex(css: string): (name: string) => boolean {
	const selectors = new Set<string>();
	for (let dot = css.indexOf("."); dot !== -1; dot = css.indexOf(".", dot + 1)) {
		let at = dot + 1;
		while (true) {
			const code = css.charCodeAt(at);
			if (Number.isNaN(code) || !continuesName(code)) selectors.add(css.slice(dot, at));
			if (Number.isNaN(code)) break;
			// an escape's backslash always takes the character after it
			if (code === 92) at += 2;
			else if (continuesName(code) || code >= 128) at += 1;
			else break;
		}
	}
	return (name) => {
		const first = name.charCodeAt(0);
		if (first >= 48 && first <= 57) return styledIn(css, name);
		return selectors.has(`.${escapeClass(name)}`);
	};
}

/**
 * The themed classes a frame's sources name that its stylesheet never built,
 * each once, in the order first named.
 */
export function unstyledClasses(files: ReadonlyArray<{ file: string; text: string }>, css: string): string[] {
	const missing = new Set<string>();
	let styled: ((name: string) => boolean) | undefined;
	for (const { file, text } of files) {
		if (!SOURCE.test(file)) continue;
		for (const name of namedClassesOf(file, text)) {
			if (missing.has(name) || !themedUtility(name)) continue;
			styled ??= styledIndex(css);
			if (!styled(name)) missing.add(name);
		}
	}
	return [...missing];
}

/** How many unstyled classes a warning names before it counts the rest. */
const NAMED = 12;

/** The one line a frame's unstyled classes are reported in, or nothing for none. */
export function unstyledWarning(classes: readonly string[]): string | undefined {
	if (classes.length === 0) return undefined;
	const named = classes.slice(0, NAMED).join(", ");
	const more = classes.length > NAMED ? `, and ${classes.length - NAMED} more` : "";
	return `classes with no CSS: ${named}${more} (no token or utility builds them)`;
}
