import { CORNER_POP, FADE, GRIP_POP, MENU_IN, MENU_OUT_S, TICKS_FADE } from "./player-size-model";
import { springEasing } from "./spring";

/** A spring the chrome moves by CSS, as `<duration> <easing>`. */
function sprung(options: Parameters<typeof springEasing>[0]): string {
	const { duration, easing } = springEasing(options);
	return `${duration}ms ${easing}`;
}

/** A tween the chrome moves by CSS, as `<duration> <easing>`. */
function tweened({ duration, ease }: { duration: number; ease: readonly number[] }): string {
	return `${duration * 1000}ms cubic-bezier(${ease.join(", ")})`;
}

/** The design's fades: a word or a grip, and the stop marks. */
const FADES = tweened(FADE);
const TICKS_FADES = tweened(TICKS_FADE);
/** The list going, on the ease-out Motion gives a bare duration. */
const MENU_OUT = tweened({ duration: MENU_OUT_S, ease: [0, 0, 0.58, 1] });

/** The page and the screen alone, under the player's bar. */
const PLAYER_SCREEN_RULES = `/* the page is as tall as its content and the browser scrolls it: no clipped
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
`;

/**
 * The played page's own rules (#227): the page, the screen and the 30px bar,
 * for every document that wears the player's chrome. The daemon's player
 * document carries them after its colours and fonts (play.ts), and the
 * read-only canvas in a browser carries them around the frame it plays, so the
 * bar is one bar wherever a frame is played.
 */
