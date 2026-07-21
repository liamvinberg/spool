// React-variant srcdoc assembly, mirroring the decided serve model: the document
// is owned by the assembler (#16) — freeze shim first, finished Tailwind CSS
// inlined (#15), import map resolving react to the pinned vendor build (#12),
// then a boot module that renders the compiled screen component and reports
// loaded after the first committed render + one painted frame.

import { framesCss } from "./generated/frames-css";
import type { ScreenKind } from "./scene";
import { agent, freezeShim } from "./screens";

const IMPORT_MAP = JSON.stringify({
	imports: {
		react: "/vendor/react-bundle.js",
		"react/jsx-runtime": "/vendor/react-bundle.js",
		"react-dom/client": "/vendor/react-bundle.js",
	},
});

export function reactDoc(kind: ScreenKind, id: string): string {
	const boot = `<script type="module">
import { createElement, Fragment, useEffect } from "react";
import { createRoot } from "react-dom/client";
import Screen from ${JSON.stringify(`/react-screens/${kind}.js`)};
const ID = ${JSON.stringify(id)};
function Ready() {
	// no rAF gate here: Chrome pauses rAF entirely in offscreen iframes, and
	// offscreen frames must still report the hydrate storm. Effect = committed.
	useEffect(() => {
		parent.postMessage({ spool: "loaded", id: ID }, "*");
	}, []);
	return null;
}
createRoot(document.getElementById("root")).render(
	createElement(Fragment, null, createElement(Screen), createElement(Ready)),
);
</script>`;
	return [
		freezeShim,
		`<style>html,body,#root{height:100%}</style>`,
		`<style>${framesCss}</style>`,
		`<script type="importmap">${IMPORT_MAP}</script>`,
		`<body><div id="root"></div>`,
		agent(id, false),
		boot,
		`</body>`,
	].join("");
}
