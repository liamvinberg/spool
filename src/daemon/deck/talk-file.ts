import { talkFileName } from "../../deck/wire";
import { pageName } from "../../page-path";
import { escapeHtml, escapeInlineScript, escapeInlineStyle, escapeJsonScript } from "../document";
import { type ExportAnswer, type ExportedFile, frameSheets, type HtmlExport, stillOf } from "../html-export";
import type { PlayerFrameRef } from "../player-compile";
import { listProjectFrames } from "../projection";
import { STAGE_CSS, stageOf } from "./stage-play";

/**
 * A deck's talk as one HTML file (spool#275): the stage of its play address, composing the talk's slides and nothing
 * else, packed the way a frame's file is (spool#239) so it opens from disk with nothing behind it. It plays like the
 * room's screen, on the ground and fitted to the window, opening on the first slide's first beat over that slide's still.
 * The one thing of spool's it ever draws is a quiet line under the first slide, gone at the first key. A slide that
 * does not compile refuses the file, named.
 */
export async function talkFile(
	htmlExport: Pick<HtmlExport, "pack">,
	root: string,
	project: string,
	page: string,
): Promise<ExportAnswer<ExportedFile>> {
	const stage = stageOf(root, page);
	if ("message" in stage) return { kind: "missing", message: stage.message };
	const { frames } = listProjectFrames(root);
	const refs: PlayerFrameRef[] = stage.slides.map((slide) => {
		const frame = frames.find((one) => one.name === slide.frame);
		return { name: slide.frame, ...(frame?.page === undefined ? {} : { page: frame.page }) };
	});
	// a talk is sent to whoever is in the room, to open anywhere: what the slides import from the web comes inside
	const packed = await htmlExport.pack(root, refs, { offline: true });
	if (packed.kind !== "ok") return packed;
	const { js, styles, styleOf, fonts, importMap, state, inline } = packed.value;
	const start = stage.slides[0]?.frame ?? "";
	const cover = frames.find((one) => one.name === start)?.cover;
	const config = {
		project,
		projectCapability: "",
		start,
		scenario: "default",
		frames: Object.fromEntries(stage.slides.map((slide) => [slide.frame, { w: slide.w, h: slide.h }])),
		styles: styleOf,
		exported: { state },
		deck: stage,
	};
	const still = cover === undefined ? undefined : stillOf(root, start, cover.hash);
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Spool">
<title>${escapeHtml(pageName(page))}</title>
<link rel="icon" href="data:,">
<script>window.__SPOOL_PLAY__ = JSON.parse(${escapeJsonScript(JSON.stringify(config))})</script>
<style>${escapeInlineStyle(STAGE_CSS + (await inline(fileCss(stage.size))))}</style>
${fonts === undefined ? "" : `<style>${escapeInlineStyle(fonts)}</style>\n`}${frameSheets(styles, styleOf, undefined)}
<script type="importmap">${escapeJsonScript(importMap)}</script>
</head>
<body>
${still === undefined ? "" : `<div class="spool-talk-still" style="background-image: url(${still})"></div>\n`}<div id="root"></div>
<script>${escapeInlineScript(HINT)}</script>
<script type="module">${escapeInlineScript(js)}</script>
</body>
</html>
`;
	return { kind: "ok", value: { html, filename: talkFileName(page, "html") } };
}

/** The words under the first slide, in the player's own type and colour. */
export const TALK_HINT = "→ next · F full screen";

/**
 * The file's own rules over the stage's. Until the stage fits the body to the talk, the body is the window, so the
 * still shows fitted the same way before and after. The still goes the moment a slide is on screen. The hint sits
 * in the ground under the talk when the window leaves room there, and low over it when not.
 */
const fileCss = (size: { w: number; h: number }) => `
body { position: fixed; inset: 0; margin: 0; }
.spool-talk-still { position: absolute; inset: 0; background: center / contain no-repeat; }
body:has([data-spool-stage-shown]) .spool-talk-still { display: none; }
@font-face { font-family: "Fragment Mono"; font-style: normal; font-weight: 400; font-display: block; src: url("/vendor/fonts/fragment-mono-latin-400-normal.woff2") format("woff2"); }
.spool-talk-hint {
	position: fixed;
	left: 0;
	right: 0;
	bottom: max(16px, calc((100vh - 100vw * ${size.h / size.w}) / 4 - 9px));
	z-index: 3;
	text-align: center;
	color: #94918d;
	font: 400 12px/18px "Fragment Mono", ui-monospace, monospace;
	-webkit-font-smoothing: antialiased;
	pointer-events: none;
	transition: opacity 400ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.spool-talk-hint.is-gone { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .spool-talk-hint { transition: none; } }
`;

/** The hint, put beside the body the stage scales so it stays the window's, and faded for good on the first key. */
const HINT = `(() => {
	const hint = document.createElement("div");
	hint.className = "spool-talk-hint";
	hint.textContent = ${JSON.stringify(TALK_HINT)};
	document.documentElement.append(hint);
	const gone = () => {
		removeEventListener("keydown", gone, true);
		removeEventListener("pointerdown", gone, true);
		hint.classList.add("is-gone");
		setTimeout(() => hint.remove(), 600);
	};
	addEventListener("keydown", gone, true);
	addEventListener("pointerdown", gone, true);
})();`;
