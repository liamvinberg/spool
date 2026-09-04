import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { type BuildContext, type BuildResult, build, context } from "esbuild";
import {
	buildDesignEntry,
	describeCompileError,
	designBuildOptions,
	designEntryKey,
	designOutputName,
	hashInputs,
	isDesignBoundaryFailure,
	parseImportMap,
} from "./compile";
import { realDesignDir } from "./design-path";
import { escapeHtml, escapeInlineScript, escapeInlineStyle, escapeJsonScript, mergeImportMap } from "./document";
import { readIfExists } from "./project-files";
import { frameFolder } from "./projection";
import { buildFrameCss } from "./tailwind";
import { importMapPins } from "./vendor";
import { inertWebfonts, inlineLocalFonts, type Webfonts } from "./webfonts";

/**
 * The player page (#24): one light document under /play/ composing every frame
 * component, because View Transitions cannot cross iframe boundaries — same-
 * document VT with view-transition-name matching is the whole point. The
 * daemon compiles the composition; the flow runtime (served as "spool" through
 * the same import map pin frames already use) boots it, swaps screens, and
 * owns the stage chrome. None of the canvas SPA rides along.
 */

const STDIN_NAME = "<spool-play>";

/** Where a project's compiled player modules are served, under its play URL. */
export function playerChunkBase(project: string): string {
	return `/play/${encodeURIComponent(project)}/-/`;
}

export interface PlayerConfig {
	project: string;
	projectCapability: string;
	/** The frame the session opens on: ?frame= else selection else first. */
	start: string;
	scenario: string;
	/** Every frame in the composition with its authored geometry. */
	frames: Record<string, { w: number; h: number }>;
	/** The control-origin shell mounts this composed document in a native iframe. */
	shell?: true;
}

export interface PlayerBundle {
	/** The composition's entry module, by its served name. */
	entry: string;
	/**
	 * Every module the composition compiled to, by served name: the entry, one
	 * per frame, and the chunks they share. Names carry a content hash, so a
	 * name is the module and is cached forever.
	 */
	chunks: ReadonlyMap<string, string>;
	/**
	 * What each screen needs before it can mount: its own module and every
	 * static import under it, transitively. The document preloads the start
	 * screen's list, so the first paint waits on nothing it could have asked for
	 * sooner.
	 */
	screens: ReadonlyMap<string, readonly string[]>;
	/** Compiled Tailwind for the union of every frame's source closure. */
	css: string;
	fonts?: string | undefined;
	bundledCss?: string | undefined;
	/** shared/transitions.css verbatim — crossfades, morphs, direction types. */
	transitions?: string | undefined;
	importMap: object;
	names: string[];
	hash: string;
}

export type PlayerCompile =
	| { kind: "ok"; bundle: PlayerBundle; cache: "hit" | "miss" }
	| { kind: "error"; message: string };

/** A frame in the composition: leaf-name identity, page-aware folder (#39). */
export interface PlayerFrameRef {
	name: string;
	page?: string;
}

interface PlayerCacheEntry {
	stamp: string;
	inputs: string[];
	hash: string;
	bundle: PlayerBundle;
	/** The webfont resolution this bundle was assembled from (#80). */
	fonts: number;
	/** Frames serving a compile error in their own place rather than the player's. */
	broken: string[];
}

/**
 * How many retired bundles keep answering for their modules. A document served
 * before a rebuild still imports the chunk names it was served with, so a walk
 * taken in an open tab must find them after the daemon has moved on. Content
 * hashing keeps most names identical across rebuilds anyway; this covers the
 * ones that changed.
 */
const RETIRED_BUNDLES = 3;

/**
 * Compiles the whole project into its player bundle, content-hash cached like
 * the frame compiler: the frame-folder list rides the hash, so a frame born,
 * renamed, moved between pages, or trashed after the last compile is a miss,
 * not a stale player. The per-request config (start, scenario, geometry) never
 * enters the cache — a selection change re-assembles the document on the same
 * bundle. The player itself is page-blind: pages shape import paths here and
 * nothing else.
 *
 * The composition is split (#24): the entry knows every frame by a dynamic
 * import, and esbuild cuts each frame and whatever they share into its own
 * module. Playing one frame ships that frame's modules, and the rest arrive as
 * the session walks to them — or ahead of it, in the runtime's idle time.
 * Module identity still holds across the whole composition: a shared store is
 * one chunk, evaluated once, whichever screens reach it.
 */
