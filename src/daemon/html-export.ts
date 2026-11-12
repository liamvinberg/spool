import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { build, type Plugin } from "esbuild";
import { ASSET_KINDS, ASSET_MEDIA_TYPES } from "./assets";
import { daemonCompileHost } from "./compile-host";
import { type CompileHost, describeCompileError } from "./design-compile";
import { realDesignDir } from "./design-path";
import { escapeHtml, escapeInlineScript, escapeInlineStyle, escapeJsonScript } from "./document";
import type { FlowEdge } from "./flows";
import { chromeFontFile, PLAYER_SHELL_PAGE_RULES, playerChromeCss } from "./play";
import {
	beginPlayerCompile,
	compositionOptions,
	type PlayerBundle,
	type PlayerContext,
	type PlayerFrameRef,
	playerEntry,
	playerStamp,
} from "./player-compile";
import { readScenario } from "./project-files";
import { listProjectFrames, type ProjectedFrame } from "./projection";
import { type FetchModule, isWebImport, RemoteImportError, remoteModules } from "./remote-imports";
import { readCoverImage } from "./thumbs";
import { REACT_SPECIFIERS, vendorPlayerShellExportJs, vendorReactJs, vendorSpoolJs, vendorSpoolJsxJs } from "./vendor";
import { remoteImports, WEBFONT_PATH, type Webfonts } from "./webfonts";

/**
 * A frame exported as one HTML file (spool#239): what Play from here would
 * play, the frame and every frame its links reach or the frame alone, as one
 * document that opens from disk with nothing behind it. React, the runtime,
 * every stylesheet, font and image, and the default scenario ride inside it;
 * the start frame's still shows until the live frame replaces it.
 *
 * With its player (spool#304) the file opens in the player a played frame
 * gets, the same shell with a host of its own (`player-shell-export.tsx`):
 * the bar and its sizes around the same packed frames, played in a sandboxed
 * iframe so they have a viewport of their own to respond to.
 */

export type ExportScope = "flow" | "one";

/** What the export choice says before anything is built. */
export interface ExportPlan {
	/** The frames beyond the start that its links reach, in walk order. */
	reach: string[];
}

export interface ExportedFile {
	html: string;
	filename: string;
}

/** Frames packed for a file that opens from disk with nothing behind it. */
export interface PackedFrames {
	/** the composition and spool's runtime as one module */
	js: string;
	/** every stylesheet by its resource, its fonts and images inlined */
	styles: ReadonlyMap<string, string>;
	/** each frame's stylesheet resource */
	styleOf: Record<string, string>;
	fonts: string | undefined;
	transitions: string | undefined;
	importMap: object;
	/** the default scenario's state */
	state: object;
	/** what else names a daemon URL, inlined the same way */
	inline: (text: string) => Promise<string>;
}

export type ExportAnswer<T> =
	| { kind: "ok"; value: T }
	/** No such frame. */
	| { kind: "missing"; message: string }
	/** A frame in the file does not compile. */
	| { kind: "broken"; message: string };

export interface HtmlExportDeps {
	version: string;
	webfonts: Webfonts;
	/** The project's flow map. */
	flows: (root: string) => Promise<{ edges: readonly Pick<FlowEdge, "from" | "to">[] }>;
	/** An imported image by the hash and extension its /asset/ URL names. */
	readAsset: (hash: string, ext: string) => Promise<{ bytes: Uint8Array; type: string } | undefined>;
	host?: CompileHost;
	/** How an offline pack fetches a module the import map sends to the web; `fetch` when not given. */
	fetchModule?: FetchModule;
}

