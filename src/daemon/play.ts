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
<title>${escapeHtml(config.project)} · spool</title>
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
 * The stage, the slate HUD, and the session rail, from the design canvas frame
 * `spool-player--inspector` (#60): near-black stage, the frame letterboxed at
 * native size or scaled to fill a smaller viewport, chrome scattered into the
 * screen corners with no containers at all, and the session on demand as a
 * 320px rail the stage recenters against. Solid fills and hairlines, never blur
 * or shadows (#13 law 4). The HUD and the rail each carry a view-transition-
 * name, so a screen transition films the screen and never smears the chrome.
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
html, body, #root { height: 100%; }
body { margin: 0; background: #0e0e0e; overflow: hidden; }
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
   together and takes the cursor with it */
.spool-stage.is-asleep { cursor: none; }
.spool-screen {
	position: absolute;
	top: 0;
	left: 0;
	transform-origin: top left;
	color-scheme: light;
	color: #000;
	background: #fff;
	border: 1px solid #363636;
	border-radius: 12px;
	overflow: clip;
	view-transition-name: spool-screen;
}
.spool-screen.is-terminal { color-scheme: dark; background: #111110; }
.spool-screen-scroll {
	width: 100%;
	height: 100%;
	overflow: auto;
	overscroll-behavior: contain;
}
.spool-screen-scroll.is-terminal { overflow: hidden; }
.spool-player-error {
	box-sizing: border-box;
	width: 100%;
	min-height: 100%;
	padding: 24px;
	overflow: auto;
	background: #111110;
	color: #b5b3ad;
	font: 400 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.spool-player-error strong { display: block; margin-bottom: 16px; color: #f5391a; font-weight: 400; }
.spool-player-error pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
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
	overflow-x: hidden;
	overscroll-behavior: contain;
	scrollbar-width: thin;
	scrollbar-color: #363636 transparent;
}
.spool-rail-quiet { margin: 0; padding: 16px 20px; color: #8e8c88; }
.spool-rail-quiet:not(.is-section) { padding: 0; }
.spool-rail-row { display: flex; align-items: center; gap: 8px; }
.spool-rail-key { flex: none; color: #8e8c88; }
.spool-rail-value { margin: 0 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
.spool-walk-edge {
	padding-left: 12px;
	font-size: 10px;
	line-height: 14px;
	color: #8e8c88;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
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