export function createPlayerCompiler(version: string, webfonts: Webfonts = inertWebfonts()) {
	const cache = new Map<string, PlayerCacheEntry>();
	/** Bundles a root has served, newest first, so their modules stay answerable. */
	const served = new Map<string, PlayerBundle[]>();
	const contexts = new Map<string, PlayerContext>();
	/** One compile in flight per root: the shell and its iframe ask within the same second. */
	const inflight = new Map<string, Promise<PlayerCompile>>();

	function getBundle(root: string, frames: PlayerFrameRef[]): Promise<PlayerCompile> {
		const running = inflight.get(root);
		if (running !== undefined) return running;
		const compile = compileOrReuse(root, frames).finally(() => inflight.delete(root));
		inflight.set(root, compile);
		return compile;
	}

	async function compileOrReuse(root: string, frames: PlayerFrameRef[]): Promise<PlayerCompile> {
		const stamp = frames.map((ref) => frameFolder(ref.name, ref.page)).join("\n");
		try {
			// Match frame compilation: one canonical root covers imports, shared
			// assets, Tailwind inputs, and cache revalidation for this player build.
			const designDir = realDesignDir(root);
			// The webfont revision this bundle was built at retires it once a
			// machine that was offline resolves the faces it could not reach (#80).
			const cached = cache.get(root);
			if (
				cached !== undefined &&
				cached.stamp === stamp &&
				cached.fonts === webfonts.revision() &&
				hashInputs(version, stamp, cached.inputs, designDir) === cached.hash
			) {
				return { kind: "ok", bundle: cached.bundle, cache: "hit" };
			}
			const context = await contextFor(root, designDir, frames, stamp);
			const entry = await compilePlayer(version, designDir, frames, stamp, webfonts, context);
			// Match the frame compiler: a compile failure is never cached, so the
			// player recovers the instant the frame does. A stubbed build's inputs
			// cannot cover the broken frame's own closure, so revalidating against
			// them would strand the stub after the fix lands.
			if (entry.broken.length === 0) cache.set(root, entry);
			else cache.delete(root);
			retain(root, entry.bundle);
			return { kind: "ok", bundle: entry.bundle, cache: "miss" };
		} catch (error) {
			cache.delete(root);
			return { kind: "error", message: describeCompileError(error) };
		}
	}

	async function contextFor(
		root: string,
		designDir: string,
		frames: PlayerFrameRef[],
		stamp: string,
	): Promise<PlayerContext> {
		const held = contexts.get(root);
		if (held !== undefined && held.stamp === stamp && held.designDir === designDir) return held;
		if (held !== undefined) {
			contexts.delete(root);
			await held.context.dispose();
		}
		const fresh: PlayerContext = {
			stamp,
			designDir,
			context: await context(compositionOptions(designDir, playerEntry(frames, new Map()))),
		};
		contexts.set(root, fresh);
		return fresh;
	}

	function retain(root: string, bundle: PlayerBundle): void {
		const kept = (served.get(root) ?? []).filter((other) => other.hash !== bundle.hash);
		served.set(root, [bundle, ...kept].slice(0, RETIRED_BUNDLES + 1));
	}

	/** A compiled module by served name, from the current bundle or one lately retired. */
	function getChunk(root: string, name: string): string | undefined {
		for (const bundle of served.get(root) ?? []) {
			const chunk = bundle.chunks.get(name);
			if (chunk !== undefined) return chunk;
		}
		return undefined;
	}

	/** Whether this root has ever been played by this daemon, and so is worth warming. */
	function warmed(root: string): boolean {
		return served.has(root);
	}

	async function close(): Promise<void> {
		const open = [...contexts.values()];
		contexts.clear();
		await Promise.all(open.map((held) => held.context.dispose()));
	}

	return { getBundle, getChunk, warmed, close };
}

