import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { designRelativePath, isWithin } from "./daemon/design-boundary";
import { pinnedTailwind } from "./daemon/stylesheet-workers";
import {
	isThemeStylesheet,
	stylesheetImportKind,
	unpinnedStylesheetImport,
	unsupportedStylesheetImport,
} from "./daemon/themes";

/** One `@import` the stylesheet compile will refuse, where it is written. */
export interface StylesheetProblem {
	path: string;
	line: number;
	column: number;
	message: string;
}

/**
 * The imports Tailwind's compile of the checked frames' stylesheets would refuse (spool#323). Each frame compiles from
 * the theme its imports reach, or from tokens.css when they reach none, and from what that stylesheet imports in turn.
 * A frame's own imports may name `shared/…` from design/; a stylesheet Tailwind compiles may not, and a check that
 * passed it left the refusal to the first shot. `stylesheetsOf` gives the stylesheets a frame's sources import.
 */
export function checkStylesheets(
	designDir: string,
	frames: readonly string[],
	stylesheetsOf: (frame: string) => readonly string[],
): StylesheetProblem[] {
	const tokens = join(designDir, "shared", "tokens.css");
	const roots = new Set<string>();
	for (const frame of frames) {
		const themes = stylesheetsOf(frame).filter((file) => isThemeStylesheet(read(file)));
		for (const root of themes.length > 0 ? themes : existsSync(tokens) ? [tokens] : []) roots.add(root);
	}
	const problems: StylesheetProblem[] = [];
	const queue = [...roots];
	const seen = new Set<string>();
	for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
		if (seen.has(file)) continue;
		seen.add(file);
		const text = read(file);
		const shown = `design/${designRelativePath(designDir, file)}`;
		for (const { at, id } of followedImports(text)) {
			const before = text.slice(0, at).split("\n");
			const place = { path: shown, line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
			const problem = (message: string) => problems.push({ ...place, message });
			const kind = stylesheetImportKind(id);
			if (kind === "unsupported") {
				problem(unsupportedStylesheetImport(id, shown) + relativeFix(designDir, file, id));
			} else if (kind === "tailwind") {
				const name = id === "tailwindcss" ? "index.css" : posix.normalize(id.slice("tailwindcss/".length));
				if (name.startsWith("../") || pinnedTailwind(name) === undefined) problem(unpinnedStylesheetImport(id));
			} else if (kind === "relative") {
				const target = resolve(dirname(file), id);
				if (!isWithin(designDir, target)) problem(`stylesheet import "${id}" reaches outside design/`);
				else if (!existsSync(target)) problem(`no stylesheet at design/${designRelativePath(designDir, target)}`);
				else queue.push(target);
			}
		}
	}
	return problems;
}

/**
 * The `@import "…"` and `@reference "…"` statements Tailwind follows, by where each starts: a quoted address, never a
 * url(), and nothing inside a comment or a string.
 */
function followedImports(css: string): Array<{ at: number; id: string }> {
	const found: Array<{ at: number; id: string }> = [];
	for (let i = 0; i < css.length; i += 1) {
		const char = css[i];
		if (char === "/" && css[i + 1] === "*") {
			const close = css.indexOf("*/", i + 2);
			if (close === -1) break;
			i = close + 1;
		} else if (char === '"' || char === "'") {
			i = stringEnd(css, i);
		} else if (char === "@") {
			const statement = /^@(?:import|reference)\s+(["'])/i.exec(css.slice(i, i + 32));
			if (statement === null) continue;
			const open = i + statement[0].length - 1;
			const close = stringEnd(css, open);
			found.push({ at: i, id: css.slice(open + 1, close) });
			i = close;
		}
	}
	return found;
}

/** Where the string opening at `open` closes, past escapes. */
function stringEnd(css: string, open: number): number {
	const quote = css[open];
	for (let i = open + 1; i < css.length; i += 1) {
		if (css[i] === "\\") i += 1;
		else if (css[i] === quote || css[i] === "\n") return i;
	}
	return css.length;
}

/** How to write a `shared/…` import from design/ so it resolves: relative to the stylesheet. */
function relativeFix(designDir: string, file: string, id: string): string {
	if (!id.startsWith("shared/") || !existsSync(join(designDir, id))) return "";
	const path = relative(dirname(file), join(designDir, id)).split(sep).join(posix.sep);
	return `; write it "${path.startsWith(".") ? path : `./${path}`}"`;
}

function read(file: string): string {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return "";
	}
}
