# #306 · Deck full screen in the Mac app: nothing of macOS over the slides, no dead quarter second at the press, and the room never opens black

- State: closed
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-12T01:09:30.809Z
- Updated: 2026-11-12T03:02:03.763Z
- Closed: 2026-11-12T03:02:03.763Z

## Where this comes from

#298 (merged, main `e0c62fa8`) made Present fill the screen at once on one display (experiment `deck`). Judging its recordings from the m1 (`~/dev/scratch/present-611/runs/full/screen.mov` on the m1) found three things that fall short of Liam's bar for decks: "as good as if apple would've made them almost", no glitches.

## 1. The Dock shows over the slides

In every full-screen frame of that recording the macOS Dock is drawn over the bottom of the slide (the pointer was resting on the Dock; the Dock is not set to hide on this Mac). The Mac app goes full screen with `setSimpleFullScreen` (`desktop/src/main.ts`, around line 200), which only makes the Dock and the menu bar hide themselves, so they come back when the pointer reaches the bottom or the top edge. The bar the talk shows sits 64 px above the foot, so a presenter's pointer goes there all the time.

**Wanted:** while a talk fills the screen, the Dock and the menu bar never appear over it, wherever the pointer is, as in Keynote. ⌘Tab and Mission Control must keep working (so not a kiosk mode that disables switching), and leaving the talk puts everything back. Prove it on the m1 with the real pointer moved to the bottom edge, the top edge and the middle, with a screenshot of each. The black strip beside the notch at the top is fine.

## 2. A dead quarter second at the press

The slide waits on its card for about 200 ms after the press, because macOS draws no frames while `setSimpleFullScreen` resizes the window (measured in #298: press to first frame of the flight 211 to 286 ms, of which 180 to 200 ms is the resize).

**Wanted:** the flight starts within about 100 ms of the press (measured as #298 did: on the page's clock and in the recording, a slide with beats, cold and readied). An approach to try first: do not use simple full screen at all; set the window's bounds to the display without animation and raise its level above the Dock and the menu bar, which may solve 1 and 2 together. Coming home must be as immediate, and the window must return exactly where it was, as now.

## 3. The room's window opens black

In the presenter view (the caret's other way, and always with two displays) the room's window stays black for about 0.7 s while its slide loads. This predates #298.

**Wanted:** the room shows the slide from its first frame: for example by holding the window hidden until the slide has drawn, or by showing the slide's picture until the live slide takes over, with no blink at the handover. Check it on one display and with a second display (the virtual display tool is noted in `~/.brain-archive/release-run/` on devobee).

## Where to start

`desktop/src/main.ts`, `desktop/src/room.ts`, `desktop/src/canvas-preload.ts`, `src/ui/deck/present.ts`, `presenting.tsx`, `present-slides.tsx`, `src/runtime/deck/room-host.ts`. `desktop/README.md` for building the app; the `m1` skill.

## Leave alone

What #298 built otherwise: the flight, the bar, the keys, the caret, the remembered way, browsers. Dragging on the deck page (#299) and going into a slide (#305) are being built in other tasks: pull main often.

## Done when

The three are proven on the m1 in the Mac app built from your branch, with screenshots and the before and after timings; today's deck suites pass; `pnpm test:changed`, the full `pnpm test`, `pnpm typecheck`, `pnpm check`; a changeset; merged to main with CI green (no release). A message to task 557 with what was done and the numbers, and before any choice this ticket does not settle. Put a time limit on every command that could wait for input (ssh to the m1, screen recording). Close the task yourself when done.

## Comments

### agent, 2026-11-12T03:02:03.763Z

Merged to main and judged in task 557.
