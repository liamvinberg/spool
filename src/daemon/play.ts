import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { hashInputs } from "./compile";
import { daemonCompileHost } from "./compile-host";
import { type CompileHost, describeCompileError } from "./design-compile";
import { realDesignDir } from "./design-path";
import { escapeHtml, escapeInlineScript, escapeInlineStyle, escapeJsonScript } from "./document";
import {
	type ComposedPlayer,
	compilePlayer,
	compilePublication,
	compositionOptions,
	type FrameStyle,
	type PlayerBundle,
	type PlayerContext,
	type PlayerFrameRef,
	playerEntry,
	playerStamp,
} from "./player-compile";
import { inertWebfonts, type Webfonts } from "./webfonts";

export type { PlayerBundle, PlayerFrameRef } from "./player-compile";

/**
 * The player page (#24): one light document under /play/ composing every frame
 * component, because View Transitions cannot cross iframe boundaries — same-
 * document VT with view-transition-name matching is the whole point. The
 * daemon compiles the composition; the flow runtime (served as "spool" through
 * the same import map pin frames already use) boots it, swaps screens, and
 * owns the stage chrome. None of the canvas SPA rides along.
 */

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

export type PlayerCompile =
	| { kind: "ok"; bundle: PlayerBundle; cache: "hit" | "miss" }
	| { kind: "error"; message: string };

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
export function createPlayerCompiler(
	version: string,
	webfonts: Webfonts = inertWebfonts(),
	host: CompileHost = daemonCompileHost,
) {
	const cache = new Map<string, ComposedPlayer>();
	/** Bundles a root has served, newest first, so their modules stay answerable. */
	const served = new Map<string, PlayerBundle[]>();
	const contexts = new Map<string, PlayerContext>();
	/** One compile in flight per root: the shell and its iframe ask within the same second. */
	const inflight = new Map<string, Promise<PlayerCompile>>();
	let closed = false;

	function getBundle(root: string, frames: PlayerFrameRef[]): Promise<PlayerCompile> {
		const running = inflight.get(root);
		if (running !== undefined) return running;
		const compile = compileOrReuse(root, frames).finally(() => inflight.delete(root));
		inflight.set(root, compile);
		return compile;
	}

	async function compileOrReuse(root: string, frames: PlayerFrameRef[]): Promise<PlayerCompile> {
		const stamp = playerStamp(frames);
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
				(await hashInputs(version, stamp, cached.inputs, designDir)) === cached.hash &&
				// again after the hash, as the frame compiler does
				cached.fonts === webfonts.revision()
			) {
				return { kind: "ok", bundle: cached.bundle, cache: "hit" };
			}
			const context = await contextFor(root, designDir, frames, stamp);
			const entry = await compilePlayer(host, version, designDir, frames, stamp, webfonts, context);
			// Match the frame compiler: a compile failure is never cached, so the
			// player recovers the instant the frame does. A stubbed build's inputs
			// cannot cover the broken frame's own closure, so revalidating against
			// them would strand the stub after the fix lands.
			if (entry.broken.length === 0 && entry.settled) cache.set(root, entry);
			else cache.delete(root);
			// styles built while a file moved under them are of no one state of the folder
			if (!entry.settled) context.styles.clear();
			retain(root, entry.bundle);
			return { kind: "ok", bundle: entry.bundle, cache: "miss" };
		} catch (error) {
			cache.delete(root);
			// a build that threw may have kept styles a torn read made
			contexts.get(root)?.styles.clear();
			return { kind: "error", message: await describeCompileError(host.esbuild, error) };
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
		// a frame added or removed changes the composition, not the other frames' styles
		const styles = held !== undefined && held.designDir === designDir ? held.styles : new Map<string, FrameStyle>();
		if (held !== undefined) {
			contexts.delete(root);
			await held.context.dispose();
		}
		const reading: PlayerContext["reading"] = { reads: undefined };
		const fresh: PlayerContext = {
			stamp,
			designDir,
			reading,
			context: await host.esbuild.context(
				compositionOptions(designDir, playerEntry(frames, new Map()), host.files, () => reading.reads),
			),
			styles,
		};
		if (closed) {
			await fresh.context.dispose();
			throw new Error("the player compiler is closed");
		}
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

	/**
	 * Lets go of what keeps a root quick to compose again: its build context, its
	 * frames' styles and its cached bundle. Modules it has served stay answerable
	 * for any tab still playing them.
	 */
	async function forget(root: string): Promise<void> {
		cache.delete(root);
		const held = contexts.get(root);
		if (held === undefined) return;
		contexts.delete(root);
		await held.context.dispose();
	}

	async function close(): Promise<void> {
		closed = true;
		const open = [...contexts.values()];
		contexts.clear();
		await Promise.all(open.map((held) => held.context.dispose()));
	}

	return { getBundle, getChunk, forget, close };
}

