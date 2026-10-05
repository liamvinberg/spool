import { basename, dirname, join, resolve } from "node:path";
import type { ImportKind } from "esbuild";
import { DesignBoundaryError, isWithin } from "./design-boundary";
import type { DesignFiles } from "./design-files";

/**
 * The extensions an import that names none is tried with, in order: esbuild's
 * own default, which the design compile also hands esbuild.
 */
export const RESOLVE_EXTENSIONS: readonly string[] = [".tsx", ".ts", ".jsx", ".js", ".css", ".json"];

/**
 * Esbuild's TypeScript rewrite, tried after the extensions: `./x.js` that has
 * no file of its own means `./x.ts`, then `./x.tsx`, as tsc resolves it.
 */
const REWRITTEN_EXTENSIONS: ReadonlyMap<string, readonly string[]> = new Map([
	[".js", [".ts", ".tsx"]],
	[".jsx", [".ts", ".tsx"]],
	[".mjs", [".mts"]],
	[".cjs", [".cts"]],
]);

/** The references a stylesheet makes. An `@import` and `composes` try .css alone; a `url()` names its file. */
const STYLESHEET_KINDS: ReadonlySet<ImportKind> = new Set(["import-rule", "composes-from", "url-token"]);

/** A URL a stylesheet references by scheme, by fragment or protocol-relative: never a file. */
const STYLESHEET_URL = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;

/**
 * What an import names: a file and the `?query` or `#hash` it was asked with,
 * a package for the import map, nothing at all, or (undefined) something with
 * no file behind it that esbuild answers itself, a `data:` URL or a stylesheet's
 * remote URL.
 */
export type DesignResolution = { file: string; suffix: string } | { external: true } | { missing: true } | undefined;

/**
 * Every import of the design compile, resolved through the files it is given
 * rather than by esbuild. A frame resolves the same imports to the same files
 * wherever it compiles: on the daemon's disk, or from the files a Worker holds
 * in memory, where esbuild cannot look.
 *
 * It answers as esbuild's resolver does for a relative path: the file, its
 * extensions, the TypeScript rewrite, then a folder's index; a symlink followed
 * to its real path; a query or hash tried as part of the name, then dropped.
 * Where it parts from esbuild it does so on purpose, to read nothing outside
 * design/:
 *
 * - a name matches the disk exactly or not at all, as on any case-sensitive
 *   file system, where esbuild on a Mac takes a match by case alone;
 * - no package.json changes what a path means (no `browser` map, `main` or
 *   `sideEffects`), inside design/ or above it;
 * - a relative import that leaves design/ is refused here, by name, rather than
 *   read and refused where it loads.
 *
 * Every other import is a package, the import map's to answer. A resolver
 * lasts one pass, as `designPathResolver` does: each folder is listed once a
 * pass, and the next pass lists them again.
 */
export function designResolver(
	designDir: string,
	files: DesignFiles,
): (specifier: string, resolveDir: string, kind: ImportKind) => DesignResolution {
	const listings = new Map<string, Map<string, string> | undefined>();
	const folders = new Map<string, boolean>();

	/** A folder's names, each with what it is once symlinks are followed. */
	function listing(directory: string): Map<string, string> | undefined {
		if (listings.has(directory)) return listings.get(directory);
		const entries = files.list(directory);
		const names =
			entries === undefined ? undefined : new Map(entries.map((entry) => [entry.name, entry.kind as string]));
		listings.set(directory, names);
		return names;
	}

	/** What a name is in a folder, through a symlink: "file", "directory", or undefined for nothing usable. */
	function entry(directory: string, name: string): "file" | "directory" | undefined {
		let kind = listing(directory)?.get(name);
		if (kind === "symlink") {
			const target = files.realpath(join(directory, name));
			kind = target === undefined ? undefined : files.kind(target);
		}
		return kind === "file" || kind === "directory" ? kind : undefined;
	}

	/** Whether a path under design/ is a folder, every name along it spelled exactly. */
	function isFolder(path: string): boolean {
		if (path === designDir) return true;
		let known = folders.get(path);
		if (known === undefined) {
			const parent = dirname(path);
			known = parent !== path && isWithin(designDir, parent) && isFolder(parent);
			known &&= entry(parent, basename(path)) === "directory";
			folders.set(path, known);
		}
		return known;
	}

	function real(path: string): string {
		return files.realpath(path) ?? path;
	}

	function asFile(target: string, names: readonly string[]): string | undefined {
		const directory = dirname(target);
		if (!isFolder(directory)) return undefined;
		for (const name of names) {
			if (entry(directory, name) === "file") return real(join(directory, name));
		}
		return undefined;
	}

	function find(target: string, folderOnly: boolean, kind: ImportKind): string | undefined {
		const base = basename(target);
		if (kind === "url-token") return folderOnly ? undefined : asFile(target, [base]);
		const extensions = STYLESHEET_KINDS.has(kind) ? [".css"] : RESOLVE_EXTENSIONS;
		if (!folderOnly) {
			const extension = [...REWRITTEN_EXTENSIONS.keys()].find((known) => base.endsWith(known));
			const rewritten =
				STYLESHEET_KINDS.has(kind) || extension === undefined ? [] : REWRITTEN_EXTENSIONS.get(extension);
			const stem = extension === undefined ? base : base.slice(0, -extension.length);
			const file = asFile(target, [
				base,
				...extensions.map((added) => `${base}${added}`),
				...(rewritten ?? []).map((added) => `${stem}${added}`),
			]);
			if (file !== undefined) return file;
		}
		if (!isFolder(target)) return undefined;
		return asFile(
			join(target, "index"),
			extensions.map((added) => `index${added}`),
		);
	}

	return (specifier, resolveDir, kind) => {
		if (specifier.startsWith("data:")) return undefined;
		const stylesheet = STYLESHEET_KINDS.has(kind);
		if (stylesheet && STYLESHEET_URL.test(specifier)) return undefined;
		const relative = specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
		// a stylesheet names a file beside it the way a URL does, with no ./ in front
		if (!relative && !stylesheet) {
			return specifier === "." || specifier === ".." ? { missing: true } : { external: true };
		}
		// a root-absolute url() is a URL, and no file of the project's
		if (kind === "url-token" && specifier.startsWith("/")) return { missing: true };

		const spellings: [string, string][] = [[specifier, ""]];
		const query = specifier.search(/[?#]/);
		if (query > 0) spellings.push([specifier.slice(0, query), specifier.slice(query)]);
		for (const [path, suffix] of spellings) {
			const target = resolve(resolveDir, path);
			if (!isWithin(designDir, target)) throw new DesignBoundaryError(specifier);
			const file = find(target, path.endsWith("/"), kind);
			if (file !== undefined) return { file, suffix };
		}
		return relative ? { missing: true } : { external: true };
	};
}
