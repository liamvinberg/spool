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