/** The publication compile on the daemon (see `compilePublication`). */
export async function buildPublicationPlayer(
	designDir: string,
	frames: PlayerFrameRef[],
	version: string,
): Promise<{ bundle: PlayerBundle; inputs: string[] }> {
	const { bundle, inputs } = await compilePublication(daemonCompileHost, { designDir, frames, version });
	return { bundle, inputs };
}

export type PlayerCompiler = ReturnType<typeof createPlayerCompiler>;

/** The document's identity: the compiled bundle plus this request's config. */
export function playerEtag(bundle: PlayerBundle, config: PlayerConfig): string {
	return `"${createHash("sha256").update(bundle.hash).update(JSON.stringify(config)).digest("hex").slice(0, 32)}"`;
}

export function assemblePlayerDocument(config: PlayerConfig, bundle: PlayerBundle): string {
	const fontsBlock = bundle.fonts === undefined ? "" : `<style>${escapeInlineStyle(bundle.fonts)}</style>\n`;
	const transitionsBlock =
		bundle.transitions === undefined ? "" : `<style>${escapeInlineStyle(bundle.transitions)}</style>\n`;
	const base = playerChunkBase(config.project);
	const startStyle = bundle.styles.get(config.start);
	const styleBlock =
		startStyle === undefined
			? ""
			: `<link rel="stylesheet" data-spool-frame-style="${escapeHtml(config.start)}" data-spool-style-resource="${escapeHtml(startStyle)}" href="${escapeHtml(base + startStyle)}">\n`;
	const playConfig = { ...config, styles: Object.fromEntries(bundle.styles) };
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
<script>window.__SPOOL_PLAY__ = JSON.parse(${escapeJsonScript(JSON.stringify(playConfig))})</script>
<style>html, body, #root { height: 100%; }</style>
${fontsBlock}${styleBlock}
${config.shell === true ? "" : `<style>${escapeInlineStyle(CHROME_CSS)}</style>`}
${transitionsBlock}<script type="importmap">${escapeJsonScript(bundle.importMap)}</script>
${preload}
</head>
<body>
<div id="root"><div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#94918d;font:400 12px/18px ui-monospace,monospace">booting</div></div>
${config.shell === true ? '<script type="module">import "spool";</script>\n' : ""}<script type="module">import ${escapeInlineScript(entryUrl)};</script>
</body>
</html>
`;
}

const requireFont = createRequire(import.meta.url);
const SANS_FILES = [
	"instrument-sans-latin-wght-normal.woff2",
	"instrument-sans-latin-ext-wght-normal.woff2",
	"instrument-sans-latin-wght-italic.woff2",
	"instrument-sans-latin-ext-wght-italic.woff2",
];

/** Player chrome carries its fonts; it never borrows the prototype's font. */
const CHROME_FONT_FILES: Record<string, string> = {
	"fragment-mono-latin-400-normal.woff2": createRequire(import.meta.url).resolve(
		"@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2",
	),
	...Object.fromEntries(
		SANS_FILES.map((name) => [name, requireFont.resolve(`@fontsource-variable/instrument-sans/files/${name}`)]),
	),
};

const SANS_CSS = ["wght.css", "wght-italic.css"]
	.map((name) => readFileSync(requireFont.resolve(`@fontsource-variable/instrument-sans/${name}`), "utf8"))
	.join("\n")
	.replaceAll("./files/", "/vendor/fonts/");

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

const CHROME_CSS = `:root {
	color-scheme: dark;
	--color-bg: #0e0e0e;
	--color-surface: #1c1c1c;
	--color-raised: #282828;
	--color-border: #262626;
	--color-border-raised: #363636;
	--color-text: #f0efed;
	--color-muted: #94918d;
	--color-thread: #f5391a;
	--radius-sm: 6px;
	--radius-lg: 12px;
}
${SANS_CSS}
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
	font: 400 12px/18px "Fragment Mono", ui-monospace, monospace;
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
.spool-bar-project { color: #94918d; }
.spool-bar-name { white-space: nowrap; }
.spool-bar-chevron { color: #94918d; transition: rotate 150ms ease; }
.spool-bar-chevron.is-open { rotate: 180deg; }
.spool-bar-end { display: flex; align-items: center; gap: 12px; margin-left: auto; }
.spool-bar-hint { color: #94918d; font-size: 11px; white-space: nowrap; }
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
	color: #94918d;
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
	width: 280px;
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
.spool-picker input {
	box-sizing: border-box;
	width: calc(100% - 16px);
	margin: 8px;
	padding: 7px 8px;
	border: 1px solid #363636;
	border-radius: 4px;
	background: #0e0e0e;
	color: #f0efed;
	font: inherit;
	outline: none;
}
.spool-picker input:focus { border-color: #94918d; }
.spool-picker-list { display: flex; flex-direction: column; max-height: 320px; overflow: auto; }
.spool-picker-row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	background: none;
	border: 0;
	border-radius: 4px;
	color: #94918d;
	font: inherit;
	text-align: left;
	cursor: pointer;
}
.spool-picker-row:hover { background: #1c1c1c; color: #f0efed; }
.spool-picker-row.is-here { color: #f0efed; }
.spool-picker-empty { padding: 8px 12px; color: #94918d; font-size: 11px; }
.spool-dash { flex: none; width: 8px; height: 2px; background: transparent; }
.spool-picker-row.is-here .spool-dash { background: #f5391a; }
.spool-picker-foot { display: block; padding: 8px 14px; border-top: 1px solid #262626; color: #94918d; font-size: 11px; }
.spool-desk-restored { display: flex; align-items: center; gap: 8px; color: #94918d; font-size: 11px; }
.spool-dash.is-lit { background: #f5391a; }
.spool-desk-reset {
	margin: 0;
	padding: 0;
	background: none;
	border: 0;
	color: #94918d;
	font: inherit;
	text-decoration: underline;
	text-underline-offset: 2px;
	cursor: pointer;
}
.spool-desk-reset:hover { color: #f0efed; }
.spool-bar-share {
	display: flex;
	align-items: center;
	gap: 6px;
	height: 24px;
	padding: 0 6px;
	border: 0;
	border-radius: 4px;
	color: #f0efed;
	background: none;
	font: 400 11px/18px "Fragment Mono", ui-monospace, monospace;
	cursor: pointer;
}
.spool-bar-share:hover, .spool-bar-share[aria-expanded=true] { background: #1c1c1c; }
.spool-bar-share:disabled { opacity: .55; cursor: default; }
.spool-bar-switcher[data-instant=true] .spool-bar-chevron,
.spool-bar-switcher[data-instant=true] .spool-picker { transition: none; }
.spool-bar-sharing { display: flex; align-items: center; gap: 8px; }
.spool-top button:focus-visible {
	outline: 2px solid var(--color-thread);
	outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
	.spool-bar-chevron, .spool-picker { transition: none !important; }
}
`;
