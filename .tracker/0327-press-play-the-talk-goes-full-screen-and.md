# #327 · Press play, the talk goes full screen, and the keys do nothing until the window is clicked

- State: closed (completed)
- Labels: bug, ready-for-agent
- Model: anthropic/claude-opus-5-5:high
- Created: 2026-11-13T06:06:15.807Z
- Updated: 2026-11-13T07:36:26.505Z
- Closed: 2026-11-13T07:36:25.692Z

## What Liam saw

On Spool Beta on his Mac (0.56.1-beta, around beta.40 to .43, 2026-11-13): "when you press play and it goes fullscreen it doesnt focus the window so i have to click once on the window, otherwise keys or space doesnt navigate". He will show talks to clients: the first key after Present must always step.

## What is known

- "Play" is one of: the play button on a selected slide's label, the play button on the deck's row in Pages, the Present button in the top right corner, or the keys (⌘↵, ⇧⌘↵). He pressed a button with the mouse. Find which of them lose the keys; test all of them, on one display (slides fill this screen) and two (presenter view here, the room on the other), in the Mac app and in a browser tab.
- Keys while presenting: `src/ui/deck/present-slides.tsx` (a capture `keydown` on the window; it focuses its ground, or the stage host when the slide takes keys), `src/ui/deck/presenter.tsx`, `src/ui/deck/present-controls.tsx`, and inside the stage `src/runtime/deck/stage.tsx` and `stage-host.ts` (`focus()`), `room-host.ts`. The Mac app's side: `desktop/src/main.ts`, `desktop/src/room.ts`, the native module from #309 that takes the screen, `desktop/src/window-manager.ts`.
- Much changed here in the last day: the Present flight now shows a picture and hands over at landing (#319, `2527486a`), the stage keeps slides ready out of sight and the room runs in a process of its own (#320, task 646, several merges up to `a99c9756`), the pointer and the room's menu (merge 635). It may be a regression from one of them or older: find the commit, since that says what the fix must not undo. 0.56.0 (tag `v0.56.0`) is the last release, to compare.
- Possible places, none checked: the Mac window is not the key window after it takes the screen; focus sits in the stage's frame (another origin) before that frame listens; focus is on a button that the flight removes; the handover at landing moves focus after the ground took it.

## How to reproduce it honestly

Keys sent through the browser's debugging protocol reach the page whether or not the window or the frame has focus, so they cannot show this bug. Send real key events from the operating system on the m1 (the m1 skill; `ssh m1`, always with `timeout` and `-o ConnectTimeout=8`; the gui wrapper `~/.agent-hub/m1/gui`; take the screen with `~/.agent-hub/m1/slot` as other builders do, and use a lane and port of your own), after a real mouse click on the button, and read which slide is shown. In a browser test, check `document.hasFocus()` and `document.activeElement` in each document after Present, and press keys only through the page's own keyboard after a real click.

## Done when

- After Present by every way above, on one display and two, in the Mac app and a browser: the first →, Space, ←, and Esc act, with no click, at once and also when pressed during the flight and right at landing. A slide that takes keys itself (live slides) still gets them as today.
- After Esc, focus is back where it was on the canvas (as today).
- A test that failed before, at the cheapest level that shows it (a browser test for focus after Present; the Mac window's part proven on the m1 with a recording or log of real keys, saved in `~/.brain-archive/present-focus/`).
- `pnpm test:changed`, `pnpm typecheck`, `pnpm check`; the full suite in CI as `AGENTS.md` says, never on devobee; a changeset (a patch); merged to main with CI green as a fast-forward of the latest main (pull main right before: task 646 is still merging into the stage); not released (nothing is being released; main reaches Spool Beta by itself).
- A message to task 557 with the cause in two lines, the commit that introduced it, and what was tested; and before any choice this ticket does not settle. Put a time limit on every command that could wait for input. Close the task yourself when done.

## Comments

### agent, 2026-11-13T07:36:25.692Z

Merged to main (9d4f5b85), judged in task 557. Logs in ~/.brain-archive/present-focus/.

### agent, 2026-11-13T07:36:26.505Z

Merged to main as 9d4f5b85 (task 664). Cause: setSimpleFullScreen on macOS takes the keys from the page (2ba4e7cc, v0.56.0). Real-key logs in ~/.brain-archive/present-focus/.
