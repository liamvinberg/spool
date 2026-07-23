import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { TERM_BACKGROUND } from "../term/theme";
import { escapeHtml, escapeInlineScript, escapeInlineStyle, escapeJsonScript } from "./document";
import { termFontUrlCss } from "./term-fonts";

/**
 * The terminal frame document (#42): an ordinary HTML page hosting the pinned
 * emulator, so canvas iframes, entering, and isolation stay exactly as the
 * canvas-iframes ADR left them. No compile — the app runs daemon-side in a
 * PTY; this document only paints the cell grid and speaks the host protocol
 * through the terminal runtime at /vendor/spool-term.js.
 */

let xtermCssMemo: string | undefined;

function xtermCss(): string {
	if (xtermCssMemo === undefined) {
		xtermCssMemo = readFileSync(createRequire(import.meta.url).resolve("@xterm/xterm/css/xterm.css"), "utf8");
	}
	return xtermCssMemo;
}

const TERM_CSS = `html, body, #term { height: 100%; }
body { margin: 0; background: ${TERM_BACKGROUND}; overflow: hidden; }
.xterm .xterm-viewport { scrollbar-width: none; }
.xterm .xterm-viewport::-webkit-scrollbar { display: none; }
#term.spool-exited { opacity: 0.55; }
.spool-exit-chip {
	position: fixed; top: 8px; right: 8px; z-index: 10;
	padding: 3px 8px; border-radius: 4px;
	background: #262623; color: #b5b3ad;
	font: 400 11px/1.3 "JetBrains Mono", monospace;
}
.spool-exit-chip[data-failed] { color: #f5896f; }
`;

export function assembleTermDocument({ project, frame }: { project: string; frame: string }): string {
	const config = `window.__SPOOL__ = ${escapeJsonScript({ project, frame })};`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${escapeHtml(frame)} · spool</title>
<script>${escapeInlineScript(config)}</script>
<style>${escapeInlineStyle(xtermCss())}</style>
<style>${escapeInlineStyle(`${termFontUrlCss()}\n${TERM_CSS}`)}</style>
</head>
<body>
<div id="term"></div>
<script type="module">import "/vendor/spool-term.js";</script>
</body>
</html>
`;
}

export function termDocumentEtag(version: string, document: string): string {
	return `"term-${createHash("sha256").update(`${version}\0${document}`).digest("hex").slice(0, 32)}"`;
}