export function createHtmlExport(deps: HtmlExportDeps) {
	const host = deps.host ?? daemonCompileHost;

	async function reachOf(root: string, start: string, frames: readonly ProjectedFrame[]): Promise<string[]> {
		const { edges } = await deps.flows(root);
		return exportReach(edges, start, new Set(frames.map((ref) => ref.name)));
	}

	async function plan(root: string, frame: string): Promise<ExportAnswer<ExportPlan>> {
		const { frames } = listProjectFrames(root);
		if (!frames.some((ref) => ref.name === frame)) return { kind: "missing", message: `no frame "${frame}"` };
		return { kind: "ok", value: { reach: await reachOf(root, frame, frames) } };
	}

	async function html(
		root: string,
		project: string,
		frame: string,
		scope: ExportScope,
		options: { player?: boolean } = {},
	): Promise<ExportAnswer<ExportedFile>> {
		const { frames } = listProjectFrames(root);
		const start = frames.find((ref) => ref.name === frame);
		if (start === undefined) return { kind: "missing", message: `no frame "${frame}"` };
		const names = scope === "one" ? [frame] : [frame, ...(await reachOf(root, frame, frames))];
		const included = names.map((name) => frames.find((ref) => ref.name === name) as ProjectedFrame);
		const refs: PlayerFrameRef[] = included.map((ref) => ({
			name: ref.name,
			...(ref.page === undefined ? {} : { page: ref.page }),
		}));

		const packed = await pack(root, refs);
		if (packed.kind !== "ok") return packed;
		const { js, styles, styleOf, fonts, transitions, importMap, state, inline } = packed.value;
		const config = {
			project,
			projectCapability: "",
			start: frame,
			scenario: "default",
			frames: Object.fromEntries(included.map((ref) => [ref.name, { w: ref.w, h: ref.h }])),
			styles: styleOf,
			exported: { state },
		};
		const html =
			options.player === true
				? await playerDocument({ config, js, styles, fonts, transitions, importMap, inline })
				: exportDocument({
						config,
						width: start.w,
						js,
						styles,
						fonts,
						transitions,
						importMap,
						poster: start.cover === undefined ? undefined : stillOf(root, frame, start.cover.hash),
					});
		return { kind: "ok", value: { html, filename: exportFilename(project, frame) } };
	}

	/**
	 * These frames composed as the player composes them and packed for a file: one module with React beside it in the
	 * import map, every stylesheet, font and image inlined, and the default scenario's state. A frame that does not
	 * compile refuses the whole, named. `offline` brings in too what the import map sends to the web, so the file needs
	 * no network at all, and refuses the whole, naming the import, when one can't be fetched now.
	 */
	async function pack(
		root: string,
		refs: PlayerFrameRef[],
		options: { offline?: boolean } = {},
	): Promise<ExportAnswer<PackedFrames>> {
		const composed = await compose(root, refs);
		if (composed.kind !== "ok") return composed;
		const bundle = composed.value;
		const inline = inliner(deps);
		let module: string;
		try {
			module = await oneModule(bundle, options.offline === true ? (deps.fetchModule ?? null) : undefined);
		} catch (error) {
			if (!(error instanceof RemoteImportError)) throw error;
			return { kind: "broken", message: error.message };
		}
		const js = await inline(module);
		const styles = new Map<string, string>();
		for (const resource of bundle.styles.values()) {
			if (!styles.has(resource)) styles.set(resource, await inline(bundle.chunks.get(resource) ?? ""));
		}
		const scenario = readScenario(root, "default");
		const state = scenario.kind === "ok" ? ((JSON.parse(scenario.json) as { state?: object }).state ?? {}) : {};
		const imported =
			options.offline === true ? await importedFaces(deps.webfonts, [module, ...styles.values()]) : undefined;
		const fonts = [bundle.fonts, imported].filter((css) => css !== undefined).join("\n");
		return {
			kind: "ok",
			value: {
				js,
				styles,
				styleOf: Object.fromEntries(bundle.styles),
				fonts: fonts === "" ? undefined : await inline(fonts),
				transitions: bundle.transitions,
				importMap: exportImportMap(bundle.importMap, await vendorReactJs(), options.offline === true),
				state,
				inline,
			},
		};
	}

	/** The player's composition of these frames, built whole into one module rather than split. */
	async function compose(root: string, refs: PlayerFrameRef[]): Promise<ExportAnswer<PlayerBundle>> {
		let designDir: string;
		try {
			designDir = realDesignDir(root);
		} catch (error) {
			return { kind: "broken", message: (error as Error).message };
		}
		const reading: PlayerContext["reading"] = { reads: undefined };
		const context: PlayerContext = {
			stamp: playerStamp(refs),
			designDir,
			reading,
			context: await host.esbuild.context({
				...compositionOptions(designDir, playerEntry(refs, new Map()), host.files, () => reading.reads),
				splitting: false,
			}),
			styles: new Map(),
		};
		try {
			const compilation = beginPlayerCompile(
				host,
				deps.version,
				designDir,
				refs,
				context.stamp,
				deps.webfonts,
				context,
			);
			const player = await compilation.done;
			if (player.broken.length > 0) {
				const { broken } = await compilation.composed;
				const first = refs.find((ref) => broken.has(ref.name))?.name ?? player.broken[0];
				return { kind: "broken", message: `frame "${first}": ${broken.get(first ?? "") ?? "does not compile"}` };
			}
			return { kind: "ok", value: player.bundle };
		} catch (error) {
			return { kind: "broken", message: await describeCompileError(host.esbuild, error) };
		} finally {
			await context.context.dispose();
		}
	}

	return { plan, html, pack };
}

