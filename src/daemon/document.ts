import { createHash } from "node:crypto";
import { frameShims } from "./frame-shims";
import { PROJECT_LAYER } from "./tailwind";

/**
 * Assembly of the served frame document. Spool owns the whole page (#16):
 * frames carry zero boilerplate, so everything a component needs to render —
 * finished CSS, fonts, import map, boot module — is injected here, inline,
 * as one sealed sandboxable document.
 */

export interface FrameDocumentParts {
	project: string;
	frame: string;
	projectCapability: string;
	controlOrigin: string;
	/** Compiled Tailwind output: theme vars, preflight, used utilities. */
	css: string;
	/** shared/fonts.css verbatim, when the file exists. */
	fonts?: string | undefined;
	/** Extra stylesheet emitted by the frame bundle (plain .css imports). */
	bundledCss?: string | undefined;
	importMap: object;
	bootJs: string;
}

let escapedCaptureWorker: string | undefined;
const escapedCaptureWorkerJs = (): string => {
	escapedCaptureWorker ??= escapeInlineScript(frameShims().captureWorker);
	return escapedCaptureWorker;
};
const captureWorkerBaseCsp = (): string =>
	[
		"default-src 'none'",
		`script-src 'sha256-${createHash("sha256").update(escapedCaptureWorkerJs()).digest("base64")}'`,
		"img-src data: blob:",
		"font-src data:",
		"connect-src 'none'",
		"worker-src 'none'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-src 'none'",
		"style-src 'none'",
	].join("; ");

export function captureWorkerCsp(controlOrigin: string): string {
	const origin = new URL(controlOrigin).origin;
	return `${captureWorkerBaseCsp()}; frame-ancestors ${origin}`;
}

