import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, posix, relative, resolve, sep } from "node:path";

/**
 * Escaping imports re-aimed when a folder moves (#273).
 *
 * A `../` specifier counts the folders between its file and its target, and a
 * move changes the count: a frame dragged into a page compiled a moment ago
 * and now fails on every `../../shared/...` line it carries. The explorer's
 * verbs move folders, so the explorer is where the count is put right — after
 * the rename, every file in the moved folder has each specifier that reaches
 * *out* of the folder re-aimed at the target that stayed put. A target inside
 * shared/ is spelled as its design-relative name (`shared/lib/utils`), the form
 * the compile resolves from any depth, so a healed import never needs healing
 * again; anything else gets its relative path recomputed from where the file
 * stands now.
 *
 * Two languages carry specifiers the compile follows, and each is read in its
 * own positions only: a script's `import`/`export ... from`, bare `import "…"`
 * and `import("…")`; a stylesheet's `@import` and `url()`. A `../` in a
 * comment, a JSX attribute or a string the frame shows is the author's text
 * and is never touched — the canvas rearranges, it does not write.
 *
 * What else is left alone: specifiers that stay inside the moved folder (they
 * moved with it), paths that answer to no file on disk (nothing to aim at),
 * paths that escape design/ (the compile refuses those in its own words), and
 * a target that is itself mid-move in the same request — a frame reaching into
 * another frame's folder is outside the contract, and its old path answering
 * nothing is the signal to not guess. A rename or a copy beside the original
 * keeps every count, so it is skipped whole and a copy stays byte-identical.
 */
export function reaimEscapingImports(designDir: string, fromDir: string, toDir: string): void {
	const fromRel = designRelative(designDir, fromDir);
	const toRel = designRelative(designDir, toDir);
	if (posix.dirname(fromRel) === posix.dirname(toRel)) return;
	for (const file of filesUnder(toDir)) {
		const syntax = SYNTAX[extname(file)];
		if (syntax === undefined) continue;
		const inner = designRelative(toDir, file);
		const oldDir = posix.dirname(posix.join(fromRel, inner));
		const newDir = posix.dirname(posix.join(toRel, inner));
		const source = readFileSync(file, "utf8");
		const rewritten = source.replace(syntax, (whole, lead: string, quote: string, spec: string) => {
			const spelled = reaim(designDir, fromRel, oldDir, newDir, spec);
			return spelled === undefined ? whole : `${lead}${quote}${spelled}${quote}`;
		});
		if (rewritten !== source) writeFileSync(file, rewritten);
	}
}

/**
 * The new spelling of one `../` specifier, or undefined where it is left as
 * written. `oldDir`/`newDir` are the file's folder before and after the move,
 * design-relative, so the target is found from where the file was and spelled
 * from where it is.
 */
function reaim(designDir: string, fromRel: string, oldDir: string, newDir: string, spec: string): string | undefined {
	const target = posix.normalize(posix.join(oldDir, spec));
	if (target.startsWith("../")) return undefined;
	if (target === fromRel || target.startsWith(`${fromRel}/`)) return undefined;
	if (!resolvable(designDir, target)) return undefined;
	return target.startsWith("shared/") ? target : relativeSpec(newDir, target);
}

/**
 * Where a specifier sits in each language, as (lead, quote, spec) so the
 * rewrite re-emits exactly the surrounding characters it matched.
 */
const SCRIPT_SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])((?:\.\.\/)+[^"'\n]*)\2/g;
const STYLE_SPECIFIER = /(@import\s*|url\(\s*)(["']?)((?:\.\.\/)+[^"')\s]*)\2/g;

/** The files a specifier can live in; sidecars and images hold none. */
const SYNTAX: Record<string, RegExp> = {
	".ts": SCRIPT_SPECIFIER,
	".tsx": SCRIPT_SPECIFIER,
	".js": SCRIPT_SPECIFIER,
	".jsx": SCRIPT_SPECIFIER,
	".mjs": SCRIPT_SPECIFIER,
	".css": STYLE_SPECIFIER,
};

/** How esbuild would finish an extensionless specifier, plus the file as named. */
const RESOLVED_AS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json"];

function designRelative(base: string, path: string): string {
	return relative(base, path).split(sep).join("/");
}

function resolvable(designDir: string, target: string): boolean {
	const path = resolve(designDir, target);
	for (const ending of RESOLVED_AS) if (isFile(path + ending)) return true;
	return isFile(join(path, "index.ts")) || isFile(join(path, "index.tsx"));
}

function relativeSpec(fromDir: string, target: string): string {
	const spelled = posix.relative(fromDir, target);
	return spelled.startsWith(".") ? spelled : `./${spelled}`;
}

function isFile(path: string): boolean {
	return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
}

function filesUnder(dir: string): string[] {
	try {
		return readdirSync(dir, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => join(entry.parentPath, entry.name));
	} catch {
		return [];
	}
}
