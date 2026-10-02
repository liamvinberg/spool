import type { Dirent } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import type { ImportKind } from "esbuild";

/**
 * The extensions esbuild tries, in order, on an import that names none. The
 * design compile hands esbuild this very list (`designBuildOptions`), so the
 * order an import is answered in here is the order esbuild would try, always.
 * It is esbuild's own default: setting it changed no document.
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

/**
 * The import kinds esbuild resolves with that extension order. A stylesheet's
 * `@import` and `composes` try only .css, and a `url()` token is the asset
 * plugin's to refuse (`compile.ts`), so those are esbuild's to answer.
 */
const SCRIPT_KINDS: ReadonlySet<ImportKind> = new Set(["import-statement", "dynamic-import", "require-call"]);

/**
 * A specifier tail of plain printable path characters. `?` and `#` are a query
 * esbuild may strip and retry without, `*` a glob, `\` a separator on Windows.
 */
const PLAIN_TAIL = /^[\x20-\x7e]+$/u;
const READ_SPECIALLY = /[?#*\\]/u;

/**
 * What a name is in a folder, as esbuild would take it. "uncertain" is every
 * case where esbuild could take it otherwise: a symlink, which esbuild follows
 * to a real path; a name that matches the disk only by case or shares its key
 * with another (esbuild keys a folder by lowercased name and keeps one of two);
 * anything that is neither a file nor a folder; a folder that cannot be read.
 */
type EntryKind = "file" | "directory" | "uncertain";

/**
 * The name's key in esbuild's folder map. Go lowercases a rune at a time and
 * JavaScript by the full Unicode mapping; the two agree on every name that
 * lowercases to plain ASCII except U+0130, a dotted capital I, which Go makes
 * "i" and JavaScript an "i" with a combining dot. Only ASCII names are looked
 * up here, so that one letter is all that could collide in one map and not the
 * other.
 */
const keyOf = (name: string): string => name.replace(/İ/gu, "i").toLowerCase();

/**
 * What the package.json files from a folder up to / say about resolving a file
 * in it, as esbuild reads them: a `browser` object anywhere up the chain can
 * remap the file (esbuild's browser scope is the nearest manifest that has
 * one), and the nearest manifest's own `sideEffects` marks it free of side
 * effects. "uncertain" is a manifest this cannot read the way esbuild would.
 */
type PackageScope = { browser: boolean; sideEffects: boolean } | "uncertain";

/**
 * One folder's package.json as esbuild reads it: "none", whether it has a
 * browser map and marks side effects, or "uncertain". Only an object `browser`
 * makes a map, and only `false` or an array `sideEffects` marks files. Esbuild
 * reads a key's first occurrence and JSON.parse its last, so a manifest that
 * spells either key twice, or escapes any character, is uncertain.
 */
async function readPackageJson(directory: string): Promise<PackageScope | "none"> {
	const file = join(directory, "package.json");
	try {
		const found = await lstat(file);
		// a folder by that name is no manifest; one through a symlink is not ours to read
		if (found.isDirectory()) return "none";
		if (!found.isFile()) return "uncertain";
		const text = await readFile(file, "utf8");
		if (text.includes("\\u") || occurrences(text, '"browser"') > 1 || occurrences(text, '"sideEffects"') > 1) {
			return "uncertain";
		}
		const manifest: unknown = JSON.parse(text);
		if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) return "uncertain";
		const { browser, sideEffects } = manifest as { browser?: unknown; sideEffects?: unknown };
		return {
			browser: typeof browser === "object" && browser !== null && !Array.isArray(browser),
			sideEffects: sideEffects === false || Array.isArray(sideEffects),
		};
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "ENOENT" ? "none" : "uncertain";
	}
}