export type PlayerCompiler = ReturnType<typeof createPlayerCompiler>;

interface PlayerContext {
	stamp: string;
	designDir: string;
	context: BuildContext;
}

async function compilePlayer(
	version: string,
	designDir: string,
	frames: PlayerFrameRef[],
	stamp: string,
	webfonts: Webfonts,
	context: PlayerContext,
): Promise<PlayerCacheEntry> {
	// the same stamping compile as frame documents (#23): one dialect, one
	// pipeline, identical semantics whether a frame renders alone or composed
	const composed = await composePlayer(designDir, frames, context);
	const { sourceFiles, bundledCss } = composed.composition;

	const shared = join(designDir, "shared");
	const { css, stylesheets } = await buildFrameCss(designDir, sourceFiles);
	const resolvedFonts = await webfonts.resolve(readIfExists(join(shared, "fonts.css"), designDir));
	const { css: fonts, files: fontFiles } = inlineLocalFonts(designDir, resolvedFonts);
	const transitions = readIfExists(join(shared, "transitions.css"), designDir);
	const importMap = mergeImportMap(
		parseImportMap(readIfExists(join(shared, "importmap.json"), designDir)),
		importMapPins(),
	);

	const inputs = [
		...sourceFiles,
		...stylesheets,
		...fontFiles,
		join(shared, "fonts.css"),
		join(shared, "transitions.css"),
		join(shared, "importmap.json"),
	];
	const hash = hashInputs(version, stamp, inputs, designDir);
	const names = frames.map((ref) => ref.name);
	const { entry, chunks, screens } = composed.composition;
	return {
		stamp,
		inputs,
		hash,
		fonts: webfonts.revision(),
		broken: [...composed.broken.keys()],
		bundle: { entry, chunks, screens, css, fonts, bundledCss, transitions, importMap, names, hash },
	};
}

/** The split build of the composition: modules by served name, and what each screen needs. */
interface Composition {
	sourceFiles: string[];
	bundledCss?: string | undefined;
	entry: string;
	chunks: Map<string, string>;
	screens: Map<string, string[]>;
}

/**
 * Builds the composition, and when it will not build, works out which frames are
 * to blame and stands each of them down in its own place. One bad import used to
 * cost the whole player, including every frame that compiled perfectly well.
 *
 * The whole-project build is tried first and unchanged, so a healthy project pays
 * nothing for this. Blame is settled by compiling each frame alone rather than by
 * reading esbuild's error locations: a broken file under shared/ belongs to every
 * frame that reaches it, and only a real build knows which those are.
 */
async function composePlayer(
	designDir: string,
	frames: PlayerFrameRef[],
	context: PlayerContext,
): Promise<{ composition: Composition; broken: Map<string, string> }> {
	// No image budget here, and none in blameFrames either (#101). The budget
	// guards a frame document, because the canvas loads a page full of them; the
	// player is one document, loaded once. Applying it to the composition would
	// kill the whole player over the sum of frames that each fit their own
	// document — the exact whole-player failure this function exists to prevent.
	const none = new Map<string, string>();
	try {
		// The healthy build rides the held context: esbuild keeps what it parsed
		// last time and re-reads only what changed, so an edit costs its own file.
		return { composition: readComposition(designDir, frames, await context.context.rebuild()), broken: none };
	} catch (error) {
		// A design-boundary escape is not an authoring mistake to be shown on one
		// screen. It fails the player whole and says nothing about what it read.
		if (isDesignBoundaryFailure(error)) throw error;
		const broken = await blameFrames(designDir, frames);
		// Nothing frame-shaped to blame — a broken importmap, a Tailwind failure —
		// so the player fails whole, as it should.
		if (broken.size === 0) throw error;
		// A stubbed build is a one-off: it is never cached, and the context stays
		// on the whole composition, ready for the fix.
		const result = await build(compositionOptions(designDir, playerEntry(frames, broken)));
		return { composition: readComposition(designDir, frames, result), broken };
	}
}

