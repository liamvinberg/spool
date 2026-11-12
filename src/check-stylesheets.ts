import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { designRelativePath } from "./daemon/design-boundary";
import { isThemeStylesheet, stylesheetImportKind, unsupportedStylesheetImport } from "./daemon/themes";

/** One `@import` the stylesheet compile will refuse, where it is written. */
export interface StylesheetProblem {
	path: string;
	line: number;
	column: number;
	message: string;
}

// what Tailwind follows: `@import "…"` or `@reference "…"`, a quoted address and never a url()
const FOLLOWED_IMPORT = /@(?:import|reference)\s+(["'])([^"'\n]*)\1/gi;

/**
 * The imports Tailwind's compile of these stylesheets would refuse (spool#323):
 * in tokens.css, in every theme among `reached` (the stylesheets the checked
 * frames import), and in what they import in turn. A frame's own imports may
 * name `shared/…` from design/; a stylesheet Tailwind compiles may not, and a
 * check that passed it left the refusal to the first shot.
 */
export function checkStylesheets(designDir: string, reached: readonly string[]): StylesheetProblem[] {
	const problems: StylesheetProblem[] = [];
	const tokens = join(designDir, "shared", "tokens.css");
	const queue = [...(existsSync(tokens) ? [tokens] : []), ...reached.filter((file) => isThemeStylesheet(read(file)))];
	const seen = new Set<string>();
	for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
		if (seen.has(file)) continue;
		seen.add(file);
		const text = read(file);
		const shown = `design/${designRelativePath(designDir, file)}`;
		const where = (index: number) => {
			const before = text.slice(0, index).split("\n");
			return { path: shown, line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
		};
		for (const found of withoutComments(text).matchAll(FOLLOWED_IMPORT)) {
			const id = found[2] ?? "";
			const kind = stylesheetImportKind(id);
			if (kind === "unsupported") {
				problems.push({
					...where(found.index),
					message: unsupportedStylesheetImport(id, shown) + relativeFix(designDir, file, id),
				});
			} else if (kind === "relative") {
				const target = resolve(dirname(file), id);
				if (existsSync(target)) queue.push(target);
				else
					problems.push({
						...where(found.index),
						message: `no stylesheet at design/${designRelativePath(designDir, target)}`,
					});
			}
		}
	}
	return problems;
}

/** How to write a `shared/…` import from design/ so it resolves: relative to the stylesheet. */
function relativeFix(designDir: string, file: string, id: string): string {
	if (!id.startsWith("shared/") || !existsSync(join(designDir, id))) return "";
	const path = relative(dirname(file), join(designDir, id)).split(sep).join(posix.sep);
	return `; write it "${path.startsWith(".") ? path : `./${path}`}"`;
}

/** The text with its comments blanked, every offset where it was. */
function withoutComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
}

function read(file: string): string {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return "";
	}
}