function occurrences(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

/**
 * shared/ by its design-relative name (#273), answered without asking esbuild.
 *
 * The shared/ plugin used to hand every such import back to esbuild through
 * `build.resolve`. Esbuild answers a plugin's resolve with a resolver made for
 * that one call, over a file system that caches nothing between calls, so each
 * import listed every folder from / down to the file again, and paid for every
 * entry in each: more under a large folder such as the system temp folder.
 * The same file imported by `../` path costs a lookup in folders esbuild has
 * already read for the pass. On Spool's own canvas that made esbuild the
 * largest single cost of a frame compile, paid in every frame's first load,
 * every photo booth sitting (#107) and every player build.
 *
 * This answers the import the way esbuild's resolver answers `./shared/<rest>`
 * from design/, step for step: the file, its extensions, the TypeScript
 * rewrite, then a folder's index. It answers only where it is certain to name
 * the same file under the same path, and leaves the rest to esbuild as before
 * (undefined), so nothing a shared/ import reaches changes and every import
 * that could leave design/ is still resolved by esbuild and refused where it
 * is loaded.
 *
 * `designDir` is the design folder's real path, as every compile passes it
 * (`realDesignDir`): esbuild spells a file by its real path, and so does this
 * only because no folder from / to design/ is a symlink.
 *
 * Every read is asynchronous, so the daemon's event loop is never held by it,
 * and each folder and manifest is read once a pass: a resolver lasts one pass,
 * as `designPathResolver` does, and the next pass reads the folders again.
 */
export function sharedImportResolver(
	designDir: string,
): (specifier: string, kind: ImportKind) => Promise<string | undefined> {
	const folders = new Map<string, Promise<Map<string, { name: string; kind: EntryKind }> | undefined>>();
	const scopes = new Map<string, Promise<PackageScope>>();

	function folder(directory: string): Promise<Map<string, { name: string; kind: EntryKind }> | undefined> {
		let listing = folders.get(directory);
		if (listing === undefined) {
			listing = readdir(directory, { withFileTypes: true }).then(
				(entries: Dirent[]) => {
					const byKey = new Map<string, { name: string; kind: EntryKind }>();
					for (const entry of entries) {
						const key = keyOf(entry.name);
						// a Dirent says only that a symlink is one: what is behind it is esbuild's to follow
						const kind = entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "uncertain";
						byKey.set(key, { name: entry.name, kind: byKey.has(key) ? "uncertain" : kind });
					}
					return byKey;
				},
				() => undefined,
			);
			folders.set(directory, listing);
		}
		return listing;
	}

	/** What a name is in a folder, or undefined when the folder has nothing by it. */
	async function entry(directory: string, name: string): Promise<EntryKind | undefined> {
		const listing = await folder(directory);
		if (listing === undefined) return "uncertain";
		const found = listing.get(keyOf(name));
		if (found === undefined) return undefined;
		return found.name === name ? found.kind : "uncertain";
	}

	function packageScope(directory: string): Promise<PackageScope> {
		let scope = scopes.get(directory);
		if (scope === undefined) {
			scope = (async (): Promise<PackageScope> => {
				const parent = dirname(directory);
				const above: PackageScope =
					parent === directory ? { browser: false, sideEffects: false } : await packageScope(parent);
				const own = await readPackageJson(directory);
				if (own === "uncertain" || above === "uncertain") return "uncertain";
				// the nearest manifest's sideEffects is the one that applies; a browser map anywhere above still does
				return own === "none" ? above : { browser: own.browser || above.browser, sideEffects: own.sideEffects };
			})();
			scopes.set(directory, scope);
		}
		return scope;
	}

	/** The file, once no package.json from its folder up changes what resolving it means. */
	async function answer(directory: string, name: string): Promise<string | undefined> {
		const scope = await packageScope(directory);
		return scope === "uncertain" || scope.browser || scope.sideEffects ? undefined : join(directory, name);
	}

	/** The first of these names that is a file, as esbuild tries them; undefined when none is. */
	async function firstFile(
		directory: string,
		names: readonly string[],
	): Promise<{ name: string } | "uncertain" | undefined> {
		for (const name of names) {
			const kind = await entry(directory, name);
			// a folder named like the file is passed over, as esbuild passes it
			if (kind === undefined || kind === "directory") continue;
			return kind === "file" ? { name } : "uncertain";
		}
		return undefined;
	}

	return async (specifier, kind) => {
		// esbuild spells paths by its own rules on Windows; there it answers alone
		if (sep !== "/" || !SCRIPT_KINDS.has(kind)) return undefined;
		const tail = specifier.slice("shared/".length);
		if (!PLAIN_TAIL.test(tail) || READ_SPECIALLY.test(tail)) return undefined;
		const segments = tail.split("/");
		if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
		// a file under a node_modules folder is tried in another extension order
		if ([...designDir.split(sep), ...segments].includes("node_modules")) return undefined;

		let directory = designDir;
		for (const segment of ["shared", ...segments.slice(0, -1)]) {
			if ((await entry(directory, segment)) !== "directory") return undefined;
			directory = join(directory, segment);
		}
		const base = segments[segments.length - 1] as string;

		// as a file: the name, the name with each extension, then the TypeScript rewrite
		const dot = base.lastIndexOf(".");
		const rewritten = [...REWRITTEN_EXTENSIONS].find(([extension]) => base.endsWith(extension))?.[1] ?? [];
		const file = await firstFile(directory, [
			base,
			...RESOLVE_EXTENSIONS.map((extension) => `${base}${extension}`),
			...rewritten.map((extension) => `${base.slice(0, dot)}${extension}`),
		]);
		if (file === "uncertain") return undefined;
		if (file !== undefined) return answer(directory, file.name);

		// as a folder: its index, unless a package.json there names a main file
		if ((await entry(directory, base)) !== "directory") return undefined;
		const inside = join(directory, base);
		if ((await entry(inside, "package.json")) !== undefined) return undefined;
		const index = await firstFile(
			inside,
			RESOLVE_EXTENSIONS.map((extension) => `index${extension}`),
		);
		return index === undefined || index === "uncertain" ? undefined : answer(inside, index.name);
	};
}