/** The composition's esbuild options: the design compile, split at every frame. */
function compositionOptions(designDir: string, contents: string) {
	return {
		...designBuildOptions({
			designDir,
			resolveDir: designDir,
			sourcefile: STDIN_NAME,
			contents,
			label: "the player",
		}),
		splitting: true as const,
		entryNames: "play-[hash]",
		chunkNames: "[dir]/[name]-[hash]",
	};
}

/**
 * Reads a split build into served modules. Every output is a module under the
 * chunk route; the frame ones are found by the entry point esbuild recorded for
 * each dynamic import, and a screen's list is that module plus everything it
 * statically imports, walked to the leaves. Externals — react, the runtime —
 * come through the import map and are nobody's to preload here.
 */
function readComposition(designDir: string, frames: PlayerFrameRef[], result: BuildResult): Composition {
	const { metafile, outputFiles } = result;
	if (metafile === undefined || outputFiles === undefined) throw new Error("the player compiled to nothing");
	const entryKey = designEntryKey({ designDir, resolveDir: designDir, sourcefile: STDIN_NAME });
	const sourceFiles = Object.keys(metafile.inputs)
		.filter((input) => input !== entryKey)
		.map((input) => resolve(designDir, input));
	const chunks = new Map<string, string>();
	let bundledCss: string | undefined;
	for (const file of outputFiles) {
		const name = designOutputName(designDir, file.path);
		if (name.endsWith(".css")) {
			bundledCss = bundledCss === undefined ? file.text : `${bundledCss}\n${file.text}`;
			continue;
		}
		chunks.set(name, file.text);
	}
	// metafile paths are relative to absWorkingDir; served names hang off the outdir
	const outputs = new Map<string, { entryPoint?: string | undefined; imports: readonly string[] }>();
	let entry: string | undefined;
	for (const [path, output] of Object.entries(metafile.outputs)) {
		const name = designOutputName(designDir, resolve(designDir, path));
		if (!name.endsWith(".js")) continue;
		const imports = output.imports
			.filter((edge) => edge.kind === "import-statement" && edge.external !== true)
			.map((edge) => designOutputName(designDir, resolve(designDir, edge.path)));
		outputs.set(name, { entryPoint: output.entryPoint, imports });
		if (output.entryPoint === entryKey) entry = name;
	}
	if (entry === undefined) throw new Error("the player compiled to no entry module");
	const byEntry = new Map<string, string>();
	for (const [name, output] of outputs) {
		if (output.entryPoint !== undefined) byEntry.set(output.entryPoint, name);
	}
	const closure = (name: string): string[] => {
		const seen = new Set<string>();
		const walk = (module: string) => {
			if (seen.has(module)) return;
			seen.add(module);
			for (const imported of outputs.get(module)?.imports ?? []) walk(imported);
		};
		walk(name);
		return [...seen];
	};
	const screens = new Map<string, string[]>();
	for (const ref of frames) {
		const module = byEntry.get(`${frameFolder(ref.name, ref.page)}/frame.tsx`);
		// a stubbed frame has no module of its own: its screen is in the entry
		screens.set(ref.name, module === undefined ? [] : closure(module));
	}
	return { sourceFiles, bundledCss, entry, chunks, screens };
}

/** Compiles each frame alone to find the ones that cannot build, with their errors. */
async function blameFrames(designDir: string, frames: PlayerFrameRef[]): Promise<Map<string, string>> {
	const verdicts = await Promise.all(
		frames.map(async (ref) => {
			const folder = frameFolder(ref.name, ref.page);
			try {
				await buildDesignEntry({
					designDir,
					resolveDir: designDir,
					sourcefile: STDIN_NAME,
					// The default export is what the composition takes, so take it here too.
					contents: `import frame from ${JSON.stringify(`./${folder}/frame.tsx`)};\nexport default frame;\n`,
					label: `frame "${ref.name}"`,
				});
				return undefined;
			} catch (error) {
				return [ref.name, describeCompileError(error)] as const;
			}
		}),
	);
	return new Map(verdicts.filter((verdict): verdict is readonly [string, string] => verdict !== undefined));
}

