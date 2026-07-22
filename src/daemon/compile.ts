import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { build, formatMessagesSync, type Plugin } from "esbuild";
import { assembleFrameDocument, errorDocument, mergeImportMap } from "./document";
import { isSafeName, readIfExists } from "./project-files";
import { buildFrameCss } from "./tailwind";
import { importMapPins } from "./vendor";

export type FrameDocument =
	| { kind: "ok"; document: string; etag: string; cache: "hit" | "miss" }
	| { kind: "error"; document: string }
	| { kind: "missing"; message: string };

interface CacheEntry {
	/** Every file the document was built from: the bundle closure plus the shared baseline. */
	inputs: string[];
	hash: string;
	etag: string;
	document: string;
}

const STDIN_NAME = "<spool-boot>";
const VIRTUAL_OUTDIR = "<spool-out>";

/**
 * Compiles frames/<name>/frame.tsx into its served document, content-hash
 * cached: a request rehashes the previous compile's input files and reuses the
 * document byte-for-byte when nothing changed. Compile failures are never
 * cached — a broken frame recompiles per request and recovers instantly.
 */
export function createFrameCompiler(version: string) {
	const cache = new Map<string, CacheEntry>();

	async function getDocument(root: string, frame: string): Promise<FrameDocument> {
		if (!isSafeName(frame)) return { kind: "missing", message: `not a frame name: "${frame}"` };
		const designDir = join(root, "design");
		const frameDir = join(designDir, "frames", frame);
		if (!existsSync(join(frameDir, "frame.tsx"))) {
			return {
				kind: "missing",
				message: `no frame "${frame}" — expected design/frames/${frame}/frame.tsx in ${root}`,
			};
		}

		const key = `${root}\0${frame}`;
		const cached = cache.get(key);
		if (cached !== undefined && hashInputs(version, frame, cached.inputs) === cached.hash) {
			return { kind: "ok", document: cached.document, etag: cached.etag, cache: "hit" };
		}

		try {
			const entry = await compileFrame(version, basename(root), designDir, frameDir, frame);
			cache.set(key, entry);
			return { kind: "ok", document: entry.document, etag: entry.etag, cache: "miss" };
		} catch (error) {
			cache.delete(key);
			return { kind: "error", document: errorDocument(frame, describeCompileError(error)) };
		}
	}

	return { getDocument };
}

export type FrameCompiler = ReturnType<typeof createFrameCompiler>;

async function compileFrame(
	version: string,
	project: string,
	designDir: string,
	frameDir: string,
	frame: string,
): Promise<CacheEntry> {
	const result = await build({
		stdin: { contents: bootEntry(frame), resolveDir: frameDir, loader: "js", sourcefile: STDIN_NAME },
		bundle: true,
		format: "esm",
		platform: "browser",
		target: "es2022",
		jsx: "automatic",
		// jsxDev routes element creation through spool's stamping runtime (#23):
		// every intrinsic element carries its exact source location for the
		// picker, while React itself stays the pinned production build
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
		.filter((input) => input !== STDIN_NAME)
		.map((input) => resolve(designDir, input));
	const bootJs = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
	if (bootJs === undefined) throw new Error(`frame "${frame}" compiled to no module`);
	const bundledCss = result.outputFiles.find((file) => file.path.endsWith(".css"))?.text;

	const shared = join(designDir, "shared");
	const { css, stylesheets } = await buildFrameCss(designDir, sourceFiles);
	const fonts = readIfExists(join(shared, "fonts.css"));
	const importMap = mergeImportMap(parseImportMap(readIfExists(join(shared, "importmap.json"))), importMapPins());

	const document = assembleFrameDocument({ project, frame, css, importMap, bootJs, fonts, bundledCss });
	const inputs = [...sourceFiles, ...stylesheets, join(shared, "fonts.css"), join(shared, "importmap.json")];
	const hash = hashInputs(version, frame, inputs);
	return { inputs, hash, etag: `"${hash.slice(0, 32)}"`, document };
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

function hashInputs(version: string, frame: string, inputs: string[]): string {
	const files = [...inputs].sort().map((file) => [file, hashContent(file)]);
	return createHash("sha256")
		.update(JSON.stringify([version, frame, files]))
		.digest("hex");
}

function hashContent(file: string): string {
	let content: Buffer;
	try {
		content = readFileSync(file);
	} catch {
		return "absent";
	}
	return createHash("sha256").update(content).digest("hex");
}

function parseImportMap(raw: string | undefined): unknown {
	if (raw === undefined) return undefined;
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw new Error(`shared/importmap.json: ${(error as Error).message}`);
	}
}

function describeCompileError(error: unknown): string {
	if (typeof error === "object" && error !== null && "errors" in error && Array.isArray(error.errors)) {
		return formatMessagesSync(error.errors, { kind: "error" }).join("\n");
	}
	return error instanceof Error ? error.message : String(error);
}
