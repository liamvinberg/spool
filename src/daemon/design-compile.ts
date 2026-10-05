import type { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import type {
	BuildOptions,
	build,
	context,
	formatMessages,
	ImportKind,
	Loader,
	OnResolveResult,
	Plugin,
	PluginBuild,
} from "esbuild";
import { frameFolder } from "../page-path";
import { ASSET_FILTER, ASSET_MEDIA_TYPES, IMAGE_BUDGET_BYTES, kilobytes, TEXT_LOADERS } from "./assets";
import { DesignBoundaryError, designPathResolver, designRelativePath } from "./design-boundary";
import type { DesignFiles } from "./design-files";
import { createDesignReads, type DesignReads, readDesignBytes } from "./design-reads";
import { type DesignResolution, designResolver, RESOLVE_EXTENSIONS } from "./design-resolve";
import { assembleFrameDocument, mergeImportMap, shimHash } from "./document";
import { inertWebfonts, inlineLocalFonts, type Webfonts } from "./font-faces";
import type { CssSource, StylesheetRunner } from "./tailwind";
import { importMapPins } from "./vendor-pins";

/**
 * The esbuild every compile runs, here and in a Worker: two versions bundle
 * the same sources to different bytes, so esbuild-wasm in a Worker is this
 * version too. The package pins esbuild to it exactly.
 */
export const ESBUILD_VERSION = "0.28.1";

/**
 * Esbuild, as a compile is handed it: the native package in the daemon,
 * esbuild-wasm in a Cloudflare Worker. A compile reads no file through it.
 */
export interface CompileEsbuild {
	build: typeof build;
	context: typeof context;
	formatMessages: typeof formatMessages;
}

/**
 * Everything a compile does its work with. Nothing in a compile reaches past
 * these: it reads the project through `files`, bundles with `esbuild` and has
 * each frame's stylesheet made by `stylesheets`.
 */
export interface CompileHost {
	esbuild: CompileEsbuild;
	files: DesignFiles;
	stylesheets: StylesheetRunner;
}

/** Who a frame document is served to: its project's capability and the canvas's origin. */
export interface FrameAuthority {
	projectCapability: string;
	controlOrigin: string;
}

const STDIN_NAME = "<spool-boot>";
const VIRTUAL_OUTDIR = "<spool-out>";

/** What an import attribute (`with { type: "text" }`) asks a file to load as, or undefined for none. */
function attributedLoader(attributes: Record<string, string>): Loader | undefined {
	const names = Object.keys(attributes);
	if (names.length === 0) return undefined;
	const other = names.find((name) => name !== "type");
	if (other !== undefined) throw new Error(`Importing with the "${other}" attribute is not supported`);
	const loader = ATTRIBUTE_LOADERS[attributes.type as string];
	if (loader === undefined)
		throw new Error(`Importing with a type attribute of "${attributes.type}" is not supported`);
	return loader;
}

/** The import attributes esbuild gives a meaning: a file read as JSON, as text, or as bytes. */
const ATTRIBUTE_LOADERS: Readonly<Record<string, Loader>> = { json: "json", text: "text", bytes: "binary" };

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
	/** The project's files: every import is resolved through them. */
	files: DesignFiles;
	/**
	 * The compile's reads: every file the bundle loads is these bytes, the same
	 * ones its stylesheet scans and its cache key hashes. A getter, because the
	 * player's context outlives the compile that hands them in.
	 */
	reads: () => DesignReads | undefined;
}

/**
 * Esbuild's own loader for each extension it knows without being told, which
 * a plugin handing esbuild a file's bytes has to name itself. Esbuild parses
 * .mts and .cts a shade more strictly than the "ts" the API can name, refusing
 * an old-style `<T>value` cast, which changes nothing a file that compiles
 * compiles to.
 */