/**
 * The composition: every frame known to the runtime's player boot by a loader
 * that imports it, so esbuild cuts each into its own module and a screen is
 * fetched when the session first needs it. A frame that would not compile is
 * not imported at all — it arrives as the runtime stand-in carrying its own
 * error, which is what makes the failure local to it.
 */
function playerEntry(frames: PlayerFrameRef[], broken: Map<string, string>): string {
	const entries = frames.map((ref) => {
		const folder = frameFolder(ref.name, ref.page);
		const error = broken.get(ref.name);
		if (error === undefined) {
			return `[${JSON.stringify(ref.name)}, { load: () => import(${JSON.stringify(`./${folder}/frame.tsx`)}) }]`;
		}
		const details = { frame: ref.name, file: `design/${folder}/frame.tsx`, error };
		return `[${JSON.stringify(ref.name)}, brokenFrame(${JSON.stringify(details)})]`;
	});
	const boot = broken.size === 0 ? "bootPlayer" : "bootPlayer, brokenFrame";
	return `import { ${boot} } from "spool";
bootPlayer(Object.fromEntries([${entries.join(", ")}]));
`;
}

/** The document's identity: the compiled bundle plus this request's config. */
export function playerEtag(bundle: PlayerBundle, config: PlayerConfig): string {
	return `"${createHash("sha256").update(bundle.hash).update(JSON.stringify(config)).digest("hex").slice(0, 32)}"`;
}