export type HtmlExport = ReturnType<typeof createHtmlExport>;

/**
 * The frames a start frame's links reach, transitively over the flow map's
 * edges, breadth first from the start: the order a walk meets them in. The
 * start is not among them, and a target no frame answers to is left out.
 */
export function exportReach(
	edges: readonly Pick<FlowEdge, "from" | "to">[],
	start: string,
	frames: ReadonlySet<string>,
): string[] {
	const out = new Map<string, string[]>();
	for (const edge of edges) {
		if (!frames.has(edge.to)) continue;
		const targets = out.get(edge.from);
		if (targets === undefined) out.set(edge.from, [edge.to]);
		else targets.push(edge.to);
	}
	const seen = new Set([start]);
	const reach: string[] = [];
	const queue = [start];
	for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
		for (const to of out.get(at) ?? []) {
			if (seen.has(to)) continue;
			seen.add(to);
			reach.push(to);
			queue.push(to);
		}
	}
	return reach;
}

/**
 * The file's import map: the composition's, with spool's runtime pins dropped
 * (the module carries the runtime) and every React specifier sent to React as
 * one data: module. React stays a module of its own so a package the project
 * maps to the web, which imports React by name, finds the same React the
 * frames render with. `offline`, the module carries what the map sent to the
 * web too, so those entries go.
 */
function exportImportMap(importMap: object, react: string, offline: boolean): object {
	const map = importMap as { imports?: Record<string, string> };
	const reactUrl = `data:text/javascript;base64,${Buffer.from(react).toString("base64")}`;
	const imports = Object.fromEntries(
		Object.entries(map.imports ?? {}).filter(
			([specifier, target]) =>
				specifier !== "spool" && specifier !== "spool/jsx-dev-runtime" && !(offline && isWebImport(target)),
		),
	);
	return { ...map, imports: { ...imports, ...Object.fromEntries(REACT_SPECIFIERS.map((spec) => [spec, reactUrl])) } };
}

/** A frame's still as the canvas last drew it, as a data: URL. */
export function stillOf(root: string, frame: string, hash: string): string | undefined {
	const poster = readCoverImage(root, frame, hash);
	return poster === undefined ? undefined : `data:${poster.type};base64,${poster.bytes.toString("base64")}`;
}

/** The file's name: `<project>-<frame>.html`, a page's slashes as dashes. */
export function exportFilename(project: string, frame: string): string {
	return `${project}-${frame.replaceAll("/", "-")}.html`;
}

/**
 * The composition and spool's runtime in one module. React stays an import,
 * which the file's import map answers with React's own data: module, and so
 * does whatever else the frames import (a package the project maps to a CDN),
 * unless `offline` is given (a fetcher, or null for the web's own): then what
 * the map sends to the web is fetched now and comes inside the module.
 */
