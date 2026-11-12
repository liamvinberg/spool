# #301 · Mac app: the play window shows at once, from a warm spare

- State: open
- Labels: ready-for-agent, enhancement
- Parent: #300
- Created: 2026-11-11T21:22:56.735Z
- Updated: 2026-11-11T21:22:56.735Z

## Parent

#300

## What to build

In the Mac app, pressing play puts the player window on screen at once.

Today the main process asks the daemon for the frame's size, makes a hidden window, and shows it only after the page first paints or one second passes. Liam's words: "opens after a sec or so, just feels bad, want a window to open instantly and sure it can load".

Build, in this order:
1. **Timing marks** for a play in the Mac app: press received, window shown, shell painted, frame revealed. Log them per play. Record the numbers before changing anything.
2. **Show first.** No awaited request between the press and the window showing. The window is created and shown at once, dark, at the remembered rect or fitted to the frame's size. The size comes from something already in hand at press time (your choice how; it must not be a request the show waits on, and it must not turn play into a popup in a browser tab).
3. **Warm spare.** While a canvas is open, keep one hidden play window ready on the same origin with the same preferences, already showing the dark page and the bar's strip. A press adopts it: placed, titled, shown, then pointed at the play URL, with no flash between the strip and the real bar. Make the next spare only after the adopted window has revealed its frame. Show first is the fallback whenever no spare is usable (app just started, daemon restarted or its assets changed, a remote project on another origin).

Rules for the spare:
- One at most. Idle while hidden: no timers, no animation, no open connections.
- It is not a window to the rest of the app: it does not keep the app running when the last real window closes, does not appear in window lists or menus, never takes focus, and is dropped when no canvas is open.
- Everything a play window has today still holds once adopted: remembered rects, the minimum size, the title, reset, recording's reopen.
- **It never holds a handoff or anything minted ahead for a frame.** Authored frame code runs only on the render origin behind a single-use handoff minted for that play, exactly as now.

Scope: the desktop main process and its tests, plus at most one small daemon route if the spare needs a page to sit on. Leave the shell runtime's boot code alone; the next tickets change it.

## Acceptance criteria

- [ ] A play in the Mac app logs the four marks.
- [ ] With a spare ready, the window is on screen with its bar strip within about 100 ms of the press, measured on the m1. If that is missed, the handoff says by how much and why.
- [ ] With no spare, the window still shows at once, dark, and loads.
- [ ] Remembered rects, fit, title, close and recording's reopen behave as before.
- [ ] Quitting, closing the last window, and window menus behave as if the spare did not exist.
- [ ] The spare's measured memory and its idle CPU are in the handoff, with the before and after timings.
- [ ] The spare's decisions (adopt, refill, discard, fall back) are covered as plain functions beside the play-window tests.
- [ ] A changeset for the Mac app's behaviour, per docs/releases.md.

## Second review

Beside the standard review, ask an Opus reviewer (`model: anthropic/claude-opus-5-5:high`) to check one risk: that the spare window cannot weaken the control/render origin split or the single-use handoff (nothing minted early, nothing reusable, no control token reachable from frame code).
