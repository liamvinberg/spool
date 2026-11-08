import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build, type Plugin } from "esbuild";
import { PLAYER_SCREEN_RULES } from "../runtime/player-chrome-css";
import { ASSET_KINDS, ASSET_MEDIA_TYPES } from "./assets";
import { daemonCompileHost } from "./compile-host";
import { type CompileHost, describeCompileError, parseImportMap } from "./design-compile";
import { realDesignDir } from "./design-path";
import { escapeHtml, escapeInlineScript, escapeInlineStyle, escapeJsonScript } from "./document";
import type { FlowEdge, FrameGraph } from "./flows";
import { chromeFontFile } from "./play";
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
import { readCoverImage } from "./thumbs";
import { REACT_SPECIFIERS, vendorReactJs, vendorSpoolJs, vendorSpoolJsxJs } from "./vendor";
import { WEBFONT_PATH, type Webfonts } from "./webfonts";

/**
 * A frame exported as one HTML file (spool#239): what Play from here would
 * play, the frame and every frame its links reach or the frame alone, as one
 * document that opens from disk with nothing behind it. React, the runtime,
 * every stylesheet, font and image, and the default scenario ride inside it;
 * the start frame's still shows until the live frame replaces it.
 */

export type ExportScope = "flow" | "one";

/** What the export choice says before anything is built. */
export interface ExportPlan {
	/** The frames beyond the start that its links reach, in walk order. */
	reach: string[];
	/** Frames among the start and its reach that need the internet to work. */
	online: string[];
}

