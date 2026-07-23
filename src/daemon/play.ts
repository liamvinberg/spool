import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { buildDesignEntry, describeCompileError, hashInputs, parseImportMap } from "./compile";
import { escapeHtml, escapeInlineScript, escapeInlineStyle, escapeJsonScript, mergeImportMap } from "./document";
import { readIfExists } from "./project-files";
import { frameFolder } from "./projection";
import { buildFrameCss } from "./tailwind";
import { importMapPins } from "./vendor";

/**
 * The player page (#24): one light document under /play/ composing every frame
 * component, because View Transitions cannot cross iframe boundaries — same-
 * document VT with view-transition-name matching is the whole point. The
 * daemon compiles the composition; the flow runtime (served as "spool" through
 * the same import map pin frames already use) boots it, swaps screens, and
 * owns the stage chrome. None of the canvas SPA rides along.
 */

const STDIN_NAME = "<spool-play>";

export interface PlayerConfig {
	project: string;
	/** The frame the session opens on: ?frame= else selection else first. */
	start: string;
	scenario: string;
	/** Every frame in the composition with its authored geometry. */
	frames: Record<string, { w: number; h: number }>;
	/**
	 * Per frame, the data-spool-source stamps of elements whose code navigates
	 * (#34): ui.go carriers the hint toggle cannot find by attribute — data-go
	 * carriers are queried live in the DOM. Frames with none are omitted.
	 */
	hints: Record<string, string[]>;
	/** Terminal frames as static grids from the daemon-held buffer (#42). */
	terminals?: Record<string, { svg: string }>;
}

export interface PlayerBundle {
	bootJs: string;
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
}

/**
 * Compiles the whole project into its player bundle, content-hash cached like
 * the frame compiler: the frame-folder list rides the hash, so a frame born,
 * renamed, moved between pages, or trashed after the last compile is a miss,
 * not a stale player. The per-request config (start, scenario, geometry) never
 * enters the cache — a selection change re-assembles the document on the same
 * bundle. The player itself is page-blind: pages shape import paths here and
 * nothing else.
 */
export function createPlayerCompiler(version: string) {
	const cache = new Map<string, PlayerCacheEntry>();

	async function getBundle(root: string, frames: PlayerFrameRef[]): Promise<PlayerCompile> {
		const stamp = frames.map((ref) => frameFolder(ref.name, ref.page)).join("\n");
		const cached = cache.get(root);
		if (cached !== undefined && cached.stamp === stamp && hashInputs(version, stamp, cached.inputs) === cached.hash) {
			return { kind: "ok", bundle: cached.bundle, cache: "hit" };
		}

		try {
			const entry = await compilePlayer(version, root, frames, stamp);
			cache.set(root, entry);
			return { kind: "ok", bundle: entry.bundle, cache: "miss" };
		} catch (error) {
			cache.delete(root);
			return { kind: "error", message: describeCompileError(error) };
		}
	}

	return { getBundle };
}

export type PlayerCompiler = ReturnType<typeof createPlayerCompiler>;

async function compilePlayer(
	version: string,
	root: string,
	frames: PlayerFrameRef[],
	stamp: string,
): Promise<PlayerCacheEntry> {
	const designDir = join(root, "design");
	// the same stamping compile as frame documents (#23): one dialect, one
	// pipeline, identical semantics whether a frame renders alone or composed
	const { sourceFiles, bootJs, bundledCss } = await buildDesignEntry({
		designDir,
		resolveDir: designDir,
		sourcefile: STDIN_NAME,
		contents: playerEntry(frames),
		label: "the player",
	});

	const shared = join(designDir, "shared");
	const { css, stylesheets } = await buildFrameCss(designDir, sourceFiles);
	const fonts = readIfExists(join(shared, "fonts.css"));
	const transitions = readIfExists(join(shared, "transitions.css"));
	const importMap = mergeImportMap(parseImportMap(readIfExists(join(shared, "importmap.json"))), importMapPins());

	const inputs = [
		...sourceFiles,
		...stylesheets,
		join(shared, "fonts.css"),
		join(shared, "transitions.css"),
		join(shared, "importmap.json"),
	];
	const hash = hashInputs(version, stamp, inputs);
	const names = frames.map((ref) => ref.name);
	return { stamp, inputs, hash, bundle: { bootJs, css, fonts, bundledCss, transitions, importMap, names, hash } };
}

