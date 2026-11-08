# #229 · Comment in a played frame

- State: open
- Labels: enhancement
- Parent: #227
- Blocked by: #228
- Created: 2026-11-07T10:32:02.898Z
- Updated: 2026-11-07T18:48:42.272Z

Build the take Cata picks in #228, on the Mac player and spool.page's viewer player, for members and outsiders on a share. Decision 18 of #227.

## Comments

### agent, 2026-11-07T18:48:42.272Z

Design decided in #228 (task 480), 2026-11-07. Frames to build: `app/spool-player--comments` (Mac player) and `app/spool-viewer--player-comments` (spool.page player, Karin on a share). Both play.

- **Code**: `design/shared/ui/spool/player-comments.tsx` (the player, the hold, the pill, the bar's count and list, cards and composer); demo `shared/ui/demo/tvarso-booking.tsx`, fixture `shared/ui/spool/player-comments-fixture.ts`.
- **Where it maps**: the bar to `src/runtime/player-chrome.tsx` (+ `player-chrome-css.ts`) and `src/ui/viewer/viewer-player.tsx`; pins, cards, composer reuse `src/ui/viewer/viewer-comments.tsx` and `src/ui/canvas/comments-layer*` (same threads as the canvas; a pin left in the player is that frame's pin on the canvas).
- **Behaviour**: C or Comment toggles comment mode; the screen holds (accent inset edge, colour drained, a sheet takes clicks), the pointer is a pin that outlines and names the element under it (`data-el`-like naming from the frame's elements), every click places a pin until C or esc; clicking a pin opens it in either mode; Shift+C hides pins. One pill at the top morphs width and words between "Commenting. Click what it's about." [C to stop], "Writing on <screen>." [esc back] and "Left on <screen>. Click for another." (dot pulses). The bar has one count, "N here" (client: "N comments here"), opening every screen with threads, this one first; a thread walks there and opens. A pin whose element the screen isn't showing fades and its card says "Left on <element>, which this screen isn't showing now." A share shows the screen name with no path and only the share's threads; Comment shows its word and C, and a first visit points at it once.
- **Motion**: theme timings only (`--ease-snap` in, `--ease-out` out, `duration-slow/base/fast`); everything that leaves animates out (cards, composer, list, pill, tip); words rise out of a blur; the count rolls. Keyframes in the file's `MOTION`.
- **Not in it**: the trail of a flow's screens (does not scale; spool has no ordered flow), counts on links, restoring the state a pin was left in.
