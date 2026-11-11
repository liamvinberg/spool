# #263 · play: a frame plays at its own size, a long page scrolls, and the bar always says the size

- State: closed (shipped in ffca6e5e)
- Labels: enhancement, ready-for-agent
- Created: 2026-11-10T10:23:02.649Z
- Updated: 2026-11-10T11:40:36.482Z
- Closed: 2026-11-10T11:40:36.482Z

## What Liam wants

Play should show a frame the way it was drawn. Today three things break that (found in task 565, after spool#553 shipped fit in 0.54.0):

1. **A small frame is stretched.** A 390 × 844 phone frame played in a 2000 × 1100 window is laid out 390 wide and as tall as the window (390 × 1070): a phone nobody owns. `desktop/src/play-window.ts` already says "stretching that one to the screen would invent a device nobody has", but the page inside the window does exactly that (`fittedBox` in `src/runtime/player-fit.ts`, and the responsive branch of `playedBox` in `src/runtime/player-shell-runtime.tsx`).
2. **A long page is shrunk to a sliver.** Fit shrinks until the whole authored height shows, so a 1440 × 5523 landing page plays at about 16% on a laptop. About 1 frame in 10 on Liam's canvases is this tall.
3. **The bar says nothing.** The middle control only renders when the frame overflows the window (`overflows` in `player-chrome.tsx`), so for a phone in a big window there is no size, no percent and nothing to click. Liam went looking for the 0.54.0 feature and could not find it.

There is also a bug, below.

## What was decided

**In fit mode (the default), a frame plays at exactly its authored size and is never stretched.** With authored `A × B`, room `W × R` (the window less the 30px bar), `sw = min(1, W / A)` and `whole = min(sw, R / B)`:

- **Screen** (when `whole >= sw / 2`): the box is exactly `A × B`, drawn at scale `whole`, centred in the room both ways on the dark desk. No extra height, even when the window is taller (this drops today's "the room below it is the frame's too").
- **Page** (when showing the whole height would cost more than half the size the width already allows): the box is `A × floor(R / sw)`, drawn at scale `sw`, and the frame's document scrolls inside it. Width is kept, height is the window's.

Name the half as one constant. Nothing is ever enlarged. A frame with no authored size keeps defaulting to 1440 × 900 and follows the same rules.

Checks: 390 × 844 in 2000 × 1100 gives 390 × 844 at 100%, centred. 1440 × 944 in 1000 × 640 (the spool#553 case) gives 1440 × 944 at about 65%. 1440 × 5523 in 1512 × 945 gives 1440 × 915 at 100%, scrolling.

**Responsive is unchanged:** `min(W, A) × R` at scale 1, one click away, remembered in `localStorage["spool:player-fit"]`.

**The bar's middle readout is always there** (still hidden under 520px of window width, and while recording at a clip's shape). It shows the size the frame is laid out at, plus the percent when it is drawn smaller:

- fit: `390 × 844`, or `1440 × 944 · 65%`
- responsive: `1512 × 915 · responsive`

It stays a button that flips fit and responsive, with the existing hover tip (`Tip`, 400ms) saying in plain words what a click does. Same small grey text the bar has now; no new look. It updates live while the window is resized, so the size that used to flash for 900ms during a resize is replaced by it.

## The bug

Playing a narrow dark frame (Liam's was a phone frame in a window about 2000 wide, Mac app) shows a thin bright white vertical line down the right edge of the frame, the full height of the window. Nothing in Play draws a line on purpose. Not yet diagnosed; suspects are the white backing of `.spool-screen` (`player-chrome-css.ts`, `background: #fff`) showing through at a sub-pixel edge when `margin: 0 auto` lands the box on a half pixel, or a classic scrollbar on the frame's document. Reproduce it in a browser first (try odd window widths, and macOS "always show scroll bars"), fix the cause, and show a before and after screenshot in the report.

## Turned down

- **Readout only**, keeping the sizing: the phone stays stretched.
- **Detecting screen or page from the frame's content:** a fixed-height app mock and a long page look the same from outside (decided in spool#553).
- **A screen/page field in frame.json:** the half rule needs no new field and nothing for agents to learn.
- **A device menu, drag-to-resize or typed sizes:** being designed separately on the canvas. Do not build any way to choose a size here.

## Where to start

- `src/runtime/player-fit.ts` and `player-fit.test.ts`: the rule lives here; prove the three cases above as unit tests and replace the "room below it" case.
- `src/runtime/player-chrome.tsx` (the screen's style, `spool-fitted`, `TopBar`'s middle control near the fit tips) and `player-chrome-css.ts` (centring: today `margin: 0 auto`, top-aligned).
- `src/runtime/player-shell-runtime.tsx` `playedBox`: the box sent across the port must be exactly the iframe's box, or the reveal wedges shut (see its comment).
- `src/ui/viewer/viewer-player.tsx`: the viewer's player and shared links follow the same rule; keep the grow transition between frames of different sizes working.
- `src/daemon/play-tab-browser.test.ts`: extend one case to prove the wiring (readout shown for a frame that fits, box centred at authored size). One browser case, not one per rule.

## Leave alone

- The Mac app's window sizing and remembered rectangles (`desktop/src/play-window.ts`, `desktop/src/main.ts`).
- Recording and its shaped boxes (`record-protocol.ts`).
- The what's-new clip for 0.54.0.

## Done

- The three checks above hold in the play tab, the Mac app's play window and the viewer's player.
- The bar shows the readout for every frame, and clicking it flips fit and responsive.
- The white line is gone, with its cause named.
- A changeset (minor) in plain words, and the design mirror redrawn: the bar's readout in `design/shared/ui/spool/viewer-player.tsx` and the player frames under `design/frames/app/spool-player*`, with a state frame for a phone centred at its own size.
- `pnpm test`, `pnpm typecheck`, `pnpm check` pass.

## Comments

### agent, 2026-11-10T11:40:36.482Z

Shipped in ffca6e5e (ff875cfe: sizing and the readout; 3cf5456b: the white line). White line cause: the white backing of .spool-screen sat under the frame's cross-origin iframe. The browser puts the iframe on whole device pixels but paints the backing with a soft edge, so at a fractional scale factor a sliver of white showed beside a dark frame. The backing now stops a pixel short of the box's edge.
