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
 * The stage, the slate HUD, and the session rail, from the design canvas frame
 * `spool-player--inspector` (#60): near-black stage, the frame letterboxed at
 * native size or scaled to fill a smaller viewport, chrome scattered into the
 * screen corners with no containers at all, and the session on demand as a
 * 320px rail the stage recenters against. Solid fills and hairlines, never blur
 * or shadows (#13 law 4). The HUD and the rail each carry a view-transition-
 * name, so a screen transition films the screen and never smears the chrome.
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
/* a terminal screen (#44): the live term document over the daemon's grid as
   boot poster — the iframe covers the poster the moment it paints */
.spool-term-screen { position: relative; height: 100%; background: #111110; }
.spool-term-screen svg { display: block; }
.spool-term-poster { position: absolute; inset: 0; }
.spool-term-screen iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
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
/* the chrome's typography stops at the chrome: the stage is the screen's
   ancestor, so anything set there would inherit into the frame and break the
   parity law — a frame must render identically here and in a canvas iframe */
.spool-hud, .spool-rail {
	color: #f0efed;
	font: 400 12px/18px "Fragment Mono", ui-monospace, monospace;
	-webkit-font-smoothing: antialiased;
	font-synthesis: none;
}
/* sleep is the resting state (#60): stillness fades every piece of chrome
   together and takes the cursor with it; the next mousemove wakes it */
.spool-stage.is-asleep { cursor: none; }
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
.spool-screen.is-terminal { color-scheme: dark; background: #111110; }
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
.spool-screen-scroll.is-terminal { overflow: hidden; }
/* the HUD: no containers, only marks in the stage's corners */
.spool-hud {
	position: fixed;
	inset: 0;
	z-index: 10;
	pointer-events: none;
	transition: opacity 300ms ease;
	view-transition-name: spool-hud;
}
/* asleep is gone, not merely invisible: a faded button must never take a click
   the prototype's own top-left control was meant to get */
.spool-stage.is-asleep .spool-hud { opacity: 0; }
.spool-stage.is-asleep .spool-hud-lead, .spool-stage.is-asleep .spool-hud-trail { pointer-events: none; }
.spool-hud-lead, .spool-hud-trail { position: absolute; top: 20px; display: flex; align-items: center; pointer-events: auto; }
.spool-hud-lead { left: 24px; gap: 10px; }
.spool-hud-trail { gap: 4px; }
.spool-hud-verbs { display: flex; align-items: center; gap: 4px; }
.spool-hud-button {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: none;
	margin: 0;
	padding: 0;
	width: 28px;
	height: 28px;
	background: none;
	border: 0;
	border-radius: 6px;
	color: #8e8c88;
	cursor: pointer;
}
.spool-hud-button:hover { background: #1c1c1c; }
.spool-hud-button.is-on { color: #f0efed; }
.spool-hud-button:disabled { background: none; opacity: 0.4; cursor: default; }
/* the name slate: the project over the frame the session stands in — the only
   live location readout there is, the walked trail lives in the rail */
.spool-slate { display: flex; flex-direction: column; gap: 4px; white-space: nowrap; }
.spool-slate-project { font-size: 10px; line-height: 1; color: #8e8c88; }
.spool-slate-frame { display: flex; align-items: center; gap: 8px; line-height: 1; }
.spool-dash { flex: none; width: 8px; height: 2px; background: #f5391a; }
.spool-readout { position: absolute; bottom: 20px; left: 24px; font-size: 10px; line-height: 1; color: #8e8c88; }
/* registration ticks: the screen's corners called out on the stage, the way a
   drafting sheet marks a plate */
.spool-ticks { position: absolute; pointer-events: none; }
.spool-ticks i { position: absolute; width: 10px; height: 10px; border: 0 solid #363636; }
.spool-ticks i:nth-child(1) { top: 0; left: 0; border-top-width: 1px; border-left-width: 1px; }
.spool-ticks i:nth-child(2) { top: 0; right: 0; border-top-width: 1px; border-right-width: 1px; }
.spool-ticks i:nth-child(3) { bottom: 0; left: 0; border-bottom-width: 1px; border-left-width: 1px; }
.spool-ticks i:nth-child(4) { bottom: 0; right: 0; border-bottom-width: 1px; border-right-width: 1px; }
/* the rail: the session as an instrument, closed until asked for */
.spool-rail {
	position: fixed;
	top: 0;
	right: 0;
	bottom: 0;
	z-index: 11;
	display: flex;
	flex-direction: column;
	width: 320px;
	overflow: hidden;
	background: #161616;
	border-left: 1px solid #262626;
	transition: translate 300ms ease, opacity 300ms ease;
	view-transition-name: spool-rail;
}
.spool-rail.is-closed { translate: 100% 0; opacity: 0; pointer-events: none; }
/* sections stack from the top and give up height in the same order a reader
   would: each list scrolls inside its own section rather than pushing the
   others off the rail */
.spool-rail-section { display: flex; flex-direction: column; flex: 0 1 auto; gap: 10px; padding: 16px 20px; min-height: 0; }
.spool-rail-section + .spool-rail-section, .spool-rail-quiet.is-section { border-top: 1px solid #262626; }
.spool-rail-head { display: flex; flex: none; align-items: center; justify-content: space-between; }
.spool-rail-head h2 { margin: 0; font-size: 10px; line-height: 1; font-weight: 400; color: #8e8c88; }
.spool-rail-head span { font-size: 10px; line-height: 1; color: #8e8c88; }
.spool-rail-section ol, .spool-rail-section ul, .spool-rail-section dl {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
	overflow-y: auto;
	overscroll-behavior: contain;
}
.spool-rail-quiet { margin: 0; padding: 16px 20px; color: #8e8c88; }
.spool-rail-quiet:not(.is-section) { padding: 0; }
.spool-rail-row { display: flex; align-items: center; gap: 8px; }
.spool-rail-key { flex: none; color: #8e8c88; }
.spool-rail-value { margin: 0 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* one shape for every row you can press: the hit area bleeds into the rail's
   padding so the highlight reads as a full-width band */
.spool-rail-row.is-button, .spool-walk-hop {
	display: flex;
	align-items: center;
	gap: 8px;
	width: calc(100% + 12px);
	margin: -2px -6px;
	padding: 2px 6px;
	background: none;
	border: 0;
	border-radius: 4px;
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.spool-rail-row.is-button { color: inherit; }
.spool-rail-row.is-button:hover, .spool-walk-hop:hover { background: #1c1c1c; }
/* the tape scrubs: an earlier hop is a place the session can stand again */
.spool-walk-edge { padding-left: 12px; font-size: 10px; line-height: 14px; color: #8e8c88; }
.spool-walk-hop { color: #8e8c88; }
.spool-walk-hop:hover { color: #f0efed; }
.spool-walk-hop:disabled { background: none; color: #f0efed; cursor: default; }
.spool-walk-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spool-walk-at { margin-left: auto; flex: none; font-size: 10px; color: #8e8c88; }
.spool-mock li { display: flex; align-items: center; gap: 8px; }
.spool-mock-method { flex: none; width: 36px; color: #8e8c88; }
.spool-mock-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spool-mock-meta { margin-left: auto; flex: none; font-size: 10px; color: #8e8c88; }
.spool-rail-foot { margin-top: auto; padding: 16px 20px; border-top: 1px solid #262626; }
`;