export const PLAYER_CHROME_RULES = `${PLAYER_SCREEN_RULES}
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
/* a sized frame (spool#553, spool#263, spool#264): its box drawn at its scale, centred in the room both ways, with
   a hairline round it on the desk, stronger while an edge can be grabbed, and none while it is the window */
.spool-fitted { margin: auto; overflow: hidden; transition: box-shadow ${FADES}; }
.spool-fitted.is-ringed { box-shadow: 0 0 0 1px #212121; }
.spool-fitted.is-ringed.is-hot { box-shadow: 0 0 0 1px #363636; }
/* a screen holding its frame's document in an iframe. The browser puts the
   iframe on whole device pixels, so at a fractional scale a white backing
   reaching the box's edge shows beside a dark frame as a bright hairline
   (spool#263): the backing, for a frame that paints no background of its own,
   stops a pixel short of the edge, at whatever scale the box is drawn */
.spool-screen.is-hosted {
	--spool-inset: calc(2px / var(--spool-scale, 1));
	background: linear-gradient(#fff, #fff) 50% 50% / calc(100% - var(--spool-inset)) calc(100% - var(--spool-inset)) no-repeat;
}
.spool-fitted.is-off { display: contents; }
.spool-top {
	position: fixed;
	inset: 0 0 auto;
	z-index: 10;
	/* its hairline is inside its 30px, so the page's inset and the bar agree */
	box-sizing: border-box;
	/* the size in the middle column, dead centre whatever stands either side of it */
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
	align-items: center;
	gap: 12px;
	padding: 0 6px;
	background: #0e0e0e;
	border-bottom: 1px solid #212121;
	color: #f0efed;
	font: 400 12px/18px "Fragment Mono", ui-monospace, monospace;
	-webkit-font-smoothing: antialiased;
	font-synthesis: none;
}
/* the first 76px are the OS's: three lights, inset by trafficLightPosition —
   and this bar is the window's title bar, so a hand on it moves the window */
.spool-top.is-desk { padding: 0 12px; -webkit-app-region: drag; }
.spool-top.is-desk button, .spool-top.is-desk [role=menu] { -webkit-app-region: no-drag; }
.spool-bar-title {
	container-type: inline-size;
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	padding-left: 10px;
	white-space: nowrap;
}
.spool-top.is-desk .spool-bar-title { padding-left: 64px; }
.spool-bar-project { color: #6c6a67; white-space: nowrap; }
.spool-bar-name { overflow: hidden; color: #94918d; white-space: nowrap; text-overflow: ellipsis; }
/* squeezed past a few letters by the middle, the name gives way rather than leave one */
@container (width < 28px) { .spool-bar-name { visibility: hidden; } }
.spool-bar-fit .spool-bar-tip { right: auto; left: 50%; translate: -50% 0; white-space: nowrap; }
.spool-bar-end { display: flex; align-items: center; justify-content: flex-end; gap: 2px; min-width: 0; }
/* the size the frame plays at (spool#264): the readout, size first, which opens the list of sizes under it */
.spool-size { justify-content: center; }
.spool-size-readout {
	display: flex;
	align-items: center;
	gap: 6px;
	height: 24px;
	margin: 0;
	padding: 0 4px 0 6px;
	border: 0;
	border-radius: 4px;
	background: none;
	color: #94918d;
	font: 400 11px/16px "Fragment Mono", ui-monospace, monospace;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
	cursor: pointer;
	transition: background-color ${FADES}, color ${FADES};
}
.spool-size-readout.is-away { color: #f0efed; }
.spool-size-readout:hover, .spool-size-readout.is-pressed { background: rgb(240 239 237 / 0.06); color: #f0efed; }
.spool-size-said { display: flex; align-items: center; }
/* a word comes in from the left and goes to the right, popped out of the line as it goes */
.spool-size-slot { position: relative; display: flex; }
.spool-size-word { color: #94918d; white-space: pre; }
.spool-size-word.is-in { animation: spool-size-word-in ${FADES} both; }
.spool-size-word.is-out { position: absolute; top: 0; left: 0; animation: spool-size-word-out ${FADES} forwards; }
@keyframes spool-size-word-in { from { opacity: 0; translate: -4px 0; } }
@keyframes spool-size-word-out { to { opacity: 0; translate: 4px 0; } }
.spool-size-caret { flex: none; color: #6c6a67; transition: rotate ${sprung(MENU_IN)}; }
.spool-size-readout[aria-expanded=true] .spool-size-caret { rotate: 180deg; }
.spool-size-menu {
	position: absolute;
	top: calc(100% + 5px);
	left: 50%;
	translate: -50% 0;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	width: 200px;
	max-width: calc(100vw - 16px);
	padding: 4px;
	border: 1px solid #363636;
	border-radius: 8px;
	background: #282828;
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.32);
	outline: none;
	transform-origin: 50% 0;
	animation: spool-size-menu-in ${sprung(MENU_IN)} both;
}
.spool-size-menu.is-out { pointer-events: none; animation: spool-size-menu-out ${MENU_OUT} forwards; }
@keyframes spool-size-menu-in { from { opacity: 0; transform: translateY(-4px) scale(0.98); } }
@keyframes spool-size-menu-out { to { opacity: 0; transform: translateY(-2px) scale(0.99); } }
.spool-size-row {
	display: flex;
	flex: none;
	align-items: center;
	gap: 8px;
	box-sizing: border-box;
	width: 100%;
	min-width: 0;
	height: 28px;
	margin: 0;
	padding: 0 8px;
	border: 0;
	border-radius: 6px;
	background: none;
	color: #f0efed;
	font: 400 13px/20px "Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif;
	text-align: left;
	cursor: default;
	transition: background-color ${FADES};
}
.spool-size-row[data-state=hover] { background: rgb(240 239 237 / 0.06); }
.spool-size-check { display: flex; flex: none; align-items: center; justify-content: center; width: 16px; height: 16px; }
.spool-size-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spool-size-meta {
	flex: none;
	max-width: 60%;
	overflow: hidden;
	color: #94918d;
	font: 400 11px/16px "Fragment Mono", ui-monospace, monospace;
	font-variant-numeric: tabular-nums;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.spool-size-rule { flex: none; height: 1px; margin: 4px 8px; border: 0; background: #363636; }
/* the desk round the frame: under it, where an edge is grabbed and the stops are marked; over it, the grip. A pull
   holds the pointer, so the frame's own document never takes it, and selects nothing */
.spool-desk { position: fixed; inset: 30px 0 0; z-index: 0; }
.spool-grips { position: fixed; inset: 30px 0 0; z-index: 1; pointer-events: none; }
.spool-page.is-pulling { -webkit-user-select: none; user-select: none; }
.spool-page.is-pulling .spool-screen { pointer-events: none; }
.spool-ticks, .spool-grip { position: absolute; inset: 0; pointer-events: none; }
.spool-ticks { animation: spool-size-fade-in ${TICKS_FADES} both; }
.spool-ticks.is-out { animation: spool-size-fade-out ${TICKS_FADES} forwards; }
.spool-grip { animation: spool-size-fade-in ${FADES} both; }
.spool-grip.is-out { animation: spool-size-fade-out ${FADES} forwards; }
@keyframes spool-size-fade-in { from { opacity: 0; } }
@keyframes spool-size-fade-out { to { opacity: 0; } }
.spool-tick { position: absolute; background: #363636; transition: background-color ${FADES}; }
.spool-tick.is-across { width: 1px; height: 6px; translate: -50% 0; }
.spool-tick.is-down { width: 6px; height: 1px; translate: 0 -50%; }
.spool-tick.is-lit { background: #f5391a; }
.spool-grip-edge { position: absolute; transition: background-color ${FADES}, opacity ${FADES}; }
.spool-grip-edge.is-side { width: 1px; }
.spool-grip-edge.is-end { height: 1px; }
.spool-grip-pill { position: absolute; translate: -50% -50%; }
.spool-grip-pill > span {
	display: block;
	border-radius: 999px;
	transition: background-color ${FADES}, scale ${sprung(GRIP_POP)}, opacity ${sprung(GRIP_POP)};
	animation: spool-grip-pop ${sprung(GRIP_POP)} backwards;
}
.spool-grip-pill > .is-side { width: 4px; height: 32px; }
.spool-grip-pill > .is-end { width: 32px; height: 4px; }
@keyframes spool-grip-pop { from { opacity: 0; scale: 0.5; } }
.spool-grip-edge.is-near, .spool-grip-pill > .is-near { background: #94918d; }
.spool-grip-edge.is-held, .spool-grip-pill > .is-held { background: #f0efed; }
.spool-grip-edge.is-snapped, .spool-grip-pill > .is-snapped { background: #f5391a; }
.spool-grip-corner { position: absolute; width: 24px; height: 24px; translate: -50% -50%; color: #f0efed; transition: color ${FADES}; }
.spool-grip-corner.is-snapped { color: #f5391a; }
.spool-grip-corner svg { display: block; overflow: visible; }
.spool-grip-corner path {
	transform-box: view-box;
	transform-origin: center;
	transition: scale ${sprung(CORNER_POP)};
	animation: spool-corner-pop ${sprung(CORNER_POP)} backwards;
}
.spool-grip-corner path.is-snapped { scale: 1.12; }
@keyframes spool-corner-pop { from { scale: 0.6; } }
@media (prefers-reduced-motion: reduce) {
	.spool-size-word, .spool-size-menu, .spool-ticks, .spool-grip, .spool-grip-pill > span, .spool-grip-corner path { animation: none; }
	.spool-size-word.is-out, .spool-size-menu.is-out, .spool-ticks.is-out, .spool-grip.is-out { display: none; }
}
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
/* Record (spool#221): a dot to start; while recording the dot lit and the time beside it */
.spool-record-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.spool-record-on {
	display: flex;
	align-items: center;
	gap: 6px;
	height: 24px;
	padding: 0 6px;
	border: 0;
	border-radius: 4px;
	background: none;
	color: #f0efed;
	font: 400 11px/18px "Fragment Mono", ui-monospace, monospace;
	font-variant-numeric: tabular-nums;
	cursor: pointer;
}
.spool-record-on:hover { background: #1c1c1c; }
.spool-record-on .spool-record-dot { background: #f5391a; animation: spool-bar-loading 1.2s ease-in-out infinite; }
.spool-record-on.is-near { color: #f5391a; }
.spool-record-choice { display: flex; align-items: center; gap: 2px; }
.spool-record-choice > .spool-bar-hint { margin-right: 4px; }
.spool-record-discard { margin-left: 6px; color: #94918d; }
.spool-record-failed { color: #f5391a; cursor: help; }
.spool-bar-icon.is-lit .spool-record-dot { color: #f5391a; }
.spool-record-running { display: flex; align-items: center; gap: 6px; }
.spool-record-shape { color: #6c6a67; }
.spool-record-key {
	padding: 0 5px;
	border: 1px solid #363636;
	border-radius: 4px;
	color: #6c6a67;
	font: 400 11px/16px "Fragment Mono", ui-monospace, monospace;
}
.spool-record-progress { padding: 0 6px; font-variant-numeric: tabular-nums; }
/* how far the clip has rendered, along the bar's foot */
.spool-record-line {
	position: absolute;
	left: 0;
	bottom: -1px;
	height: 1px;
	background: #f5391a;
	transition: width 260ms ease-out;
}
/* Record's panel, under the dot: the clip's shape, then Start */
.spool-record-panel {
	position: absolute;
	top: calc(100% + 6px);
	right: 6px;
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: 280px;
	box-sizing: border-box;
	padding: 12px;
	background: #282828;
	border: 1px solid #363636;
	border-radius: 8px;
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);
	animation: spool-record-in 140ms ease-out;
}
@keyframes spool-record-in { from { opacity: 0; translate: 0 -4px; } }
.spool-record-panel-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
.spool-record-panel-limit { color: #6c6a67; font-size: 11px; }
.spool-record-shapes { display: flex; min-width: 0; margin: 0; padding: 1px; border: 1px solid #363636; border-radius: 6px; }
.spool-record-shape-pick {
	flex: 1;
	height: 22px;
	margin: 0;
	padding: 0;
	border: 0;
	border-radius: 4px;
	background: none;
	color: #94918d;
	font: inherit;
	font-size: 11px;
	cursor: pointer;
	transition: background-color 140ms ease-out, color 140ms ease-out;
}
.spool-record-shape-pick:hover { color: #f0efed; }
.spool-record-shape-pick.is-on { background: #3a3a3a; color: #f0efed; }
.spool-record-panel-says { margin: 0; color: #94918d; font-size: 11px; line-height: 16px; }
.spool-record-panel-foot { display: flex; justify-content: flex-end; gap: 8px; }
.spool-record-button {
	height: 24px;
	margin: 0;
	padding: 0 10px;
	border: 0;
	border-radius: 4px;
	background: none;
	color: #94918d;
	font: 400 12px/18px "Fragment Mono", ui-monospace, monospace;
	cursor: pointer;
	transition: background-color 140ms ease-out, color 140ms ease-out;
}
.spool-record-button:hover { background: rgb(240 239 237 / 0.06); color: #f0efed; }
.spool-record-button.is-primary { background: #f0efed; color: #0e0e0e; }
.spool-record-button.is-primary:hover { background: #ffffff; }
/* the clip saved, said under the bar for a few seconds */
.spool-record-toast {
	position: absolute;
	top: calc(100% + 8px);
	right: 8px;
	display: flex;
	align-items: center;
	gap: 12px;
	height: 40px;
	box-sizing: border-box;
	padding: 0 6px 0 16px;
	background: #282828;
	border: 1px solid #363636;
	border-radius: 8px;
	box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);
	white-space: nowrap;
	animation: spool-record-in 220ms ease-out;
}
.spool-record-toast-message { font-size: 12px; }
.spool-record-toast-file { color: #94918d; font-size: 11px; }
/* a frame played at a clip's shape sits in the window's dark, framed, and red while it records */
.spool-page.has-bar .spool-screen.is-shaped { margin: auto; min-height: 0; outline: 1px solid #363636; }
.spool-page.has-bar .spool-screen.is-shaped.is-recording { outline-color: #f5391a; }
@media (prefers-reduced-motion: reduce) {
	.spool-record-on .spool-record-dot { animation: none; }
	.spool-record-panel, .spool-record-toast { animation: none; }
}
.spool-top button:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
	.spool-bar-icon, .spool-bar-tip { transition: none !important; }
}
`;