/** The composition: every frame imported, handed to the runtime's player boot. */
function playerEntry(frames: PlayerFrameRef[]): string {
	const imports = frames
		.map((ref, i) => `import f${i} from ${JSON.stringify(`./${frameFolder(ref.name, ref.page)}/frame.tsx`)};`)
		.join("\n");
	const map = frames.map((ref, i) => `${JSON.stringify(ref.name)}: f${i}`).join(", ");
	return `import { bootPlayer } from "spool";
${imports}
bootPlayer({ ${map} });
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
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${escapeHtml(config.project)} · spool</title>
<script>window.__SPOOL_PLAY__ = ${escapeJsonScript(config)}</script>
<style>${escapeInlineStyle(bundle.css)}</style>
${fontsBlock}${bundledBlock}<style>${escapeInlineStyle(CHROME_CSS)}</style>
${transitionsBlock}<script type="importmap">${escapeJsonScript(bundle.importMap)}</script>
</head>
<body>
<div id="root"><div class="spool-boot">booting</div></div>
<script type="module">${escapeInlineScript(bundle.bootJs)}</script>
</body>
</html>
`;
}

/** The chrome's one font: the pill and readouts are mono (#13 law 3). */
const CHROME_FONT_FILES: Record<string, string> = {
	"fragment-mono-latin-400-normal.woff2": createRequire(import.meta.url).resolve(
		"@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2",
	),
};

export function chromeFontFile(name: string): string | undefined {
	return CHROME_FONT_FILES[name];
}

/**
 * The stage and pill, verbatim from Paper screens v1 "05 · player": near-black
 * stage, frame letterboxed at native size (top 28px) or scaled to fill when
 * the viewport is smaller, one flat raised pill bottom-center — solid fills
 * and hairlines, never blur or shadows (#13 law 4). The pill carries its own
 * view-transition-name so screen transitions never smear the chrome.
 */
const CHROME_CSS = `:root { color-scheme: dark; }
@font-face {
	font-family: "Fragment Mono";
	font-style: normal;
	font-weight: 400;
	font-display: swap;
	src: url("/vendor/fonts/fragment-mono-latin-400-normal.woff2") format("woff2");
}
@font-face {
	font-family: "JetBrains Mono";
	font-style: normal;
	font-weight: 400;
	font-display: swap;
	src: url("/vendor/fonts/jetbrains-mono-latin-400-normal.woff2") format("woff2");
}
@font-face {
	font-family: "JetBrains Mono";
	font-style: normal;
	font-weight: 700;
	font-display: swap;
	src: url("/vendor/fonts/jetbrains-mono-latin-700-normal.woff2") format("woff2");
}
html, body, #root { height: 100%; }
body { margin: 0; background: #0e0e0e; overflow: hidden; }
/* a terminal screen (#42): the daemon's grid, verbatim — the svg is the pixels */
.spool-term-screen { height: 100%; background: #111110; }
.spool-term-screen svg { display: block; }
.spool-boot {
	position: fixed;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	color: #8e8c88;
	font: 400 12px/18px "Fragment Mono", ui-monospace, monospace;
}
.spool-stage { position: relative; width: 100%; height: 100%; }
.spool-screen {
	position: absolute;
	top: 0;
	left: 0;
	transform-origin: top left;
	/* a frame document's environment, reproduced: light UA defaults, black
	   text — the same screen must render identically here and in a canvas
	   iframe, whatever scheme the chrome runs */
	color-scheme: light;
	color: #000;
	background: #fff;
	border: 1px solid #363636;
	border-radius: 12px;
	overflow: clip;
	view-transition-name: spool-screen;
}
/* the scroller is a separate, untransformed element: an iframe'd frame
   scrolls when its content overflows, while position: fixed stays pinned to
   the frame edge — fixed content contains to the transformed screen above,
   escaping this element's scroll exactly like it escapes a body's */
.spool-screen-scroll {
	width: 100%;
	height: 100%;
	overflow: auto;
	overscroll-behavior: contain;
}
.spool-pill {
	position: fixed;
	bottom: 28px;
	left: 50%;
	translate: -50%;
	z-index: 10;
	display: flex;
	align-items: center;
	gap: 3px;
	padding: 6px 8px;
	background: #282828;
	border: 1px solid #363636;
	border-radius: 8px;
	color: #8e8c88;
	font: 400 12px/18px "Fragment Mono", ui-monospace, monospace;
	view-transition-name: spool-pill;
}
.spool-pill button {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: none;
	margin: 0;
	padding: 6px;
	background: none;
	border: 0;
	border-radius: 6px;
	color: inherit;
	cursor: pointer;
}
.spool-pill button:hover { background: #1c1c1c; }
.spool-pill button:disabled { background: none; opacity: 0.4; cursor: default; }
.spool-stack { display: flex; align-items: center; gap: 5px; padding: 0 3px; flex: none; white-space: nowrap; }
.spool-stack .is-current { color: #f0efed; }
.spool-rule { width: 1px; height: 18px; background: #363636; flex: none; }
.spool-motion, .spool-hint-toggle { padding: 4px 8px; }
.spool-motion.is-on, .spool-hint-toggle.is-on { background: #1c1c1c; color: #f0efed; }
/* the hint layer (#34): thread-red outlines over navigating elements — one
   style, overlay chrome only, never a hit target */
.spool-hints { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.spool-hint { position: absolute; box-sizing: border-box; border: 1.5px solid #f5391a; }
`;
