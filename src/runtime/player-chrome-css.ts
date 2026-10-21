/**
 * The played page's own rules (#227): the page, the screen and the 30px bar,
 * for every document that wears the player's chrome. The daemon's player
 * document carries them after its colours and fonts (play.ts), and the
 * read-only canvas in a browser carries them around the frame it plays, so the
 * bar is one bar wherever a frame is played.
 */
export const PLAYER_CHROME_RULES = `/* the page is as tall as its content and the browser scrolls it: no clipped
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
   is the same strip with copy link and close. Always worn, on the page's own
   dark with a hairline under it: the frame's name and the way home are never
   more than a glance away, and nothing has to be found again */
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
	padding: 0 6px 0 16px;
	background: #0e0e0e;
	border-bottom: 1px solid #212121;
	color: #f0efed;
	font: 400 12px/18px "Fragment Mono", ui-monospace, monospace;
	-webkit-font-smoothing: antialiased;
	font-synthesis: none;
}
/* the first 76px are the OS's: three lights, inset by trafficLightPosition —
   and this bar is the window's title bar, so a hand on it moves the window */
.spool-top.is-desk { padding: 0 12px 0 76px; -webkit-app-region: drag; }
.spool-top.is-desk button { -webkit-app-region: no-drag; }
.spool-bar-title { display: flex; align-items: center; gap: 6px; min-width: 0; }
.spool-bar-project { color: #6c6a67; white-space: nowrap; }
.spool-bar-name { overflow: hidden; color: #94918d; white-space: nowrap; text-overflow: ellipsis; }
/* the window's size, said in the middle while it is being resized and gone once it settles */
.spool-bar-size {
	position: absolute;
	left: 50%;
	translate: -50% 0;
	color: #94918d;
	font-size: 11px;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
	opacity: 0;
	pointer-events: none;
	transition: opacity 180ms ease-out;
}
.spool-bar-size.is-on { opacity: 1; }
.spool-bar-end { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.spool-bar-hint { color: #94918d; font-size: 11px; white-space: nowrap; }
/* said while the screen is on its way: the compile and the first fetch happen
   behind the bar, and a box with nothing in it says nothing */
.spool-bar-loading { animation: spool-bar-loading 1.2s ease-in-out infinite; }
@keyframes spool-bar-loading { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .spool-bar-loading { animation: none; } }
/* the arrival: the shell's screen until the player is first seen. The page's
   dark over the screen's white, the mark winding its thread once the wait is
   long enough to say so, and a dissolve into the frame when it is ready. It
   never takes a pointer */
.spool-arrival {
	position: absolute;
	inset: 0;
	z-index: 1;
	display: grid;
	place-items: center;
	background: #0e0e0e;
	pointer-events: none;
	transition: opacity 240ms ease-out, visibility 0s linear 240ms;
}
.spool-arrival.is-arrived { opacity: 0; visibility: hidden; }
.spool-arrival-mark { width: 40px; overflow: visible; opacity: 0; animation: spool-arrival-in 300ms ease forwards; }
.spool-arrival-mark path {
	fill: #f5391a;
	transform-box: fill-box;
	transform-origin: left center;
	scale: 0 1;
	animation: spool-wind 2.8s cubic-bezier(0.6, 0, 0.2, 1) infinite;
}
.spool-arrival.is-arrived .spool-arrival-mark, .spool-arrival.is-arrived path { animation-play-state: paused; }
@keyframes spool-arrival-in { to { opacity: 1; } }
/* wound on from the left, held, and wound off to the right */
@keyframes spool-wind {
	0% { scale: 0 1; transform-origin: left center; }
	32% { scale: 1 1; transform-origin: left center; }
	68% { scale: 1 1; transform-origin: right center; }
	92%, 100% { scale: 0 1; transform-origin: right center; }
}
@media (prefers-reduced-motion: reduce) { .spool-arrival-mark path { animation: none; scale: 1 1; } }
/* copy link and close: one box each, lit on hover */
.spool-bar-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: none;
	width: 24px;
	height: 24px;
	margin: 0;
	padding: 0;
	background: none;
	border: 0;
	border-radius: 4px;
	color: #94918d;
	cursor: pointer;
	transition: background-color 140ms ease-out, color 140ms ease-out;
}
.spool-bar-icon:hover { background: rgb(240 239 237 / 0.06); color: #f0efed; }
/* the copy link: as wide as the word that says it copied */
.spool-bar-copy { width: auto; min-width: 24px; padding: 0 4px; }
/* a control's name under it, after a beat, with its key when it has one */
.spool-bar-tipped { position: relative; display: flex; }
.spool-bar-tip {
	position: absolute;
	top: calc(100% + 6px);
	right: 0;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 4px 8px;
	background: #282828;
	border: 1px solid #363636;
	border-radius: 6px;
	color: #f0efed;
	font-size: 11px;
	line-height: 16px;
	white-space: nowrap;
	opacity: 0;
	pointer-events: none;
	transition: opacity 140ms ease-out 0s;
}
.spool-bar-tip kbd {
	padding: 0 5px;
	border: 1px solid #363636;
	border-radius: 4px;
	color: #94918d;
	font: inherit;
}
.spool-bar-tipped:hover .spool-bar-tip,
.spool-bar-tipped:has(:focus-visible) .spool-bar-tip { opacity: 1; transition-delay: 400ms; }
.spool-dash { flex: none; width: 8px; height: 2px; background: transparent; }
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
.spool-bar-sharing { display: flex; align-items: center; gap: 8px; }
.spool-top button:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
	.spool-bar-size, .spool-bar-icon, .spool-bar-tip { transition: none !important; }
}
`;