async function oneModule(bundle: PlayerBundle, offline?: FetchModule | null): Promise<string> {
	const entry = bundle.chunks.get(bundle.entry);
	if (entry === undefined) throw new Error("the composition has no entry module");
	const modules = new Map<string, string>([
		["spool", "spool"],
		["spool/jsx-dev-runtime", "spool/jsx-dev-runtime"],
	]);
	const vendored = new Map<string, () => Promise<string>>([
		["spool", async () => (await vendorSpoolJs()).js],
		["spool/jsx-dev-runtime", async () => (await vendorSpoolJsxJs()).js],
	]);
	const imports = (bundle.importMap as { imports?: Record<string, string> }).imports ?? {};
	// the first module that could not be fetched, which the build's own failure is reported as
	let failed: RemoteImportError | undefined;
	const remote =
		offline === undefined
			? undefined
			: remoteModules(
					// React is the file's own, answered by its import map, never a copy from the web
					Object.fromEntries(
						Object.entries(imports).filter(
							([specifier]) => !(REACT_SPECIFIERS as readonly string[]).includes(specifier),
						),
					),
					offline ?? undefined,
				);
	const vendor: Plugin = {
		name: "spool-export-vendor",
		setup(on) {
			on.onResolve({ filter: /.*/ }, (args) => {
				const module = modules.get(args.path);
				if (module !== undefined) return { path: module, namespace: "spool-vendor" };
				return remote?.resolve(args) ?? { path: args.path, external: true };
			});
			if (remote !== undefined)
				on.onLoad({ filter: /.*/, namespace: remote.namespace }, async (args) => {
					try {
						return await remote.load(args);
					} catch (error) {
						if (error instanceof RemoteImportError) failed ??= error;
						throw error;
					}
				});
			on.onLoad({ filter: /.*/, namespace: "spool-vendor" }, async (args) => ({
				contents: await (vendored.get(args.path) as () => Promise<string>)(),
				loader: "js",
			}));
		},
	};
	const result = await build({
		stdin: { contents: entry, loader: "js", sourcefile: "spool-export.js" },
		bundle: true,
		format: "esm",
		platform: "browser",
		target: "es2022",
		minifyWhitespace: true,
		legalComments: "none",
		write: false,
		logLevel: "silent",
		plugins: [vendor],
	}).catch((error: unknown) => {
		throw failed ?? error;
	});
	const js = result.outputFiles[0]?.text;
	if (js === undefined) throw new Error("the export compiled to no module");
	return js;
}

/**
 * The faces a frame's own stylesheet `@import`s from the web, as a deck's slides import theirs: resolved as fonts.css
 * is, for a file that opens offline. Unresolved, there is nothing to add: the frames still name the import themselves.
 */
async function importedFaces(webfonts: Webfonts, texts: readonly string[]): Promise<string | undefined> {
	// a URL a module escaped inside its string is not one to ask for
	const urls = [...new Set(texts.flatMap(remoteImports))].filter((url) => !url.includes("\\"));
	if (urls.length === 0) return undefined;
	const sheet = urls.map((url) => `@import url("${url}");`).join("\n");
	const resolved = await webfonts.resolve(sheet);
	return resolved === sheet ? undefined : resolved;
}

const ASSET_URL = new RegExp(`/asset/([0-9a-f]{64})(\\.(?:${ASSET_KINDS}))`, "gi");
const WEBFONT_URL = new RegExp(`${WEBFONT_PATH.replaceAll("/", "\\/")}([A-Za-z0-9_-]+)`, "g");
const CHROME_FONT_URL = /\/vendor\/fonts\/([A-Za-z0-9._-]+\.woff2)/g;

/** Every daemon URL a module or a sheet names (images, fonts) put in it as data. */
function inliner(deps: Pick<HtmlExportDeps, "readAsset" | "webfonts">): (text: string) => Promise<string> {
	const known = new Map<string, string | undefined>();
	const once = async (url: string, read: () => Promise<{ bytes: Uint8Array; type: string } | undefined>) => {
		if (!known.has(url)) {
			const file = await read();
			known.set(
				url,
				file === undefined ? undefined : `data:${file.type};base64,${Buffer.from(file.bytes).toString("base64")}`,
			);
		}
		return known.get(url);
	};
	return async (text) => {
		const urls = new Map<string, () => Promise<{ bytes: Uint8Array; type: string } | undefined>>();
		for (const [url, hash, ext] of text.matchAll(ASSET_URL)) {
			const type = ASSET_MEDIA_TYPES[(ext ?? "").toLowerCase()];
			urls.set(url, async () => {
				const asset = await deps.readAsset(hash ?? "", ext ?? "");
				return asset === undefined ? undefined : { bytes: asset.bytes, type: type ?? asset.type };
			});
		}
		for (const [url, key] of text.matchAll(WEBFONT_URL)) urls.set(url, () => deps.webfonts.read(key ?? ""));
		for (const [url, name] of text.matchAll(CHROME_FONT_URL)) {
			const file = chromeFontFile(name ?? "");
			if (file !== undefined) urls.set(url, async () => ({ bytes: readFileSync(file), type: "font/woff2" }));
		}
		let out = text;
		for (const [url, read] of urls) {
			const data = await once(url, read);
			if (data !== undefined) out = out.replaceAll(url, data);
		}
		return out;
	};
}

