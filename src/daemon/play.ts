import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PLAYER_CHROME_RULES } from "../runtime/player-chrome-css";
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
${PLAYER_CHROME_RULES}`;
