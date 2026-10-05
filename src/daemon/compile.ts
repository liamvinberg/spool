import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { type BuildOptions, build, formatMessagesSync, type Loader, type Plugin } from "esbuild";
import { isFramePath } from "../page-path";
import { ASSET_FILTER, ASSET_MEDIA_TYPES, IMAGE_BUDGET_BYTES, kilobytes, TEXT_LOADERS } from "./assets";
import {
	DesignBoundaryError,
	designPathResolver,
	designRelativePath,
	realDesignDir,
	resolveDesignPath,
} from "./design-path";
import { contentDigest, createDesignReads, type DesignReads, readDesignBytes } from "./design-reads";
import { assembleFrameDocument, errorDocument, mergeImportMap, shimHash } from "./document";
import { describeMissingFrame, frameFolder, hasFrameEntry, lookupFrame } from "./projection";
import { RESOLVE_EXTENSIONS, sharedImportResolver } from "./shared-import";
import { type CssSource, compileFrameCssOnWorker } from "./tailwind";
import { importMapPins } from "./vendor";
import { inertWebfonts, inlineLocalFonts, type Webfonts } from "./webfonts";

export type FrameDocument =
	| { kind: "ok"; document: string; etag: string; cache: "hit" | "miss" }
	| { kind: "error"; document: string; message: string }
	| { kind: "missing"; message: string };

export interface FrameAuthority {
	projectCapability: string;
	controlOrigin: string;
}

interface CacheEntry {
	/** Every file the document was built from: the bundle closure plus the shared baseline. */
	inputs: string[];
	hash: string;
	etag: string;
	document: string;
	/** The webfont resolution this document was assembled from (#80). */
	fonts: number;
	/** Every input was one state through the compile (see DesignReads), so the document is of what its hash is of. */
	settled: boolean;
}

const STDIN_NAME = "<spool-boot>";
const VIRTUAL_OUTDIR = "<spool-out>";

/**
 * Compiles frames/<name>/frame.tsx into its served document, content-hash
 * cached: a request rehashes the previous compile's input files and reuses the
 * document byte-for-byte when nothing changed. Compile failures are never
 * cached — a broken frame recompiles per request and recovers instantly.
 */
export function createFrameCompiler(version: string, webfonts: Webfonts = inertWebfonts()) {
	const cache = new Map<string, CacheEntry>();

	async function getDocument(root: string, frame: string, authority: FrameAuthority): Promise<FrameDocument> {
		if (!isFramePath(frame)) return { kind: "missing", message: `not a frame name: "${frame}"` };
		const lookup = lookupFrame(root, frame);
		if (lookup.kind === "missing") {
			return { kind: "missing", message: describeMissingFrame(frame) };
		}
		const frameDir = lookup.dir;
		const designDir = realDesignDir(root);
		// the raw entry read, not the projection's memory of it
		if (!hasFrameEntry(frameDir, designDir)) {
			// discovery saw an entry here and the raw read no longer does: the folder
			// is known, so name it exactly, page segment and all
			return {
				kind: "missing",
				message: `no frame "${frame}" — expected design/${frameFolder(frame)}/frame.tsx`,
			};
		}

		const stamp = `${frame}\0${authority.projectCapability}\0${authority.controlOrigin}`;
		const key = `${root}\0${stamp}`;
		// What this request found. A miss answers only for that: another miss
		// overlapping it may have cached a newer document meanwhile, which this one
		// must neither cover with its own nor clear on its failure.
		const cached = cache.get(key);
		try {
			// One canonical root owns the entry, every resolved import, stylesheets,
			// direct shared reads, and cache revalidation for this document.
			// A machine that comes back online resolves webfonts it could not reach
			// before, and the revision it was built at retires it (#80) — read after
			// the compile, because the compile is what moves it.
			if (
				cached !== undefined &&
				cached.fonts === webfonts.revision() &&
				(await hashInputs(version, stamp, cached.inputs, designDir)) === cached.hash &&
				// again after the hash, which hands the loop back: a resolve that landed
				// meanwhile retires this document as surely as one before it
				cached.fonts === webfonts.revision()
			) {
				return { kind: "ok", document: cached.document, etag: cached.etag, cache: "hit" };
			}
			const entry = await compileFrame({
				version,
				project: basename(root),
				designDir,
				frameDir,
				frame,
				authority,
				stamp,
				webfonts,
			});
			if (cache.get(key) === cached) {
				if (entry.settled) cache.set(key, entry);
				else cache.delete(key);
			}
			return { kind: "ok", document: entry.document, etag: entry.etag, cache: "miss" };
		} catch (error) {
			if (cache.get(key) === cached) cache.delete(key);
			const message = describeCompileError(error);
			return { kind: "error", document: errorDocument(frame, message), message };
		}
	}

	/**
	 * Drop one frame's compiled document, whatever authority it was built for.
	 * The next request compiles it again, at a compile's cost and nothing more:
	 * the cache is an accelerator, never the truth.
	 */
	function forget(root: string, frame: string): void {
		const prefix = `${root}\0${frame}\0`;
		for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
	}

	return { getDocument, forget };
}