function exportDocument({
	config,
	width,
	js,
	styles,
	fonts,
	transitions,
	importMap,
	poster,
}: {
	config: { start: string; styles: Record<string, string> };
	width: number;
	js: string;
	styles: ReadonlyMap<string, string>;
	fonts: string | undefined;
	transitions: string | undefined;
	importMap: object;
	poster: string | undefined;
}): string {
	const sheets = frameSheets(styles, config.styles, config.styles[config.start]);
	// the still the frame was last seen as, until the live frame replaces it
	const still =
		poster === undefined
			? ""
			: `<div class="spool-page"><div class="spool-screen"><img src="${poster}" alt="" style="display:block;width:100%;height:auto"></div></div>`;
	return `<!doctype html>
<html lang="en" style="--spool-screen-w:${width}px">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="Spool">
<title>${escapeHtml(config.start)}</title>
<link rel="icon" href="data:,">
<script>window.__SPOOL_PLAY__ = JSON.parse(${escapeJsonScript(JSON.stringify(config))})</script>
<style>${EXPORT_PAGE_RULES}</style>
${fonts === undefined ? "" : `<style>${escapeInlineStyle(fonts)}</style>\n`}${sheets}
${transitions === undefined ? "" : `<style>${escapeInlineStyle(transitions)}</style>\n`}<script type="importmap">${escapeJsonScript(importMap)}</script>
</head>
<body>
<div id="root">${still}</div>
<script type="module">${escapeInlineScript(js)}</script>
</body>
</html>
`;
}

/**
 * The file with its player (spool#304): the player shell, booted by its export host, around a template holding the
 * played document, which is the file without its player played as the live player's inner document is. The file's one
 * import map serves both: the host hands it to the played document as it plays it. React rides in the file once, as
 * its own text, and the map that sends every React specifier to it is made from that text as the file opens, so the
 * map does not carry React once for each.
 */
