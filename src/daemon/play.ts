import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
	buildDesignEntry,
	type DesignBundle,
	describeCompileError,
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

export interface PlayerConfig {
	project: string;
	projectCapability: string;
	/** The frame the session opens on: ?frame= else selection else first. */
	start: string;
	scenario: string;
	/** Every frame in the composition with its authored geometry. */
	frames: Record<string, { w: number; h: number }>;
	/** Terminal frames as static grids from the daemon-held buffer (#42). */
	terminals?: Record<string, { svg: string }>;
	/** The control-origin shell mounts this composed document in a native iframe. */
	shell?: true;
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
	/** The webfont resolution this bundle was assembled from (#80). */
	fonts: number;
	/** Frames serving a compile error in their own place rather than the player's. */
	broken: string[];
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
export function createPlayerCompiler(version: string, webfonts: Webfonts = inertWebfonts()) {
	const cache = new Map<string, PlayerCacheEntry>();

	async function getBundle(root: string, frames: PlayerFrameRef[]): Promise<PlayerCompile> {
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
			const entry = await compilePlayer(version, designDir, frames, stamp, webfonts);
			// Match the frame compiler: a compile failure is never cached, so the
			// player recovers the instant the frame does. A stubbed build's inputs
			// cannot cover the broken frame's own closure, so revalidating against
			// them would strand the stub after the fix lands.
			if (entry.broken.length === 0) cache.set(root, entry);
			else cache.delete(root);
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
	designDir: string,
	frames: PlayerFrameRef[],
	stamp: string,
	webfonts: Webfonts,
): Promise<PlayerCacheEntry> {
	// the same stamping compile as frame documents (#23): one dialect, one
	// pipeline, identical semantics whether a frame renders alone or composed
	const composed = await composePlayer(designDir, frames);
	const { sourceFiles, bootJs, bundledCss } = composed.bundle;

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
	return {
		stamp,
		inputs,
		hash,
		fonts: webfonts.revision(),
		broken: [...composed.broken.keys()],
		bundle: { bootJs, css, fonts, bundledCss, transitions, importMap, names, hash },
	};
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
): Promise<{ bundle: DesignBundle; broken: Map<string, string> }> {
	// No image budget here, and none in blameFrames either (#101). The budget
	// guards a frame document, because the canvas loads a page full of them; the
	// player is one document, loaded once. Applying it to the composition would
	// kill the whole player over the sum of frames that each fit their own
	// document — the exact whole-player failure this function exists to prevent.
	const build = (broken: Map<string, string>) =>
		buildDesignEntry({
			designDir,
			resolveDir: designDir,
			sourcefile: STDIN_NAME,
			contents: playerEntry(frames, broken),
			label: "the player",
		});
	const none = new Map<string, string>();
	try {
		return { bundle: await build(none), broken: none };
	} catch (error) {
		// A design-boundary escape is not an authoring mistake to be shown on one
		// screen. It fails the player whole and says nothing about what it read.
		if (isDesignBoundaryFailure(error)) throw error;
		const broken = await blameFrames(designDir, frames);
		// Nothing frame-shaped to blame — a broken importmap, a Tailwind failure —
		// so the player fails whole, as it should.
		if (broken.size === 0) throw error;
		return { bundle: await build(broken), broken };
	}
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
 * The composition: every frame imported, handed to the runtime's player boot. A
 * frame that would not compile is not imported at all — it arrives as the runtime
 * stand-in carrying its own error, which is what makes the failure local to it.
 */
function playerEntry(frames: PlayerFrameRef[], broken: Map<string, string>): string {
	const bindings = frames.map((ref, i) => {
		const folder = frameFolder(ref.name, ref.page);
		const error = broken.get(ref.name);
		if (error === undefined) {
			return { import: `import f${i} from ${JSON.stringify(`./${folder}/frame.tsx`)};`, stub: undefined };
		}
		const details = { frame: ref.name, file: `design/${folder}/frame.tsx`, error };
		return { import: undefined, stub: `const f${i} = brokenFrame(${JSON.stringify(details)});` };
	});
	const imported = bindings.flatMap((binding) => (binding.import === undefined ? [] : [binding.import]));
	const stubs = bindings.flatMap((binding) => (binding.stub === undefined ? [] : [binding.stub]));
	const boot = broken.size === 0 ? "bootPlayer" : "bootPlayer, brokenFrame";
	const entries = frames.map((ref, i) => `[${JSON.stringify(ref.name)}, f${i}]`).join(", ");
	return `import { ${boot} } from "spool";
${[...imported, ...stubs].join("\n")}
bootPlayer(Object.fromEntries([${entries}]));
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
<title>${escapeHtml(config.start)} · ${escapeHtml(config.project)}</title>
<script>window.__SPOOL_PLAY__ = JSON.parse(${escapeJsonScript(JSON.stringify(config))})</script>
<style>html, body, #root { height: 100%; }</style>
<style>${escapeInlineStyle(bundle.css)}</style>
${fontsBlock}${bundledBlock}
${config.shell === true ? "" : `<style>${escapeInlineStyle(CHROME_CSS)}</style>`}
${transitionsBlock}<script type="importmap">${escapeJsonScript(bundle.importMap)}</script>
</head>
<body>
<div id="root"><div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#8e8c88;font:400 12px/18px ui-monospace,monospace">booting</div></div>
${config.shell === true ? '<script type="module">import "spool";</script>\n' : ""}<script type="module">${escapeInlineScript(bundle.bootJs)}</script>
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
/* a terminal is a character grid, not a document: it keeps the box it was
   authored at rather than growing into the window, and sits centred on the
   page's background — which is also what leaves the top edge reachable, since a
   terminal's own document swallows every pointer report the bar is summoned by */
.spool-screen.is-terminal {
	min-height: 0;
	align-self: center;
	overflow: hidden;
	color-scheme: dark;
	background: #111110;
}
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
/* the edge bar (#227): away by default, peeled in by a dwell against the top
   edge. The nub is the resting trace — a control with none is a control most
   people never find */
.spool-nub {
	position: fixed;
	top: 0;
	left: 50%;
	z-index: 10;
	width: 40px;
	height: 3px;
	margin-left: -20px;
	border-radius: 0 0 999px 999px;
	background: #363636;
	opacity: 0.7;
	pointer-events: none;
	transition: opacity 200ms ease;
}
.spool-nub.is-hidden { opacity: 0; }
.spool-edge {
	position: fixed;
	inset: 0 0 auto;
	z-index: 10;
	translate: 0 -100%;
	opacity: 0;
	pointer-events: none;
	transition: translate 200ms ease-out, opacity 200ms ease-out;
	color: #f0efed;
	font: 400 12px/1 "Fragment Mono", ui-monospace, monospace;
	-webkit-font-smoothing: antialiased;
	font-synthesis: none;
}
.spool-edge.is-open { translate: 0 0; opacity: 1; pointer-events: auto; }
.spool-bar {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: center;
	gap: 12px;
	height: 40px;
	padding: 0 16px;
	background: #282828;
	border-bottom: 1px solid #363636;
}
.spool-bar-rule { flex: none; width: 1px; height: 14px; background: #363636; }
.spool-bar-back {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 8px 4px 4px;
	border-radius: 4px;
	color: #8e8c88;
	font-size: 10px;
	text-decoration: none;
}
.spool-bar-back:hover { color: #f0efed; }
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
.spool-bar-hint { color: #8e8c88; font-size: 10px; }
.spool-bar-close {
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
.spool-bar-close:hover { background: #1c1c1c; color: #f0efed; }
/* the scrim a video player draws under its controls: the page is not cut in
   half by the bar's edge, it fades under it */
.spool-edge-scrim {
	position: absolute;
	inset: 40px 0 auto;
	height: 56px;
	background: linear-gradient(to bottom, #0e0e0e, transparent);
	pointer-events: none;
}
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
/* the Mac app's play window (#275): the app made this window, sized it from the
   frame's own two numbers and left the title bar off, so these 30px are the bar
   spool draws in its place — the traffic lights inset into it. Permanent rather
   than summoned, which is the trade: 30px of page for a name that is always
   readable and a switcher that never has to be found */
.spool-page.is-desk { box-sizing: border-box; padding-top: 30px; }
.spool-page.is-desk .spool-screen { min-height: calc(100vh - 30px); }
.spool-desk {
	position: fixed;
	inset: 0 0 auto;
	z-index: 10;
	/* its hairline is inside its 30px, so the page's inset and the bar agree */
	box-sizing: border-box;
	display: flex;
	align-items: center;
	gap: 12px;
	/* the first 76px are the OS's: three lights, inset by trafficLightPosition */
	padding: 0 16px 0 76px;
	background: #282828;
	border-bottom: 1px solid #363636;
	color: #f0efed;
	font: 400 12px/1 "Fragment Mono", ui-monospace, monospace;
	-webkit-font-smoothing: antialiased;
	font-synthesis: none;
	/* this bar is the window's title bar, so a hand on it moves the window */
	-webkit-app-region: drag;
}
.spool-desk button, .spool-desk .spool-picker { -webkit-app-region: no-drag; }
/* full height, so the picker opens flush under the bar rather than under a button */
.spool-desk .spool-bar-switcher { align-self: stretch; align-items: center; }
.spool-desk-canvas {
	flex: none;
	gap: 4px;
	padding: 4px 6px;
	background: none;
	border: 0;
	font: inherit;
	cursor: pointer;
}
.spool-desk-canvas:hover { background: #1c1c1c; color: #f0efed; }
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
