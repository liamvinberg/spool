/** One chunk of the browser build's manifest (`dist/viewer/manifest.json`), as far as a page that loads it reads. */
interface Chunk {
	file: string;
	css?: string[];
	imports?: string[];
}

/**
 * What a page serving one of the browser build's entries (`index.html`, `home.html`) links: the entry's script, and
 * every stylesheet of the chunks it imports, since the entries share theirs.
 */
export function buildEntry(manifest: Record<string, Chunk>, key: string): { file: string; css: string[] } {
	const entry = manifest[key];
	if (entry === undefined) throw new Error(`the browser build has no ${key}`);
	const css = new Set<string>();
	const seen = new Set<string>();
	const walk = (chunk: Chunk) => {
		for (const each of chunk.imports ?? []) {
			const imported = manifest[each];
			if (imported === undefined || seen.has(each)) continue;
			seen.add(each);
			walk(imported);
		}
		for (const sheet of chunk.css ?? []) css.add(sheet);
	};
	walk(entry);
	return { file: entry.file, css: [...css] };
}
