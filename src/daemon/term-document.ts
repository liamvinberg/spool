import { createHash } from "node:crypto";
import { TERM_BACKGROUND } from "../term/theme";
import { escapeHtml, escapeInlineScript, escapeInlineStyle, escapeJsonScript } from "./document";
import { termFontUrlCss } from "./term-fonts";

/**
 * A terminal frame is Spool-owned while project code has no OS sandbox. The
 * document never reads or executes term.tsx and carries no daemon capability.
 * It keeps only the small canvas protocol needed to become ready and leave an
 * entered frame.
 */

const TERM_CSS = `html, body { height: 100%; }
body {
	display: grid;
	place-items: center;
	margin: 0;
	padding: 32px;
	box-sizing: border-box;
	background: ${TERM_BACKGROUND};
	color: #b5b3ad;
	font: 400 14px/1.55 "JetBrains Mono", monospace;
	text-align: center;
	overflow: hidden;
}
main { max-width: 42rem; }
p { margin: 0; }
`;

export function assembleTermDocument({ frame }: { frame: string }): string {
	const config = `window.__SPOOL__ = ${escapeJsonScript({ frame })};`;
	const bridge = `(() => {
	const frame = window.__SPOOL__.frame;
	const post = (message) => {
		if (parent !== window) parent.postMessage({ ...message, frame }, "*");
	};
	addEventListener("keydown", (event) => {
		if (!(event.metaKey || event.ctrlKey) || event.key !== "Escape") return;
		event.preventDefault();
		post({ spool: "key", key: "Escape" });
	}, { capture: true });
	addEventListener("message", (event) => {
		if (event.source !== parent || !event.data || typeof event.data !== "object") return;
		const message = event.data;
		if (message.spool === "focus") document.body.focus();
		else if (message.spool === "pick" && typeof message.id === "number") {
			post({ spool: "picked", id: message.id, chain: [] });
		} else if (message.spool === "sites" && typeof message.id === "number") {
			post({ spool: "site-boxes", id: message.id, boxes: {} });
		}
	});
	post({ spool: "loaded" });
})();`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${escapeHtml(frame)} · spool</title>
<script>${escapeInlineScript(config)}</script>
<style>${escapeInlineStyle(`${termFontUrlCss()}\n${TERM_CSS}`)}</style>
</head>
<body tabindex="-1">
<main><p>terminal execution is disabled until it can run in an OS sandbox</p></main>
<script>${escapeInlineScript(bridge)}</script>
</body>
</html>
`;
}

export function termDocumentEtag(version: string, document: string): string {
	return `"term-${createHash("sha256").update(`${version}\0${document}`).digest("hex").slice(0, 32)}"`;
}