export type FrameCompiler = ReturnType<typeof createFrameCompiler>;

export interface DesignBundle {
	/** Every design/ file in the bundle closure, absolute — they are cache inputs. */
	sourceFiles: string[];
	bootJs: string;
	/** Extra stylesheet emitted by plain .css imports, when any. */
	bundledCss?: string | undefined;
}

export interface DesignEntryOptions {
	publication?: true;
	designDir: string;
	/** Where the entry's relative imports resolve from. */
	resolveDir: string;
	sourcefile: string;
	contents: string;
	/** Names the compilation in errors: `frame "inbox"`, `the player`. */
	label: string;
	/**
	 * How much inlined image this one document may carry (#101). A frame passes
	 * its budget; the player composition passes none, because it is one document
	 * loaded once rather than the page full of them the budget guards against —
	 * and a composition that died on the sum of frames that each fit their own
	 * document is the exact whole-player failure `composePlayer` exists to stop.
	 */
	imageBudget?: number | undefined;
	/**
	 * The compile's own reads, when this bundle is one part of a document whose
	 * cache key must hash exactly the bytes it was made of: esbuild is handed
	 * those bytes instead of reading each file for itself. A getter, because the
	 * player's context outlives the compile that hands them in.
	 */
	reads?: () => DesignReads | undefined;
}

/**
 * Esbuild's own loader for each extension it knows without being told, which
 * a plugin handing esbuild a file's bytes has to name itself. .mts and .cts
 * are left out on purpose: esbuild parses those more strictly than the "ts"
 * the API can ask for, so it reads them for itself (see DesignReads.readTwice).
 */
const DEFAULT_LOADERS: Record<string, Loader> = {
	".js": "js",
	".mjs": "js",
	".cjs": "js",
	".jsx": "jsx",
	".ts": "ts",
	".tsx": "tsx",
	".css": "css",
	".module.css": "local-css",
	".json": "json",
	".txt": "text",
};

/**
 * Core's own TypeScript settings for every frame: esbuild's defaults, which is
 * what a frame compiled to with no tsconfig.json anywhere above it. Esbuild
 * otherwise obeys the nearest tsconfig.json above each file, inside design/ or
 * out of it, and a repo's own settings (`verbatimModuleSyntax`, decorators,
 * `paths`) changed what its frames compiled to. The cloud is handed design/
 * alone, so a frame compiles to the same bytes there only if nothing outside
 * design/ has a say.
 */
const PINNED_TSCONFIG = { compilerOptions: {} };

/** The loader esbuild would choose for a path: its longest known extension. */
function loaderOf(path: string, loaders: Readonly<Record<string, Loader>>): Loader | undefined {
	const name = basename(path);
	for (let at = name.indexOf("."); at !== -1; at = name.indexOf(".", at + 1)) {
		const loader = loaders[name.slice(at)];
		if (loader !== undefined) return loader;
	}
	return undefined;
}

/**
 * The one design/ compile (#16), as esbuild options: stamping JSX, the
 * shared/ui boundary, packages external to the import map. jsxDev routes
 * element creation through spool's stamping runtime (#23) — every intrinsic
 * element carries its exact source location for the picker, while React
 * itself stays the pinned production build. A frame document builds these
 * once; the player keeps them in a context and rebuilds incrementally.
 */
