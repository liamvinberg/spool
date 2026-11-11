# #269 · Deck: the stage, never late and never showing an error

- State: closed (landed on main)
- Labels: ready-for-agent
- Parent: #265
- Blocked by: #267
- Created: 2026-11-10T17:59:12.295Z
- Updated: 2026-11-10T23:39:52.182Z
- Closed: 2026-11-10T23:39:52.182Z

## Parent

#265 (the spec; read it first, then ticket #255's resolution for what was decided and turned down)

## What to build

The stage: the deck's play mode, as one engine that can be hosted anywhere, proven in a single window. Opening the stage for a deck page from a given slide shows that slide scaled and centred on black, and the keys walk the talk: beats, then slides, with carry and dissolve between slides. It is never late and never shows an error.

Read the spec's "The stage: one engine, three hosts" and "Never a flash, never an error" first. Those two sections are this ticket.

- Deck mode in the player: one render document composing only the talk's slides in order, the session and its pure reducer, the beat handed to `ui.beats`, restart, the key table with the text-field, handed-keyboard and clicker rules applied where the focus is, clicks advancing on a slide that is not live.
- The stage at the talk's size, scaled both ways, other shapes fitted and centred, every slide change a same-document swap so shared `view-transition-name`s morph and the rest cross-fade.
- Ready before the key, and the room never sees an error, exactly as the spec states them. The stage reports per slide: ready, loading or broken, and why; the hosts in later tickets show that to the presenter.
- A saved change keeps slide and beat.
- The stage as a host-agnostic piece: it takes a session from outside or owns one, and reports state changes. The next tickets host it in the room's window, the presenter view and the canvas; make a plain play address for a deck page work now as the first host.
- The hard fixture deck from the spec's testing section, and the browser suite over it.

## What is open, and yours to design

How a slide becomes ready ahead of the key. The facts: today's warming imports modules only; a frame's styles are fetched as text and switched on at the swap, and one frame's styles are active at a time; swaps are keyed remounts inside a view transition; there is no error boundary per frame; nothing fixed explains the 1.5 s the designers measured, so trace it first. Two candidates are in the spec. Whatever you choose must be proven by the suite, not argued. Message task 557 before settling on a mechanism that changes how ordinary play works.

## Where to start

`src/daemon/play.ts` and `player-compile.ts` (what a play session composes and its config), `src/runtime/frame-runtime.ts` (`ui.go`, style activation, the swap, `warmScreens`, the error reports), `src/runtime/player-shell-runtime.tsx` (the trusted shell, the private port, the handshakes), `src/runtime/player-fit.ts` and `player-chrome*.ts` (fit, the bar, the background). The prototype's `stage.tsx`, `slides.tsx`, `keys.ts` and `state.ts` on the team canvas show the behaviour and hold the motion constants.

## Leave alone

Ordinary play and its flows: a walk between frames must behave as today. Record. The cloud viewer's player.

## Done when

- The reducer and the key table are proven as functions.
- The browser suite over the hard fixture passes: ready before the command on every step, no blank or unstyled frame in the captured frames, an unready jump holds the old picture, none of the three broken slides shows anything but a slide, a saved change keeps the place.
- Ordinary play's own tests still pass untouched.
- The handoff says which mechanism was chosen for readiness and for keeping a broken slide's picture, what the trace attributed the 1.5 s to, and what a WebGL slide does when it breaks.
- `pnpm test:changed`, `pnpm typecheck` and `pnpm check` pass.

## Comments

### agent, 2026-11-10T23:39:52.182Z

Landed on main at 35be63e2, behind the experiment `deck`. Readiness: the two slides ahead and the one behind are rendered out of sight with their styles, fonts and pictures loaded, then the rest of the talk, all in the one stage document. Steps to a ready slide commit in one frame, 2 to 30 ms after the key. A broken slide's picture is kept: a slide that won't compile holds the step, one that throws on mount has its swap undone before paint, and one that throws later is replaced by a still copy. A WebGL slide keeps its last frame through preserveDrawingBuffer, or reports `picture-without-webgl`. The 1.5 s was not a fixed wait: the stylesheet built on first ask (115 to 1339 ms cold), plus module fetches, a heavy render and the font arriving late. Ordinary play is unchanged. Handoff: /tmp/pi-orch/spec-575/handoffs/t269.md.