async function playerDocument({
	config,
	js,
	styles,
	fonts,
	transitions,
	importMap,
	inline,
}: {
	config: {
		project: string;
		start: string;
		frames: Record<string, { w: number; h: number }>;
		styles: Record<string, string>;
	};
	js: string;
	styles: ReadonlyMap<string, string>;
	fonts: string | undefined;
	transitions: string | undefined;
	importMap: object;
	inline: (text: string) => Promise<string>;
}): Promise<string> {
	const { project, start, frames } = config;
	const played = { ...config, shell: true };
	const sheets = frameSheets(styles, config.styles, config.styles[start]);
	const chrome = await inline(playerChromeCss().replace(ITALIC_FACES, ""));
	const { imports, ...map } = importMap as { imports?: Record<string, string> };
	const others = Object.fromEntries(
		Object.entries(imports ?? {}).filter(
			([specifier]) => !(REACT_SPECIFIERS as readonly string[]).includes(specifier),
		),
	);
	const mapping = { map: { ...map, imports: others }, react: REACT_SPECIFIERS };
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="Spool">
<title>${escapeHtml(start)} · ${escapeHtml(project)}</title>
<link rel="icon" href="data:,">
<style>${escapeInlineStyle(chrome)}</style>
<style>${PLAYER_SHELL_PAGE_RULES}</style>
<script>window.__SPOOL_EXPORT__ = JSON.parse(${escapeJsonScript(JSON.stringify({ project, start, frames }))})</script>
<script type="text/plain" id="spool-react">${escapeInlineScript(await vendorReactJs())}</script>
<script>${escapeInlineScript(IMPORT_MAP_SCRIPT.replace("MAPPING", () => escapeJsonScript(mapping)))}</script>
</head>
<body>
<div id="root"></div>
<template id="${PLAYED_TEMPLATE_ID}">
<title>${escapeHtml(start)}</title>
<script>window.__SPOOL_PLAY__ = JSON.parse(${escapeJsonScript(JSON.stringify(played))})</script>
<style>html, body, #root { height: 100%; }</style>
${fonts === undefined ? "" : `<style>${escapeInlineStyle(fonts)}</style>\n`}${sheets}
${transitions === undefined ? "" : `<style>${escapeInlineStyle(transitions)}</style>\n`}<div id="root"></div>
<script type="module">${escapeInlineScript(js)}</script>
</template>
<script type="module">${escapeInlineScript(await exportShellJs())}</script>
</body>
</html>
`;
}

/**
 * The file's import map, made before any module loads: the map the file names, with every React specifier sent to
 * React's own text as one data: URL.
 */
const IMPORT_MAP_SCRIPT = `(() => {
	const { map, react } = MAPPING;
	const url = "data:text/javascript;charset=utf-8," + encodeURIComponent(document.getElementById("spool-react").textContent);
	for (const specifier of react) map.imports[specifier] = url;
	const script = document.createElement("script");
	script.type = "importmap";
	script.textContent = JSON.stringify(map);
	document.currentScript.after(script);
})();`;

/** The id of the template holding the played document; the export host's `PLAYED_TEMPLATE_ID`. */
const PLAYED_TEMPLATE_ID = "spool-played";

/** The bar's italic faces, which it never sets: a file carries only what it draws with. */
const ITALIC_FACES = /@font-face\s*{[^}]*font-style:\s*italic[^}]*}/g;

/** The player shell and its export host as one module that boots on load, React left to the file's import map. */
async function exportShellJs(): Promise<string> {
	const shell = (await vendorPlayerShellExportJs()).js;
	const result = await build({
		stdin: { contents: `import { bootExportedPlayer } from "spool-player"; bootExportedPlayer();`, loader: "js" },
		bundle: true,
		format: "esm",
		platform: "browser",
		target: "es2022",
		minify: true,
		legalComments: "none",
		write: false,
		logLevel: "silent",
		plugins: [
			{
				name: "spool-export-shell",
				setup(on) {
					on.onResolve({ filter: /^spool-player$/ }, () => ({ path: "spool-player", namespace: "spool-shell" }));
					on.onResolve({ filter: /.*/ }, (args) => ({ path: args.path, external: true }));
					on.onLoad({ filter: /.*/, namespace: "spool-shell" }, () => ({ contents: shell, loader: "js" }));
				},
			},
		],
	});
	const js = result.outputFiles[0]?.text;
	if (js === undefined) throw new Error("the export's player compiled to no module");
	return js;
}

/**
 * The page a frame gets in the file: the document it has on the canvas and in
 * Play (document.ts), viewport tall, so a frame that is its own scroll box
 * scrolls itself and a taller one runs past it for the browser to scroll. Its
 * colour scheme is the one the frame's own `:root` sets, and the column under
 * the screen is that scheme's canvas colour, as a frame's document paints it,
 * between spool's dark either side. The runtime keeps `--spool-screen-w` at
 * the authored width of the frame on show.
 */
const EXPORT_PAGE_RULES = `html, body, #root, .spool-page, .spool-screen { height: 100%; }
body { margin: 0; background: #0e0e0e linear-gradient(Canvas, Canvas) top center / min(100%, var(--spool-screen-w)) 1px repeat-y; }
.spool-screen { position: relative; z-index: 0; isolation: isolate; width: 100%; max-width: var(--spool-screen-w); margin: 0 auto; color: CanvasText; view-transition-name: spool-screen; }`;

/** Every frame's sheet, as the runtime finds them; only the one `opening` names applies, the screen on show's. */
export function frameSheets(
	styles: ReadonlyMap<string, string>,
	styleOf: Record<string, string>,
	opening: string | undefined,
): string {
	return [...styles]
		.map(
			([resource, css]) =>
				`<style data-spool-frame-style="${escapeHtml(frameOf(styleOf, resource))}" data-spool-style-resource="${escapeHtml(resource)}"${resource === opening ? "" : ' media="not all"'}>${escapeInlineStyle(css)}</style>`,
		)
		.join("\n");
}

/** The first frame a stylesheet is the closure of: the attribute the runtime falls back on. */
function frameOf(styles: Record<string, string>, resource: string): string {
	return Object.entries(styles).find(([, name]) => name === resource)?.[0] ?? "";
}
