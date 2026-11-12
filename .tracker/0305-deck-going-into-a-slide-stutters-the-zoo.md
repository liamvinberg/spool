# #305 · Deck: going into a slide stutters (the zoom freezes about 200 ms, then jumps)

- State: open
- Labels: bug, ready-for-agent
- Created: 2026-11-11T22:11:53.660Z
- Updated: 2026-11-11T22:11:53.660Z

## What happens

On a deck page (experiment `deck`), going into a slide (double-click or ↵) starts the camera's zoom, then the window draws nothing for about 200 ms while the slide's live frame starts up, then the zoom jumps most of the way in one frame. Found by the flicker sweep for #283 on the m1's GPU: `~/.brain-archive/deck-flicker/m1/inside-fit-before/` (`samples.json`, samples 1630 to 1834 ms; the README beside it explains the files). Liam's bar for decks: no glitches, "as good as if apple would've made them almost".

## What to do

The zoom must run at the display's frame rate from the first frame to the last, with the slide's picture standing in until the live slide has drawn, and no blink when the live slide takes over. The cause to confirm first: the live frame is started at the moment the camera starts moving, and its start-up blocks the window. The expected fix: start the live frame only once the camera has landed (or as soon as it can be started without costing the zoom a frame), keeping the picture until the live slide has drawn its first frame. Leaving (Esc, the fly back) must stay smooth too.

Prove it with the captured-frames approach of `src/daemon/deck-flicker-browser.test.ts`: no gap between drawn frames longer than two frame times during the zoom, and no picture swapped back. Then run it in the Mac app on the m1 with the harness in `~/.brain-archive/deck-flicker/harness/` (`sweep.mjs inside-fit`) and compare with the before run.

## Where to start

`src/ui/deck/deck-inside.tsx`, `inside-camera.ts`, `src/ui/canvas/frame-shell.tsx` (pictures and live documents), the glossary's Caused mounting.

## Leave alone

What going into a slide does and its keys. Dragging on the deck page (#299) and Present (#298) are being built in other tasks: pull main often.

## Done when

The test passes, the m1 run shows no stall, `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check` pass, a changeset is in, it is merged to main with CI green (no release), and task 557 has a message with what the cause was and the before and after numbers. Put a time limit on every command that could wait for input (ssh to the m1, screen recording). Close the task yourself when done.
