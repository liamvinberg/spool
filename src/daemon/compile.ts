import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { build, formatMessagesSync, type Plugin } from "esbuild";
import { assertDesignFile, DesignBoundaryError, realDesignDir, resolveDesignPath } from "./design-path";
import { assembleFrameDocument, errorDocument, mergeImportMap, shimHash } from "./document";
import { isSafeName, readIfExists } from "./project-files";
import { describeCollision, frameKind, lookupFrame } from "./projection";
import { buildFrameCss } from "./tailwind";
import { assembleTermDocument, termDocumentEtag } from "./term-document";
import { importMapPins } from "./vendor";
import { inertWebfonts, type Webfonts } from "./webfonts";

export type FrameDocument =
	| { kind: "ok"; document: string; etag: string; cache: "hit" | "miss" }
	| { kind: "error"; document: string; message: string }
	| { kind: "missing"; message: string };

export interface FrameAuthority {
	projectCapability: string;
}

interface CacheEntry {
	/** Every file the document was built from: the bundle closure plus the shared baseline. */
	inputs: string[];
	hash: string;
	etag: string;
	document: string;
	/** The webfont resolution this document was assembled from (#80). */
	fonts: number;
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
		if (!isSafeName(frame)) return { kind: "missing", message: `not a frame name: "${frame}"` };
		const lookup = lookupFrame(root, frame);
		if (lookup.kind === "collision") {
			// an ambiguous name serves nobody — fail loud, name both locations (#39)
			const message = describeCollision(frame, lookup.paths);
			return { kind: "error", document: errorDocument(frame, message), message };
		}
		if (lookup.kind === "missing") {
			return {
				kind: "missing",
				message: `no frame "${frame}" — expected design/frames/${frame}/frame.tsx`,
			};
		}
		const frameDir = lookup.dir;
		const designDir = realDesignDir(root);
		// the raw entry read, not the projection's normalization: a both-entries
		// folder must serve its error, not compile as html (#42)
		const kind = frameKind(frameDir, designDir);
		if (kind === undefined) {
			return {
				kind: "missing",
				message: `no frame "${frame}" — expected design/frames/${frame}/frame.tsx`,
			};
		}
		if (kind === "conflict") {
			const message = `design/frames/${frame} holds both frame.tsx and term.tsx — a frame is one kind; remove one entry`;
			return { kind: "error", document: errorDocument(frame, message), message };
		}
		if (kind === "term") {
			// Project terminal code stays unread and unexecuted until Spool has an
			// OS sandbox. This static document is authored wholly by Spool.
			const document = assembleTermDocument({ frame });
			return { kind: "ok", document, etag: termDocumentEtag(version, document), cache: "hit" };
		}

		const stamp = `${frame}\0${authority.projectCapability}`;
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
			return { kind: "ok", document: entry.document, etag: entry.etag, cache: "miss" };
		} catch (error) {
			cache.delete(key);
			const message = describeCompileError(error);
			return { kind: "error", document: errorDocument(frame, message), message };
		}
	}

	return { getDocument };
}

export type FrameCompiler = ReturnType<typeof createFrameCompiler>;

export interface DesignBundle {
	/** Every design/ file in the bundle closure, absolute — they are cache inputs. */
	sourceFiles: string[];
	bootJs: string;
	/** Extra stylesheet emitted by plain .css imports, when any. */
	bundledCss?: string | undefined;
}

/**
 * The one design/ compile (#16), shared by frame documents and the player
 * composition (#24): stamping JSX, the shared/ui boundary, packages external
 * to the import map. jsxDev routes element creation through spool's stamping
 * runtime (#23) — every intrinsic element carries its exact source location
 * for the picker, while React itself stays the pinned production build.
 */
export async function buildDesignEntry(options: {
	designDir: string;
	/** Where the entry's relative imports resolve from. */
	resolveDir: string;
	sourcefile: string;
	contents: string;
	/** Names the compilation in errors: `frame "inbox"`, `the player`. */
	label: string;
}): Promise<DesignBundle> {
	const { designDir, resolveDir, sourcefile, contents, label } = options;
	const result = await build({
		stdin: { contents, resolveDir, loader: "js", sourcefile },
		bundle: true,
		format: "esm",
		platform: "browser",
		target: "es2022",
		jsx: "automatic",
		jsxDev: true,
		jsxImportSource: "spool",
		packages: "external",
		define: { "process.env.NODE_ENV": '"production"' },
		metafile: true,
		write: false,
		outdir: VIRTUAL_OUTDIR,
		absWorkingDir: designDir,
		plugins: [spoolBoundaryPlugin(designDir)],
		logLevel: "silent",
	});

	const sourceFiles = Object.keys(result.metafile.inputs)
		.filter((input) => input !== sourcefile)
		.map((input) => resolve(designDir, input));
	const bootJs = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
	if (bootJs === undefined) throw new Error(`${label} compiled to no module`);
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
	const { sourceFiles, bootJs, bundledCss } = await buildDesignEntry({
		designDir,
		resolveDir: frameDir,
		sourcefile: STDIN_NAME,
		contents: bootEntry(frame),
		label: `frame "${frame}"`,
	});

	const shared = join(designDir, "shared");
	const { css, stylesheets } = await buildFrameCss(designDir, sourceFiles);
	// The stills' fonts (#80): remote faces resolved to this daemon so a
	// capture can inline them, the file as written whenever that fails.
	const fonts = await webfonts.resolve(readIfExists(join(shared, "fonts.css"), designDir));
	const importMap = mergeImportMap(
		parseImportMap(readIfExists(join(shared, "importmap.json"), designDir)),
		importMapPins(),
	);

	const document = assembleFrameDocument({
		project,
		frame,
		projectCapability: authority.projectCapability,
		css,
		importMap,
		bootJs,
		fonts,
		bundledCss,
	});
	const inputs = [...sourceFiles, ...stylesheets, join(shared, "fonts.css"), join(shared, "importmap.json")];
	const hash = hashInputs(version, stamp, inputs, designDir);
	return { inputs, hash, etag: `"${hash.slice(0, 32)}"`, document, fonts: webfonts.revision() };
}

/**
 * The loaded report rides a commit-time effect (#17): Chrome pauses rAF
 * entirely in offscreen iframes, and offscreen frames must still report —
 * an effect fires after the first committed render regardless of visibility.
 *
 * "spool" is imported for its side effects in every document — data-go and
 * the mock layer work in frames that never import it — and its top-level
 * await holds the first render until the session is seeded.
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
					return { errors: [{ text: describeCompileError(error) }] };
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

export function describeCompileError(error: unknown): string {
	if (typeof error === "object" && error !== null && "errors" in error && Array.isArray(error.errors)) {
		return formatMessagesSync(error.errors, { kind: "error" }).join("\n");
	}
	return error instanceof Error ? error.message : String(error);
}