const DEFAULT_LOADERS: Record<string, Loader> = {
	".js": "js",
	".mjs": "js",
	".cjs": "js",
	".jsx": "jsx",
	".ts": "ts",
	".mts": "ts",
	".cts": "ts",
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
	const { designDir, resolveDir, sourcefile, contents, label, imageBudget, files, reads } = options;
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
			sharedImportPlugin(designDir, files),
			spoolBoundaryPlugin(designDir, { ...DEFAULT_LOADERS, ...loader }, reads),
			spoolAssetPlugin(designDir, label, imageBudget, options.publication === true, files, reads),
			// last, so the plugins above answer what is theirs first
			designResolvePlugin(designDir, files),
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
export function designInputFile(designDir: string, input: string, files: DesignFiles): string {
	const file = resolve(designDir, input);
	const bare = resolve(designDir, input.replace(/[?#][^/]*$/u, ""));
	return bare === file || files.kind(file) !== undefined ? file : bare;
}

/** A compiled output's served name: its path under the virtual outdir. */
export function designOutputName(designDir: string, path: string): string {
	return relative(join(designDir, VIRTUAL_OUTDIR), path).split(sep).join("/");
}

/** The design/ compile (#16) of one entry into one module: frame documents, and blame. */
export async function buildDesignEntry(esbuild: CompileEsbuild, options: DesignEntryOptions): Promise<DesignBundle> {
	const result = await esbuild.build(designBuildOptions(options));
	const bootKey = designEntryKey(options);
	const sourceFiles = Object.keys(result.metafile.inputs)
		.filter((input) => input !== bootKey)
		.map((input) => designInputFile(options.designDir, input, options.files));
	const bootJs = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
	if (bootJs === undefined) throw new Error(`${options.label} compiled to no module`);
	const bundledCss = result.outputFiles.find((file) => file.path.endsWith(".css"))?.text;
	return { sourceFiles, bootJs, bundledCss };
}

/** One frame's document to compile: the canvas's dialect, stamped for the picker. */
export interface FrameDocumentRequest {
	/** The design folder, absolute: the daemon's real path, or wherever a Worker holds the files. */
	designDir: string;
	/** The frame's name, page path and all: design/frames/<frame>/frame.tsx. */
	frame: string;
	/** The project's name, as the document's title carries it. */
	project: string;
	authority: FrameAuthority;
	/** Spool's version, folded into the input hash. */
	version: string;
	/** Remote faces resolved for stills (#80); fonts.css as written when not given. */
	webfonts?: Webfonts | undefined;
}

/** A compiled frame document and what it was made of. */
export interface CompiledFrameDocument {
	document: string;
	/**
	 * The hash of every input by the digest of the bytes the document was made
	 * of, with the version, the frame and its authority: the same inputs hash
	 * the same wherever they are compiled.
	 */
	hash: string;
	/**
	 * The same inputs hashed for the frame alone, whoever it is compiled for: one
	 * version of the frame, as every machine and the cloud name it. A cover of the
	 * document is filed under it.
	 */
	source: string;
	/** An HTTP ETag for the document: its inputs and webfont revision when settled, its bytes when not. */
	etag: string;
	/** Every file the document was made of, present or not, absolute. */
	inputs: string[];
	/** The webfont revision its fonts were resolved at (#80). */
	fonts: number;
	/** Every input was one state through the compile (see DesignReads); an unsettled document is never cached. */
	settled: boolean;
}

/**
 * Compile one frame into the document the canvas serves for it (#16): its
 * bundle, stylesheet, fonts and import map in one page. A frame that does not
 * compile throws; `describeCompileError` says why in esbuild's words.
 */
export async function compileFrameDocument(
	host: CompileHost,
	{ designDir, frame, project, authority, version, webfonts = inertWebfonts() }: FrameDocumentRequest,
): Promise<CompiledFrameDocument> {
	const reads = createDesignReads(designDir, host.files);
	const { sourceFiles, bootJs, bundledCss } = await buildDesignEntry(host.esbuild, {
		designDir,
		resolveDir: join(designDir, frameFolder(frame)),
		sourcefile: STDIN_NAME,
		contents: bootEntry(frame),
		label: `frame "${frame}"`,
		imageBudget: IMAGE_BUDGET_BYTES,
		files: host.files,
		reads: () => reads,
	});

	const shared = join(designDir, "shared");
	const { css, stylesheets } = await host.stylesheets(designDir, cssSources(reads, sourceFiles));
	for (const sheet of stylesheets) reads.noted(sheet.file, sheet.digest);
	// The stills' fonts (#80): remote faces resolved to this daemon so a
	// capture can inline them, the file as written whenever that fails. The
	// project's own faces (#101) then ride the document as data URIs.
	const resolvedFonts = await webfonts.resolve(reads.text(join(shared, "fonts.css")));
	// The revision these fonts were resolved at, read before anything else is
	// awaited: another compile's resolve can move it while this one hashes, and
	// recording that later revision would keep these fonts past their retirement.
	const fontsRevision = webfonts.revision();
	const { css: fonts } = inlineLocalFonts(
		designDir,
		resolvedFonts,
		reads.bytes,
		designPathResolver(designDir, host.files),
	);
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
	const stamp = frameStamp(frame, authority);
	const hash = inputsHash(version, stamp, designDir, digests);
	// A document a file moved under while it compiled is of no one state of the
	// folder: it is named by its own bytes, never cached, and the next request
	// compiles again. A settled one is named by its inputs and the webfont
	// revision it was built at, which changes its fonts with its inputs untouched
	// (#80): without it a browser would revalidate yesterday's fonts as current.
	const etag = settled
		? createHash("sha256").update(`${hash}\0${fontsRevision}`).digest("hex")
		: createHash("sha256").update(document).digest("hex");
	return {
		document,
		hash,
		source: inputsHash(version, frame, designDir, digests),
		etag: `"${etag.slice(0, 32)}"`,
		inputs: [...digests.keys()],
		fonts: fontsRevision,
		settled,
	};
}

/** What a frame document is compiled for, besides its files: the frame and its authority. */
export function frameStamp(frame: string, authority: FrameAuthority): string {
	return `${frame}\0${authority.projectCapability}\0${authority.controlOrigin}`;
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
 * and claims only the `shared/` prefix — before it would count as a package,
 * handed to the import map where no URL answers it. It resolves as
 * `./shared/<rest>` from design/ does, and every other rule still holds: the
 * boundary plugin loads the file, an asset still inlines, and a url() token
 * still gets the asset plugin's refusal in spool's words.
 */
function sharedImportPlugin(designDir: string, files: DesignFiles): Plugin {
	return {
		name: "spool-shared",
		setup(build) {
			const resolveShared = resolvingEachPass(build, designDir, files);
			build.onResolve({ filter: /^shared\// }, (args) =>
				resolveShared(args.path, `./${args.path}`, designDir, args.kind),
			);
		},
	};
}

/**
 * Every import no plugin above claimed, resolved through the project's files
 * (`design-resolve.ts`), so esbuild never looks for a file itself: what a
 * frame imports is the same file on the daemon's disk and in a Worker.
 */
function designResolvePlugin(designDir: string, files: DesignFiles): Plugin {
	return {
		name: "spool-resolve",
		setup(build) {
			const resolveImport = resolvingEachPass(build, designDir, files);
			build.onResolve({ filter: /.*/ }, (args) => resolveImport(args.path, args.path, args.resolveDir, args.kind));
		},
	};
}

/**
 * A plugin's resolve through `designResolver`, made afresh for every pass: the
 * player's context rebuilds, and every rebuild must see the folders as they are.
 */
function resolvingEachPass(
	build: PluginBuild,
	designDir: string,
	files: DesignFiles,
): (specifier: string, path: string, resolveDir: string, kind: ImportKind) => OnResolveResult | undefined {
	let resolveImport = designResolver(designDir, files);
	build.onStart(() => {
		resolveImport = designResolver(designDir, files);
	});
	return (specifier, path, resolveDir, kind) => {
		let resolved: DesignResolution;
		try {
			resolved = resolveImport(path, resolveDir, kind);
		} catch (error) {
			// the same refusal the boundary plugin makes where a file loads
			return { errors: [{ text: errorText(error), detail: error }] };
		}
		if (resolved === undefined) return undefined;
		if ("external" in resolved) return { path: specifier, external: true };
		if ("missing" in resolved) return { errors: [{ text: `Could not resolve "${specifier}"` }] };
		return { path: resolved.file, suffix: resolved.suffix };
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
	readsOf: () => DesignReads | undefined,
): Plugin {
	const uiDir = join(designDir, "shared", "ui") + sep;
	return {
		name: "spool-boundary",
		setup(build) {
			// One resolver per build, never per plugin: the player holds its context
			// across rebuilds, and every rebuild must see the folders as they are.
			// Every file loads from the compile's own reads, the same bytes its
			// stylesheet scans and its cache key hashes: esbuild reads nothing itself.
			build.onLoad({ filter: /.*/ }, (args) => {
				try {
					const reads = readsOf();
					if (reads === undefined) throw new Error(`nothing to read ${args.path} from`);
					// an asset is the asset plugin's to read
					if (ASSET_FILTER.test(args.path)) return null;
					const loader = attributedLoader(args.with) ?? loaderOf(args.path, loaders);
					if (loader === undefined) {
						const relative = designRelativePath(designDir, args.path);
						return {
							errors: [{ text: `No loader is configured for "${extname(args.path)}" files: ${relative}` }],
						};
					}
					const contents = reads.bytes(args.path);
					if (contents === undefined) {
						return {
							errors: [{ text: `Could not read from file: ${designRelativePath(designDir, args.path)}` }],
						};
					}
					return { contents, loader };
				} catch (error) {
					// The cause rides along in detail, which esbuild hands back to the JS
					// API and never prints. Reading outside design/ is not an authoring
					// mistake one frame can be left holding, and callers need to tell it
					// apart from this plugin's other, ordinary complaint.
					return { errors: [{ text: errorText(error), detail: error }] };
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
	files: DesignFiles,
	readsOf: () => DesignReads | undefined,
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
				let bytes: Buffer | undefined;
				try {
					bytes =
						readsOf()?.bytes(args.path) ??
						readDesignBytes(designPathResolver(designDir, files), args.path, files);
				} catch (error) {
					// Same shape as the boundary plugin's own complaint, so a caller
					// that must refuse the whole player still recognizes an escape.
					return { errors: [{ text: errorText(error), detail: error }] };
				}
				// a file gone since it resolved
				if (bytes === undefined) {
					return { errors: [{ text: `Could not read from file: ${designRelativePath(designDir, args.path)}` }] };
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
 * The cache key over a document's inputs, each by the digest of its bytes and
 * named by its path in design/, so the same inputs hash the same wherever the
 * folder sits.
 */
export function inputsHash(
	version: string,
	stamp: string,
	designDir: string,
	digests: ReadonlyMap<string, string>,
): string {
	const files = [...digests]
		.map(([file, digest]) => [designRelativePath(designDir, file), digest] as const)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return createHash("sha256")
		.update(JSON.stringify([version, shimHash(), stamp, files]))
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

/** A failed compile in esbuild's words: each error with its file, line and the code it points at. */
export async function describeCompileError(esbuild: CompileEsbuild, error: unknown): Promise<string> {
	if (typeof error === "object" && error !== null && "errors" in error && Array.isArray(error.errors)) {
		return (await esbuild.formatMessages(error.errors, { kind: "error" })).join("\n");
	}
	return errorText(error);
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
