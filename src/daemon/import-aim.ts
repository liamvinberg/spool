import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, posix, relative, resolve, sep } from "node:path";

/**
 * Escaping imports re-aimed when a folder moves (#273).
 *
 * A `../` import counts the folders between its file and its target, and a
 * move changes the count: a frame dragged into a page compiled a moment ago
 * and now fails on every `../../shared/...` line it carries. The explorer's
 * verbs move folders, so the explorer is where the count is put right — after
 * the rename, each source file in the moved folder has every relative
 * specifier that reaches *out* of the folder re-aimed at the target that
 * stayed put. A target inside shared/ is spelled as its design-relative name
 * (`shared/lib/utils`), the form the compile resolves from any depth, so a
 * healed import never needs healing again; anything else gets its relative
 * path recomputed from where the file stands now.
 *
 * What is left alone: specifiers that stay inside the moved folder (they moved
 * with it), strings that merely look like paths (only a specifier whose target
 * exists on disk is rewritten), paths that escape design/ (the compile refuses
 * those in its own words), and a target that is itself mid-move in the same
 * request — a frame reaching into another frame's folder is outside the
 * contract, and its old path answering nothing is the signal to not guess.
 */
export function reaimEscapingImports(designDir: string, fromDir: string, toDir: string): void {
	const fromRel = designRelative(designDir, fromDir);
	const toRel = designRelative(designDir, toDir);
	if (fromRel === toRel) return;
	for (const file of sourceFilesUnder(toDir)) {
		const inner = designRelative(toDir, file);
		const oldDir = posix.dirname(posix.join(fromRel, inner));
		const newDir = posix.dirname(posix.join(toRel, inner));
		const source = readFileSync(file, "utf8");
		const rewritten = source.replace(SPECIFIER, (whole, quote: string, spec: string) => {
			const target = posix.normalize(posix.join(oldDir, spec));
			if (target.startsWith("../")) return whole;
			if (target === fromRel || target.startsWith(`${fromRel}/`)) return whole;
			if (!resolvable(designDir, target)) return whole;
			const spelled = target.startsWith("shared/") ? target : relativeSpec(newDir, target);
			return `${quote}${spelled}${quote}`;
		});
		if (rewritten !== source) writeFileSync(file, rewritten);
	}
}

/** A quoted string starting with `../` — the only shape a move can break. */
const SPECIFIER = /(["'])((?:\.\.\/)+[^"'\n]*)\1/g;

/** The files a specifier can live in; stylesheets and sidecars hold none. */
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

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

function sourceFilesUnder(dir: string): string[] {
	try {
		return readdirSync(dir, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)))
			.map((entry) => join(entry.parentPath, entry.name));
	} catch {
		return [];
	}
}
