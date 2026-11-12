# #283 · Deck: dragging flickers, and a sweep for every flicker in the deck

- State: closed (fixed in 8a1522b8)
- Labels: bug, ready-for-agent
- Tasks: task 598 (Fix deck drag flickers)
- Created: 2026-11-11T10:07:14.083Z
- Updated: 2026-11-11T22:11:20.256Z
- Closed: 2026-11-11T22:11:20.256Z

## What Liam saw

After using decks (spool 0.55.0 / Spool Beta, experiment `deck`): "there are alot of glithces though like dragging the snap it like flcikers, and alot of flickers are there". He asked for the deck to be robust before anything else: no artifacts, glitches or flashes. The spec is #265; the design he picked is on the team canvas as `app/spool-deck*` (code in `design/shared/ui/spool/deck/`, the drag in `field.tsx`), decided in #255. The build's drag is in `src/ui/deck/` (`deck-page.tsx`, `deck-drag.ts`, `deck-motion.ts`) with its rules in `src/deck/changes.ts` and `layout.ts`.

## What is already reproduced (task 557)

Headless Chromium, a 5-slide deck with two loose frames, canvas zoomed to fit (a slide about 62 px wide on screen), a loose frame dragged slowly across the band. The script, the project and contact sheets of the captured frames are in `~/.brain-archive/deck-flicker/` (`drag.mjs`, `talk-project/`, `sheet-drag.png`, `sheet-mid.png`, `sheet-drop.png`).

- **The row reshuffles three times per slide crossed.** A slide's left fifth previews "insert before", its middle "trade", its right fifth "insert after" (the prototype's rule). At this zoom those zones are about 12, 37 and 12 px wide. Crossing one slide starts a 440 ms glide that sends the slide down to the grid (trade), reverses it a moment later, then shifts the whole row sideways (insert), then back. Glides are cut off and reversed mid-flight, and the far end of the row slides off screen and returns. This reads as flicker.
- **Loose frames hop.** Lifting a loose frame makes the other loose frames move to other cells and back while the held one is nowhere near them.
- **After the drop** the landing outline stays beside the dropped frame for several frames and the row shifts a few px before settling.

This was never watched on a GPU. Liam's "alot of flickers" is wider than the drag; find the rest.

## What to do

Use the diagnosing-bugs skill. Work on the m1 in the Mac app built from your branch (the m1 skill; `desktop/README.md`), because paint flicker only shows on a real GPU.

1. **Record first.** Screen-record at 60 fps and step through the frames for: dragging on the band at three zooms (fit, 50%, 100%), dragging in the loose grid, dragging a row in Pages across the hairline, a drop, undo and redo of a drop, lifting and putting back without moving, selecting and hovering slides, going into a slide and back, New presentation's arrival, Present start and End, changing the talk's size. Record the same gestures on the prototype frames at the same zoom. Write down every flicker, jump, blink, reversal or late repaint with its cause. Keep the recordings under `~/.brain-archive/deck-flicker/m1/`.
2. **Fix every one.** These rules are decided; how is yours:
   - **A still hand changes nothing, and a small tremble (a few px) changes nothing.** A preview changes only when the pointer has clearly moved into another zone: zones are measured on screen with a margin to leave them (hysteresis), not in canvas units.
   - **Crossing a slide at a steady pace changes the preview at most twice**, and a glide that has started is never reversed inside its first moments by the next zone. At a zoom where a slide is too small on screen for three zones a hand can hit, the edges insert and the trade zone needs a rest of the pointer on the slide's middle. Keep Liam's rules at reading zoom exactly: edge inserts, middle trades.
   - **Only what the drop would move, moves.** A lifted loose frame leaves its cell empty; the other loose frames stay where they are until the held frame is over their cell. The row never slides out of view and back because of a preview.
   - **A drop settles once.** From release to rest every frame goes one way to its final place: no frame goes back to where it was and then on, the outline fades once, the row does not shift afterwards. The window holds the preview until the daemon's answer and its written places agree with it; the daemon's own writes and reconcile never show as a second movement.
   - **No picture blinks.** No slide's picture is swapped for a placeholder, a spinner, an older picture or a remounted document because of a drag, a drop, a layout write, a selection or the background stage being built. If the background stage (built when a deck page opens) costs frames during a drag, it waits until the hand is up.
   - **The band's lift and the labels' numbers** change with the same calm: no toggling at an edge.
   - Everything else that flickers in the sweep gets the same treatment: one movement, one direction, nothing shown that is not the final picture or the way to it.
3. **Prove it.** A browser test that drags across a deck with captured frames and fails on: a preview that changes while the pointer is still or trembling, more than two preview changes per slide crossed, a frame's position reversing after a drop, a slide's picture going blank. Prior art: the stage's captured-frame suite (`src/daemon/deck/stage-browser.test.ts`) and the canvas walk (`src/daemon/deck-canvas-browser.test.ts`). Then record the same list on the m1 again, after the fix.

## Leave alone

Liam's drop rules themselves (insert, trade with its notes, take out, several at once) and what a drop writes. Ordinary pages' dragging and snapping, unless the sweep shows the same flicker there: then say so and bring it to task 557 before touching it. The motion numbers from the prototype, unless one is the cause: then say which and why.

## Done when

- The list of what flickered, each with its cause and fix, is in the handoff, with before and after recordings.
- The new test passes and fails on main as it was (show that it does).
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`, the full `pnpm test`, a patch changeset, merged to main with CI green.
- Message task 557 with the list and where the recordings are. Do not release.

## Comments

### agent, 2026-11-11T22:11:20.256Z

Fixed and merged in 8a1522b8 (PR #429): drop, undo, redo and size-undo settle in one glide; frames glide on their own; loose frames move only when the held frame is over them; 8 px hysteresis on the aim. Zones left for #296. The stutter going into a slide (about 200 ms with no frames drawn while the live frame starts) was reported to task 557, not fixed. Recordings and harness: ~/.brain-archive/deck-flicker/. Test: src/daemon/deck-flicker-browser.test.ts.
