/**
 * Assembly of the served frame document. Spool owns the whole page (#16):
 * frames carry zero boilerplate, so everything a component needs to render —
 * finished CSS, fonts, import map, boot module — is injected here, inline,
 * as one sealed sandboxable document.
 */

export interface FrameDocumentParts {
	project: string;
	frame: string;
	/** Compiled Tailwind output: theme vars, preflight, used utilities. */
	css: string;
	/** shared/fonts.css verbatim, when the file exists. */
	fonts?: string | undefined;
	/** Extra stylesheet emitted by the frame bundle (plain .css imports). */
	bundledCss?: string | undefined;
	importMap: object;
	bootJs: string;
}

export function assembleFrameDocument({
	project,
	frame,
	css,
	fonts,
	bundledCss,
	importMap,
	bootJs,
}: FrameDocumentParts): string {
	const fontsBlock = fonts === undefined ? "" : `<style>${escapeInlineStyle(fonts)}</style>\n`;
	const bundledBlock = bundledCss === undefined ? "" : `<style>${escapeInlineStyle(bundledCss)}</style>\n`;
	// the config rides a classic script so it exists before any module evaluates
	return htmlShell(
		frame,
		`<style>${escapeInlineStyle(css)}</style>
${fontsBlock}${bundledBlock}<script type="importmap">${escapeJsonScript(importMap)}</script>
<script>window.__SPOOL__ = ${escapeJsonScript({ project, frame })}</script>
`,
		`<div id="root"></div>
<script type="module">${escapeInlineScript(bootJs)}</script>
`,
	);
}

/**
 * The document served when a frame does not compile: the toolchain's message,
 * verbatim, plus the same postMessage protocol so a canvas can mark the frame
 * failed instead of waiting on a loaded report.
 */
export function errorDocument(frame: string, message: string): string {
	const report = `if (parent !== window) parent.postMessage({ spool: "error", frame: ${JSON.stringify(frame)}, error: ${JSON.stringify(message)} }, "*");`;
	return htmlShell(
		frame,
		`<style>
body { margin: 0; padding: 24px; background: #111110; color: #b5b3ad; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
h1 { margin: 0 0 16px; font-size: 13px; font-weight: 400; color: #f5391a; }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
</style>
`,
		`<h1>${escapeHtml(frame)} failed to compile</h1>
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
export function escapeJsonScript(value: object): string {
	return JSON.stringify(value).replaceAll("<", "\\u003c");
}