export function assemblePlayerDocument(config: PlayerConfig, bundle: PlayerBundle): string {
	const fontsBlock = bundle.fonts === undefined ? "" : `<style>${escapeInlineStyle(bundle.fonts)}</style>\n`;
	const bundledBlock =
		bundle.bundledCss === undefined ? "" : `<style>${escapeInlineStyle(bundle.bundledCss)}</style>\n`;
	const transitionsBlock =
		bundle.transitions === undefined ? "" : `<style>${escapeInlineStyle(bundle.transitions)}</style>\n`;
	const base = playerChunkBase(config.project);
	// The entry and the first screen's modules are asked for before the parser
	// reaches the script that imports them: one round of fetches, all in flight
	// at once, instead of the waterfall a dynamic import would discover.
	const preload = [bundle.entry, ...(bundle.screens.get(config.start) ?? [])]
		.map((name) => `<link rel="modulepreload" href="${escapeHtml(base + name)}">`)
		.join("\n");
	const entryUrl = JSON.stringify(base + bundle.entry);
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${escapeHtml(config.start)} · ${escapeHtml(config.project)}</title>
<script>window.__SPOOL_PLAY__ = JSON.parse(${escapeJsonScript(JSON.stringify(config))})</script>
<style>html, body, #root { height: 100%; }</style>
<style>${escapeInlineStyle(bundle.css)}</style>
${fontsBlock}${bundledBlock}
${config.shell === true ? "" : `<style>${escapeInlineStyle(CHROME_CSS)}</style>`}
${transitionsBlock}<script type="importmap">${escapeJsonScript(bundle.importMap)}</script>
${preload}
</head>
<body>
<div id="root"><div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#8e8c88;font:400 12px/18px ui-monospace,monospace">booting</div></div>
${config.shell === true ? '<script type="module">import "spool";</script>\n' : ""}<script type="module">import ${escapeInlineScript(entryUrl)};</script>
</body>
</html>
`;
}

/** The chrome's one font: the slate, the readouts, and the rail are mono (#13 law 3). */
const CHROME_FONT_FILES: Record<string, string> = {
	"fragment-mono-latin-400-normal.woff2": createRequire(import.meta.url).resolve(
		"@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2",
	),
};

export function chromeFontFile(name: string): string | undefined {
	return CHROME_FONT_FILES[name];
}

/**
 * The played page (#227): near-black page, the frame laid out at the real
 * viewport width and capped at its authored width, centred on that background.
 * No fit and no scale — the document is the document. Solid fills and
 * hairlines, never blur or shadows (#13 law 4). The screen carries a
 * view-transition-name, so a screen swap films the screen and never the chrome.
 */
export function playerChromeCss(fontBase = "/vendor/fonts/"): string {
	return CHROME_CSS.replaceAll("/vendor/fonts/", fontBase);
}

const CHROME_CSS = `:root { color-scheme: dark; }
@font-face {
	font-family: "Fragment Mono";
	font-style: normal;
	font-weight: 400;
	font-display: swap;
	src: url("/vendor/fonts/fragment-mono-latin-400-normal.woff2") format("woff2");
}
/* the page is as tall as its content and the browser scrolls it: no clipped
   body, no scroll container of spool's own (#227) */
body { margin: 0; background: #0e0e0e; }
#root, .spool-page { min-height: 100vh; }
/* a grid so the screen is a stretched item: it has a definite height for the
   frame's own \`height: 100%\` to resolve against, and still grows past the
   viewport when the content does */
.spool-page { position: relative; display: grid; }
/* the frame's own document, centred on the page's background. Its width is set
   from script — the authored width as a cap, the viewport below it — and its
   height is whatever its content is. The chrome's typography stops at the
   chrome: this is the screen's ancestor, so anything set here would inherit
   into the frame and break the parity law */
.spool-screen {
	position: relative;
	z-index: 0;
	isolation: isolate;
	margin: 0 auto;
	min-height: 100vh;
	color-scheme: light;
	color: #000;
	background: #fff;
	view-transition-name: spool-screen;
}
/* the outward-link confirmation is modal, and this page scrolls: pinned to the
   window rather than to the page, or a tall document puts it out of sight */
.spool-page > .spool-external-backdrop { position: fixed; }
.spool-player-error {
	box-sizing: border-box;
	width: 100%;
	min-height: 100vh;
	padding: 24px;
	background: #111110;
	color: #b5b3ad;
	font: 400 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.spool-player-error strong { display: block; margin-bottom: 16px; color: #f5391a; font-weight: 400; }
.spool-player-error pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
.spool-player-escape { display: inline-block; margin-top: 16px; color: #f0efed; text-decoration: underline; text-underline-offset: 3px; }
/* the bar along the top (#275, #227): 30px, worn by both shells. In the app it
   is the window's title bar with the traffic lights inset into it; in a tab it
   is the same strip, and the eye on it puts it away. Permanent rather than
   summoned, which is the trade: 30px of page for a name that is always
   readable and a switcher that never has to be found */
.spool-page.has-bar { box-sizing: border-box; padding-top: 30px; }
.spool-page.has-bar .spool-screen { min-height: calc(100vh - 30px); }
.spool-top {
	position: fixed;
	inset: 0 0 auto;
	z-index: 10;
	/* its hairline is inside its 30px, so the page's inset and the bar agree */
	box-sizing: border-box;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 0 12px 0 16px;
	background: #282828;
	border-bottom: 1px solid #363636;
	color: #f0efed;
	font: 400 12px/1 "Fragment Mono", ui-monospace, monospace;
	-webkit-font-smoothing: antialiased;
	font-synthesis: none;
}
/* the first 76px are the OS's: three lights, inset by trafficLightPosition —
   and this bar is the window's title bar, so a hand on it moves the window */
.spool-top.is-desk { padding-left: 76px; -webkit-app-region: drag; }
.spool-top.is-desk button, .spool-top.is-desk .spool-picker { -webkit-app-region: no-drag; }
/* full height, so the picker opens flush under the bar rather than under a button */
.spool-top .spool-bar-switcher { align-self: stretch; align-items: center; }
.spool-bar-rule { flex: none; width: 1px; height: 14px; background: #363636; }
.spool-bar-back {
	display: flex;
	align-items: center;
	flex: none;
	gap: 4px;
	padding: 4px 6px;
	border-radius: 4px;
	background: none;
	border: 0;
	color: #8e8c88;
	font: inherit;
	font-size: 10px;
	text-decoration: none;
	cursor: pointer;
}
.spool-bar-back:hover { background: #1c1c1c; color: #f0efed; }
.spool-bar-switcher { position: relative; display: flex; }
.spool-bar-frame {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0 -6px;
	padding: 4px 6px;
	background: none;
	border: 0;
	border-radius: 4px;
	color: inherit;
	font: inherit;
	cursor: pointer;
}
.spool-bar-frame:hover { background: #1c1c1c; }
.spool-bar-project { color: #8e8c88; }
.spool-bar-name { white-space: nowrap; }
.spool-bar-chevron { color: #8e8c88; transition: rotate 150ms ease; }
.spool-bar-chevron.is-open { rotate: 180deg; }
.spool-bar-end { display: flex; align-items: center; gap: 12px; margin-left: auto; }
.spool-bar-hint { color: #8e8c88; font-size: 10px; white-space: nowrap; }
/* said while the screen is on its way: the compile and the first fetch happen
   behind the bar, and a box with nothing in it says nothing */
.spool-bar-loading { animation: spool-bar-loading 1.2s ease-in-out infinite; }
@keyframes spool-bar-loading { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .spool-bar-loading { animation: none; } }
/* the eye and the close: one box each, lit on hover */
.spool-bar-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: none;
	width: 20px;
	height: 20px;
	margin: 0;
	padding: 0;
	background: none;
	border: 0;
	border-radius: 4px;
	color: #8e8c88;
	cursor: pointer;
}
.spool-bar-icon:hover { background: #1c1c1c; color: #f0efed; }
/* the bar put away (#227): the strip is where it was, the nub is its trace,
   and the bar sits inside the strip so hovering either is one hover. Resting
   there peeks it in over the page; leaving takes it away; pressing the nub
   puts it back on */
.spool-peek { position: fixed; inset: 0 0 auto; z-index: 10; height: 6px; }
.spool-nub {
	position: absolute;
	top: 0;
	left: 50%;
	width: 40px;
	height: 3px;
	margin: 0 0 0 -20px;
	padding: 0;
	border: 0;
	border-radius: 0 0 999px 999px;
	background: #363636;
	opacity: 0.7;
	cursor: pointer;
	transition: opacity 200ms ease;
}
.spool-peek.is-open .spool-nub { opacity: 0; }
.spool-peek .spool-top {
	translate: 0 -100%;
	opacity: 0;
	pointer-events: none;
	transition: translate 200ms ease-out, opacity 200ms ease-out;
}
.spool-peek.is-open .spool-top { translate: 0 0; opacity: 1; pointer-events: auto; }
/* the switcher, closed by default: that is how it will be seen nine times in ten */
.spool-picker {
	position: absolute;
	top: 100%;
	left: -6px;
	z-index: 1;
	width: 212px;
	overflow: hidden;
	background: #161616;
	border: 1px solid #363636;
	border-top: 0;
	border-radius: 0 0 12px 12px;
	translate: 0 -4px;
	opacity: 0;
	pointer-events: none;
	transition: translate 150ms ease, opacity 150ms ease;
}
.spool-picker.is-open { translate: 0 0; opacity: 1; pointer-events: auto; }
.spool-picker-list { display: flex; flex-direction: column; max-height: 320px; overflow: auto; padding: 6px; }
.spool-picker-row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	background: none;
	border: 0;
	border-radius: 4px;
	color: #8e8c88;
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.spool-picker-row:hover { background: #1c1c1c; color: #f0efed; }
.spool-picker-row.is-here { color: #f0efed; }
.spool-dash { flex: none; width: 8px; height: 2px; background: transparent; }
.spool-picker-row.is-here .spool-dash { background: #f5391a; }
.spool-picker-foot { display: block; padding: 8px 14px; border-top: 1px solid #262626; color: #8e8c88; font-size: 10px; }
.spool-desk-restored { display: flex; align-items: center; gap: 8px; color: #8e8c88; font-size: 10px; }
.spool-dash.is-lit { background: #f5391a; }
.spool-desk-reset {
	margin: 0;
	padding: 0;
	background: none;
	border: 0;
	color: #8e8c88;
	font: inherit;
	text-decoration: underline;
	text-underline-offset: 2px;
	cursor: pointer;
}
.spool-desk-reset:hover { color: #f0efed; }
`;
