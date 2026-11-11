import type { OnLoadArgs, OnLoadResult, OnResolveArgs, OnResolveResult } from "esbuild";

/**
 * The modules a project's import map sends to the web (a package pinned to esm.sh), brought into a bundle at build
 * time rather than fetched when it runs: what a file that opens with the network off needs (a deck's talk, spool#275).
 * Every module a pinned one imports comes too, by its URL against the one importing it, or by its bare name through the
 * import map again. Whatever the map answers with something other than the web stays an import, for the file's own
 * map to answer.
 */

const NAMESPACE = "spool-remote";
const WEB = /^https?:\/\//i;
const FETCH_MS = 30_000;

/** Why a module the file needs could not be brought into it: names the import as the slide wrote it. */
export class RemoteImportError extends Error {}

/** A bare specifier as an import map resolves it: its own entry, or the longest prefix entry ending in a slash. */
export function mapSpecifier(imports: Readonly<Record<string, string>>, specifier: string): string | undefined {
	const exact = imports[specifier];
	if (exact !== undefined) return exact;
	let best: string | undefined;
	for (const key of Object.keys(imports)) {
		if (key.endsWith("/") && specifier.startsWith(key) && key.length > (best?.length ?? 0)) best = key;
	}
	return best === undefined ? undefined : `${imports[best]}${specifier.slice(best.length)}`;
}

/** The import map's entries that send a specifier to the web, which a file that brings them in leaves out. */
export function isWebImport(target: string): boolean {
	return WEB.test(target);
}

/** What the export's resolver asks of the web: one module's text by its URL. */
export type FetchModule = (url: string) => Promise<string>;

const fetchModule: FetchModule = async (url) => {
	const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS), redirect: "follow" });
	if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
	return response.text();
};

/**
 * The resolver and loader for a bundle bringing the web's modules in. `resolve` answers a specifier the bundle's own
 * resolver does not know, or nothing to leave it to that one.
 */
export function remoteModules(imports: Readonly<Record<string, string>>, read: FetchModule = fetchModule) {
	const texts = new Map<string, Promise<string>>();
	return {
		resolve(
			args: Pick<OnResolveArgs, "path" | "importer" | "namespace" | "pluginData">,
		): OnResolveResult | undefined {
			const from = args.namespace === NAMESPACE ? args.importer : undefined;
			// the import as the slide wrote it, which every module under it is reported by
			const named = (args.pluginData as { specifier?: string } | undefined)?.specifier;
			if (from !== undefined && (args.path.startsWith("/") || args.path.startsWith(".") || isWebImport(args.path)))
				return { path: new URL(args.path, from).href, namespace: NAMESPACE, pluginData: { specifier: named } };
			if (isWebImport(args.path))
				return { path: args.path, namespace: NAMESPACE, pluginData: { specifier: named ?? args.path } };
			const mapped = mapSpecifier(imports, args.path);
			if (mapped === undefined || !isWebImport(mapped)) return undefined;
			return { path: mapped, namespace: NAMESPACE, pluginData: { specifier: named ?? args.path } };
		},
		namespace: NAMESPACE,
		async load(args: Pick<OnLoadArgs, "path" | "pluginData">): Promise<OnLoadResult> {
			const named = (args.pluginData as { specifier?: string } | undefined)?.specifier ?? args.path;
			let text = texts.get(args.path);
			if (text === undefined) {
				text = read(args.path);
				texts.set(args.path, text);
			}
			try {
				return { contents: await text, loader: "js", pluginData: { specifier: named } };
			} catch (error) {
				const why = error instanceof Error ? error.message : String(error);
				throw new RemoteImportError(
					`"${named}" could not be brought into the file from ${args.path} (${why}), so the file would need the network to play`,
				);
			}
		},
	};
}
