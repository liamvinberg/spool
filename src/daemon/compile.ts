import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { type BuildOptions, build, formatMessagesSync, type OnResolveResult, type Plugin } from "esbuild";
import { isSafeName } from "../page-path";
import { ASSET_FILTER, ASSET_MEDIA_TYPES, IMAGE_BUDGET_BYTES, kilobytes, TEXT_LOADERS } from "./assets";
import {
	assertDesignFile,
	DesignBoundaryError,
	designRelativePath,
	realDesignDir,
	resolveDesignPath,
} from "./design-path";
import { assembleFrameDocument, errorDocument, mergeImportMap, shimHash } from "./document";
import { describeCollision, describeMissingFrame, frameFolder, hasFrameEntry, lookupFrame } from "./projection";
import {
	digest,
	directoryEntries,
	emptyCompilation,
	type RetainedCompilation,
	readInput,
	retainedPlugin,
	type SourceInput,
	sameInput,
} from "./retained-compile";
import { captureLazyGraph } from "./source-lazy-graph";
import { buildFrameCss } from "./tailwind";
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
	retained: RetainedCompilation;
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
	const publications = new Map<string, { root: string; frame: string; compilation: RetainedCompilation }>();

	async function getDocument(root: string, frame: string, authority: FrameAuthority): Promise<FrameDocument> {
		if (!isSafeName(frame)) return { kind: "missing", message: `not a frame name: "${frame}"` };
		const lookup = lookupFrame(root, frame);
		if (lookup.kind === "collision") {
			// an ambiguous name serves nobody — fail loud, name both locations (#39)
			const message = describeCollision(frame, lookup.paths);
			return { kind: "error", document: errorDocument(frame, message), message };
		}
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
				message: `no frame "${frame}" — expected design/${frameFolder(frame, lookup.page)}/frame.tsx`,
			};
		}

		const stamp = `${frame}\0${authority.projectCapability}\0${authority.controlOrigin}`;
		const key = `${root}\0${stamp}`;
		try {
			// One canonical root owns the entry, every resolved import, stylesheets,
			// direct shared reads, and cache revalidation for this document.
			// A machine that comes back online resolves webfonts it could not reach
			// before, and the revision it was built at retires it (#80) — read after
			// the compile, because the compile is what moves it.
			const cached = cache.get(key);
			if (
				cached !== undefined &&
				cached.fonts === webfonts.revision() &&
				[...cached.retained.directories].every(([path, entries]) => directoryEntries(path) === entries) &&
				[...cached.retained.configuration].every(
					([file, input]) => existsSync(file) && sameInput(input, readInput(file)),
				) &&
				[...cached.retained.configurationAbsent].every((file) => !existsSync(file)) &&
				hashInputs(version, stamp, cached.inputs, designDir) === cached.hash
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
			cache.set(key, entry);
			publications.set(entry.retained.packet.id, { root, frame, compilation: entry.retained });
			return { kind: "ok", document: entry.document, etag: entry.etag, cache: "miss" };
		} catch (error) {
			cache.delete(key);
			const message = describeCompileError(error);
			return { kind: "error", document: errorDocument(frame, message), message };
		}
	}

	/** Compile captured bytes without publishing them or asserting that they are current. */
	async function compileSnapshot(
		root: string,
		frame: string,
		frozen: ReadonlyMap<string, SourceInput>,
		sequence: number,
		absent: ReadonlySet<string> = new Set(),
		resolution?: Pick<RetainedCompilation, "directories" | "resolutions" | "configuration" | "configurationAbsent">,
	): Promise<RetainedCompilation> {
		const found = lookupFrame(root, frame);
		if (found.kind !== "found") throw new Error("the frame source is no longer there");
		const designDir = realDesignDir(root);
		const retained = emptyCompilation();
		if (resolution) {
			retained.configuration = new Map(resolution.configuration);
			retained.configurationAbsent = new Set(resolution.configurationAbsent);
		}
		const built = await buildDesignEntry({
			designDir,
			resolveDir: found.dir,
			sourcefile: STDIN_NAME,
			contents: bootEntry(frame),
			label: `frame "${frame}"`,
			retained,
			frozen,
			resolutions: resolution?.resolutions,
		});
		for (const file of built.sourceFiles) {
			const original = frozen.get(file);
			if (!original) throw new Error("a compiler dependency is not part of the publication");
			retained.inputs.set(file, original);
		}
		for (const [file, input] of frozen) {
			assertDesignFile(designDir, file);
			retained.inputs.set(file, input);
		}
		const sheets = await buildFrameCss(designDir, built.sourceFiles, (file) => {
			const input = frozen.get(file);
			if (!input) throw new Error("a stylesheet is not part of the publication");
			return input.bytes.toString("utf8");
		});
		retained.packet.css = sheets.css;
		retained.packet.bundledCss = built.bundledCss ?? "";
		retained.absent = new Set(absent);
		retained.directories = new Map(resolution?.directories ?? retained.directories);
		for (const [path, entries] of retained.directories)
			if (directoryEntries(path) !== entries) throw new Error("module resolution changed during compilation");
		for (const [file, input] of retained.configuration)
			if (!sameInput(input, readInput(file))) throw new Error("compiler configuration changed during compilation");
		for (const file of retained.configurationAbsent)
			if (existsSync(file)) throw new Error("compiler configuration resolution changed during compilation");
		for (const file of absent)
			if (existsSync(resolveDesignPath(designDir, file))) throw new Error("an absent dependency was created");
		finishCompilation(retained, sequence, designDir);
		return retained;
	}
	async function compilePublication(...args: Parameters<typeof compileSnapshot>): Promise<RetainedCompilation> {
		const [root, frame, frozen] = args;
		const retained = await compileSnapshot(...args);
		for (const [file, input] of frozen)
			if (!sameInput(input, readInput(file))) throw new Error("source changed during retained compilation");
		publications.set(retained.packet.id, { root, frame, compilation: retained });
		return retained;
	}
	return {
		compileSnapshot,
		getDocument,
		compilePublication,
		publication: (id: string) => publications.get(id),
		matchingPublications: (root: string, frame: string, inputs: ReadonlyMap<string, SourceInput>, shape: string) =>
			[...publications.values()]
				.filter(
					(one) =>
						one.root === root &&
						one.frame === frame &&
						one.compilation.packet.shape === shape &&
						one.compilation.inputs.size === inputs.size &&
						[...inputs].every(([file, input]) => {
							const held = one.compilation.inputs.get(file);
							return held && sameInput(held, input);
						}),
				)
				.map((one) => one.compilation.packet.id),
	};
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
	retained?: RetainedCompilation;
	frozen?: ReadonlyMap<string, SourceInput>;
	resolutions?: ReadonlyMap<string, OnResolveResult> | undefined;
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
	const { designDir, resolveDir, sourcefile, contents, label, imageBudget } = options;
	return {
		stdin: { contents, resolveDir, loader: "js", sourcefile },
		bundle: true,
		format: "esm",
		platform: "browser",
		target: "es2022",
		jsx: "automatic",
		jsxDev: true,
		jsxImportSource: "spool",
		loader: TEXT_LOADERS,
		packages: "external",
		define: { "process.env.NODE_ENV": '"production"' },
		metafile: true,
		write: false,
		outdir: VIRTUAL_OUTDIR,
		absWorkingDir: designDir,
		plugins: [
			...(options.retained
				? [retainedPlugin(designDir, options.retained, options.frozen, options.resolutions)]
				: []),
			sharedImportPlugin(designDir),
			spoolBoundaryPlugin(designDir),
			spoolAssetPlugin(
				designDir,
				label,
				imageBudget,
				options.retained
					? (file) => {
							const input = options.retained?.inputs.get(file);
							if (!input) throw new Error("an asset is not part of the publication");
							return input.bytes;
						}
					: undefined,
			),
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

/** A compiled output's served name: its path under the virtual outdir. */
export function designOutputName(designDir: string, path: string): string {
	return relative(join(designDir, VIRTUAL_OUTDIR), path).split(sep).join("/");
}

/** The design/ compile (#16) of one entry into one module: frame documents, and blame. */
export async function buildDesignEntry(options: DesignEntryOptions): Promise<DesignBundle> {
	let result = await build(designBuildOptions(options));
	if (options.retained) captureLazyGraph(options.designDir, result.metafile, options.retained);
	if (options.retained?.globDiscoveries?.length && !options.frozen) {
		// Discovery can enlarge the graph through esbuild's computed-import glob.
		// Only a fresh build from the complete captured input set may be served.
		const discovered = options.retained;
		const validate = () => {
			for (const [file, input] of discovered.inputs) {
				assertDesignFile(options.designDir, file);
				if (!sameInput(input, readInput(file))) throw new Error("source changed during module discovery");
			}
			for (const [directory, entries] of discovered.directories)
				if (directoryEntries(directory) !== entries) throw new Error("module discovery directory changed");
			for (const [file, input] of discovered.configuration)
				if (!sameInput(input, readInput(file))) throw new Error("module discovery configuration changed");
			for (const file of discovered.configurationAbsent)
				if (existsSync(file)) throw new Error("module discovery configuration resolution changed");
		};
		validate();
		const captured = emptyCompilation();
		result = await build(
			designBuildOptions({
				...options,
				retained: captured,
				frozen: new Map(discovered.inputs),
				resolutions: new Map(discovered.resolutions),
			}),
		);
		captureLazyGraph(options.designDir, result.metafile, captured);
		validate();
		if (captured.inputs.size !== discovered.inputs.size || captured.resolutions.size !== discovered.resolutions.size)
			throw new Error("module discovery did not stabilize before publication");
		if (JSON.stringify(captured.globDiscoveries) !== JSON.stringify(discovered.globDiscoveries))
			throw new Error("computed module discovery changed before publication");
		if (
			captured.directories.size !== discovered.directories.size ||
			[...captured.directories].some(([directory, entries]) => discovered.directories.get(directory) !== entries)
		)
			throw new Error("module discovery directory inventory changed before publication");
		for (const [file, input] of captured.configuration) {
			const previous = discovered.configuration.get(file);
			if (!previous || !sameInput(previous, input))
				throw new Error("module discovery configuration changed before publication");
		}
		if (
			captured.configuration.size !== discovered.configuration.size ||
			captured.configurationAbsent.size !== discovered.configurationAbsent.size ||
			[...captured.configurationAbsent].some((file) => !discovered.configurationAbsent.has(file))
		)
			throw new Error("module discovery configuration resolution changed before publication");
		Object.assign(discovered, captured);
	}
	const bootKey = designEntryKey(options);
	const sourceFiles = Object.keys(result.metafile.inputs)
		.filter((input) => input !== bootKey)
		.map((input) => resolve(options.designDir, input));
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
	const retained = emptyCompilation();
	const { sourceFiles, bootJs, bundledCss } = await buildDesignEntry({
		designDir,
		resolveDir: frameDir,
		sourcefile: STDIN_NAME,
		contents: bootEntry(frame),
		label: `frame "${frame}"`,
		imageBudget: IMAGE_BUDGET_BYTES,
		retained,
	});

	const shared = join(designDir, "shared");
	const capture = (file: string): string => {
		const input = readInput(resolveDesignPath(designDir, file));
		const held = retained.inputs.get(file);
		if (held && !sameInput(held, input)) throw new Error("source changed during compilation");
		retained.inputs.set(file, input);
		return input.bytes.toString("utf8");
	};
	const optional = (file: string): string | undefined => {
		if (existsSync(resolveDesignPath(designDir, file))) return capture(file);
		retained.absent.add(file);
		return undefined;
	};
	const { css, stylesheets } = await buildFrameCss(designDir, sourceFiles, capture);
	retained.packet.css = css;
	retained.packet.bundledCss = bundledCss ?? "";
	// The stills' fonts (#80): remote faces resolved to this daemon so a
	// capture can inline them, the file as written whenever that fails. The
	// project's own faces (#101) then ride the document as data URIs.
	const resolvedFonts = await webfonts.resolve(optional(join(shared, "fonts.css")));
	const { css: fonts, files: fontFiles } = inlineLocalFonts(designDir, resolvedFonts, (file) => {
		const input = readInput(file);
		retained.inputs.set(file, input);
		return input.bytes;
	});
	const importMap = mergeImportMap(parseImportMap(optional(join(shared, "importmap.json"))), importMapPins());

	for (const file of [...sourceFiles, ...stylesheets, ...fontFiles]) {
		const captured = retained.inputs.get(file);
		if (!existsSync(resolveDesignPath(designDir, file))) {
			retained.absent.add(file);
			continue;
		}
		const current = readInput(file);
		if (captured && !sameInput(captured, current)) throw new Error("source changed during compilation");
		retained.inputs.set(file, current);
	}
	for (const [file, input] of retained.inputs)
		if (!sameInput(input, readInput(file))) throw new Error("a dependency changed during compilation");
	for (const file of retained.absent)
		if (existsSync(resolveDesignPath(designDir, file))) throw new Error("an absent dependency was created");
	for (const [path, entries] of retained.directories)
		if (directoryEntries(path) !== entries) throw new Error("module resolution changed during compilation");
	for (const [file, input] of retained.configuration)
		if (!sameInput(input, readInput(file))) throw new Error("compiler configuration changed during compilation");
	for (const file of retained.configurationAbsent)
		if (existsSync(file)) throw new Error("compiler configuration resolution changed during compilation");
	finishCompilation(retained, 0, designDir);
	const document = assembleFrameDocument({
		project,
		frame,
		projectCapability: authority.projectCapability,
		controlOrigin: authority.controlOrigin,
		css,
		importMap,
		bootJs: `import {configureSource} from "spool/jsx-dev-runtime";configureSource(${JSON.stringify(retained.packet)});\n${bootJs}`,
		fonts,
		bundledCss,
	});
	const inputs = [
		...sourceFiles,
		...stylesheets,
		...fontFiles,
		join(shared, "fonts.css"),
		join(shared, "importmap.json"),
	];
	const hash = hashInputs(version, stamp, inputs, designDir);
	return { inputs, hash, etag: `"${hash.slice(0, 32)}"`, document, fonts: webfonts.revision(), retained };
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
import {observeEntry} from "spool/jsx-dev-runtime";
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
	createElement(Fragment, null, observeEntry(createElement(Frame)), createElement(Ready)),
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
 */
function sharedImportPlugin(designDir: string): Plugin {
	return {
		name: "spool-shared",
		setup(build) {
			build.onResolve({ filter: /^shared\// }, (args) =>
				build.resolve(`./${args.path}`, { resolveDir: designDir, kind: args.kind, importer: args.importer }),
			);
		},
	};
}

/**
 * The load-bearing boundary (#16), enforced where it is visible: shared/ui/
 * components have feel, never knowledge — an import of "spool" there fails
 * the compile. For every other importer "spool" stays external and resolves
 * through the import map pin.
 */
function spoolBoundaryPlugin(designDir: string): Plugin {
	const uiDir = join(designDir, "shared", "ui") + sep;
	return {
		name: "spool-boundary",
		setup(build) {
			// Esbuild resolves extensions and symlinks before loading. This makes the
			// boundary cover every local module format without reimplementing its
			// resolver or accidentally treating packages as project source.
			build.onLoad({ filter: /.*/ }, (args) => {
				try {
					assertDesignFile(designDir, args.path);
					return null;
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
 * has already run `assertDesignFile` on everything esbuild resolves, symlinks
 * and all — and it lands in `metafile.inputs`, so it is a cache input, an ETag
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
	readSource?: (file: string) => Buffer,
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
				if (args.kind !== "url-token" || !local) return null;
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
					const file = resolveDesignPath(designDir, args.path);
					bytes = readSource ? readSource(file) : readFileSync(file);
				} catch (error) {
					// Same shape as the boundary plugin's own complaint, so a caller
					// that must refuse the whole player still recognizes an escape.
					return { errors: [{ text: describeCompileError(error), detail: error }] };
				}
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

export function hashInputs(version: string, frame: string, inputs: string[], designDir: string): string {
	const files = [...inputs].sort().map((file) => [file, hashContent(file, designDir)]);
	return createHash("sha256")
		.update(JSON.stringify([version, shimHash, frame, files]))
		.digest("hex");
}

function hashContent(file: string, designDir: string): string {
	let content: Buffer;
	try {
		content = readFileSync(resolveDesignPath(designDir, file));
	} catch (error) {
		if (error instanceof DesignBoundaryError) throw error;
		return "absent";
	}
	return createHash("sha256").update(content).digest("hex");
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

function finishCompilation(compilation: RetainedCompilation, sequence: number, designDir: string): void {
	for (const cell of Object.values(compilation.cells)) {
		const specifier = cell.image?.specifier;
		if (!specifier) continue;
		const path = resolveDesignPath(
			designDir,
			resolve(specifier.startsWith("shared/") ? designDir : dirname(resolve(designDir, cell.file)), specifier),
		);
		const input = compilation.inputs.get(path);
		const type = ASSET_MEDIA_TYPES[extname(path).toLowerCase()];
		if (!input || !type) throw new Error("the image binding is outside the captured asset inputs");
		cell.value = `data:${type};base64,${input.bytes.toString("base64")}`;
	}
	compilation.packet.sequence = sequence;
	compilation.packet.owners = Object.fromEntries(
		Object.entries(compilation.cells).map(([id, cell]) => [id, cell.owner]),
	);
	compilation.packet.attributes = {};
	for (const [cell, definition] of Object.entries(compilation.cells))
		if (definition.field && definition.syntax === "jsx") {
			const site = cell.slice(0, cell.lastIndexOf("@"));
			compilation.packet.attributes[site] ??= {};
			compilation.packet.attributes[site][definition.field] = { cell, absent: definition.absent === true };
		}
	compilation.packet.values = Object.fromEntries(
		Object.entries(compilation.cells)
			.filter(([, cell]) => !cell.absent)
			.map(([id, cell]) => [id, cell.value]),
	);
	compilation.packet.childValues = Object.fromEntries(
		Object.entries(compilation.cells)
			.filter(([, cell]) => cell.childValue !== undefined)
			.map(([id, cell]) => [id, cell.childValue!]),
	);
	compilation.packet.shape = digest(JSON.stringify(Object.entries(compilation.shapes).sort()));
}
