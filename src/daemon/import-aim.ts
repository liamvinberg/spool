import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, posix, relative, resolve, sep } from "node:path";

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
 * moved with it), paths that answer to no file on disk (nothing to aim at) and
 * paths that escape design/ (the compile refuses those in its own words). A
 * target in another folder moving in the same request is aimed at wherever it
 * stands when this folder's turn comes; `importersReaimed` puts the other side
 * right when that folder's turn comes. A rename or a copy beside the original
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
 * The other side of a move (spool#232): files outside the moved folder that
 * import into it, re-aimed at where it went, as rewrites not yet written.
 *
 * A mirror is a frame whose whole source is `export { default } from
 * "../checkout/frame"` with a size of its own, so renaming or moving the
 * original would leave every mirror of it pointing at nothing. Whatever
 * reached into the folder's old path by a relative specifier is spelled again
 * from where the importing file stands to the same file in the folder's new
 * place, in frames/ and shared/ alike. Copies never come here: the original
 * still stands where every importer points.
 */
export function importersReaimed(
	designDir: string,
	fromDir: string,
	toDir: string,
): { file: string; path: string; source: string }[] {
	const fromRel = designRelative(designDir, fromDir);
	const toRel = designRelative(designDir, toDir);
	if (fromRel === toRel) return [];
	// a specifier reaching into the folder from outside it has to name it
	const named = basename(fromRel);
	const writes: { file: string; path: string; source: string }[] = [];
	for (const file of [
		...sourceFilesUnder(join(designDir, "frames")),
		...sourceFilesUnder(join(designDir, "shared")),
	]) {
		const path = designRelative(designDir, file);
		if (path.startsWith(`${toRel}/`)) continue;
		const syntax = RELATIVE_SYNTAX[extname(file)];
		if (syntax === undefined) continue;
		let source: string;
		try {
			source = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		if (!source.includes(named)) continue;
		const dir = posix.dirname(path);
		const rewritten = source.replace(syntax, (whole, lead: string, quote: string, spec: string) => {
			const target = posix.normalize(posix.join(dir, spec));
			if (target !== fromRel && !target.startsWith(`${fromRel}/`)) return whole;
			return `${lead}${quote}${relativeSpec(dir, toRel + target.slice(fromRel.length))}${quote}`;
		});
		if (rewritten !== source) writes.push({ file, path, source: rewritten });
	}
	return writes;
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

/** The same positions, for any relative specifier: an importer can sit above the folder it reaches into. */
const SCRIPT_RELATIVE = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.\.?\/[^"'\n]*)\2/g;
const STYLE_RELATIVE = /(@import\s*|url\(\s*)(["']?)(\.\.?\/[^"')\s]*)\2/g;

/** The files a specifier can live in; sidecars and images hold none. */
const SYNTAX: Record<string, RegExp> = {
	".ts": SCRIPT_SPECIFIER,
	".tsx": SCRIPT_SPECIFIER,
	".js": SCRIPT_SPECIFIER,
	".jsx": SCRIPT_SPECIFIER,
	".mjs": SCRIPT_SPECIFIER,
	".css": STYLE_SPECIFIER,
};

const RELATIVE_SYNTAX: Record<string, RegExp> = {
	".ts": SCRIPT_RELATIVE,
	".tsx": SCRIPT_RELATIVE,
	".js": SCRIPT_RELATIVE,
	".jsx": SCRIPT_RELATIVE,
	".mjs": SCRIPT_RELATIVE,
	".css": STYLE_RELATIVE,
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

/** Every file under a folder, app-owned and hidden folders skipped. */
function sourceFilesUnder(dir: string): string[] {
	return filesUnder(dir).filter((file) => {
		const inner = designRelative(dir, file).split("/");
		return !inner.some((segment) => segment.startsWith(".") || segment === "node_modules");
	});
}