export function designBuildOptions(options: DesignEntryOptions): BuildOptions & { metafile: true; write: false } {
	const { designDir, resolveDir, sourcefile, contents, label, imageBudget, reads } = options;
	const loader: Record<string, Loader> =
		options.publication === true
			? { ...TEXT_LOADERS, ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl", ".otf": "dataurl" }
			: TEXT_LOADERS;
	return {
		stdin: { contents, resolveDir, loader: "js", sourcefile },
		bundle: true,
		format: "esm",
		platform: "browser",
		target: "es2022",
		jsx: "automatic",
		jsxDev: options.publication !== true,
		jsxImportSource: options.publication === true ? "react" : "spool",
		...(options.publication === true ? { minify: true, legalComments: "none" as const } : {}),
		loader,
		tsconfigRaw: PINNED_TSCONFIG,
		// the order the shared/ plugin answers in too: one list, so the two never drift
		resolveExtensions: [...RESOLVE_EXTENSIONS],
		packages: "external",
		define: { "process.env.NODE_ENV": '"production"' },
		metafile: true,
		write: false,
		outdir: VIRTUAL_OUTDIR,
		absWorkingDir: designDir,
		plugins: [
			sharedImportPlugin(designDir),
			spoolBoundaryPlugin(designDir, { ...DEFAULT_LOADERS, ...loader }, reads),
			spoolAssetPlugin(designDir, label, imageBudget, options.publication === true, reads),
		],
		logLevel: "silent",
	};
}

/** The esbuild input key of a stdin entry, as `metafile.inputs` spells it. */
export function designEntryKey(options: Pick<DesignEntryOptions, "designDir" | "resolveDir" | "sourcefile">): string {
	// esbuild keys the stdin entry by its sourcefile resolved against resolveDir
	// and written relative to absWorkingDir, so a frame's entry lands under its
	// own folder and never as the bare name passed in. Comparing to the bare name
	// only ever matched when resolveDir was designDir, which left every frame's
	// closure carrying a path no file answers to (#124).
	return relative(options.designDir, resolve(options.resolveDir, options.sourcefile));
}

/**
 * The file behind one `metafile.inputs` key. esbuild drops a `?raw` or `#hash`
 * suffix to find a file no name carries, but keeps it on the key; a reader of
 * the key (the cache hash, the publication capture) wants the file.
 */
export function designInputFile(designDir: string, input: string): string {
	const file = resolve(designDir, input);
	const bare = resolve(designDir, input.replace(/[?#][^/]*$/u, ""));
	return bare === file || existsSync(file) ? file : bare;
}

/** A compiled output's served name: its path under the virtual outdir. */
export function designOutputName(designDir: string, path: string): string {
	return relative(join(designDir, VIRTUAL_OUTDIR), path).split(sep).join("/");
}

/** The design/ compile (#16) of one entry into one module: frame documents, and blame. */
export async function buildDesignEntry(options: DesignEntryOptions): Promise<DesignBundle> {
	const result = await build(designBuildOptions(options));
	const bootKey = designEntryKey(options);
	const sourceFiles = Object.keys(result.metafile.inputs)
		.filter((input) => input !== bootKey)
		.map((input) => designInputFile(options.designDir, input));
	const bootJs = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
	if (bootJs === undefined) throw new Error(`${options.label} compiled to no module`);
	const bundledCss = result.outputFiles.find((file) => file.path.endsWith(".css"))?.text;
	return { sourceFiles, bootJs, bundledCss };
}

interface FrameCompile {
	version: string;
	project: string;
	designDir: string;
	frameDir: string;
	frame: string;
	authority: FrameAuthority;
	stamp: string;
	webfonts: Webfonts;
}

async function compileFrame({
	version,
	project,
	designDir,
	frameDir,
	frame,
	authority,
	stamp,
	webfonts,
}: FrameCompile): Promise<CacheEntry> {
	const reads = createDesignReads(designDir);
	const { sourceFiles, bootJs, bundledCss } = await buildDesignEntry({
		designDir,
		resolveDir: frameDir,
		sourcefile: STDIN_NAME,
		contents: bootEntry(frame),
		label: `frame "${frame}"`,
		imageBudget: IMAGE_BUDGET_BYTES,
		reads: () => reads,
	});

	const shared = join(designDir, "shared");
	const { css, stylesheets } = await compileFrameCssOnWorker(designDir, cssSources(reads, sourceFiles));
	for (const sheet of stylesheets) reads.noted(sheet.file, sheet.digest);
	// The stills' fonts (#80): remote faces resolved to this daemon so a
	// capture can inline them, the file as written whenever that fails. The
	// project's own faces (#101) then ride the document as data URIs.
	const resolvedFonts = await webfonts.resolve(reads.text(join(shared, "fonts.css")));
	// The revision these fonts were resolved at, read before anything else is
	// awaited: another compile's resolve can move it while this one hashes, and
	// recording that later revision would keep these fonts past their retirement.
	const fontsRevision = webfonts.revision();
	const { css: fonts } = inlineLocalFonts(designDir, resolvedFonts, reads.bytes);
	const importMap = mergeImportMap(parseImportMap(reads.text(join(shared, "importmap.json"))), importMapPins());

	const document = assembleFrameDocument({
		project,
		frame,
		projectCapability: authority.projectCapability,
		controlOrigin: authority.controlOrigin,
		css,
		importMap,
		bootJs,
		fonts,
		bundledCss,
	});
	// Every input, present or not, by the digest of the very bytes the document
	// was made of: the bundle's, the stylesheet's, the fonts' and the import map's.
	const settled = reads.settled();
	const digests = reads.digests();
	const hash = inputsHash(version, stamp, digests);
	// A document a file moved under while it compiled is of no one state of the
	// folder: it is named by its own bytes, never cached, and the next request
	// compiles again. A settled one is named by its inputs and the webfont
	// revision it was built at, which changes its fonts with its inputs untouched
	// (#80): without it a browser would revalidate yesterday's fonts as current.
	const etag = settled
		? createHash("sha256").update(`${hash}\0${fontsRevision}`).digest("hex")
		: createHash("sha256").update(document).digest("hex");
	return {
		inputs: [...digests.keys()],
		hash,
		etag: `"${etag.slice(0, 32)}"`,
		document,
		fonts: fontsRevision,
		settled,
	};
}

/**
 * A bundle's source closure as Tailwind scans it: the bytes the bundle was made
 * of, each file in a buffer of its own. A small read shares a pooled slab with
 * others, and handing a worker the view would copy the whole slab.
 */
export function cssSources(reads: DesignReads, files: string[]): CssSource[] {
	return files.flatMap((file) => {
		const bytes = reads.bytes(file);
		return bytes === undefined ? [] : [{ file, bytes: new Uint8Array(bytes) }];
	});
}

/**
 * The loaded report rides a commit-time effect (#17): Chrome pauses rAF
 * entirely in offscreen iframes, and offscreen frames must still report —
 * an effect fires after the first committed render regardless of visibility.
 *
 * "spool" is imported for its side effects in every document — data-go works
 * in frames that never import it — and its top-level await holds the first
 * render until the session is seeded.
 */
function bootEntry(frame: string): string {
	return `import "spool";
import { createElement, Fragment, useEffect } from "react";
import { createRoot } from "react-dom/client";
import Frame from "./frame.tsx";
const FRAME = ${JSON.stringify(frame)};
function report(spool, detail) {
	if (parent !== window) parent.postMessage({ spool, frame: FRAME, ...detail }, "*");
}
addEventListener("error", (event) => report("error", { error: String(event.error ?? event.message) }));
addEventListener("unhandledrejection", (event) => report("error", { error: String(event.reason) }));
function Ready() {
	useEffect(() => report("loaded", {}), []);
	return null;
}
createRoot(document.getElementById("root")).render(
	createElement(Fragment, null, createElement(Frame), createElement(Ready)),
);
`;
}

/**
 * shared/ by its design-relative name (#273): `import { cn } from
 * "shared/lib/utils"` resolves against design/ from any importer at any depth,
 * so moving a frame's folder never breaks the import. This plugin runs first
 * and claims only the `shared/` prefix — before `packages: "external"` would
 * hand the bare specifier to the import map, where no URL answers it. The
 * re-entrant resolve keeps every other rule: the boundary plugin still loads
 * the file, an asset still inlines, and a url() token still gets the asset
 * plugin's refusal in spool's words.
 *
 * Most imports never take that re-entrant resolve: one esbuild would answer
 * with a plain file is answered from the folders instead, the same file under
 * the same path, because the resolve is slow (`shared-import.ts` says why).
 */
function sharedImportPlugin(designDir: string): Plugin {
	return {
		name: "spool-shared",
		setup(build) {
			// one per build, as the boundary plugin's resolver is: the player's
			// context rebuilds, and every rebuild must see the folders as they are
			let resolveShared = sharedImportResolver(designDir);
			build.onStart(() => {
				resolveShared = sharedImportResolver(designDir);
			});
			build.onResolve({ filter: /^shared\// }, async (args) => {
				const path = await resolveShared(args.path, args.kind);
				if (path !== undefined) return { path };
				return build.resolve(`./${args.path}`, { resolveDir: designDir, kind: args.kind, importer: args.importer });
			});
		},
	};
}

/**
 * The load-bearing boundary (#16), enforced where it is visible: shared/ui/
 * components have feel, never knowledge — an import of "spool" there fails
 * the compile. For every other importer "spool" stays external and resolves
 * through the import map pin.
 */
function spoolBoundaryPlugin(
	designDir: string,
	loaders: Readonly<Record<string, Loader>>,
	readsOf: (() => DesignReads | undefined) | undefined,
): Plugin {
	const uiDir = join(designDir, "shared", "ui") + sep;
	return {
		name: "spool-boundary",
		setup(build) {
			// One resolver per build, never per plugin: the player holds its context
			// across rebuilds, and every rebuild must see the folders as they are.
			let resolvePath = designPathResolver(designDir);
			build.onStart(() => {
				resolvePath = designPathResolver(designDir);
			});
			// Esbuild resolves extensions and symlinks before loading. This makes the
			// boundary cover every local module format without reimplementing its
			// resolver or accidentally treating packages as project source.
			build.onLoad({ filter: /.*/ }, (args) => {
				try {
					const reads = readsOf?.();
					// an asset is the asset plugin's to read
					if (reads === undefined || ASSET_FILTER.test(args.path)) {
						resolvePath(args.path);
						return null;
					}
					// The compile's own bytes, the same ones its stylesheet scans and
					// its cache key hashes. What esbuild must read for itself is read
					// again when the compile is judged: a kind with no loader to name,
					// an import with attributes (`with { type: "text" }`), whose meaning
					// esbuild gives only to a file it reads, and a file that read as
					// absent here.
					const loader = loaderOf(args.path, loaders);
					const contents =
						loader === undefined || Object.keys(args.with).length > 0 ? undefined : reads.bytes(args.path);
					if (loader === undefined || contents === undefined) {
						reads.readTwice(args.path);
						return null;
					}
					return { contents, loader };
				} catch (error) {
					// The cause rides along in detail, which esbuild hands back to the JS
					// API and never prints. Reading outside design/ is not an authoring
					// mistake one frame can be left holding, and callers need to tell it
					// apart from this plugin's other, ordinary complaint.
					return { errors: [{ text: describeCompileError(error), detail: error }] };
				}
			});
			build.onResolve({ filter: /^spool(\/|$)/ }, (args) => {
				// the stamping runtime is compiler-injected, not knowledge — the
				// boundary judges what a component's author wrote, not the toolchain
				if (args.path === "spool/jsx-dev-runtime") return { path: args.path, external: true };
				if (args.importer.startsWith(uiDir)) {
					const importer = relative(designDir, args.importer);
					return {
						errors: [
							{
								text: `${importer} imports "spool" — shared/ui components take props, never knowledge. Move flow and state up into the frame.`,
							},
						],
					};
				}
				return { path: args.path, external: true };
			});
		},
	};
}

/**
 * Project assets, carried in the document rather than served (#101). There is
 * no asset route and no asset URL: an import becomes a `data:` URI right here,
 * which means an asset has no authority surface at all — the boundary plugin
 * has already held everything esbuild resolves to design/, symlinks and all —
 * and it lands in `metafile.inputs`, so it is a cache input, an ETag
 * ingredient, and a file the watcher already narrows on.
 *
 * Every kind is forced to base64. Esbuild's own `dataurl` loader percent-encodes
 * SVG, and both copies of the capture allowlist require `;base64,`; forcing the
 * encoding keeps those predicates as tight as they are instead of teaching them
 * a looser shape.
 */
function spoolAssetPlugin(
	designDir: string,
	label: string,
	budget: number | undefined,
	publication: boolean,
	readsOf: (() => DesignReads | undefined) | undefined,
): Plugin {
	let spent = 0;
	return {
		name: "spool-assets",
		setup(build) {
			// A stylesheet's url() is the one reference esbuild cannot be handed a
			// forced-base64 answer for, and a document-carried asset has no URL to
			// give it. Say so in the project's own words rather than leaving
			// esbuild to explain spool's loader choice. Remote and root-absolute
			// URLs stay the author's business and pass straight through.
			build.onResolve({ filter: ASSET_FILTER }, (args) => {
				const local = !args.path.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(args.path);
				if (args.kind !== "url-token" || !local || publication) return null;
				return {
					errors: [
						{
							text: `url(${args.path}) reaches a project asset — an asset is imported, not referenced: import it in the frame and pass the value through a style prop`,
						},
					],
				};
			});
			build.onLoad({ filter: ASSET_FILTER }, (args) => {
				const type = ASSET_MEDIA_TYPES[extname(args.path).toLowerCase()];
				if (type === undefined) return null;
				let bytes: Buffer;
				try {
					// the compile's own bytes when it keeps them; a file gone since it
					// resolved is read here to fail in esbuild's usual words
					bytes = readsOf?.()?.bytes(args.path) ?? readFileSync(resolveDesignPath(designDir, args.path));
				} catch (error) {
					// Same shape as the boundary plugin's own complaint, so a caller
					// that must refuse the whole player still recognizes an escape.
					return { errors: [{ text: describeCompileError(error), detail: error }] };
				}
				if (publication) return { contents: bytes, loader: "dataurl" };
				const url = `data:${type};base64,${bytes.toString("base64")}`;
				spent += url.length;
				if (budget !== undefined && spent > budget) {
					const file = designRelativePath(designDir, args.path);
					return {
						errors: [
							{
								text: `design/${file} (${kilobytes(url.length)} inlined) puts ${label} over its ${kilobytes(budget)} image budget`,
							},
						],
					};
				}
				return { contents: `export default ${JSON.stringify(url)};\n`, loader: "js" };
			});
		},
	};
}

/**
 * How long hashing a document's inputs holds the event loop before handing it
 * back. Every input is read, its path checked against design/, and hashed, on
 * a miss and on every hit; a frame on a large canvas has a hundred inputs or
 * more and the player has every frame's. In one piece that was the longest
 * stretch of a compile left on the daemon's event loop once stylesheets moved to
 * their workers.
 */
const HASH_SLICE_MS = 2;

/** A cached document's inputs as they are on disk now, hashed as the compile hashed what it read. */
export async function hashInputs(version: string, frame: string, inputs: string[], designDir: string): Promise<string> {
	const digests = new Map<string, string>();
	const resolvePath = designPathResolver(designDir);
	let slice = performance.now();
	for (const file of inputs) {
		digests.set(file, contentDigest(readDesignBytes(resolvePath, file)));
		if (performance.now() - slice >= HASH_SLICE_MS) {
			await yieldTurn();
			slice = performance.now();
		}
	}
	return inputsHash(version, frame, digests);
}

/** The cache key over a document's inputs, each by the digest of its bytes. */
export function inputsHash(version: string, frame: string, digests: ReadonlyMap<string, string>): string {
	const files = [...digests].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return createHash("sha256")
		.update(JSON.stringify([version, shimHash, frame, files]))
		.digest("hex");
}

export function parseImportMap(raw: string | undefined): unknown {
	if (raw === undefined) return undefined;
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw new Error(`shared/importmap.json: ${(error as Error).message}`);
	}
}

/**
 * True when a build failed because something reached outside design/. The one
 * compile failure that is a filesystem boundary rather than bad authoring, so the
 * one the player must refuse whole instead of pinning on a single frame.
 */
export function isDesignBoundaryFailure(error: unknown): boolean {
	if (error instanceof DesignBoundaryError) return true;
	if (typeof error !== "object" || error === null || !("errors" in error) || !Array.isArray(error.errors)) {
		return false;
	}
	return error.errors.some(
		(message: unknown) =>
			typeof message === "object" &&
			message !== null &&
			"detail" in message &&
			(message as { detail: unknown }).detail instanceof DesignBoundaryError,
	);
}

export function describeCompileError(error: unknown): string {
	if (typeof error === "object" && error !== null && "errors" in error && Array.isArray(error.errors)) {
		return formatMessagesSync(error.errors, { kind: "error" }).join("\n");
	}
	return error instanceof Error ? error.message : String(error);
}