export interface ExportedFile {
	html: string;
	filename: string;
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
	/** The project's flow map and each frame's source graph. */
	flows: (root: string) => Promise<{ edges: readonly Pick<FlowEdge, "from" | "to">[] }>;
	sources: (root: string) => Promise<ReadonlyMap<string, Pick<FrameGraph, "files">>>;
	/** An imported image by the hash and extension its /asset/ URL names. */
	readAsset: (hash: string, ext: string) => Promise<{ bytes: Uint8Array; type: string } | undefined>;
	host?: CompileHost;
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
		const reach = await reachOf(root, frame, frames);
		const sources = await deps.sources(root);
		const offFile = offFileSpecifiers(root);
		const online = [frame, ...reach].filter((name) => {
			const texts = (sources.get(name)?.files ?? []).map((file) => readText(file));
			return needsInternet(texts, offFile);
		});
		return { kind: "ok", value: { reach, online } };
	}

	async function html(
		root: string,
		project: string,
		frame: string,
		scope: ExportScope,
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

		const composed = await compose(root, refs);
		if (composed.kind !== "ok") return composed;
		const bundle = composed.value;
		const inline = inliner(deps);
		const js = await inline(await oneModule(bundle));
		const styles = new Map<string, string>();
		for (const resource of bundle.styles.values()) {
			if (!styles.has(resource)) styles.set(resource, await inline(bundle.chunks.get(resource) ?? ""));
		}
		const poster = start.cover === undefined ? undefined : readCoverImage(root, frame, start.cover.hash);
		const scenario = readScenario(root, "default");
		const state = scenario.kind === "ok" ? ((JSON.parse(scenario.json) as { state?: object }).state ?? {}) : {};
		const config = {
			project,
			projectCapability: "",
			start: frame,
			scenario: "default",
			frames: Object.fromEntries(included.map((ref) => [ref.name, { w: ref.w, h: ref.h }])),
			styles: Object.fromEntries(bundle.styles),
			exported: { state },
		};
		const html = exportDocument({
			config,
			width: start.w,
			js,
			styles,
			fonts: bundle.fonts === undefined ? undefined : await inline(bundle.fonts),
			transitions: bundle.transitions,
			importMap: exportImportMap(bundle.importMap, await vendorReactJs()),
			poster: poster === undefined ? undefined : `data:${poster.type};base64,${poster.bytes.toString("base64")}`,
		});
		return { kind: "ok", value: { html, filename: exportFilename(project, frame) } };
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

	return { plan, html };
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

/** A URL the page loads, as source writes one: fetched, a src, a CSS url() or @import, an import, a socket. */
const LOADS_FROM_WEB =
	/(?:\bfetch\s*\(\s*|\b(?:src|srcSet|srcset|poster)\s*[=:]\s*\{?\s*|\burl\s*\(\s*|@import\s+|\bfrom\s*|\bimport\s*\(\s*|\bnew\s+(?:WebSocket|EventSource|Worker)\s*\(\s*)[`'"]?(?:https?|wss?):\/\//;

/**
 * Whether a frame needs the internet to work, read off its source graph: a
 * plain heuristic, a URL on the web it loads (see LOADS_FROM_WEB) or an import
 * the project's import map sends off the file.
 */
export function needsInternet(sources: readonly string[], offFile: readonly string[]): boolean {
	const imports = offFile.map(
		(specifier) => new RegExp(`["']${escapeRegExp(specifier)}${specifier.endsWith("/") ? "" : "[\"'/]"}`),
	);
	return sources.some((text) => LOADS_FROM_WEB.test(text) || imports.some((quoted) => quoted.test(text)));
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The project's import map entries that point at the web: the specifiers a file can't carry. */
function offFileSpecifiers(root: string): string[] {
	let map: unknown;
	try {
		map = parseImportMap(readText(join(realDesignDir(root), "shared", "importmap.json")));
	} catch {
		return [];
	}
	const imports = (map as { imports?: Record<string, unknown> } | undefined)?.imports ?? {};
	return Object.entries(imports)
		.filter(([, url]) => typeof url === "string" && /^(?:https?:)?\/\//.test(url))
		.map(([specifier]) => specifier);
}

/**
 * The file's import map: the composition's, with spool's runtime pins dropped
 * (the module carries the runtime) and every React specifier sent to React as
 * one data: module. React stays a module of its own so a package the project
 * maps to the web, which imports React by name, finds the same React the
 * frames render with.
 */
function exportImportMap(importMap: object, react: string): object {
	const map = importMap as { imports?: Record<string, string> };
	const reactUrl = `data:text/javascript;base64,${Buffer.from(react).toString("base64")}`;
	const imports = Object.fromEntries(
		Object.entries(map.imports ?? {}).filter(
			([specifier]) => specifier !== "spool" && specifier !== "spool/jsx-dev-runtime",
		),
	);
	return { ...map, imports: { ...imports, ...Object.fromEntries(REACT_SPECIFIERS.map((spec) => [spec, reactUrl])) } };
}

function readText(file: string): string {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return "";
	}
}

/** The file's name: `<project>-<frame>.html`, a page's slashes as dashes. */
export function exportFilename(project: string, frame: string): string {
	return `${project}-${frame.replaceAll("/", "-")}.html`;
}

/**
 * The composition and spool's runtime in one module. React stays an import,
 * which the file's import map answers with React's own data: module, and so
 * does whatever else the frames import (a package the project maps to a CDN).
 */
async function oneModule(bundle: PlayerBundle): Promise<string> {
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
	const vendor: Plugin = {
		name: "spool-export-vendor",
		setup(on) {
			on.onResolve({ filter: /.*/ }, (args) => {
				const module = modules.get(args.path);
				return module === undefined
					? { path: args.path, external: true }
					: { path: module, namespace: "spool-vendor" };
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
	});
	const js = result.outputFiles[0]?.text;
	if (js === undefined) throw new Error("the export compiled to no module");
	return js;
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
	const opening = config.styles[config.start];
	// every frame's sheet is here; only the screen on show applies its own
	const sheets = [...styles]
		.map(
			([resource, css]) =>
				`<style data-spool-frame-style="${escapeHtml(frameOf(config.styles, resource))}" data-spool-style-resource="${escapeHtml(resource)}"${resource === opening ? "" : ' media="not all"'}>${escapeInlineStyle(css)}</style>`,
		)
		.join("\n");
	// the still the frame was last seen as, until the live frame replaces it
	const still =
		poster === undefined
			? ""
			: `<div class="spool-page"><div class="spool-screen" style="width:100%;max-width:${width}px"><img src="${poster}" alt="" style="display:block;width:100%;height:auto"></div></div>`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="Spool">
<title>${escapeHtml(config.start)}</title>
<link rel="icon" href="data:,">
<script>window.__SPOOL_PLAY__ = JSON.parse(${escapeJsonScript(JSON.stringify(config))})</script>
<style>${escapeInlineStyle(PLAYER_SCREEN_RULES)}</style>
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

/** The first frame a stylesheet is the closure of: the attribute the runtime falls back on. */
function frameOf(styles: Record<string, string>, resource: string): string {
	return Object.entries(styles).find(([, name]) => name === resource)?.[0] ?? "";
}