export function captureWorkerDocument(controlOrigin: string): string {
	const origin = new URL(controlOrigin).origin;
	return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="spool-control-origin" content="${escapeHtml(origin)}"><title>spool capture</title></head>
<body><canvas></canvas><script>${escapedCaptureWorkerJs()}</script></body></html>`;
}

/**
 * The project's own stylesheets, in the layer the cascade puts under Tailwind
 * (#323).
 *
 * The frame bundle's CSS is whatever the frame imported, verbatim and
 * unlayered — and in the cascade an unlayered declaration beats every layered
 * one regardless of specificity, so `.company-byline { font-size: 13px }` beat
 * the `text-[20px]` a hand wrote no matter what. Wrapping the block in the
 * layer `ROOT_CSS` declares first is the whole fix: the project's sheets sit
 * under Tailwind's utilities, and a project that already writes `@layer` of
 * its own keeps its order, nested one level in.
 *
 * `@charset` and `@import` may not stand inside a layer block, so whatever the
 * bundle put at its head stays at the head.
 */
export function layeredProjectCss(css: string): string {
	const { head, layered } = projectCssParts(css);
	return `${head}${layered}`;
}

/**
 * The project's stylesheets in two parts: the `@charset` and `@import`
 * statements the bundle put at its head, and the rest wrapped in the project
 * layer. A sheet that composes the project's CSS after other rules (a frame's
 * standalone closure follows Tailwind's) puts the head first: an `@import`
 * after any other rule is invalid, and the browser drops it.
 */
export function projectCssParts(css: string): { head: string; layered: string } {
	if (css.trim() === "") return { head: "", layered: css };
	let at = 0;
	while (at < css.length) {
		const rest = css.slice(at);
		const blank = /^(?:\s+|\/\*[\s\S]*?\*\/)+/.exec(rest);
		if (blank !== null) {
			at += blank[0].length;
			continue;
		}
		if (!/^@(?:charset|import)\b/i.test(rest)) break;
		const end = statementEnd(css, at);
		if (end === -1) break;
		at = end;
	}
	const head = css.slice(0, at);
	const body = css.slice(at);
	if (body.trim() === "") return { head, layered: body };
	return { head, layered: `@layer ${PROJECT_LAYER} {\n${body}\n}\n` };
}

/**
 * A compiled stylesheet's leading `@import` statements lifted out of it, and the
 * rest as it was: the head a browser fetches before any rule, past the
 * comments and `@charset` and `@layer` statements Tailwind opens a sheet with.
 * A sheet composed of two can put both heads first this way, and a theme's
 * hosted imports stand where fonts.css's would.
 */
export function hoistCssImports(css: string): { imports: string; rest: string } {
	let imports = "";
	let rest = "";
	let at = 0;
	while (at < css.length) {
		const remaining = css.slice(at);
		const blank = /^(?:\s+|\/\*[\s\S]*?\*\/)+/.exec(remaining);
		if (blank !== null) {
			rest += blank[0];
			at += blank[0].length;
			continue;
		}
		const keyword = /^@(charset|import|layer)\b/i.exec(remaining)?.[1]?.toLowerCase();
		if (keyword === undefined) break;
		const end = statementEnd(css, at);
		if (end === -1) break;
		if (keyword === "import") imports += `${css.slice(at, end)}\n`;
		else rest += css.slice(at, end);
		at = end;
	}
	return { imports, rest: rest + css.slice(at) };
}

/** Where a top-level at-statement ends: the first `;` outside a string, a comment or brackets. */
function statementEnd(css: string, from: number): number {
	let depth = 0;
	let quote: string | null = null;
	for (let i = from; i < css.length; i += 1) {
		const char = css[i];
		if (quote !== null) {
			if (char === "\\") i += 1;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === "/" && css[i + 1] === "*") {
			const close = css.indexOf("*/", i + 2);
			if (close === -1) return -1;
			i = close + 1;
			continue;
		}
		if (char === "(") depth += 1;
		else if (char === ")") depth -= 1;
		// a block where a statement was expected is not one: leave it to the layer
		else if (char === "{" && depth === 0) return -1;
		else if (char === ";" && depth === 0) return i + 1;
	}
	return -1;
}

export function assembleFrameDocument({
	project,
	frame,
	projectCapability,
	controlOrigin,
	css,
	fonts,
	bundledCss,
	importMap,
	bootJs,
}: FrameDocumentParts): string {
	const fontsBlock = fonts === undefined ? "" : `<style>${escapeInlineStyle(fonts)}</style>\n`;
	const bundledBlock =
		bundledCss === undefined
			? ""
			: `<style id="spool-bundled-css">${escapeInlineStyle(layeredProjectCss(bundledCss))}</style>\n`;
	// config and shim ride classic scripts so both exist before any module evaluates.
	// the height chain is baseline (#10): h-full reaches the frame edge in this
	// document AND inside the player's screen — one dialect for both contexts
	return htmlShell(
		frame,
		`<script>window.__SPOOL__ = ${escapeJsonScript({ project, frame, projectCapability, controlOrigin })}</script>
<script>${escapeInlineScript(frameShims().canvasShim)}</script>
<style>html, body, #root { height: 100%; }</style>
<style>${escapeInlineStyle(css)}</style>
${fontsBlock}${bundledBlock}<script type="importmap">${escapeJsonScript(importMap)}</script>
`,
		`<div id="root"></div>
<script type="module">${escapeInlineScript(bootJs)}</script>
`,
	);
}

/**
 * The shim's identity, folded into every document hash (#23): the shim is
 * baked into the daemon process, invisible to the input files — without this
 * a restarted daemon 304s browsers into keeping documents whose shim speaks
 * yesterday's protocol.
 */
export function shimHash(): string {
	shimDigest ??= createHash("sha256").update(frameShims().canvasShim).digest("hex");
	return shimDigest;
}
let shimDigest: string | undefined;

/**
 * The document served when a frame does not compile: the toolchain's message,
 * verbatim, plus the same postMessage protocol so a canvas can mark the frame
 * failed instead of waiting on a loaded report.
 */
export function errorDocument(frame: string, message: string, failure = "failed to compile"): string {
	const report = `if (parent !== window) parent.postMessage({ spool: "error", frame: ${JSON.stringify(frame)}, error: ${JSON.stringify(message)} }, "*");`;
	return failureDocument(frame, message, failure, report);
}

/**
 * A composed player that fails after the control preflight has no runtime
 * channel. Its document gets one separate, exact load-failure signal; a
 * successfully connected authored runtime can never use this protocol.
 */
export function playerLoadErrorDocument(message: string, failure = "failed to compile"): string {
	return playerFailureDocument(message, failure, "player-load-error");
}

/**
 * A rejected handoff is the one player failure the outer shell can repair, so it
 * gets its own message (#88): the shell mints a fresh token and reloads, and a
 * frame whose code simply will not compile never enters that retry.
 */
export function playerHandoffRejectedDocument(message: string): string {
	return playerFailureDocument(message, "failed to load", "player-handoff-rejected");
}

function playerFailureDocument(message: string, failure: string, spool: string): string {
	const report = `if (parent !== window) parent.postMessage({ spool: ${JSON.stringify(spool)}, error: ${JSON.stringify(message)} }, "*");`;
	return failureDocument("player", message, failure, report);
}

function failureDocument(frame: string, message: string, failure: string, report: string): string {
	return htmlShell(
		frame,
		`<style>
body { margin: 0; padding: 24px; background: #111110; color: #b5b3ad; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
h1 { margin: 0 0 16px; font-size: 13px; font-weight: 400; color: #f5391a; }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
</style>
`,
		`<h1>${escapeHtml(frame)} ${escapeHtml(failure)}</h1>
<pre>${escapeHtml(message)}</pre>
<script>${escapeInlineScript(report)}</script>
`,
	);
}

function htmlShell(frame: string, head: string, body: string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${escapeHtml(frame)} · spool</title>
${head}</head>
<body>
${body}</body>
</html>
`;
}

/** Merge the project's import map under spool's pins — the pinned React always wins. */
export function mergeImportMap(project: unknown, pins: Record<string, string>): object {
	if (project === undefined) return { imports: pins };
	if (typeof project !== "object" || project === null || Array.isArray(project)) {
		throw new Error("shared/importmap.json must be a JSON object");
	}
	const record = project as Record<string, unknown>;
	const imports = record.imports ?? {};
	if (typeof imports !== "object" || imports === null || Array.isArray(imports)) {
		throw new Error('shared/importmap.json: "imports" must be an object');
	}
	const merged: Record<string, unknown> = { imports: { ...imports, ...pins } };
	if (record.scopes !== undefined) merged.scopes = record.scopes;
	return merged;
}

export function escapeHtml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * The HTML parser ends a script element at the first `</script` regardless of
 * JS context; inside string literals the escaped form reads back identically.
 */
export function escapeInlineScript(js: string): string {
	return js.replace(/<\/script/gi, "<\\/script");
}

/** Same parser rule for style elements; `\/` in a CSS string is a literal `/`. */
export function escapeInlineStyle(css: string): string {
	return css.replace(/<\/style/gi, "<\\/style");
}

/** JSON embedded in a script element: escaping every `<` closes all parser holes. */
export function escapeJsonScript(value: unknown): string {
	return JSON.stringify(value).replaceAll("<", "\\u003c");
}
